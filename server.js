#!/usr/bin/env node
/*
 * Mix Studio - mobile-first ComfyUI generation app
 * Zero-dependency Node server (Node >= 20 recommended, >= 22 for live progress).
 * Serves a mobile-first web app; ComfyUI does the heavy lifting.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { updateFromGit } = require('./lib/app-update');
const { resolveRuntimeConfig } = require('./lib/runtime-config');
const { sam3InstallStatus } = require('./lib/sam3-installer');
const { COMPONENTS: DEPENDENCY_COMPONENTS, availableComponents, installComponents } = require('./lib/dependency-installer');
const { restartComfy, restartStatus } = require('./lib/comfy-restart');
const { normalizeGenerationDefaults, normalizeContextOverrides, mergeContextOverrides } = require('./lib/user-preferences');
const {
  EDIT_FEATURES,
  VIDEO_FEATURES,
  DEFAULT_FEATURES,
  normalizeFeatures,
} = require('./lib/features');
const {
  DEFAULT_PRIVATE_PASSWORD,
  galleryPassword,
  galleryView,
  setFolderLocked,
  canMoveToFolder,
  parseCookies,
} = require('./lib/private-gallery');
const { comfyResetRequests } = require('./lib/comfy-reset');
const {
  assessQueueHealth,
  parseNvidiaSmiCsv,
} = require('./lib/queue-health');
const { classifyLora } = require('./lib/lora-compat');
const { buildLoraContext } = require('./lib/lora-context');
const {
  DEFAULT_SEEDVR2_DIT,
  normalizeSeedVr2Defaults,
  installedSeedVr2Models,
  seedVr2Profile,
  seedVr2DitInputs,
  targetResolutionForUpscale,
  rtxVideoSuperResolutionNode,
  ULTIMATE_SD_UPSCALE_MODEL,
  buildUltimateSdUpscaleGraph,
} = require('./lib/upscale-workflows');
const { IMAGE_RECREATION_INSTRUCTION } = require('./lib/image-prompt');
const {
  ENHANCE_TAIL,
  promptEnhanceParts,
} = require('./lib/prompt-enhance');
const { buildDepthMapNodes, buildDepthPreviewGraph, buildKrea2DepthControl, buildKrea2LatentInput } = require('./lib/krea2-workflows');
const { detectAudioStream } = require('./lib/media-inspection');
const { normalizeEditSequence, supportsSequentialEdit } = require('./lib/edit-sequence');
const { normalizeQwenEditQuality, qwenEditPreset } = require('./lib/qwen-edit');
const { normalizeEditAngle, supportsEditAngles, editAnglePrompt } = require('./lib/edit-angle');
const {
  appendEditMaskNodes,
  appendEditMaskComposite,
  buildSam3MaskGraph,
  SAM3_MASK_CLASSES,
  supportsEditMask,
  localizedEditPrompt,
  maskExpand,
  maskInfluence,
  maskInfluenceDenoise,
} = require('./lib/edit-mask');
const {
  scailMode,
  normalizeScailChunkOptions,
  scailDurationSeconds,
  scailFramesForSeconds,
  scailInfinityMaskArgs,
  scailInfinitySamTrackArgs,
  scailMaskArgs,
  scailSegments,
  scailSamTrackArgs,
  videoProcessInfo,
} = require('./lib/video-workflows');
const {
  buildRegionalT2IGraph,
  buildKrea2InpaintGraph,
  hasActiveRegions,
  normalizeRegions,
} = require('./lib/regional-workflows');
const { nodeLabelForJob } = require('./lib/progress-labels');
const { decodePreviewPayload } = require('./lib/preview-payload');
const { selectionAssetRefs, selectionSummary } = require('./lib/selection-summary');
const { streamStoredZip } = require('./lib/zip-stream');
const { mobileAccessAddresses } = require('./lib/mobile-access');
const { hardwareInfo } = require('./lib/hardware-info');
const {
  normalizeExportDirectory,
  validateExportDirectory,
  copyToExportDirectory,
} = require('./lib/export-location');
const {
  PROFILE_COOKIE,
  hashPin,
  verifyPin,
  signProfileId,
  parseProfileToken,
  publicProfile,
  adoptOrphans,
  hasOrphans,
} = require('./lib/profiles');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const RUNTIME = resolveRuntimeConfig(ROOT);
const DATA = RUNTIME.dataDir;
const IMAGES = path.join(DATA, 'images');
const VIDEOS = path.join(DATA, 'videos');
const PORT = Number(process.env.PORT || 3300);

fs.mkdirSync(IMAGES, { recursive: true });
fs.mkdirSync(VIDEOS, { recursive: true });
const FACES = path.join(DATA, 'faces');
fs.mkdirSync(FACES, { recursive: true });
const AVATARS = path.join(DATA, 'avatars');
fs.mkdirSync(AVATARS, { recursive: true });
const LORATHUMBS = path.join(DATA, 'lorathumbs');
fs.mkdirSync(LORATHUMBS, { recursive: true });

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const SETTINGS_FILE = path.join(DATA, 'settings.json');
const DEFAULT_SYSTEM_PROMPT = `You are an expert prompt engineer for text-to-image models. Your task is to expand the user's prompt into a highly effective image-generation prompt.

Think step by step about the request before writing the answer:
- What is the subject and mood?
- What visual styles, mediums, and lighting options would fit? Consider two or three alternatives and pick the one that best serves the caption.
- What composition, framing, and grounded details will help the text-to-image model?

Then output a single expanded prompt paragraph.

Follow these rules strictly:
1. **Faithfulness First:** When the user supplies a concrete scene, preserve all original subjects, actions, colors, and spatial relationships. When the user instead supplies an abstract concept or asks you to invent an image, creatively resolve it into one specific visual scene and add the details needed to express that idea.
2. **Practical T2I Structure:** Write a prompt that a text-to-image model can parse cleanly. Group subjects with their own attributes and actions. Use grounded phrasing for poses, interactions, and spatial layout.
3. **Style Planning Stays Internal:** Use your internal reasoning to choose style, medium, framing, and lighting. Do not emit planning tags or wrappers in the visible answer body.
4. **Text Rendering:** If the user requests visible text, quotes, labels, or typography, specify the exact text clearly and wrap requested words in quotes.
5. **Avoid Over-Specification:** Do not invent highly specific clothing, colors, materials, or scene details unless the input supports them.
6. **Structure:** Write one cohesive paragraph after the thinking block. No bullets, JSON, or markdown.
7. **Respect Existing Detail:** If the user's prompt is already detailed, lightly polish and finalize rather than heavily expanding - preserve their phrasing and direction.
8. **Respect the Human Form:** Treat depictions of people with dignity. Assume clothing covers genitals and intimate anatomy.
9. **Preserve User Medium:** When the user explicitly requests a medium (e.g. "photo of", "photograph of", "illustration of", "painting of", "sketch of", "3D render of"), honor it. Do not pivot to a different medium to avoid difficulty - match the user's stated intent.

User's Input:`;

const DEFAULT_SETTINGS = {
  comfyUrl: RUNTIME.comfy.url || 'http://127.0.0.1:8188',
  unet: 'krea2_turbo_fp8_scaled.safetensors',
  krea2RawUnet: 'krea2_raw_fp8_scaled.safetensors',
  krea2TurboLora: 'krea2_turbo_lora_rank_64_bf16.safetensors',
  krea2DepthLora: 'depth-control-lora.safetensors',
  depthAnythingV3Model: 'da3_large.safetensors',
  clip: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
  clipType: 'krea2',
  vae: 'qwen_image_vae.safetensors',
  seedvr2Dit: DEFAULT_SEEDVR2_DIT,
  seedvr2Vae: 'ema_vae_fp16.safetensors',
  seedvr2Attention: 'sdpa',
  kleinUnet: 'flux-2-klein-4b.safetensors',
  kleinClip: 'qwen_3_4b.safetensors',
  klein4Unet: 'flux-2-klein-4b.safetensors',
  klein4Clip: 'qwen_3_4b.safetensors',
  klein9Unet: 'flux-2-klein-9b-fp8.safetensors',
  klein9Clip: 'qwen_3_8b_fp8mixed.safetensors',
  kleinVae: 'flux2-vae.safetensors',
  qwenEditUnet: 'qwen_image_edit_2511_bf16.safetensors',
  qwenEditClip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
  qwenEditLora: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
  qwenEditAnglesLora: 'qwen_image_edit_2511_multiple-angles-lora.safetensors',
  ltxCkpt: 'ltx-2.3-22b-dev-fp8.safetensors',
  ltxDistilledLora: 'ltx-2.3-22b-distilled-lora-384.safetensors',
  ltxEditLora: 'edit_anything_v1.1_r256.safetensors',
  ltxTextEncoder: 'gemma_3_12B_it_fp4_mixed.safetensors',
  ltxGemmaLora: 'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors',
  ltxUpscaler: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
  wanHighUnet: 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
  wanLowUnet: 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors',
  wanClip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  wanVae: 'wan_2.1_vae.safetensors',
  wanHighLora: 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors',
  wanLowLora: 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors',
  erosCkpt: '10Eros_v1.2_fp8mixed_learned.safetensors',
  erosTextEncoder: 'gemma-3-12b-it-ablit-norms-biproj-fp8mixed.safetensors',
  erosDmdLora: 'LTX2.3_DMD_reshaped_r256.safetensors',
  erosSigmasFirst: '',
  erosSigmasUpscale: '',
  ltxFaceIdLora: 'Best_FaceID_v1.0_LoRA.safetensors',
  ltxFaceIdDistilledLora: 'ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors',
  scailUnet: 'wan2.1_14B_SCAIL_2_fp8_scaled.safetensors',
  scailLora: 'Wan2.1\\Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors',
  scailPusaLora: 'Pusa\\Wan21_PusaV1_LoRA_14B_rank512_bf16.safetensors',
  scailClipVision: 'clip_vision_h.safetensors',
  scailSam: 'sam3.1_multiplex_fp16.safetensors',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  galleryPassword: DEFAULT_PRIVATE_PASSWORD,
  exportDir: '',
  // Existing installs default every optional workflow on. The installer writes
  // explicit choices only for a brand-new machine.
  features: DEFAULT_FEATURES,
};

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJsonSync(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function normalizeSettings(s) {
  normalizeSeedVr2Defaults(s);
  if (!s.klein4Unet) s.klein4Unet = s.kleinUnet || DEFAULT_SETTINGS.klein4Unet;
  if (!s.klein4Clip) s.klein4Clip = s.kleinClip || DEFAULT_SETTINGS.klein4Clip;
  if (!s.klein9Unet) s.klein9Unet = DEFAULT_SETTINGS.klein9Unet;
  if (!s.klein9Clip) s.klein9Clip = DEFAULT_SETTINGS.klein9Clip;
  if (!s.kleinUnet) s.kleinUnet = s.klein4Unet;
  if (!s.kleinClip) s.kleinClip = s.klein4Clip;
  s.galleryPassword = galleryPassword(s);
  try { s.exportDir = normalizeExportDirectory(s.exportDir); } catch { s.exportDir = ''; }
  s.features = normalizeFeatures(s.features);
  return s;
}

let settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, loadJson(SETTINGS_FILE, {})));

function seedVr2ModelDirs() {
  const roots = [
    process.env.KREASTUDIO_SEEDVR2_DIR,
    process.env.COMFYUI_SEEDVR2_DIR,
  ];
  const modelRoot = process.env.COMFYUI_MODEL_ROOT || RUNTIME.comfy.modelsPath;
  if (modelRoot) {
    roots.push(path.join(modelRoot, 'SEEDVR2'), path.join(modelRoot, 'seedvr2'));
  }
  if (RUNTIME.comfy.path) {
    roots.push(
      path.join(RUNTIME.comfy.path, 'models', 'SEEDVR2'),
      path.join(RUNTIME.comfy.path, 'models', 'seedvr2')
    );
  }
  const home = os.homedir();
  roots.push(
    path.join(home, 'Documents', 'ComfyUI', 'models', 'SEEDVR2'),
    path.join(home, 'Documents', 'ComfyUI', 'models', 'seedvr2')
  );
  return [...new Set(roots.filter(Boolean))];
}

/* ------------------------------------------------------------------ */
/* Gallery DB                                                          */
/* ------------------------------------------------------------------ */

const DB_FILE = path.join(DATA, 'db.json');
let db = loadJson(DB_FILE, { folders: [], items: [] });
let dbSaveTimer = null;
function saveDb() {
  clearTimeout(dbSaveTimer);
  dbSaveTimer = setTimeout(() => saveJsonSync(DB_FILE, db), 150);
}
function uid() { return crypto.randomBytes(8).toString('hex'); }

const PRIVATE_COOKIE = 'ks_private';
const privateUnlockToken = crypto.randomBytes(18).toString('hex');

function isPrivateUnlocked(req) {
  return parseCookies(req.headers.cookie || '')[PRIVATE_COOKIE] === privateUnlockToken;
}

function privateCookie(value, maxAge) {
  const encoded = encodeURIComponent(value || '');
  return `${PRIVATE_COOKIE}=${encoded}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

/** Video track dimensions from an MP4 buffer (tkhd box). Needed to build
 *  even-dimension composites — libx264 refuses odd widths/heights. */
function mp4Dims(buf) {
  for (let i = 4; i < buf.length - 100; i++) {
    if (buf[i] === 0x74 && buf[i + 1] === 0x6b && buf[i + 2] === 0x68 && buf[i + 3] === 0x64) { // 'tkhd'
      const size = buf.readUInt32BE(i - 4);
      const ver = buf[i + 4];
      if (!((ver === 0 && size === 92) || (ver === 1 && size === 104))) continue;
      const wOff = (i - 4) + (ver === 1 ? 96 : 84);
      if (wOff + 8 > buf.length) continue;
      const w = buf.readUInt32BE(wOff) >>> 16;
      const h = buf.readUInt32BE(wOff + 4) >>> 16;
      if (w > 0 && h > 0 && w < 16384 && h < 16384) return { w, h }; // audio tracks report 0x0
    }
  }
  return null;
}

/** JPEG dimensions from SOF markers (phone photos arrive as JPEG). */
function jpegDims(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) { off++; continue; }
    const marker = buf[off + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
    }
    const len = buf.readUInt16BE(off + 2);
    if (len < 2) return null;
    off += 2 + len;
  }
  return null;
}

function imageDims(buf) {
  return pngDims(buf) || jpegDims(buf);
}

/** Actual pixel dimensions from a PNG buffer (IHDR). Edit pipelines snap
 *  output to their own resolution buckets, so recorded request dims can lie. */
function pngDims(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return w > 0 && h > 0 ? { w, h } : null;
}

// Migrate legacy single-video items to the videos[] array
{
  let migrated = false;
  if (!Array.isArray(db.folders)) db.folders = [];
  if (!Array.isArray(db.items)) db.items = [];
  for (const f of db.folders) f.locked = !!f.locked;
  for (const it of db.items) {
    if (it.video) {
      it.videos = (Array.isArray(it.videos) ? it.videos : []).concat([
        { id: uid(), file: it.video, createdAt: it.createdAt || Date.now(), info: it.videoInfo || {} },
      ]);
      delete it.video;
      delete it.videoInfo;
      migrated = true;
    }
    if (!Array.isArray(it.videos)) it.videos = [];
  }
  if (migrated) saveJsonSync(DB_FILE, db);
}
if (!Array.isArray(db.history)) db.history = [];
if (!Array.isArray(db.loraPresets)) db.loraPresets = [];
if (!Array.isArray(db.userPreferences)) db.userPreferences = [];
if (!Array.isArray(db.faces)) db.faces = [];

/* ---------------------- Profiles (accounts) ------------------------ */
// Signing secret persists so logins survive server restarts
const AUTH_SECRET_FILE = path.join(DATA, 'auth_secret.txt');
let AUTH_SECRET;
try {
  AUTH_SECRET = fs.readFileSync(AUTH_SECRET_FILE, 'utf8').trim();
  if (!AUTH_SECRET) throw new Error('empty');
} catch {
  AUTH_SECRET = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(AUTH_SECRET_FILE, AUTH_SECRET);
}
if (!db.loraThumbs || typeof db.loraThumbs !== 'object') db.loraThumbs = {};
if (!Array.isArray(db.profiles)) db.profiles = [];
{
  // Migration from the pre-profiles era: if content exists that nobody owns,
  // create an owner profile and adopt it. Fresh installs (empty db) skip this
  // and go straight to the create-profile gate in the UI.
  if (!db.profiles.length && hasOrphans(db)) {
    db.profiles.push({ id: uid(), name: 'Owner', pinHash: null, pinSalt: null, createdAt: Date.now() });
    console.log('[profiles] created default profile "Owner" for existing content');
  }
  const adopted = db.profiles.length ? adoptOrphans(db, db.profiles[0].id) : 0;
  if (adopted) {
    console.log(`[profiles] assigned ${adopted} existing entr${adopted === 1 ? 'y' : 'ies'} to "${db.profiles[0].name}"`);
  }
  saveJsonSync(DB_FILE, db);
}

/* Rolling db backups: on boot and every 30 minutes, keep the last 40.
   (Added after the profile-deletion incident — never again.) */
const BACKUPS = path.join(DATA, 'backups');
fs.mkdirSync(BACKUPS, { recursive: true });
function backupDb(tag) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DB_FILE, path.join(BACKUPS, `db-${stamp}${tag ? '-' + tag : ''}.json`));
    const all = fs.readdirSync(BACKUPS).filter((f) => f.startsWith('db-')).sort();
    while (all.length > 40) fs.unlinkSync(path.join(BACKUPS, all.shift()));
  } catch (e) { console.error('[backup]', e.message); }
}
backupDb('boot');
setInterval(() => backupDb(''), 30 * 60 * 1000);

function currentProfile(req) {
  const cookies = parseCookies(req.headers.cookie);
  const id = parseProfileToken(cookies[PROFILE_COOKIE], AUTH_SECRET);
  if (!id) return null;
  return db.profiles.find((p) => p.id === id) || null;
}

function profileCookie(token, maxAge) {
  return `${PROFILE_COOKIE}=${encodeURIComponent(token || '')}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

// One-time repair: recorded dims can differ from the actual file (edit
// pipelines snap to resolution buckets). Reads 24 bytes per image.
(async () => {
  let fixed = 0;
  for (const it of db.items) {
    if (!it.file) continue;
    try {
      const fh = await fsp.open(path.join(IMAGES, it.file), 'r');
      const b = Buffer.alloc(24);
      await fh.read(b, 0, 24, 0);
      await fh.close();
      const d = pngDims(b);
      if (d && (d.w !== it.width || d.h !== it.height)) {
        it.width = d.w;
        it.height = d.h;
        fixed++;
      }
    } catch { /* file missing; leave as-is */ }
  }
  if (fixed) {
    saveDb();
    console.log(`[dims] corrected stored dimensions on ${fixed} item(s)`);
  }
})();

function pushHistory(entry) {
  db.history.unshift(Object.assign({ ts: Date.now() }, entry));
  if (db.history.length > 50) db.history.length = 50;
  saveDb();
}

/* ------------------------------------------------------------------ */
/* SSE                                                                 */
/* ------------------------------------------------------------------ */

const sseClients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch { /* noop */ } }
}

/* ------------------------------------------------------------------ */
/* ComfyUI bridge                                                      */
/* ------------------------------------------------------------------ */

const CLIENT_ID = 'kreastudio-' + crypto.randomBytes(6).toString('hex');
const jobs = new Map(); // promptId -> job
const queueHealthState = { lowGpuSince: null };
let dependencyInstallRunning = false;
let comfyRestartRunning = false;
let dependencyInstallState = {
  state: 'idle',
  phase: 'idle',
  message: 'No dependency installation is running.',
  completed: 0,
  total: 0,
  restartRequired: false,
  error: null,
  updatedAt: Date.now(),
};

function updateDependencyInstallState(patch) {
  dependencyInstallState = Object.assign({}, dependencyInstallState, patch, { updatedAt: Date.now() });
  broadcast('dependencyInstall', dependencyInstallState);
}

async function assertDesktopIsIdle() {
  if (jobs.size) throw new Error('Wait for the Mix Studio queue to finish before changing desktop dependencies.');
  try {
    const queue = await (await comfyFetch('/queue')).json();
    if ((queue.queue_running || []).length || (queue.queue_pending || []).length) {
      throw new Error('Wait for the ComfyUI queue to finish before changing desktop dependencies.');
    }
  } catch (error) {
    if (/Wait for the ComfyUI queue/.test(String(error.message || error))) throw error;
    // A stopped ComfyUI instance is recoverable during dependency installation.
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForComfyReconnect(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await comfyFetch('/system_stats');
      return true;
    } catch { await pause(1500); }
  }
  return false;
}

function trackJob(pid, job) {
  const now = Date.now();
  jobs.set(pid, Object.assign({ enqueuedAt: now, startedAt: null }, job));
}

function jobBaseTime(job) {
  return job && (job.startedAt || job.enqueuedAt || job.createdAt) || Date.now();
}

function jobDurationMs(job, now = Date.now()) {
  return Math.max(0, now - jobBaseTime(job));
}

function queueEntryCreatedAt(entry) {
  const t = entry && entry[3] && Number(entry[3].create_time);
  return Number.isFinite(t) && t > 0 ? t : null;
}

function describeQueueEntry(entry, running) {
  const now = Date.now();
  const pid = entry[1];
  const job = jobs.get(pid);
  const createdAt = queueEntryCreatedAt(entry);
  const startedAt = running ? (job && (job.startedAt || createdAt)) || createdAt || now : null;
  const queuedAt = (job && job.enqueuedAt) || createdAt || now;
  return {
    jobId: pid,
    kind: job ? job.kind : 'external',
    itemId: job ? (job.itemId || null) : null,
    label: jobLabel(job),
    queuedAt,
    startedAt,
    elapsedMs: now - (running ? (startedAt || queuedAt) : queuedAt),
    durationMs: now - (running ? (startedAt || queuedAt) : queuedAt),
  };
}

function readGpuStats() {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=utilization.gpu,memory.used,memory.total,power.draw', '--format=csv,noheader,nounits'],
      { timeout: 4000 },
      (err, stdout) => {
        if (err) return resolve(null);
        resolve(parseNvidiaSmiCsv(stdout));
      }
    );
  });
}

async function queueHealth(running, pending) {
  const now = Date.now();
  const gpu = await readGpuStats();
  const longestRunningMs = running.reduce((max, job) => Math.max(max, Number(job.elapsedMs) || 0), 0);
  const assessed = assessQueueHealth({
    runningCount: running.length,
    pendingCount: pending.length,
    longestRunningMs,
    gpu,
    now,
    lowGpuSince: queueHealthState.lowGpuSince,
  });
  queueHealthState.lowGpuSince = assessed.lowGpuSince;
  return Object.assign({
    gpu,
    runningCount: running.length,
    pendingCount: pending.length,
    longestRunningMs,
  }, assessed);
}

