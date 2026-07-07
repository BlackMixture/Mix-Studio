'use strict';
/* One-time recovery: rebuild the Nathan profile's gallery from ComfyUI's
 * output folder after the accidental profile deletion.
 * - PNGs: prompt/seed/dims/regions parsed from the embedded ComfyUI graph
 * - MP4s: imported as standalone video items (nearest poster_*.png used
 *   as the gallery poster when available)
 * Run:  node recover_nathan.js [--dry]
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(process.env.USERPROFILE, 'Documents', 'ComfyUI', 'output', 'KreaStudio');
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const IMAGES = path.join(DATA, 'images');
const VIDEOS = path.join(DATA, 'videos');
const DB_FILE = path.join(DATA, 'db.json');
const DRY = process.argv.includes('--dry');

const uid = () => crypto.randomBytes(8).toString('hex');

/* ---------------- PNG metadata ---------------- */
function pngDims(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function pngTextChunks(buf) {
  const out = {};
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (type === 'tEXt') {
      const data = buf.subarray(off + 8, off + 8 + len);
      const nul = data.indexOf(0);
      if (nul > 0) out[data.toString('latin1', 0, nul)] = data.toString('latin1', nul + 1);
    }
    if (type === 'IDAT' || type === 'IEND') break; // metadata precedes image data
    off += 12 + len;
  }
  return out;
}

/* ---------------- graph mining ---------------- */
function textOf(v) { return typeof v === 'string' ? v.trim() : ''; }

function mineGraph(graph) {
  const out = { prompt: '', seed: null, mode: 't2i', regions: undefined, loras: [], upscale: false };
  if (!graph || typeof graph !== 'object') return out;
  const nodes = Object.values(graph);
  const byClass = (c) => nodes.filter((n) => n && n.class_type === c);

  if (byClass('SeedVR2VideoUpscaler').length || byClass('UltimateSDUpscale').length) out.upscale = true;
  if (byClass('SetLatentNoiseMask').length && byClass('GrowMask').length) out.mode = 'edit';
  if (byClass('ReferenceLatent').length || byClass('TextEncodeQwenImageEditPlus').length || byClass('KleinEditComposite').length) out.mode = 'edit';

  // Prompt: prefer the literal text on the positive encode; regional graphs
  // keep the user prompt in the Ideogram builder's high_level_description.
  const builder = byClass('Ideogram4PromptBuilderKJ')[0];
  if (builder) {
    out.prompt = textOf(builder.inputs.high_level_description) || textOf(builder.inputs.background);
    try {
      const els = JSON.parse(builder.inputs.elements_data || '[]');
      if (Array.isArray(els) && els.length) {
        out.regions = els.map((e) => ({
          x: e.x, y: e.y, w: e.w, h: e.h,
          description: e.desc || '', color: (e.palette && e.palette[0]) || '',
        }));
      }
    } catch { /* noop */ }
  }
  if (!out.prompt) {
    for (const key of ['pos', 'positive']) {
      if (graph[key] && textOf(graph[key].inputs && graph[key].inputs.text)) { out.prompt = textOf(graph[key].inputs.text); break; }
    }
  }
  if (!out.prompt) {
    // enhanced graphs link pos.text to TextGenerate — recover the user's input
    const tg = byClass('TextGenerateLTX2Prompt')[0] || byClass('TextGenerate')[0];
    if (tg) out.prompt = textOf(tg.inputs.prompt).slice(0, 400);
  }
  if (!out.prompt) {
    const enc = byClass('CLIPTextEncode').map((n) => textOf(n.inputs && n.inputs.text)).filter((t) => t && t.length > 3);
    if (enc.length) out.prompt = enc.sort((a, b) => b.length - a.length)[0];
  }
  if (!out.prompt) {
    // Edit pipelines (Klein/Qwen) carry the instruction in inputs.prompt
    const withPrompt = nodes.map((n) => textOf(n && n.inputs && n.inputs.prompt)).filter((t) => t && t.length > 3);
    if (withPrompt.length) out.prompt = withPrompt.sort((a, b) => b.length - a.length)[0].slice(0, 400);
  }

  for (const key of ['sampler', 'ks']) {
    if (graph[key] && graph[key].inputs && Number.isFinite(Number(graph[key].inputs.seed))) {
      out.seed = Number(graph[key].inputs.seed);
      break;
    }
  }
  if (out.seed == null) {
    const rn = byClass('RandomNoise')[0];
    if (rn) out.seed = Number(rn.inputs.noise_seed) || null;
  }

  const SKIP_LORAS = /distilled|lightning|lightx2v|gemma|dmd|Best_FaceID/i;
  for (const n of nodes) {
    if (!n || (n.class_type !== 'LoraLoader' && n.class_type !== 'LoraLoaderModelOnly')) continue;
    const name = textOf(n.inputs && n.inputs.lora_name);
    if (name && !SKIP_LORAS.test(name) && !out.loras.some((l) => l.name === name)) {
      out.loras.push({ name, strength: Number(n.inputs.strength_model) || 1, on: true });
    }
  }
  return out;
}

