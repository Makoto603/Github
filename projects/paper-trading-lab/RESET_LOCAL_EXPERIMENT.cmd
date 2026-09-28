@echo off
setlocal
cd /d "%~dp0"
title Paper Trading Lab - Reset Local Experiment

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] .venv not found. Run START.cmd once first.
    pause
    exit /b 1
)

".venv\Scripts\python.exe" scripts\reset_local_experiment.py
pause