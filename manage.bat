@echo off
:: =============================================================================
::  VeriSage Pro - Management Script (NSSM edition)
::  Runs and manages the middleware as a native Windows Service via NSSM.
::  No PM2, no internet required.
::
::  REQUIREMENT:
::    Place nssm.exe (64-bit, from https://nssm.cc/download -> win64\nssm.exe)
::    next to this script, or in C:\VeriSagePro. The script finds it automatically.
::
::  Run as Administrator (service control needs elevation).
:: =============================================================================
setlocal enabledelayedexpansion
title VeriSage Pro - Management

set "SCRIPT_DIR=%~dp0"
set "INSTALL_DIR=C:\VeriSagePro"
set "BACKEND_DIR=%INSTALL_DIR%\backend"
set "LOGS_DIR=%BACKEND_DIR%\logs"
set "SERVICE_NAME=VeriSagePro"

:: ── Must run as Administrator ────────────────────────────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] This script must be run as Administrator.
    echo          Right-click manage.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

:: ── Locate nssm.exe and node.exe once at startup ─────────────────────────────
call :FIND_NSSM
call :FIND_NODE

:MENU
cls
echo.
echo  ============================================================
echo   VeriSage Pro  ^|  Management Console  (NSSM / Windows Service)
echo  ============================================================
echo.
if not defined NSSM_EXE (
    echo   [!] nssm.exe NOT found. Put it next to this script or in %INSTALL_DIR%.
    echo.
)
echo   [1]  Check status         (is the service running?)
echo   [2]  View live logs       (stream logs to screen)
echo   [3]  Restart service
echo   [4]  Stop service
echo   [5]  Start service
echo   [6]  View last 50 log lines
echo   [7]  Open .env for editing
echo   [8]  Run database migration again
echo   [9]  Check health endpoint
echo.
echo   [I]  Install / configure the service   (first-time setup)
echo   [U]  Uninstall the service
echo   [0]  Exit
echo.
set /p "CHOICE=  Choose an option: "

if /i "!CHOICE!"=="1" goto :STATUS
if /i "!CHOICE!"=="2" goto :LOGS
if /i "!CHOICE!"=="3" goto :RESTART
if /i "!CHOICE!"=="4" goto :STOP
if /i "!CHOICE!"=="5" goto :START
if /i "!CHOICE!"=="6" goto :TAIL
if /i "!CHOICE!"=="7" goto :EDITENV
if /i "!CHOICE!"=="8" goto :MIGRATE
if /i "!CHOICE!"=="9" goto :HEALTH
if /i "!CHOICE!"=="I" goto :INSTALL
if /i "!CHOICE!"=="U" goto :UNINSTALL
if "!CHOICE!"=="0" exit /b 0
goto :MENU

:: =============================================================================
:STATUS
echo.
if not defined NSSM_EXE goto :NO_NSSM
sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
    echo  [INFO] Service "%SERVICE_NAME%" is not installed yet.
    echo         Choose [I] to install it.
) else (
    echo  Service state:
    "!NSSM_EXE!" status "%SERVICE_NAME%"
    echo.
    sc query "%SERVICE_NAME%" | findstr /i "STATE"
)
echo.
pause
goto :MENU

:: =============================================================================
:LOGS
echo.
echo  Press Ctrl+C to stop streaming and return to the menu.
echo.
call :PICK_LOG
if not exist "!LIVE_LOG!" (
    echo  [WARN] No log file found yet under %LOGS_DIR%.
    echo         Start the service first, then check again.
    echo.
    pause
    goto :MENU
)
powershell -NoProfile -Command "Get-Content -LiteralPath '!LIVE_LOG!' -Tail 30 -Wait"
goto :MENU

:: =============================================================================
:RESTART
echo.
if not defined NSSM_EXE goto :NO_NSSM
call :REQUIRE_SERVICE || goto :MENU
echo  Restarting VeriSage Pro...
"!NSSM_EXE!" restart "%SERVICE_NAME%"
echo.
timeout /t 3 /nobreak >nul
"!NSSM_EXE!" status "%SERVICE_NAME%"
echo.
pause
goto :MENU

