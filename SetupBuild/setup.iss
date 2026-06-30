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
DisableDirPage=yes
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

[Files]
; Include all files from the compiled dist directory
Source: "dist\SEED-SEB\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
; Hide the installation folder (System + Hidden attribute)
Filename: "attrib"; Parameters: "+h +s ""{app}"""; Flags: runhidden

; Grant Everyone full control recursively on resources and data subfolders so standard user runs can read/write data
Filename: "icacls"; Parameters: """{app}\resources"" /grant *S-1-1-0:(OI)(CI)F"; Flags: runhidden
Filename: "icacls"; Parameters: """{app}\data"" /grant *S-1-1-0:(OI)(CI)F"; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  PercentLabel: TNewStaticText;

function GetUninstallString(): String;
var
  sUnInstPath: String;
  sUnInstallString: String;
begin
  sUnInstPath := ExpandConstant('Software\Microsoft\Windows\CurrentVersion\Uninstall\{#emit SetupSetting("AppId")}_is1');
  sUnInstallString := '';
  if not RegQueryStringValue(HKLM, sUnInstPath, 'UninstallString', sUnInstallString) then
    RegQueryStringValue(HKCU, sUnInstPath, 'UninstallString', sUnInstallString);
  Result := sUnInstallString;
end;

function UnInstallOldVersion(): Integer;
var
  sUnInstallString: String;
  iResultCode: Integer;
begin
  Result := 0; 
  sUnInstallString := GetUninstallString();
  if sUnInstallString <> '' then begin
    sUnInstallString := RemoveQuotes(sUnInstallString);
    if Exec(sUnInstallString, '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_HIDE, ewWaitUntilTerminated, iResultCode) then
      Result := 3
    else
      Result := 2;
  end else
    Result := 1;
end;

procedure InitializeWizard();
begin
  // First, uninstall any previous version of SEED silently
  UnInstallOldVersion();

  // Hide the default filename label so users don't see which individual files are being extracted
  WizardForm.FilenameLabel.Visible := False;

  // Create a label to show the percentage
  PercentLabel := TNewStaticText.Create(WizardForm);
  PercentLabel.Parent := WizardForm.ProgressGauge.Parent;
  PercentLabel.Left := WizardForm.ProgressGauge.Left + WizardForm.ProgressGauge.Width - ScaleX(35);
  PercentLabel.Top := WizardForm.ProgressGauge.Top + WizardForm.ProgressGauge.Height + ScaleY(8);
  PercentLabel.Width := ScaleX(40);
  PercentLabel.Caption := '0%';
end;

procedure CurInstallProgressChanged(CurProgress, MaxProgress: Integer);
begin
  if MaxProgress > 0 then
  begin
    PercentLabel.Caption := IntToStr((CurProgress * 100) div MaxProgress) + '%';
  end;
end;
