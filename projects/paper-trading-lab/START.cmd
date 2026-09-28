@echo off
setlocal
cd /d "%~dp0"
title Paper Trading Lab v0.29.4.1

echo ==========================================
echo   Paper Trading Lab v0.29.4.1
echo ==========================================
echo.

if not exist ".env" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env" >nul
        echo [INFO] .env was created from .env.example
        echo [ACTION REQUIRED] Put your Alpaca Paper API keys into .env, then run START.cmd again.
        notepad ".env"
        pause
        exit /b 1
    )
)

if not exist ".venv\Scripts\python.exe" (
    echo [1/4] Creating Python virtual environment...
    python -m venv .venv
    if errorlevel 1 goto :error
) else (
    echo [1/4] Virtual environment OK
)

echo [2/4] Checking dependencies...
".venv\Scripts\python.exe" -c "import uvicorn,fastapi,httpx,pandas,pydantic_settings" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
    if errorlevel 1 goto :error
) else (
    echo Dependencies OK
)

echo [3/4] Starting browser...
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:8000"

echo [4/4] Starting server...
echo.
echo Close this window or press Ctrl+C to stop Paper Trading Lab.
echo.
".venv\Scripts\python.exe" run.py
goto :eof

:error
echo.
echo [ERROR] Startup failed.
pause
exit /b 1