:: =============================================================================
:STOP
echo.
if not defined NSSM_EXE goto :NO_NSSM
call :REQUIRE_SERVICE || goto :MENU
echo  Stopping VeriSage Pro...
"!NSSM_EXE!" stop "%SERVICE_NAME%"
echo.
pause
goto :MENU

:: =============================================================================
:START
echo.
if not defined NSSM_EXE goto :NO_NSSM
call :REQUIRE_SERVICE || goto :MENU
echo  Starting VeriSage Pro...
"!NSSM_EXE!" start "%SERVICE_NAME%"
echo.
timeout /t 3 /nobreak >nul
"!NSSM_EXE!" status "%SERVICE_NAME%"
echo.
pause
goto :MENU

:: =============================================================================
:TAIL
echo.
call :PICK_LOG
if not exist "!LIVE_LOG!" (
    echo  [WARN] No log file found yet under %LOGS_DIR%.
    echo.
    pause
    goto :MENU
)
echo  --- Last 50 lines of: !LIVE_LOG! ---
echo.
powershell -NoProfile -Command "Get-Content -LiteralPath '!LIVE_LOG!' -Tail 50"
echo.
pause
goto :MENU

:: =============================================================================
:EDITENV
echo.
echo  Opening .env in Notepad...
echo  Save and close Notepad, then restart the service for changes to take effect.
echo.
notepad "%BACKEND_DIR%\.env"
echo.
set /p "DORESTART=  Restart service now to apply changes? (y/n): "
if /i "!DORESTART!"=="y" (
    if defined NSSM_EXE (
        "!NSSM_EXE!" restart "%SERVICE_NAME%"
        echo  Restarted.
    )
)
echo.
pause
goto :MENU

:: =============================================================================
:MIGRATE
echo.
if not defined NODE_EXE (
    echo  [ERROR] Could not find node.exe. Is Node.js installed?
    pause
    goto :MENU
)
echo  Running database migration...
cd /d "%BACKEND_DIR%"
"!NODE_EXE!" src\config\migrate.js
echo.
pause
goto :MENU

:: =============================================================================
:HEALTH
echo.
set "PORT=4000"
if exist "%BACKEND_DIR%\.env" (
    for /f "usebackq tokens=2 delims==" %%p in (`findstr /b /i "PORT=" "%BACKEND_DIR%\.env"`) do set "PORT=%%p"
)
echo  Checking http://localhost:!PORT!/health ...
echo.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri ('http://localhost:!PORT!/health') -TimeoutSec 5; Write-Host ('HTTP ' + $r.StatusCode); Write-Host $r.Content } catch { Write-Host ('[ERROR] ' + $_.Exception.Message) }"
echo.
echo.
pause
goto :MENU

:: =============================================================================
:INSTALL
echo.
echo  Installing / configuring the VeriSagePro Windows service...
echo.
if not defined NSSM_EXE goto :NO_NSSM
if not defined NODE_EXE (
    echo  [ERROR] Could not find node.exe. Install Node.js first.
    pause
    goto :MENU
)
if not exist "%BACKEND_DIR%\src\index.js" (
    echo  [ERROR] Cannot find "%BACKEND_DIR%\src\index.js".
    echo          Is the middleware installed at %INSTALL_DIR% ?
    pause
    goto :MENU
)
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"

echo  Using node : !NODE_EXE!
echo  Using nssm : !NSSM_EXE!
echo  App dir    : %BACKEND_DIR%
echo.

sc query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo  [INFO] Service already exists - reapplying configuration...
) else (
    echo  [INFO] Creating service...
    "!NSSM_EXE!" install "%SERVICE_NAME%" "!NODE_EXE!"
    if errorlevel 1 (
        echo  [ERROR] Failed to create the service.
        pause
        goto :MENU
    )
)

