'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const {
  COMPONENTS,
  MODEL_ASSETS,
  NODE_PACKS,
  availableComponents,
  cleanRelative,
  downloadAsset,
  filterProtectedRuntimeRequirements,
  installNodePack,
  looksLikeCustomNodeFolder,
  modelIsRegistered,
  requirementsArgs,
  sameRepo,
} = require('../lib/dependency-installer');
const { comfyPort, restartStatus } = require('../lib/comfy-restart');

test('dependency catalog covers every enabled image and video family', () => {
  for (const component of ['image', 'krea2depth', 'krea2outpaint', 'editoutpaint', 'klein4', 'klein9', 'qwen', 'upscale', 'video', 'ltxcamera', 'videoedit', 'faceid', 'wan', 'eros', 'scail', 'scailinfinity', 'smartmask', 'regional']) {
    assert.ok(COMPONENTS[component], `${component} is installable`);
  }
  for (const group of ['image', 'krea2Depth', 'krea2Outpaint', 'klein4', 'klein9', 'qwen', 'upscale', 'ltx', 'ltxCamera', 'ltxEdit', 'faceid', 'wan', 'eros', 'scail']) {
    assert.ok(MODEL_ASSETS[group]?.length, `${group} has model downloads`);
  }
  assert.ok(Object.values(NODE_PACKS).every((pack) => pack.repo.startsWith('https://github.com/')));
  assert.ok(availableComponents().includes('smartmask'));
  assert.equal(MODEL_ASSETS.krea2Depth[0][1], 'loras');
  assert.match(MODEL_ASSETS.krea2Depth[0][2], /Patil\/Krea-2-depth-controlnet/);
  assert.equal(MODEL_ASSETS.krea2Depth[1][1], 'depthanything3');
  assert.match(MODEL_ASSETS.krea2Depth[1][2], /depth-anything\/DA3-LARGE-1\.1/);
  assert.equal(NODE_PACKS.krea2Control.folder, 'comfyui-krea2-controlnet');
  assert.equal(NODE_PACKS.depthAnything3.folder, 'ComfyUI-DepthAnythingV3');
  assert.equal(NODE_PACKS.krea2Edit.folder, 'comfyui-krea2edit');
  assert.match(MODEL_ASSETS.ltxCamera[0][2], /Cseti\/LTX2\.3-22B_IC-LoRA-Cameraman_v2/);
  assert.match(MODEL_ASSETS.krea2Outpaint[0][2], /conradlocke\/krea2-identity-edit/);
  assert.equal(MODEL_ASSETS.klein4.find((asset) => asset[0] === 'klein4ConsistencyLora')[1], 'loras');
  assert.match(MODEL_ASSETS.klein4.find((asset) => asset[0] === 'klein4ConsistencyLora')[2], /f2k_4B_consist_20260314\.safetensors/);
  assert.equal(MODEL_ASSETS.klein9.find((asset) => asset[0] === 'klein9ConsistencyLora')[1], 'loras');
  assert.match(MODEL_ASSETS.klein9.find((asset) => asset[0] === 'klein9ConsistencyLora')[2], /f2k_9B_lcs_consist_20260415\.safetensors/);
});