async function comfyFetch(p, opts) {
  const url = settings.comfyUrl.replace(/\/$/, '') + p;
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ComfyUI ${p} -> ${res.status} ${text.slice(0, 400)}`);
  }
  return res;
}

let objectInfoCache = null;
let objectInfoAt = 0;
async function getObjectInfo(force) {
  if (!force && objectInfoCache && Date.now() - objectInfoAt < 5 * 60 * 1000) return objectInfoCache;
  const res = await comfyFetch('/object_info');
  objectInfoCache = await res.json();
  objectInfoAt = Date.now();
  return objectInfoCache;
}

function comboList(info, cls, field) {
  const spec = info[cls]?.input?.required?.[field] || info[cls]?.input?.optional?.[field];
  if (!Array.isArray(spec)) return [];
  if (Array.isArray(spec[0])) return spec[0];
  // Recent ComfyUI releases serialize DynamicCombo inputs as
  // ['COMBO', { options: [...] }] instead of putting choices in slot 0.
  // Accept both API shapes so installed models are not reported missing.
  return spec[0] === 'COMBO' && Array.isArray(spec[1]?.options) ? spec[1].options : [];
}

function modelStatus(info, cls, field, name, fallbackList) {
  const list = fallbackList || comboList(info, cls, field);
  return { name, ok: !name || list.includes(name) };
}

function modelStatusAny(info, name, choices, fallbackList) {
  const list = fallbackList || choices.flatMap(([cls, field]) => comboList(info, cls, field));
  return { name, ok: !name || list.includes(name) };
}

function scailInfinityStatus(info) {
  const loraList = comboList(info, 'LoraLoaderModelOnly', 'lora_name').length
    ? comboList(info, 'LoraLoaderModelOnly', 'lora_name')
    : comboList(info, 'LoraLoader', 'lora_name');
  return {
    node: { name: 'WanSCAILInfinity', ok: !!info.WanSCAILInfinity },
    pusa: {
      name: settings.scailPusaLora,
      ok: !!settings.scailPusaLora && loraList.includes(settings.scailPusaLora),
    },
  };
}

function scailInfinityError(info) {
  const status = scailInfinityStatus(info);
  if (!status.node.ok) {
    return 'SCAIL-2 Infinity needs the comfyui-scail2-infinity custom node installed and ComfyUI restarted.';
  }
  if (!status.pusa.ok) {
    return `SCAIL-2 Infinity needs the Pusa LoRA in ComfyUI loras: ${settings.scailPusaLora}`;
  }
  return null;
}

function configuredModelsStatus(info) {
  const loraList = comboList(info, 'LoraLoaderModelOnly', 'lora_name').length
    ? comboList(info, 'LoraLoaderModelOnly', 'lora_name')
    : comboList(info, 'LoraLoader', 'lora_name');
  return {
    krea2: {
      label: 'Krea 2',
      turbo: modelStatus(info, 'UNETLoader', 'unet_name', settings.unet),
      raw: modelStatus(info, 'UNETLoader', 'unet_name', settings.krea2RawUnet),
      turboLora: modelStatus(info, 'LoraLoader', 'lora_name', settings.krea2TurboLora, loraList),
    },
    krea2Depth: {
      label: 'Krea 2 Depth',
      lora: modelStatus(info, 'Krea2ControlLoRALoader', 'lora_name', settings.krea2DepthLora, loraList),
      depthModel: modelStatus(info, 'DownloadAndLoadDepthAnythingV3Model', 'model', settings.depthAnythingV3Model),
    },
    klein4: {
      label: 'Flux Klein 4B',
      unet: modelStatus(info, 'UNETLoader', 'unet_name', settings.klein4Unet),
      clip: modelStatus(info, 'CLIPLoader', 'clip_name', settings.klein4Clip),
      vae: modelStatus(info, 'VAELoader', 'vae_name', settings.kleinVae),
    },
    klein9: {
      label: 'Flux Klein 9B',
      unet: modelStatus(info, 'UNETLoader', 'unet_name', settings.klein9Unet),
      clip: modelStatus(info, 'CLIPLoader', 'clip_name', settings.klein9Clip),
      vae: modelStatus(info, 'VAELoader', 'vae_name', settings.kleinVae),
    },
    qwen: {
      label: 'Qwen Edit',
      unet: modelStatus(info, 'UNETLoader', 'unet_name', settings.qwenEditUnet),
      clip: modelStatus(info, 'CLIPLoader', 'clip_name', settings.qwenEditClip),
      vae: modelStatus(info, 'VAELoader', 'vae_name', settings.vae),
      lora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.qwenEditLora, loraList),
      angles: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.qwenEditAnglesLora, loraList),
    },
    upscale: {
      label: 'SeedVR2 Upscale',
      dit: { name: settings.seedvr2Dit, ok: installedSeedVr2Models(seedVr2ModelDirs()).includes(settings.seedvr2Dit) },
      vae: modelStatusAny(info, settings.seedvr2Vae, [['SeedVR2LoadVAEModel', 'model']]),
    },
    ltx: {
      label: 'LTX 2.3',
      checkpoint: modelStatus(info, 'CheckpointLoaderSimple', 'ckpt_name', settings.ltxCkpt),
      distilled: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.ltxDistilledLora, loraList),
      textEncoder: modelStatusAny(info, settings.ltxTextEncoder, [['LTXAVTextEncoderLoader', 'text_encoder']]),
      gemmaLora: modelStatus(info, 'LoraLoader', 'lora_name', settings.ltxGemmaLora, loraList),
      upscaler: modelStatus(info, 'LatentUpscaleModelLoader', 'model_name', settings.ltxUpscaler),
    },
    ltxEdit: {
      label: 'LTX Edit',
      lora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.ltxEditLora, loraList),
    },
    faceid: {
      label: 'LTX Face ID',
      faceLora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.ltxFaceIdLora, loraList),
      distilled: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.ltxFaceIdDistilledLora, loraList),
    },
    wan: {
      label: 'Wan 2.2',
      high: modelStatus(info, 'UNETLoader', 'unet_name', settings.wanHighUnet),
      low: modelStatus(info, 'UNETLoader', 'unet_name', settings.wanLowUnet),
      textEncoder: modelStatus(info, 'CLIPLoader', 'clip_name', settings.wanClip),
      vae: modelStatus(info, 'VAELoader', 'vae_name', settings.wanVae),
      highLora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.wanHighLora, loraList),
      lowLora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.wanLowLora, loraList),
    },
    eros: {
      label: '10Eros DMD',
      checkpoint: modelStatus(info, 'CheckpointLoaderSimple', 'ckpt_name', settings.erosCkpt),
      textEncoder: modelStatusAny(info, settings.erosTextEncoder, [['LTXAVTextEncoderLoader', 'text_encoder']]),
      lora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.erosDmdLora, loraList),
    },
    scail: {
      label: 'SCAIL 2',
      unet: modelStatus(info, 'UNETLoader', 'unet_name', settings.scailUnet),
      lightx: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.scailLora, loraList),
      clipVision: modelStatus(info, 'CLIPVisionLoader', 'clip_name', settings.scailClipVision),
      sam: modelStatus(info, 'CheckpointLoaderSimple', 'ckpt_name', settings.scailSam),
    },
    scailInfinity: Object.assign({ label: 'SCAIL 2 Infinity' }, scailInfinityStatus(info)),
  };
}

function missingDependencyComponentIds(missing, models) {
  const ids = new Set();
  const nodeToComponent = {
    regional: ['regional'],
    krea2ref: ['krea2ref'],
    smartmask: ['smartmask'],
    upscale: ['upscale'],
    ultimateupscale: ['ultimateupscale'],
    video: ['video'],
    videoedit: ['videoedit'],
    video4k: ['video4k'],
    wan: ['wan'],
    eros: ['eros'],
    scail: ['scail'],
    scailinfinity: ['scailinfinity'],
    faceid: ['faceid'],
    klein: ['klein4', 'klein9'],
    qwenedit: ['qwen'],
    krea2inpaint: ['image'],
    krea2depth: ['krea2depth'],
  };
  for (const [group, classes] of Object.entries(missing || {})) {
    if (Array.isArray(classes) && classes.length) for (const component of nodeToComponent[group] || []) ids.add(component);
  }
  const modelToComponent = { krea2: 'image', krea2Depth: 'krea2depth', klein4: 'klein4', klein9: 'klein9', qwen: 'qwen', upscale: 'upscale', ltx: 'video', ltxEdit: 'videoedit', faceid: 'faceid', wan: 'wan', eros: 'eros', scail: 'scail', scailInfinity: 'scailinfinity' };
  for (const [model, value] of Object.entries(models || {})) {
    const checks = Object.values(value || {}).filter((check) => check && typeof check === 'object' && Object.prototype.hasOwnProperty.call(check, 'ok'));
    if (checks.some((check) => !check.ok) && modelToComponent[model]) ids.add(modelToComponent[model]);
  }
  return [...ids];
}

const LORA_INFO_TTL = 5 * 60 * 1000;
let loraInfoCache = { key: '', at: 0, value: {} };

function uniqueExistingDirs(dirs) {
  const seen = new Set();
  const out = [];
  for (const dir of dirs.filter(Boolean)) {
    const full = path.resolve(dir);
    const key = full.toLowerCase();
    if (seen.has(key) || !fs.existsSync(full)) continue;
    seen.add(key);
    out.push(full);
  }
  return out;
}

function candidateLoraRoots() {
  return uniqueExistingDirs([
    process.env.COMFYUI_LORA_DIR,
    process.env.COMFYUI_MODELS_DIR ? path.join(process.env.COMFYUI_MODELS_DIR, 'loras') : '',
    process.env.COMFYUI_PATH ? path.join(process.env.COMFYUI_PATH, 'models', 'loras') : '',
    RUNTIME.comfy.modelsPath ? path.join(RUNTIME.comfy.modelsPath, 'loras') : '',
    RUNTIME.comfy.path ? path.join(RUNTIME.comfy.path, 'models', 'loras') : '',
    path.join(os.homedir(), 'Documents', 'ComfyUI', 'models', 'loras'),
    path.join(os.homedir(), 'ComfyUI', 'models', 'loras'),
  ]);
}

function resolveLoraPath(root, loraName) {
  const rel = String(loraName || '').replace(/[\\/]+/g, path.sep);
  const full = path.resolve(root, rel);
  const back = path.relative(root, full);
  if (!back || back.startsWith('..') || path.isAbsolute(back)) return null;
  return full;
}

async function readSafetensorsInfo(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const lenBuf = Buffer.alloc(8);
    const lenRead = await fh.read(lenBuf, 0, 8, 0);
    if (lenRead.bytesRead !== 8) return null;
    const headerLen = Number(lenBuf.readBigUInt64LE(0));
    if (!Number.isSafeInteger(headerLen) || headerLen <= 0 || headerLen > 4 * 1024 * 1024) return null;
    const headerBuf = Buffer.alloc(headerLen);
    const headerRead = await fh.read(headerBuf, 0, headerLen, 8);
    if (headerRead.bytesRead !== headerLen) return null;
    const header = JSON.parse(headerBuf.toString('utf8'));
    const metadata = header.__metadata__ || {};
    const keys = Object.keys(header).filter((k) => k !== '__metadata__').slice(0, 80);
    return { metadata, keys };
  } finally {
    await fh.close().catch(() => {});
  }
}

async function loraMetadataMap(loras, force) {
  const key = (loras || []).join('\n');
  if (!force && loraInfoCache.key === key && Date.now() - loraInfoCache.at < LORA_INFO_TTL) {
    return loraInfoCache.value;
  }
  const roots = candidateLoraRoots();
  const value = {};
  for (const name of loras || []) {
    let info = { name, metadata: {}, keys: [] };
    for (const root of roots) {
      const file = resolveLoraPath(root, name);
      if (!file || !fs.existsSync(file)) continue;
      try {
        info = Object.assign(info, await readSafetensorsInfo(file));
      } catch {
        // Header inspection is only for better filtering; filename fallback is fine.
      }
      break;
    }
    value[name] = { category: classifyLora(info) };
  }
  loraInfoCache = { key, at: Date.now(), value };
  return value;
}

function isWidgetSpec(spec) {
  if (!Array.isArray(spec)) return false;
  const t = spec[0];
  if (Array.isArray(t)) return true; // combo
  if (typeof t === 'string' && t.startsWith('COMFY_') && t.includes('COMBO')) return true; // V3 DynamicCombo
  return ['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO'].includes(t);
}

/**
 * Build a node's inputs by zipping ordered widget values against the node
 * class definition from /object_info. Used for nodes whose exact input
 * names vary between custom-node versions.
 */
async function nodeFromOrdered(classType, ordered, links = {}, overrides = {}) {
  const info = await getObjectInfo();
  const def = info[classType];
  if (!def) throw new Error(`ComfyUI is missing node class "${classType}" (install/enable the custom node).`);
  const entries = [
    ...Object.entries(def.input?.required || {}),
    ...Object.entries(def.input?.optional || {}),
  ];
  const inputs = {};
  let i = 0;
  for (const [name, spec] of entries) {
    if (links[name] !== undefined) { inputs[name] = links[name]; continue; }
    if (!isWidgetSpec(spec)) continue; // unlinked connection input -> omit
    if (Object.prototype.hasOwnProperty.call(overrides, name)) { inputs[name] = overrides[name]; i++; continue; }
    if (i < ordered.length) { inputs[name] = ordered[i++]; }
    else if (spec[1] && spec[1].default !== undefined) { inputs[name] = spec[1].default; }
  }
  for (const [k, v] of Object.entries(overrides)) if (!(k in inputs)) inputs[k] = v;
  return { class_type: classType, inputs };
}

/** Drop input keys the installed node class doesn't know about (core-node drift). */
async function filterInputs(graph) {
  const info = await getObjectInfo();
  for (const node of Object.values(graph)) {
    const def = info[node.class_type];
    if (!def) continue;
    const known = new Set([
      ...Object.keys(def.input?.required || {}),
      ...Object.keys(def.input?.optional || {}),
      ...Object.keys(def.input?.hidden || {}),
    ]);
    for (const key of Object.keys(node.inputs)) {
      if (!known.has(key) && !key.includes('.')) delete node.inputs[key];
    }
  }
  return graph;
}

async function uploadToComfy(buffer, filename) {
  const boundary = '----kreastudio' + crypto.randomBytes(8).toString('hex');
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const mid = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buffer, mid]);
  const res = await comfyFetch('/upload/image', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const json = await res.json();
  return (json.subfolder ? json.subfolder + '/' : '') + json.name;
}

async function queuePrompt(graph, options = {}) {
  const body = { prompt: graph, client_id: CLIENT_ID };
  if (options.front === true) body.front = true;
  const res = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.node_errors && Object.keys(json.node_errors).length) {
    throw new Error('ComfyUI validation: ' + JSON.stringify(json.node_errors).slice(0, 500));
  }
  return json.prompt_id;
}

/* --------------------------- WebSocket ---------------------------- */

let ws = null;
let wsTimer = null;
let lastPreviewAt = 0;

function ensureWs() {
  if (typeof WebSocket === 'undefined') return; // Node < 22 -> polling fallback
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  const url = settings.comfyUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws?clientId=' + CLIENT_ID;
  try { ws = new WebSocket(url); } catch { return scheduleWsRetry(); }
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    // ComfyUI 0.27 sends sampler previews through PREVIEW_IMAGE_WITH_METADATA
    // only after this first-message capability negotiation.
    try { ws.send(JSON.stringify({ type: 'feature_flags', data: { supports_preview_metadata: true } })); } catch { /* noop */ }
  };
  ws.onmessage = async (ev) => {
    if (typeof ev.data === 'string') {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      handleWsMessage(msg);
    } else {
      try {
        const data = ev.data;
        const buf = Buffer.isBuffer(data)
          ? data
          : (data instanceof ArrayBuffer
            ? Buffer.from(data)
            : (ArrayBuffer.isView(data)
              ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
              : (data && typeof data.arrayBuffer === 'function' ? Buffer.from(await data.arrayBuffer()) : null)));
        if (buf) handleWsBinary(buf);
      } catch (e) {
        console.warn('[preview] could not decode ComfyUI websocket frame:', e.message);
      }
    }
  };
  ws.onclose = scheduleWsRetry;
  ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
}
function scheduleWsRetry() {
  clearTimeout(wsTimer);
  if (jobs.size) wsTimer = setTimeout(ensureWs, 2000);
}

function handleWsMessage(msg) {
  const d = msg.data || {};
  const pid = d.prompt_id;
  if (msg.type === 'progress' && pid && jobs.has(pid)) {
    broadcast('progress', { jobId: pid, value: d.value, max: d.max, nodeId: d.node ?? null, itemId: jobs.get(pid).itemId || null });
  } else if (msg.type === 'executing' && pid && jobs.has(pid)) {
    const job = jobs.get(pid);
    if (job && d.node !== null && !job.startedAt) job.startedAt = Date.now();
    if (d.node === null) completeJob(pid).catch((e) => failJob(pid, e.message));
    else broadcast('status', { jobId: pid, kind: job.kind, text: nodeLabel(pid, d.node), itemId: job.itemId || null });
  } else if (msg.type === 'execution_error' && pid && jobs.has(pid)) {
    failJob(pid, (d.exception_message || 'execution error') + (d.node_type ? ` (${d.node_type})` : ''));
  } else if (msg.type === 'execution_interrupted' && pid && jobs.has(pid)) {
    failJob(pid, 'Interrupted');
  }
}

function nodeLabel(pid, nodeId) {
  return nodeLabelForJob(jobs.get(pid), nodeId);
}

function handleWsBinary(buf) {
  const preview = decodePreviewPayload(buf);
  if (!preview) return;
  const now = Date.now();
  if (now - lastPreviewAt < 450) return;
  lastPreviewAt = now;
  broadcast('preview', {
    jobId: preview.metadata?.prompt_id || null,
    dataUrl: `data:${preview.mime};base64,${preview.image.toString('base64')}`,
  });
}

/* --------------------------- Job lifecycle ------------------------ */

function failJob(pid, message) {
  const job = jobs.get(pid);
  const durationMs = job ? jobDurationMs(job) : undefined;
  jobs.delete(pid);
  if (job && (job.kind === 'enhance' || job.kind === 'smartMask')) { job.reject(new Error(message)); return; }
  if (job && job.kind === 'upscale' && job.itemId) {
    const item = db.items.find((entry) => entry.id === job.itemId);
    if (item && item.upscalePending) {
      item.upscalePending = false;
      saveDb();
    }
  }
  pushHistory({ kind: 'error', profileId: job ? job.profileId : undefined, itemId: job ? (job.itemId || null) : null, label: `${jobLabel(job)} — ${String(message).slice(0, 80)}` });
  broadcast('jobError', { jobId: pid, kind: job ? job.kind : 'gen', itemId: job ? job.itemId : null, message, durationMs });
}

function findOutputFiles(outputs, extRe) {
  const files = [];
  for (const out of Object.values(outputs)) {
    for (const arr of Object.values(out)) {
      if (!Array.isArray(arr)) continue;
      for (const entry of arr) {
        if (entry && typeof entry === 'object' && typeof entry.filename === 'string'
          && entry.type === 'output' && extRe.test(entry.filename)) {
          files.push(entry);
        }
      }
    }
  }
  return files;
}

async function downloadOutput(entry) {
  return Buffer.from(await (await comfyFetch(
    `/view?filename=${encodeURIComponent(entry.filename)}&subfolder=${encodeURIComponent(entry.subfolder || '')}&type=output`
  )).arrayBuffer());
}

async function completeJob(pid) {
  const job = jobs.get(pid);
  if (!job) return;
  if (job.kind === 'smartMask') {
    // Keep this job in the Map until its output has been verified. The old
    // lifecycle removed it before checking /history, so a missing or delayed
    // SAM3 output could not reject the waiting browser request and appeared
    // to be stuck until its timeout.
    if (job.completing) return;
    job.completing = true;
    const res = await comfyFetch(`/history/${pid}`);
    const hist = (await res.json())[pid];
    if (!hist) return failJob(pid, 'SAM3 finished but ComfyUI did not return its history entry. Try again after ComfyUI is idle.');
    const files = findOutputFiles(hist.outputs || {}, /\.(png|jpg|jpeg|webp)$/i);
    if (!files.length) return failJob(pid, 'SAM3 finished without a mask image. Check the ComfyUI console for the SAM3 node error.');
    broadcast('status', { jobId: pid, kind: 'smartMask', text: 'Reading selected mask…', itemId: null });
    const dataUrls = await Promise.all(files.map(async (entry) => {
      const buf = await downloadOutput(entry);
      const ext = path.extname(entry.filename).toLowerCase();
      const mime = ext === '.webp' ? 'image/webp' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png');
      return `data:${mime};base64,${buf.toString('base64')}`;
    }));
    jobs.delete(pid);
    broadcast('status', { jobId: pid, kind: 'smartMask', text: 'Mask ready', itemId: null });
    job.resolve({ dataUrl: dataUrls[0], dataUrls });
    return;
  }
  const durationMs = jobDurationMs(job);
  jobs.delete(pid);
  const res = await comfyFetch(`/history/${pid}`);
  const hist = (await res.json())[pid];
  if (!hist) return failJob(pid, 'No history entry from ComfyUI');
  const outputs = hist.outputs || {};

  // text output (PreviewAny)
  let textOut = null;
  for (const out of Object.values(outputs)) {
    if (out && Array.isArray(out.text) && out.text.length) textOut = String(out.text[0]);
  }

  if (job.kind === 'enhance') {
    if (textOut === null) { job.reject(new Error('Prompt enhance produced no text')); return; }
    job.resolve(textOut);
    return;
  }

  if (job.kind === 'video') {
    const vids = findOutputFiles(outputs, /\.(mp4|webm|mov|mkv)$/i);
    if (!vids.length) return failJob(pid, 'ComfyUI produced no video file');
    const buf = await downloadOutput(vids[vids.length - 1]);
    let item;
    if (job.itemId) {
      item = db.items.find((it) => it.id === job.itemId);
      if (!item) return;
    } else {
      // standalone video (Video tab): create a gallery item with a poster frame
      const id = uid();
      const posterName = `${id}.png`;
      const posters = findOutputFiles(outputs, /\.(png|jpg|jpeg|webp)$/i);
      const pbuf = posters.length ? await downloadOutput(posters[0]) : BLANK_PNG;
      await fsp.writeFile(path.join(IMAGES, posterName), pbuf);
      item = {
        id,
        file: posterName,
        mode: 'video',
        profileId: job.profileId,
        prompt: job.videoInfo.motionPrompt,
        refinedPrompt: null,
        enhance: !!job.videoInfo.enhance,
        width: job.videoInfo.width,
        height: job.videoInfo.height,
        seed: job.videoInfo.seed,
        steps: null, cfg: null, denoise: null,
        loras: [], refImages: [],
        folder: null,
        createdAt: Date.now(),
        upscaled: null,
        videos: [],
      };
      db.items.unshift(item);
    }
    const fname = `${item.id}_${Date.now()}.mp4`;
    await fsp.writeFile(path.join(VIDEOS, fname), buf);
    const entry = {
      id: uid(),
      file: fname,
      createdAt: Date.now(),
      info: Object.assign({}, job.videoInfo, {
        refinedMotionPrompt: textOut || (job.videoInfo && job.videoInfo.refinedMotionPrompt) || null,
        durationMs,
      }),
    };
    item.videos = (Array.isArray(item.videos) ? item.videos : []).concat([entry]);
    saveDb();
    const videoActionLabel = job.videoInfo.processed === 'upscale'
      ? 'Video upscale'
      : (job.videoInfo.processed === 'interpolate' ? 'Frame interpolation' : (job.videoInfo.composite ? 'Side-by-side' : 'Video'));
    pushHistory({
      kind: 'video', profileId: job.profileId, itemId: item.id, videoId: entry.id, durationMs,
      label: `${videoActionLabel} (${{ wan: 'Wan 2.2', eros: '10Eros', scail: 'SCAIL 2' }[job.videoInfo.engine] || 'LTX 2.3'}): ${(job.videoInfo.motionPrompt || '').slice(0, 60)}`,
    });
    broadcast('videoDone', { jobId: pid, item });
    return;
  }

  const files = findOutputFiles(outputs, /\.(png|jpg|jpeg|webp)$/i);
  if (!files.length) return failJob(pid, 'ComfyUI produced no output images');

  if (job.kind === 'upscale') {
    const buf = await downloadOutput(files[0]);
    const item = db.items.find((it) => it.id === job.itemId);
    if (!item) return;
    const fname = `${item.id}_up.png`;
    await fsp.writeFile(path.join(IMAGES, fname), buf);
    item.upscaled = fname;
    item.upscalePending = false;
    item.upscaleInfo = job.upscaleInfo;
    item.upscaleDurationMs = durationMs;
    saveDb();
    pushHistory({ kind: 'upscale', profileId: job.profileId, itemId: item.id, durationMs, label: `Upscaled: ${(item.prompt || '').slice(0, 60)}` });
    broadcast('upscaleDone', { jobId: pid, item });
    return;
  }

  if (job.kind === 'imageComposite') {
    const buf = await downloadOutput(files[0]);
    const info = job.compositeInfo || {};
    const id = uid();
    const fname = `${id}_composite.png`;
    await fsp.writeFile(path.join(IMAGES, fname), buf);
    const dims = pngDims(buf) || {};
    // Source/result composites belong to the generation they document.
    // Keeping them on that item makes the gallery read as one coherent
    // generation rather than a second, disconnected card.
    if (['before-after', 'reference-generation', 'depth-map'].includes(info.type) && info.sourceItemId) {
      const parent = db.items.find((it) => it.id === info.sourceItemId && it.profileId === job.profileId);
      if (!parent) return;
      const composite = {
        id,
        file: fname,
        type: info.type,
        label: info.label || (info.type === 'reference-generation' ? 'Reference + generation'
          : (info.type === 'depth-map' ? 'Source + depth + generation' : 'Before + after')),
        createdAt: Date.now(),
        width: dims.w || info.width || parent.width || 1024,
        height: dims.h || info.height || parent.height || 1024,
        durationMs,
        sourceFiles: Array.isArray(info.sourceFiles) ? info.sourceFiles : undefined,
      };
      parent.composites = (Array.isArray(parent.composites) ? parent.composites : []).concat([composite]);
      saveDb();
      pushHistory({ kind: 'composite', profileId: job.profileId, itemId: parent.id, durationMs, label: `${composite.label}: ${(parent.prompt || '').slice(0, 60)}` });
      broadcast('imageCompositeDone', { jobId: pid, item: parent, composite });
      return;
    }
    const item = {
      id,
      file: fname,
      mode: 'composite',
      compositeInfo: info,
      profileId: job.profileId,
      prompt: info.prompt || '',
      width: dims.w || info.width || 1024,
      height: dims.h || info.height || 1024,
      seed: null,
      steps: null,
      cfg: null,
      denoise: null,
      loras: [],
      refImages: [],
      folder: info.folder || null,
      createdAt: Date.now(),
      durationMs,
      upscaled: null,
      video: null,
    };
    db.items.unshift(item);
    saveDb();
    pushHistory({ kind: 'composite', profileId: job.profileId, itemId: item.id, durationMs, label: `${info.label || 'Image composite'}: ${(item.prompt || '').slice(0, 60)}` });
    broadcast('jobDone', { jobId: pid, items: [item] });
    return;
  }

  const editSequence = job.params.editSequence;
  const sequenceFinal = !editSequence || editSequence.index >= editSequence.prompts.length - 1;
  const created = [];
  for (const img of files) {
    const buf = await downloadOutput(img);
    const id = uid();
    const fname = `${id}.png`;
    await fsp.writeFile(path.join(IMAGES, fname), buf);
    // Keep a durable copy of edit and image-to-image sources so gallery
    // reuse still works if ComfyUI's input folder is later cleaned.
    let sourceFile = null;
    const sourceImageName = job.refImageNames && job.refImageNames[0];
    if (sourceImageName && (job.params.mode === 'edit' || job.params.imageName)) {
      try {
        const parts = String(sourceImageName).split('/');
        const fn = parts.pop();
        const sub = parts.join('/');
        const sbuf = Buffer.from(await (await comfyFetch(
          `/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=input`
        )).arrayBuffer());
        sourceFile = `${id}_src.png`;
        await fsp.writeFile(path.join(IMAGES, sourceFile), sbuf);
      } catch { /* source copy is best-effort */ }
    }
    const item = {
      id,
      file: fname,
      mode: job.params.mode,
      krea2Turbo: job.params.mode === 't2i' ? job.params.krea2Turbo !== false : undefined,
      krea2RawTurboLora: job.params.mode === 't2i' ? job.params.krea2RawTurboLora : undefined,
      imageGuideMode: job.params.mode === 't2i' && job.params.imageName ? job.params.imageGuideMode : undefined,
      depthStrength: job.params.mode === 't2i' && job.params.imageGuideMode === 'depth' ? job.params.depthStrength : undefined,
      editEngine: job.params.mode === 'edit' ? (job.params.editEngine || 'klein4') : undefined,
      qwenQuality: job.params.mode === 'edit' && job.params.editEngine === 'qwen'
        ? normalizeQwenEditQuality(job.params.qwenQuality) : undefined,
      editSequence: job.params.editSequence ? {
        id: job.params.editSequence.id,
        index: job.params.editSequence.index,
        total: job.params.editSequence.total,
      } : undefined,
      angleView: job.params.qwenAngle || undefined,
      anglePrompt: job.params.anglePrompt || undefined,
      angleGroupId: job.params.angleGroupId || undefined,
      editAspectOverride: job.params.mode === 'edit' ? !!job.params.editAspectOverride : undefined,
      composite: job.params.mode === 'edit' ? !!job.params.composite : undefined,
      maskImageName: job.params.mode === 'edit' ? (job.params.maskImageName || undefined) : undefined,
      editMaskMode: job.params.mode === 'edit' && job.params.maskImageName ? job.params.editMaskMode : undefined,
      editMaskFeather: job.params.mode === 'edit' && job.params.maskImageName ? job.params.editMaskFeather : undefined,
      editMaskInvert: job.params.mode === 'edit' && job.params.maskImageName ? job.params.editMaskInvert : undefined,
      editMaskInfluence: job.params.mode === 'edit' && job.params.maskImageName ? job.params.maskInfluence : undefined,
      editMaskExpand: job.params.mode === 'edit' && job.params.maskImageName ? job.params.maskExpand : undefined,
      postUpscale: job.params.postUpscale && sequenceFinal ? job.params.postUpscale : undefined,
      sourceFile,
      sourceItemId: job.params.sourceItemId || null,
      profileId: job.profileId,
      regions: Array.isArray(job.params.regions) && job.params.regions.length
        ? normalizeRegions(job.params.regions) : undefined,
      prompt: job.params.prompt,
      refinedPrompt: job.refinedPrompt || textOut,
      enhance: !!job.params.enhance,
      width: (pngDims(buf) || {}).w || job.params.width,
      height: (pngDims(buf) || {}).h || job.params.height,
      seed: job.params.seed,
      steps: job.params.steps,
      cfg: job.params.cfg,
      denoise: job.params.denoise,
      batch: job.params.batch,
      loras: (job.params.loras || []).filter((l) => l.on && l.name),
      refImages: job.refImageNames || [],
      folder: job.params.folder || null,
      createdAt: Date.now(),
      durationMs,
      upscaled: null,
      video: null,
    };
    db.items.unshift(item);
    created.push(item);
  }
  saveDb();
  if (job.params.postUpscale && sequenceFinal) {
    for (const item of created) {
      try {
        await queuePostUpscale(item, job.params.postUpscale, job.profileId);
      } catch (error) {
        console.error('[Mix Studio] Could not queue SeedVR2 finish upscale:', error.message);
      }
    }
    saveDb();
  }
  for (const it of created) {
    pushHistory({ kind: it.mode === 'edit' ? 'edit' : 'gen', profileId: job.profileId, itemId: it.id, durationMs, label: `${it.mode === 'edit' ? 'Edit' : 'Create'}: ${(it.prompt || '').slice(0, 60)}` });
  }
  if (editSequence && !sequenceFinal) {
    try {
      const next = await queueNextSequentialEdit(job, created[0]);
      broadcast('sequenceStep', {
        jobId: pid,
        nextJobId: next.pid,
        items: created,
        completedStep: editSequence.index + 1,
        nextStep: editSequence.index + 2,
        total: editSequence.total,
      });
    } catch (error) {
      const message = `Sequential edit stopped after step ${editSequence.index + 1}: ${error.message}`;
      pushHistory({ kind: 'error', profileId: job.profileId, itemId: created[0] && created[0].id, label: message.slice(0, 120) });
      broadcast('jobError', { jobId: pid, kind: 'gen', itemId: created[0] && created[0].id, items: created, message, durationMs });
    }
  } else {
    broadcast('jobDone', { jobId: pid, items: created, sequenceComplete: !!editSequence });
  }
}

/* Polling fallback: no native WebSocket (Node < 22) OR the WS connection is down. */
setInterval(async () => {
  if (!jobs.size) return;
  if (typeof WebSocket !== 'undefined' && ws && ws.readyState === 1) return;
  for (const pid of [...jobs.keys()]) {
    try {
      const hist = (await (await comfyFetch(`/history/${pid}`)).json())[pid];
      if (hist && hist.status && hist.status.completed) await completeJob(pid);
      else if (hist && hist.status && hist.status.status_str === 'error') failJob(pid, 'Execution error (see ComfyUI console)');
    } catch { /* comfy offline; retry */ }
  }
}, 2500);

/* ------------------------------------------------------------------ */
/* Prompt enhance (two-pass): run TextGenerate alone, sanitize the     */
/* output in Node, then feed the clean text to the image job.          */
/* ------------------------------------------------------------------ */

function cleanEnhancedText(raw, fallback) {
  if (!raw) return fallback;
  let t = String(raw).trim();
  // 1) remove explicit thinking blocks
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, ' ').replace(/<\/?think>/gi, ' ').trim();
  // 2) sentinel extraction (tolerate a missing closing tag)
  const m = t.match(/<final_prompt>\s*([\s\S]*?)\s*(?:<\/final_prompt>|$)/i);
  if (m && m[1].trim().length >= 10) {
    t = m[1].trim();
  } else {
    // 3) heuristic: planning usually precedes the answer - keep the last
    //    substantial paragraph if there are several
    const paras = t.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    if (paras.length > 1) {
      const last = paras[paras.length - 1];
      if (last.length >= 40) t = last;
    }
  }
  // 4) strip label prefixes, wrapping quotes, markdown bold
  t = t.replace(/^(?:final|expanded|enhanced|refined)?\s*prompt\s*[:\-]\s*/i, '');
  t = t.replace(/\*\*/g, '').replace(/^["'`]+/, '').replace(/["'`]+$/, '').trim();
  return t.length >= 10 ? t : fallback;
}

function textGenInputs(seed, maxLength) {
  return {
    max_length: maxLength,
    sampling_mode: 'on',
    'sampling_mode.temperature': 0.7,
    'sampling_mode.top_k': 64,
    'sampling_mode.top_p': 0.95,
    'sampling_mode.min_p': 0.05,
    'sampling_mode.repetition_penalty': 1.05,
    'sampling_mode.seed': seed % 2147483647,
    'sampling_mode.presence_penalty': 0,
    thinking: false,
    use_default_template: true,
  };
}

const MOTION_INSTRUCTION = `Look at the provided image. Write a motion prompt for an image-to-video model: one short paragraph (under 70 words) describing how this exact scene should come alive - subject movement, secondary motion, camera movement (only if it helps the shot), and ambient sound. Use present-progressive verbs. Do not re-describe static appearance; focus on plausible motion that fits the scene.`;

/** Vision pass: Qwen3-VL looks at the image and suggests a motion prompt. */
function suggestMotionPrompt(comfyImageName, seed) {
  return new Promise((resolve, reject) => {
    (async () => {
      const graph = {};
      graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.clip, type: settings.clipType, device: 'default' } };
      graph.img = { class_type: 'LoadImage', inputs: { image: comfyImageName } };
      graph.gen = {
        class_type: 'TextGenerate',
        inputs: Object.assign(
          { clip: ['clip', 0], image: ['img', 0], prompt: MOTION_INSTRUCTION + ENHANCE_TAIL },
          textGenInputs(seed, 256)
        ),
      };
      graph.show = { class_type: 'PreviewAny', inputs: { source: ['gen', 0] } };
      await filterInputs(graph);
      const pid = await queuePrompt(graph);
      const timer = setTimeout(() => {
        jobs.delete(pid);
        reject(new Error('Motion prompt timed out (3 min)'));
      }, 180000);
      trackJob(pid, {
        kind: 'enhance',
        graph,
        resolve: (t) => { clearTimeout(timer); resolve(t); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      ensureWs();
    })().catch(reject);
  });
}

/** Vision pass: Qwen3-VL writes a detailed prompt to recreate the image. */
function suggestImagePrompt(comfyImageName, seed) {
  return new Promise((resolve, reject) => {
    (async () => {
      const graph = {};
      graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.clip, type: settings.clipType, device: 'default' } };
      graph.img = { class_type: 'LoadImage', inputs: { image: comfyImageName } };
      graph.gen = {
        class_type: 'TextGenerate',
        inputs: Object.assign(
          { clip: ['clip', 0], image: ['img', 0], prompt: IMAGE_RECREATION_INSTRUCTION + ENHANCE_TAIL },
          textGenInputs(seed, 768)
        ),
      };
      graph.show = { class_type: 'PreviewAny', inputs: { source: ['gen', 0] } };
      await filterInputs(graph);
      const pid = await queuePrompt(graph);
      const timer = setTimeout(() => {
        jobs.delete(pid);
        reject(new Error('Image prompt timed out (3 min)'));
      }, 180000);
      trackJob(pid, {
        kind: 'enhance',
        graph,
        resolve: (t) => { clearTimeout(timer); resolve(t); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      ensureWs();
    })().catch(reject);
  });
}

function enhancePrompt(p) {
  return new Promise((resolve, reject) => {
    (async () => {
      const graph = {};
      const enhance = promptEnhanceParts(settings.systemPrompt, p.prompt);
      graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.clip, type: settings.clipType, device: 'default' } };
      graph.concat = {
        class_type: 'StringConcatenate',
        inputs: { string_a: enhance.instruction, string_b: enhance.userInput, delimiter: '\n' },
      };
      graph.refine = {
        class_type: 'TextGenerate',
        inputs: Object.assign({ clip: ['clip', 0], prompt: ['concat', 0] }, textGenInputs(p.seed, 512)),
      };
      graph.show = { class_type: 'PreviewAny', inputs: { source: ['refine', 0] } };
      await filterInputs(graph);
      const pid = await queuePrompt(graph);
      const timer = setTimeout(() => {
        jobs.delete(pid);
        reject(new Error('Prompt enhance timed out (3 min)'));
      }, 180000);
      trackJob(pid, {
        kind: 'enhance',
        graph,
        resolve: (t) => { clearTimeout(timer); resolve(t); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      ensureWs();
      broadcast('status', { jobId: 'pre', text: 'Enhancing prompt...' });
    })().catch(reject);
  });
}

/** Wan 2.2 enhance: Qwen3-VL sees the image + user's idea, writes the video prompt. */
function wanEnhance(comfyImageName, userPrompt, seed) {
  const instruction = `Look at the provided image. Rewrite the user's motion idea into one vivid video-generation prompt paragraph (under 90 words) for an image-to-video model: describe subject actions, secondary motion, camera behavior and atmosphere, staying faithful to what is actually in the image and to the user's intent. Use present-progressive verbs.\n\nUser's motion idea: ${userPrompt}`;
  return new Promise((resolve, reject) => {
    (async () => {
      const graph = {};
      graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.clip, type: settings.clipType, device: 'default' } };
      graph.img = { class_type: 'LoadImage', inputs: { image: comfyImageName } };
      graph.gen = {
        class_type: 'TextGenerate',
        inputs: Object.assign(
          { clip: ['clip', 0], image: ['img', 0], prompt: instruction + ENHANCE_TAIL },
          textGenInputs(seed, 300)
        ),
      };
      graph.show = { class_type: 'PreviewAny', inputs: { source: ['gen', 0] } };
      await filterInputs(graph);
      const pid = await queuePrompt(graph);
      const timer = setTimeout(() => { jobs.delete(pid); reject(new Error('Wan prompt enhance timed out')); }, 180000);
      trackJob(pid, {
        kind: 'enhance', graph,
        resolve: (t) => { clearTimeout(timer); resolve(t); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      ensureWs();
      broadcast('status', { jobId: 'pre', text: 'Enhancing motion prompt...' });
    })().catch(reject);
  });
}

/* ------------------------------------------------------------------ */
/* Graph builders                                                      */
/* ------------------------------------------------------------------ */

function buildLoraChain(graph, loras) {
  let model = ['unet', 0];
  let clip = ['clip', 0];
  let n = 0;
  for (const l of loras || []) {
    if (!l || !l.on || !l.name) continue;
    n += 1;
    const key = 'lora' + n;
    graph[key] = {
      class_type: 'LoraLoader',
      inputs: {
        model, clip,
        lora_name: l.name,
        strength_model: Number(l.strength) || 0,
        strength_clip: Number(l.strength) || 0,
      },
    };
    model = [key, 0];
    clip = [key, 1];
  }
  return { model, clip };
}

function baseLoaders(graph, params = {}) {
  const unetName = params.krea2Turbo === false ? settings.krea2RawUnet : settings.unet;
  graph.unet = { class_type: 'UNETLoader', inputs: { unet_name: unetName, weight_dtype: 'default' } };
  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.clip, type: settings.clipType, device: 'default' } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.vae } };
}

async function buildT2I(p) {
  const graph = {};
  baseLoaders(graph, p);
  let { model, clip } = buildLoraChain(graph, p.loras);

  const textSource = p.enhancedText || p.prompt;
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip, text: textSource } };
  graph.neg = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } };
  const depthGuide = p.imageGuideMode === 'depth' && !!p.imageName;
  const latentInput = buildKrea2LatentInput(Object.assign({}, p, { imageName: depthGuide ? '' : p.imageName }));
  Object.assign(graph, latentInput.nodes);
  if (depthGuide) {
    const depth = buildKrea2DepthControl({
      imageName: p.imageName,
      loraName: settings.krea2DepthLora,
      depthModel: settings.depthAnythingV3Model,
      strength: p.depthStrength,
      latent: latentInput.latent,
      model,
      width: p.width,
      height: p.height,
    });
    Object.assign(graph, depth.nodes);
    model = depth.model;
  }
  graph.sampler = {
    class_type: 'KSampler',
    inputs: {
      model, positive: ['pos', 0], negative: ['neg', 0], latent_image: latentInput.latent,
      seed: p.seed, steps: p.steps, cfg: p.cfg, sampler_name: 'euler', scheduler: 'beta', denoise: latentInput.denoise,
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'KreaStudio/gen' } };
  return filterInputs(graph);
}

