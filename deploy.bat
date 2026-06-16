@echo off
:: =============================================================================
::  VeriSage Pro — Windows Deployment Script
::  Version : 1.1
::  Run as  : Administrator (right-click → Run as administrator)
::
::  This script does everything in one go:
::    1.  Checks that Node.js and npm are installed
::    2.  Checks that PM2 is installed (installs it if missing)
::    3.  Copies the application files from the USB drive
::    4.  Installs all backend dependencies
::    5.  Walks you through filling in the .env file interactively
::    6.  Runs the database migration (creates tables + admin user)
::    7.  Starts the application under PM2 so it survives reboots
::    8.  Verifies the app is running by hitting the /health endpoint
::
::  Usage:
::    1. Plug in the USB drive
::    2. Open Command Prompt as Administrator
::    3. Navigate to the USB drive:  D:   (or E:, F: — whatever your USB is)
::    4. Run:  deploy.bat
:: =============================================================================

setlocal enabledelayedexpansion
title VeriSage Pro - Deployment

echo.
echo  ============================================================
echo   VeriSage Pro  ^|  Deployment Script  ^|  Windows Server
echo  ============================================================
echo.

:: ── STEP 0: Must be running as Administrator ──────────────────────────────────
net session >nul 2>&1
if not !errorlevel! == 0 (
    echo  [ERROR] This script must be run as Administrator.
    echo          Right-click deploy.bat and choose "Run as administrator".
    pause
    exit /b 1
)
echo  [OK] Running as Administrator.

:: ── STEP 1: Confirm the install directory ─────────────────────────────────────
echo.
echo  Where do you want to install VeriSage Pro?
echo  Press ENTER to use the default:  C:\VeriSagePro
echo  Or type a different path and press ENTER.
echo.
set "INSTALL_DIR=C:\VeriSagePro"
set /p "CUSTOM_DIR=  Install path [C:\VeriSagePro]: "
if not "!CUSTOM_DIR!"=="" set "INSTALL_DIR=!CUSTOM_DIR!"

set "BACKEND_DIR=!INSTALL_DIR!\backend"
set "PUBLIC_DIR=!INSTALL_DIR!\public"
set "LOGS_DIR=!BACKEND_DIR!\logs"

echo.
echo  Install directory : !INSTALL_DIR!
echo  Backend           : !BACKEND_DIR!
echo  Frontend (public) : !PUBLIC_DIR!
echo.

:: ── STEP 2: Check Node.js ─────────────────────────────────────────────────────
echo  [1/8] Checking Node.js...

where node >nul 2>&1
if not !errorlevel! == 0 (
    echo.
    echo  [INFO] Node.js not found. Installing Node.js v18 LTS...
    call :install_node
    if not !errorlevel! == 0 (
        echo  [ERROR] Node.js installation failed. Install it manually from https://nodejs.org
        pause
        exit /b 1
    )
    echo  [INFO] Node.js installed. Please close this window and re-run deploy.bat.
    pause
    exit /b 0
)

:: Node is present — capture version string e.g. "v20.11.0"
for /f "usebackq tokens=*" %%V in (`node --version 2^>nul`) do set "NODE_VER=%%V"
echo  [OK] Node.js found: !NODE_VER!

:: Strip the leading "v" and extract the major version number
set "NODE_MAJOR=!NODE_VER:v=!"
for /f "tokens=1 delims=." %%M in ("!NODE_MAJOR!") do set "NODE_MAJOR=%%M"

:: Guard: if extraction failed, NODE_MAJOR might be empty or non-numeric — skip check
if "!NODE_MAJOR!"=="" (
    echo  [WARN] Could not determine Node.js major version. Continuing anyway.
    goto :node_ok
)

if !NODE_MAJOR! LSS 18 (
    echo.
    echo  [WARN] Node.js !NODE_VER! is below the required v18.
    echo  Please upgrade Node.js from https://nodejs.org and re-run this script.
    pause
    exit /b 1
)

:node_ok
:: ── npm check ─────────────────────────────────────────────────────────────────
for /f "usebackq tokens=*" %%V in (`npm --version 2^>nul`) do set "NPM_VER=%%V"
echo  [OK] npm found: !NPM_VER!

