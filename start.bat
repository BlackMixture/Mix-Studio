@echo off
title Mix Studio
cd /d "%~dp0"
echo Starting Mix Studio...
set "NODE_EXE=%MIX_STUDIO_NODE%"
if defined NODE_EXE if not exist "%NODE_EXE%" set "NODE_EXE="
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
if not defined NODE_EXE (
  echo Node.js was not found. Run install.bat first.
  pause
  exit /b 1
)
set MIXBOX_RESTART_MODE=batch
:restart
"%NODE_EXE%" server.js
if "%ERRORLEVEL%"=="75" goto restart
pause
