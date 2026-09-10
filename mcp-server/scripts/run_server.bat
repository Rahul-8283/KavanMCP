@echo off
echo ==========================================
echo      Starting KavanMCP Server...
echo ==========================================

:: Navigate up one directory to the mcp-server root
cd ..

if not exist "venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment not found. Please run scripts\install_deps.bat first.
    pause
    exit /b 1
)

:: Activate the environment and run the server
call venv\Scripts\activate
python main.py

pause
