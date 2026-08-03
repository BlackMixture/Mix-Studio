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
  dependencyModelPlan,
  downloadAsset,
  ensureDownloadDiskSpace,
  ensureUv,
  findExistingModelByBasename,
  filterProtectedRuntimeRequirements,
  filterRequirementsForEnvironment,
  huggingFaceEndpointUrl,
  huggingFaceAccessUrl,
  installComponents,
  installNodeRequirements,
  installNodePack,
  looksLikeCustomNodeFolder,
  modelIsRegistered,
  normalizeHuggingFaceEndpoint,
  patchLtxVideoKornia,
  patchBfsOptionalAudio,
  protectedRuntimeConstraints,
  requirementsArgs,
  sameRepo,
  validateModelFile,
} = require('../lib/dependency-installer');
const { comfyPort, restartStatus } = require('../lib/comfy-restart');

function safetensorsFixture() {
  const metadata = Buffer.from('{"__metadata__":{}}', 'utf8');
  const header = Buffer.alloc(8);
  header.writeBigUInt64LE(BigInt(metadata.length));
  return Buffer.concat([header, metadata]);
}

test('dependency catalog covers every enabled image and video family', () => {
  for (const component of ['image', 'krea2raw', 'krea2depth', 'krea2style', 'krea2outpaint', 'editoutpaint', 'klein4', 'klein9', 'qwen', 'upscale', 'video', 'h3', 'h3r2v', 'ltxcamera', 'ltxdirector', 'videoedit', 'faceid', 'wan', 'eros', 'rife', 'scail', 'scailinfinity', 'smartmask', 'regional']) {
    assert.ok(COMPONENTS[component], `${component} is installable`);
  }
  for (const group of ['image', 'krea2Raw', 'krea2Depth', 'krea2Outpaint', 'klein4', 'klein9', 'qwen', 'upscale', 'ltx', 'h3', 'h3Ref', 'ltxCamera', 'ltxDirector', 'ltxEdit', 'faceid', 'wan', 'eros', 'scail']) {
    assert.ok(MODEL_ASSETS[group]?.length, `${group} has model downloads`);
  }
  assert.ok(Object.values(NODE_PACKS).every((pack) => pack.repo.startsWith('https://github.com/')));
  assert.ok(Object.values(NODE_PACKS)
    .every((pack) => /^[a-f0-9]{40}$/.test(pack.ref)), 'public custom nodes use immutable commits');
  assert.match(NODE_PACKS.regional.repo, /CliffNodes\/Krea2-Multi-Character-Lora-Node/);
  assert.equal(NODE_PACKS.regional.allowCompatibleMirror, true);
  assert.match(NODE_PACKS.eros.repo, /TenStrip\/10S-Comfy-nodes/);
  assert.deepEqual(COMPONENTS.eros.nodes, ['eros', 'kjnodes']);
  assert.deepEqual(COMPONENTS.h3.models, ['h3']);
  assert.deepEqual(COMPONENTS.h3r2v.models, ['h3', 'h3Ref']);
  assert.equal(COMPONENTS.h3.models.includes('h3Ref'), false, 'standard H3 never downloads the optional R2V diffusion model');
  assert.match(MODEL_ASSETS.h3.find((asset) => asset[0] === 'h3Unet')[2], /Comfy-Org\/MiniMax-H3.*minimax_h3_fl2va_pruned_int8_convrot/);
  assert.match(MODEL_ASSETS.h3Ref[0][2], /Comfy-Org\/MiniMax-H3.*minimax_h3_ref2va_pruned_int8_convrot/);
  assert.deepEqual(COMPONENTS.rife.nodes, ['rife']);
  assert.ok(availableComponents().includes('smartmask'));
  assert.equal(COMPONENTS.krea2raw.optional, true);
  assert.deepEqual(COMPONENTS.krea2raw.models, ['krea2Raw']);
  assert.equal(MODEL_ASSETS.image.some((asset) => asset[0] === 'krea2RawUnet'), false);
  assert.ok(MODEL_ASSETS.krea2Raw.some((asset) => asset[0] === 'krea2RawUnet'));
  assert.equal(MODEL_ASSETS.krea2Depth[0][1], 'loras');
  assert.match(MODEL_ASSETS.krea2Depth[0][2], /Patil\/Krea-2-depth-controlnet/);
  assert.equal(MODEL_ASSETS.krea2Depth[1][1], 'depthanything3');
  assert.match(MODEL_ASSETS.krea2Depth[1][2], /depth-anything\/DA3-LARGE-1\.1/);
  assert.equal(NODE_PACKS.krea2Control.folder, 'comfyui-krea2-controlnet');
  assert.equal(NODE_PACKS.depthAnything3.folder, 'ComfyUI-DepthAnythingV3');
  assert.equal(NODE_PACKS.krea2Style.folder, 'ComfyUI-Krea2-StyleTransfer');
  assert.match(NODE_PACKS.krea2Style.repo, /jieg9341-lab\/ComfyUI-Krea2-StyleTransfer/);
  assert.equal(NODE_PACKS.krea2Edit.folder, 'comfyui-krea2edit');
  assert.equal(NODE_PACKS.ltxvideo.folder, 'ComfyUI-LTXVideo');
  assert.match(NODE_PACKS.ltxvideo.repo, /Lightricks\/ComfyUI-LTXVideo/);
  assert.match(MODEL_ASSETS.ltxCamera[0][2], /Cseti\/LTX2\.3-22B_IC-LoRA-Cameraman_v2/);
  assert.match(MODEL_ASSETS.upscale[0][2], /AInVFX\/SeedVR2_comfyUI/);
  assert.match(MODEL_ASSETS.upscale[1][2], /numz\/SeedVR2_comfyUI/);
  assert.match(MODEL_ASSETS.ltx.find((asset) => asset[0] === 'ltxTextEncoder')[2], /Comfy-Org\/ltx-2\/resolve\/main\/split_files\/text_encoders\/gemma_3_12B_it_fp4_mixed\.safetensors/);
  assert.match(MODEL_ASSETS.ltx.find((asset) => asset[0] === 'ltxGemmaLora')[2], /Comfy-Org\/ltx-2/);
  assert.match(MODEL_ASSETS.ltxEdit[0][2], /Alissonerdx\/EditAnything/);
  assert.match(MODEL_ASSETS.faceid.find((asset) => asset[0] === 'ltxFaceIdLora')[2], /Alissonerdx\/LTX-Best-Face-ID\/resolve\/main\/Best_FaceID_v1\.0_LoRA\.safetensors/);
  assert.match(MODEL_ASSETS.faceid.find((asset) => asset[0] === 'ltxFaceIdDistilledLora')[2], /Comfy-Org\/ltx-2\.3\/resolve\/main\/split_files\/loras\/ltx_2\.3_22b_distilled_1\.1_lora_dynamic_fro09_avg_rank_111_bf16\.safetensors/);
  const qwenAngles = MODEL_ASSETS.qwen.find((asset) => asset[0] === 'qwenEditAnglesLora');
  assert.match(qwenAngles[2], /fal\/Qwen-Image-Edit-2511-Multiple-Angles-LoRA\/resolve\/main\/qwen-image-edit-2511-multiple-angles-lora\.safetensors/);
  assert.equal(qwenAngles[3], 'qwen_image_edit_2511_multiple-angles-lora.safetensors');
  assert.doesNotMatch(qwenAngles[2], /art1455\/Qwen2511/);
  const scailSam = MODEL_ASSETS.scail.find((asset) => asset[0] === 'scailSam');
  assert.match(scailSam[2], /Comfy-Org\/sam3\.1\/resolve\/main\/checkpoints\/sam3\.1_multiplex_fp16\.safetensors/);
  assert.doesNotMatch(scailSam[2], /Comfy-Org\/SCAIL-2/);
  assert.match(MODEL_ASSETS.scail.find((asset) => asset[0] === 'scailPusaLora')[2], /Kijai\/WanVideo_comfy\/resolve\/main\/Pusa\/Wan21_PusaV1_LoRA_14B_rank512_bf16\.safetensors/);
  assert.match(MODEL_ASSETS.scail.find((asset) => asset[0] === 'scailClipVision')[2], /Comfy-Org\/Wan_2\.1_ComfyUI_repackaged\/resolve\/main\/split_files\/clip_vision\/clip_vision_h\.safetensors/);
  assert.ok(MODEL_ASSETS.wan.filter((asset) => /Unet$/.test(asset[0]))
    .every((asset) => /Comfy-Org\/Wan_2\.2_ComfyUI_Repackaged/.test(asset[2])));
  assert.match(MODEL_ASSETS.eros.find((asset) => asset[0] === 'erosTextEncoder')[2], /gemma_3_12B_it_heretic_fp8_e4m3fn/);
  const scailLora = MODEL_ASSETS.scail.find((asset) => asset[0] === 'scailLora');
  assert.match(scailLora[2], /lightx2v\/Wan2\.1-I2V-14B-480P-StepDistill-CfgDistill-Lightx2v/);
  assert.match(scailLora[2], /Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64\.safetensors/);
  assert.equal(scailLora[4].length, 1);
  assert.match(scailLora[4][0], /lightx2v\/Wan2\.1-I2V-14B-720P-StepDistill-CfgDistill-Lightx2v/);
  assert.deepEqual(COMPONENTS.ltxcamera.nodes, ['ltxvideo', 'vhs']);
  assert.deepEqual(COMPONENTS.ltxdirector.nodes, ['whatdreamscost', 'ltxvideo', 'kjnodes', 'vhs']);
  assert.equal(COMPONENTS.video.nodes.includes('whatdreamscost'), false);
  assert.equal(COMPONENTS.video.models.includes('ltxDirector'), false);
  assert.match(NODE_PACKS.whatdreamscost.ref, /^[a-f0-9]{40}$/);
  assert.match(MODEL_ASSETS.ltxDirector[0][2], /Lightricks\/LTX-2\.3-22b-IC-LoRA-Ingredients/);
  assert.match(MODEL_ASSETS.krea2Outpaint[0][2], /conradlocke\/krea2-identity-edit/);
  assert.equal(MODEL_ASSETS.klein4.find((asset) => asset[0] === 'klein4ConsistencyLora')[1], 'loras');
  assert.match(MODEL_ASSETS.klein4.find((asset) => asset[0] === 'klein4Unet')[2], /FLUX\.2-klein-4b-fp8\/resolve\/main\/flux-2-klein-4b-fp8\.safetensors/);
  assert.match(MODEL_ASSETS.klein4.find((asset) => asset[0] === 'klein4ConsistencyLora')[2], /f2k_4B_consist_20260314\.safetensors/);
  assert.equal(MODEL_ASSETS.klein9.find((asset) => asset[0] === 'klein9ConsistencyLora')[1], 'loras');
  assert.match(MODEL_ASSETS.klein9.find((asset) => asset[0] === 'klein9ConsistencyLora')[2], /f2k_9B_lcs_consist_20260415\.safetensors/);
});

