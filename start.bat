@echo off
title Mix Studio
cd /d "%~dp0"
echo Starting Mix Studio...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Run install.bat first.
  pause
  exit /b 1
)
set MIXBOX_RESTART_MODE=batch
:restart
node server.js
if "%ERRORLEVEL%"=="75" goto restart
pause
