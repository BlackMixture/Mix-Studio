'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { portableBootstrapConfig } = require('../installer/bootstrap');
const dependencyCli = require('../installer/install-dependencies');
const {
  QUICK_SETUP_COMPONENTS,
  combinedHardwareFit,
  componentHardwareGuidance,
  normalizeOptionalDirectory,
  normalizeSetupUrl,
  portableSetupConfig,
} = require('../lib/setup-guide');

const root = path.resolve(__dirname, '..');

test('portable installer starts the web app before generation setup', () => {
  const launcher = fs.readFileSync(path.join(root, 'install.bat'), 'utf8');
  const start = fs.readFileSync(path.join(root, 'start.bat'), 'utf8');
  assert.match(launcher, /if exist "%~dp0installer\\bootstrap\.js" goto run_app/i);
  assert.match(launcher, /winget (install|upgrade) --id OpenJS\.NodeJS\.LTS/i);
  assert.match(launcher, /installer\\bootstrap\.js/i);
  assert.match(launcher, /start "Mix Studio" \/min "%~dp0start\.bat"/i);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:3300\//i);
  assert.doesNotMatch(launcher, /install-ui\.ps1/i);
  assert.match(start, /title Mix Studio/i);
  assert.match(start, /MIXBOX_RESTART_MODE=batch/);
  assert.match(start, /MIX_STUDIO_NODE/);
  assert.doesNotMatch(start, /MixBox Studio/);
});

test('standalone installer downloads the official Git checkout before opening the app', () => {
  const launcher = fs.readFileSync(path.join(root, 'install.bat'), 'utf8');
  assert.match(launcher, /https:\/\/github\.com\/BlackMixture\/Mix-Studio\.git/);
  assert.match(launcher, /winget install --id Git\.Git/);
  assert.match(launcher, /clone --branch main --single-branch/);
  assert.match(launcher, /%USERPROFILE%\\Mix Studio/);
  assert.match(launcher, /start "" "%MIX_STUDIO_HOME%\\install\.bat"/i);
  assert.match(launcher, /target folder already exists but is not a Mix Studio Git checkout/i);
  assert.match(launcher, /prepare_existing_target/);
  assert.match(launcher, /Preserving gallery data left by an earlier uninstall/);
  assert.match(launcher, /LOCALAPPDATA%\\Mix Studio\\data/);
});