async function buildRegionalT2I(p) {
  return filterInputs(buildRegionalT2IGraph(Object.assign({}, p, { settings })));
}

async function buildKrea2Inpaint(p, refNames) {
  const info = await getObjectInfo();
  return filterInputs(buildKrea2InpaintGraph(Object.assign({}, p, {
    settings,
    imageName: refNames[0],
    maskImageName: p.maskImageName,
    useSourceConditioning: !!info.Krea2EditRebalance,
  })));
}

/* Edit (Krea2 Ref): the nova452 Conditioning-Rebalance technique — the
 * instruction and up to 4 reference images are fused by Krea2EditRebalance
 * into a single conditioning (IP-Adapter-like identity/composition
 * preservation), sampled cfg-free on the Krea2 turbo model from an EMPTY
 * latent (the refs steer content; nothing is latent-copied). */
async function buildEditKrea2Ref(p, refNames) {
  const graph = {};
  graph.unet = { class_type: 'UNETLoader', inputs: { unet_name: settings.unet, weight_dtype: 'default' } };
  const model = chainModelLoras(graph, ['unet', 0], p.loras, 'kelora');
  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.clip, type: settings.clipType, device: 'default' } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.vae } };

  // Match the first reference by default; an explicit Edit-tab output ratio
  // overrides it when the user is combining multiple references.
  let W = p.width || 1024;
  let H = p.height || 1024;
  if (!p.editAspectOverride) try {
    const parts = String(refNames[0]).split('/');
    const fn = parts.pop();
    const sub = parts.join('/');
    const r = await comfyFetch(`/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=input`);
    const dims = imageDims(Buffer.from(await r.arrayBuffer()));
    if (dims && dims.w && dims.h) {
      const s = Math.sqrt((1.3 * 1024 * 1024) / (dims.w * dims.h));
      W = Math.max(256, Math.round((dims.w * s) / 16) * 16);
      H = Math.max(256, Math.round((dims.h * s) / 16) * 16);
    }
  } catch { /* fall back to the selected output size */ }

  const rebalanceInputs = { text: p.prompt, clip: ['clip', 0] };
  refNames.slice(0, 4).forEach((name, i) => {
    const k = i + 1;
    graph[`ref${k}`] = { class_type: 'LoadImage', inputs: { image: name } };
    rebalanceInputs[`image${k}`] = [`ref${k}`, 0];
    // The primary reference carries the subject: give it the bigger budget
    rebalanceInputs[`image${k}_tokens`] = i === 0 ? 'high' : 'normal';
  });
  graph.rebalance = { class_type: 'Krea2EditRebalance', inputs: rebalanceInputs };
  graph.guider = { class_type: 'BasicGuider', inputs: { model, conditioning: ['rebalance', 0] } };
  graph.noise = { class_type: 'RandomNoise', inputs: { noise_seed: p.seed } };
  graph.sampler_sel = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } };
  graph.sched = {
    class_type: 'BasicScheduler',
    inputs: { model, scheduler: 'simple', steps: p.steps || 8, denoise: 1 },
  };
  graph.latent = {
    class_type: 'EmptySD3LatentImage',
    inputs: { width: W, height: H, batch_size: p.batch || 1 },
  };
  graph.samp = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler_sel', 0],
      sigmas: ['sched', 0], latent_image: ['latent', 0],
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['samp', 0], vae: ['vae', 0] } };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'KreaStudio/edit' } };
  return filterInputs(graph);
}

/* Edit (Qwen): the real Qwen-Image-Edit 2511 pipeline (official template):
 * dedicated edit UNET, optional Lightning acceleration, source image encoded
 * as the starting latent, FluxKontext scaling + multi-reference conditioning. */
async function buildEditQwen(p, refNames) {
  const graph = {};
  const preset = qwenEditPreset(p.qwenQuality);
  graph.unet = { class_type: 'UNETLoader', inputs: { unet_name: settings.qwenEditUnet, weight_dtype: 'default' } };
  let qwenBaseModel = ['unet', 0];
  if (preset.lightning) {
    graph.lightning = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: qwenBaseModel, lora_name: settings.qwenEditLora, strength_model: 1 },
    };
    qwenBaseModel = ['lightning', 0];
  }
  if (p.qwenAngle) {
    graph.angle_lora = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: qwenBaseModel, lora_name: settings.qwenEditAnglesLora, strength_model: 0.9 },
    };
    qwenBaseModel = ['angle_lora', 0];
  }
  const qModel = chainModelLoras(graph, qwenBaseModel, p.loras, 'qlora');
  graph.ms = { class_type: 'ModelSamplingAuraFlow', inputs: { model: qModel, shift: 3.1 } };
  graph.cfgnorm = { class_type: 'CFGNorm', inputs: { model: ['ms', 0], strength: 1 } };
  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.qwenEditClip, type: 'qwen_image', device: 'default' } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.vae } };

  const qwenPrompt = p.anglePrompt || p.qwenAnglePrompt || p.prompt;
  const encodeInputs = { clip: ['clip', 0], vae: ['vae', 0], prompt: p.maskImageName ? localizedEditPrompt(qwenPrompt) : qwenPrompt };
  const negInputs = { clip: ['clip', 0], vae: ['vae', 0], prompt: '' };
  refNames.slice(0, 3).forEach((name, idx) => {
    const i = idx + 1;
    graph['img' + i] = { class_type: 'LoadImage', inputs: { image: name } };
    let src = ['img' + i, 0];
    if (p.editAspectOverride) {
      graph['scale' + i] = {
        class_type: 'ImageScale',
        inputs: { image: src, upscale_method: 'lanczos', width: p.width, height: p.height, crop: 'center' },
      };
      src = ['scale' + i, 0];
    } else if (i === 1) {
      graph.scale1 = { class_type: 'FluxKontextImageScale', inputs: { image: src } };
      src = ['scale1', 0];
    }
    encodeInputs['image' + i] = src;
    negInputs['image' + i] = src;
  });

  graph.pos = { class_type: 'TextEncodeQwenImageEditPlus', inputs: encodeInputs };
  graph.neg = { class_type: 'TextEncodeQwenImageEditPlus', inputs: negInputs };
  graph.posm = { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['pos', 0], reference_latents_method: 'index_timestep_zero' } };
  graph.negm = { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['neg', 0], reference_latents_method: 'index_timestep_zero' } };
  graph.latent = { class_type: 'VAEEncode', inputs: { pixels: ['scale1', 0], vae: ['vae', 0] } };
  const editMask = appendEditMaskNodes(graph, {
    prefix: 'qwen_mask',
    maskImageName: p.maskImageName,
    samples: ['latent', 0],
    expand: p.maskExpand,
  });
  graph.sampler = {
    class_type: 'KSampler',
    inputs: {
      model: ['cfgnorm', 0], positive: ['posm', 0], negative: ['negm', 0], latent_image: editMask ? editMask.latent : ['latent', 0],
      seed: p.seed, steps: preset.steps, cfg: preset.cfg, sampler_name: 'euler', scheduler: 'simple', denoise: editMask ? maskInfluenceDenoise(p.maskInfluence) : 1,
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };

  let out = ['decode', 0];
  if (editMask) {
    out = appendEditMaskComposite(graph, {
      key: 'qwen_mask_composite',
      original: ['scale1', 0],
      generated: ['decode', 0],
      mask: editMask.mask,
    });
  } else if (p.composite !== false) {
    const info = await getObjectInfo();
    if (info.KleinEditComposite) {
      graph.composite = await nodeFromOrdered(
        'KleinEditComposite',
        [],
        { generated_image: ['decode', 0], original_image: ['scale1', 0] }
      );
      out = ['composite', 0];
    }
  }
  graph.save = { class_type: 'SaveImage', inputs: { images: out, filename_prefix: 'KreaStudio/edit' } };
  return filterInputs(graph);
}

/* Edit (Klein): Flux 2 Klein 4B image editing (ReferenceLatent conditioning,
 * Flux2Scheduler 4 steps, cfg 1 — from the flux2_klein_editV2 workflow). */
function kleinConfigForEngine(engine) {
  if (engine === 'klein9') return { unet: settings.klein9Unet, clip: settings.klein9Clip };
  return {
    unet: settings.klein4Unet || settings.kleinUnet,
    clip: settings.klein4Clip || settings.kleinClip,
  };
}

async function buildEdit(p, refNames) {
  const graph = {};
  const klein = kleinConfigForEngine(p.editEngine);
  graph.unet = { class_type: 'UNETLoader', inputs: { unet_name: klein.unet, weight_dtype: 'default' } };
  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: klein.clip, type: 'flux2', device: 'default' } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.kleinVae } };

  const kModel = chainModelLoras(graph, ['unet', 0], p.loras, 'klora');
  const editPrompt = p.anglePrompt || p.prompt;
  graph.pos_text = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: p.maskImageName ? localizedEditPrompt(editPrompt) : editPrompt } };
  graph.neg0 = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos_text', 0] } };
  let pos = ['pos_text', 0];
  let neg = ['neg0', 0];
  refNames.slice(0, 3).forEach((name, idx) => {
    const i = idx + 1;
    graph['img' + i] = { class_type: 'LoadImage', inputs: { image: name } };
    graph['scale' + i] = {
      class_type: 'ImageScaleToTotalPixels',
      inputs: { image: ['img' + i, 0], upscale_method: 'nearest-exact', megapixels: 1, resolution_steps: 1 },
    };
    graph['enc' + i] = { class_type: 'VAEEncode', inputs: { pixels: ['scale' + i, 0], vae: ['vae', 0] } };
    graph['refp' + i] = { class_type: 'ReferenceLatent', inputs: { conditioning: pos, latent: ['enc' + i, 0] } };
    graph['refn' + i] = { class_type: 'ReferenceLatent', inputs: { conditioning: neg, latent: ['enc' + i, 0] } };
    pos = ['refp' + i, 0];
    neg = ['refn' + i, 0];
  });

  // With a source image, output size follows it; otherwise the picker
  let wRef = p.width;
  let hRef = p.height;
  if (refNames.length && !p.editAspectOverride) {
    graph.size = { class_type: 'GetImageSize', inputs: { image: ['scale1', 0] } };
    wRef = ['size', 0];
    hRef = ['size', 1];
  }
  const editMask = appendEditMaskNodes(graph, {
    prefix: 'klein_mask',
    maskImageName: p.maskImageName,
    samples: ['enc1', 0],
    expand: p.maskExpand,
  });
  if (!editMask) {
    graph.latent = { class_type: 'EmptyFlux2LatentImage', inputs: { width: wRef, height: hRef, batch_size: p.batch || 1 } };
  }
  graph.sched = { class_type: 'Flux2Scheduler', inputs: { steps: 4, width: wRef, height: hRef, denoise: editMask ? maskInfluenceDenoise(p.maskInfluence) : 1 } };
  graph.guider = { class_type: 'CFGGuider', inputs: { model: kModel, positive: pos, negative: neg, cfg: 1 } };
  graph.noise = { class_type: 'RandomNoise', inputs: { noise_seed: p.seed } };
  graph.sampler_sel = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } };
  graph.samp = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler_sel', 0],
      sigmas: ['sched', 0], latent_image: editMask ? editMask.latent : ['latent', 0],
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['samp', 0], vae: ['vae', 0] } };

  // Optional: composite changed pixels back onto the original so untouched
  // areas stay pristine across successive edits (KleinEditComposite node).
  let out = ['decode', 0];
  if (editMask) {
    out = appendEditMaskComposite(graph, {
      key: 'klein_mask_composite',
      original: ['scale1', 0],
      generated: ['decode', 0],
      mask: editMask.mask,
    });
  } else if (p.composite !== false && refNames.length) {
    const info = await getObjectInfo();
    if (info.KleinEditComposite) {
      graph.composite = await nodeFromOrdered(
        'KleinEditComposite',
        [],
        { generated_image: ['decode', 0], original_image: ['scale1', 0] }
      );
      out = ['composite', 0];
    }
  }
  graph.save = { class_type: 'SaveImage', inputs: { images: out, filename_prefix: 'KreaStudio/edit' } };
  return filterInputs(graph);
}

async function buildGenerationGraph(p, refNames) {
  if (p.mode === 'edit') {
    if (p.editEngine === 'qwen') return buildEditQwen(p, refNames);
    if (p.editEngine === 'krea2ref') return buildEditKrea2Ref(p, refNames);
    if (p.editEngine === 'krea2' && p.maskImageName) return buildKrea2Inpaint(p, refNames);
    if (p.editEngine === 'krea2') return hasActiveRegions(p.regions) ? buildRegionalT2I(p) : buildT2I(p);
    return buildEdit(p, refNames);
  }
  return hasActiveRegions(p.regions) ? buildRegionalT2I(p) : buildT2I(p);
}

async function queueGenerationJob(p, profileId, refNames, refinedPrompt = null) {
  const graph = await buildGenerationGraph(p, refNames);
  const pid = await queuePrompt(graph);
  trackJob(pid, { kind: 'gen', profileId, params: p, graph, refImageNames: refNames, refinedPrompt });
  ensureWs();
  return { pid, graph };
}

async function queueNextSequentialEdit(job, sourceItem) {
  const sequence = job.params.editSequence;
  if (!sequence || sequence.index >= sequence.prompts.length - 1) return null;
  const nextIndex = sequence.index + 1;
  const source = await fsp.readFile(path.join(IMAGES, sourceItem.file));
  const sourceName = await uploadToComfy(source, `ks_sequence_${sequence.id}_${nextIndex + 1}.png`);
  const refNames = [sourceName, ...(job.refImageNames || []).slice(1)];
  const nextParams = Object.assign({}, job.params, {
    prompt: sequence.prompts[nextIndex],
    seed: (Number(job.params.seed) + 1) % (2 ** 48),
    batch: 1,
    sourceItemId: sourceItem.id,
    refImages: refNames,
    qwenAngle: undefined,
    qwenAnglePrompt: undefined,
    anglePrompt: undefined,
    angleGroupId: undefined,
    editSequence: Object.assign({}, sequence, { index: nextIndex }),
  });
  const queued = await queueGenerationJob(nextParams, job.profileId, refNames, null);
  return { pid: queued.pid, params: nextParams };
}

async function buildUpscale(imageName, opts) {
  if (opts.engine === 'ultimate') {
    return filterInputs(buildUltimateSdUpscaleGraph({
      imageName,
      settings,
      prompt: opts.prompt,
      scaleFactor: opts.scaleFactor,
      seed: opts.seed,
    }));
  }

  const graph = {};
  const installedDitModels = installedSeedVr2Models(seedVr2ModelDirs());
  const profile = seedVr2Profile(settings, opts.profile || 'sharp', installedDitModels, opts.noise || 'low');
  opts.profile = profile.key;
  opts.noise = profile.noise;
  opts.profileModel = profile.ditModel;
  graph.load = { class_type: 'LoadImage', inputs: { image: imageName } };
  let imgRef = ['load', 0];
  if (opts.preScale && opts.preScale !== 1) {
    graph.prescale = {
      class_type: 'ImageScaleBy',
      inputs: { image: imgRef, upscale_method: 'lanczos', scale_by: opts.preScale },
    };
    imgRef = ['prescale', 0];
  }
  // Explicit inputs matching the current SeedVR2 node pack schema
  // (verified against /object_info via /api/debug/upscale).
  graph.dit = {
    class_type: 'SeedVR2LoadDiTModel',
    inputs: seedVr2DitInputs(Object.assign({}, settings, { seedvr2Dit: profile.ditModel })),
  };
  graph.svvae = {
    class_type: 'SeedVR2LoadVAEModel',
    inputs: {
      model: settings.seedvr2Vae,
      device: 'cuda:0',
      encode_tiled: true,
      encode_tile_size: 1024,
      encode_tile_overlap: 256,
      decode_tiled: true,
      decode_tile_size: 1024,
      decode_tile_overlap: 256,
      tile_debug: 'false',
      offload_device: 'cpu',
      cache_model: false,
    },
  };
  graph.upscale = {
    class_type: 'SeedVR2VideoUpscaler',
    inputs: {
      image: imgRef,
      dit: ['dit', 0],
      vae: ['svvae', 0],
      seed: Math.floor(Math.random() * 2 ** 31),
      resolution: opts.resolution || 2160,
      max_resolution: 0,
      batch_size: 1,
      uniform_batch_size: false,
      color_correction: profile.colorCorrection,
      temporal_overlap: 0,
      prepend_frames: 0,
      input_noise_scale: profile.inputNoiseScale,
      latent_noise_scale: 0,
      offload_device: 'cpu',
      enable_debug: false,
    },
  };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['upscale', 0], filename_prefix: 'KreaStudio/upscale' } };
  return filterInputs(graph);
}

async function buildImageComposite(imageNames) {
  const names = Array.isArray(imageNames) ? imageNames.filter(Boolean) : [];
  if (names.length < 2) throw new Error('A composite needs at least two images');
  const graph = {};
  names.forEach((name, index) => {
    graph[`image_${index}`] = { class_type: 'LoadImage', inputs: { image: name } };
  });
  let output = ['image_0', 0];
  for (let index = 1; index < names.length; index += 1) {
    const key = `stitch_${index}`;
    graph[key] = await nodeFromOrdered(
      'ImageStitch',
      ['right', true, 8, 'black'],
      { image1: output, image2: [`image_${index}`, 0] }
    );
    output = [key, 0];
  }
  graph.save = { class_type: 'SaveImage', inputs: { images: output, filename_prefix: 'KreaStudio/composite' } };
  return filterInputs(graph);
}

async function buildImageContactSheet(imageNames) {
  const names = Array.isArray(imageNames) ? imageNames.filter(Boolean) : [];
  if (names.length < 2) throw new Error('A contact sheet needs at least two images');
  const graph = {};
  names.forEach((name, index) => {
    graph[`image_${index}`] = { class_type: 'LoadImage', inputs: { image: name } };
  });
  const columns = Math.ceil(Math.sqrt(names.length));
  const rows = [];
  for (let start = 0; start < names.length; start += columns) {
    let row = [`image_${start}`, 0];
    const end = Math.min(names.length, start + columns);
    for (let index = start + 1; index < end; index += 1) {
      const key = `row_${start}_${index}`;
      graph[key] = await nodeFromOrdered(
        'ImageStitch',
        ['right', true, 8, 'black'],
        { image1: row, image2: [`image_${index}`, 0] }
      );
      row = [key, 0];
    }
    rows.push(row);
  }
  let output = rows[0];
  for (let index = 1; index < rows.length; index += 1) {
    const key = `column_${index}`;
    graph[key] = await nodeFromOrdered(
      'ImageStitch',
      ['down', true, 8, 'black'],
      { image1: output, image2: rows[index] }
    );
    output = [key, 0];
  }
  graph.save = { class_type: 'SaveImage', inputs: { images: output, filename_prefix: 'KreaStudio/contact_sheet' } };
  return filterInputs(graph);
}

/* Source | depth map | generation, stitched left to right. The depth map is
 * recomputed from the saved source so the strip always documents exactly what
 * guided the generation. */
async function buildDepthComposite(imageNames, dims = {}) {
  const [sourceName, resultName] = Array.isArray(imageNames) ? imageNames.filter(Boolean) : [];
  if (!sourceName || !resultName) throw new Error('A depth composite needs the source and the result');
  // Analyze at the generation's dimensions — DA3 degrades on native multi-MP
  // sources, and this reproduces exactly the map that guided the generation.
  const depth = buildDepthMapNodes({
    imageName: sourceName,
    depthModel: settings.depthAnythingV3Model,
    width: clampInt(dims.width, 64, 4096, 1024),
    height: clampInt(dims.height, 64, 4096, 1024),
  });
  const graph = Object.assign({}, depth.nodes, {
    result: { class_type: 'LoadImage', inputs: { image: resultName } },
  });
  graph.stitch_depth = await nodeFromOrdered(
    'ImageStitch',
    ['right', true, 8, 'black'],
    { image1: depth.scaledSource, image2: depth.image }
  );
  graph.stitch_result = await nodeFromOrdered(
    'ImageStitch',
    ['right', true, 8, 'black'],
    { image1: ['stitch_depth', 0], image2: ['result', 0] }
  );
  graph.save = { class_type: 'SaveImage', inputs: { images: ['stitch_result', 0], filename_prefix: 'KreaStudio/depth_composite' } };
  return filterInputs(graph);
}

/* Synchronously wait for a queued ComfyUI prompt to produce its first output
 * image (used by short helper jobs like the depth-map preview). */
