@echo off
echo ========================================================
echo KavanMCP V1: Quality Assurance ^& Test Runner
echo ========================================================
echo.

echo Running full Pytest Suite...
python -m pytest tests/ -v

echo.
echo ========================================================
echo Testing Complete! 
echo If everything passed, you are cleared for production.
echo ========================================================
pause
