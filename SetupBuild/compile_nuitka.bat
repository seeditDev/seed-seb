@echo off
echo ===================================================
echo SEED-SEB Native C++ Compilation using Nuitka
echo ===================================================
echo.

:: Clean old build outputs
if exist dist rmdir /s /q dist
if exist main.build rmdir /s /q main.build
if exist main.dist rmdir /s /q main.dist
if exist SEED-SEB.build rmdir /s /q SEED-SEB.build
if exist SEED-SEB.dist rmdir /s /q SEED-SEB.dist

echo Starting compilation of main.py (this might take several minutes)...
python -m nuitka --standalone --disable-console --windows-uac-admin --enable-plugin=pyqt6 --windows-icon-from-ico=app_source\SEED_Logo.ico --output-dir=dist --output-filename=SEED-SEB app_source\main.py

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Nuitka compilation failed.
    exit /b 1
)

:: Nuitka outputs the executable SEED-SEB.exe inside dist\main.dist folder.
:: Rename dist\main.dist to dist\SEED-SEB to match the application name.
if exist dist\main.dist (
    echo Renaming output directory to dist\SEED-SEB...
    rename dist\main.dist SEED-SEB
)

:: Copy required folder resources into dist\SEED-SEB\ relative to the executable
echo Copying frontend build folder to standalone distribution...
if exist "..\frontend\build" (
    xcopy /E /I /Y "..\frontend\build" "dist\SEED-SEB\frontend\build"
) else (
    echo WARNING: ..\frontend\build not found!
)

echo Copying data folder to standalone distribution...
if exist "..\data" (
    xcopy /E /I /Y "..\data" "dist\SEED-SEB\data"
) else (
    echo WARNING: ..\data not found!
)

echo Copying resources folder to standalone distribution...
if exist "..\resources" (
    xcopy /E /I /Y "..\resources" "dist\SEED-SEB\resources"
) else (
    echo WARNING: ..\resources not found!
)

echo.
echo Native compilation and resource staging completed successfully!
echo Binary distribution is ready at dist\SEED-SEB\
exit /b 0