async function waitForComfyImage(pid, timeoutMs = 3 * 60 * 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    let entry;
    try {
      const history = await (await comfyFetch(`/history/${pid}`)).json();
      entry = history && history[pid];
    } catch { continue; }
    if (!entry) continue;
    if (entry.status && entry.status.status_str === 'error') {
      const messages = JSON.stringify(entry.status.messages || []).slice(0, 300);
      throw new Error(`ComfyUI failed: ${messages}`);
    }
    const files = findOutputFiles(entry.outputs || {}, /\.(png|jpg|jpeg|webp)$/i);
    if (files.length) return downloadOutput(files[0]);
  }
  throw new Error('Timed out waiting for ComfyUI');
}

function normalizePostUpscale(value) {
  if (!value || value.enabled !== true) return undefined;
  return {
    engine: 'seedvr2',
    resolution: clampInt(value.resolution, 512, 8192, 2160),
    profile: value.profile === 'balanced' ? 'balanced' : 'sharp',
    noise: ['off', 'low', 'medium'].includes(value.noise) ? value.noise : 'low',
    preScale: 1,
  };
}

async function queuePostUpscale(item, options, profileId) {
  const buf = await fsp.readFile(path.join(IMAGES, item.file));
  const comfyName = await uploadToComfy(buf, `ks_finish_${item.id}.png`);
  const graph = await buildUpscale(comfyName, options);
  const pid = await queuePrompt(graph);
  item.upscalePending = true;
  trackJob(pid, { kind: 'upscale', profileId, itemId: item.id, graph, upscaleInfo: options });
  ensureWs();
  return pid;
}

function ultimateSdUpscaleReadinessError(info) {
  const missing = [
    'LoadImage', 'UNETLoader', 'CLIPLoader', 'VAELoader', 'CLIPTextEncode',
    'ConditioningZeroOut', 'UpscaleModelLoader', 'UltimateSDUpscale', 'SaveImage',
  ].filter((cls) => !info[cls]);
  if (missing.length) return `Ultimate SD Upscale is missing ComfyUI node(s): ${missing.join(', ')}`;

  const models = comboList(info, 'UpscaleModelLoader', 'model_name');
  if (models.length && !models.includes(ULTIMATE_SD_UPSCALE_MODEL)) {
    return `Ultimate SD Upscale needs ${ULTIMATE_SD_UPSCALE_MODEL} in ComfyUI upscale_models.`;
  }
  return null;
}

/* --------------------------- LTX 2.3 Animate ---------------------- */
/* Replicates the "Black Mixture LTX 2.3 Image to Video" subgraph:     */
/* two-stage AV generation (base at half res -> x2 latent upsample)    */
/* with audio and Gemma motion-prompt enhancement.                     */

const LTX_NEGATIVE = 'pc game, console game, video game, cartoon, childish, ugly';
const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const LTX_SIGMAS_BASE = '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0';
const LTX_SIGMAS_REFINE = '0.85, 0.7250, 0.4219, 0.0';

function videoDims(w, h) {
  const long = 1280;
  const s = long / Math.max(w || 1024, h || 1024);
  const W = Math.max(256, Math.round((w * s) / 64) * 64);
  const H = Math.max(256, Math.round((h * s) / 64) * 64);
  return { W, H };
}

async function buildAnimate(imageName, opts) {
  const { W, H } = opts;
  const seed = opts.seed;
  const graph = {};

  // Models
  graph.ckpt = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: settings.ltxCkpt } };
  graph.model_lora = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['ckpt', 0], lora_name: settings.ltxDistilledLora, strength_model: 0.5 },
  };
  let ltxBaseModel = ['model_lora', 0];
  // Edit Anything is trained as a normal LTX 2.3 model LoRA. Keep it at
  // its authored strength; raising it can make the source clip less stable.
  if (opts.editAnything) {
    graph.edit_anything_lora = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ltxBaseModel, lora_name: settings.ltxEditLora, strength_model: 1 },
    };
    ltxBaseModel = ['edit_anything_lora', 0];
  }
  const ltxModel = chainModelLoras(graph, ltxBaseModel, opts.loras, 'ulora');
  graph.te = await nodeFromOrdered(
    'LTXAVTextEncoderLoader',
    [settings.ltxTextEncoder, settings.ltxCkpt, 'default'],
    {},
    { text_encoder: settings.ltxTextEncoder, ckpt_name: settings.ltxCkpt }
  );
  graph.te_lora = {
    class_type: 'LoraLoader',
    inputs: {
      model: ['ckpt', 0], clip: ['te', 0],
      lora_name: settings.ltxGemmaLora, strength_model: 0.7, strength_clip: 0.7,
    },
  };

  // Prompt (optional Gemma LTX2 enhancement, exactly like the workflow)
  let promptSource = opts.prompt;
  if (opts.enhance) {
    // Give Gemma the image too - its I2V system prompt analyzes the frame
    // and writes motion that respects what's actually in the picture.
    graph.refine = {
      class_type: 'TextGenerateLTX2Prompt',
      inputs: Object.assign(
        { clip: ['te_lora', 1], image: ['resize', 0], prompt: opts.prompt },
        textGenInputs(seed, 256)
      ),
    };
    graph.showPrompt = { class_type: 'PreviewAny', inputs: { source: ['refine', 0] } };
    promptSource = ['refine', 0];
  }
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: ['te_lora', 1], text: promptSource } };
  graph.neg = { class_type: 'CLIPTextEncode', inputs: { clip: ['te_lora', 1], text: LTX_NEGATIVE } };
  graph.cond = {
    class_type: 'LTXVConditioning',
    inputs: { positive: ['pos', 0], negative: ['neg', 0], frame_rate: opts.fps },
  };

  // Standard LTX uses a first-frame guide. Edit Anything uses every frame
  // from the supplied clip as an LTX guide, with the edit prompt steering
  // what changes. VHS decodes at the final sampling frame rate so temporal
  // alignment remains 8n+1 after LTX crops the sequence.
  if (opts.guideVideoName) {
    graph.edit_source = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
      video: opts.guideVideoName, force_rate: opts.fps, custom_width: W, custom_height: H,
      frame_load_cap: opts.frames, skip_first_frames: opts.guideSkipFrames || 0,
      select_every_nth: 1, format: 'None',
    });
    graph.edit_source_base = {
      class_type: 'ImageScale',
      inputs: { image: ['edit_source', 0], upscale_method: 'lanczos', width: W / 2, height: H / 2, crop: 'center' },
    };
  } else {
    // Source image -> preprocessed guide
    graph.img = { class_type: 'LoadImage', inputs: { image: imageName } };
    graph.resize = {
      class_type: 'ImageScale',
      inputs: { image: ['img', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'center' },
    };
    graph.prep = await nodeFromOrdered('LTXVPreprocess', [opts.imgCompression != null ? opts.imgCompression : 35], { image: ['resize', 0] });
  }

  // Optional end frame
  if (opts.endImageName && !opts.guideVideoName) {
    graph.img_end = { class_type: 'LoadImage', inputs: { image: opts.endImageName } };
    graph.resize_end = {
      class_type: 'ImageScale',
      inputs: { image: ['img_end', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'center' },
    };
    graph.prep_end = await nodeFromOrdered('LTXVPreprocess', [opts.imgCompression != null ? opts.imgCompression : 35], { image: ['resize_end', 0] });
  }

  // Stage 1: base generation at half resolution
  graph.latent1 = {
    class_type: 'EmptyLTXVLatentVideo',
    inputs: { width: W / 2, height: H / 2, length: opts.frames, batch_size: 1 },
  };
  let basePositive = ['cond', 0];
  let baseNegative = ['cond', 1];
  let baseLatent;
  if (opts.guideVideoName) {
    graph.edit_guide1 = {
      class_type: 'LTXVAddGuide',
      inputs: {
        positive: basePositive, negative: baseNegative, vae: ['ckpt', 2], latent: ['latent1', 0],
        image: ['edit_source_base', 0], frame_idx: 0, strength: 1,
      },
    };
    basePositive = ['edit_guide1', 0];
    baseNegative = ['edit_guide1', 1];
    baseLatent = ['edit_guide1', 2];
  } else if (opts.endImageName) {
    graph.i2v1 = {
      class_type: 'LTXVImgToVideoInplaceKJ',
      inputs: {
        vae: ['ckpt', 2], latent: ['latent1', 0],
        num_images: '2',
        'num_images.strength_1': 0.95, 'num_images.image_1': ['prep', 0], 'num_images.index_1': 0,
        'num_images.strength_2': 0.95, 'num_images.image_2': ['prep_end', 0], 'num_images.index_2': opts.frames - 1,
      },
    };
    baseLatent = ['i2v1', 0];
  } else {
    graph.i2v1 = await nodeFromOrdered(
      'LTXVImgToVideoInplace',
      [0.95, !!opts.bypass],
      { vae: ['ckpt', 2], image: ['prep', 0], latent: ['latent1', 0] }
    );
    baseLatent = ['i2v1', 0];
  }
  graph.audio_vae = { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: settings.ltxCkpt } };
  let audioLatent;
  if (opts.audioName) {
    audioLatent = audioLatentNodes(graph, opts.audioName);
  } else {
    graph.audio_lat = await nodeFromOrdered(
      'LTXVEmptyLatentAudio',
      [opts.frames, opts.fps, 1],
      { audio_vae: ['audio_vae', 0] }
    );
    audioLatent = ['audio_lat', 0];
  }
  graph.concat1 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: baseLatent, audio_latent: audioLatent },
  };
  graph.noise1 = { class_type: 'RandomNoise', inputs: { noise_seed: seed } };
  graph.guider1 = {
    class_type: 'CFGGuider',
    inputs: { model: ltxModel, positive: basePositive, negative: baseNegative, cfg: 1 },
  };
  graph.sampler_sel1 = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral_cfg_pp' } };
  graph.sigmas1 = await nodeFromOrdered('ManualSigmas', [LTX_SIGMAS_BASE]);
  graph.samp1 = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise1', 0], guider: ['guider1', 0], sampler: ['sampler_sel1', 0],
      sigmas: ['sigmas1', 0], latent_image: ['concat1', 0],
    },
  };
  graph.sep1 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['samp1', 0] } };

  // Stage 2: x2 latent upsample + refine
  graph.ups_model = { class_type: 'LatentUpscaleModelLoader', inputs: { model_name: settings.ltxUpscaler } };
  graph.ups = {
    class_type: 'LTXVLatentUpsampler',
    inputs: { samples: ['sep1', 0], upscale_model: ['ups_model', 0], vae: ['ckpt', 2] },
  };
  let refinePositive;
  let refineNegative;
  let refineLatent;
  if (opts.guideVideoName) {
    // Crop first-pass guide tokens before inserting the full-resolution
    // source clip for refinement. This mirrors LTX's multi-guide flow.
    graph.edit_crop1 = {
      class_type: 'LTXVCropGuides',
      inputs: { positive: basePositive, negative: baseNegative, latent: ['sep1', 0] },
    };
    graph.edit_guide2 = {
      class_type: 'LTXVAddGuide',
      inputs: {
        positive: ['edit_crop1', 0], negative: ['edit_crop1', 1], vae: ['ckpt', 2], latent: ['ups', 0],
        image: ['edit_source', 0], frame_idx: 0, strength: 1,
      },
    };
    refinePositive = ['edit_guide2', 0];
    refineNegative = ['edit_guide2', 1];
    refineLatent = ['edit_guide2', 2];
  } else if (opts.endImageName) {
    graph.i2v2 = {
      class_type: 'LTXVImgToVideoInplaceKJ',
      inputs: {
        vae: ['ckpt', 2], latent: ['ups', 0],
        num_images: '2',
        'num_images.strength_1': 1, 'num_images.image_1': ['prep', 0], 'num_images.index_1': 0,
        'num_images.strength_2': 1, 'num_images.image_2': ['prep_end', 0], 'num_images.index_2': opts.frames - 1,
      },
    };
    refineLatent = ['i2v2', 0];
  } else {
    graph.i2v2 = await nodeFromOrdered(
      'LTXVImgToVideoInplace',
      [1, !!opts.bypass],
      { vae: ['ckpt', 2], image: ['prep', 0], latent: ['ups', 0] }
    );
    refineLatent = ['i2v2', 0];
  }
  if (!opts.guideVideoName) {
    graph.crop = {
      class_type: 'LTXVCropGuides',
      inputs: { positive: ['cond', 0], negative: ['cond', 1], latent: ['sep1', 0] },
    };
    refinePositive = ['crop', 0];
    refineNegative = ['crop', 1];
  }
  graph.guider2 = {
    class_type: 'CFGGuider',
    inputs: { model: ltxModel, positive: refinePositive, negative: refineNegative, cfg: 1 },
  };
  graph.noise2 = { class_type: 'RandomNoise', inputs: { noise_seed: 42 } };
  graph.sampler_sel2 = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_cfg_pp' } };
  graph.sigmas2 = await nodeFromOrdered('ManualSigmas', [LTX_SIGMAS_REFINE]);
  graph.concat2 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: refineLatent, audio_latent: ['sep1', 1] },
  };
  graph.samp2 = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise2', 0], guider: ['guider2', 0], sampler: ['sampler_sel2', 0],
      sigmas: ['sigmas2', 0], latent_image: ['concat2', 0],
    },
  };
  graph.sep2 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['samp2', 0] } };

  // Decode + mux
  graph.decode = await nodeFromOrdered(
    'VAEDecodeTiled',
    [768, 64, 4096, 4],
    { samples: ['sep2', 0], vae: ['ckpt', 2] }
  );
  graph.audio_dec = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: ['sep2', 1], audio_vae: ['audio_vae', 0] },
  };

  let frameSource = ['decode', 0];
  frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(frameSource);
    frameSource = ['vsr', 0];
  }
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images: frameSource, audio: ['audio_dec', 0], fps: opts.fps * (opts.smooth > 1 ? opts.smooth : 1) },
  };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  // Standalone videos (no gallery source): save the first frame as a poster
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['decode', 0], batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  return filterInputs(graph);
}

/* ---------------- LTX Face ID (reference-to-video) ---------------- */
/* Replicates Alissonerdx's "Best-FaceID v1.0" workflow: LTX 2.3 base  */
/* + distilled-1.1 LoRA @0.6 + Best_FaceID LoRA @1.0, the BFS          */
/* LTXIdentityOverlapConditioning node injects the reference face      */
/* latent at frame-0 with a TASS-RoPE source tag, single-stage,        */
/* euler_ancestral_cfg_pp on the base sigma schedule, 24 fps.          */

const FACEID_PROMPT_INTRO = 'You will receive two inputs:\n\n1. A reference face image showing the person whose appearance must be preserved.\n2. An original `ref_t2v` video caption describing the scene, action, environment, camera framing, movement, lighting, mood, clothing, and props.\n\nYour task is to analyze the reference face image, extract the person’s visible appearance characteristics, and merge those characteristics naturally into the original video caption.\n\nREFERENCE FACE IMAGE:\n[REFERENCE IMAGE PROVIDED TO THE MODEL]\n\nORIGINAL VIDEO CAPTION:\n';

const FACEID_PROMPT_RULES = '\nSTRICT EDITING RULE:\n\nTreat the original video caption as locked text.\n\nYou are allowed to make only these edits:\n\n1. Expand the first subject phrase:\n   - Replace only `A person`, `A man`, or `A woman` with the same original subject noun plus visible appearance details.\n   - The original subject noun must remain present.\n   - Insert the appearance details immediately around the original subject noun.\n   - Do not delete or replace any words that appear after the original subject phrase.\n\n2. Optionally replace later subject pronouns:\n   - `They`, `He`, or `She` may be replaced with a short appearance-based reference.\n   - Preserve every verb, object, action, and remaining word from the original sentence.\n   - Do not alter the order of the words or actions.\n\nEverything else in the original caption is immutable.\n\nYou must preserve verbatim:\n\n- clothing and costumes;\n- actions;\n- action order;\n- environments;\n- objects and props;\n- camera framing;\n- camera movement;\n- lighting;\n- mood;\n- adjectives;\n- temporal transitions;\n- all principal nouns and verbs.\n\nCRITICAL PRESERVATION RULES:\n\n- Never remove clothing or costume descriptions.\n- Never remove phrases between the original subject and the main action.\n- Never replace original words with synonyms.\n- Never summarize or simplify the caption.\n- Never improve or creatively rewrite the caption.\n- Never add new actions, clothing, props, people, or environments.\n- Never mention or infer the person’s identity or name.\n- Never repeat labels such as `REFERENCE FACE IMAGE` or `ORIGINAL VIDEO CAPTION`.\n- Never write introductory text such as:\n  - `Okay`\n  - `I understand`\n  - `Let\'s proceed`\n  - `Here is the merged caption`\n  - `The result is`\n\nFACE IMAGE ANALYSIS:\n\nExtract only clearly visible, non-sensitive appearance details, such as:\n\n- apparent age group;\n- skin tone;\n- hair color;\n- hair length;\n- hair texture;\n- hairstyle;\n- face shape;\n- visible facial hair;\n- glasses;\n- clearly visible eye color;\n- other distinctive visible facial features.\n\nDo not:\n\n- identify the person;\n- repeat a name supplied in image metadata or surrounding text;\n- infer ethnicity, nationality, occupation, personality, religion, health, or background;\n- invent unclear characteristics;\n- infer clothing from the face image.\n\nMINIMUM-EDIT PROCEDURE:\n\nStep 1:\nCopy the original caption exactly.\n\nStep 2:\nLocate only the first subject phrase:\n- `A person`\n- `A man`\n- `A woman`\n\nStep 3:\nExpand that phrase with the extracted appearance while preserving the original subject noun.\n\nStep 4:\nFor later pronouns, either preserve the original pronoun or replace only the pronoun with a concise appearance-based subject reference.\n\nFINAL VALIDATION:\n\nBefore answering, silently compare the output with the original caption and verify:\n\n- every original costume and clothing phrase remains;\n- every original action remains;\n- every original prop remains;\n- every original environment remains;\n- every original framing term remains;\n- every original lighting and mood phrase remains;\n- the action order is unchanged;\n- no original principal word was removed;\n- no synonym replaced an original word;\n- only subject appearance information was added;\n- no introductory or explanatory text appears.\n\nOUTPUT REQUIREMENT:\n\nOutput exactly one line containing only the final `ref_t2v` caption.\n\nDo not output analysis, headings, labels, explanations, acknowledgements, or quotation marks.\n\nThe line must begin with exactly:\n\nref_t2v:';

function faceIdDims(w, h) {
  const long = 1024;
  const s = long / Math.max(w || 1024, h || 1024);
  const W = Math.max(256, Math.round((w * s) / 32) * 32);
  const H = Math.max(256, Math.round((h * s) / 32) * 32);
  return { W, H };
}

async function buildAnimateFaceId(faceName, opts) {
  const { W, H } = opts;
  const graph = {};

  // Models: base ckpt -> distilled-1.1 @0.6 -> FaceID LoRA @1.0 -> user LoRAs
  graph.ckpt = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: settings.ltxCkpt } };
  graph.model_lora = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['ckpt', 0], lora_name: settings.ltxFaceIdDistilledLora, strength_model: 0.6 },
  };
  graph.faceid_lora = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['model_lora', 0], lora_name: settings.ltxFaceIdLora, strength_model: 1 },
  };
  const ltxModel = chainModelLoras(graph, ['faceid_lora', 0], opts.loras, 'flora');
  graph.te = await nodeFromOrdered(
    'LTXAVTextEncoderLoader',
    [settings.ltxTextEncoder, settings.ltxCkpt, 'default'],
    {},
    { text_encoder: settings.ltxTextEncoder, ckpt_name: settings.ltxCkpt }
  );
  graph.te_lora = {
    class_type: 'LoraLoader',
    inputs: {
      model: ['ckpt', 0], clip: ['te', 0],
      lora_name: settings.ltxGemmaLora, strength_model: 0.7, strength_clip: 0.7,
    },
  };

  // Reference face (resized ~512, aspect kept — matches the FaceID workflow)
  graph.face_img = { class_type: 'LoadImage', inputs: { image: faceName } };
  graph.face = await nodeFromOrdered(
    'ImageResizeKJv2',
    [512, 512, 'lanczos', 'resize', '0, 0, 0', 'center', 2],
    { image: ['face_img', 0] }
  );

  // Prompt: ref_t2v caption; optional Gemma pass that looks at the face and
  // weaves its visible attributes into the caption (workflow's enhancer).
  const userPrompt = /^\s*ref_t2v:/i.test(opts.prompt) ? opts.prompt : `ref_t2v: ${opts.prompt}`;
  let promptSource = userPrompt;
  if (opts.enhance) {
    graph.refine = {
      class_type: 'TextGenerate',
      inputs: Object.assign(
        {
          clip: ['te_lora', 1],
          image: ['face', 0],
          prompt: FACEID_PROMPT_INTRO + userPrompt + FACEID_PROMPT_RULES,
        },
        textGenInputs(opts.seed, 1024)
      ),
    };
    graph.showPrompt = { class_type: 'PreviewAny', inputs: { source: ['refine', 0] } };
    promptSource = ['refine', 0];
  }
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: ['te_lora', 1], text: promptSource } };
  graph.neg = { class_type: 'CLIPTextEncode', inputs: { clip: ['te_lora', 1], text: LTX_NEGATIVE } };
  graph.cond = {
    class_type: 'LTXVConditioning',
    inputs: { positive: ['pos', 0], negative: ['neg', 0], frame_rate: opts.fps },
  };

  // Empty AV latent (pure t2v — identity comes from the overlap reference)
  graph.latent1 = {
    class_type: 'EmptyLTXVLatentVideo',
    inputs: { width: W, height: H, length: opts.frames, batch_size: 1 },
  };
  graph.audio_vae = { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: settings.ltxCkpt } };
  let audioLatent;
  if (opts.audioName) {
    audioLatent = audioLatentNodes(graph, opts.audioName);
  } else {
    graph.audio_lat = await nodeFromOrdered(
      'LTXVEmptyLatentAudio',
      [opts.frames, opts.fps, 1],
      { audio_vae: ['audio_vae', 0] }
    );
    audioLatent = ['audio_lat', 0];
  }
  graph.concat1 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['latent1', 0], audio_latent: audioLatent },
  };

  // BFS identity overlap: reference latent shares the frame-0 RoPE grid
  // with a distinct source phase (widgets: projector None, source_id 2,
  // phase_scale 1, strength 1, per workflow defaults).
  graph.ident = await nodeFromOrdered(
    'LTXIdentityOverlapConditioning',
    ['None', 2, 1, 1, 'disable', false],
    {
      model: ltxModel,
      positive: ['cond', 0],
      negative: ['cond', 1],
      vae: ['ckpt', 2],
      latent: ['concat1', 0],
      reference_face: ['face', 0],
    }
  );

  graph.noise1 = { class_type: 'RandomNoise', inputs: { noise_seed: opts.seed } };
  graph.guider1 = {
    class_type: 'CFGGuider',
    inputs: { model: ['ident', 0], positive: ['ident', 1], negative: ['ident', 2], cfg: 1 },
  };
  graph.sampler_sel1 = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral_cfg_pp' } };
  graph.sigmas1 = await nodeFromOrdered('ManualSigmas', [LTX_SIGMAS_BASE]);
  graph.samp1 = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise1', 0], guider: ['guider1', 0], sampler: ['sampler_sel1', 0],
      sigmas: ['sigmas1', 0], latent_image: ['ident', 3],
    },
  };
  graph.sep1 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['samp1', 0] } };

  // Trim the overlap reference frame off the output, then decode
  graph.crop = {
    class_type: 'LTXVCropGuides',
    inputs: { positive: ['ident', 1], negative: ['ident', 2], latent: ['sep1', 0] },
  };
  graph.decode = await nodeFromOrdered(
    'VAEDecodeTiled',
    [768, 64, 4096, 4],
    { samples: ['crop', 2], vae: ['ckpt', 2] }
  );
  graph.audio_dec = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: ['sep1', 1], audio_vae: ['audio_vae', 0] },
  };

  let frameSource = ['decode', 0];
  frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(frameSource);
    frameSource = ['vsr', 0];
  }
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images: frameSource, audio: ['audio_dec', 0], fps: opts.fps * (opts.smooth > 1 ? opts.smooth : 1) },
  };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['decode', 0], batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  return filterInputs(graph);
}

/* ------------------- 10Eros DMD Animate (alt LTX) ----------------- */
/* Replicates TenStrip's "10Eros_10SNodes_I2V_DMD_v1" workflow:        */
/* 10Eros v1.2 finetune + DMD distilled LoRA + Echo sampler +          */
/* LTXReferenceConditioning, two passes with x2 latent upsample, 24fps */

const EROS_SIGMA_PRESETS = {
  dmd: { first: '1.0, 0.99375, 0.9875, 0.975, 0.909375, 0.78, 0.725, 0.421875, 0.0', up: '0.92, 0.909375, 0.725, 0.421875, 0.0' },
  card: { first: '1.000, 0.955, 0.893, 0.812, 0.715, 0.603, 0.482, 0.241, 0.121, 0.0', up: '0.92, 0.725, 0.421875, 0.0' },
  v5: { first: '1.000, 0.955, 0.893, 0.812, 0.715, 0.603, 0.482, 0.241, 0.121, 0.0', up: '0.6435, 0.4342, 0.2171, 0.0' },
};
function erosSigmas(preset) {
  if (preset === 'custom' && settings.erosSigmasFirst.trim() && settings.erosSigmasUpscale.trim()) {
    return { first: settings.erosSigmasFirst.trim(), up: settings.erosSigmasUpscale.trim() };
  }
  return EROS_SIGMA_PRESETS[preset] || EROS_SIGMA_PRESETS.dmd;
}

/** Chain user LoRAs (model-only) onto a video model path. */
function chainModelLoras(graph, model, loras, prefix) {
  let m = model;
  let n = 0;
  for (const l of loras || []) {
    if (!l || !l.on || !l.name) continue;
    n += 1;
    const key = prefix + n;
    graph[key] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: m, lora_name: l.name, strength_model: Number(l.strength) || 0 },
    };
    m = [key, 0];
  }
  return m;
}

/** Shared: encode an uploaded audio file into a noise-locked AV audio latent. */
function audioLatentNodes(graph, audioName) {
  graph.load_audio = { class_type: 'LoadAudio', inputs: { audio: audioName } };
  graph.audio_enc = { class_type: 'LTXVAudioVAEEncode', inputs: { audio: ['load_audio', 0], audio_vae: ['audio_vae', 0] } };
  graph.amask = { class_type: 'SolidMask', inputs: { value: 0, width: 1024, height: 1024 } };
  graph.audio_locked = { class_type: 'SetLatentNoiseMask', inputs: { samples: ['audio_enc', 0], mask: ['amask', 0] } };
  return ['audio_locked', 0];
}

