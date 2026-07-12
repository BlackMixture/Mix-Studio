'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('portable installer has a double-click Windows entry point', () => {
  const launcher = fs.readFileSync(path.join(root, 'install.bat'), 'utf8');
  const start = fs.readFileSync(path.join(root, 'start.bat'), 'utf8');
  assert.match(launcher, /installer\\install-ui\.ps1/i);
  assert.match(launcher, /ExecutionPolicy Bypass/i);
  assert.match(launcher, /-STA/);
  assert.match(start, /title Mix Studio/i);
  assert.match(start, /MIXBOX_RESTART_MODE=batch/);
  assert.doesNotMatch(start, /MixBox Studio/);
});

test('standalone installer downloads the official Git checkout before opening setup', () => {
  const launcher = fs.readFileSync(path.join(root, 'install.bat'), 'utf8');
  assert.match(launcher, /https:\/\/github\.com\/BlackMixture\/Mix-Studio\.git/);
  assert.match(launcher, /winget install --id Git\.Git/);
  assert.match(launcher, /clone --branch main --single-branch/);
  assert.match(launcher, /%USERPROFILE%\\Mix Studio/);
  assert.match(launcher, /if exist "%~dp0installer\\install-ui\.ps1" goto run_setup/i);
  assert.match(launcher, /target folder already exists but is not a Mix Studio Git checkout/i);
});

test('GitHub Pages publishes the canonical installer from a branded download page', () => {
  const page = fs.readFileSync(path.join(root, 'docs', 'download', 'index.html'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  const localLogo = fs.readFileSync(path.join(root, 'docs', 'download', 'modatory-logo.svg'), 'utf8');
  const localWordmark = fs.readFileSync(path.join(root, 'docs', 'download', 'mix-studio-wordmark.svg'), 'utf8');
  assert.match(page, /Download for Windows/);
  assert.match(page, /href="\.\/install\.bat" download="install\.bat"/);
  assert.match(page, /Guided ComfyUI setup/);
  assert.match(page, /modatory-logo\.svg/);
  assert.equal(localLogo, fs.readFileSync(path.join(root, 'public', 'modatory-logo.svg'), 'utf8'));
  assert.equal(localWordmark, fs.readFileSync(path.join(root, 'public', 'mix-studio-wordmark-white-on-black.svg'), 'utf8'));
  assert.match(page, /id="features"/);
  assert.match(page, /id="quick-start"/);
  assert.match(page, /mix-studio-create\.png/);
  assert.match(page, /mix-studio-region\.png/);
  assert.match(page, /mix-studio-video\.png/);
  assert.match(page, /mix-studio-mobile\.png/);
  assert.match(page, /id="mobile-first"/);
  assert.match(page, /depth guidance/);
  assert.match(page, /Continue Edit/);
  assert.match(page, /audio for lipsync/);
  assert.match(page, /Leading models\. Optimized settings\./);
  assert.match(page, /workflow-tested defaults/);
  assert.match(page, /animated progress with ETA/);
  assert.match(page, /reveal, zoom, and pan/);
  assert.match(page, /tailscale\.com\/download/);
  assert.match(page, /Your studio/);
  assert.doesNotMatch(page, /—/);
  assert.match(workflow, /cp install\.bat _site\/install\.bat/);
  assert.match(workflow, /cp docs\/download\/mix-studio-create\.png _site\/mix-studio-create\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-mobile\.png _site\/mix-studio-mobile\.png/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});

test('portable installer opens a branded WPF wizard instead of a terminal questionnaire', () => {
  const ui = fs.readFileSync(path.join(root, 'installer', 'install-ui.ps1'), 'utf8');
  assert.match(ui, /PresentationFramework/);
  assert.match(ui, /Background="#000000"/);
  assert.match(ui, /Mix Studio/);
  assert.match(ui, /Path Fill="#fdc302"/);
  assert.doesNotMatch(ui, /MixBox Studio/);
  assert.match(ui, /PageWelcome/);
  assert.match(ui, /PageConnection/);
  assert.match(ui, /PageFeatures/);
  assert.match(ui, /PageReview/);
  assert.match(ui, /PageComplete/);
  assert.match(ui, /DoubleAnimation/);
  assert.match(ui, /Build your optimized local studio/);
  assert.match(ui, /Curated models/);
  assert.match(ui, /workflow-tested settings/);
});

test('visual wizard delegates writes to the non-interactive safe install engine', () => {
  const ui = fs.readFileSync(path.join(root, 'installer', 'install-ui.ps1'), 'utf8');
  const engine = fs.readFileSync(path.join(root, 'installer', 'install.ps1'), 'utf8');
  assert.match(ui, /install\.ps1/);
  assert.match(ui, /-NonInteractive/);
  assert.match(ui, /-FeatureConfigFile/);
  assert.match(engine, /\[string\]\$FeatureConfigFile/);
});

test('guided setup can install official ComfyUI and selected dependencies', () => {
  const ui = fs.readFileSync(path.join(root, 'installer', 'install-ui.ps1'), 'utf8');
  const engine = fs.readFileSync(path.join(root, 'installer', 'install.ps1'), 'utf8');
  const dependencyCli = require('../installer/install-dependencies');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'installer', 'feature-manifest.json'), 'utf8'));
  const ltx = manifest.features.find((feature) => feature.id === 'video.ltx');
  const image = manifest.features.find((feature) => feature.id === 'core.image');
  assert.match(ui, /InstallComfyOption/);
  assert.match(ui, /Install ComfyUI Desktop/);
  assert.match(ui, /DownloadModelsToggle/);
  assert.match(ui, /HfTokenBox/);
  assert.match(ui, /EnvironmentVariables\['HF_TOKEN'\]/);
  assert.match(engine, /https:\/\/download\.comfy\.org\/windows\/nsis\/x64/);
  assert.match(engine, /Get-AuthenticodeSignature/);
  assert.match(engine, /SignatureStatus\]::Valid/);
  assert.match(engine, /Install-ComfyDesktop/);
  assert.match(engine, /\[switch\]\$InstallDependencies/);
  assert.match(image.label, /depth guidance/i);
  assert.match(ltx.label, /Face ID/);
  assert.ok(ltx.models.includes('ltx-face-id'));
  assert.ok(ltx.nodes.includes('BFS Nodes'));
  assert.deepEqual(dependencyCli.selectedComponents(
    { features: [{ id: 'core.image', required: true }, { id: 'video.ltx' }, { id: 'video.wan' }, { id: 'video.scail' }] },
    { 'video.ltx': true, 'video.wan': true, 'video.scail': true },
  ), ['image', 'krea2depth', 'video', 'faceid', 'wan', 'scail', 'scailinfinity']);
});

