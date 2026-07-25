[Setup]
AppName=Subcast
AppVersion=1.2.7
DefaultDirName={localappdata}\Subcast
DefaultGroupName=Subcast
OutputDir=build
OutputBaseFilename=Subcast_Setup_v1.2.7
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest

[Files]
Source: "dist\subcast\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Subcast"; Filename: "{app}\subcast.exe"
Name: "{autodesktop}\Subcast"; Filename: "{app}\subcast.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop icon"; GroupDescription: "Additional icons:"; Flags: unchecked