test('README presents the product positioning, contributions, and hardware credits', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /A clean, responsive AI workspace built on ComfyUI\./);
  assert.match(readme, /Run highly tuned image and video workflows flawlessly from your desktop or your phone\./);
  assert.match(readme, /Features curated setups for Krea 2, Flux Klein, Qwen Edit, LTX 2\.3, Wan 2\.2, and SCAIL 2\./);
  assert.match(readme, /## Acknowledgments & Attribution/);
  assert.match(readme, /## Contribute a Workflow/);
  assert.match(readme, /### What We Look For/);
  assert.match(readme, /### How to Submit/);
  assert.match(readme, /github\.com\/BlackMixture\/Mix-Studio\/discussions/);
  assert.match(readme, /github\.com\/BlackMixture\/Mix-Studio\/pulls/);
  assert.match(readme, /\*\*ComfyUI:\*\* The node-based backbone/);
  assert.match(readme, /Black Forest Labs \(Flux 2\), Lightricks \(LTX 2\.3\), Krea AI, and the Wan team/);
  assert.match(readme, /SCAIL 2, 10Eros, SeedVR2, Ultimate SD, and Depth Anything V3/);
  assert.match(readme, /\*\*Dell\*\* for generously sponsoring the Dell Pro Max T2 Tower/);
  assert.match(readme, /\*\*NVIDIA RTX PRO 6000 Blackwell GPU with 96 GB VRAM\*\*/);
});

test('GitHub Pages publishes the canonical installer from a branded download page', () => {
  const page = fs.readFileSync(path.join(root, 'docs', 'download', 'index.html'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  const localLogo = fs.readFileSync(path.join(root, 'docs', 'download', 'modatory-logo.svg'), 'utf8');
  const localWordmark = fs.readFileSync(path.join(root, 'docs', 'download', 'mix-studio-wordmark.svg'), 'utf8');
  const localSources = [...page.matchAll(/\ssrc="\.\/([^"?#]+)"/g)].map((match) => match[1]);
  assert.match(page, /Download for Windows/);
  assert.match(page, /href="\.\/install\.bat" download="install\.bat"/);
  assert.equal((page.match(/platform-icon platform-windows/g) || []).length, 4);
  assert.match(page, /macOS support coming soon/);
  assert.doesNotMatch(page, /Setup continues inside Mix Studio/);
  assert.doesNotMatch(page, /The installer gets you into Mix Studio before asking you to choose models or workflows\./);
  assert.match(page, /class="download quick-download"/);
  assert.ok(page.indexOf('id="mobile-first"') < page.indexOf('id="quick-start"'));
  assert.ok(page.indexOf('id="quick-start"') < page.indexOf('id="features"'));
  assert.ok(page.indexOf('id="workspace-title"') < page.indexOf('id="setup-details"'));
  assert.ok(page.indexOf('id="setup-details"') < page.indexOf('class="closing"'));
  assert.doesNotMatch(page, /Windows · NVIDIA · Local generation/);
  assert.match(page, /Quick setup/);
  assert.match(page, /install only that workflow/i);
  assert.match(page, /Desktop \+ mobile/);
  assert.match(page, /Designed for every screen/);
  assert.match(page, /same responsive UI on desktop or phone/);
  assert.doesNotMatch(page, /in your pocket/);
  assert.match(page, /Created by Black Mixture/);
  assert.match(page, /black-mixture-logomark\.png/);
  assert.match(page, /black-mixture-spectrum\.png/);
  assert.match(page, /nate-dwarika\.webp/);
  assert.match(page, /chriselle-dwarika\.webp/);
  assert.match(page, /Nate Dwarika/);
  assert.match(page, /Chriselle Dwarika/);
  assert.match(page, /\.creator-founders \{[^}]*gap: 0;[^}]*padding: 0;[^}]*background: #f3c60c;/);
  assert.match(page, /https:\/\/www\.blackmixture\.com\//);
  assert.match(page, /https:\/\/www\.youtube\.com\/@blackmixture/);
  assert.match(page, /https:\/\/www\.instagram\.com\/blackmixture\//);
  assert.match(page, /Black Mixture © 2026/);
  assert.match(page, /modatory-logo\.svg/);
  assert.equal(localLogo, fs.readFileSync(path.join(root, 'public', 'modatory-logo.svg'), 'utf8'));
  assert.match(localWordmark, /fill="#ffffff"/);
  assert.doesNotMatch(localWordmark, /fill="#000000"/);
  for (const source of localSources) {
    assert.ok(fs.existsSync(path.join(root, 'docs', 'download', source)), `download page asset exists: ${source}`);
  }
  assert.match(page, /id="features"/);
  assert.match(page, /id="benchmarks"/);
  assert.match(page, /Benchmarked by workflow/);
  assert.match(page, /Top model by job/);
  assert.match(page, /VRAM requirements/);
  assert.match(page, /VRAM capacity only/);
  assert.match(page, /A clean, responsive AI workspace built on ComfyUI\./);
  assert.match(page, /Run highly tuned image and video workflows flawlessly from your desktop or your phone\./);
  assert.match(page, /Features curated setups for Krea 2, Flux Klein, Qwen Edit, LTX 2\.3, Wan 2\.2, and SCAIL 2\./);
  assert.match(page, /Most local tools chain you to a desk\./);
  assert.match(page, /full creative control from anywhere\./);
  assert.match(page, /RTX PRO 6000 Blackwell · 96 GB VRAM · Jul 2026/);
  assert.match(page, /RTX PRO 6000 Blackwell with 96 GB VRAM/);
  assert.doesNotMatch(page, /Benchmarks and stress-testing powered/);
  assert.doesNotMatch(page, /benchmark-sponsor/);
  assert.match(page, /brand\/nvidia-logo-horizontal\.png/);
  assert.match(page, /brand\/dell-logo\.png/);
  assert.match(page, /brand\/black-mixture-wordmark\.png/);
  const footerMarkup = page.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/)?.[1] || '';
  assert.equal((footerMarkup.match(/class="footer-brand(?:\s|")/g) || []).length, 6);
  assert.ok(footerMarkup.indexOf('Black Mixture') < footerMarkup.indexOf('ComfyUI'));
  assert.match(footerMarkup, /ComfyUI/);
  assert.match(footerMarkup, /Tailscale/);
  assert.match(footerMarkup, /NVIDIA/);
  assert.match(footerMarkup, /Dell/);
  assert.match(footerMarkup, /Black Mixture/);
  assert.match(footerMarkup, /Mix Studio/);
  assert.match(page, /Works with ComfyUI, Tailscale, and NVIDIA/);
  assert.match(page, /Measured Timing/);
  assert.doesNotMatch(page, />12 min</);
  assert.doesNotMatch(page, />16 rec</);
  assert.doesNotMatch(page, /Evaluation loop/);
  assert.doesNotMatch(page, /Repeatable prompts, measured tradeoffs/);
  assert.match(page, /Krea 2 Turbo/);
  assert.match(page, /Flux 2 Klein 9B/);
  assert.match(page, /id="quick-start"/);
  assert.match(page, /id="faq-title"/);
  assert.match(page, /Is Mix Studio free\?/);
  assert.match(page, /Can I use my ComfyUI install\?/);
  assert.match(page, /desktop, tablet, or phone/);
  assert.match(page, /Does my work stay local\?/);
  assert.doesNotMatch(page, /hardware-marker minimum"><b>16 GB/);
  assert.doesNotMatch(page, /hardware-marker recommended"><b>16 GB/);
  assert.match(page, /mix-studio-create\.webp/);
  assert.match(page, /mix-studio-mobile\.png/);
  assert.match(page, /aria-label="Hold to focus the desktop Mix Studio preview"/);
  assert.match(page, /aria-label="Hold to focus the mobile Mix Studio preview"/);
  assert.match(page, /preview\.addEventListener\("pointerup",[\s\S]*?releasePreview\(\);/);
  assert.match(page, /preview\.addEventListener\("keyup",[\s\S]*?releasePreview\(\);/);
  assert.match(page, /preview\.setPointerCapture\(event\.pointerId\)/);
  assert.match(page, /preview\.hasPointerCapture\?\.\(pointerId\)/);
  assert.match(page, /phone-preview\.is-holding \{ filter: brightness\(1\.08\); \}/);
  assert.match(page, /preview\.addEventListener\("blur", \(\) => \{[\s\S]*?if \(!pointerState\) releasePreview\(\);/);
  assert.doesNotMatch(page, /requested && requested !== activeFocus/);
  assert.doesNotMatch(page, /shouldClick/);
  assert.match(page, /mix-studio-profiles-live\.png/);
  assert.match(page, /mix-studio-dependencies\.png/);
  assert.match(page, /scail-flower-world\.mp4/);
  assert.match(page, /scail-racetrack\.mp4/);
  assert.match(page, /scail-animal-replacement\.mp4/);
  assert.match(page, /scail-season-habitat\.mp4/);
  assert.match(page, /ltx-prism-storm\.mp4/);
  assert.match(page, /ltx-character-performance\.mp4/);
  assert.match(page, /ltx-stylized-action\.mp4/);
  assert.match(page, /ltx-rain-portrait\.mp4/);
  assert.match(page, /ltx-mech-battlefield\.mp4/);
  assert.match(page, /scail-hand-fantasy\.mp4/);
  assert.match(page, /scail-wireframe-mech\.mp4/);
  assert.match(page, /ltx-shark\.mp4/);
  assert.match(page, /create-lion\.jpg/);
  assert.match(page, /create-mercedes\.jpg/);
  assert.match(page, /create-corridor\.jpg/);
  assert.match(page, /create-squid\.jpg/);
  assert.match(page, /upscale-before\.jpg/);
  assert.match(page, /upscale-after\.jpg/);
  assert.match(page, /\.upscale-label \{[^}]*bottom: 12px;/);
  assert.doesNotMatch(page, /\.upscale-label \{[^}]*top: 12px;/);
  assert.match(page, /ltx-ruins\.mp4/);
  assert.match(page, /ltx-dreamscape\.mp4/);
  assert.match(page, /ltx-interior\.mp4/);
  assert.match(page, /ltx-wrestling\.mp4/);
  assert.match(page, /Arena action/);
  assert.match(page, /Fourteen rotating SCAIL 2 and LTX 2\.3 video examples/);
  assert.match(page, /data-video-showcase/);
  assert.match(page, /data-reel-previous/);
  assert.match(page, /data-reel-next/);
  assert.match(page, /ltx-dreamscape\.mp4", previewEnd: 3/);
  assert.doesNotMatch(page, /Shark breach/);
  assert.match(page, /edit-aging-motion\.mp4/);
  assert.match(page, /data-loop-end="2"/);
  assert.match(page, /region-island\.png/);
  assert.match(page, /Snow biome/);
  assert.match(page, /Lava volcano/);
  assert.doesNotMatch(page, /region-map\.jpg/);
  assert.match(page, /region-monster\.jpg/);
  assert.doesNotMatch(page, /data-ltx-reel/);
  assert.doesNotMatch(page, /data-scail-reel/);
  assert.match(page, /class="region-reveal"/);
  assert.match(page, /outpaint-source\.jpg/);
  assert.match(page, /class="outpaint-sequence/);
  assert.match(page, /class="library-reel/);
  assert.doesNotMatch(page, /class="edit-motion-result/);
  assert.equal((page.match(/class="gen-card paired-media"/g) || []).length, 2);
  assert.doesNotMatch(page, /01 Original/);
  assert.doesNotMatch(page, /02 Edit/);
  assert.match(page, /class="showcase showcase-compact"/);
  assert.doesNotMatch(page, /live-ltx-bicycle\.mp4/);
  assert.doesNotMatch(page, /Complex workflows, made direct/);
  assert.match(page, /class="focus-window/);
  assert.doesNotMatch(page, /class="laptop/);
  assert.match(page, /\.brand \{ flex: 0 0 auto;/);
    assert.match(page, /\.brand-wordmark \{[^}]*flex: 0 0 150px;/);
    assert.match(page, /@media \(max-width: 940px\)/);
    assert.match(page, /@media \(max-width: 760px\)/);
    assert.match(page, /Use your ComfyUI and models/);
    assert.match(page, /auto-detect your current ComfyUI install and downloaded models/);
    assert.match(page, /comfyui-logo\.svg/);
  assert.match(page, /id="mobile-first"/);
  assert.match(page, /depth guidance/);
  assert.match(page, /Continue Edit/);
  assert.match(page, /lipsync audio/);
  assert.match(page, /Leading models\. Optimized settings\./);
  assert.match(page, /workflow-tested defaults/);
  assert.match(page, /detects GPU memory and system RAM/);
  assert.match(page, /difficult choice/);
  assert.match(page, /already registered through ComfyUI/);
  assert.match(page, /reveal, zoom, and pan/);
  assert.match(page, /tailscale\.com\/download/);
  assert.match(page, /Your studio/);
  assert.doesNotMatch(page, /—/);
  assert.match(workflow, /cp install\.bat _site\/install\.bat/);
  assert.match(workflow, /cp docs\/download\/mix-studio-wordmark\.svg _site\/mix-studio-wordmark\.svg/);
  assert.match(workflow, /cp docs\/download\/mix-studio-create\.webp _site\/mix-studio-create\.webp/);
  assert.match(workflow, /cp docs\/download\/comfyui-logo\.svg _site\/comfyui-logo\.svg/);
  assert.match(workflow, /cp -R docs\/download\/brand _site\/brand/);
  assert.match(workflow, /cp docs\/download\/mix-studio-edit\.png _site\/mix-studio-edit\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-mobile\.png _site\/mix-studio-mobile\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-scail\.png _site\/mix-studio-scail\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-library\.png _site\/mix-studio-library\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-profiles-live\.png _site\/mix-studio-profiles-live\.png/);
  assert.match(workflow, /cp docs\/download\/mix-studio-dependencies\.png _site\/mix-studio-dependencies\.png/);
  assert.match(workflow, /cp -R docs\/download\/media _site\/media/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});

test('minimal bootstrap preserves an uninstalled gallery and opens setup in app', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-bootstrap-'));
  const checkout = path.join(temp, 'checkout');
  const localAppData = path.join(temp, 'local-app-data');
  const preservedRoot = path.join(localAppData, 'Mix Studio');
  const preservedData = path.join(preservedRoot, 'data');
  fs.mkdirSync(checkout, { recursive: true });
  fs.mkdirSync(preservedData, { recursive: true });
  fs.writeFileSync(path.join(preservedRoot, 'install.json'), JSON.stringify({
    dataDir: preservedData,
    comfy: { path: 'D:\\ComfyUI', modelsPath: 'E:\\Models', url: 'http://127.0.0.1:8188' },
    customValue: 'preserved',
  }));
  try {
    const config = portableBootstrapConfig(checkout, {
      env: { LOCALAPPDATA: localAppData },
      now: '2026-07-13T00:00:00.000Z',
    });
    assert.equal(config.dataDir, preservedData);
    assert.equal(config.comfy.path, 'D:\\ComfyUI');
    assert.equal(config.comfy.modelsPath, 'E:\\Models');
    assert.equal(config.customValue, 'preserved');
    assert.equal(config.setup.experience, 'in-app');
    assert.equal(config.update.provider, 'git');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('generation setup lives in the web app and gates only a generation attempt', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const style = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  for (const id of [
    'initialSetupSheet', 'setupTabConnect', 'setupTabInstall', 'setupTabFinish',
    'setupPaneConnect', 'setupPaneInstall', 'setupPaneFinish', 'setupQuickStart',
    'setupCurrentWorkflow', 'setupFullGuide', 'setupInstallComfy', 'setupUseDetected',
    'setupBrowseComfy', 'setupBrowseComfyDetails', 'setupBrowseModels', 'setupComfyPath', 'setupModelsPath',
    'setupHardwareSummary', 'setupShowDetails', 'setupDependencyAccess', 'setupDependencyAccessLink',
    'setupCancel', 'setupBack', 'setupNext',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /class="setup-tabs" role="tablist"/);
  assert.equal((html.match(/role="tabpanel"/g) || []).length >= 3, true);
  assert.match(app, /async function ensureGenerationSetup\(\)/);
  assert.match(app, /if \(!\(await ensureGenerationSetup\(\)\)\) return/);
  assert.match(app, /function setSetupStep\(step/);
  assert.match(app, /\/api\/setup\/browse/);
  assert.match(app, /\/api\/setup\/comfy\/cancel/);
  assert.match(app, /\/api\/dependencies\/cancel/);
  assert.match(app, /function conciseSetupError\(value\)/);
  assert.match(app, /renderDependencyAccess\('#setupDependencyAccess', '#setupDependencyAccessLink', operationState\)/);
  assert.match(app, /This model needs Hugging Face access before installation can continue\./);
  assert.match(app, /showErrorDetail\(setupOperationDiagnostic, 'Setup diagnostic'\)/);
  assert.match(app, /quick\.hidden = !!setupContextComponents\.length \|\| !quickMissing\.length/);
  assert.match(app, /connectionChoicesHidden = !!comfy\.connected \|\| nodeSetupActive/);
  assert.match(style, /\.setup-input-row \{[^}]*grid-template-columns: minmax\(0,1fr\) 40px/);
  assert.match(app, /askConfirm\(\{[\s\S]{0,360}out-of-memory error/);
  assert.match(app, /setupAutoRestart[\s\S]{0,900}\/api\/comfy\/restart/);
  assert.match(style, /\.setup-panel \{[\s\S]{0,500}background: #000;/);
  assert.match(style, /\.setup-stage \{[\s\S]{0,180}overflow-y: auto/);
  assert.match(server, /\/api\/setup\/status/);
  assert.match(server, /\/api\/setup\/connection/);
  assert.match(server, /\/api\/setup\/browse/);
  assert.match(server, /\/api\/setup\/comfy\/install/);
  assert.match(server, /\/api\/setup\/comfy\/cancel/);
  assert.match(server, /taskkill[\s\S]{0,120}'\/T'[\s\S]{0,80}'\/F'/);
  assert.match(server, /Only the owner profile can configure the generation desktop/);
});

test('in-app setup installs official ComfyUI and curated dependency groups', () => {
  const helper = fs.readFileSync(path.join(root, 'installer', 'install-comfy.ps1'), 'utf8');
  const hardware = fs.readFileSync(path.join(root, 'installer', 'hardware-profile.ps1'), 'utf8');
  const discovery = fs.readFileSync(path.join(root, 'installer', 'model-discovery.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'installer', 'feature-manifest.json'), 'utf8'));
  const ltx = manifest.features.find((feature) => feature.id === 'video.ltx');
  const image = manifest.features.find((feature) => feature.id === 'core.image');
  assert.match(helper, /https:\/\/download\.comfy\.org\/windows\/nsis\/x64/);
  assert.match(helper, /Get-AuthenticodeSignature/);
  assert.match(helper, /SignatureStatus\]::Valid/);
  assert.match(helper, /Get-ComfyDesktopBase/);
  assert.match(discovery, /\/object_info/);
  assert.match(discovery, /extra_model_paths\.yaml/);
  assert.match(discovery, /registeredModelNames/);
  assert.match(hardware, /nvidia-smi\.exe/);
  assert.match(hardware, /minimumVramGb/);
  assert.match(hardware, /Difficult on this PC/);
  assert.match(image.label, /depth/i);
  assert.match(image.label, /style/i);
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
  ), ['image', 'krea2depth', 'krea2style', 'upscale', 'video', 'faceid', 'wan', 'scail', 'scailinfinity']);
  assert.deepEqual(dependencyCli.selectedComponents(
    { features: [{ id: 'core.image', required: true }, { id: 'edit.klein4' }, { id: 'edit.klein9' }, { id: 'edit.qwen' }, { id: 'edit.krea2' }, { id: 'edit.krea2ref' }] },
    { 'edit.klein4': true, 'edit.klein9': true, 'edit.qwen': true, 'edit.krea2': true, 'edit.krea2ref': true },
  ), ['image', 'krea2depth', 'krea2style', 'upscale', 'klein4', 'editoutpaint', 'klein9', 'smartmask', 'qwen', 'regional', 'krea2ref', 'krea2outpaint']);
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

test('standalone dependency setup gates only Krea INT8 on incompatible ComfyUI', async () => {
  const runtime = { comfy: { url: 'http://127.0.0.1:8188', path: 'C:\\ComfyUI' } };
  const unsupported = async () => ({ version: '0.26.9', minimumVersion: '0.27.0', supported: false });
  await assert.rejects(
    dependencyCli.verifyNativeInt8Install({
      variant: 'int8-convrot', components: ['image'], runtime, detectCompatibility: unsupported,
    }),
    (error) => error.code === 'comfy_int8_update_required' && /FP8 variant/.test(error.message)
  );
  assert.equal(await dependencyCli.verifyNativeInt8Install({
    variant: 'fp8', components: ['image'], runtime, detectCompatibility: unsupported,
  }), null);
  assert.equal(await dependencyCli.verifyNativeInt8Install({
    variant: 'int8-convrot', components: ['wan'], runtime, detectCompatibility: unsupported,
  }), null);
});

test('hardware guidance rates recommended, offload, and difficult model families', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'installer', 'feature-manifest.json'), 'utf8'));
  const info = (vram, ram) => ({
    gpu: { available: true, devices: [{ name: 'RTX Test', memoryBytes: vram * (1024 ** 3) }] },
    memory: { totalBytes: ram * (1024 ** 3) },
    disk: { freeBytes: 500 * (1024 ** 3) },
  });
  const recommended = componentHardwareGuidance(manifest, info(24, 64));
  const limited = componentHardwareGuidance(manifest, info(12, 24));
  const fourGb = componentHardwareGuidance(manifest, info(4, 24));
  const difficult = componentHardwareGuidance(manifest, info(8, 16));
  assert.equal(recommended.image.level, 'recommended');
  assert.equal(limited.image.level, 'limited');
  assert.equal(fourGb.klein4.level, 'limited');
  assert.equal(fourGb.image.level, 'difficult');
  assert.equal(combinedHardwareFit(['klein4'], fourGb).level, 'limited');
  assert.equal(difficult.image.level, 'difficult');
  assert.equal(combinedHardwareFit(QUICK_SETUP_COMPONENTS, difficult).level, 'difficult');
});

test('portable setup validates connection input and preserves machine settings', () => {
  assert.equal(normalizeSetupUrl('http://127.0.0.1:8188/'), 'http://127.0.0.1:8188');
  assert.throws(() => normalizeSetupUrl('ftp://example.test'), /http:\/\/ or https:\/\//);
  assert.throws(() => normalizeOptionalDirectory('relative/models', 'Models folder'), /absolute/);
  const config = portableSetupConfig(root, {
    dataDir: path.join(root, 'data'),
    comfy: {},
  }, {
    path: path.join(root, 'fake-comfy'),
    modelsPath: path.join(root, 'fake-models'),
    url: 'http://localhost:8188/',
    requireExisting: false,
  });
  assert.equal(config.appId, 'mix-studio');
  assert.equal(config.comfy.url, 'http://localhost:8188');
  assert.equal(config.setup.experience, 'in-app');
});

test('portable checkout has a conservative uninstaller entry point', () => {
  const launcher = fs.readFileSync(path.join(root, 'uninstall.bat'), 'utf8');
  const uninstaller = fs.readFileSync(path.join(root, 'installer', 'uninstall.ps1'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(root, 'installer', 'bootstrap.js'), 'utf8');
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
  assert.match(bootstrap, /preservedData/);
  assert.match(bootstrap, /preservedInstallFile/);
});
