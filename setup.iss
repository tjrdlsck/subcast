#ifndef MyAppVersion
#define MyAppVersion "1.3.21"
#endif
#define MyAppName "Subcast"
#define MyAppPublisher "Subcast Inc."
#define MyAppURL "https://github.com/tjrdlsck/subcast"
#define MyAppExeName "subcast.exe"

[Setup]
AppId={{D37F8E8A-9A2E-4C45-927A-456B7D8A9C10}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=Subcast_Setup_v{#MyAppVersion}
OutputDir=dist
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\subcast\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent; Check: not IsAutoUpdate
Filename: "{app}\{#MyAppExeName}"; Flags: nowait runasoriginaluser; Check: IsAutoUpdateAndOriginalUser

[Code]
function IsAutoUpdate: Boolean;
begin
  Result := ExpandConstant('{param:SUBCASTUPDATE|0}') = '1';
end;

function IsAutoUpdateAndOriginalUser: Boolean;
begin
  Result := IsAutoUpdate and (ExpandConstant('{param:SUBCASTORIGINALUSER|0}') = '1');
end;
