@echo off
cd /d "%~dp0"
py -3 watch_plan.py 2>nul
if errorlevel 1 python watch_plan.py
if errorlevel 1 pause