/* ---------------- main ---------------- */
(async () => {
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.items = db.items || [];
  db.profiles = db.profiles || [];

  let nathan = db.profiles.find((p) => p.name === 'Nathan');
  if (!nathan) {
    nathan = { id: uid(), name: 'Nathan', pinHash: null, pinSalt: null, createdAt: Date.now() };
    db.profiles.unshift(nathan); // first profile = owner
  } else {
    db.profiles = [nathan, ...db.profiles.filter((p) => p.id !== nathan.id)];
  }

  const entries = (await fsp.readdir(SRC))
    .map((f) => ({ f, full: path.join(SRC, f), st: fs.statSync(path.join(SRC, f)) }))
    .filter((e) => e.st.isFile())
    .sort((a, b) => a.st.mtimeMs - b.st.mtimeMs);

  const pngs = entries.filter((e) => /\.png$/i.test(e.f));
  const vids = entries.filter((e) => /\.(mp4|webm|mov)$/i.test(e.f));
  const posters = pngs.filter((e) => /^poster/i.test(e.f));
  const genPngs = pngs.filter((e) => !/^poster/i.test(e.f));

  console.log(`source: ${entries.length} files | ${genPngs.length} images | ${vids.length} videos | ${posters.length} posters`);
  if (DRY) {
    const sample = genPngs.slice(-3);
    for (const e of sample) {
      const buf = fs.readFileSync(e.full);
      const meta = pngTextChunks(buf);
      let mined = {};
      try { mined = mineGraph(JSON.parse(meta.prompt || '{}')); } catch { /* noop */ }
      console.log('sample:', e.f, JSON.stringify(mined).slice(0, 220));
    }
    return;
  }

  let imported = 0;
  let withPrompt = 0;

  // Images
  for (const e of genPngs) {
    const buf = fs.readFileSync(e.full);
    const dims = pngDims(buf) || { w: 1024, h: 1024 };
    let mined = { prompt: '', seed: null, mode: 't2i', loras: [], regions: undefined, upscale: false };
    try {
      const meta = pngTextChunks(buf);
      if (meta.prompt) mined = mineGraph(JSON.parse(meta.prompt));
    } catch { /* unparseable metadata */ }
    const id = uid();
    await fsp.writeFile(path.join(IMAGES, `${id}.png`), buf);
    if (mined.prompt) withPrompt++;
    db.items.push({
      id,
      file: `${id}.png`,
      mode: mined.upscale ? 't2i' : mined.mode,
      profileId: nathan.id,
      prompt: mined.prompt || (mined.upscale ? '(recovered upscale)' : '(recovered — prompt not embedded)'),
      refinedPrompt: null,
      enhance: false,
      width: dims.w,
      height: dims.h,
      seed: mined.seed,
      steps: null, cfg: null, denoise: null,
      loras: mined.loras,
      regions: mined.regions,
      refImages: [],
      folder: null,
      createdAt: Math.round(e.st.mtimeMs),
      upscaled: null,
      videos: [],
      recovered: true,
    });
    imported++;
  }

  // Videos: standalone items, poster = nearest poster png (else nearest gen png)
  const posterPool = posters.length ? posters : genPngs;
  for (const e of vids) {
    const id = uid();
    const vbuf = fs.readFileSync(e.full);
    const vname = `${id}_${Math.round(e.st.mtimeMs)}.mp4`;
    await fsp.writeFile(path.join(VIDEOS, vname), vbuf);
    let posterFile = `${id}.png`;
    let pw = 1024; let ph = 1024;
    if (posterPool.length) {
      const nearest = posterPool.reduce((best, p) => (
        Math.abs(p.st.mtimeMs - e.st.mtimeMs) < Math.abs(best.st.mtimeMs - e.st.mtimeMs) ? p : best
      ), posterPool[0]);
      const pbuf = fs.readFileSync(nearest.full);
      const d = pngDims(pbuf);
      if (d) { pw = d.w; ph = d.h; }
      await fsp.writeFile(path.join(IMAGES, posterFile), pbuf);
    } else {
      posterFile = null;
    }
    db.items.push({
      id,
      file: posterFile,
      mode: 'video',
      profileId: nathan.id,
      prompt: '(recovered video)',
      refinedPrompt: null,
      enhance: false,
      width: pw, height: ph,
      seed: null, steps: null, cfg: null, denoise: null,
      loras: [], refImages: [],
      folder: null,
      createdAt: Math.round(e.st.mtimeMs),
      upscaled: null,
      videos: [{ id: uid(), file: vname, createdAt: Math.round(e.st.mtimeMs), info: {} }],
      recovered: true,
    });
    imported++;
  }

  db.items.sort((a, b) => b.createdAt - a.createdAt);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
  console.log(`imported ${imported} items (${withPrompt} with recovered prompts) under Nathan (${nathan.id})`);
})().catch((e) => { console.error('RECOVERY FAILED:', e); process.exit(1); });
