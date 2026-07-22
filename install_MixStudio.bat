@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Mix Studio Installer
cd /d "%~dp0"

if /I "%~1"=="--verify-checkout" goto verify_checkout_cli
if /I "%~1"=="--verify-node" goto verify_node_cli
if exist "%~dp0installer\bootstrap.js" goto run_app

set "MIX_STUDIO_REPO=https://github.com/BlackMixture/Mix-Studio.git"
set "MIX_STUDIO_HOME=%~dp0Mix Studio"
set "MIX_STUDIO_STAGE=%~dp0Mix Studio.download"
set "MIX_STUDIO_PRESERVED_ROOT=%LOCALAPPDATA%\Mix Studio User Data"
set "MIX_STUDIO_PRESERVED_DATA=%MIX_STUDIO_PRESERVED_ROOT%\data"
set "GIT_EXE="

echo.
echo   Mix Studio downloader
echo   This will download the official repository to:
echo   %MIX_STUDIO_HOME%
echo.

for /f "delims=" %%G in ('where git.exe 2^>nul') do if not defined GIT_EXE set "GIT_EXE=%%G"
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
set "MIX_STUDIO_GIT=%GIT_EXE%"
call :verify_writable_destination
if errorlevel 1 goto destination_not_writable

if exist "%MIX_STUDIO_HOME%\.git\" (
  call :validate_checkout "%MIX_STUDIO_HOME%"
  if errorlevel 1 goto checkout_origin_invalid
  if not exist "%MIX_STUDIO_HOME%\data\" call :refresh_unconfigured_checkout
  if errorlevel 1 goto checkout_refresh_failed
  if exist "%MIX_STUDIO_HOME%\install_MixStudio.bat" if exist "%MIX_STUDIO_HOME%\server.js" if exist "%MIX_STUDIO_HOME%\installer\bootstrap.js" goto launch_downloaded
  if exist "%MIX_STUDIO_HOME%\data\" goto incomplete_checkout_with_data
  call :quarantine_incomplete_checkout
  if errorlevel 1 goto target_in_use
)
if exist "%MIX_STUDIO_HOME%\" (
  dir /b "%MIX_STUDIO_HOME%" 2>nul | findstr . >nul
  if errorlevel 1 rmdir "%MIX_STUDIO_HOME%" >nul 2>nul
)
if exist "%MIX_STUDIO_HOME%\" (
  call :prepare_existing_target
  if errorlevel 2 goto preserved_data_in_use
  if errorlevel 1 goto target_in_use
)

:download_mix_studio
call :quarantine_stale_stage
if errorlevel 1 goto staging_in_use
echo Downloading Mix Studio...
"%GIT_EXE%" clone --depth 1 --branch main --single-branch "%MIX_STUDIO_REPO%" "%MIX_STUDIO_STAGE%"
if errorlevel 1 goto cleanup_failed_clone
call :validate_checkout "%MIX_STUDIO_STAGE%"
if errorlevel 1 goto cleanup_invalid_clone
if not exist "%MIX_STUDIO_STAGE%\install_MixStudio.bat" goto cleanup_invalid_clone
if not exist "%MIX_STUDIO_STAGE%\server.js" goto cleanup_invalid_clone
if not exist "%MIX_STUDIO_STAGE%\installer\bootstrap.js" goto cleanup_invalid_clone
if exist "%MIX_STUDIO_HOME%\" goto staging_target_race
move "%MIX_STUDIO_STAGE%" "%MIX_STUDIO_HOME%" >nul 2>nul
if errorlevel 1 goto staging_promote_failed

:launch_downloaded
if not exist "%MIX_STUDIO_HOME%\install_MixStudio.bat" goto clone_failed
echo Opening Mix Studio...
start "" "%MIX_STUDIO_HOME%\install_MixStudio.bat"
exit /b 0

:run_app
set "GIT_EXE="
for /f "delims=" %%G in ('where git.exe 2^>nul') do if not defined GIT_EXE set "GIT_EXE=%%G"
if not defined GIT_EXE call :find_git
if defined GIT_EXE set "MIX_STUDIO_GIT=%GIT_EXE%"
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
set "NODE_MAJOR="
set "NODE_VERSION_FILE=%TEMP%\mix-studio-node-version-%RANDOM%-%RANDOM%.txt"
"%NODE_EXE%" -p "process.versions.node.split('.')[0]" >"%NODE_VERSION_FILE%" 2>nul
if errorlevel 1 goto node_version_read_failed
set /p "NODE_MAJOR="<"%NODE_VERSION_FILE%"
del /f /q "%NODE_VERSION_FILE%" >nul 2>nul
if not defined NODE_MAJOR goto node_version_read_failed
exit /b 0

:node_version_read_failed
del /f /q "%NODE_VERSION_FILE%" >nul 2>nul
set "NODE_MAJOR=0"
exit /b 1

