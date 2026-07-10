@echo off
setlocal
title Mix Studio Uninstaller
cd /d "%~dp0"
if not exist "%~dp0installer\uninstall.ps1" (
  echo Mix Studio Uninstaller could not find installer\uninstall.ps1.
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\uninstall.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