async function buildAnimateEros(imageName, opts) {
  const graph = {};
  const halfW = Math.max(64, Math.round(opts.W / 2 / 32) * 32);
  const halfH = Math.max(64, Math.round(opts.H / 2 / 32) * 32);

  // Models (checkpoint provides transformer + video VAE + audio VAE)
  graph.ckpt = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: settings.erosCkpt } };
  graph.audio_vae = { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: settings.erosCkpt } };
  graph.te = await nodeFromOrdered(
    'LTXAVTextEncoderLoader',
    [settings.erosTextEncoder, settings.erosCkpt, 'default'],
    {},
    { text_encoder: settings.erosTextEncoder, ckpt_name: settings.erosCkpt }
  );

  // Prompt (optional in-graph Gemma LTX2 enhancement, like the stock LTX path)
  let promptSource = opts.prompt;
  if (opts.enhance) {
    graph.refine = {
      class_type: 'TextGenerateLTX2Prompt',
      inputs: Object.assign(
        { clip: ['te', 0], image: ['resize_full', 0], prompt: opts.prompt },
        textGenInputs(opts.seed, 256)
      ),
    };
    graph.showPrompt = { class_type: 'PreviewAny', inputs: { source: ['refine', 0] } };
    promptSource = ['refine', 0];
  }
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: ['te', 0], text: promptSource } };
  graph.neg = { class_type: 'CLIPTextEncode', inputs: { clip: ['te', 0], text: '' } };
  graph.cond = {
    class_type: 'LTXVConditioning',
    inputs: { positive: ['pos', 0], negative: ['neg', 0], frame_rate: opts.fps },
  };
  graph.negz = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['cond', 1] } };

  // Source image: full-res guide + half-res guide for the first pass
  graph.img = { class_type: 'LoadImage', inputs: { image: imageName } };
  graph.resize_full = {
    class_type: 'ImageResizeKJv2',
    inputs: {
      image: ['img', 0], width: opts.W, height: opts.H,
      upscale_method: 'area', keep_proportion: 'crop', pad_color: '0, 0, 0',
      crop_position: 'center', divisible_by: 32, device: 'cpu',
    },
  };
  graph.resize_half = {
    class_type: 'ImageResizeKJv2',
    inputs: {
      image: ['img', 0], width: halfW, height: halfH,
      upscale_method: 'area', keep_proportion: 'crop', pad_color: '0, 0, 0',
      crop_position: 'center', divisible_by: 32, device: 'cpu',
    },
  };
  graph.prep = await nodeFromOrdered(
    'LTXVPreprocess',
    [opts.imgCompression != null ? opts.imgCompression : 35],
    { image: ['resize_half', 0] }
  );

  // Optional end frame (pinned to the last frame index on both passes)
  if (opts.endImageName) {
    graph.img_end = { class_type: 'LoadImage', inputs: { image: opts.endImageName } };
    graph.resize_end_full = {
      class_type: 'ImageResizeKJv2',
      inputs: {
        image: ['img_end', 0], width: opts.W, height: opts.H,
        upscale_method: 'area', keep_proportion: 'crop', pad_color: '0, 0, 0',
        crop_position: 'center', divisible_by: 32, device: 'cpu',
      },
    };
    graph.resize_end_half = {
      class_type: 'ImageResizeKJv2',
      inputs: {
        image: ['img_end', 0], width: halfW, height: halfH,
        upscale_method: 'area', keep_proportion: 'crop', pad_color: '0, 0, 0',
        crop_position: 'center', divisible_by: 32, device: 'cpu',
      },
    };
    graph.prep_end = await nodeFromOrdered(
      'LTXVPreprocess',
      [opts.imgCompression != null ? opts.imgCompression : 35],
      { image: ['resize_end_half', 0] }
    );
  }

  // Model chain: reference-enable -> DMD LoRA
  graph.ref_enable = {
    class_type: 'LTXReferenceEnable',
    inputs: { model: ['ckpt', 0], zero_ref_timesteps: false, verbose: false },
  };
  graph.dmd_lora = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['ref_enable', 0], lora_name: settings.erosDmdLora, strength_model: 1 },
  };
  const erosModel = chainModelLoras(graph, ['dmd_lora', 0], opts.loras, 'ulora');

  // Stage 1 (half res)
  graph.latent1 = {
    class_type: 'EmptyLTXVLatentVideo',
    inputs: { width: halfW, height: halfH, length: opts.frames, batch_size: 1 },
  };
  let audioLatent;
  if (opts.audioName) {
    audioLatent = audioLatentNodes(graph, opts.audioName);
  } else {
    graph.audio_lat = await nodeFromOrdered(
      'LTXVEmptyLatentAudio',
      [opts.frames, opts.fps, 1],
      { audio_vae: ['audio_vae', 0] }
    );
    audioLatent = ['audio_lat', 0];
  }
  const i2v1Inputs = {
    vae: ['ckpt', 2], latent: ['latent1', 0],
    num_images: opts.endImageName ? '2' : '1',
    'num_images.strength_1': 1,
    'num_images.image_1': ['prep', 0],
    'num_images.index_1': 0,
  };
  if (opts.endImageName) {
    i2v1Inputs['num_images.strength_2'] = 1;
    i2v1Inputs['num_images.image_2'] = ['prep_end', 0];
    i2v1Inputs['num_images.index_2'] = opts.frames - 1;
  }
  graph.i2v1 = { class_type: 'LTXVImgToVideoInplaceKJ', inputs: i2v1Inputs };
  graph.concat1 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['i2v1', 0], audio_latent: audioLatent },
  };
  graph.ref1 = {
    class_type: 'LTXReferenceConditioning',
    inputs: {
      model: erosModel, vae: ['ckpt', 2], image: ['resize_half', 0],
      target_latent: ['i2v1', 0], strength: 1, position_mode: 'reference', verbose: false,
    },
  };
  graph.sig1 = { class_type: 'EchoDMDSigmas', inputs: { preset: 'custom', custom_sigmas: opts.sigmaFirst } };
  graph.sig1_remap = { class_type: 'EchoDMDSigmaRemap', inputs: { sigmas: ['sig1', 0], method: 'interpolate' } };
  graph.dmd_sampler = { class_type: 'EchoDMDSampler', inputs: {} };
  graph.first = {
    class_type: 'SamplerCustom',
    inputs: {
      model: ['ref1', 0], positive: ['cond', 0], negative: ['negz', 0],
      sampler: ['dmd_sampler', 0], sigmas: ['sig1_remap', 0], latent_image: ['concat1', 0],
      add_noise: true, noise_seed: opts.seed, cfg: 1,
    },
  };
  graph.sep1 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['first', 1] } };

  // Stage 2 (x2 latent upsample + refine)
  graph.ups_model = { class_type: 'LatentUpscaleModelLoader', inputs: { model_name: settings.ltxUpscaler } };
  graph.ups = {
    class_type: 'LTXVLatentUpsampler',
    inputs: { samples: ['sep1', 0], upscale_model: ['ups_model', 0], vae: ['ckpt', 2] },
  };
  const i2v2Inputs = {
    vae: ['ckpt', 2], latent: ['ups', 0],
    num_images: opts.endImageName ? '2' : '1',
    'num_images.strength_1': 1,
    'num_images.image_1': ['resize_full', 0],
    'num_images.index_1': 0,
  };
  if (opts.endImageName) {
    i2v2Inputs['num_images.strength_2'] = 1;
    i2v2Inputs['num_images.image_2'] = ['resize_end_full', 0];
    i2v2Inputs['num_images.index_2'] = opts.frames - 1;
  }
  graph.i2v2 = { class_type: 'LTXVImgToVideoInplaceKJ', inputs: i2v2Inputs };
  graph.concat2 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['i2v2', 0], audio_latent: ['sep1', 1] },
  };
  graph.ref2 = {
    class_type: 'LTXReferenceConditioning',
    inputs: {
      model: erosModel, vae: ['ckpt', 2], image: ['resize_full', 0],
      target_latent: ['i2v2', 0], strength: 1, position_mode: 'reference', verbose: false,
    },
  };
  graph.sig2 = await nodeFromOrdered('ManualSigmas', [opts.sigmaUp]);
  graph.sig2_remap = { class_type: 'EchoDMDSigmaRemap', inputs: { sigmas: ['sig2', 0], method: 'none' } };
  graph.second = {
    class_type: 'SamplerCustom',
    inputs: {
      model: ['ref2', 0], positive: ['cond', 0], negative: ['negz', 0],
      sampler: ['dmd_sampler', 0], sigmas: ['sig2_remap', 0], latent_image: ['concat2', 0],
      add_noise: true, noise_seed: opts.seed, cfg: 1,
    },
  };
  graph.sep2 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['second', 1] } };

  // Decode + mux
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sep2', 0], vae: ['ckpt', 2] } };
  graph.audio_dec = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: ['sep2', 1], audio_vae: ['audio_vae', 0] },
  };

  let frameSource = ['decode', 0];
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(['decode', 0]);
    frameSource = ['vsr', 0];
  }
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['decode', 0], batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images: frameSource, audio: ['audio_dec', 0], fps: opts.fps },
  };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

/* --------------------------- Wan 2.2 Animate ---------------------- */
/* Replicates ComfyUI's official "Wan2.2 14B I2V" template: dual UNET  */
/* (high-noise -> low-noise expert handoff via two KSamplerAdvanced),  */
/* ModelSamplingSD3 shift 5, 16 fps, optional lightx2v 4-step LoRAs.   */

const WAN_NEGATIVE = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';

function wanDims(w, h) {
  const long = 960;
  const s = long / Math.max(w || 1024, h || 1024);
  const W = Math.max(256, Math.round((w * s) / 16) * 16);
  const H = Math.max(256, Math.round((h * s) / 16) * 16);
  return { W, H };
}

async function buildAnimateWan(imageName, opts) {
  const graph = {};
  const fast = opts.fast !== false;
  const steps = fast ? 4 : 20;
  const cfg = fast ? 1 : 3.5;
  const split = fast ? 2 : 10;

  graph.high = { class_type: 'UNETLoader', inputs: { unet_name: settings.wanHighUnet, weight_dtype: 'default' } };
  graph.low = { class_type: 'UNETLoader', inputs: { unet_name: settings.wanLowUnet, weight_dtype: 'default' } };
  let hiModel = ['high', 0];
  let loModel = ['low', 0];
  if (fast) {
    graph.high_lora = { class_type: 'LoraLoaderModelOnly', inputs: { model: hiModel, lora_name: settings.wanHighLora, strength_model: 1 } };
    graph.low_lora = { class_type: 'LoraLoaderModelOnly', inputs: { model: loModel, lora_name: settings.wanLowLora, strength_model: 1 } };
    hiModel = ['high_lora', 0];
    loModel = ['low_lora', 0];
  }
  hiModel = chainModelLoras(graph, hiModel, opts.loras, 'uhlora');
  loModel = chainModelLoras(graph, loModel, opts.loras, 'ullora');
  graph.ms_high = { class_type: 'ModelSamplingSD3', inputs: { model: hiModel, shift: 5 } };
  graph.ms_low = { class_type: 'ModelSamplingSD3', inputs: { model: loModel, shift: 5 } };

  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.wanClip, type: 'wan', device: 'default' } };
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: opts.prompt } };
  graph.neg = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: WAN_NEGATIVE } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.wanVae } };
  graph.img = { class_type: 'LoadImage', inputs: { image: imageName } };
  graph.i2v = {
    class_type: 'WanImageToVideo',
    inputs: {
      positive: ['pos', 0], negative: ['neg', 0], vae: ['vae', 0], start_image: ['img', 0],
      width: opts.W, height: opts.H, length: opts.frames, batch_size: 1,
    },
  };
  graph.ks_high = {
    class_type: 'KSamplerAdvanced',
    inputs: {
      add_noise: 'enable', noise_seed: opts.seed, steps, cfg,
      sampler_name: 'euler', scheduler: 'simple',
      start_at_step: 0, end_at_step: split, return_with_leftover_noise: 'enable',
      model: ['ms_high', 0], positive: ['i2v', 0], negative: ['i2v', 1], latent_image: ['i2v', 2],
    },
  };
  graph.ks_low = {
    class_type: 'KSamplerAdvanced',
    inputs: {
      add_noise: 'disable', noise_seed: 0, steps, cfg,
      sampler_name: 'euler', scheduler: 'simple',
      start_at_step: split, end_at_step: 10000, return_with_leftover_noise: 'disable',
      model: ['ms_low', 0], positive: ['i2v', 0], negative: ['i2v', 1], latent_image: ['ks_high', 0],
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['ks_low', 0], vae: ['vae', 0] } };

  let frameSource = ['decode', 0];
  frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(frameSource);
    frameSource = ['vsr', 0];
  }
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['decode', 0], batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  graph.video = { class_type: 'CreateVideo', inputs: { images: frameSource, fps: 16 * (opts.smooth > 1 ? opts.smooth : 1) } };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

/* ------------------------------------------------------------------ */
/* SCAIL-2 motion transfer (video-to-video)                            */
/* ------------------------------------------------------------------ */
/* Replicates his "SCAIL-2 to LTX 2.3 Motion Transfer" workflow's      */
/* SCAIL stage: SAM3 tracks the human in both the driving video and    */
/* the reference image, SCAIL2ColoredMask pairs the tracks, and        */
/* WanSCAILToVideo conditions a Wan 2.1 SCAIL UNET (lightx2v 4-step    */
/* distill LoRA, 6 steps cfg 1) to re-animate the reference.           */

const SCAIL_NEGATIVE = 'worst quality, blurry, jittery, distorted, deformed, extra limbs, fused fingers, static, low quality, watermark, text';

function scailDims(w, h) {
  // Reference image target ~0.5 MP, dims snapped down to /32 (workflow behavior)
  const target = 0.5 * 1024 * 1024;
  const s = Math.sqrt(target / Math.max(1, (w || 832) * (h || 832)));
  const W = Math.max(256, Math.floor((w * s) / 32) * 32);
  const H = Math.max(256, Math.floor((h * s) / 32) * 32);
  return { W, H };
}

function imageBatchChain(graph, sources, prefix) {
  if (!sources.length) return null;
  let current = sources[0];
  for (let i = 1; i < sources.length; i += 1) {
    const key = `${prefix}${i}`;
    graph[key] = { class_type: 'ImageBatch', inputs: { image1: current, image2: sources[i] } };
    current = [key, 0];
  }
  return current;
}

async function scailAudioRef(graph, opts, fallbackDriveKey) {
  if (opts.driveAudio === false || !opts.driveVideoName) return null;
  const info = await getObjectInfo();
  if (info.VHS_LoadAudioUpload) {
    graph.drive_audio = await nodeFromOrdered('VHS_LoadAudioUpload', [], {}, {
      audio: opts.driveVideoName,
      start_time: opts.driveStartSeconds || 0,
      duration: opts.seconds || 0,
    });
    return ['drive_audio', 0];
  }
  return fallbackDriveKey ? [fallbackDriveKey, 2] : null;
}

async function buildAnimateScail(imageName, opts) {
  const graph = {};

  graph.unet = { class_type: 'UNETLoader', inputs: { unet_name: settings.scailUnet, weight_dtype: 'default' } };
  graph.lightx = { class_type: 'LoraLoaderModelOnly', inputs: { model: ['unet', 0], lora_name: settings.scailLora, strength_model: 1 } };
  let infinityModel = null;
  if (opts.scailMode === 'infinity') {
    graph.ms = { class_type: 'ModelSamplingSD3', inputs: { model: ['lightx', 0], shift: 5 } };
    let pusaModel = ['ms', 0];
    if (settings.scailPusaLora) {
      graph.pusa = {
        class_type: 'LoraLoaderModelOnly',
        inputs: { model: ['ms', 0], lora_name: settings.scailPusaLora, strength_model: 1 },
      };
      pusaModel = ['pusa', 0];
    }
    infinityModel = chainModelLoras(graph, pusaModel, opts.loras, 'slora');
  } else {
    const model = chainModelLoras(graph, ['lightx', 0], opts.loras, 'slora');
    graph.ms = { class_type: 'ModelSamplingSD3', inputs: { model, shift: 5 } };
  }

  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.wanClip, type: 'wan', device: 'default' } };
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: opts.prompt } };
  graph.neg = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: SCAIL_NEGATIVE } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.wanVae } };

  // Reference image, scaled to ~0.5 MP /32
  graph.img = { class_type: 'LoadImage', inputs: { image: imageName } };
  graph.ref = {
    class_type: 'ImageScale',
    inputs: { image: ['img', 0], upscale_method: 'lanczos', width: opts.W, height: opts.H, crop: 'disabled' },
  };

  // SAM3 human tracking on the reference. Stable chunks track the driving clip once.
  graph.sam = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: settings.scailSam } };
  graph.sam_txt = { class_type: 'CLIPTextEncode', inputs: { clip: ['sam', 1], text: 'human' } };
  const trackArgs = opts.scailMode === 'infinity' ? scailInfinitySamTrackArgs() : scailSamTrackArgs();
  const maskArgs = opts.scailMode === 'infinity' ? scailInfinityMaskArgs() : scailMaskArgs();
  graph.track_ref = await nodeFromOrdered('SAM3_VideoTrack', trackArgs,
    { model: ['sam', 0], conditioning: ['sam_txt', 0], images: ['ref', 0] });

  // CLIP-vision embedding of the reference
  graph.cv = { class_type: 'CLIPVisionLoader', inputs: { clip_name: settings.scailClipVision } };
  graph.cv_enc = { class_type: 'CLIPVisionEncode', inputs: { clip_vision: ['cv', 0], image: ['ref', 0], crop: 'none' } };

  const chunkOptions = normalizeScailChunkOptions({
    mode: opts.scailMode,
    stableTracking: opts.scailStableTracking,
    chunkFrames: opts.scailChunkFrames,
    overlapFrames: opts.scailChunkOverlap,
  });
  const useStableChunks = opts.scailMode === 'chunked' && chunkOptions.stableTracking;
  const segments = opts.scailMode === 'chunked'
    ? scailSegments(opts.frames, {
      chunkFrames: chunkOptions.chunkFrames,
      overlapFrames: chunkOptions.overlapFrames,
    })
    : [{ index: 0, startFrame: 0, length: opts.frames, keepStart: 0, keepLength: opts.frames }];
  const frameRanges = [];
  let previousDecode = null;
  let previousScail = null;
  let firstDriveKey = null;
  let posterSource = null;

  if (opts.scailMode === 'infinity') {
    graph.drive_infinity = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
      video: opts.driveVideoName, force_rate: 16, custom_width: 0, custom_height: 0,
      frame_load_cap: opts.frames, skip_first_frames: opts.driveSkipFrames || 0,
      select_every_nth: 1, format: 'None',
    });
    graph.track_drive_infinity = await nodeFromOrdered('SAM3_VideoTrack', trackArgs,
      { model: ['sam', 0], conditioning: ['sam_txt', 0], images: ['drive_infinity', 0] });
    graph.masks_infinity = await nodeFromOrdered('SCAIL2ColoredMask', maskArgs,
      { driving_track_data: ['track_drive_infinity', 0], ref_track_data: ['track_ref', 0] });
    graph.scail_infinity = {
      class_type: 'WanSCAILInfinity',
      inputs: {
        positive: ['pos', 0], negative: ['neg', 0], model: infinityModel, vae: ['vae', 0],
        width: opts.W, height: opts.H,
        seed: opts.seed, steps: 6, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
        window_length: 81, previous_frame_count: 5, max_frames: opts.frames,
        decode_tiled: false, vary_seed_per_window: false,
        pose_video: ['drive_infinity', 0], pose_video_mask: ['masks_infinity', 0],
        reference_image: ['ref', 0], reference_image_mask: ['masks_infinity', 1],
        clip_vision_output: ['cv_enc', 0],
        replacement_mode: false, pose_strength: 1, pose_start: 0, pose_end: 1,
      },
    };

    let frameSource = ['scail_infinity', 0];
    frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
    if (opts.fourK) {
      graph.vsr = rtxVideoSuperResolutionNode(frameSource);
      frameSource = ['vsr', 0];
    }
    if (opts.makePoster) {
      const info = await getObjectInfo();
      if (info.ImageFromBatch) {
        graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['scail_infinity', 0], batch_index: 0, length: 1 } };
        graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
      }
    }
    const videoInputs = { images: frameSource, fps: 16 * (opts.smooth > 1 ? opts.smooth : 1) };
    const audioRef = await scailAudioRef(graph, opts, 'drive_infinity');
    if (audioRef) videoInputs.audio = audioRef;
    graph.video = { class_type: 'CreateVideo', inputs: videoInputs };
    graph.save = {
      class_type: 'SaveVideo',
      inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
    };
    return filterInputs(graph);
  }

  if (useStableChunks) {
    graph.drive_full = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
      video: opts.driveVideoName, force_rate: 16, custom_width: 0, custom_height: 0,
      frame_load_cap: opts.frames, skip_first_frames: opts.driveSkipFrames || 0,
      select_every_nth: 1, format: 'None',
    });
    graph.track_drive_full = await nodeFromOrdered('SAM3_VideoTrack', scailSamTrackArgs(),
      { model: ['sam', 0], conditioning: ['sam_txt', 0], images: ['drive_full', 0] });
    graph.masks_full = await nodeFromOrdered('SCAIL2ColoredMask', maskArgs,
      { driving_track_data: ['track_drive_full', 0], ref_track_data: ['track_ref', 0] });
    firstDriveKey = 'drive_full';
  }

  for (const seg of segments) {
    const suffix = segments.length === 1 ? '' : String(seg.index);
    const driveKey = `drive${suffix}`;
    const masksKey = `masks${suffix}`;
    const scailKey = `scail${suffix}`;
    const ksKey = `ks${suffix}`;
    const decodeKey = `decode${suffix}`;
    let driveImage = [driveKey, 0];
    let poseMask = [masksKey, 0];
    let referenceMask = [masksKey, 1];

    if (useStableChunks) {
      graph[driveKey] = {
        class_type: 'GetImageRangeFromBatch',
        inputs: { images: ['drive_full', 0], start_index: seg.startFrame, num_frames: seg.length },
      };
      graph[masksKey] = {
        class_type: 'GetImageRangeFromBatch',
        inputs: { images: ['masks_full', 0], start_index: seg.startFrame, num_frames: seg.length },
      };
      referenceMask = ['masks_full', 1];
    } else {
      const trackKey = `track_drive${suffix}`;
      if (!firstDriveKey) firstDriveKey = driveKey;
      graph[driveKey] = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
        video: opts.driveVideoName, force_rate: 16, custom_width: 0, custom_height: 0,
        frame_load_cap: seg.length, skip_first_frames: (opts.driveSkipFrames || 0) + seg.startFrame,
        select_every_nth: 1, format: 'None',
      });
      graph[trackKey] = await nodeFromOrdered('SAM3_VideoTrack', scailSamTrackArgs(),
        { model: ['sam', 0], conditioning: ['sam_txt', 0], images: [driveKey, 0] });
      graph[masksKey] = await nodeFromOrdered('SCAIL2ColoredMask', maskArgs,
        { driving_track_data: [trackKey, 0], ref_track_data: ['track_ref', 0] });
      driveImage = [driveKey, 0];
      poseMask = [masksKey, 0];
      referenceMask = [masksKey, 1];
    }

    const scailLinks = {
      positive: ['pos', 0], negative: ['neg', 0], vae: ['vae', 0],
      pose_video: driveImage, pose_video_mask: poseMask,
      reference_image: ['ref', 0], reference_image_mask: referenceMask,
      clip_vision_output: ['cv_enc', 0],
    };
    if (previousDecode) scailLinks.previous_frames = previousDecode;
    const scailOverrides = {
      width: opts.W,
      height: opts.H,
      length: seg.length,
      previous_frame_count: 5,
    };
    if (previousScail) scailOverrides.video_frame_offset = [previousScail, 3];
    graph[scailKey] = await nodeFromOrdered(
      'WanSCAILToVideo',
      [512, 896, 81, 1, 1, 0, 1, 0, 5, false],
      scailLinks,
      scailOverrides
    );

    graph[ksKey] = {
      class_type: 'KSampler',
      inputs: {
        model: ['ms', 0], positive: [scailKey, 0], negative: [scailKey, 1], latent_image: [scailKey, 2],
        seed: opts.seed + seg.index, steps: 6, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
      },
    };
    graph[decodeKey] = { class_type: 'VAEDecode', inputs: { samples: [ksKey, 0], vae: ['vae', 0] } };
    previousDecode = [decodeKey, 0];
    previousScail = scailKey;
    if (!posterSource) posterSource = previousDecode;

    let kept = previousDecode;
    if (seg.keepStart || seg.keepLength !== seg.length) {
      const rangeKey = `range${suffix}`;
      graph[rangeKey] = {
        class_type: 'GetImageRangeFromBatch',
        inputs: { images: previousDecode, start_index: seg.keepStart, num_frames: seg.keepLength },
      };
      kept = [rangeKey, 0];
    }
    frameRanges.push(kept);
  }

  let frameSource = imageBatchChain(graph, frameRanges, 'join') || ['decode', 0];
  frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(frameSource);
    frameSource = ['vsr', 0];
  }
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: posterSource || frameSource, batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  const videoInputs = { images: frameSource, fps: 16 * (opts.smooth > 1 ? opts.smooth : 1) };
  const audioRef = await scailAudioRef(graph, opts, firstDriveKey);
  if (audioRef) videoInputs.audio = audioRef;
  graph.video = { class_type: 'CreateVideo', inputs: videoInputs };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

/** Optional RIFE interpolation stage for any supported video frame batch. */
async function rifeSmooth(graph, frameSource, smooth) {
  if (!smooth || smooth <= 1) return frameSource;
  const info = await getObjectInfo();
  if (!info['RIFE VFI']) {
    throw new Error('RIFE VFI node not found — install ComfyUI-Frame-Interpolation for smooth frame rates.');
  }
  const ckpts = info['RIFE VFI'].input?.required?.ckpt_name?.[0] || [];
  const ckpt = ckpts.includes('rife49.pth') ? 'rife49.pth' : (ckpts[ckpts.length - 1] || 'rife47.pth');
  graph.rife = await nodeFromOrdered(
    'RIFE VFI',
    [ckpt, 10, smooth, true, true, 1],
    { frames: frameSource }
  );
  return ['rife', 0];
}

async function buildExistingVideoUpscale(videoName, opts) {
  const graph = {};
  graph.src = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
    video: videoName,
    force_rate: opts.fps || 0,
    custom_width: 0,
    custom_height: 0,
    frame_load_cap: opts.frames || 0,
    skip_first_frames: 0,
    select_every_nth: 1,
    format: 'None',
  });
  graph.vsr = rtxVideoSuperResolutionNode(['src', 0], opts.scale || 2);
  graph.video = { class_type: 'CreateVideo', inputs: { images: ['vsr', 0], audio: ['src', 2], fps: opts.fps || 16 } };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video_upscale', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