:: ── STEP 3: Install or verify PM2 ────────────────────────────────────────────
echo.
echo  [2/8] Checking PM2 (process manager)...
where pm2 >nul 2>&1
if not !errorlevel! == 0 (
    echo  [INFO] PM2 not found. Installing globally...
    npm install -g pm2
    if not !errorlevel! == 0 (
        echo  [ERROR] Failed to install PM2. Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo  [OK] PM2 installed.
) else (
    for /f "usebackq tokens=*" %%V in (`pm2 --version 2^>nul`) do set "PM2_VER=%%V"
    echo  [OK] PM2 found: !PM2_VER!
)

:: ── STEP 4: Locate deployment source folder ───────────────────────────────────
echo.
echo  [3/8] Locating VeriSage Pro files...
echo.

:: Get folder where deploy.bat is located
set "BASE_DIR=%~dp0"

:: Remove trailing backslash
if "!BASE_DIR:~-1!"=="\" set "BASE_DIR=!BASE_DIR:~0,-1!"

:: Define paths (UPDATED for your structure)
set "APP_ROOT=!BASE_DIR!\VeriSagePro"
set "USB_BACKEND=!APP_ROOT!\backend"
set "USB_FRONTEND=!APP_ROOT!\frontend-build"

echo  Base directory         : !BASE_DIR!
echo  App root               : !APP_ROOT!
echo  Backend source         : !USB_BACKEND!
echo  Frontend build         : !USB_FRONTEND!
echo.

:: Validate backend
if not exist "!USB_BACKEND!\src\index.js" (
    echo  [ERROR] Cannot find backend source files.
    echo          Expected: !USB_BACKEND!\src\index.js
    echo.
    echo          Make sure your structure is:
    echo            deployment\
    echo              deploy.bat
    echo              verisage pro\
    echo                backend\
    echo                  src\
    echo                    index.js
    echo.
    pause
    exit /b 1
)
echo  [OK] Backend source found.

:: Validate frontend
if not exist "!USB_FRONTEND!\index.html" (
    echo  [ERROR] Cannot find frontend build.
    echo          Expected: !USB_FRONTEND!\index.html
    echo.
    echo          Make sure frontend is built before deployment.
    pause
    exit /b 1
)
echo  [OK] Frontend build found.

:: ── STEP 5: Create install directories and copy files ─────────────────────────
echo.
echo  [4/8] Copying files to server...

if not exist "!INSTALL_DIR!" mkdir "!INSTALL_DIR!"
if not exist "!BACKEND_DIR!" mkdir "!BACKEND_DIR!"
if not exist "!PUBLIC_DIR!"  mkdir "!PUBLIC_DIR!"
if not exist "!LOGS_DIR!"    mkdir "!LOGS_DIR!"

echo  Copying backend...
xcopy "!USB_BACKEND!\*" "!BACKEND_DIR!\" /s /e /y /q
if not !errorlevel! == 0 (
    echo  [ERROR] Failed to copy backend files.
    pause
    exit /b 1
)
echo  [OK] Backend copied.

echo  Copying frontend build...
xcopy "!USB_FRONTEND!\*" "!PUBLIC_DIR!\" /s /e /y /q
if not !errorlevel! == 0 (
    echo  [ERROR] Failed to copy frontend build.
    pause
    exit /b 1
)
echo  [OK] Frontend copied.

:: ── STEP 6: Install Node dependencies ────────────────────────────────────────
echo.
echo  [5/8] Installing backend dependencies (this may take 1-2 minutes)...
echo.
cd /d "!BACKEND_DIR!"

:: Debug current working dir
echo DEBUG: Current dir after CD = %CD%

npm install --omit=dev
if not !errorlevel! == 0 (
    echo.
    echo  [ERROR] npm install failed.
    echo          Possible causes:
    echo            - No internet connection on this server
    echo            - npm registry blocked by firewall
    echo          Solution: Run  npm install  manually after fixing connectivity,
    echo          then continue from STEP 6 in the manual guide.
    pause
    exit /b 1
)
echo.
echo  [OK] Dependencies installed.

:: DEBUG BREAKPOINT
echo DEBUG: About to proceed to STEP 6...

:: ── STEP 6: Set up the .env file ─────────────────────────────────────────────
echo.
echo  [6/8] Environment Configuration (.env)
echo  ============================================================

echo.

set "ENV_FILE=!BACKEND_DIR!\.env"

if exist "!ENV_FILE!" (
    echo  [WARN] A .env file already exists at:
    echo         !ENV_FILE!
    echo.
    set /p "OVERWRITE=  Overwrite existing .env? (y/n): "
    if /i "!OVERWRITE!"=="n" (
        echo  [INFO] Keeping existing .env. Skipping configuration step.
        goto :after_env
    )
)

echo  Fill in the values below. Press ENTER to accept the default shown in [brackets].
echo.

:: ── App settings ──────────────────────────────────────────────────────────────
echo  --- Application Settings ---
set "PORT=4000"
set /p "PORT=  Port to run on [4000]: "
if "!PORT!"=="" set "PORT=4000"

set "NODE_ENV=production"
echo  NODE_ENV set to: production

:: ── VeriSage DB ───────────────────────────────────────────────────────────────
echo.
echo  --- VeriSage Pro Database (your own database, separate from SAGE) ---
set "DB_SERVER=localhost"
set /p "DB_SERVER=  SQL Server hostname or IP [localhost]: "
if "!DB_SERVER!"=="" set "DB_SERVER=localhost"

set "DB_DATABASE=VeriSagePro"
set /p "DB_DATABASE=  Database name [VeriSagePro]: "
if "!DB_DATABASE!"=="" set "DB_DATABASE=VeriSagePro"

set "DB_PORT=1433"
set /p "DB_PORT=  SQL Server port [1433]: "
if "!DB_PORT!"=="" set "DB_PORT=1433"

set "DB_USER=sa"
set /p "DB_USER=  SQL login username [sa]: "
if "!DB_USER!"=="" set "DB_USER=sa"

set /p "DB_PASSWORD=  SQL login password: "

:: ── SAGE DB ───────────────────────────────────────────────────────────────────
echo.
echo  --- SAGE 200 Evolution Database ---
set /p "SAGE_DB_SERVER=  SAGE SQL Server hostname or IP: "

set "SAGE_DB_DATABASE=SageEvolution"
set /p "SAGE_DB_DATABASE=  SAGE database name [SageEvolution]: "
if "!SAGE_DB_DATABASE!"=="" set "SAGE_DB_DATABASE=SageEvolution"

set "SAGE_DB_PORT=1433"
set /p "SAGE_DB_PORT=  SAGE SQL Server port [1433]: "
if "!SAGE_DB_PORT!"=="" set "SAGE_DB_PORT=1433"

set "SAGE_DB_USER=sa"
set /p "SAGE_DB_USER=  SAGE SQL login username [sa]: "
if "!SAGE_DB_USER!"=="" set "SAGE_DB_USER=sa"

set /p "SAGE_DB_PASSWORD=  SAGE SQL login password: "

:: ── SAGE reference IDs ────────────────────────────────────────────────────────
echo.
echo  --- SAGE Reference IDs (get these from SSMS queries in the guide) ---
set /p "SAGE_STOCK_CODE_ID=  SAGE Stock Code ID (StockLink for Registrar Services): "
set /p "SAGE_WAREHOUSE_ID=  SAGE Warehouse ID (WhseLink for default warehouse): "
set /p "SAGE_TAX_TYPE_ID=  SAGE Tax Type ID (idTaxRate for 7.5%% VAT): "

:: ── Security secrets ──────────────────────────────────────────────────────────
echo.
echo  --- Security Secrets ---
echo  [INFO] Generating a random JWT secret automatically...

set "JWT_SECRET=vsp_%RANDOM%%RANDOM%%RANDOM%%RANDOM%_%RANDOM%"
echo  [OK] JWT_SECRET generated.

set /p "COCCA_API_KEY=  CoCCA API Key (the key you will give to CoCCA): "

:: ── Frontend URL ──────────────────────────────────────────────────────────────
echo.
set "FRONTEND_URL=http://localhost:!PORT!"
echo  FRONTEND_URL set to: !FRONTEND_URL!

:: ── Write the .env file ───────────────────────────────────────────────────────
(
    echo # VeriSage Pro - Environment Configuration
    echo # Generated by deploy.bat on %DATE% %TIME%
    echo.
    echo # Application
    echo PORT=!PORT!
    echo NODE_ENV=production
    echo FRONTEND_URL=!FRONTEND_URL!
    echo.
    echo # VeriSage Pro Database
    echo DB_DIALECT=mssql
    echo DB_USER=!DB_USER!
    echo DB_PASSWORD=!DB_PASSWORD!
    echo DB_SERVER=!DB_SERVER!
    echo DB_DATABASE=!DB_DATABASE!
    echo DB_PORT=!DB_PORT!
    echo.
    echo # SAGE 200 Evolution Database
    echo SAGE_DB_USER=!SAGE_DB_USER!
    echo SAGE_DB_PASSWORD=!SAGE_DB_PASSWORD!
    echo SAGE_DB_SERVER=!SAGE_DB_SERVER!
    echo SAGE_DB_DATABASE=!SAGE_DB_DATABASE!
    echo SAGE_DB_PORT=!SAGE_DB_PORT!
    echo.
    echo # SAGE Reference IDs
    echo SAGE_STOCK_CODE_ID=!SAGE_STOCK_CODE_ID!
    echo SAGE_WAREHOUSE_ID=!SAGE_WAREHOUSE_ID!
    echo SAGE_TAX_TYPE_ID=!SAGE_TAX_TYPE_ID!
    echo.
    echo # JWT Authentication
    echo JWT_SECRET=!JWT_SECRET!
    echo JWT_EXPIRES_IN=8h
    echo.
    echo # CoCCA Webhook API Key
    echo COCCA_API_KEY=!COCCA_API_KEY!
    echo.
    echo # Scheduler Settings
    echo MAX_RETRY_ATTEMPTS=3
    echo RETRY_CRON=*/5 * * * *
    echo INCOME_RECOGNITION_CRON=0 0 * * *
) > "!ENV_FILE!"

echo.
echo  [OK] .env file written to: !ENV_FILE!

:after_env

:: ── STEP 8: Run database migration ───────────────────────────────────────────
echo.
echo  [7/8] Running database migration...
echo        (Creates tables in VeriSagePro database + default admin user)
echo.
cd /d "!BACKEND_DIR!"
node src/config/migrate.js
if not !errorlevel! == 0 (
    echo.
    echo  [ERROR] Database migration failed.
    echo.
    echo  Common causes:
    echo    1. SQL Server is not running - check Services in Task Manager
    echo    2. The VeriSagePro database does not exist yet
    echo       Open SSMS, connect to !DB_SERVER!, create an empty database
    echo       named "!DB_DATABASE!", then re-run:
    echo         cd !BACKEND_DIR!
    echo         node src/config/migrate.js
    echo    3. Wrong credentials in .env - edit !ENV_FILE!
    echo    4. TCP/IP not enabled in SQL Server Configuration Manager
    echo.
    pause
    exit /b 1
)
echo.
echo  [OK] Database migration complete.

:: ── STEP 9: Start with PM2 ───────────────────────────────────────────────────
echo.
echo  [8/8] Starting VeriSage Pro with PM2...
echo.
cd /d "!BACKEND_DIR!"

:: Stop existing instance if running (ignore error if not running yet)
pm2 delete verisage-pro >nul 2>&1

:: Start fresh
pm2 start src/index.js --name verisage-pro --log "!LOGS_DIR!\pm2.log" --time
if not !errorlevel! == 0 (
    echo  [ERROR] PM2 failed to start the application.
    echo          Check the log: !LOGS_DIR!\pm2.log
    pause
    exit /b 1
)

:: Save PM2 process list so it survives reboots
pm2 save

:: Enable PM2 startup on Windows boot
echo.
echo  [INFO] Configuring PM2 to start on Windows boot...
pm2 startup
echo.
echo  [INFO] If the above output shows a command starting with "pm2",
echo         copy and paste it into this window and press ENTER.
echo         Then run:  pm2 save
echo.

:: ── Health check ─────────────────────────────────────────────────────────────
echo  Waiting 5 seconds for the server to initialise...
timeout /t 5 /nobreak >nul

echo.
echo  Checking health endpoint...
curl -s "http://localhost:!PORT!/health"
echo.

:: ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo  ============================================================
echo   DEPLOYMENT COMPLETE
echo  ============================================================
echo.
echo   Dashboard URL   : http://localhost:!PORT!
echo   API Base URL    : http://localhost:!PORT!/api
echo   Health Check    : http://localhost:!PORT!/health
echo   Webhook URL     : http://localhost:!PORT!/api/webhook/topup
echo.
echo   Default login   : admin@nira.org.ng
echo   Default password: ChangeMe@2025!
echo   IMPORTANT: Change this password immediately after first login.
echo.
echo   PM2 commands:
echo     pm2 status                   - see if app is running
echo     pm2 logs verisage-pro        - live log output
echo     pm2 restart verisage-pro     - restart the app
echo     pm2 stop verisage-pro        - stop the app
echo.
echo   Log files:
echo     !LOGS_DIR!\pm2.log
echo     !LOGS_DIR!\combined.log
echo     !LOGS_DIR!\error.log
echo.
echo  ============================================================
echo.
pause
endlocal
exit /b 0

:: =============================================================================
:: Subroutine: install_node
:: =============================================================================
:install_node
set "NODE_URL=https://nodejs.org/dist/v18.20.2/node-v18.20.2-x64.msi"
set "NODE_INSTALLER=%TEMP%\node_setup.msi"

echo  Downloading Node.js v18 LTS...
curl -L -o "!NODE_INSTALLER!" "!NODE_URL!"
if not !errorlevel! == 0 (
    echo  [ERROR] Download failed. Check internet connection or download manually:
    echo          https://nodejs.org
    exit /b 1
)

echo  Installing Node.js silently (this may take a minute)...
msiexec /i "!NODE_INSTALLER!" /quiet /norestart
exit /b !errorlevel!
