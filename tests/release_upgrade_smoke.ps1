[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$NewInstaller,
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [string[]]$SourceVersions = @('1.3.20', '1.3.21')
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') { throw 'Installer upgrade checks require Windows.' }
$NewInstaller = (Resolve-Path -LiteralPath $NewInstaller).Path
$Root = [System.IO.Path]::GetFullPath($Root)
if (Test-Path -LiteralPath $Root) {
    throw "Upgrade test root already exists; refusing to overwrite it: $Root"
}
$newVersion = [System.IO.Path]::GetFileNameWithoutExtension($NewInstaller) -replace '^Subcast_Setup_v', ''
if ($newVersion -notmatch '^\d+\.\d+\.\d+$') { throw "Unexpected installer filename: $NewInstaller" }
foreach ($sourceVersion in $SourceVersions) {
    if ($sourceVersion -notmatch '^\d+\.\d+\.\d+$' -or [version]$sourceVersion -ge [version]$newVersion) {
        throw "Invalid previous version '$sourceVersion' for target $newVersion."
    }
}

function Invoke-Installer([string]$Path, [string[]]$Arguments, [string]$Description) {
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -PassThru -WindowStyle Hidden
    if (-not $process.WaitForExit(120000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw "$Description timed out after 120 seconds."
    }
    $process.Refresh()
    if ($process.ExitCode -ne 0) { throw "$Description failed with exit code $($process.ExitCode)." }
}

function Stop-InstalledSubcast([string]$InstallDir) {
    $exePath = [System.IO.Path]::GetFullPath((Join-Path $InstallDir 'subcast.exe'))
    Get-CimInstance Win32_Process -Filter "Name='subcast.exe'" |
        Where-Object { $_.ExecutablePath -eq $exePath } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Get-FreePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return $listener.LocalEndpoint.Port }
    finally { $listener.Stop() }
}

function Wait-UpdatedProject([int]$Port, [string]$ExpectedVersion) {
    $url = "http://127.0.0.1:$Port"
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $version = Invoke-RestMethod "$url/api/system/version" -TimeoutSec 2
            if ($version.version -eq $ExpectedVersion) {
                $projects = @(Invoke-RestMethod "$url/api/projects" -TimeoutSec 2)
                if (@($projects | Where-Object { $_.id -eq 'proj_upgrade' }).Count -gt 0) { return }
            }
        } catch { }
        Start-Sleep -Seconds 1
    }
    throw "Updated v$ExpectedVersion app did not start with proj_upgrade on port $Port."
}

$previousAppData = $env:APPDATA
$previousDataDir = $env:SUBCAST_DATA_DIR
$fixtureScript = Join-Path $PSScriptRoot 'release_upgrade_fixture.py'
New-Item -ItemType Directory -Force -Path $Root | Out-Null
$downloadDir = Join-Path $Root 'previous-installers'
New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
try {
    foreach ($sourceVersion in $SourceVersions) {
        $oldName = "Subcast_Setup_v$sourceVersion.exe"
        & gh release download "v$sourceVersion" --pattern "$oldName*" --dir $downloadDir
        if ($LASTEXITCODE -ne 0) { throw "Could not download the v$sourceVersion installer and checksum." }
        $oldInstaller = Join-Path $downloadDir $oldName
        $checksumFile = "$oldInstaller.sha256"
        if (-not (Test-Path -LiteralPath $oldInstaller) -or -not (Test-Path -LiteralPath $checksumFile)) {
            throw "The v$sourceVersion release is missing its installer or SHA-256 file."
        }
        $expectedHash = (Get-Content -LiteralPath $checksumFile -Raw).Trim().ToLowerInvariant()
        $actualHash = (Get-FileHash -LiteralPath $oldInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($expectedHash -notmatch '^[0-9a-f]{64}$' -or $expectedHash -ne $actualHash) {
            throw "The v$sourceVersion installer checksum does not match."
        }
    }

    foreach ($sourceVersion in $SourceVersions) {
        $scenarioRoot = Join-Path $Root "from-v$sourceVersion"
        New-Item -ItemType Directory -Path $scenarioRoot | Out-Null
        $profile = Join-Path $scenarioRoot 'profile\Roaming'
        New-Item -ItemType Directory -Force -Path $profile | Out-Null
        $dataDir = Join-Path $profile 'Subcast'
        $installDir = Join-Path $scenarioRoot 'installed'
        $oldName = "Subcast_Setup_v$sourceVersion.exe"
        $oldInstaller = Join-Path $downloadDir $oldName

        $env:APPDATA = $profile
        $env:SUBCAST_DATA_DIR = $dataDir
        try {
            Invoke-Installer $oldInstaller @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=$installDir", "/LOG=$(Join-Path $scenarioRoot 'old-install.log')") "v$sourceVersion installation"
            $installedVersionFile = Join-Path $installDir 'version.txt'
            if (-not (Test-Path -LiteralPath $installedVersionFile) -or (Get-Content $installedVersionFile -Raw).Trim() -ne $sourceVersion) {
                throw "The installed app does not identify itself as v$sourceVersion."
            }

            $port = Get-FreePort
            $stateFile = Join-Path $scenarioRoot 'fixture-state.json'
            & python $fixtureScript seed $dataDir $stateFile --port $port
            if ($LASTEXITCODE -ne 0) { throw "Could not seed the v$sourceVersion upgrade fixture." }

            Invoke-Installer $NewInstaller @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SUBCASTUPDATE=1', '/SUBCASTORIGINALUSER=1', "/DIR=$installDir", "/LOG=$(Join-Path $scenarioRoot 'upgrade-install.log')") "Upgrade from v$sourceVersion to v$newVersion"
            $installedVersion = (Get-Content -LiteralPath $installedVersionFile -Raw).Trim()
            if ($installedVersion -ne $newVersion) { throw "Installer left v$installedVersion in place; expected v$newVersion." }
            Wait-UpdatedProject $port $newVersion

            Stop-InstalledSubcast $installDir
            & python $fixtureScript verify $dataDir $stateFile
            if ($LASTEXITCODE -ne 0) { throw "User data changed while upgrading from v$sourceVersion." }
        }
        finally {
            Stop-InstalledSubcast $installDir
            $uninstaller = Join-Path $installDir 'unins000.exe'
            if (Test-Path -LiteralPath $uninstaller) {
                Invoke-Installer $uninstaller @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$(Join-Path $scenarioRoot 'cleanup.log')") "Cleanup after v$sourceVersion upgrade"
            }
        }

        Write-Host "PASS: v$sourceVersion -> v$newVersion preserved projects, templates, fonts, media, config and database data."
    }
}
finally {
    if ($null -eq $previousAppData) { Remove-Item Env:APPDATA -ErrorAction SilentlyContinue }
    else { $env:APPDATA = $previousAppData }
    if ($null -eq $previousDataDir) { Remove-Item Env:SUBCAST_DATA_DIR -ErrorAction SilentlyContinue }
    else { $env:SUBCAST_DATA_DIR = $previousDataDir }
}
