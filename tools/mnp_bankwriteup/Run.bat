@echo off
setlocal

cd /d "%~dp0"

REM Check Python is available
where python >nul 2>nul
if errorlevel 1 (
    echo Python is not installed.
    echo.
    echo Opening the Python download page. Install Python 3.11+ and CHECK the
    echo "Add Python to PATH" box during install, then run this file again.
    echo.
    start https://www.python.org/downloads/
    pause
    exit /b 1
)

REM First-run: install dependencies into a local venv
if not exist ".venv\Scripts\python.exe" (
    echo First-time setup: creating environment and installing dependencies...
    python -m venv .venv
    if errorlevel 1 (
        echo Failed to create virtual environment.
        pause
        exit /b 1
    )
    call ".venv\Scripts\activate.bat"
    python -m pip install --upgrade pip
    pip install -r requirements.txt
    if errorlevel 1 (
        echo Dependency install failed. See errors above.
        pause
        exit /b 1
    )
) else (
    call ".venv\Scripts\activate.bat"
)

REM Launch the app
python main.py
if errorlevel 1 (
    echo.
    echo The app exited with an error. See messages above.
    pause
)

endlocal
