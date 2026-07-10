@echo off
setlocal
title Mix Studio Installer
cd /d "%~dp0"
if not exist "%~dp0installer\install-ui.ps1" (
  echo Mix Studio Setup could not find installer\install-ui.ps1.
  pause
  exit /b 1
)
start "Mix Studio Setup" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0installer\install-ui.ps1"
exit /b 0
