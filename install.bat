@echo off
setlocal
title MixBox Studio Installer
cd /d "%~dp0"
start "MixBox Studio Setup" powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0installer\install-ui.ps1"
exit /b 0