:verify_node_cli
set "NODE_EXE=%~2"
set "NODE_MAJOR=0"
call :read_node_major
if errorlevel 1 exit /b 1
if %NODE_MAJOR% GEQ 22 exit /b 0
exit /b 1

:verify_checkout_cli
set "GIT_EXE=%~2"
set "MIX_STUDIO_REPO=https://github.com/BlackMixture/Mix-Studio.git"
call :validate_checkout "%~3"
exit /b %ERRORLEVEL%

:verify_writable_destination
set "MIX_STUDIO_WRITE_PROBE=%~dp0.mix-studio-write-%RANDOM%-%RANDOM%"
mkdir "%MIX_STUDIO_WRITE_PROBE%" >nul 2>nul
if errorlevel 1 exit /b 1
> "%MIX_STUDIO_WRITE_PROBE%\write.test" echo Mix Studio
if not exist "%MIX_STUDIO_WRITE_PROBE%\write.test" goto writable_probe_failed
del /f /q "%MIX_STUDIO_WRITE_PROBE%\write.test" >nul 2>nul
rmdir "%MIX_STUDIO_WRITE_PROBE%" >nul 2>nul
exit /b 0

:writable_probe_failed
rmdir /s /q "%MIX_STUDIO_WRITE_PROBE%" >nul 2>nul
exit /b 1

:validate_checkout
set "CHECKOUT_PATH=%~1"
set "CHECKOUT_ORIGIN="
set "CHECKOUT_ORIGIN_FILE=%TEMP%\mix-studio-origin-%RANDOM%-%RANDOM%.txt"
"%GIT_EXE%" -C "%CHECKOUT_PATH%" remote get-url origin >"%CHECKOUT_ORIGIN_FILE%" 2>nul
if errorlevel 1 goto checkout_origin_read_failed
set /p "CHECKOUT_ORIGIN="<"%CHECKOUT_ORIGIN_FILE%"
del /f /q "%CHECKOUT_ORIGIN_FILE%" >nul 2>nul
if /I "%CHECKOUT_ORIGIN%"=="https://github.com/BlackMixture/Mix-Studio.git" exit /b 0
if /I "%CHECKOUT_ORIGIN%"=="https://github.com/BlackMixture/Mix-Studio" exit /b 0
if /I "%CHECKOUT_ORIGIN%"=="https://github.com/BlackMixture/Mix-Studio/" exit /b 0
if /I "%CHECKOUT_ORIGIN%"=="git@github.com:BlackMixture/Mix-Studio.git" exit /b 0
if /I "%CHECKOUT_ORIGIN%"=="ssh://git@github.com/BlackMixture/Mix-Studio.git" exit /b 0
if /I "%CHECKOUT_ORIGIN%"=="ssh://git@github.com/BlackMixture/Mix-Studio" exit /b 0
if /I "%CHECKOUT_ORIGIN%"=="https://github.com/BlackMixture/KreaStudio.git" goto migrate_legacy_checkout
if /I "%CHECKOUT_ORIGIN%"=="https://github.com/BlackMixture/KreaStudio" goto migrate_legacy_checkout
if /I "%CHECKOUT_ORIGIN%"=="https://github.com/BlackMixture/KreaStudio/" goto migrate_legacy_checkout
if /I "%CHECKOUT_ORIGIN%"=="git@github.com:BlackMixture/KreaStudio.git" goto migrate_legacy_checkout
if /I "%CHECKOUT_ORIGIN%"=="ssh://git@github.com/BlackMixture/KreaStudio.git" goto migrate_legacy_checkout
if /I "%CHECKOUT_ORIGIN%"=="ssh://git@github.com/BlackMixture/KreaStudio" goto migrate_legacy_checkout
exit /b 1

:checkout_origin_read_failed
del /f /q "%CHECKOUT_ORIGIN_FILE%" >nul 2>nul
exit /b 1

:migrate_legacy_checkout
"%GIT_EXE%" -C "%CHECKOUT_PATH%" remote set-url origin "%MIX_STUDIO_REPO%" >nul 2>nul
exit /b %ERRORLEVEL%

:refresh_unconfigured_checkout
echo Refreshing the unfinished first-time setup...
"%GIT_EXE%" -C "%MIX_STUDIO_HOME%" pull --ff-only origin main
exit /b %ERRORLEVEL%

:quarantine_incomplete_checkout
set "MIX_STUDIO_INCOMPLETE=%~dp0Mix Studio.incomplete-%RANDOM%-%RANDOM%"
move "%MIX_STUDIO_HOME%" "%MIX_STUDIO_INCOMPLETE%" >nul 2>nul
if errorlevel 1 exit /b 1
echo An incomplete checkout was kept at:
echo %MIX_STUDIO_INCOMPLETE%
exit /b 0

:quarantine_stale_stage
if not exist "%MIX_STUDIO_STAGE%\" exit /b 0
set "MIX_STUDIO_STALE_STAGE=%~dp0Mix Studio.download.incomplete-%RANDOM%-%RANDOM%"
move "%MIX_STUDIO_STAGE%" "%MIX_STUDIO_STALE_STAGE%" >nul 2>nul
if errorlevel 1 exit /b 1
echo A previous interrupted download was kept at:
echo %MIX_STUDIO_STALE_STAGE%
exit /b 0