test('regional prompting installs the reviewed mirror and reuses a compatible legacy checkout', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-regional-source-'));
  const customNodesPath = path.join(rootDir, 'custom_nodes');
  const preferredPath = path.join(customNodesPath, NODE_PACKS.regional.folder);
  const legacyPath = path.join(customNodesPath, NODE_PACKS.regional.compatibleFolders[0]);
  const commands = [];
  try {
    await installNodePack(NODE_PACKS.regional, {
      customNodesPath, basePath: rootDir, pythonPath: 'python',
    }, () => {}, {
      run: async (command, args) => {
        commands.push([command, args]);
        if (args[0] === 'clone') fs.mkdirSync(path.join(preferredPath, '.git'), { recursive: true });
        return '';
      },
    });
    assert.deepEqual(commands, [
      ['git', ['clone', NODE_PACKS.regional.repo, preferredPath]],
      ['git', ['-C', preferredPath, 'checkout', '--detach', NODE_PACKS.regional.ref]],
    ]);

    fs.rmSync(preferredPath, { recursive: true, force: true });
    fs.mkdirSync(path.join(legacyPath, '.git'), { recursive: true });
    fs.writeFileSync(path.join(legacyPath, 'krea2_regional_multilora_v3.py'),
      'class Krea2RegionalMultiLoRAV3:\n    pass\nNODE_CLASS_MAPPINGS = {}\n');
    commands.length = 0;
    const reports = [];
    await installNodePack(NODE_PACKS.regional, {
      customNodesPath, basePath: rootDir, pythonPath: 'python',
    }, (phase, message, detail) => reports.push({ phase, message, detail }), {
      run: async (command, args) => {
        commands.push([command, args]);
        if (args.includes('get-url')) return 'https://github.com/legacy/compatible-regional-node.git';
        return '';
      },
    });
    assert.equal(commands.length, 1);
    assert.equal(reports[0].phase, 'existing-node');
    assert.equal(reports[0].detail.compatibleMirror, true);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('uv is bootstrapped into the ComfyUI Python environment with a clear failure code', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-uv-bootstrap-'));
  const pythonPath = path.join(rootDir, 'python.exe');
  const commands = [];
  try {
    const result = await ensureUv({ pythonPath, basePath: rootDir }, () => {}, {
      existsSync: () => false,
      run: async (...args) => { commands.push(args); return ''; },
    });
    assert.equal(result, path.join(rootDir, 'uv.exe'));
    assert.deepEqual(commands[0][0], pythonPath);
    assert.deepEqual(commands[0][1], ['-m', 'pip', 'install', '--upgrade-strategy', 'only-if-needed', 'uv']);

    await assert.rejects(
      ensureUv({ pythonPath, basePath: rootDir }, () => {}, {
        existsSync: () => false,
        run: async () => { throw new Error('pip is unavailable'); },
      }),
      (error) => error.code === 'dependency_uv_missing' && /pip is unavailable/.test(error.message)
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('fresh Klein 4B setup installs FP8 while preserving an existing BF16 selection', () => {
  const fresh = dependencyModelPlan(['klein4'], {});
  const freshUnet = fresh.assets.find((asset) => asset[0] === 'klein4Unet');
  assert.match(freshUnet[2], /FLUX\.2-klein-4b-fp8/);
  assert.match(freshUnet[2], /flux-2-klein-4b-fp8\.safetensors/);

  const existing = dependencyModelPlan(['klein4'], { klein4Unet: 'flux-2-klein-4b.safetensors' });
  const existingUnet = existing.assets.find((asset) => asset[0] === 'klein4Unet');
  assert.match(existingUnet[2], /FLUX\.2-klein-4B/);
  assert.match(existingUnet[2], /flux-2-klein-4b\.safetensors/);
});

test('Apple LTX setup selects the official BF16 checkpoint', () => {
  const plan = dependencyModelPlan(['ltx'], {
    ltxCkpt: 'ltx-2.3-22b-dev-fp8.safetensors',
  }, { gpuVendor: 'apple' });
  const checkpoint = plan.assets.find((asset) => asset[0] === 'ltxCkpt');
  assert.equal(plan.settingUpdates.ltxCkpt, 'ltx-2.3-22b-dev.safetensors');
  assert.match(checkpoint[2], /Lightricks\/LTX-2\.3\/resolve\/main\/ltx-2\.3-22b-dev\.safetensors/);
  assert.doesNotMatch(checkpoint[2], /LTX-2\.3-fp8/);
});

test('automatic Director node installs use the reviewed commit while compatible checkouts are reused', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-director-node-'));
  const customNodesPath = path.join(rootDir, 'custom_nodes');
  const nodePath = path.join(customNodesPath, NODE_PACKS.whatdreamscost.folder);
  const gitExecutable = path.join(rootDir, 'Git', 'cmd', 'git.exe');
  const commands = [];
  try {
    await installNodePack(NODE_PACKS.whatdreamscost, {
      customNodesPath, basePath: rootDir, pythonPath: 'python',
    }, () => {}, {
      gitExecutable,
      existsSync: (target) => target === path.join(nodePath, 'requirements.txt') ? false : fs.existsSync(target),
      run: async (command, args) => {
        commands.push([command, args]);
        if (command === gitExecutable && args[0] === 'clone') fs.mkdirSync(path.join(nodePath, '.git'), { recursive: true });
        return '';
      },
    });
    assert.deepEqual(commands[0], [gitExecutable, ['clone', NODE_PACKS.whatdreamscost.repo, nodePath]]);
    assert.deepEqual(commands[1], [gitExecutable, ['-C', nodePath, 'checkout', '--detach', NODE_PACKS.whatdreamscost.ref]]);

    commands.length = 0;
    await installNodePack(NODE_PACKS.whatdreamscost, {
      customNodesPath, basePath: rootDir, pythonPath: 'python',
    }, () => {}, {
      existsSync: (target) => target === path.join(nodePath, 'requirements.txt') ? false : fs.existsSync(target),
      run: async (command, args) => {
        commands.push([command, args]);
        if (args.includes('get-url')) return NODE_PACKS.whatdreamscost.repo;
        if (args.includes('rev-parse')) return NODE_PACKS.whatdreamscost.ref;
        return '';
      },
    });
    assert.deepEqual(commands, [
      ['git', ['-C', nodePath, 'remote', 'get-url', 'origin']],
      ['git', ['-C', nodePath, 'rev-parse', 'HEAD']],
    ]);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('dependency paths stay inside ComfyUI model folders and trusted repos compare safely', () => {
  assert.equal(cleanRelative('Wan2.1\\model.safetensors'), path.join('Wan2.1', 'model.safetensors'));
  assert.throws(() => cleanRelative('../outside.safetensors'));
  assert.equal(sameRepo('git@github.com:PozzettiAndrea/ComfyUI-SAM3.git', 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git'), true);
  assert.equal(sameRepo('https://github.com/example/other.git', 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git'), false);
  assert.equal(modelIsRegistered('krea2_turbo_fp8_scaled.safetensors', new Set(['Krea2_Turbo_FP8_Scaled.safetensors'])), true);
  assert.equal(modelIsRegistered('Wan2.1\\model.safetensors', new Set(['wan2.1/model.safetensors'])), true);
  assert.equal(modelIsRegistered('model.safetensors', new Set(['shared/models/model.safetensors'])), true);
  assert.equal(modelIsRegistered('model.safetensors', new Set(['a/model.safetensors', 'b/model.safetensors'])), false);
});

test('reviewed model mirrors and Hugging Face tokens are used without exposing the token', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-model-fallback-'));
  const bytes = safetensorsFixture();
  const urls = [];
  const headers = [];
  try {
    const result = await downloadAsset(
      ['ltxGemmaLora', 'loras', 'https://huggingface.co/example/model/resolve/main/primary.safetensors', 'model.safetensors', ['https://huggingface.co/example/model/resolve/main/fallback.safetensors']],
      rootDir,
      {},
      () => {},
      {
        hfToken: 'hf_test_secret',
        fetch: async (url, options) => {
          urls.push(url);
          headers.push(options.headers);
          if (urls.length === 1) return { ok: false, status: 404, body: null, text: async () => 'gone' };
          let sent = false;
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => name === 'content-length' ? String(bytes.length) : '' },
            body: { getReader: () => ({ read: async () => sent ? { done: true } : (sent = true, { done: false, value: bytes }) }) },
          };
        },
      }
    );
    assert.equal(result.skipped, false);
    assert.deepEqual(urls, [
      'https://huggingface.co/example/model/resolve/main/primary.safetensors',
      'https://huggingface.co/example/model/resolve/main/fallback.safetensors',
    ]);
    assert.equal(headers[0].Authorization, 'Bearer hf_test_secret');
    assert.equal(headers[1].Authorization, 'Bearer hf_test_secret');
    assert.match(server, /delete response\.hfToken/);
    assert.match(server, /hfTokenConfigured: !!String\(settings\.hfToken/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('custom Hugging Face endpoints rewrite reviewed downloads without receiving access tokens', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-model-endpoint-'));
  const bytes = safetensorsFixture();
  const requests = [];
  try {
    const result = await downloadAsset(
      ['unet', 'diffusion_models', 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/diffusion_models/model.safetensors'],
      rootDir,
      { unet: 'model.safetensors' },
      () => {},
      {
        hfEndpoint: 'https://models.example.test/hugging-face/',
        hfToken: 'hf_private_token',
        fetch: async (url, options) => {
          requests.push({ url, headers: options.headers });
          let sent = false;
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => name === 'content-length' ? String(bytes.length) : '' },
            body: { getReader: () => ({ read: async () => sent ? { done: true } : (sent = true, { done: false, value: bytes }) }) },
          };
        },
      }
    );
    assert.equal(result.skipped, false);
    assert.equal(requests[0].url, 'https://models.example.test/hugging-face/Comfy-Org/Krea-2/resolve/main/diffusion_models/model.safetensors');
    assert.equal(requests[0].headers.Authorization, undefined);
    assert.equal(normalizeHuggingFaceEndpoint('http://models.example.test'), '');
    assert.equal(normalizeHuggingFaceEndpoint('https://user:secret@models.example.test'), '');
    assert.equal(huggingFaceEndpointUrl('https://example.com/model.safetensors', 'https://models.example.test'), 'https://example.com/model.safetensors');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('dependency planning adopts a compatible Krea text encoder already registered by ComfyUI', () => {
  const compatible = 'external/qwen3vl_4b_fp8_scaled.safetensors';
  const plan = dependencyModelPlan(['image'], {
    clip: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
  }, {
    availableModelNames: [compatible],
  });
  assert.equal(plan.effectiveSettings.clip, compatible);
  assert.equal(plan.settingUpdates.clip, compatible);
});

test('large Hugging Face models use isolated Xet acceleration before the HTTP fallback', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-model-xet-'));
  const bytes = safetensorsFixture();
  const reports = [];
  let initialBodyCancelled = false;
  const commands = [];
  try {
    const result = await downloadAsset(
      ['scailUnet', 'diffusion_models', 'https://huggingface.co/Comfy-Org/SCAIL-2/resolve/main/diffusion_models/model.safetensors'],
      rootDir,
      { scailUnet: 'model.safetensors' },
      (phase, message, detail) => reports.push({ phase, message, detail }),
      {
        uvExecutable: 'uv.exe',
        hfAccelerationThreshold: 0,
        statfs: async () => ({ bavail: 10 ** 9, bsize: 4096 }),
        fetch: async () => ({
          ok: true,
          status: 200,
          headers: { get: (name) => name === 'content-length' ? String(bytes.length) : '' },
          body: {
            cancel: async () => { initialBodyCancelled = true; },
            getReader: () => { throw new Error('HTTP body should not be consumed after Xet succeeds'); },
          },
        }),
        run: async (command, args, options) => {
          commands.push({ command, args, options });
          const staging = args[args.indexOf('--local-dir') + 1];
          const remoteFile = args[args.indexOf('Comfy-Org/SCAIL-2') + 1];
          const output = path.join(staging, ...remoteFile.split('/'));
          fs.mkdirSync(path.dirname(output), { recursive: true });
          fs.writeFileSync(output, bytes);
        },
      }
    );
    assert.equal(result.skipped, false);
    assert.equal(initialBodyCancelled, true);
    assert.equal(commands[0].command, 'uv.exe');
    assert.equal(commands[0].args.includes('hf'), true);
    assert.equal(reports.some((entry) => entry.detail?.downloadMethod === 'hf-xet'), true);
    assert.equal(reports.some((entry) => entry.detail?.downloadMethod === 'hf-xet'
      && entry.detail.downloaded === bytes.length
      && entry.detail.downloadTotal === bytes.length), true);
    assert.deepEqual(fs.readFileSync(result.destination), bytes);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('Xet failures fall back to the resumable HTTP downloader', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-model-xet-fallback-'));
  const bytes = safetensorsFixture();
  let fetchCount = 0;
  let cancelledInitialBody = false;
  const reports = [];
  try {
    const result = await downloadAsset(
      ['scailUnet', 'diffusion_models', 'https://huggingface.co/Comfy-Org/SCAIL-2/resolve/main/diffusion_models/model.safetensors'],
      rootDir,
      { scailUnet: 'model.safetensors' },
      (phase, message, detail) => reports.push({ phase, message, detail }),
      {
        uvExecutable: 'uv.exe',
        hfAccelerationThreshold: 0,
        downloadAttempts: 2,
        downloadRetryDelayMs: 0,
        statfs: async () => ({ bavail: 10 ** 9, bsize: 4096 }),
        fetch: async () => {
          fetchCount += 1;
          let sent = false;
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => name === 'content-length' ? String(bytes.length) : '' },
            body: {
              cancel: async () => { cancelledInitialBody = true; },
              getReader: () => ({
                read: async () => sent
                  ? { done: true }
                  : (sent = true, { done: false, value: bytes }),
              }),
            },
          };
        },
        run: async () => { throw new Error('Xet endpoint blocked'); },
      }
    );
    assert.equal(cancelledInitialBody, true);
    assert.equal(fetchCount, 2);
    assert.equal(reports.some((entry) => entry.phase === 'download-fallback'
      && entry.detail?.downloadMethod === 'http-resume'), true);
    assert.deepEqual(fs.readFileSync(result.destination), bytes);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('interrupted HTTP model downloads resume from the saved byte range', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-model-resume-'));
  const bytes = safetensorsFixture();
  const split = Math.max(10, Math.floor(bytes.length / 2));
  const url = 'https://example.test/model.safetensors';
  const asset = ['unet', 'diffusion_models', url];
  const settings = { unet: 'model.safetensors' };
  try {
    await assert.rejects(
      downloadAsset(asset, rootDir, settings, () => {}, {
        downloadAttempts: 1,
        downloadRetryDelayMs: 0,
        statfs: async () => ({ bavail: 10 ** 9, bsize: 4096 }),
        fetch: async () => {
          let read = false;
          return {
            ok: true,
            status: 200,
            headers: {
              get: (name) => {
                if (name === 'content-length') return String(bytes.length);
                if (name === 'etag') return '"fixture-etag"';
                return '';
              },
            },
            body: {
              getReader: () => ({
                read: async () => {
                  if (!read) {
                    read = true;
                    return { done: false, value: bytes.subarray(0, split) };
                  }
                  throw new Error('connection reset');
                },
              }),
            },
          };
        },
      }),
      (error) => error.code === 'dependency_download_incomplete' && error.resumableBytes === split
    );

    const destination = path.join(rootDir, 'diffusion_models', 'model.safetensors');
    assert.equal(fs.statSync(`${destination}.mixbox.part`).size, split);
    assert.equal(fs.existsSync(`${destination}.mixbox.part.json`), true);

    let requestedHeaders = null;
    const result = await downloadAsset(asset, rootDir, settings, () => {}, {
      downloadAttempts: 1,
      downloadRetryDelayMs: 0,
      statfs: async () => ({ bavail: 10 ** 9, bsize: 4096 }),
      fetch: async (_requestedUrl, options) => {
        requestedHeaders = options.headers;
        let sent = false;
        return {
          ok: true,
          status: 206,
          headers: {
            get: (name) => {
              if (name === 'content-length') return String(bytes.length - split);
              if (name === 'content-range') return `bytes ${split}-${bytes.length - 1}/${bytes.length}`;
              if (name === 'etag') return '"fixture-etag"';
              return '';
            },
          },
          body: {
            getReader: () => ({
              read: async () => sent
                ? { done: true }
                : (sent = true, { done: false, value: bytes.subarray(split) }),
            }),
          },
        };
      },
    });
    assert.equal(requestedHeaders.Range, `bytes=${split}-`);
    assert.equal(requestedHeaders['If-Range'], '"fixture-etag"');
    assert.deepEqual(fs.readFileSync(result.destination), bytes);
    assert.equal(fs.existsSync(`${destination}.mixbox.part`), false);
    assert.equal(fs.existsSync(`${destination}.mixbox.part.json`), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('LTXVideo is patched for the kornia 0.8.3 pad relocation', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-ltx-kornia-'));
  const file = path.join(rootDir, 'pyramid_blending.py');
  try {
    fs.writeFileSync(file, [
      'import torch',
      'from kornia.geometry.transform.pyramid import (',
      '    pyrdown,',
      '    pad,',
      ')',
      '',
    ].join('\r\n'));
    assert.equal(await patchLtxVideoKornia(rootDir), true);
    const patched = fs.readFileSync(file, 'utf8');
    assert.match(patched, /from torch\.nn\.functional import pad/);
    assert.doesNotMatch(patched, /^\s+pad,$/m);
    assert.equal(await patchLtxVideoKornia(rootDir), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('gated Hugging Face downloads expose only their reviewed repository access page', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-gated-model-'));
  const asset = MODEL_ASSETS.ltxDirector[0];
  const expectedAccessUrl = 'https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Ingredients';
  const filename = 'ltx-director-ingredients.safetensors';
  try {
    assert.equal(huggingFaceAccessUrl(asset[2]), expectedAccessUrl);
    assert.equal(huggingFaceAccessUrl(`${expectedAccessUrl}/blob/main/model.safetensors`), '');
    assert.equal(huggingFaceAccessUrl('https://example.test/owner/model/resolve/main/model.safetensors'), '');

    for (const status of [401, 403]) {
      await assert.rejects(
        downloadAsset(asset, rootDir, { ltxDirectorIcLora: filename }, () => {}, {
          fetch: async () => ({
            ok: false,
            status,
            body: null,
            text: async () => 'Access denied',
          }),
        }),
        (error) => {
          assert.equal(error.code, 'dependency_model_access_required');
          assert.equal(error.statusCode, status);
          assert.equal(error.settingKey, 'ltxDirectorIcLora');
          assert.equal(error.failedModel, filename);
          assert.equal(error.accessUrl, expectedAccessUrl);
          assert.doesNotMatch(error.accessUrl, /resolve|safetensors|[?#]/);
          return true;
        }
      );
    }

    const destination = path.join(rootDir, 'loras', filename);
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.existsSync(`${destination}.mixbox.part`), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('generic and non-Hugging Face download failures never expose an access link', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-generic-download-'));
  try {
    await assert.rejects(
      downloadAsset(
        ['unet', 'diffusion_models', 'https://example.test/model.safetensors'],
        rootDir,
        { unet: 'model.safetensors' },
        () => {},
        { fetch: async () => ({ ok: false, status: 403, body: null, text: async () => 'Forbidden' }) }
      ),
      (error) => {
        assert.equal(error.code, 'dependency_download_failed');
        assert.equal(error.accessUrl, undefined);
        return true;
      }
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
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

test('manual models in a different subfolder are reused while ComfyUI is offline', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-manual-model-'));
  const filename = 'Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors';
  const existing = path.join(rootDir, 'loras', 'Downloaded', filename);
  let fetched = false;
  try {
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, safetensorsFixture());
    const discovered = await findExistingModelByBasename(
      [rootDir],
      'loras',
      path.join('Wan2.1', filename),
    );
    assert.equal(discovered, existing);

    const result = await downloadAsset(
      ['scailLora', 'loras', `https://example.test/${filename}`],
      rootDir,
      { scailLora: path.join('Wan2.1', filename) },
      () => {},
      {
        availableModelNames: [],
        availableModelRoots: [rootDir],
        fetch: async () => { fetched = true; throw new Error('should not fetch'); },
      },
    );
    assert.equal(result.skipped, true);
    assert.equal(result.discovered, true);
    assert.equal(result.destination, existing);
    assert.equal(fetched, false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('a missing manually configured GGUF is never filled with safetensors bytes', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-gguf-format-'));
  let fetched = false;
  try {
    await assert.rejects(
      downloadAsset(
        ['wanHighUnet', 'diffusion_models', 'https://example.test/wan-high-fp8.safetensors'],
        rootDir,
        { wanHighUnet: 'Wan/high-noise-Q3_K_S.gguf' },
        () => {},
        { fetch: async () => { fetched = true; throw new Error('should not fetch'); } }
      ),
      (error) => error.code === 'dependency_custom_model_missing'
        && error.failedModel === path.join('Wan', 'high-noise-Q3_K_S.gguf')
    );
    assert.equal(fetched, false);
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
    fs.writeFileSync(existing, safetensorsFixture());
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

test('model downloads verify disk space, byte counts, and model headers before installation', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-model-integrity-'));
  try {
    const valid = path.join(rootDir, 'valid.safetensors');
    const invalid = path.join(rootDir, 'invalid.safetensors');
    const gguf = path.join(rootDir, 'model.gguf');
    fs.writeFileSync(valid, safetensorsFixture());
    fs.writeFileSync(invalid, '<html>download denied</html>');
    fs.writeFileSync(gguf, Buffer.from('GGUFfixture'));
    assert.equal((await validateModelFile(valid)).valid, true);
    assert.equal((await validateModelFile(invalid)).valid, false);
    assert.equal((await validateModelFile(gguf)).valid, true);

    await assert.rejects(
      ensureDownloadDiskSpace(rootDir, 1024, {
        statfs: async () => ({ bavail: 1, bsize: 1024 }),
      }),
      (error) => error.code === 'dependency_disk_space'
    );

    const bytes = safetensorsFixture();
    await assert.rejects(
      downloadAsset(
        ['unet', 'diffusion_models', 'https://example.test/model.safetensors'],
        rootDir,
        { unet: 'downloaded.safetensors' },
        () => {},
        {
          downloadAttempts: 1,
          downloadRetryDelayMs: 0,
          statfs: async () => ({ bavail: 10 ** 9, bsize: 4096 }),
          fetch: async () => ({
            ok: true,
            headers: { get: (name) => name === 'content-length' ? String(bytes.length + 4) : '' },
            body: { getReader: () => {
              let sent = false;
              return { read: async () => sent ? { done: true } : (sent = true, { done: false, value: bytes }) };
            } },
          }),
        }
      ),
      (error) => error.code === 'dependency_download_incomplete'
    );
    const destination = path.join(rootDir, 'diffusion_models', 'downloaded.safetensors');
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.existsSync(`${destination}.mixbox.part`), true);
    assert.equal(fs.existsSync(`${destination}.mixbox.part.json`), true);
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
  assert.match(server, /function dependencyFailureState\(error\)/);
  assert.match(server, /accessUrl: error\?\.accessUrl \|\| null/);
  assert.match(server, /resumableBytes: Math\.max\(0, Number\(error\?\.resumableBytes \|\| 0\)\)/);
  assert.match(server, /errorCode: error\?\.code \|\| null/);
  assert.match(server, /\.\.\.EMPTY_DEPENDENCY_FAILURE/);
  assert.match(server, /broadcast\('dependencyInstall'/);
  assert.match(server, /await assertDesktopIsIdle\(\)/);
  assert.match(server, /const COMFY_OBJECT_INFO_TIMEOUT_MS = 60_000/);
  assert.match(server, /getObjectInfo\(true\)/);
  assert.match(server, /const discovery = await discoverModels\(/);
  assert.match(server, /availableModelRoots,/);
  assert.match(server, /const socketStale = socketOpen && Date\.now\(\) - lastWsMessageAt > 15_000/);
  assert.match(server, /needsTextReconciliation[\s\S]*\['enhance', 'motionPrompt', 'smartMask'\]/);
  assert.match(server, /comfyFetch\(`\/history\/\$\{pid\}`\)/);
  assert.match(server, /qwenedit: \['qwen'\]/);
  assert.match(server, /klein: \['klein4', 'klein9'\]/);
  assert.match(server, /NODE_PACKS: DEPENDENCY_NODE_PACKS/);
  assert.match(server, /dependencyComponentInfo\(id/);
  assert.match(app, /installState\?\.downloadMethod === 'hf-xet'/);
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

test('an explicit post-restart check clears stale restart-required state', () => {
  assert.match(server, /url\.searchParams\.has\('afterRestart'\)/);
  assert.match(server, /dependencyInstallState\.components/);
  assert.match(server, /checkedComponents\.filter\(\(component\) => missingComponents\.includes\(component\)\)/);
  assert.match(server, /Still needed: \$\{checkedMissingLabels\.join\(', '\)\}/);
  assert.match(server, /restartRequired: false/);
  assert.match(app, /loadMeta\(true, true\)/);
});

test('Settings presents a compact dependency manager with progress and restart controls', () => {
  assert.match(html, /id="dependencyManagerCard"/);
  assert.match(html, /id="dependencyInstallMissing"/);
  assert.match(html, /id="dependencyCancelInstall"/);
  assert.match(html, /id="dependencyToggleAll"/);
  assert.match(html, /id="dependencyRepairMissing"/);
  assert.match(html, /id="dependencyRestartComfy"/);
  assert.match(html, /id="dependencyProgress"/);
  assert.match(html, /id="dependencyAccess"/);
  assert.match(html, /id="dependencyAccessLink" target="_blank" rel="noopener noreferrer"/);
  assert.match(app, /function renderDependencyManager\(\)/);
  assert.match(app, /function imageGenerationReady\(\)/);
  assert.match(app, /Image generation is ready\. \$\{missing\.length\} additional workflow/);
  assert.match(app, /dependencySelectedComponents = new Set\(\)/,
    'additional workflows should require an intentional selection');
  assert.match(app, /function dependencyAccessUrl\(installState\)/);
  assert.match(app, /function renderDependencyAccess\(containerSelector, linkSelector, installState\)/);
  assert.match(app, /value\.protocol !== 'https:' \|\| value\.hostname\.toLowerCase\(\) !== 'huggingface\.co'/);
  assert.match(app, /link\.href = accessUrl/);
  assert.match(app, /link\.removeAttribute\('href'\)/);
  assert.match(app, /Retry selected/);
  assert.match(app, /function scheduleDependencyPoll\(\)/);
  assert.match(app, /Repair selected/);
  assert.match(app, /formatDependencyBytes/);
  assert.match(app, /dependencyProgressMetrics/);
  assert.match(app, /progressMetrics\.label/);
  assert.match(app, /selectedDependencyIds/);
  assert.match(app, /\/api\/dependencies\/cancel/);
  assert.match(app, /restart\.hidden = !state\.profileIsOwner/);
  assert.match(app, /restart\.disabled = busy \|\| !restartInfo\.canRestart/);
  assert.match(app, /Restart ComfyUI\?/);
  assert.match(css, /\.dependency-progress/);
  assert.match(css, /\.dependency-option\.selected/);
  assert.match(css, /\.dependency-cancel/);
  assert.match(css, /\.dependency-restart\.needed/);
  assert.match(css, /\.dependency-access\[hidden\]/);
  assert.match(css, /\.dependency-access-link:focus-visible/);
  assert.match(css, /@keyframes dependencyProgress/);
});

test('custom-node requirements fall back to uv for pip-less and broken portable environments', async () => {
  for (const pipMessage of [
    'No module named pip',
    "No such file or directory: 'D:\\\\a\\\\ComfyUI\\\\cu130_python_deps\\\\numpy.whl'",
  ]) {
    const calls = [];
    const reports = [];
    await installNodeRequirements(
      { pythonPath: 'comfy-python', basePath: 'ComfyUI' },
      'requirements.txt',
      false,
      (phase, message) => reports.push([phase, message]),
      {
        run: async (command, args) => {
          calls.push([command, args]);
          if (args[1] === 'pip') throw new Error(pipMessage);
          return '';
        },
      }
    );
    assert.deepEqual(calls[0], ['comfy-python', ['-m', 'pip', 'install', '--upgrade-strategy', 'only-if-needed', '-r', 'requirements.txt']]);
    assert.deepEqual(calls[1], ['comfy-python', ['-m', 'uv', 'pip', 'install', '--python', 'comfy-python', '-r', 'requirements.txt']]);
    assert.equal(reports[0][0], 'requirements-fallback');
  }
});

test('a loaded Windows OpenCV binary reports a specific retry path', async () => {
  await assert.rejects(installNodeRequirements(
    { pythonPath: 'comfy-python', basePath: 'ComfyUI' },
    'requirements.txt',
    false,
    () => {},
    { run: async () => { throw new Error("[WinError 5] Access is denied: 'cv2.pyd'"); } },
  ), (error) => error.code === 'dependency_requirements_locked' && /stop ComfyUI completely/i.test(error.message));
});

test('one conflicting node pack does not block unrelated selected workflows', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-node-isolation-'));
  const customNodesPath = path.join(rootDir, 'custom_nodes');
  const pythonPath = path.join(rootDir, '.venv', 'Scripts', 'python.exe');
  const conflictPath = path.join(customNodesPath, NODE_PACKS.krea2Edit.folder);
  try {
    fs.mkdirSync(path.join(conflictPath, '.git'), { recursive: true });
    fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'models'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'main.py'), '');
    fs.writeFileSync(pythonPath, '');
    const availableModelNames = MODEL_ASSETS.image.map((asset) => asset[2].split('/').pop());
    const result = await installComponents({
      runtime: { comfy: { path: rootDir, modelsPath: path.join(rootDir, 'models') } },
      settings: {},
      components: ['krea2ref', 'image'],
      options: {
        disableHfAcceleration: true,
        availableModelNames,
        run: async (_command, args) => args.includes('get-url') ? 'https://github.com/example/unreviewed-krea-edit.git' : '',
        fetch: async () => { throw new Error('registered models must not download'); },
      },
    });
    assert.deepEqual(result.components, ['image']);
    assert.deepEqual(result.requestedComponents, ['krea2ref', 'image']);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, 'dependency_node_source_mismatch');
    assert.equal(result.failures[0].nodePath, conflictPath);
    assert.equal(result.failures[0].actualRepo, 'https://github.com/example/unreviewed-krea-edit.git');
    assert.equal(result.completed, MODEL_ASSETS.image.length);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('exact LoRA strength entry accepts decimal values', () => {
  assert.match(app, /label: 'Strength · -100 to 100'[\s\S]{0,180}min: -100, max: 100, step: 0\.05, inputMode: 'decimal'/);
  assert.match(server, /strength: clampNum\(lora\.strength, -100, 100, 1\)/);
  assert.match(app, /inputOptions\.inputMode[\s\S]{0,100}input\.inputMode/);
});

test('connected portable setup asks for its local folder instead of launching ComfyUI Desktop', () => {
  assert.match(app, /canInstallOfficial && !setupViewStatus\.comfy\?\.connected/);
  assert.match(app, /ComfyUI is connected\. Choose its local ComfyUI folder/);
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
  const loader = fs.readFileSync(path.join(root, 'lib', 'model-loader.js'), 'utf8');
  assert.match(loader, /spec\[0\] === 'COMBO' && Array\.isArray\(spec\[1\]\?\.options\)/);
  assert.match(server, /adoptRegisteredModelPaths\(info\)/);
  assert.match(server, /consistencyLora: modelStatus\(info, 'LoraLoaderModelOnly', 'lora_name', settings\.klein4ConsistencyLora/);
  assert.match(server, /consistencyLora: modelStatus\(info, 'LoraLoaderModelOnly', 'lora_name', settings\.klein9ConsistencyLora/);
});

test('node installs constrain only the protected runtime instead of freezing packaging tools', () => {
  assert.deepEqual(
    requirementsArgs('requirements.txt', false, { constraintFile: 'runtime-constraints.txt' }).slice(-4),
    ['--constraint', 'runtime-constraints.txt', '-r', 'requirements.txt']
  );
  assert.equal(requirementsArgs('requirements.txt', true, { constraintFile: 'before-install.freeze.txt' }).includes('--constraint'), false);
  const constraints = protectedRuntimeConstraints([
    'torch==2.11.0+cu128', 'torchvision==0.26.0+cu128', 'numpy==2.2.6',
    'opencv-python==4.12.0.88', 'setuptools==83.0.0', 'pip==26.0.1',
    'diffusers==0.39.0', 'transformers==4.57.6',
  ].join('\n'));
  assert.match(constraints, /torch==2\.11\.0\+cu128/);
  assert.match(constraints, /numpy==2\.2\.6/);
  assert.match(constraints, /opencv-python==4\.12\.0\.88/);
  assert.doesNotMatch(constraints, /setuptools|pip|diffusers|transformers/i);
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

test('normal node installs preserve the OpenCV distribution already loaded by ComfyUI', () => {
  const filtered = filterRequirementsForEnvironment([
    'numpy>=2', 'opencv-python-headless>=4.9', 'color-matcher', 'torch',
  ].join('\n'), [
    'numpy==2.2.6', 'opencv-python==4.12.0.88', 'torch==2.11.0',
  ].join('\n'));
  assert.equal(filtered, 'color-matcher');
});

test('macOS BFS setup omits optional librosa without omitting Face ID requirements', () => {
  const filtered = filterRequirementsForEnvironment([
    'torch', 'numpy', 'librosa', 'opencv-python', 'insightface==0.7.3', 'onnxruntime',
  ].join('\n'), '', { omitPackages: ['librosa'] });
  assert.doesNotMatch(filtered, /librosa/);
  assert.match(filtered, /insightface==0\.7\.3/);
  assert.match(filtered, /onnxruntime/);
});

test('BFS optional audio import is guarded idempotently', async () => {
  const nodePath = fs.mkdtempSync(path.join(os.tmpdir(), 'mixbox-bfs-patch-'));
  const init = path.join(nodePath, '__init__.py');
  try {
    fs.writeFileSync(init, [
      'from .amv_guide_node import NODE_CLASS_MAPPINGS as AMV_NODE_CLASS_MAPPINGS',
      'from .amv_guide_node import NODE_DISPLAY_NAME_MAPPINGS as AMV_NODE_DISPLAY_NAME_MAPPINGS',
      'NODE_CLASS_MAPPINGS = {**AMV_NODE_CLASS_MAPPINGS}',
    ].join('\n'));
    assert.equal(await patchBfsOptionalAudio(nodePath), true);
    const patched = fs.readFileSync(init, 'utf8');
    assert.match(patched, /try:\n    from \.amv_guide_node/);
    assert.match(patched, /AMV Guide node not loaded/);
    assert.equal(await patchBfsOptionalAudio(nodePath), false);
  } finally {
    fs.rmSync(nodePath, { recursive: true, force: true });
  }
});