test('dependency paths stay inside ComfyUI model folders and trusted repos compare safely', () => {
  assert.equal(cleanRelative('Wan2.1\\model.safetensors'), path.join('Wan2.1', 'model.safetensors'));
  assert.throws(() => cleanRelative('../outside.safetensors'));
  assert.equal(sameRepo('git@github.com:PozzettiAndrea/ComfyUI-SAM3.git', 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git'), true);
  assert.equal(sameRepo('https://github.com/example/other.git', 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git'), false);
  assert.equal(modelIsRegistered('krea2_turbo_fp8_scaled.safetensors', new Set(['Krea2_Turbo_FP8_Scaled.safetensors'])), true);
  assert.equal(modelIsRegistered('Wan2.1\\model.safetensors', new Set(['wan2.1/model.safetensors'])), true);
});

test('a valid manually installed custom-node folder is reused without requiring Git metadata', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-unmanaged-node-'));
  const customNodesPath = path.join(rootDir, 'custom_nodes');
  const nodePath = path.join(customNodesPath, NODE_PACKS.kjnodes.folder);
  const reports = [];
  const commands = [];
  try {
    fs.mkdirSync(nodePath, { recursive: true });
    fs.writeFileSync(path.join(nodePath, '__init__.py'), '# manually installed KJNodes fixture\n');
    assert.equal(looksLikeCustomNodeFolder(nodePath), true);
    await installNodePack(NODE_PACKS.kjnodes, {
      customNodesPath,
      basePath: rootDir,
      pythonPath: 'python',
    }, (phase, message, detail) => reports.push({ phase, message, detail }), {
      run: async (...args) => { commands.push(args); return ''; },
    });
    assert.equal(commands.length, 0);
    assert.equal(reports[0].phase, 'existing-node');
    assert.equal(reports[0].detail.unmanaged, true);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('an empty non-Git folder is still rejected as a possible name collision', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-invalid-node-'));
  const customNodesPath = path.join(rootDir, 'custom_nodes');
  const nodePath = path.join(customNodesPath, NODE_PACKS.kjnodes.folder);
  try {
    fs.mkdirSync(nodePath, { recursive: true });
    assert.equal(looksLikeCustomNodeFolder(nodePath), false);
    await assert.rejects(
      installNodePack(NODE_PACKS.kjnodes, { customNodesPath, basePath: rootDir, pythonPath: 'python' }, () => {}),
      /does not look like a valid custom-node installation/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('registered ComfyUI models are reused even when they live outside the configured model root', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-dependency-reuse-'));
  let fetched = false;
  try {
    const result = await downloadAsset(
      ['unet', 'diffusion_models', 'https://example.test/Krea2_turbo_fp8_scaled.safetensors'],
      rootDir,
      { unet: 'krea2_turbo_fp8_scaled.safetensors' },
      () => {},
      {
        availableModelNames: ['Krea2_turbo_fp8_scaled.safetensors'],
        fetch: async () => { fetched = true; throw new Error('should not fetch'); },
      }
    );
    assert.equal(result.skipped, true);
    assert.equal(result.registered, true);
    assert.equal(fetched, false);
    assert.equal(fs.existsSync(result.destination), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('models in discovered external roots are reused while ComfyUI is stopped', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-dependency-roots-'));
  const destinationRoot = path.join(rootDir, 'destination');
  const sharedRoot = path.join(rootDir, 'shared');
  const existing = path.join(sharedRoot, 'diffusion_models', 'krea2_turbo_fp8_scaled.safetensors');
  let fetched = false;
  try {
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, 'existing model fixture');
    const result = await downloadAsset(
      ['unet', 'diffusion_models', 'https://example.test/krea2_turbo_fp8_scaled.safetensors'],
      destinationRoot,
      { unet: 'krea2_turbo_fp8_scaled.safetensors' },
      () => {},
      {
        availableModelRoots: [sharedRoot],
        fetch: async () => { fetched = true; throw new Error('should not fetch'); },
      }
    );
    assert.equal(result.skipped, true);
    assert.equal(result.externalRoot, true);
    assert.equal(result.destination, existing);
    assert.equal(fetched, false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('cancelling a model transfer removes its partial file and never installs it', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-dependency-cancel-'));
  const controller = new AbortController();
  try {
    const promise = downloadAsset(
      ['unet', 'diffusion_models', 'https://example.test/model.safetensors'],
      rootDir,
      { unet: 'model.safetensors' },
      () => {},
      {
        signal: controller.signal,
        fetch: async () => ({
          ok: true,
          headers: { get: () => '16' },
          body: { getReader: () => ({
            read: async () => {
              controller.abort();
              return { done: false, value: new Uint8Array([1, 2, 3, 4]) };
            },
          }) },
        }),
      }
    );
    await assert.rejects(promise, (error) => error.code === 'dependency_cancelled');
    const destination = path.join(rootDir, 'diffusion_models', 'model.safetensors');
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.existsSync(`${destination}.mixbox.part`), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('dependency routes run asynchronously and publish progress instead of holding the browser request open', () => {
  assert.match(server, /route === '\/api\/dependencies\/status'/);
  assert.match(server, /route === '\/api\/dependencies\/install'/);
  assert.match(server, /route === '\/api\/dependencies\/cancel'/);
  assert.match(server, /dependencyInstallController\.abort\(\)/);
  assert.match(server, /return json\(res, 202, \{ ok: true, install: dependencyInstallState \}\)/);
  assert.match(server, /updateDependencyInstallState\(/);
  assert.match(server, /broadcast\('dependencyInstall'/);
  assert.match(server, /await assertDesktopIsIdle\(\)/);
  assert.match(server, /qwenedit: \['qwen'\]/);
  assert.match(server, /klein: \['klein4', 'klein9'\]/);
  assert.match(fs.readFileSync(path.join(root, 'lib', 'dependency-installer.js'), 'utf8'), /downloadTotal/);
  assert.match(fs.readFileSync(path.join(root, 'lib', 'dependency-installer.js'), 'utf8'), /settings\[settingKey\] \|\| defaultFilename \|\| sourceName/);
});

test('ComfyUI restart is owner-only, queue-safe, and reports reconnect state', () => {
  assert.equal(comfyPort('http://127.0.0.1:8188'), 8188);
  assert.equal(comfyPort('http://localhost:9000'), 9000);
  const status = restartStatus({ comfy: { path: 'C:/ComfyUI', url: 'http://127.0.0.1:8188' } }, {
    platform: 'win32',
    existsSync(file) { return /(?:ComfyUI|run_nvidia_gpu\.bat|custom_nodes)$/.test(file); },
    env: {}, home: 'C:/Users/test',
  });
  assert.equal(status.canRestart, true);
  assert.match(server, /route === '\/api\/comfy\/restart'/);
  assert.match(server, /Only the owner profile can restart ComfyUI/);
  assert.match(server, /waitForComfyReconnect/);
});

test('Settings presents a compact dependency manager with progress and restart controls', () => {
  assert.match(html, /id="dependencyManagerCard"/);
  assert.match(html, /id="dependencyInstallMissing"/);
  assert.match(html, /id="dependencyCancelInstall"/);
  assert.match(html, /id="dependencyToggleAll"/);
  assert.match(html, /id="dependencyRepairMissing"/);
  assert.match(html, /id="dependencyRestartComfy"/);
  assert.match(html, /id="dependencyProgress"/);
  assert.match(app, /function renderDependencyManager\(\)/);
  assert.match(app, /function scheduleDependencyPoll\(\)/);
  assert.match(app, /Repair selected/);
  assert.match(app, /formatDependencyBytes/);
  assert.match(app, /selectedDependencyIds/);
  assert.match(app, /\/api\/dependencies\/cancel/);
  assert.match(app, /restart\.hidden = !state\.profileIsOwner/);
  assert.match(app, /restart\.disabled = busy \|\| !restartInfo\.canRestart/);
  assert.match(app, /Restart ComfyUI\?/);
  assert.match(css, /\.dependency-progress/);
  assert.match(css, /\.dependency-option\.selected/);
  assert.match(css, /\.dependency-cancel/);
  assert.match(css, /\.dependency-restart\.needed/);
  assert.match(css, /@keyframes dependencyProgress/);
});

test('node installs preserve unrelated ComfyUI packages and make a repair explicit', () => {
  const installer = fs.readFileSync(path.join(root, 'lib', 'dependency-installer.js'), 'utf8');
  const sam3 = fs.readFileSync(path.join(root, 'lib', 'sam3-installer.js'), 'utf8');
  assert.match(installer, /function requirementsArgs/);
  assert.doesNotMatch(installer, /pip', 'install', '--upgrade', '-r'/);
  assert.match(installer, /--force-reinstall', '--no-deps/);
  assert.match(installer, /snapshotPythonEnvironment/);
  assert.match(sam3, /--upgrade-strategy', 'only-if-needed'/);
  assert.doesNotMatch(sam3, /'--upgrade', '-r'/);
});

test('model readiness accepts ComfyUI DynamicCombo option lists', () => {
  assert.match(server, /spec\[0\] === 'COMBO' && Array\.isArray\(spec\[1\]\?\.options\)/);
  assert.match(server, /consistencyLora: modelStatus\(info, 'LoraLoaderModelOnly', 'lora_name', settings\.klein4ConsistencyLora/);
  assert.match(server, /consistencyLora: modelStatus\(info, 'LoraLoaderModelOnly', 'lora_name', settings\.klein9ConsistencyLora/);
});

test('node installs constrain the existing environment instead of replacing runtime packages', () => {
  assert.deepEqual(
    requirementsArgs('requirements.txt', false, { constraintFile: 'before-install.freeze.txt' }).slice(-4),
    ['--constraint', 'before-install.freeze.txt', '-r', 'requirements.txt']
  );
  assert.equal(requirementsArgs('requirements.txt', true, { constraintFile: 'before-install.freeze.txt' }).includes('--constraint'), false);
});

test('repair requirements never reinstall ComfyUI runtime packages from PyPI', () => {
  const filtered = filterProtectedRuntimeRequirements([
    'torch', 'torchvision>=0.20', 'torchaudio==2.0', 'numpy',
    'opencv-python', 'opencv-python-headless>=4.9', 'opencv-contrib-python',
    'diffusers>=0.33.1', 'omegaconf>=2.3.0', '# comment', '',
  ].join('\n'));
  assert.doesNotMatch(filtered, /torch|numpy|opencv/i);
  assert.match(filtered, /diffusers>=0.33.1/);
  assert.match(filtered, /omegaconf>=2.3.0/);
});
