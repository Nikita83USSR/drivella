#define MyAppName "DRIVELLA"
#ifndef AppVersion
  #define AppVersion "0.1.0-preview"
#endif

[Setup]
AppId={{BB81CBDE-45BE-44AF-9D8F-2B63076B6F56}
AppName={#MyAppName}
AppVersion={#AppVersion}
AppPublisher=Nikita Markin
DefaultDirName={localappdata}\Programs\DRIVELLA
DefaultGroupName=DRIVELLA
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
OutputDir=..\out\installer
OutputBaseFilename=DRIVELLA-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\DRIVELLA.exe
CloseApplications=yes
RestartApplications=no

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; GroupDescription: "Дополнительные ярлыки:"; Flags: unchecked

[Files]
Source: "..\out\launcher\DRIVELLA.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\out\game\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\DRIVELLA"; Filename: "{app}\DRIVELLA.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\DRIVELLA"; Filename: "{app}\DRIVELLA.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\DRIVELLA.exe"; Description: "Запустить DRIVELLA"; Flags: postinstall nowait skipifsilent
