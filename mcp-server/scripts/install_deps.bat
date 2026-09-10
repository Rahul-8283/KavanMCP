@echo off
echo ==========================================
echo    KavanMCP - Dependency Installer
echo ==========================================

:: Navigate up one directory to the mcp-server root
cd ..

echo Creating virtual environment...
python -m venv venv

echo Activating virtual environment and installing dependencies...
call venv\Scripts\activate
pip install -r requirements.txt

echo.
echo Dependencies installed successfully!
echo You can now run the server using scripts\run_server.bat
pause
