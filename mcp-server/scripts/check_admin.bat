@echo off
echo Checking for Administrator Privileges...

:: net session requires admin privileges, so we check if it succeeds
net session >nul 2>&1
if %errorLevel% == 0 (
    echo.
    echo SUCCESS: You are running as Administrator.
    echo KavanMCP will have full access to inspect and terminate processes.
) else (
    echo.
    echo WARNING: You are NOT running as Administrator.
    echo To allow KavanMCP to inspect background services, please right-click
    echo and select "Run as Administrator".
)

echo.
pause
