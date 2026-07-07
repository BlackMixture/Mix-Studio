@echo off
title KreaStudio
cd /d "%~dp0"
echo Starting KreaStudio...
set KREASTUDIO_RESTART_MODE=batch
:restart
node server.js
if "%ERRORLEVEL%"=="75" goto restart
pause
