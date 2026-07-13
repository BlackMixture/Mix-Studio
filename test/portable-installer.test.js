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
  assert.match(launcher, /prepare_existing_target/);
  assert.match(launcher, /Preserving gallery data left by an earlier uninstall/);
  assert.match(launcher, /LOCALAPPDATA%\\Mix Studio\\data/);
});

test('GitHub Pages publishes the canonical installer from a branded download page', () => {
  const page = fs.readFileSync(path.join(root, 'docs', 'download', 'index.html'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  const localLogo = fs.readFileSync(path.join(root, 'docs', 'download', 'modatory-logo.svg'), 'utf8');
  const localWordmark = fs.readFileSync(path.join(root, 'docs', 'download', 'mix-studio-wordmark.svg'), 'utf8');
  const localSources = [...page.matchAll(/\ssrc="\.\/([^"?#]+)"/g)].map((match) => match[1]);
  assert.match(page, /Download for Windows/);
  assert.match(page, /href="\.\/install\.bat" download="install\.bat"/);
  assert.match(page, /Guided ComfyUI setup/);
  assert.match(page, /modatory-logo\.svg/);
  assert.equal(localLogo, fs.readFileSync(path.join(root, 'public', 'modatory-logo.svg'), 'utf8'));
  assert.equal(localWordmark, fs.readFileSync(path.join(root, 'public', 'mix-studio-wordmark-white-on-black.svg'), 'utf8'));
  for (const source of localSources) {
    assert.ok(fs.existsSync(path.join(root, 'docs', 'download', source)), `download page asset exists: ${source}`);
  }
  assert.match(page, /id="features"/);
  assert.match(page, /id="quick-start"/);
  assert.match(page, /mix-studio-create\.png/);
  assert.match(page, /mix-studio-edit\.png/);
  assert.match(page, /mix-studio-region\.png/);
  assert.match(page, /mix-studio-video\.png/);
  assert.match(page, /mix-studio-mobile\.png/);
  assert.match(page, /mix-studio-profiles-live\.png/);
  assert.match(page, /live-scail-dance\.mp4/);
  assert.match(page, /live-scail-portrait\.mp4/);
  assert.match(page, /live-ltx-bicycle\.mp4/);
  assert.match(page, /class="focus-window/);
  assert.doesNotMatch(page, /class="laptop/);
  assert.match(page, /id="mobile-first"/);
  assert.match(page, /depth guidance/);
  assert.match(page, /Continue Edit/);
  assert.match(page, /audio for lipsync/);
  assert.match(page, /Leading models\. Optimized settings\./);
  assert.match(page, /workflow-tested defaults/);
  assert.match(page, /detects GPU memory and system RAM/);
  assert.match(page, /difficult models stay available as an informed opt-in/);
  assert.match(page, /model files already registered through ComfyUI/);
  assert.match(page, /animated progress with ETA/);
  assert.match(page, /reveal, zoom, and pan/);
  assert.match(page, /tailscale\.com\/download/);
  assert.match(page, /Your studio/);
  assert.doesNotMatch(page, /—/);
  assert.match(workflow, /cp install\.bat _site\/install\.bat/);
  assert.match(workflow, /cp docs\/download\/mix-studio-create\.png _site\/mix-studio-create\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-edit\.png _site\/mix-studio-edit\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-mobile\.png _site\/mix-studio-mobile\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-scail\.png _site\/mix-studio-scail\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-library\.png _site\/mix-studio-library\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-profiles-live\.png _site\/mix-studio-profiles-live\.png/);
  assert.match(workflow, /cp -R docs\/download\/media _site\/media/);
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
  const hardware = fs.readFileSync(path.join(root, 'installer', 'hardware-profile.ps1'), 'utf8');
  const dependencyCli = require('../installer/install-dependencies');
  const discovery = fs.readFileSync(path.join(root, 'installer', 'model-discovery.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'installer', 'feature-manifest.json'), 'utf8'));
  const ltx = manifest.features.find((feature) => feature.id === 'video.ltx');
  const image = manifest.features.find((feature) => feature.id === 'core.image');
  assert.match(ui, /InstallComfyOption/);
  assert.match(ui, /Install ComfyUI Desktop/);
  assert.match(ui, /DownloadModelsToggle/);
  assert.match(ui, /HfTokenBox/);
  assert.match(ui, /EnvironmentVariables\['HF_TOKEN'\]/);
  assert.match(ui, /HardwareTitle/);
  assert.match(ui, /UseRecommendedButton/);
  assert.match(ui, /ReviewWarningsBorder/);
  assert.match(ui, /Confirm-HardwareWarnings/);
  assert.match(ui, /DetectModelsButton/);
  assert.match(ui, /Find-ExistingModels/);
  assert.match(ui, /extra_model_paths\.yaml/);
  assert.match(engine, /\[string\]\$HardwareProfileFile/);
  assert.match(engine, /hardware = \$HardwareProfile/);
  assert.match(engine, /Finding existing models/);
  assert.match(engine, /--discovery \$DiscoveryFile/);
  assert.match(discovery, /\/object_info/);
  assert.match(discovery, /extra_model_paths\.yaml/);
  assert.match(discovery, /registeredModelNames/);
  assert.match(hardware, /nvidia-smi\.exe/);
  assert.match(hardware, /Get-CimInstance Win32_VideoController/);
  assert.match(hardware, /minimumVramGb/);
  assert.match(hardware, /recommendedVramGb/);
  assert.match(hardware, /Can run with offload/);
  assert.match(hardware, /Difficult on this PC/);
  assert.match(engine, /https:\/\/download\.comfy\.org\/windows\/nsis\/x64/);
  assert.match(engine, /Get-AuthenticodeSignature/);
  assert.match(engine, /SignatureStatus\]::Valid/);
  assert.match(engine, /Install-ComfyDesktop/);
  assert.match(engine, /\[switch\]\$InstallDependencies/);
  assert.match(image.label, /depth/i);
  assert.match(image.label, /SeedVR2/i);
  assert.ok(image.models.includes('seedvr2-7b'));
  assert.ok(image.nodes.includes('ComfyUI-SeedVR2_VideoUpscaler'));
  assert.match(ltx.label, /Face ID/);
  assert.ok(ltx.models.includes('ltx-face-id'));
  assert.ok(ltx.nodes.includes('BFS Nodes'));
  for (const feature of manifest.features) {
    assert.ok(feature.variant, `${feature.id} identifies its curated model variant`);
    assert.ok(feature.hardware, `${feature.id} includes hardware guidance`);
    assert.ok(feature.hardware.minimumVramGb > 0, `${feature.id} has a minimum VRAM value`);
    assert.ok(feature.hardware.recommendedVramGb >= feature.hardware.minimumVramGb, `${feature.id} has a valid recommended VRAM value`);
    assert.ok(feature.hardware.recommendedRamGb >= feature.hardware.minimumRamGb, `${feature.id} has a valid recommended RAM value`);
  }
  assert.deepEqual(dependencyCli.selectedComponents(
    { features: [{ id: 'core.image', required: true }, { id: 'video.ltx' }, { id: 'video.wan' }, { id: 'video.scail' }] },
    { 'video.ltx': true, 'video.wan': true, 'video.scail': true },
  ), ['image', 'krea2depth', 'upscale', 'video', 'faceid', 'wan', 'scail', 'scailinfinity']);
  assert.deepEqual(dependencyCli.selectedComponents(
    { features: [{ id: 'core.image', required: true }, { id: 'edit.klein4' }, { id: 'edit.klein9' }, { id: 'edit.qwen' }, { id: 'edit.krea2' }, { id: 'edit.krea2ref' }] },
    { 'edit.klein4': true, 'edit.klein9': true, 'edit.qwen': true, 'edit.krea2': true, 'edit.krea2ref': true },
  ), ['image', 'krea2depth', 'upscale', 'klein4', 'editoutpaint', 'klein9', 'smartmask', 'qwen', 'regional', 'krea2ref', 'krea2outpaint']);
  assert.deepEqual(dependencyCli.combineDiscovery(
    { registeredModelNames: ['a.safetensors'], modelRoots: ['D:/Models'], preferredModelsPath: 'D:/Models' },
    { registeredModelNames: ['a.safetensors', 'b.safetensors'], modelRoots: ['E:/Models'] },
  ), {
    registeredModelNames: ['a.safetensors', 'b.safetensors'],
    registeredModelCount: 2,
    modelRoots: ['D:/Models', 'E:/Models'],
    preferredModelsPath: 'D:/Models',
  });
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
  const engine = fs.readFileSync(path.join(root, 'installer', 'install.ps1'), 'utf8');
  assert.match(launcher, /installer\\uninstall\.ps1/i);
  assert.match(launcher, /ExecutionPolicy Bypass/i);
  assert.match(uninstaller, /Assert-SafeInstallRoot/);
  assert.match(uninstaller, /@\('mix-studio', 'mixbox-studio'\)/);
  assert.match(uninstaller, /ComfyUI.*Node\.js.*never removed/i);
  assert.match(uninstaller, /-RemoveData/);
  assert.match(uninstaller, /Type DELETE to continue/);
  assert.match(uninstaller, /Preserve-DataOutsideCheckout/);
  assert.match(uninstaller, /LOCALAPPDATA.*Mix Studio\\data/);
  assert.match(uninstaller, /mirrored export files are never removed/i);
  assert.match(uninstaller, /Copy-Item -LiteralPath \$InstallFile -Destination \$PreservedInstall/);
  assert.match(uninstaller, /Remove-Item -LiteralPath \$PreservedInstall -Force/);
  assert.match(uninstaller, /preserved setup profile will be removed/i);
  assert.match(uninstaller, /Start-Process -FilePath \$PowerShell/);
  assert.match(engine, /PreservedDataDir/);
  assert.match(engine, /Reusing preserved profiles, settings, and gallery data/);
});