"!NSSM_EXE!" set "%SERVICE_NAME%" AppParameters "src\index.js"
"!NSSM_EXE!" set "%SERVICE_NAME%" AppDirectory "%BACKEND_DIR%"
"!NSSM_EXE!" set "%SERVICE_NAME%" DisplayName "VeriSage Pro Middleware"
"!NSSM_EXE!" set "%SERVICE_NAME%" Description "VeriSage Pro backend (Node.js / Express) registrar middleware"
"!NSSM_EXE!" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
"!NSSM_EXE!" set "%SERVICE_NAME%" AppStdout "%LOGS_DIR%\service-out.log"
"!NSSM_EXE!" set "%SERVICE_NAME%" AppStderr "%LOGS_DIR%\service-error.log"
"!NSSM_EXE!" set "%SERVICE_NAME%" AppRotateFiles 1
"!NSSM_EXE!" set "%SERVICE_NAME%" AppRotateOnline 1
"!NSSM_EXE!" set "%SERVICE_NAME%" AppRotateBytes 10485760
"!NSSM_EXE!" set "%SERVICE_NAME%" AppStopMethodConsole 1500

echo.
echo  [OK] Service configured and set to start automatically on boot.
echo.
set /p "DOSTART=  Start the service now? (y/n): "
if /i "!DOSTART!"=="y" (
    "!NSSM_EXE!" start "%SERVICE_NAME%"
    timeout /t 3 /nobreak >nul
    echo.
    "!NSSM_EXE!" status "%SERVICE_NAME%"
)
echo.
pause
goto :MENU

:: =============================================================================
:UNINSTALL
echo.
if not defined NSSM_EXE goto :NO_NSSM
sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
    echo  [INFO] Service "%SERVICE_NAME%" is not installed.
    pause
    goto :MENU
)
echo  This will STOP and REMOVE the "%SERVICE_NAME%" service.
echo  (The application files in %INSTALL_DIR% are NOT deleted.)
echo.
set /p "CONFIRM=  Are you sure? (y/n): "
if /i not "!CONFIRM!"=="y" goto :MENU
"!NSSM_EXE!" stop "%SERVICE_NAME%"
"!NSSM_EXE!" remove "%SERVICE_NAME%" confirm
echo.
echo  [OK] Service removed.
echo.
pause
goto :MENU

:: =============================================================================
:NO_NSSM
echo.
echo  [ERROR] nssm.exe was not found.
echo          Place nssm.exe next to this script:
echo            %SCRIPT_DIR%
echo          or in %INSTALL_DIR%, then try again.
echo.
echo          Download it on a PC with internet from https://nssm.cc/download
echo          and copy the 64-bit win64\nssm.exe onto the server via USB.
echo.
pause
goto :MENU

:: =============================================================================
:: Subroutines
:: =============================================================================
:FIND_NSSM
set "NSSM_EXE="
if exist "%SCRIPT_DIR%nssm.exe" set "NSSM_EXE=%SCRIPT_DIR%nssm.exe"
if not defined NSSM_EXE if exist "%INSTALL_DIR%\nssm.exe" set "NSSM_EXE=%INSTALL_DIR%\nssm.exe"
if not defined NSSM_EXE if exist "%BACKEND_DIR%\nssm.exe" set "NSSM_EXE=%BACKEND_DIR%\nssm.exe"
if not defined NSSM_EXE for /f "delims=" %%I in ('where nssm 2^>nul') do if not defined NSSM_EXE set "NSSM_EXE=%%I"
exit /b 0

:FIND_NODE
set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
exit /b 0

:PICK_LOG
:: Prefer the app's own winston combined log, fall back to NSSM stdout capture
set "LIVE_LOG=%LOGS_DIR%\combined.log"
if not exist "!LIVE_LOG!" set "LIVE_LOG=%LOGS_DIR%\service-out.log"
exit /b 0

:REQUIRE_SERVICE
sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
    echo  [WARN] Service "%SERVICE_NAME%" is not installed yet.
    echo         Choose [I] to install it first.
    echo.
    pause
    exit /b 1
)
exit /b 0