test('portable installer requires Git for safe in-app updates and Node 22', () => {
  const installer = fs.readFileSync(path.join(root, 'installer', 'install.ps1'), 'utf8');
  assert.match(installer, /Test-Path \(Join-Path \$Root '\.git'\)/);
  assert.match(installer, /NodeMajor -lt 22/);
  assert.match(installer, /provider = 'git'/);
});

test('portable installer preserves settings and supports existing ComfyUI paths', () => {
  const installer = fs.readFileSync(path.join(root, 'installer', 'install.ps1'), 'utf8');
  assert.match(installer, /Copy-Item \$File \$Backup/);
  assert.match(installer, /Existing ComfyUI folder/);
  assert.match(installer, /Existing models folder/);
  assert.doesNotMatch(installer, /Remove-Item[^\r\n]*(data|SettingsFile)/i);
});

test('portable installer validates direct engine input and keeps unique backups', () => {
  const installer = fs.readFileSync(path.join(root, 'installer', 'install.ps1'), 'utf8');
  assert.match(installer, /Normalize-ComfyUrl/);
  assert.match(installer, /http.*https/);
  assert.match(installer, /while \(Test-Path \$Backup\)/);
  assert.match(installer, /appId = 'mix-studio'/);
});

test('portable checkout has a conservative uninstaller entry point', () => {
  const launcher = fs.readFileSync(path.join(root, 'uninstall.bat'), 'utf8');
  const uninstaller = fs.readFileSync(path.join(root, 'installer', 'uninstall.ps1'), 'utf8');
  assert.match(launcher, /installer\\uninstall\.ps1/i);
  assert.match(launcher, /ExecutionPolicy Bypass/i);
  assert.match(uninstaller, /Assert-SafeInstallRoot/);
  assert.match(uninstaller, /@\('mix-studio', 'mixbox-studio'\)/);
  assert.match(uninstaller, /ComfyUI.*Node\.js.*never removed/i);
  assert.match(uninstaller, /-RemoveData/);
  assert.match(uninstaller, /Type DELETE to continue/);
  assert.match(uninstaller, /Where-Object \{ `\$_.FullName -ne `\$Data \}/);
  assert.match(uninstaller, /Start-Process -FilePath \$PowerShell/);
});
