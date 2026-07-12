'use strict';

/*
 * The dependency catalog is deliberately code-owned rather than learned from
 * arbitrary workflow JSON. Every network source below is reviewed, while the
 * installer itself only writes below the configured ComfyUI folders.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { sam3InstallStatus } = require('./sam3-installer');

const hf = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;

const NODE_PACKS = Object.freeze({
  sam3: { label: 'ComfyUI SAM3', folder: 'ComfyUI-SAM3', repo: 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git' },
  kjnodes: { label: 'KJNodes', folder: 'ComfyUI-KJNodes', repo: 'https://github.com/kijai/ComfyUI-KJNodes.git' },
  rebalance: { label: 'Conditioning Rebalance', folder: 'ComfyUI-Conditioning-Rebalance', repo: 'https://github.com/nova452/ComfyUI-Conditioning-Rebalance.git' },
  seedvr2: { label: 'SeedVR2 Video Upscaler', folder: 'ComfyUI-SeedVR2_VideoUpscaler', repo: 'https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler.git' },
  ultimate: { label: 'Ultimate SD Upscale', folder: 'ComfyUI_UltimateSDUpscale', repo: 'https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git' },
  vhs: { label: 'Video Helper Suite', folder: 'ComfyUI-VideoHelperSuite', repo: 'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git' },
  rife: { label: 'Frame Interpolation', folder: 'ComfyUI-Frame-Interpolation', repo: 'https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git' },
  bfs: { label: 'BFS Nodes', folder: 'ComfyUI-BFSNodes', repo: 'https://github.com/alisson-anjos/ComfyUI-BFSNodes.git' },
  scailInfinity: { label: 'SCAIL 2 Infinity', folder: 'comfyui-scail2-infinity', repo: 'https://github.com/collbroGTR/comfyui-scail2-infinity.git' },
  regional: { label: 'Krea 2 Regional MultiLoRA', folder: 'ComfyUI-Krea2Regional-MultiLoRA', repo: 'https://github.com/FedorShcherbakov/ComfyUI-Krea2Regional-MultiLoRA.git' },
  krea2Control: { label: 'Krea 2 ControlNet', folder: 'comfyui-krea2-controlnet', repo: 'https://github.com/facok/comfyui-krea2-controlnet.git' },
  depthAnything3: { label: 'Depth Anything V3', folder: 'ComfyUI-DepthAnythingV3', repo: 'https://github.com/PozzettiAndrea/ComfyUI-DepthAnythingV3.git' },
  krea2Edit: { label: 'Krea 2 Identity Edit', folder: 'comfyui-krea2edit', repo: 'https://github.com/lbouaraba/comfyui-krea2edit.git' },
});

/* Each asset targets the same setting key the app uses at generation time. */
const MODEL_ASSETS = Object.freeze({
  image: [
    ['unet', 'diffusion_models', hf('Comfy-Org/Krea-2', 'diffusion_models/krea2_turbo_fp8_scaled.safetensors')],
    ['krea2RawUnet', 'diffusion_models', hf('Comfy-Org/Krea-2', 'diffusion_models/krea2_raw_fp8_scaled.safetensors')],
    ['krea2TurboLora', 'loras', hf('Comfy-Org/Krea-2', 'loras/krea2_turbo_lora_rank_64_bf16.safetensors')],
    ['clip', 'text_encoders', hf('cusiman/Huihui-Qwen3-VL-4B-Instruct-abliterated-comfy', 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors')],
    ['vae', 'vae', hf('Comfy-Org/Krea-2', 'vae/qwen_image_vae.safetensors')],
  ],
  krea2Depth: [
    ['krea2DepthLora', 'loras', hf('Patil/Krea-2-depth-controlnet', 'depth-control-lora.safetensors')],
    ['depthAnythingV3Model', 'depthanything3', hf('depth-anything/DA3-LARGE-1.1', 'model.safetensors'), 'da3_large.safetensors'],
  ],
  krea2Outpaint: [
    ['krea2OutpaintLora', 'loras', hf('conradlocke/krea2-identity-edit', 'krea2_identity_edit_v1_1_r128.safetensors')],
  ],
  klein4: [
    ['klein4Unet', 'diffusion_models', hf('black-forest-labs/FLUX.2-klein-4B', 'flux-2-klein-4b.safetensors')],
    ['klein4Clip', 'text_encoders', hf('Comfy-Org/vae-text-encorder-for-flux-klein-4b', 'split_files/text_encoders/qwen_3_4b.safetensors')],
    ['klein4ConsistencyLora', 'loras', hf('lrzjason/Consistance_Edit_Lora', 'f2k_4B_consist_20260314.safetensors')],
    ['kleinVae', 'vae', hf('Comfy-Org/flux2-dev', 'split_files/vae/flux2-vae.safetensors')],
  ],
  klein9: [
    ['klein9Unet', 'diffusion_models', hf('black-forest-labs/FLUX.2-klein-9b-fp8', 'flux-2-klein-9b-fp8.safetensors')],
    ['klein9Clip', 'text_encoders', hf('Comfy-Org/flux2-klein-9B', 'split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors')],
    ['klein9ConsistencyLora', 'loras', hf('lrzjason/Consistance_Edit_Lora', 'f2k_9B_lcs_consist_20260415.safetensors')],
    ['kleinVae', 'vae', hf('Comfy-Org/flux2-dev', 'split_files/vae/flux2-vae.safetensors')],
  ],
  qwen: [
    ['qwenEditUnet', 'diffusion_models', hf('Comfy-Org/Qwen-Image-Edit_ComfyUI', 'split_files/diffusion_models/qwen_image_edit_2511_bf16.safetensors')],
    ['qwenEditClip', 'text_encoders', hf('Comfy-Org/Qwen-Image_ComfyUI', 'split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors')],
    ['qwenEditLora', 'loras', hf('art1455/Qwen2511', 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors')],
    ['qwenEditAnglesLora', 'loras', hf('art1455/Qwen2511', 'qwen_image_edit_2511_multiple-angles-lora.safetensors')],
  ],
  upscale: [
    ['seedvr2Dit', 'SEEDVR2', hf('Comfy-Org/SeedVR2', 'dit/seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors')],
    ['seedvr2Vae', 'SEEDVR2', hf('Comfy-Org/SeedVR2', 'vae/ema_vae_fp16.safetensors')],
  ],
  ltx: [
    ['ltxCkpt', 'checkpoints', hf('Lightricks/LTX-2.3-fp8', 'ltx-2.3-22b-dev-fp8.safetensors')],
    ['ltxDistilledLora', 'loras', hf('Lightricks/LTX-2.3', 'ltx-2.3-22b-distilled-lora-384.safetensors')],
    ['ltxTextEncoder', 'text_encoders', hf('Lightricks/LTX-2.3', 'gemma_3_12B_it_fp4_mixed.safetensors')],
    ['ltxGemmaLora', 'loras', hf('Lightricks/LTX-2.3', 'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors')],
    ['ltxUpscaler', 'latent_upscale_models', hf('Lightricks/LTX-2.3', 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors')],
  ],
  ltxEdit: [
    ['ltxEditLora', 'loras', hf('Kijai/LTX-2.3-Edit-Anything', 'edit_anything_v1.1_r256.safetensors')],
  ],
  faceid: [
    ['ltxFaceIdLora', 'loras', hf('Kijai/LTX-2.3-FaceID', 'Best_FaceID_v1.0_LoRA.safetensors')],
    ['ltxFaceIdDistilledLora', 'loras', hf('Lightricks/LTX-2.3', 'ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors')],
  ],
  wan: [
    ['wanHighUnet', 'diffusion_models', hf('Wan-AI/Wan2.2-I2V-A14B', 'diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors')],
    ['wanLowUnet', 'diffusion_models', hf('Wan-AI/Wan2.2-I2V-A14B', 'diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors')],
    ['wanClip', 'text_encoders', hf('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors')],
    ['wanVae', 'vae', hf('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/vae/wan_2.1_vae.safetensors')],
    ['wanHighLora', 'loras', hf('lightx2v/Wan2.2-Lightning', 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors')],
    ['wanLowLora', 'loras', hf('lightx2v/Wan2.2-Lightning', 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors')],
  ],
  eros: [
    ['erosCkpt', 'checkpoints', hf('Tridae/ErosDeployment_ComfyUI', 'checkpoints/10Eros_v1.2_fp8mixed_learned.safetensors')],
    ['erosTextEncoder', 'text_encoders', hf('Tridae/ErosDeployment_ComfyUI', 'text_encoders/gemma-3-12b-it-ablit-norms-biproj-fp8mixed.safetensors')],
    ['erosDmdLora', 'loras', hf('Tridae/ErosDeployment_ComfyUI', 'loras/LTX2.3_DMD_reshaped_r256.safetensors')],
  ],
  scail: [
    ['scailUnet', 'diffusion_models', hf('Comfy-Org/SCAIL-2', 'diffusion_models/wan2.1_14B_SCAIL_2_fp8_scaled.safetensors')],
    ['scailLora', 'loras', hf('Comfy-Org/SCAIL-2', 'loras/Wan2.1/Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors')],
    ['scailPusaLora', 'loras', hf('Comfy-Org/SCAIL-2', 'loras/Pusa/Wan21_PusaV1_LoRA_14B_rank512_bf16.safetensors')],
    ['scailClipVision', 'clip_vision', hf('Comfy-Org/SCAIL-2', 'clip_vision/clip_vision_h.safetensors')],
    ['scailSam', 'checkpoints', hf('Comfy-Org/SCAIL-2', 'checkpoints/sam3.1_multiplex_fp16.safetensors')],
  ],
});

const COMPONENTS = Object.freeze({
  smartmask: { label: 'Smart Mask Tools', nodes: ['sam3'] },
  regional: { label: 'Regional Prompting', nodes: ['regional', 'kjnodes'], models: ['image'] },
  krea2ref: { label: 'Krea 2 Edit', nodes: ['rebalance'], models: ['image'] },
  krea2outpaint: { label: 'Krea 2 Outpaint', nodes: ['krea2Edit', 'kjnodes'], models: ['image', 'krea2Outpaint'] },
  editoutpaint: { label: 'Klein / Qwen Outpaint', nodes: ['kjnodes'] },
  upscale: { label: 'SeedVR2 Upscale', nodes: ['seedvr2'], models: ['upscale'] },
  ultimateupscale: { label: 'Ultimate SD Upscale', nodes: ['ultimate'] },
  video: { label: 'LTX 2.3 Video', nodes: ['vhs'], models: ['ltx'] },
  videoedit: { label: 'LTX Edit', nodes: ['vhs'], models: ['ltxEdit'] },
  video4k: { label: 'RTX Video Super Resolution', nodes: [] },
  wan: { label: 'Wan 2.2 Video', nodes: ['vhs'], models: ['wan'] },
  eros: { label: '10Eros DMD', nodes: ['kjnodes'], models: ['eros', 'ltx'] },
  scail: { label: 'SCAIL 2 Motion Transfer', nodes: ['sam3', 'vhs'], models: ['scail', 'wan'] },
  scailinfinity: { label: 'SCAIL 2 Infinity', nodes: ['scailInfinity'], models: ['scail'] },
  faceid: { label: 'LTX Face ID', nodes: ['bfs', 'kjnodes'], models: ['faceid', 'ltx'] },
  image: { label: 'Krea 2 Image', nodes: [], models: ['image'] },
  krea2depth: { label: 'Krea 2 Depth Guide', nodes: ['krea2Control', 'depthAnything3'], models: ['krea2Depth'] },
  klein4: { label: 'Klein 4B Edit', nodes: [], models: ['klein4'] },
  klein9: { label: 'Klein 9B Edit', nodes: [], models: ['klein9'] },
  qwen: { label: 'Qwen Image Edit', nodes: [], models: ['qwen'] },
});

function cleanRelative(value) {
  const normalized = String(value || '').replace(/[\\/]+/g, path.sep).replace(/^([\\/])+/, '');
  if (!normalized || normalized.split(path.sep).includes('..')) throw new Error('Invalid dependency file path');
  return normalized;
}

function sameRepo(left, right) {
  const normalize = (value) => String(value || '').trim().toLowerCase()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git\/?$/, '')
    .replace(/\/$/, '');
  return normalize(left) === normalize(right);
}

function dependencyCancelledError() {
  const error = new Error('Dependency installation cancelled.');
  error.code = 'dependency_cancelled';
  return error;
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw dependencyCancelledError();
}

function normalizeModelName(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function modelIsRegistered(filename, availableModelNames) {
  const expected = normalizeModelName(filename);
  if (!expected || !availableModelNames) return false;
  for (const value of availableModelNames) {
    if (normalizeModelName(value) === expected) return true;
  }
  return false;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      throwIfCancelled(options.signal);
      execFile(command, args, {
        cwd: options.cwd,
        windowsHide: true,
        timeout: options.timeout || 45 * 60 * 1000,
        maxBuffer: 8 * 1024 * 1024,
        env: Object.assign({}, process.env, options.env || {}),
        signal: options.signal,
      }, (error, stdout, stderr) => {
        if (options.signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
          return reject(dependencyCancelledError());
        }
        if (!error) return resolve([stdout, stderr].filter(Boolean).join('\n').trim());
        const wrapped = new Error(([stdout, stderr].filter(Boolean).join('\n') || error.message).slice(-2800));
        wrapped.code = error.killed ? 'dependency_timeout' : 'dependency_install_failed';
        reject(wrapped);
      });
    } catch (error) {
      reject(options.signal?.aborted ? dependencyCancelledError() : error);
    }
  });
}

const PROTECTED_RUNTIME_REQUIREMENTS = new Set([
  'numpy', 'opencv-python', 'opencv-python-headless', 'opencv-contrib-python',
  'torch', 'torchvision', 'torchaudio',
]);

function requirementPackageName(line) {
  const value = String(line || '').split('#')[0].trim();
  if (!value || value.startsWith('-')) return '';
  const match = value.match(/^([a-zA-Z0-9_.-]+)/);
  return match ? match[1].toLowerCase().replace(/[_.]+/g, '-') : '';
}

function filterProtectedRuntimeRequirements(source) {
  return String(source || '').split(/\r?\n/)
    .filter((line) => !PROTECTED_RUNTIME_REQUIREMENTS.has(requirementPackageName(line)))
    .join('\n');
}

async function safeRepairRequirementsFile(requirements) {
  const source = await fsp.readFile(requirements, 'utf8');
  const filtered = filterProtectedRuntimeRequirements(source);
  if (filtered === source) return { path: requirements, temporary: false };
  const safePath = `${requirements}.mixbox-safe`;
  await fsp.writeFile(safePath, filtered, 'utf8');
  return { path: safePath, temporary: true };
}

function requirementsArgs(requirements, repair = false, options = {}) {
  // Never use pip's blanket --upgrade here. ComfyUI custom nodes share one
  // Python environment, so an unrelated node installer can otherwise replace
  // Video Helper Suite / SeedVR2 dependencies. Normal installs are additive;
  // repair only reinstalls the packages named by the affected node pack.
  const args = ['-m', 'pip', 'install', '--upgrade-strategy', 'only-if-needed'];
  if (repair) args.push('--force-reinstall', '--no-deps');
  if (!repair && options.constraintFile) args.push('--constraint', options.constraintFile);
  args.push('-r', requirements);
  return args;
}

async function snapshotPythonEnvironment(status, runtime, report, options = {}) {
  const runCommand = options.run || run;
  const backupRoot = options.backupDir || runtime.dataDir || path.join(status.basePath, 'mixbox-backups');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(backupRoot, 'dependency-backups', `python-${stamp}.freeze.txt`);
  try {
    report('snapshotting-environment', 'Saving the current ComfyUI Python package list');
    const freeze = await runCommand(status.pythonPath, ['-m', 'pip', 'freeze'], { cwd: status.basePath, signal: options.signal });
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, `${freeze}\n`, 'utf8');
    report('environment-snapshot', 'Saved a ComfyUI package snapshot before installation', { environmentSnapshot: destination });
    return destination;
  } catch (error) {
    if (options.signal?.aborted || error?.code === 'dependency_cancelled' || error?.name === 'AbortError') throw dependencyCancelledError();
    // A package snapshot is a safety net, not a reason to block a legitimate
    // model download when the Comfy Python executable does not support freeze.
    report('snapshot-warning', 'Could not save a Python package snapshot; continuing with the safer installer.', { snapshotWarning: String(error.message || error) });
    return '';
  }
}

async function installNodePack(pack, status, report, options = {}) {
  const runCommand = options.run || run;
  const existsSync = options.existsSync || fs.existsSync;
  const nodePath = path.join(status.customNodesPath, pack.folder);
  const gitDir = path.join(nodePath, '.git');
  throwIfCancelled(options.signal);
  await fsp.mkdir(status.customNodesPath, { recursive: true });
  if (existsSync(nodePath) && !existsSync(gitDir)) throw new Error(`${pack.label} already exists but is not a Git checkout. Move it aside before installing.`);
  if (existsSync(gitDir)) {
    report('updating-node', `Updating ${pack.label}`);
    const origin = await runCommand('git', ['-C', nodePath, 'remote', 'get-url', 'origin'], { cwd: nodePath, signal: options.signal });
    if (!sameRepo(origin, pack.repo)) throw new Error(`${pack.label} exists but points to a different repository.`);
    await runCommand('git', ['-C', nodePath, 'pull', '--ff-only'], { cwd: nodePath, signal: options.signal });
  } else {
    report('installing-node', `Installing ${pack.label}`);
    await runCommand('git', ['clone', '--depth', '1', pack.repo, nodePath], { cwd: status.customNodesPath, signal: options.signal });
  }
  const requirements = path.join(nodePath, 'requirements.txt');
  if (existsSync(requirements)) {
    const repair = !!options.repair;
    const safeRequirements = repair ? await safeRepairRequirementsFile(requirements) : { path: requirements, temporary: false };
    report('requirements', repair
      ? `Repairing ${pack.label} requirements without changing unrelated packages`
      : `Installing ${pack.label} requirements without upgrading unrelated packages`);
    try {
      await runCommand(status.pythonPath, requirementsArgs(safeRequirements.path, repair, {
        constraintFile: options.constraintFile,
      }), { cwd: nodePath, signal: options.signal });
    } finally {
      if (safeRequirements.temporary) await fsp.rm(safeRequirements.path, { force: true }).catch(() => {});
    }
  }
  const installScript = path.join(nodePath, 'install.py');
  if (existsSync(installScript)) {
    report('requirements', `Finishing ${pack.label}`);
    await runCommand(status.pythonPath, [installScript], { cwd: nodePath, signal: options.signal });
  }
}

async function downloadAsset(asset, modelsPath, settings, report, options = {}) {
  const [settingKey, folder, url, defaultFilename] = asset;
  const sourceName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  const filename = cleanRelative(settings[settingKey] || defaultFilename || sourceName);
  const destination = path.join(modelsPath, folder, filename);
  throwIfCancelled(options.signal);
  if (modelIsRegistered(filename, options.availableModelNames)) {
    report('already-present', `${filename} is already available through ComfyUI`, { settingKey, filename, registered: true });
    return { skipped: true, destination, registered: true };
  }
  if (fs.existsSync(destination) && fs.statSync(destination).size > 0) {
    report('already-present', `${filename} is already available`);
    return { skipped: true, destination };
  }
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const partial = `${destination}.mixbox.part`;
  await fsp.rm(partial, { force: true }).catch(() => {});
  report('downloading-model', `Downloading ${filename}`, { settingKey, filename, downloaded: 0, downloadTotal: 0 });
  const headers = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
  const response = await (options.fetch || fetch)(url, { headers, redirect: 'follow', signal: options.signal });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Could not download ${filename} (${response.status}). ${detail.slice(0, 240) || 'Accept the source model license, set HF_TOKEN if required, then try again.'}`);
  }
  const total = Number(response.headers.get('content-length') || 0);
  try {
    const handle = await fsp.open(partial, 'w');
    let downloaded = 0;
    try {
      const reader = response.body.getReader();
      for (;;) {
        throwIfCancelled(options.signal);
        const { done, value } = await reader.read();
        if (done) break;
        await handle.write(value);
        downloaded += value.byteLength;
        report('downloading-model', `Downloading ${filename}`, { settingKey, filename, downloaded, downloadTotal: total });
      }
    } finally {
      await handle.close();
    }
    throwIfCancelled(options.signal);
    await fsp.rename(partial, destination);
    report('downloaded-model', `Downloaded ${filename}`, { settingKey, filename, downloaded, downloadTotal: total });
    return { skipped: false, destination };
  } catch (error) {
    await fsp.rm(partial, { force: true }).catch(() => {});
    if (options.signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw dependencyCancelledError();
    throw error;
  }
}

function availableComponents() { return Object.keys(COMPONENTS); }

async function installComponents({ runtime, settings, components, report = () => {}, options = {} }) {
  throwIfCancelled(options.signal);
  const status = sam3InstallStatus(runtime, options);
  if (!status.canInstall) {
    const error = new Error(status.reason || 'Mix Studio could not find a writable ComfyUI installation and its Python environment.');
    error.code = 'dependency_path_missing';
    throw error;
  }
  const selected = [...new Set((components || []).filter((key) => COMPONENTS[key]))];
  if (!selected.length) throw new Error('No installable dependency groups were selected.');
  const modelsPath = runtime.comfy.modelsPath || path.join(status.basePath, 'models');
  const nodeIds = [...new Set(selected.flatMap((key) => COMPONENTS[key].nodes || []))];
  const modelGroups = [...new Set(selected.flatMap((key) => COMPONENTS[key].models || []))];
  const assets = [...new Map(modelGroups.flatMap((key) => MODEL_ASSETS[key] || []).map((asset) => [asset[0], asset])).values()];
  const total = nodeIds.length + assets.length;
  let completed = 0;
  report('starting', `Preparing ${selected.length} dependency group${selected.length === 1 ? '' : 's'}`, { completed, total });
  const environmentSnapshot = nodeIds.length
    ? await snapshotPythonEnvironment(status, runtime, (phase, message, detail) => report(phase, message, Object.assign({ completed, total }, detail || {})), options)
    : '';
  for (const id of nodeIds) {
    throwIfCancelled(options.signal);
    const pack = NODE_PACKS[id];
    await installNodePack(pack, status, (phase, message, detail) => report(phase, message, Object.assign({ completed, total, component: id }, detail || {})), Object.assign({}, options, {
      constraintFile: environmentSnapshot,
    }));
    completed += 1;
    report('node-ready', `${pack.label} is ready`, { completed, total, component: id });
  }
  for (const asset of assets) {
    throwIfCancelled(options.signal);
    await downloadAsset(asset, modelsPath, settings, (phase, message, detail) => report(phase, message, Object.assign({ completed, total, component: asset[0] }, detail || {})), options);
    completed += 1;
    report('model-ready', `${asset[0]} is ready`, { completed, total, component: asset[0] });
  }
  if (nodeIds.length) {
    try {
      report('checking-environment', 'Checking the ComfyUI Python environment for dependency conflicts', { completed, total });
      await (options.run || run)(status.pythonPath, ['-m', 'pip', 'check'], { cwd: status.basePath, signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted || error?.code === 'dependency_cancelled' || error?.name === 'AbortError') throw dependencyCancelledError();
      report('environment-warning', 'The node packs were installed, but pip found an existing dependency conflict. Use Repair missing tools, then restart ComfyUI.', {
        completed, total, environmentWarning: String(error.message || error),
      });
    }
  }
  throwIfCancelled(options.signal);
  report('restart-needed', 'Dependencies are installed. Restart ComfyUI, then run Check again.', { completed, total });
  return { restartRequired: true, completed, total, components: selected, environmentSnapshot };
}

module.exports = {
  COMPONENTS,
  MODEL_ASSETS,
  NODE_PACKS,
  availableComponents,
  cleanRelative,
  dependencyCancelledError,
  downloadAsset,
  filterProtectedRuntimeRequirements,
  installComponents,
  modelIsRegistered,
  normalizeModelName,
  requirementsArgs,
  sameRepo,
  snapshotPythonEnvironment,
};
