@echo off
title Lighthouse Batch Runner

REM Set colors (optional, requires Windows 10+)
color 0A

echo ========================================
echo Starting Lighthouse Batch Processing
echo ========================================
echo Current Time: %date% %time%
echo.

REM Change to the script directory
cd /d C:\Users\Gray\Documents\Lighthouse\lighthouse-automation

REM Check if directory exists
if not exist "lighthouse-batch.js" (
    color 0C
    echo ERROR: lighthouse-batch.js not found!
    echo Current directory: %cd%
    echo Please check the path is correct.
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ERROR: Node.js is not installed or not in PATH!
    pause
    exit /b 1
)

REM Run the Node.js script
echo Running lighthouse tests...
echo.

REM Run and capture the exit code
node lighthouse-batch.js
set EXITCODE=%ERRORLEVEL%

echo.
echo ========================================
if %EXITCODE%==0 (
    echo Processing completed successfully!
    color 0A
) else (
    echo Processing completed with errors (Exit Code: %EXITCODE%)
    color 0E
)
echo Current Time: %date% %time%
echo ========================================
echo.
echo Press any key to view results or close window...
pause >nul

REM Optional: Open the CSV file automatically
if exist "lighthouse-results.csv" (
    start lighthouse-results.csv
)