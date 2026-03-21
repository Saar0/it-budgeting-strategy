@echo off
echo ========================================
echo    IT Budget Strategist
echo ========================================
echo.

:: Change to the directory where this batch file is located
cd /d "%~dp0"
echo Current directory: %cd%
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js is installed
echo.

:: Check if package.json exists
if not exist "package.json" (
    echo [ERROR] package.json not found!
    echo Please make sure you're in the correct folder.
    echo.
    pause
    exit /b 1
)
echo [OK] package.json found
echo.

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    echo This may take 1-2 minutes...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo.
) else (
    echo [OK] Dependencies already installed
    echo.
)

:: Initialize database if needed
if not exist "database" (
    mkdir database
)
if not exist "database\budget.db" (
    echo [INFO] Initializing database...
    call npm run init-db
    if %errorlevel% neq 0 (
        echo [WARNING] Database init failed, but continuing...
    )
    echo.
)

:: Open browser
echo [INFO] Opening browser...
start "" "http://localhost:3001"
timeout /t 2 /nobreak >nul

:: Start the server
echo [INFO] Starting server...
echo.
echo ========================================
echo Server running at: http://localhost:3001
echo Press Ctrl+C to stop
echo ========================================
echo.
npm start

:: If server stops, pause to see error
echo.
echo [ERROR] Server stopped unexpectedly!
pause