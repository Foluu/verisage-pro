@echo off
:: =============================================================================
::  VeriSage Pro — Management Script
::  Use this after deployment for day-to-day operations.
::  Run as Administrator.
:: =============================================================================
setlocal enabledelayedexpansion
title VeriSage Pro — Management

set "INSTALL_DIR=C:\VeriSagePro"
set "BACKEND_DIR=!INSTALL_DIR!\backend"

:MENU
cls
echo.
echo  ============================================================
echo   VeriSage Pro  ^|  Management Console
echo  ============================================================
echo.
echo   [1]  Check status         (is the app running?)
echo   [2]  View live logs       (stream logs to screen)
echo   [3]  Restart application
echo   [4]  Stop application
echo   [5]  Start application
echo   [6]  View last 50 log lines
echo   [7]  Open .env for editing
echo   [8]  Run database migration again
echo   [9]  Check health endpoint
echo   [0]  Exit
echo.
set /p "CHOICE=  Choose an option: "

if "!CHOICE!"=="1" goto :STATUS
if "!CHOICE!"=="2" goto :LOGS
if "!CHOICE!"=="3" goto :RESTART
if "!CHOICE!"=="4" goto :STOP
if "!CHOICE!"=="5" goto :START
if "!CHOICE!"=="6" goto :TAIL
if "!CHOICE!"=="7" goto :EDITENV
if "!CHOICE!"=="8" goto :MIGRATE
if "!CHOICE!"=="9" goto :HEALTH
if "!CHOICE!"=="0" exit /b 0
goto :MENU

:STATUS
echo.
pm2 status
echo.
pause
goto :MENU

:LOGS
echo.
echo  Press Ctrl+C to stop streaming logs.
echo.
pm2 logs verisage-pro
goto :MENU

:RESTART
echo.
echo  Restarting VeriSage Pro...
pm2 restart verisage-pro
echo.
timeout /t 3 /nobreak >nul
pm2 status
echo.
pause
goto :MENU

:STOP
echo.
echo  Stopping VeriSage Pro...
pm2 stop verisage-pro
echo.
pause
goto :MENU

:START
echo.
echo  Starting VeriSage Pro...
cd /d "!BACKEND_DIR!"
pm2 start src/index.js --name verisage-pro
echo.
pause
goto :MENU

:TAIL
echo.
pm2 logs verisage-pro --lines 50 --nostream
echo.
pause
goto :MENU

:EDITENV
echo.
echo  Opening .env in Notepad...
echo  Save and close Notepad, then restart the app for changes to take effect.
echo.
notepad "!BACKEND_DIR!\.env"
echo.
set /p "DORESTART=  Restart app now to apply changes? (y/n): "
if /i "!DORESTART!"=="y" (
    pm2 restart verisage-pro
    echo  Restarted.
)
goto :MENU

:MIGRATE
echo.
echo  Running database migration...
cd /d "!BACKEND_DIR!"
node src/config/migrate.js
echo.
pause
goto :MENU

:HEALTH
echo.
for /f "tokens=*" %%p in ('type "!BACKEND_DIR!\.env" ^| findstr /i "^PORT="') do (
    set "PORT_LINE=%%p"
)
set "PORT=!PORT_LINE:PORT=!"
if "!PORT!"=="" set "PORT=4000"
curl -s http://localhost:!PORT!/health
echo.
echo.
pause
goto :MENU