async function buildExistingVideoInterpolate(videoName, opts) {
  const graph = {};
  const smooth = [2, 3, 4].includes(Number(opts.smooth)) ? Number(opts.smooth) : 2;
  const fps = opts.fps || 16;
  graph.src = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
    video: videoName,
    force_rate: fps,
    custom_width: 0,
    custom_height: 0,
    frame_load_cap: opts.frames || 0,
    skip_first_frames: 0,
    select_every_nth: 1,
    format: 'None',
  });
  const frameSource = await rifeSmooth(graph, ['src', 0], smooth);
  graph.video = { class_type: 'CreateVideo', inputs: { images: frameSource, audio: ['src', 2], fps: fps * smooth } };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video_interp', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJsonBody(req) {
  const buf = await readBody(req, 8 * 1024 * 1024);
  return JSON.parse(buf.toString('utf8') || '{}');
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};
function serveFile(res, file, range) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    // Range support so <video> can seek
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), st.size - 1) : st.size - 1;
        res.writeHead(206, {
          'Content-Type': mime,
          'Content-Range': `bytes ${start}-${end}/${st.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
        });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
    }
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': file.includes(DATA) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* ------------------------------------------------------------------ */
/* API routes                                                          */
/* ------------------------------------------------------------------ */

const REQUIRED_CLASSES = {
  core: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoader', 'CLIPTextEncode', 'ConditioningZeroOut',
    'EmptySD3LatentImage', 'KSampler', 'VAEDecode', 'SaveImage', 'LoadImage', 'ImageScale', 'ImageScaleBy',
    'VAEEncode', 'RepeatLatentBatch',
    'ImageScaleToTotalPixels', 'StringConcatenate', 'TextEncodeQwenImageEditPlus'],
  enhance: ['TextGenerate', 'PreviewAny'],
  klein: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'CLIPTextEncode', 'ConditioningZeroOut', 'VAEEncode',
    'ReferenceLatent', 'GetImageSize', 'EmptyFlux2LatentImage', 'Flux2Scheduler', 'CFGGuider',
    'RandomNoise', 'KSamplerSelect', 'SamplerCustomAdvanced', 'VAEDecode', 'SaveImage',
    'ImageToMask', 'GrowMask', 'SetLatentNoiseMask', 'ImageCompositeMasked'],
  qwenedit: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly', 'ModelSamplingAuraFlow',
    'CFGNorm', 'FluxKontextImageScale', 'TextEncodeQwenImageEditPlus', 'FluxKontextMultiReferenceLatentMethod',
    'VAEEncode', 'KSampler', 'VAEDecode', 'SaveImage', 'ImageToMask', 'GrowMask',
    'SetLatentNoiseMask', 'ImageCompositeMasked'],
  regional: ['Ideogram4PromptBuilderKJ', 'Krea2RegionalMultiLoRAV3'],
  faceid: ['LTXIdentityOverlapConditioning', 'ImageResizeKJv2', 'TextGenerate'],
  krea2ref: ['Krea2EditRebalance', 'BasicGuider', 'BasicScheduler', 'SamplerCustomAdvanced'],
  krea2inpaint: ['LoadImage', 'ImageToMask', 'GrowMask', 'VAEEncode', 'SetLatentNoiseMask',
    'ImageCompositeMasked', 'KSampler', 'VAEDecode', 'SaveImage'],
  krea2depth: ['DownloadAndLoadDepthAnythingV3Model', 'DepthAnything_V3',
    'Krea2ControlLoRALoader', 'Krea2ControlImageEncode', 'Krea2ControlApply'],
  smartmask: SAM3_MASK_CLASSES,
  upscale: ['SeedVR2LoadDiTModel', 'SeedVR2LoadVAEModel', 'SeedVR2VideoUpscaler'],
  ultimateupscale: ['UltimateSDUpscale', 'UpscaleModelLoader'],
  video: ['CheckpointLoaderSimple', 'LoraLoaderModelOnly', 'LTXAVTextEncoderLoader', 'TextGenerateLTX2Prompt',
    'LTXVConditioning', 'EmptyLTXVLatentVideo', 'LTXVImgToVideoInplace', 'LTXVAudioVAELoader',
    'LTXVEmptyLatentAudio', 'LTXVConcatAVLatent', 'LTXVSeparateAVLatent', 'RandomNoise', 'CFGGuider',
    'KSamplerSelect', 'ManualSigmas', 'SamplerCustomAdvanced', 'LatentUpscaleModelLoader',
    'LTXVLatentUpsampler', 'LTXVCropGuides', 'VAEDecodeTiled', 'LTXVAudioVAEDecode', 'CreateVideo',
    'SaveVideo', 'ImageScale', 'LTXVPreprocess'],
  videoedit: ['VHS_LoadVideo', 'LTXVAddGuide'],
  video4k: ['RTXVideoSuperResolution'],
  wan: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly', 'ModelSamplingSD3',
    'WanImageToVideo', 'KSamplerAdvanced', 'VAEDecode', 'CreateVideo', 'SaveVideo'],
  eros: ['CheckpointLoaderSimple', 'LTXVAudioVAELoader', 'LTXAVTextEncoderLoader', 'ImageResizeKJv2',
    'LTXVPreprocess', 'LTXReferenceEnable', 'LTXReferenceConditioning', 'LoraLoaderModelOnly',
    'EmptyLTXVLatentVideo', 'LTXVEmptyLatentAudio', 'LTXVImgToVideoInplaceKJ', 'LTXVConcatAVLatent',
    'EchoDMDSigmas', 'EchoDMDSigmaRemap', 'EchoDMDSampler', 'SamplerCustom', 'LTXVSeparateAVLatent',
    'LatentUpscaleModelLoader', 'LTXVLatentUpsampler', 'ManualSigmas', 'VAEDecode', 'LTXVAudioVAEDecode',
    'CreateVideo', 'SaveVideo'],
  scail: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly', 'ModelSamplingSD3',
    'CLIPVisionLoader', 'CLIPVisionEncode', 'CheckpointLoaderSimple', 'CLIPTextEncode', 'ImageScale',
    'VHS_LoadVideo', 'SAM3_VideoTrack', 'SCAIL2ColoredMask', 'WanSCAILToVideo', 'KSampler',
    'VAEDecode', 'GetImageRangeFromBatch', 'ImageBatch', 'VHS_LoadAudioUpload', 'CreateVideo', 'SaveVideo'],
  scailinfinity: ['WanSCAILInfinity'],
};

async function handleApi(req, res, url) {
  const route = url.pathname;

  /* ------------------------- Auth / profiles ----------------------- */
  const profile = currentProfile(req);
  req.profile = profile;

  if (route === '/api/me') {
    if (!profile) return json(res, 401, { error: 'Not signed in', code: 'auth' });
    return json(res, 200, { profile: publicProfile(profile, db) });
  }
  if (route === '/api/profiles' && req.method === 'GET') {
    return json(res, 200, { profiles: db.profiles.map((p) => publicProfile(p, db)) });
  }
  if (route === '/api/profiles' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim().slice(0, 30);
    if (!name) return json(res, 400, { error: 'Profile name required' });
    if (db.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return json(res, 400, { error: 'That profile name is taken' });
    }
    const pin = String(body.pin || '').trim();
    const entry = { id: uid(), name, pinHash: null, pinSalt: null, createdAt: Date.now() };
    if (pin) {
      const { salt, hash } = hashPin(pin);
      entry.pinSalt = salt;
      entry.pinHash = hash;
    }
    db.profiles.push(entry);
    saveDb();
    res.setHeader('Set-Cookie', profileCookie(signProfileId(entry.id, AUTH_SECRET), 60 * 60 * 24 * 365));
    return json(res, 200, { profile: publicProfile(entry, db) });
  }
  const profLogin = route.match(/^\/api\/profiles\/([\w]+)\/login$/);
  if (profLogin && req.method === 'POST') {
    const body = await readJsonBody(req);
    const target = db.profiles.find((p) => p.id === profLogin[1]);
    if (!target) return json(res, 404, { error: 'Profile not found' });
    if (!verifyPin(target, String(body.pin || ''))) {
      return json(res, 401, { error: 'Wrong PIN' });
    }
    res.setHeader('Set-Cookie', profileCookie(signProfileId(target.id, AUTH_SECRET), 60 * 60 * 24 * 365));
    return json(res, 200, { profile: publicProfile(target, db) });
  }
  if (route === '/api/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', profileCookie('', 0));
    return json(res, 200, { ok: true });
  }
  // Profile management: you can manage yourself; the first profile (owner)
  // can manage everyone.
  const isAdmin = () => profile && db.profiles[0] && profile.id === db.profiles[0].id;
  const canManage = (target) => profile && target && (profile.id === target.id || isAdmin());
  const profAvatar = route.match(/^\/api\/profiles\/([\w]+)\/avatar$/);
  if (profAvatar && req.method === 'POST') {
    const target = db.profiles.find((p) => p.id === profAvatar[1]);
    if (!target) return json(res, 404, { error: 'Profile not found' });
    if (!canManage(target)) return json(res, 401, { error: 'Sign in as this profile to change its photo' });
    const buf = await readBody(req, 10 * 1024 * 1024);
    if (!buf.length) return json(res, 400, { error: 'No image received' });
    const file = `${target.id}_${Date.now()}.png`;
    if (target.avatar) fsp.unlink(path.join(AVATARS, target.avatar)).catch(() => { /* noop */ });
    await fsp.writeFile(path.join(AVATARS, file), buf);
    target.avatar = file;
    saveDb();
    return json(res, 200, { profile: publicProfile(target, db) });
  }
  const profMan = route.match(/^\/api\/profiles\/([\w]+)$/);
  if (profMan && req.method === 'POST') {
    const target = db.profiles.find((p) => p.id === profMan[1]);
    if (!target) return json(res, 404, { error: 'Profile not found' });
    if (!canManage(target)) return json(res, 401, { error: 'Sign in as this profile to edit it' });
    const body = await readJsonBody(req);
    if (typeof body.name === 'string' && body.name.trim()) {
      const name = body.name.trim().slice(0, 30);
      if (db.profiles.some((p) => p.id !== target.id && p.name.toLowerCase() === name.toLowerCase())) {
        return json(res, 400, { error: 'That profile name is taken' });
      }
      target.name = name;
    }
    if (typeof body.pin === 'string') {
      const pin = body.pin.trim();
      if (pin) {
        const { salt, hash } = hashPin(pin);
        target.pinSalt = salt;
        target.pinHash = hash;
      } else {
        target.pinSalt = null;
        target.pinHash = null; // clear PIN
      }
    }
    saveDb();
    return json(res, 200, { profile: publicProfile(target, db) });
  }
  if (profMan && req.method === 'DELETE') {
    const target = db.profiles.find((p) => p.id === profMan[1]);
    if (!target) return json(res, 404, { error: 'Profile not found' });
    if (!canManage(target)) return json(res, 401, { error: 'Sign in as this profile to delete it' });
    if (db.profiles.length <= 1) return json(res, 400, { error: 'The last profile cannot be deleted' });
    // Hard confirmation: the exact profile name must accompany the request
    const body = await readJsonBody(req).catch(() => ({}));
    if (String(body.confirmName || '') !== target.name) {
      return json(res, 400, { error: `Deletion needs confirmName: "${target.name}"` });
    }
    backupDb('pre-delete');
    // Content moves to a trash folder instead of being destroyed
    const TRASH = path.join(DATA, 'trash', `${Date.now()}_${target.name.replace(/[^\w]+/g, '_')}`);
    await fsp.mkdir(TRASH, { recursive: true });
    const toTrash = (dir, f) => {
      if (!f) return Promise.resolve();
      return fsp.rename(path.join(dir, f), path.join(TRASH, f)).catch(() => { /* noop */ });
    };
    const owned = db.items.filter((it) => it.profileId === target.id);
    for (const it of owned) {
      for (const f of [it.file, it.upscaled, it.sourceFile, ...(it.composites || []).map((composite) => composite.file)]) await toTrash(IMAGES, f);
      for (const v of it.videos || []) await toTrash(VIDEOS, v.file);
    }
    db.items = db.items.filter((it) => it.profileId !== target.id);
    db.folders = db.folders.filter((f) => f.profileId !== target.id);
    db.history = db.history.filter((h) => h.profileId !== target.id);
    db.loraPresets = db.loraPresets.filter((p) => p.profileId !== target.id);
    db.userPreferences = db.userPreferences.filter((p) => p.profileId !== target.id);
    for (const f of db.faces.filter((x) => x.profileId === target.id)) await toTrash(FACES, f.file);
    db.faces = db.faces.filter((f) => f.profileId !== target.id);
    if (target.avatar) await toTrash(AVATARS, target.avatar);
    db.profiles = db.profiles.filter((p) => p.id !== target.id);
    saveDb();
    if (profile && profile.id === target.id) res.setHeader('Set-Cookie', profileCookie('', 0));
    return json(res, 200, { ok: true, profiles: db.profiles.map((p) => publicProfile(p, db)) });
  }
  // Everything else needs a signed-in profile ( /api/meta and /api/events
  // stay open so the connection dot and picker work pre-login).
  if (!profile && route !== '/api/meta' && route !== '/api/events') {
    return json(res, 401, { error: 'Sign in to continue', code: 'auth' });
  }

  if (route === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    sseClients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* noop */ } }, 25000);
    req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
    return;
  }

  if (route === '/api/update' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can update Mix Studio' });
    if (jobs.size) return json(res, 409, { error: 'Wait for the Mix Studio queue to finish before updating' });

    // ComfyUI can contain jobs submitted outside this server. Restarting while
    // one is active would lose Mix Studio's completion tracking, so check both.
    try {
      const queue = await (await comfyFetch('/queue')).json();
      if ((queue.queue_running || []).length || (queue.queue_pending || []).length) {
        return json(res, 409, { error: 'Wait for the ComfyUI queue to finish before updating' });
      }
    } catch {
      // An offline ComfyUI instance has no active inference to protect.
    }

    try {
      const update = await updateFromGit(ROOT);
      json(res, 200, {
        ok: true,
        updated: update.updated,
        restarting: update.updated && update.restartRequired,
        branch: update.branch,
        version: update.after.slice(0, 7),
        changedFiles: update.changedFiles,
      });
      if (update.updated && update.restartRequired) scheduleServerRestart();
      return;
    } catch (e) {
      const status = ['update_dirty', 'update_branch'].includes(e.code) ? 409 : 500;
      return json(res, status, { error: String(e.message || e), code: e.code || 'update_failed' });
    }
  }

  if (route === '/api/app/restart' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can restart Mix Studio' });
    try {
      await assertDesktopIsIdle();
    } catch (error) {
      return json(res, 409, { error: String(error.message || error) });
    }
    json(res, 202, { ok: true, restarting: true });
    scheduleServerRestart();
    return;
  }

  if (route === '/api/settings' && req.method === 'GET') {
    return json(res, 200, settings);
  }
  if (route === '/api/hardware' && req.method === 'GET') {
    try {
      return json(res, 200, await hardwareInfo({ exportPath: settings.exportDir || DATA }));
    } catch (error) {
      return json(res, 500, { error: String(error.message || error) });
    }
  }
  if (route === '/api/export-location' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can change the default save folder' });
    const body = await readJsonBody(req);
    try {
      const directory = String(body.directory || '').trim()
        ? await validateExportDirectory(body.directory)
        : '';
      settings.exportDir = directory;
      saveJsonSync(SETTINGS_FILE, settings);
      return json(res, 200, { ok: true, directory, configured: Boolean(directory) });
    } catch (error) {
      return json(res, 400, { error: String(error.message || error) });
    }
  }
  if (route === '/api/settings' && req.method === 'POST') {
    const body = await readJsonBody(req);
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key === 'exportDir') continue;
      if (typeof body[key] === 'string' && body[key].trim()) settings[key] = body[key].trim();
    }
    if (body.features && typeof body.features === 'object') settings.features = normalizeFeatures(body.features);
    settings = normalizeSettings(settings);
    saveJsonSync(SETTINGS_FILE, settings);
    objectInfoCache = null;
    loraInfoCache = { key: '', at: 0, value: {} };
    return json(res, 200, settings);
  }

  if (route === '/api/meta') {
    try {
      const info = await getObjectInfo(url.searchParams.has('refresh'));
      const loras = (info.LoraLoader?.input?.required?.lora_name?.[0]) || [];
      const lorasInfo = await loraMetadataMap(loras, url.searchParams.has('refresh'));
      const missing = {};
      for (const [group, classes] of Object.entries(REQUIRED_CLASSES)) {
        missing[group] = classes.filter((c) => !info[c]);
      }
      const models = configuredModelsStatus(info);
      const installStatus = sam3InstallStatus(RUNTIME);
      return json(res, 200, {
        ok: true,
        loras,
        lorasInfo,
        loraThumbs: db.loraThumbs,
        missing,
        dependencies: {
          canInstall: installStatus.canInstall,
          reason: installStatus.reason,
          restart: Object.assign(restartStatus(RUNTIME), { running: comfyRestartRunning }),
          components: availableComponents().map((id) => ({ id, label: DEPENDENCY_COMPONENTS[id].label })),
          missingComponents: missingDependencyComponentIds(missing, models),
          install: dependencyInstallState,
          sam3: { canInstall: installStatus.canInstall, downloaded: installStatus.downloaded, reason: installStatus.reason },
        },
        models,
        krea2: {
          rawUnet: settings.krea2RawUnet,
          turboLora: settings.krea2TurboLora,
          depthLora: settings.krea2DepthLora,
          depthModel: settings.depthAnythingV3Model,
        },
        features: settings.features,
        queue: jobs.size,
      });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e), loras: [], lorasInfo: {}, missing: null, models: null, features: settings.features, queue: jobs.size });
    }
  }

  // Serve a file back out of ComfyUI's input dir (reuse previews: audio,
  // end frames, motion videos). Client fetches to a blob, so no Range needed.
  if (route === '/api/input' && req.method === 'GET') {
    const name = String(url.searchParams.get('name') || '');
    if (!name) return json(res, 400, { error: 'name required' });
    const parts = name.split('/');
    const fn = parts.pop();
    const sub = parts.join('/');
    try {
      const r = await comfyFetch(`/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=input`);
      if (!r.ok) return json(res, 404, { error: 'File no longer in the ComfyUI input folder' });
      const buf = Buffer.from(await r.arrayBuffer());
      const extra = {
        '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
        '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.aac': 'audio/aac',
      };
      const ext = path.extname(fn).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || extra[ext] || 'application/octet-stream',
        'Content-Length': buf.length,
        'Cache-Control': 'no-cache',
      });
      res.end(buf);
    } catch (e) {
      return json(res, 502, { error: String(e.message || e) });
    }
    return;
  }

  if (route === '/api/upload' && req.method === 'POST') {
    const buf = await readBody(req, 512 * 1024 * 1024); // motion videos can be large
    const orig = decodeURIComponent(req.headers['x-filename'] || 'ref.png').replace(/[^\w.\-]+/g, '_');
    const name = `ks_${Date.now()}_${orig}`;
    const comfyName = await uploadToComfy(buf, name);
    return json(res, 200, { name: comfyName, hasAudio: detectAudioStream(buf, orig) === true });
  }

  if (route === '/api/dependencies/status' && req.method === 'GET') {
    return json(res, 200, dependencyInstallState);
  }

  if (route === '/api/comfy/restart' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can restart ComfyUI' });
    if (dependencyInstallRunning || comfyRestartRunning) return json(res, 409, { error: 'Wait for the current desktop operation to finish.' });
    try {
      await assertDesktopIsIdle();
    } catch (error) {
      return json(res, 409, { error: String(error.message || error) });
    }
    const restart = restartStatus(RUNTIME);
    if (!restart.canRestart) return json(res, 409, { error: restart.reason || 'ComfyUI restart is not configured for this machine.' });
    comfyRestartRunning = true;
    updateDependencyInstallState({ state: 'restarting', phase: 'stopping', message: 'Stopping ComfyUI…', error: null });
    (async () => {
      try {
        await restartComfy(RUNTIME, (phase, message) => updateDependencyInstallState({ state: 'restarting', phase, message, error: null }));
        const reconnected = await waitForComfyReconnect();
        objectInfoCache = null;
        updateDependencyInstallState(reconnected
          ? { state: 'complete', phase: 'reconnected', message: 'ComfyUI is back online. Checking installed models and nodes…', restartRequired: false, error: null }
          : { state: 'error', phase: 'timeout', message: 'ComfyUI did not reconnect yet. Check the desktop app, then press Check again.', error: 'Reconnect timed out.' });
      } catch (error) {
        updateDependencyInstallState({ state: 'error', phase: 'error', message: 'Could not restart ComfyUI.', error: String(error.message || error) });
      } finally {
        comfyRestartRunning = false;
      }
    })();
    return json(res, 202, { ok: true, restart: true, install: dependencyInstallState });
  }

  if (route === '/api/dependencies/install' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can install desktop dependencies' });
    if (dependencyInstallRunning) return json(res, 409, { error: 'A dependency installation is already running' });
    const body = await readJsonBody(req);
    const requested = Array.isArray(body.components) ? body.components.map((value) => String(value)) : [];
    const repair = body.repair === true;
    const components = [...new Set(requested.filter((id) => Object.prototype.hasOwnProperty.call(DEPENDENCY_COMPONENTS, id)))];
    if (!components.length) return json(res, 400, { error: 'Choose at least one missing model or node group to install.' });
    try {
      await assertDesktopIsIdle();
    } catch (error) {
      return json(res, 409, { error: String(error.message || error) });
    }
    dependencyInstallRunning = true;
    updateDependencyInstallState({
      state: 'running', phase: 'queued', message: 'Starting dependency installation…',
      components, repair, completed: 0, total: 0, restartRequired: false, error: null,
    });
    (async () => {
      try {
        const result = await installComponents({
          runtime: RUNTIME,
          settings,
          components,
          options: { repair },
          report: (phase, message, detail) => updateDependencyInstallState(Object.assign({ state: 'running', phase, message }, detail || {})),
        });
        objectInfoCache = null;
        updateDependencyInstallState({ state: 'complete', phase: 'complete', message: repair ? 'Repair finished. Restart ComfyUI, then Check again.' : 'Dependencies installed. Restart ComfyUI to load new nodes, then Check again.', restartRequired: result.restartRequired, environmentSnapshot: result.environmentSnapshot || null, error: null });
      } catch (error) {
        updateDependencyInstallState({ state: 'error', phase: 'error', message: 'Dependency installation stopped.', error: String(error.message || error) });
      } finally {
        dependencyInstallRunning = false;
      }
    })();
    return json(res, 202, { ok: true, install: dependencyInstallState });
  }

  if (route === '/api/dependencies/sam3/install' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can install desktop dependencies' });
    if (dependencyInstallRunning) return json(res, 409, { error: 'A dependency installation is already running' });
    try {
      await assertDesktopIsIdle();
    } catch (error) { return json(res, 409, { error: String(error.message || error) }); }
    dependencyInstallRunning = true;
    updateDependencyInstallState({ state: 'running', phase: 'queued', message: 'Starting the safe Smart Mask installation…', components: ['smartmask'], repair: false, completed: 0, total: 0, restartRequired: false, error: null });
    (async () => {
      try {
        const result = await installComponents({
          runtime: RUNTIME, settings, components: ['smartmask'],
          report: (phase, message, detail) => updateDependencyInstallState(Object.assign({ state: 'running', phase, message }, detail || {})),
        });
        objectInfoCache = null;
        updateDependencyInstallState({ state: 'complete', phase: 'complete', message: 'Smart Mask tools installed safely. Restart ComfyUI, then Check again.', restartRequired: result.restartRequired, environmentSnapshot: result.environmentSnapshot || null, error: null });
      } catch (error) {
        updateDependencyInstallState({ state: 'error', phase: 'error', message: 'Smart Mask installation stopped.', error: String(error.message || error) });
      } finally { dependencyInstallRunning = false; }
    })();
    return json(res, 202, { ok: true, install: dependencyInstallState });
  }

  if (route === '/api/edit-mask/sam3' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const imageName = String(body.imageName || '').trim();
    const prompt = String(body.prompt || '').trim().slice(0, 240);
    const points = Array.isArray(body.points) ? body.points.slice(0, 10) : [];
    if (!imageName) return json(res, 400, { error: 'Add a source image before using smart select' });
    if (!prompt && !points.length) return json(res, 400, { error: 'Describe an object or tap the image' });
    const info = await getObjectInfo();
    const needed = prompt
      ? ['LoadSAM3Model', 'SAM3Grounding', 'MaskToImage', 'SaveImage']
      : ['LoadSAM3Model', 'SAM3CreatePoint', 'SAM3CombinePoints', 'SAM3Segmentation', 'MaskToImage', 'SaveImage'];
    const missing = needed.filter((name) => !info[name]);
    if (missing.length) {
      return json(res, 501, {
        error: 'Smart Select needs the ComfyUI-SAM3 custom node pack. Brush and Box selection still work.',
        code: 'sam3_unavailable',
        missing,
      });
    }
    const graph = buildSam3MaskGraph({ imageName, prompt, points });
    await filterInputs(graph);
    const result = await new Promise((resolve, reject) => {
      (async () => {
        const pid = await queuePrompt(graph);
        const timer = setTimeout(() => {
          jobs.delete(pid);
          reject(new Error('SAM3 selection timed out after 8 minutes. Check the ComfyUI console for a model download or SAM3 error.'));
        }, 480000);
        trackJob(pid, {
          kind: 'smartMask',
          graph,
          profileId: req.profile.id,
          resolve: (value) => { clearTimeout(timer); resolve(value); },
          reject: (error) => { clearTimeout(timer); reject(error); },
        });
        ensureWs();
        broadcast('status', { jobId: pid, kind: 'smartMask', text: 'Queued Smart Select…', itemId: null });
      })().catch(reject);
    });
    return json(res, 200, result);
  }

  if (route === '/api/generate' && req.method === 'POST') {
    const p = await readJsonBody(req);
    p.prompt = String(p.prompt || '').trim();
    p.qwenAngle = normalizeEditAngle(p.qwenAngle);
    p.angleGroupId = p.qwenAngle && /^[a-z0-9_-]{8,96}$/i.test(String(p.angleGroupId || ''))
      ? String(p.angleGroupId) : undefined;
    p.regions = Array.isArray(p.regions) ? p.regions : [];
    // Region descriptions can carry the whole composition — no general
    // prompt needed in that case (the builder supplies a neutral background).
    if (!p.prompt && !p.qwenAngle && !hasActiveRegions(p.regions)) return json(res, 400, { error: 'Prompt is empty' });
    p.width = clampInt(p.width, 64, 4096, 1024);
    p.height = clampInt(p.height, 64, 4096, 1024);
    p.krea2Turbo = p.mode === 'edit' ? true : p.krea2Turbo !== false;
    p.steps = clampInt(p.steps, 1, 100, p.mode === 't2i' && p.krea2Turbo ? 8 : 12);
    p.batch = clampInt(p.batch, 1, 8, 1);
    p.cfg = clampNum(p.cfg, 0, 30, 1);
    p.krea2RawTurboLora = p.krea2Turbo || !p.krea2RawTurboLora || typeof p.krea2RawTurboLora !== 'object'
      ? undefined
      : {
          name: String(p.krea2RawTurboLora.name || settings.krea2TurboLora),
          strength: clampNum(p.krea2RawTurboLora.strength, 0, 2, 0.6),
          on: p.krea2RawTurboLora.on !== false,
        };
    p.imageName = p.mode === 'edit' ? '' : String(p.imageName || '').trim();
    p.imageGuideMode = p.imageName && p.imageGuideMode === 'depth' ? 'depth' : 'image';
    p.depthStrength = p.imageGuideMode === 'depth' ? clampNum(p.depthStrength, 0.05, 2, 1) : undefined;
    p.denoise = p.imageGuideMode === 'depth'
      ? 1
      : clampNum(p.denoise, 0.05, 1, p.mode === 'edit' ? 0.4 : (p.imageName ? 0.45 : 1));
    p.editAspectOverride = p.editAspectOverride === true;
    p.postUpscale = p.mode === 'edit' || p.mode === 't2i' ? normalizePostUpscale(p.postUpscale) : undefined;
    p.seed = Number.isFinite(Number(p.seed)) && Number(p.seed) >= 0
      ? Math.floor(Number(p.seed)) : Math.floor(Math.random() * 2 ** 48);
    p.regions = Array.isArray(p.regions) ? p.regions : [];
    p.maskImageName = String(p.maskImageName || '').trim();
    p.editMaskMode = ['smart', 'box', 'brush'].includes(p.editMaskMode) ? p.editMaskMode : 'brush';
    p.editMaskFeather = clampInt(p.editMaskFeather, 0, 64, 0);
    p.editMaskInvert = p.editMaskInvert === true;
    p.maskInfluence = maskInfluence(p.maskInfluence);
    p.maskExpand = maskExpand(p.maskExpand);

    let refined = null;
    if (p.enhance && p.mode !== 'edit') {
      const rawText = await enhancePrompt(p);
      refined = cleanEnhancedText(rawText, p.prompt);
      p.enhancedText = refined;
    }

    const refNames = p.mode === 'edit'
      ? (Array.isArray(p.refImages) ? p.refImages.filter(Boolean).slice(0, 3) : [])
      : (p.imageName ? [p.imageName] : []);
    if (p.mode !== 'edit') p.editSequence = undefined;
    if (p.mode === 'edit') {
      const engines = ['qwen', 'klein9', 'krea2', 'krea2ref'];
      p.editEngine = engines.includes(p.editEngine) ? p.editEngine : 'klein4';
      if (settings.features[EDIT_FEATURES[p.editEngine]] === false) {
        return json(res, 400, { error: 'This edit model was not installed on this machine.' });
      }
      const sequenceRequested = !!p.editSequence;
      if (sequenceRequested && !supportsSequentialEdit(p.editEngine)) {
        return json(res, 400, { error: 'Sequential edits are available with Klein 4B, Klein 9B, Qwen Edit, and Krea 2 Edit only' });
      }
      p.editSequence = normalizeEditSequence(p.editSequence, p.editEngine) || undefined;
      if (sequenceRequested && !p.editSequence) {
        return json(res, 400, { error: 'Sequential edits need at least two valid sentences' });
      }
      if (p.editSequence && p.qwenAngle) {
        return json(res, 400, { error: 'Use either sequential edits or camera angles for a single run' });
      }
      if (p.editSequence) {
        p.prompt = p.editSequence.prompts[p.editSequence.index];
        p.batch = 1;
      }
      if (p.qwenAngle && !supportsEditAngles(p.editEngine)) {
        return json(res, 400, { error: 'Camera variations are available with Klein 4B, Klein 9B, and Qwen Edit only' });
      }
      if (p.qwenAngle && p.maskImageName) {
        return json(res, 400, { error: 'Use either a camera angle or a localized edit area for a single run' });
      }
      if (p.qwenAngle) {
        p.anglePrompt = editAnglePrompt(p.editEngine, p.qwenAngle, p.prompt);
        if (p.editEngine === 'qwen') p.qwenAnglePrompt = p.anglePrompt;
      }
      if (p.qwenAngle && !refNames.length) {
        return json(res, 400, { error: 'Camera variations need a source image in reference slot 1' });
      }
      if ((p.editEngine === 'qwen' || p.editEngine === 'krea2ref') && !refNames.length) {
        return json(res, 400, { error: `${p.editEngine === 'qwen' ? 'Qwen Edit' : 'Krea 2 Edit'} needs at least one reference image` });
      }
      if (p.maskImageName && !supportsEditMask(p.editEngine)) {
        return json(res, 400, { error: 'Edit areas are available with Klein 4B, Klein 9B, Qwen Edit, and Krea2 only' });
      }
      if (p.maskImageName && !refNames.length) {
        return json(res, 400, { error: 'An edit area needs a source image in reference slot 1' });
      }
      if (p.maskImageName) p.editAspectOverride = false;
      if (p.maskImageName) p.denoise = maskInfluenceDenoise(p.maskInfluence);
      if (p.editEngine === 'krea2') {
        if (p.maskImageName && !refNames.length) {
          return json(res, 400, { error: 'Krea2 inpaint needs a source image' });
        }
      } else if (p.editEngine === 'krea2ref') {
        p.steps = clampInt(p.steps, 4, 20, 8); p.cfg = 1; p.denoise = null; // turbo: 8 steps
      } else if (p.editEngine === 'qwen') {
        p.qwenQuality = normalizeQwenEditQuality(p.qwenQuality);
        const preset = qwenEditPreset(p.qwenQuality);
        p.steps = preset.steps; p.cfg = preset.cfg; p.denoise = null;
      } else {
        p.steps = 4; p.cfg = 1; p.denoise = null;
      }
      // Pixel compositing needs identical source/output dimensions. A custom
      // output ratio intentionally changes the canvas, so retain the edit
      // itself but skip the incompatible preservation pass.
      if (p.editAspectOverride) p.composite = false;
    }
    const { pid } = await queueGenerationJob(p, req.profile.id, refNames, refined);
    return json(res, 200, { jobId: pid, seed: p.seed, refinedPrompt: refined });
  }

  if (route === '/api/upscale' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const item = db.items.find((it) => it.id === body.id && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Image not found' });
    const buf = await fsp.readFile(path.join(IMAGES, item.file));
    const real = pngDims(buf);
    const width = (real && real.w) || item.width || 1024;
    const height = (real && real.h) || item.height || 1024;
    const engine = body.engine === 'ultimate' ? 'ultimate' : 'seedvr2';
    const upscaleMode = body.upscaleMode === 'scale' ? 'scale' : 'resolution';
    const scaleFactor = clampNum(body.scaleFactor, 1, 4, 2);
    const comfyName = await uploadToComfy(buf, `ks_upsrc_${item.id}.png`);
    let opts;
    if (engine === 'ultimate') {
      const info = await getObjectInfo();
      const readinessError = ultimateSdUpscaleReadinessError(info);
      if (readinessError) return json(res, 400, { error: readinessError });
      const promptOverride = String(body.prompt || '').trim();
      const fallbackPrompt = item.refinedPrompt || item.prompt || '';
      opts = {
        engine,
        upscaleMode: 'scale',
        scaleFactor,
        prompt: promptOverride || fallbackPrompt || 'a faithful, highly detailed upscale of the source image',
        promptSource: promptOverride ? 'custom' : (item.refinedPrompt ? 'enhanced' : (item.prompt ? 'original' : 'fallback')),
        seed: Math.floor(Math.random() * 2 ** 31),
      };
    } else {
      opts = {
        engine,
        resolution: targetResolutionForUpscale({
          mode: upscaleMode,
          scaleFactor,
          width,
          height,
          fallbackResolution: clampInt(body.resolution, 512, 8192, 2160),
        }),
        upscaleMode,
        scaleFactor: upscaleMode === 'scale' ? scaleFactor : undefined,
        preScale: clampNum(body.preScale, 1, 4, 1),
        profile: body.profile === 'balanced' ? 'balanced' : 'sharp',
        noise: ['off', 'low', 'medium'].includes(body.noise) ? body.noise : 'low',
      };
    }
    const graph = await buildUpscale(comfyName, opts);
    const pid = await queuePrompt(graph);
    trackJob(pid, { kind: 'upscale', profileId: req.profile.id, itemId: item.id, graph, upscaleInfo: opts });
    ensureWs();
    return json(res, 200, { jobId: pid });
  }

  if (route === '/api/animate' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const engine = ['wan', 'eros', 'scail', 'ltx-edit'].includes(body.engine) ? body.engine : 'ltx';
    if (settings.features[VIDEO_FEATURES[engine]] === false) {
      return json(res, 400, { error: 'This video model was not installed on this machine.' });
    }
    const suppliedMotionPrompt = String(body.prompt || '').trim();
    // SCAIL follows its driving clip, so a motion sentence is an optional
    // creative nudge rather than a prerequisite for a faithful transfer.
    if (!suppliedMotionPrompt && engine !== 'scail') return json(res, 400, { error: 'Describe the motion first' });
    const motionPrompt = suppliedMotionPrompt || 'preserve the movement from the driving video';
    const isLtxEdit = engine === 'ltx-edit';
    let item = body.id ? db.items.find((it) => it.id === body.id && it.profileId === req.profile.id) : null;
    if (body.id && !item) return json(res, 404, { error: 'Image not found' });
    // Video-tab jobs that started from a gallery image group under that item
    if (!item && body.sourceItemId) {
      item = db.items.find((it) => it.id === body.sourceItemId && it.profileId === req.profile.id) || null;
    }

    let comfyName;
    let srcW; let srcH;
    let bypass = false;
    if (item) {
      const buf = await fsp.readFile(path.join(IMAGES, item.file));
      comfyName = await uploadToComfy(buf, `ks_vidsrc_${item.id}.png`);
      // Trust the file, not the recorded dims (edits snap to their own buckets)
      const real = pngDims(buf);
      srcW = (real && real.w) || item.width;
      srcH = (real && real.h) || item.height;
    } else if (body.imageName) {
      comfyName = String(body.imageName); // already uploaded via /api/upload
      srcW = clampInt(body.width, 64, 8192, 1024);
      srcH = clampInt(body.height, 64, 8192, 1024);
    } else if (isLtxEdit) {
      // Edit Anything conditions from the uploaded video, rather than a
      // still image. A placeholder keeps shared job metadata code simple.
      comfyName = await uploadToComfy(BLANK_PNG, 'ks_blank.png');
      srcW = clampInt(body.width, 64, 8192, 1280);
      srcH = clampInt(body.height, 64, 8192, 720);
    } else {
      // pure text-to-video: image guide bypassed, aspect from the picker
      comfyName = await uploadToComfy(BLANK_PNG, 'ks_blank.png');
      srcW = clampInt(body.width, 64, 8192, 704);
      srcH = clampInt(body.height, 64, 8192, 1280);
      bypass = true;
    }

    if (engine !== 'ltx' && bypass) {
      const label = { wan: 'Wan 2.2', eros: '10Eros DMD', scail: 'SCAIL 2', 'ltx-edit': 'LTX Edit' }[engine];
      return json(res, 400, { error: `${label} needs a source image. Use LTX 2.3 for text-to-video.` });
    }
    const faceImageName = engine === 'ltx' && body.faceImageName ? String(body.faceImageName) : null;
    const driveVideoName = (engine === 'scail' || isLtxEdit) && body.driveVideoName ? String(body.driveVideoName) : null;
    const driveStart = clampNum(body.driveStartSeconds, 0, 3600, 0);
    const driveDur = clampNum(body.driveDurSeconds, 0, 3600, 0);
    const selectedScailMode = scailMode(body.scailMode);
    const selectedScailChunkOptions = normalizeScailChunkOptions({
      mode: selectedScailMode,
      stableTracking: body.scailStableTracking,
      chunkFrames: body.scailChunkFrames,
      overlapFrames: body.scailChunkOverlap,
    });
    if (engine === 'scail' && !driveVideoName) {
      return json(res, 400, { error: 'SCAIL 2 needs a driving motion video. Attach one with the 🎥 chip.' });
    }
    if (isLtxEdit && !driveVideoName) {
      return json(res, 400, { error: 'LTX Edit needs the source video you want to edit.' });
    }
    if (engine === 'scail' && selectedScailMode === 'infinity') {
      const info = await getObjectInfo();
      const err = scailInfinityError(info);
      if (err) return json(res, 400, { error: err });
    }

    // Duration: prefer seconds; fall back to legacy frames (25 fps)
    let seconds = Number(body.seconds);
    if (!Number.isFinite(seconds)) seconds = clampInt(body.frames, 25, 377, 121) / 25;
    seconds = engine === 'scail'
      ? scailDurationSeconds(seconds, driveDur)
      : isLtxEdit && driveDur > 0
        ? Math.max(1, Math.min(15, driveDur, seconds))
        : Math.max(1, Math.min(15, seconds));
    let frames; let fps; let W; let H;
    if (engine === 'scail') {
      fps = 16;
      frames = scailFramesForSeconds(seconds);
      ({ W, H } = scailDims(srcW, srcH));
    } else if (engine === 'wan') {
      fps = 16;
      frames = Math.floor(seconds * 16) + 1; // Wan needs 4n+1
      frames = Math.round((frames - 1) / 4) * 4 + 1;
      ({ W, H } = wanDims(srcW, srcH));
    } else if (engine === 'eros') {
      fps = 24;
      frames = Math.round(seconds * 24);
      frames = Math.max(25, Math.min(361, Math.round((frames - 1) / 8) * 8 + 1)); // LTX 8n+1
      ({ W, H } = videoDims(srcW, srcH));
    } else if (faceImageName) {
      // Face ID reference-to-video: single-stage, 24 fps (workflow spec)
      fps = 24;
      frames = Math.round(seconds * 24);
      frames = Math.max(25, Math.min(361, Math.round((frames - 1) / 8) * 8 + 1)); // LTX 8n+1
      ({ W, H } = faceIdDims(srcW, srcH));
    } else {
      fps = 25;
      frames = Math.round(seconds * 25);
      frames = Math.max(25, Math.min(377, Math.round((frames - 1) / 8) * 8 + 1)); // LTX needs 8n+1
      ({ W, H } = videoDims(srcW, srcH));
    }

    const seed = Math.floor(Math.random() * 2 ** 48);
    // Edit Anything expects concise, literal editing instructions. Its author
    // specifically advises against the LTX prompt rewriter for this workflow.
    const enhance = isLtxEdit ? false : body.enhance !== false;
    let prompt = motionPrompt;
    let wanRefined = null;
    if ((engine === 'wan' || engine === 'scail') && enhance && suppliedMotionPrompt) {
      // Wan/SCAIL have no in-graph enhancer: run a Qwen3-VL vision pass first
      const raw = await wanEnhance(comfyName, motionPrompt, seed);
      wanRefined = cleanEnhancedText(raw, motionPrompt);
      prompt = wanRefined;
    }

    const sigmaPreset = ['dmd', 'card', 'v5', 'custom'].includes(body.sigmaPreset) ? body.sigmaPreset : 'dmd';
    const sig = erosSigmas(sigmaPreset);
    // RIFE frame interpolation for LTX, Wan, and SCAIL video outputs.
    const smooth = (engine === 'ltx' || isLtxEdit || engine === 'wan' || engine === 'scail') && [2, 3].includes(Number(body.smooth))
      ? Number(body.smooth) : 1;
    const isLtxLike = engine === 'ltx' || engine === 'eros';
    const audioName = isLtxLike && body.audioName ? String(body.audioName) : null;
    const endImageName = isLtxLike && !faceImageName && body.endImageName ? String(body.endImageName) : null;
    const opts = {
      prompt,
      enhance: isLtxLike ? enhance : false, // LTX/10Eros enhance in-graph
      frames, fps,
      fourK: !!body.fourK,
      seed,
      W, H, bypass,
      makePoster: !item,
      imgCompression: clampInt(body.motionFreedom, 0, 100, 35),
      fast: body.fast !== false,
      audioName,
      endImageName,
      sigmaFirst: sig.first,
      sigmaUp: sig.up,
      driveVideoName,
      guideVideoName: isLtxEdit ? driveVideoName : null,
      guideSkipFrames: isLtxEdit ? Math.max(0, Math.round(driveStart * fps)) : 0,
      editAnything: isLtxEdit,
      faceImageName,
      driveSkipFrames: Math.max(0, Math.round(driveStart * 16)),
      driveStartSeconds: driveStart,
      seconds,
      scailMode: selectedScailMode,
      scailStableTracking: selectedScailChunkOptions.stableTracking,
      scailChunkFrames: selectedScailChunkOptions.chunkFrames,
      scailChunkOverlap: selectedScailChunkOptions.overlapFrames,
      driveAudio: engine === 'scail' && body.driveHasAudio === true,
      smooth,
      loras: Array.isArray(body.loras) ? body.loras.filter((l) => l && l.on && l.name) : [],
    };
    const graph = engine === 'scail' ? await buildAnimateScail(comfyName, opts)
      : engine === 'wan' ? await buildAnimateWan(comfyName, opts)
        : engine === 'eros' ? await buildAnimateEros(comfyName, opts)
          : faceImageName ? await buildAnimateFaceId(faceImageName, opts)
            : await buildAnimate(comfyName, opts);
    const pid = await queuePrompt(graph);
    trackJob(pid, {
      kind: 'video', profileId: req.profile.id, itemId: item ? item.id : null, createItem: !item, graph,
      videoInfo: {
        engine,
        motionPrompt: suppliedMotionPrompt || (engine === 'scail' ? 'Motion copied from driving video' : motionPrompt),
        enhance: enhance && !!suppliedMotionPrompt,
        frames: opts.frames * smooth, fps: opts.fps * smooth,
        smooth: smooth > 1 ? smooth : undefined,
        fourK: opts.fourK, width: opts.fourK ? W * 2 : W, height: opts.fourK ? H * 2 : H,
        seed: opts.seed, t2v: bypass,
        motionFreedom: isLtxLike ? opts.imgCompression : undefined,
        fast: engine === 'wan' ? opts.fast : undefined,
        sigmaPreset: engine === 'eros' ? sigmaPreset : undefined,
        drivenAudio: engine === 'scail' ? opts.driveAudio === true : !!audioName,
        endFrame: !!endImageName,
        motionVideo: !!driveVideoName,
        scailMode: engine === 'scail' ? selectedScailMode : undefined,
        scailStableTracking: engine === 'scail' ? selectedScailChunkOptions.stableTracking : undefined,
        scailChunkFrames: engine === 'scail' ? selectedScailChunkOptions.chunkFrames : undefined,
        scailChunkOverlap: engine === 'scail' ? selectedScailChunkOptions.overlapFrames : undefined,
        // Asset names (ComfyUI input dir) so "Reuse" can restore them
        imageName: bypass ? undefined : comfyName,
        srcWidth: bypass ? undefined : srcW,
        srcHeight: bypass ? undefined : srcH,
        audioName: audioName || undefined,
        endImageName: endImageName || undefined,
        driveVideoName: driveVideoName || undefined,
        driveHasAudio: engine === 'scail' ? opts.driveAudio === true : undefined,
        faceId: !!faceImageName || undefined,
        faceImageName: faceImageName || undefined,
        driveStartSeconds: (engine === 'scail' || isLtxEdit) && driveStart > 0 ? driveStart : undefined,
        driveDurSeconds: (engine === 'scail' || isLtxEdit) && driveDur > 0 ? driveDur : undefined,
        loras: opts.loras,
        refinedMotionPrompt: wanRefined,
      },
    });
    ensureWs();
    return json(res, 200, { jobId: pid, frames, engine });
  }

  if ((route === '/api/video/upscale' || route === '/api/video/interpolate') && req.method === 'POST') {
    const body = await readJsonBody(req);
    const item = db.items.find((it) => it.id === body.id && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Item not found' });
    const entry = (item.videos || []).find((v) => v.id === body.videoId);
    if (!entry) return json(res, 404, { error: 'Video not found' });

    const buf = await fsp.readFile(path.join(VIDEOS, entry.file));
    const info = entry.info || {};
    const dims = mp4Dims(buf) || {};
    const baseInfo = Object.assign({}, info, {
      motionPrompt: info.motionPrompt || item.prompt || 'Processed video',
      fps: info.fps || 16,
      frames: info.frames || 0,
      width: info.width || dims.w || item.width || undefined,
      height: info.height || dims.h || item.height || undefined,
    });
    const comfyName = await uploadToComfy(buf, route === '/api/video/upscale'
      ? `ks_vup_${entry.id}.mp4`
      : `ks_vfi_${entry.id}.mp4`);

    const fps = clampNum(baseInfo.fps, 1, 120, 16);
    const frames = clampInt(baseInfo.frames, 0, 1000000, 0);
    let graph;
    let videoInfo;
    if (route === '/api/video/upscale') {
      const scale = clampNum(body.scale, 1, 4, 2);
      graph = await buildExistingVideoUpscale(comfyName, { fps, frames, scale });
      videoInfo = videoProcessInfo(baseInfo, { kind: 'upscale', scale, parentVideoId: entry.id });
    } else {
      const multiplier = [2, 3, 4].includes(Number(body.multiplier)) ? Number(body.multiplier) : 2;
      graph = await buildExistingVideoInterpolate(comfyName, { fps, frames, smooth: multiplier });
      videoInfo = videoProcessInfo(baseInfo, { kind: 'interpolate', multiplier, parentVideoId: entry.id });
    }
    videoInfo.preservedAudio = true;

    const pid = await queuePrompt(graph);
    trackJob(pid, { kind: 'video', profileId: req.profile.id, itemId: item.id, graph, videoInfo });
    ensureWs();
    return json(res, 200, { jobId: pid });
  }

  // Side-by-side comparison: original motion video (left) + SCAIL result
  // (right), stitched frame-by-frame in ComfyUI and saved as a new video
  // entry on the same gallery item.
  if (route === '/api/composite' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const item = db.items.find((it) => it.id === body.id && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Item not found' });
    const entry = (item.videos || []).find((v) => v.id === body.videoId);
    if (!entry) return json(res, 404, { error: 'Video not found' });
    const info = entry.info || {};
    if (!info.driveVideoName) {
      return json(res, 400, { error: 'No stored motion video for this generation (older videos predate asset tracking)' });
    }
    const fps = info.fps || 16;
    const frames = info.frames || 81;

    // The result lives in our data dir -> push it into ComfyUI's input
    const buf = await fsp.readFile(path.join(VIDEOS, entry.file));
    const outName = await uploadToComfy(buf, `ks_cmp_${entry.id}.mp4`);

    const graph = {};
    graph.drive = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
      video: info.driveVideoName, force_rate: fps, custom_width: 0, custom_height: 0,
      frame_load_cap: frames, skip_first_frames: Math.max(0, Math.round((info.driveStartSeconds || 0) * fps)),
      select_every_nth: 1, format: 'None',
    });
    graph.result = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
      video: outName, force_rate: fps, custom_width: 0, custom_height: 0,
      frame_load_cap: frames, skip_first_frames: 0, select_every_nth: 1, format: 'None',
    });

    // libx264 requires even dims, and container metadata lies about phone
    // videos (rotation). Resize the DECODED frames in-graph instead:
    // shared even height, width auto-computed from each stream's true
    // aspect (width: 0), snapped even via divisible_by. Spacing 8 is even,
    // so the stitched total stays even.
    const rdims = mp4Dims(buf) || { w: info.width || 512, h: info.height || 960 };
    const H = Math.max(2, rdims.h - (rdims.h % 2));
    const kjResize = (src) => ({
      class_type: 'ImageResizeKJv2',
      inputs: {
        image: src, width: 0, height: H, upscale_method: 'lanczos',
        keep_proportion: 'resize', pad_color: '0, 0, 0',
        crop_position: 'center', divisible_by: 2,
      },
    });
    graph.drive_s = kjResize(['drive', 0]);
    graph.result_s = kjResize(['result', 0]);
    graph.stitch = await nodeFromOrdered(
      'ImageStitch',
      ['right', true, 8, 'black'],
      { image1: ['drive_s', 0], image2: ['result_s', 0] }
    );
    graph.video = { class_type: 'CreateVideo', inputs: { images: ['stitch', 0], fps } };
    graph.save = {
      class_type: 'SaveVideo',
      inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/side', format: 'auto', codec: 'auto' },
    };
    const pid = await queuePrompt(await filterInputs(graph));
    trackJob(pid, {
      kind: 'video', profileId: req.profile.id, itemId: item.id, graph,
      videoInfo: {
        engine: info.engine, composite: true,
        motionPrompt: info.motionPrompt || '',
        enhance: false, frames, fps, seed: info.seed,
      },
    });
    ensureWs();
    return json(res, 200, { jobId: pid });
  }

  // Fast DA3 pass over an uploaded guide image so the user can inspect the
  // structure a depth-guided generation will follow. Returns the PNG directly.
  if (route === '/api/depth-preview' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const imageName = String(body.imageName || '').trim();
    if (!imageName) return json(res, 400, { error: 'Upload a source image first' });
    try {
      const graph = await filterInputs(buildDepthPreviewGraph({
        imageName,
        depthModel: settings.depthAnythingV3Model,
        width: body.width ? clampInt(body.width, 64, 4096, 1024) : 0,
        height: body.height ? clampInt(body.height, 64, 4096, 1024) : 0,
      }));
      const pid = await queuePrompt(graph);
      const buf = await waitForComfyImage(pid);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      return res.end(buf);
    } catch (error) {
      return json(res, 502, { error: `Could not build the depth map: ${error.message}` });
    }
  }

  // Static image composites: a grouped Qwen multi-angle contact strip, an
  // edit's original/result, an image-to-image reference/result pair, or a
  // source/depth-map/result strip for depth-guided generations.
  if (route === '/api/image-composite' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const type = body.type === 'selection'
      ? 'selection'
      : (['before-after', 'reference-generation', 'depth-map'].includes(body.type) ? body.type : 'angles');
    let root;
    let sources;
    let label;
    let sourceItems = [];
    if (type === 'selection') {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))];
      if (ids.length < 2) return json(res, 400, { error: 'Choose at least two images for a composite' });
      if (ids.length > 16) return json(res, 400, { error: 'A contact sheet supports up to 16 selected images' });
      const unlocked = isPrivateUnlocked(req);
      const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
      const byId = new Map(visible.map((item) => [item.id, item]));
      sourceItems = ids.map((id) => byId.get(id)).filter(Boolean);
      if (sourceItems.length !== ids.length) return json(res, 404, { error: 'One or more selected images are unavailable' });
      root = sourceItems[0];
      sources = sourceItems.map((item) => item.upscaled || item.file);
      label = `${sourceItems.length} generation contact sheet`;
    } else {
      root = db.items.find((item) => item.id === body.id && item.profileId === req.profile.id);
      if (!root) return json(res, 404, { error: 'Image not found' });
    }
    if (type === 'before-after') {
      if (root.mode !== 'edit' || !root.sourceFile) {
        return json(res, 400, { error: 'This edit no longer has its original source image' });
      }
      sources = [root.sourceFile, root.upscaled || root.file];
      label = 'Before + after';
    } else if (type === 'reference-generation') {
      if (root.mode !== 't2i' || !root.sourceFile) {
        return json(res, 400, { error: 'This generation no longer has its saved reference image' });
      }
      sources = [root.sourceFile, root.upscaled || root.file];
      label = 'Reference + generation';
    } else if (type === 'depth-map') {
      if (root.mode !== 't2i' || root.imageGuideMode !== 'depth' || !root.sourceFile) {
        return json(res, 400, { error: 'This generation was not depth guided or no longer has its saved source image' });
      }
      sources = [root.sourceFile, root.upscaled || root.file];
      label = 'Source + depth + generation';
    } else if (type === 'angles') {
      if (!root.angleGroupId) return json(res, 400, { error: 'This image is not part of a multi-angle set' });
      const set = db.items
        .filter((item) => item.profileId === req.profile.id && item.angleGroupId === root.angleGroupId)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      if (set.length < 2) return json(res, 400, { error: 'This angle set needs at least two completed views' });
      sources = set.map((item) => item.upscaled || item.file);
      label = `${set.length} camera angles`;
    }
    if (['before-after', 'reference-generation', 'depth-map'].includes(type)) {
      const existing = (Array.isArray(root.composites) ? root.composites : []).find((composite) => {
        if (!composite || composite.type !== type) return false;
        if (Array.isArray(composite.sourceFiles)) {
          return composite.sourceFiles.length === sources.length
            && composite.sourceFiles.every((file, index) => file === sources[index]);
        }
        // Composites created before sourceFiles was recorded are safe to
        // reuse until a newer upscale changes the current source pair.
        return !root.upscaled;
      });
      if (existing) {
        try {
          await fsp.access(path.join(IMAGES, existing.file));
          return json(res, 200, { existing: true, item: root, composite: existing });
        } catch { /* stale attachment: rebuild it below */ }
      }
    }
    let buffers;
    try {
      buffers = await Promise.all(sources.map((file) => fsp.readFile(path.join(IMAGES, file))));
    } catch {
      return json(res, 404, { error: 'One of the saved source images is unavailable' });
    }
    const comfyNames = [];
    for (let index = 0; index < buffers.length; index += 1) {
      comfyNames.push(await uploadToComfy(buffers[index], `ks_composite_${root.id}_${index + 1}.png`));
    }
    const graph = type === 'selection'
      ? await buildImageContactSheet(comfyNames)
      : (type === 'depth-map'
        ? await buildDepthComposite(comfyNames, { width: root.width, height: root.height })
        : await buildImageComposite(comfyNames));
    const pid = await queuePrompt(graph);
    trackJob(pid, {
      kind: 'imageComposite', profileId: req.profile.id, graph,
      compositeInfo: {
        type,
        label,
        prompt: root.prompt || '',
        folder: root.folder || null,
        sourceItemId: type === 'selection' ? undefined : root.id,
        sourceFiles: sources,
        sourceItemIds: type === 'selection' ? sourceItems.map((item) => item.id) : undefined,
      },
    });
    ensureWs();
    return json(res, 200, { jobId: pid });
  }

  if (route === '/api/motionprompt' && req.method === 'POST') {
    const body = await readJsonBody(req);
    let comfyName = '';
    if (body.id) {
      const item = db.items.find((it) => it.id === body.id && it.profileId === req.profile.id);
      if (!item) return json(res, 404, { error: 'Image not found' });
      const buf = await fsp.readFile(path.join(IMAGES, item.file));
      comfyName = await uploadToComfy(buf, `ks_motion_${item.id}.png`);
    } else if (body.imageName) {
      // The Video tab has already uploaded its start frame to ComfyUI.
      comfyName = String(body.imageName);
    }
    if (!comfyName) return json(res, 400, { error: 'Attach a start frame first' });
    const raw = await suggestMotionPrompt(comfyName, Math.floor(Math.random() * 2 ** 31));
    const prompt = cleanEnhancedText(raw, '');
    if (!prompt) return json(res, 500, { error: 'Vision model returned no usable text' });
    return json(res, 200, { prompt });
  }

  if (route === '/api/imageprompt' && req.method === 'POST') {
    const body = await readJsonBody(req);
    let comfyName = '';
    if (body.id) {
      const item = db.items.find((it) => it.id === body.id && it.profileId === req.profile.id);
      if (!item) return json(res, 404, { error: 'Image not found' });
      const buf = await fsp.readFile(path.join(IMAGES, item.file));
      comfyName = await uploadToComfy(buf, `ks_prompt_${item.id}.png`);
    } else if (body.imageName) {
      comfyName = String(body.imageName);
    }
    if (!comfyName) return json(res, 400, { error: 'Upload an image first' });
    const raw = await suggestImagePrompt(comfyName, Math.floor(Math.random() * 2 ** 31));
    const prompt = cleanEnhancedText(raw, '');
    if (!prompt) return json(res, 500, { error: 'Vision model returned no usable prompt' });
    return json(res, 200, { prompt });
  }

  if (route === '/api/debug/models') {
    const info = await getObjectInfo();
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const pick = (cls, field) => ((info[cls]?.input?.required?.[field]?.[0]) || []).filter((n) => n.toLowerCase().includes(q));
    return json(res, 200, {
      unets: pick('UNETLoader', 'unet_name'),
      clips: pick('CLIPLoader', 'clip_name'),
      vaes: pick('VAELoader', 'vae_name'),
      loras: pick('LoraLoader', 'lora_name'),
      checkpoints: pick('CheckpointLoaderSimple', 'ckpt_name'),
      clip_visions: pick('CLIPVisionLoader', 'clip_name'),
    });
  }

  if (route === '/api/debug/classes') {
    const info = await getObjectInfo();
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const names = Object.keys(info).filter((k) => k.toLowerCase().includes(q)).slice(0, 60);
    return json(res, 200, { names });
  }

  if (route === '/api/debug/upscale') {
    const info = await getObjectInfo(true);
    const defs = {};
    for (const c of ['SeedVR2LoadDiTModel', 'SeedVR2LoadVAEModel', 'SeedVR2VideoUpscaler', 'UltimateSDUpscale', 'UpscaleModelLoader']) {
      defs[c] = info[c] ? info[c].input : 'MISSING';
    }
    const graph = await buildUpscale('debug.png', { resolution: 2160, preScale: 1, profile: 'sharp', noise: 'low' });
    return json(res, 200, { nodeDefinitions: defs, graphTheAppWouldSend: graph });
  }

  if (route === '/api/debug/animate') {
    const info = await getObjectInfo(true);
    const defs = {};
    for (const c of [...REQUIRED_CLASSES.video, ...REQUIRED_CLASSES.video4k]) {
      if (['LTXVImgToVideoInplace', 'LTXVPreprocess'].includes(c)) {
        defs[c] = info[c] ? info[c].input : 'MISSING'; // full spec incl. tooltips
      } else {
        defs[c] = info[c] ? { required: Object.keys(info[c].input?.required || {}), optional: Object.keys(info[c].input?.optional || {}) } : 'MISSING';
      }
    }
    const graph = await buildAnimate('debug.png', {
      prompt: 'debug motion', enhance: true, frames: 121, fps: 25, fourK: false,
      seed: 1234, W: 704, H: 1280,
    });
    return json(res, 200, { nodeDefinitions: defs, graphTheAppWouldSend: graph });
  }

  if (route === '/api/interrupt' && req.method === 'POST') {
    await comfyFetch('/interrupt', { method: 'POST' });
    return json(res, 200, { ok: true });
  }

  if (route === '/api/queue') {
    try {
      const q = await (await comfyFetch('/queue')).json();
      // Other profiles' jobs stay visible (shared GPU) but get redacted labels
      const sanitize = (row) => {
        const job = jobs.get(row.jobId);
        if (job && job.profileId && job.profileId !== req.profile.id) {
          const who = db.profiles.find((p) => p.id === job.profileId);
          return Object.assign({}, row, {
            label: `${who ? who.name : 'Another profile'}'s job`,
            itemId: null, videoId: null,
          });
        }
        return row;
      };
      const markReorderable = (row) => {
        const job = jobs.get(row.jobId);
        return Object.assign(row, {
          reorderable: !!job && job.profileId === req.profile.id && !!job.graph,
        });
      };
      const running = (q.queue_running || []).map((entry) => markReorderable(sanitize(describeQueueEntry(entry, true))));
      const pending = (q.queue_pending || []).map((entry) => markReorderable(sanitize(describeQueueEntry(entry, false))));
      return json(res, 200, {
        ok: true,
        running,
        pending,
        health: await queueHealth(running, pending),
        history: db.history.filter((h) => h.profileId === req.profile.id).slice(0, 20),
      });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e), running: [], pending: [] });
    }
  }

  if (route === '/api/queue/history/clear' && req.method === 'POST') {
    const before = db.history.length;
    db.history = db.history.filter((entry) => entry.profileId !== req.profile.id);
    const cleared = before - db.history.length;
    saveDb();
    broadcast('queueHistoryCleared', { profileId: req.profile.id, cleared });
    return json(res, 200, { ok: true, cleared });
  }

  if (route === '/api/queue/reorder' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const order = Array.isArray(body.order) ? body.order.map((id) => String(id || '')).filter(Boolean) : [];
    const q = await (await comfyFetch('/queue')).json();
    const pendingIds = (q.queue_pending || []).map((entry) => String(entry && entry[1] || '')).filter(Boolean);
    if (!pendingIds.length) return json(res, 409, { error: 'There are no queued jobs to reorder' });
    const requestedSet = new Set(order);
    if (order.length !== pendingIds.length || requestedSet.size !== order.length
      || pendingIds.some((id) => !requestedSet.has(id))) {
      return json(res, 409, { error: 'The queue changed — refresh and try again' });
    }
    for (const pid of order) {
      const job = jobs.get(pid);
      if (!job || job.profileId !== req.profile.id || !job.graph) {
        return json(res, 409, { error: 'Only Mix Studio jobs from this profile can be reordered' });
      }
    }
    await comfyFetch('/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: pendingIds }),
    });
    const mapping = {};
    try {
      for (const oldPid of order) {
        const job = jobs.get(oldPid);
        const newPid = await queuePrompt(job.graph);
        jobs.delete(oldPid);
        jobs.set(newPid, Object.assign(job, {
          enqueuedAt: Date.now(),
          startedAt: null,
          requeuedFrom: oldPid,
        }));
        mapping[oldPid] = newPid;
      }
    } catch (error) {
      return json(res, 502, { error: `Could not rebuild the queue: ${error.message}` });
    }
    broadcast('queueReordered', { profileId: req.profile.id });
    return json(res, 200, { ok: true, mapping });
  }

  if (route === '/api/queue/cancel' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const pid = String(body.jobId || '');
    if (!pid) return json(res, 400, { error: 'jobId required' });
    // remove from pending first
    await comfyFetch('/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: [pid] }),
    }).catch(() => { /* noop */ });
    // still running? interrupt it (fires execution_interrupted -> failJob)
    let stillRunning = false;
    try {
      const q = await (await comfyFetch('/queue')).json();
      stillRunning = (q.queue_running || []).some((e) => e[1] === pid);
    } catch { /* noop */ }
    if (stillRunning) {
      await comfyFetch('/interrupt', { method: 'POST' }).catch(() => { /* noop */ });
    } else if (jobs.has(pid)) {
      failJob(pid, 'Cancelled');
    }
    return json(res, 200, { ok: true });
  }

  if (route === '/api/queue/reset' && req.method === 'POST') {
    const reset = [];
    for (const reqInfo of comfyResetRequests()) {
      try {
        await comfyFetch(reqInfo.path, reqInfo.init);
        reset.push({ name: reqInfo.name, ok: true });
      } catch (e) {
        reset.push({ name: reqInfo.name, ok: false, error: String(e.message || e) });
      }
    }
    const clearedJobs = [...jobs.keys()];
    for (const pid of clearedJobs) {
      if (jobs.has(pid)) failJob(pid, 'Reset by user');
    }
    broadcast('queueReset', { reset, clearedJobs: clearedJobs.length });
    return json(res, 200, { ok: true, reset, clearedJobs: clearedJobs.length });
  }

  if (route === '/api/private/status') {
    return json(res, 200, { unlocked: isPrivateUnlocked(req) });
  }

  if (route === '/api/private/unlock' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (String(body.password || '') !== galleryPassword(settings)) {
      return json(res, 401, { error: 'Wrong gallery password' });
    }
    res.setHeader('Set-Cookie', privateCookie(privateUnlockToken, 60 * 60 * 12));
    return json(res, 200, { unlocked: true });
  }

  if (route === '/api/private/lock' && req.method === 'POST') {
    res.setHeader('Set-Cookie', privateCookie('', 0));
    return json(res, 200, { unlocked: false });
  }

  if (route === '/api/gallery') {
    const unlocked = isPrivateUnlocked(req);
    const view = galleryView(db, unlocked);
    view.items = view.items.filter((it) => it.profileId === req.profile.id);
    view.folders = view.folders.filter((f) => f.profileId === req.profile.id);
    return json(res, 200, Object.assign({ unlocked, profile: publicProfile(req.profile, db) }, view));
  }

  if (route === '/api/items/selection-stats' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 500);
    if (!ids.length) return json(res, 400, { error: 'Select at least one generation' });
    const unlocked = isPrivateUnlocked(req);
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const byId = new Map(visible.map((item) => [item.id, item]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    if (items.length !== ids.length) return json(res, 404, { error: 'One or more selected generations are unavailable' });
    let bytes = 0;
    for (const ref of selectionAssetRefs(items)) {
      const base = ref.kind === 'video' ? VIDEOS : IMAGES;
      const full = path.resolve(base, ref.file);
      if (full !== base && !full.startsWith(base + path.sep)) continue;
      try { bytes += (await fsp.stat(full)).size; } catch { /* missing assets do not block the summary */ }
    }
    return json(res, 200, selectionSummary(items, bytes));
  }

  if (route === '/api/items/download' && req.method === 'GET') {
    const ids = [...new Set(String(url.searchParams.get('ids') || '').split(',').filter(Boolean))].slice(0, 250);
    if (!ids.length) return json(res, 400, { error: 'Select at least one generation' });
    const unlocked = isPrivateUnlocked(req);
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const byId = new Map(visible.map((item) => [item.id, item]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    if (items.length !== ids.length) return json(res, 404, { error: 'One or more selected generations are unavailable' });
    const usedNames = new Set();
    const entries = [];
    for (const [index, item] of items.entries()) {
      const file = item.upscaled || item.file;
      const full = path.resolve(IMAGES, file || '');
      if (!file || (full !== IMAGES && !full.startsWith(IMAGES + path.sep))) {
        return json(res, 400, { error: 'A selected generation has an invalid image path' });
      }
      try { await fsp.access(full); } catch { return json(res, 404, { error: 'A selected image file is unavailable' }); }
      const ext = path.extname(file) || '.png';
      const base = String(item.prompt || `generation-${index + 1}`)
        .slice(0, 48)
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '') || `generation-${index + 1}`;
      let name = `${base}${ext}`;
      let duplicate = 2;
      while (usedNames.has(name.toLowerCase())) name = `${base}-${duplicate++}${ext}`;
      usedNames.add(name.toLowerCase());
      entries.push({ name, path: full });
    }
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="mix-studio-selection.zip"',
      'Cache-Control': 'no-store',
    });
    try {
      await streamStoredZip(res, entries);
    } catch (error) {
      if (!res.destroyed) res.destroy(error);
    }
    return;
  }

  if (route === '/api/export' && req.method === 'POST') {
    if (!settings.exportDir) return json(res, 409, { error: 'Choose a default save folder in Advanced Settings first' });
    const body = await readJsonBody(req);
    const unlocked = isPrivateUnlocked(req);
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const byId = new Map(visible.map((item) => [item.id, item]));
    const requestedIds = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 250);
    const assets = [];
    if (requestedIds.length) {
      const items = requestedIds.map((id) => byId.get(id)).filter(Boolean);
      if (items.length !== requestedIds.length) return json(res, 404, { error: 'One or more selected generations are unavailable' });
      for (const [index, item] of items.entries()) {
        const file = item.upscaled || item.file;
        if (file) assets.push({ item, file, base: IMAGES, suffix: item.upscaled ? '_upscaled' : '_original', fallback: `generation-${index + 1}` });
      }
    } else {
      const item = byId.get(String(body.id || ''));
      if (!item) return json(res, 404, { error: 'Generation not found' });
      if (body.asset === 'video') {
        const video = (Array.isArray(item.videos) ? item.videos : []).find((entry) => entry.id === body.videoId);
        if (!video?.file) return json(res, 404, { error: 'Video not found' });
        assets.push({ item, file: video.file, base: VIDEOS, suffix: `_video_${Math.max(1, item.videos.indexOf(video) + 1)}` });
      } else if (body.asset === 'composite') {
        const composite = (Array.isArray(item.composites) ? item.composites : []).find((entry) => entry.id === body.compositeId);
        if (!composite?.file) return json(res, 404, { error: 'Composite not found' });
        assets.push({ item, file: composite.file, base: IMAGES, suffix: `_${String(composite.type || 'composite').replace(/[^a-z0-9]+/gi, '_')}` });
      } else {
        const useOriginal = body.variant === 'original';
        const useUpscaled = body.variant === 'upscaled' || (!useOriginal && item.upscaled);
        const file = useUpscaled ? item.upscaled : item.file;
        if (!file) return json(res, 404, { error: 'Image not found' });
        assets.push({ item, file, base: IMAGES, suffix: useUpscaled ? '_upscaled' : '_original' });
      }
    }
    const saved = [];
    try {
      for (const [index, asset] of assets.entries()) {
        const source = path.resolve(asset.base, asset.file);
        if (source !== asset.base && !source.startsWith(asset.base + path.sep)) throw new Error('Invalid saved asset path');
        await fsp.access(source);
        const extension = path.extname(asset.file) || (asset.base === VIDEOS ? '.mp4' : '.png');
        const stem = String(asset.item.prompt || asset.fallback || `mix-studio-${index + 1}`)
          .slice(0, 64).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || `mix-studio-${index + 1}`;
        const target = await copyToExportDirectory(source, settings.exportDir, `${stem}${asset.suffix}${extension}`);
        saved.push(path.basename(target));
      }
      return json(res, 200, { ok: true, count: saved.length, files: saved, directory: settings.exportDir });
    } catch (error) {
      return json(res, 500, { error: `Could not save to the default folder: ${error.message}` });
    }
  }

  if (route === '/api/export-file' && req.method === 'POST') {
    if (!settings.exportDir) return json(res, 409, { error: 'Choose a default save folder in Advanced Settings first' });
    try {
      const buffer = await readBody(req, 64 * 1024 * 1024);
      if (!buffer.length) return json(res, 400, { error: 'No file received' });
      const requestedName = decodeURIComponent(String(req.headers['x-filename'] || 'mix-studio-export.png'));
      const temporary = path.join(DATA, `.export-${crypto.randomUUID()}.tmp`);
      await fsp.writeFile(temporary, buffer);
      try {
        const target = await copyToExportDirectory(temporary, settings.exportDir, requestedName);
        return json(res, 200, { ok: true, count: 1, files: [path.basename(target)], directory: settings.exportDir });
      } finally {
        await fsp.unlink(temporary).catch(() => {});
      }
    } catch (error) {
      return json(res, 500, { error: `Could not save to the default folder: ${error.message}` });
    }
  }

  if (route === '/api/items/group' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 100);
    if (ids.length < 2) return json(res, 400, { error: 'Choose at least two generations to group' });
    const unlocked = isPrivateUnlocked(req);
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const byId = new Map(visible.map((item) => [item.id, item]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    if (items.length !== ids.length) return json(res, 404, { error: 'One or more selected generations are unavailable' });
    const generationGroupId = uid();
    items.forEach((item) => { item.generationGroupId = generationGroupId; });
    saveDb();
    return json(res, 200, { generationGroupId, items });
  }

  const ownPreferences = () => db.userPreferences.find((entry) => entry.profileId === req.profile.id) || null;
  if (route === '/api/preferences' && req.method === 'GET') {
    const prefs = ownPreferences();
    return json(res, 200, {
      defaults: normalizeGenerationDefaults(prefs && prefs.defaults),
      contextOverrides: normalizeContextOverrides(prefs && prefs.contextOverrides),
    });
  }
  if (route === '/api/preferences' && req.method === 'POST') {
    const body = await readJsonBody(req);
    let prefs = ownPreferences();
    if (!prefs) {
      prefs = { profileId: req.profile.id };
      db.userPreferences.push(prefs);
    }
    if (body.defaults) prefs.defaults = normalizeGenerationDefaults(body.defaults);
    if (body.contextOverrides) prefs.contextOverrides = normalizeContextOverrides(body.contextOverrides);
    saveDb();
    return json(res, 200, { defaults: normalizeGenerationDefaults(prefs.defaults), contextOverrides: normalizeContextOverrides(prefs.contextOverrides) });
  }

  if (route === '/api/context') {
    const unlocked = isPrivateUnlocked(req);
    const view = galleryView(db, unlocked);
    const learned = buildLoraContext(view.items.filter((it) => it.profileId === req.profile.id));
    const prefs = ownPreferences();
    return json(res, 200, { loras: mergeContextOverrides(learned, prefs && prefs.contextOverrides) });
  }

  const ownPresets = () => db.loraPresets.filter((pr) => pr.profileId === req.profile.id);
  if (route === '/api/lorapresets' && req.method === 'GET') {
    return json(res, 200, { presets: ownPresets() });
  }
  if (route === '/api/lorapresets' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return json(res, 400, { error: 'Preset name required' });
    const loras = (Array.isArray(body.loras) ? body.loras : [])
      .filter((l) => l && l.name)
      .map((l) => ({
        name: String(l.name),
        strength: Number(l.strength) || 1,
        triggerPhrase: String(l.triggerPhrase || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      }));
    if (!loras.length) return json(res, 400, { error: 'No LoRAs to save' });
    const requestedThumbnail = String(body.thumbnailLora || '');
    const thumbnailLora = loras.some((l) => l.name === requestedThumbnail) ? requestedThumbnail : loras[0].name;
    const existing = ownPresets().find((pr) => pr.name.toLowerCase() === name.toLowerCase());
    if (existing) { existing.loras = loras; existing.thumbnailLora = thumbnailLora; }
    else db.loraPresets.push({ id: uid(), name, loras, thumbnailLora, profileId: req.profile.id });
    saveDb();
    return json(res, 200, { presets: ownPresets() });
  }
  const lpDel = route.match(/^\/api\/lorapresets\/([\w]+)$/);
  if (lpDel && req.method === 'DELETE') {
    db.loraPresets = db.loraPresets.filter((pr) => pr.id !== lpDel[1] || pr.profileId !== req.profile.id);
    saveDb();
    return json(res, 200, { presets: ownPresets() });
  }

  /* Face ID library: named reference faces with a local copy so they
     survive ComfyUI input-folder cleanups. */
  // LoRA thumbnails (global — they describe the model file itself)
  if (route === '/api/lorathumb' && req.method === 'POST') {
    const name = decodeURIComponent(String(req.headers['x-lora-name'] || '')).trim();
    if (!name) return json(res, 400, { error: 'x-lora-name header required' });
    const buf = await readBody(req, 5 * 1024 * 1024);
    if (!buf.length) return json(res, 400, { error: 'No image received' });
    if (db.loraThumbs[name]) fsp.unlink(path.join(LORATHUMBS, db.loraThumbs[name])).catch(() => { /* noop */ });
    const file = `${crypto.createHash('sha1').update(name).digest('hex').slice(0, 16)}_${Date.now()}.jpg`;
    await fsp.writeFile(path.join(LORATHUMBS, file), buf);
    db.loraThumbs[name] = file;
    saveDb();
    return json(res, 200, { loraThumbs: db.loraThumbs });
  }

  const ownFaces = () => db.faces.filter((f) => f.profileId === req.profile.id);
  if (route === '/api/faces' && req.method === 'GET') {
    return json(res, 200, { faces: ownFaces() });
  }
  if (route === '/api/faces' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim().slice(0, 40) || 'Face';
    const imageName = String(body.imageName || '').trim();
    if (!imageName) return json(res, 400, { error: 'imageName required (upload the face first)' });
    // Pull the uploaded bytes back from ComfyUI's input dir for the local copy
    const parts = imageName.split('/');
    const fn = parts.pop();
    const sub = parts.join('/');
    const r = await comfyFetch(`/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=input`);
    const buf = Buffer.from(await r.arrayBuffer());
    const id = uid();
    const file = `${id}.png`;
    await fsp.writeFile(path.join(FACES, file), buf);
    db.faces.unshift({ id, name, file, imageName, createdAt: Date.now(), profileId: req.profile.id });
    saveDb();
    return json(res, 200, { faces: ownFaces() });
  }
  const faceOne = route.match(/^\/api\/faces\/([\w]+)$/);
  if (faceOne && req.method === 'POST') {
    const body = await readJsonBody(req);
    const face = db.faces.find((f) => f.id === faceOne[1] && f.profileId === req.profile.id);
    if (!face) return json(res, 404, { error: 'Face not found' });
    const name = String(body.name || '').trim().slice(0, 40);
    if (name) face.name = name;
    saveDb();
    return json(res, 200, { faces: ownFaces() });
  }
  if (faceOne && req.method === 'DELETE') {
    const face = db.faces.find((f) => f.id === faceOne[1] && f.profileId === req.profile.id);
    if (face) {
      try { await fsp.unlink(path.join(FACES, face.file)); } catch { /* noop */ }
      db.faces = db.faces.filter((f) => f.id !== face.id);
      saveDb();
    }
    return json(res, 200, { faces: ownFaces() });
  }

  if (route === '/api/folders' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return json(res, 400, { error: 'Folder name required' });
    if (db.folders.some((f) => f.profileId === req.profile.id && f.name.toLowerCase() === name.toLowerCase())) {
      return json(res, 400, { error: 'Folder exists' });
    }
    const folder = { id: uid(), name, locked: false, profileId: req.profile.id };
    db.folders.push(folder);
    saveDb();
    return json(res, 200, folder);
  }

  const folderPrivate = route.match(/^\/api\/folders\/([\w]+)\/private$/);
  if (folderPrivate && req.method === 'POST') {
    if (!isPrivateUnlocked(req)) return json(res, 401, { error: 'Unlock the gallery first' });
    const owned = db.folders.find((f) => f.id === folderPrivate[1] && f.profileId === req.profile.id);
    if (!owned) return json(res, 404, { error: 'Folder not found' });
    const body = await readJsonBody(req);
    const folder = setFolderLocked(db, folderPrivate[1], !!body.locked);
    if (!folder) return json(res, 404, { error: 'Folder not found' });
    saveDb();
    return json(res, 200, folder);
  }

  // Merge: move every item from one folder into another, then remove it.
  // Merging a LOCKED source exposes hidden items -> requires unlock first.
  const folderMerge = route.match(/^\/api\/folders\/([\w]+)\/merge$/);
  if (folderMerge && req.method === 'POST') {
    const body = await readJsonBody(req);
    const src = db.folders.find((f) => f.id === folderMerge[1] && f.profileId === req.profile.id);
    if (!src) return json(res, 404, { error: 'Folder not found' });
    const intoId = body.into ? String(body.into) : null;
    const dst = intoId ? db.folders.find((f) => f.id === intoId && f.profileId === req.profile.id) : null;
    if (intoId && !dst) return json(res, 404, { error: 'Destination folder not found' });
    if (intoId === src.id) return json(res, 400, { error: 'Cannot merge a folder into itself' });
    if (src.locked && !isPrivateUnlocked(req)) {
      return json(res, 401, { error: 'Unlock the gallery first — merging a locked folder reveals its items' });
    }
    let moved = 0;
    for (const it of db.items) {
      if (it.profileId === req.profile.id && it.folder === src.id) {
        it.folder = dst ? dst.id : null;
        moved++;
      }
    }
    db.folders = db.folders.filter((f) => f.id !== src.id);
    saveDb();
    return json(res, 200, { ok: true, moved, into: dst ? dst.name : null });
  }

  const folderDel = route.match(/^\/api\/folders\/([\w]+)$/);
  if (folderDel && req.method === 'DELETE') {
    const folder = db.folders.find((f) => f.id === folderDel[1] && f.profileId === req.profile.id);
    if (!folder) return json(res, 404, { error: 'Folder not found' });
    if (folder.locked && !isPrivateUnlocked(req)) {
      return json(res, 401, { error: 'Unlock the gallery first' });
    }
    db.folders = db.folders.filter((f) => f.id !== folderDel[1]);
    for (const it of db.items) if (it.folder === folderDel[1]) it.folder = null;
    saveDb();
    return json(res, 200, { ok: true });
  }

  const vidRoute = route.match(/^\/api\/item\/([\w]+)\/video\/([\w]+)$/);
  if (vidRoute && req.method === 'POST') {
    const item = db.items.find((it) => it.id === vidRoute[1] && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Not found' });
    const video = (item.videos || []).find((entry) => entry.id === vidRoute[2]);
    if (!video) return json(res, 404, { error: 'Video not found' });
    const body = await readJsonBody(req);
    video.liked = body.liked === true;
    saveDb();
    return json(res, 200, item);
  }
  if (vidRoute && req.method === 'DELETE') {
    const item = db.items.find((it) => it.id === vidRoute[1] && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Not found' });
    const v = (item.videos || []).find((x) => x.id === vidRoute[2]);
    item.videos = (item.videos || []).filter((x) => x.id !== vidRoute[2]);
    saveDb();
    if (v) fsp.unlink(path.join(VIDEOS, v.file)).catch(() => { /* noop */ });
    return json(res, 200, item);
  }

  const itemRoute = route.match(/^\/api\/item\/([\w]+)(?:\/(move))?$/);
  const likeRoute = route.match(/^\/api\/item\/([\w]+)\/like$/);
  if (likeRoute && req.method === 'POST') {
    const item = db.items.find((entry) => entry.id === likeRoute[1] && entry.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Not found' });
    const body = await readJsonBody(req);
    item.liked = body.liked === true;
    saveDb();
    return json(res, 200, item);
  }
  if (itemRoute) {
    const item = db.items.find((it) => it.id === itemRoute[1] && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Not found' });
    if (itemRoute[2] === 'move' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const targetFolder = body.folder || null;
      const allowed = canMoveToFolder(db, targetFolder, isPrivateUnlocked(req));
      if (!allowed.ok) {
        return json(res, allowed.reason === 'missing' ? 404 : 401, {
          error: allowed.reason === 'missing' ? 'Folder not found' : 'Unlock the gallery first',
        });
      }
      item.folder = targetFolder;
      saveDb();
      return json(res, 200, item);
    }
    if (req.method === 'DELETE') {
      db.items = db.items.filter((it) => it.id !== item.id);
      saveDb();
      for (const f of [item.file, item.upscaled, item.sourceFile, ...(item.composites || []).map((composite) => composite.file)]) {
        if (f) fsp.unlink(path.join(IMAGES, f)).catch(() => { /* noop */ });
      }
      for (const v of item.videos || []) {
        fsp.unlink(path.join(VIDEOS, v.file)).catch(() => { /* noop */ });
      }
      return json(res, 200, { ok: true });
    }
    return json(res, 200, item);
  }

  json(res, 404, { error: 'Unknown API route' });
}

function jobLabel(job) {
  if (!job) return 'Other ComfyUI job';
  if (job.kind === 'gen') {
    const sequence = job.params.editSequence;
    const prefix = sequence
      ? `Sequential edit ${sequence.index + 1}/${sequence.total}: `
      : (job.params.mode === 'edit' ? 'Edit: ' : 'Create: ');
    return prefix + (job.params.prompt || '').slice(0, 70);
  }
  if (job.kind === 'upscale') return job.upscaleInfo && job.upscaleInfo.engine === 'ultimate' ? 'Upscale (Ultimate SD)' : 'Upscale (SeedVR2)';
  if (job.kind === 'video' && job.videoInfo && job.videoInfo.processed === 'upscale') return 'Video upscale (RTX)';
  if (job.kind === 'video' && job.videoInfo && job.videoInfo.processed === 'interpolate') return 'Frame interpolation (RIFE)';
  if (job.kind === 'video') return 'Video: ' + ((job.videoInfo && job.videoInfo.motionPrompt) || '').slice(0, 70);
  if (job.kind === 'enhance') return 'Prompt enhance';
  if (job.kind === 'smartMask') return 'SAM3 smart selection';
  return job.kind;
}

function clampInt(v, min, max, dflt) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}
function clampNum(v, min, max, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/images/')) {
      const file = path.normalize(path.join(IMAGES, url.pathname.slice(8)));
      if (!file.startsWith(IMAGES)) { res.writeHead(403); return res.end(); }
      return serveFile(res, file, req.headers.range);
    }
    if (url.pathname.startsWith('/videos/')) {
      const file = path.normalize(path.join(VIDEOS, url.pathname.slice(8)));
      if (!file.startsWith(VIDEOS)) { res.writeHead(403); return res.end(); }
      return serveFile(res, file, req.headers.range);
    }
    if (url.pathname.startsWith('/faces/')) {
      const file = path.normalize(path.join(FACES, url.pathname.slice(7)));
      if (!file.startsWith(FACES)) { res.writeHead(403); return res.end(); }
      return serveFile(res, file, req.headers.range);
    }
    if (url.pathname.startsWith('/avatars/')) {
      const file = path.normalize(path.join(AVATARS, url.pathname.slice(9)));
      if (!file.startsWith(AVATARS)) { res.writeHead(403); return res.end(); }
      return serveFile(res, file, req.headers.range);
    }
    if (url.pathname.startsWith('/lorathumbs/')) {
      const file = path.normalize(path.join(LORATHUMBS, url.pathname.slice(12)));
      if (!file.startsWith(LORATHUMBS)) { res.writeHead(403); return res.end(); }
      return serveFile(res, file, req.headers.range);
    }
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    return serveFile(res, file);
  } catch (e) {
    console.error('[error]', req.method, url.pathname, e.message);
    if (!res.headersSent) json(res, 500, { error: String(e.message || e) });
  }
});

let restartScheduled = false;
function launchDetachedReplacement() {
  const helper = [
    "const { spawn } = require('child_process');",
    'const [exe, script, cwd] = process.argv.slice(1);',
    "setTimeout(() => { const child = spawn(exe, [script], { cwd, detached: true, stdio: 'ignore', windowsHide: true }); child.unref(); }, 1200);",
  ].join(' ');
  const child = spawn(process.execPath, ['-e', helper, process.execPath, __filename, ROOT], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function scheduleServerRestart() {
  if (restartScheduled) return;
  restartScheduled = true;
  broadcast('appRestarting', {});
  setTimeout(() => {
    const restartMode = process.env.MIXBOX_RESTART_MODE || process.env.KREASTUDIO_RESTART_MODE;
    if (restartMode !== 'batch') launchDetachedReplacement();
    for (const client of sseClients) {
      try { client.end(); } catch { /* noop */ }
    }
    server.close(() => process.exit(75));
    setTimeout(() => process.exit(75), 1000).unref();
  }, 500).unref();
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  * Mix Studio running');
  console.log(`    Local:   http://localhost:${PORT}`);
  for (const entry of mobileAccessAddresses(os.networkInterfaces())) {
    const label = entry.tailscale ? 'Tailscale' : 'Phone';
    const note = entry.tailscale ? 'private phone access' : entry.name;
    console.log(`    ${(label + ':').padEnd(11)}http://${entry.address}:${PORT}   (${note})`);
  }
  console.log(`    ComfyUI: ${settings.comfyUrl}`);
  if (typeof WebSocket === 'undefined') {
    console.log('    Note: Node < 22 detected - live progress disabled (polling fallback).');
  }
  console.log('');
});
