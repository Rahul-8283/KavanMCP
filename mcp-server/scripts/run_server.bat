@echo off
echo ==========================================
echo      Starting KavanMCP Server...
echo ==========================================

:: Navigate up one directory to the mcp-server root
cd "%~dp0.."

if not exist "env\Scripts\activate.bat" (
    if not exist "venv\Scripts\activate.bat" (
        echo ERROR: Virtual environment not found. Please run scripts\install_deps.bat first.
        pause
        exit /b 1
    ) else (
        call venv\Scripts\activate
    )
) else (
    call env\Scripts\activate
)

:: Run the server
python main.py

pause
