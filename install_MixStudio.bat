@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Mix Studio Installer
cd /d "%~dp0"

if exist "%~dp0installer\bootstrap.js" goto run_app

set "MIX_STUDIO_REPO=https://github.com/BlackMixture/Mix-Studio.git"
set "MIX_STUDIO_HOME=%~dp0Mix Studio"
set "GIT_EXE="

echo.
echo   Mix Studio downloader
echo   This will download the official repository to:
echo   %MIX_STUDIO_HOME%
echo.

where git.exe >nul 2>nul
if not errorlevel 1 set "GIT_EXE=git.exe"
if not defined GIT_EXE call :find_git

if not defined GIT_EXE (
  where winget.exe >nul 2>nul
  if errorlevel 1 goto git_required
  echo Git is required for safe updates. Installing Git for Windows...
  winget install --id Git.Git --exact --source winget --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto git_install_failed
  call :find_git
)

if not defined GIT_EXE goto git_install_failed

if exist "%MIX_STUDIO_HOME%\.git\" goto launch_downloaded
if exist "%MIX_STUDIO_HOME%\" (
  dir /b "%MIX_STUDIO_HOME%" 2>nul | findstr . >nul
  if errorlevel 1 goto download_mix_studio
  call :prepare_existing_target
  if errorlevel 2 goto preserved_data_in_use
  if errorlevel 1 goto target_in_use
)

:download_mix_studio
echo Downloading Mix Studio...
"%GIT_EXE%" clone --branch main --single-branch "%MIX_STUDIO_REPO%" "%MIX_STUDIO_HOME%"
if errorlevel 1 goto clone_failed

:launch_downloaded
if not exist "%MIX_STUDIO_HOME%\install_MixStudio.bat" goto clone_failed
echo Opening Mix Studio...
start "" "%MIX_STUDIO_HOME%\install_MixStudio.bat"
exit /b 0

:run_app
set "NODE_EXE="
set "NODE_MAJOR=0"
call :find_node
if defined NODE_EXE call :read_node_major
if %NODE_MAJOR% GEQ 22 goto node_ready

where winget.exe >nul 2>nul
if errorlevel 1 goto node_required
if defined NODE_EXE (
  echo Updating Node.js so Mix Studio can start...
  winget upgrade --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
  if errorlevel 1 winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements
) else (
  echo Installing Node.js so Mix Studio can start...
  winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
)
set "NODE_EXE="
set "NODE_MAJOR=0"
call :find_node
if defined NODE_EXE call :read_node_major
if %NODE_MAJOR% LSS 22 (
  echo Installing the current Node.js LTS release...
  winget install --id OpenJS.NodeJS.LTS --exact --source winget --force --accept-package-agreements --accept-source-agreements
  set "NODE_EXE="
  set "NODE_MAJOR=0"
  call :find_node
  if defined NODE_EXE call :read_node_major
)
if %NODE_MAJOR% LSS 22 goto node_install_failed

:node_ready
echo Preparing the Mix Studio web app...
"%NODE_EXE%" "%~dp0installer\bootstrap.js"
if errorlevel 1 goto bootstrap_failed

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:3300/; if ($r.StatusCode -eq 200 -and $r.Content -match 'Mix Studio') { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 goto open_app

set "MIX_STUDIO_NODE=%NODE_EXE%"
start "Mix Studio" /min "%~dp0start.bat"

echo Starting Mix Studio in your browser...
for /L %%I in (1,1,30) do (
  "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:3300/; if ($r.StatusCode -eq 200 -and $r.Content -match 'Mix Studio') { exit 0 } } catch {}; exit 1" >nul 2>nul
  if not errorlevel 1 goto open_app
  timeout /t 1 /nobreak >nul
)
goto app_start_failed

:open_app
start "" "http://127.0.0.1:3300/"
exit /b 0

:find_git
if exist "%ProgramFiles%\Git\cmd\git.exe" set "GIT_EXE=%ProgramFiles%\Git\cmd\git.exe"
if not defined GIT_EXE if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set "GIT_EXE=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
if not defined GIT_EXE if exist "%ProgramFiles(x86)%\Git\cmd\git.exe" set "GIT_EXE=%ProgramFiles(x86)%\Git\cmd\git.exe"
exit /b 0

:find_node
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
exit /b 0

:read_node_major
for /f "delims=" %%V in ('""%NODE_EXE%" -p "process.versions.node.split('.')[0]""') do set "NODE_MAJOR=%%V"
exit /b 0

:prepare_existing_target
if not exist "%MIX_STUDIO_HOME%\data\" exit /b 1
for /f "delims=" %%F in ('dir /b /a "%MIX_STUDIO_HOME%" 2^>nul') do if /I not "%%F"=="data" exit /b 1
if exist "%LOCALAPPDATA%\Mix Studio\data\" exit /b 2
echo Preserving gallery data left by an earlier uninstall...
if not exist "%LOCALAPPDATA%\Mix Studio\" mkdir "%LOCALAPPDATA%\Mix Studio" >nul 2>nul
move "%MIX_STUDIO_HOME%\data" "%LOCALAPPDATA%\Mix Studio\data" >nul
if errorlevel 1 exit /b 2
rmdir "%MIX_STUDIO_HOME%" >nul 2>nul
exit /b 0

:git_required
echo.
echo Git for Windows and winget were not found.
echo Install Git from https://git-scm.com/download/win, then run this file again.
pause
exit /b 1

:git_install_failed
echo.
echo Git could not be installed automatically.
echo Install Git from https://git-scm.com/download/win, then run this file again.
pause
exit /b 1

:target_in_use
echo.
echo The target folder already exists but is not a Mix Studio Git checkout:
echo %MIX_STUDIO_HOME%
echo Move or rename that folder, then run this file again. Nothing was overwritten.
pause
exit /b 1

:preserved_data_in_use
echo.
echo Mix Studio found both an old data-only checkout and an existing preserved data folder.
echo Nothing was overwritten. Move or rename one of these folders, then run this file again:
echo %MIX_STUDIO_HOME%\data
echo %LOCALAPPDATA%\Mix Studio\data
pause
exit /b 1

:clone_failed
echo.
echo Mix Studio could not be downloaded from GitHub.
echo Check your internet connection, then run this file again.
pause
exit /b 1

:node_required
echo.
echo Node.js 22 or newer and winget were not found.
echo Install the current Node.js LTS from https://nodejs.org, then run this file again.
pause
exit /b 1

:node_install_failed
echo.
echo Node.js 22 or newer could not be installed automatically.
echo Install the current Node.js LTS from https://nodejs.org, then run this file again.
pause
exit /b 1

:bootstrap_failed
echo.
echo Mix Studio downloaded, but its local web app could not be prepared.
echo Nothing was removed. Run this installer again after checking the message above.
pause
exit /b 1

:app_start_failed
echo.
echo Mix Studio was prepared, but the web app did not answer at http://127.0.0.1:3300/.
echo Check the Mix Studio window for details, then run start.bat again.
pause
exit /b 1
