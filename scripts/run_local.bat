@echo off
echo Starting local web server for ZombieWalk...
echo.

:: Change to the project root directory (one level up from this script)
cd %~dp0\..

echo Server will be available at: http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

:: Try Python first
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Using Python http.server...
    python -m http.server 8000
    exit /b
)

:: Try Node.js (npx serve) if Python is not available
npx --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Using npx serve...
    npx serve -l 8000 .
    exit /b
)

echo [ERROR] Neither Python nor Node.js (npx) was found.
echo Please install Python (https://www.python.org/) to run the local server.
pause
