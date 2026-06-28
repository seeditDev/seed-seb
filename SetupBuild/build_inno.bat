@echo off
echo ===================================================
echo Building SEED-SEB Installer using Inno Setup
echo ===================================================
echo.

:: Check for Inno Setup compiler in standard locations
set "COMPILER_PATH1=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
set "COMPILER_PATH2=C:\Program Files\Inno Setup 6\ISCC.exe"

if exist "%COMPILER_PATH1%" goto run_compiler1
if exist "%COMPILER_PATH2%" goto run_compiler2

echo ERROR: Inno Setup compiler (ISCC.exe) not found.
echo Please ensure Inno Setup is installed correctly.
exit /b 1

:run_compiler1
echo Found Inno Setup 6 (x86).
echo Compiling setup.iss...
"%COMPILER_PATH1%" setup.iss
goto check_result

:run_compiler2
echo Found Inno Setup 6.
echo Compiling setup.iss...
"%COMPILER_PATH2%" setup.iss
goto check_result

:check_result
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Failed to compile installer.
    exit /b 1
) else (
    echo.
    echo Installer successfully built!
    echo SEED-SEB-Setup.exe is ready in the current directory.
    exit /b 0
)