:prepare_existing_target
if not exist "%MIX_STUDIO_HOME%\data\" exit /b 1
for /f "delims=" %%F in ('dir /b /a "%MIX_STUDIO_HOME%" 2^>nul') do if /I not "%%F"=="data" exit /b 1
if exist "%MIX_STUDIO_PRESERVED_DATA%\" exit /b 2
if exist "%LOCALAPPDATA%\Mix Studio\data\" if /I not "%MIX_STUDIO_HOME%\data"=="%LOCALAPPDATA%\Mix Studio\data" exit /b 2
echo Preserving gallery data left by an earlier uninstall...
if not exist "%MIX_STUDIO_PRESERVED_ROOT%\" mkdir "%MIX_STUDIO_PRESERVED_ROOT%" >nul 2>nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$ErrorActionPreference = 'Stop'; $source = Join-Path $env:MIX_STUDIO_HOME 'data'; $dest = $env:MIX_STUDIO_PRESERVED_DATA; if ([IO.Path]::GetPathRoot($source).Equals([IO.Path]::GetPathRoot($dest), [StringComparison]::OrdinalIgnoreCase)) { Move-Item -LiteralPath $source -Destination $dest } else { $temp = $dest + '.importing'; if (Test-Path -LiteralPath $temp) { throw 'A previous data transfer is still present.' }; Copy-Item -LiteralPath $source -Destination $temp -Recurse -Force; $sf = @(Get-ChildItem -LiteralPath $source -Recurse -Force -File); $df = @(Get-ChildItem -LiteralPath $temp -Recurse -Force -File); $sd = @(Get-ChildItem -LiteralPath $source -Recurse -Force -Directory); $dd = @(Get-ChildItem -LiteralPath $temp -Recurse -Force -Directory); if ($sf.Count -ne $df.Count -or $sd.Count -ne $dd.Count -or [long](($sf | Measure-Object Length -Sum).Sum) -ne [long](($df | Measure-Object Length -Sum).Sum)) { throw 'The preserved data copy did not verify.' }; Move-Item -LiteralPath $temp -Destination $dest; Remove-Item -LiteralPath $source -Recurse -Force }; if ((Test-Path -LiteralPath $source) -or -not (Test-Path -LiteralPath $dest)) { exit 1 }" >nul 2>nul
if errorlevel 1 exit /b 2
rmdir "%MIX_STUDIO_HOME%" >nul 2>nul
exit /b 0

:cleanup_failed_clone
if exist "%MIX_STUDIO_STAGE%\" rmdir /s /q "%MIX_STUDIO_STAGE%" >nul 2>nul
goto clone_failed

:cleanup_invalid_clone
if exist "%MIX_STUDIO_STAGE%\" rmdir /s /q "%MIX_STUDIO_STAGE%" >nul 2>nul
goto clone_invalid

:staging_target_race
echo.
echo The target folder appeared while Mix Studio was downloading. Nothing was overwritten.
echo The completed download remains at:
echo %MIX_STUDIO_STAGE%
pause
exit /b 1

:staging_promote_failed
echo.
echo Mix Studio downloaded successfully, but Windows could not move it into the target folder.
echo The completed download remains at:
echo %MIX_STUDIO_STAGE%
pause
exit /b 1

:destination_not_writable
echo.
echo Mix Studio cannot create folders beside this installer:
echo %~dp0
echo Move the installer to a writable folder, such as Documents or another drive, then run it again.
pause
exit /b 1

:checkout_origin_invalid
echo.
echo The existing Mix Studio folder is a Git checkout from a different repository:
echo %MIX_STUDIO_HOME%
echo Nothing was changed. Move or rename that folder, then run this installer again.
pause
exit /b 1

:checkout_refresh_failed
echo.
echo Mix Studio was downloaded, but its unfinished first-time setup could not be refreshed.
echo Nothing was overwritten. Check your internet connection, then run this installer again.
echo Existing download:
echo %MIX_STUDIO_HOME%
pause
exit /b 1

:incomplete_checkout_with_data
echo.
echo The existing Mix Studio checkout is incomplete and contains gallery data.
echo Nothing was moved or overwritten. Preserve or back up this folder before retrying:
echo %MIX_STUDIO_HOME%
pause
exit /b 1

:staging_in_use
echo.
echo A previous download could not be moved aside:
echo %MIX_STUDIO_STAGE%
echo Close programs using that folder, then run this installer again.
pause
exit /b 1

:clone_invalid
echo.
echo GitHub returned an incomplete or unexpected Mix Studio checkout.
echo The incomplete download was removed and the existing installation was not changed.
pause
exit /b 1

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
echo %MIX_STUDIO_PRESERVED_DATA%
echo Legacy location: %LOCALAPPDATA%\Mix Studio\data
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
