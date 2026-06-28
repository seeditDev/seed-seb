#define MyAppName "SEED-SEB"
#define MyAppVersion "1.0.4"
#define MyAppPublisher "SEED-IT Institute of Training"
#define MyAppURL "https://seedit.site"
#define MyAppExeName "SEED-SEB.exe"

[Setup]
; NOTE: The value of AppId uniquely identifies this application.
; Do not use the same AppId value in installers for other applications.
AppId={{9E1A2B3C-4D5E-6F7A-8B9C-0A1B2C3D4E5F}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={commonpf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=LICENSE.txt
; Set the installer to require administrator privileges to run icacls
PrivilegesRequired=admin
OutputDir=.
OutputBaseFilename=SEED-SEB-Setup
SetupIconFile=SEED_Logo.ico
Compression=lzma
SolidCompression=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
WizardStyle=modern
DisableFinishedPage=no
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Include all files from the compiled dist directory
Source: "dist\SEED-SEB\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Hide the installation folder (System + Hidden attribute)
Filename: "attrib"; Parameters: "+h +s ""{app}"""; Flags: runhidden

; 1. Disable inheritance and copy active permissions to start custom hardening
Filename: "icacls"; Parameters: """{app}"" /inheritance:d"; Flags: runhidden

; 2. Explicitly remove any existing Users or Authenticated Users inheritance
Filename: "icacls"; Parameters: """{app}"" /remove *S-1-5-32-545"; Flags: runhidden
Filename: "icacls"; Parameters: """{app}"" /remove *S-1-5-11"; Flags: runhidden

; 3. Grant Administrators and SYSTEM full control (recursively inherited)
Filename: "icacls"; Parameters: """{app}"" /grant *S-1-5-32-544:(OI)(CI)F"; Flags: runhidden
Filename: "icacls"; Parameters: """{app}"" /grant *S-1-5-18:(OI)(CI)F"; Flags: runhidden

; 4. Grant standard Users ONLY inherit-only Read/Execute permission on subfolders and files inside
Filename: "icacls"; Parameters: """{app}"" /grant *S-1-5-32-545:(OI)(CI)(IO)RX"; Flags: runhidden

; 5. Grant Users ONLY Execute, Read Control, and Synchronize (NO Read Data / List Directory) on the parent app folder itself
Filename: "icacls"; Parameters: """{app}"" /grant *S-1-5-32-545:(Rc,S,X)"; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
