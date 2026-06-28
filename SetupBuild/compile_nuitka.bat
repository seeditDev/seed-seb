@echo off
echo ===================================================
echo SEED-SEB Native C++ Compilation using Nuitka
echo ===================================================
echo.

:: Clean old build outputs
if exist dist rmdir /s /q dist
if exist SEED-SEB.build rmdir /s /q SEED-SEB.build
if exist SEED-SEB.dist rmdir /s /q SEED-SEB.dist

echo Starting compilation (this might take several minutes)...
python -m nuitka --standalone --windows-console-disabled --windows-uac-admin --enable-plugin=pyqt6 --windows-icon-from-ico=app_source\SEED_Logo.ico --output-dir=dist --output-filename=SEED-SEB app_source\SEED-IT.py

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Nuitka compilation failed.
    exit /b 1
)

:: Nuitka outputs the executable SEED-SEB.exe inside dist\SEED-IT.dist folder.
:: Rename dist\SEED-IT.dist to dist\SEED-SEB to match the new application name.
if exist dist\SEED-IT.dist (
    echo Renaming output directory to dist\SEED-SEB...
    rename dist\SEED-IT.dist SEED-SEB
)

echo.
echo Native compilation completed successfully!
echo Binary distribution is ready at dist\SEED-SEB\
exit /b 0
