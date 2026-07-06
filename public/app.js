/* KreaStudio front-end — mobile-first, Modatory design language */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  view: 'create',            // create | edit | gallery
  enhance: true,
  aspect: '1:1',
  mp: 1,
  width: 1024,
  height: 1024,
  customDims: false,
  prompts: { create: '', edit: '', video: '' }, // per-tab prompt text
  loras: [],                 // {name, strength, on} - Create tab (Krea 2)
  videoLoras: [],            // {name, strength, on} - Video tab (LTX/Wan)
  editLoras: [],             // {name, strength, on} - Edit tab (Klein/Qwen)
  editEngine: 'klein4',
  refs: [null, null, null],  // {name(comfy), url(local preview)}
  vidRef: null,              // {name, url, w, h} - Video tab source image
  folders: [],
  items: [],
  privateUnlocked: false,
  activeFolder: 'all',
  mediaFilter: 'all',
  metaLoras: [],
  metaLorasInfo: {},
  showAllLoras: false,
  activeJobs: new Set(),
  upscaling: new Set(),      // item ids
  animating: new Set(),      // item ids
  animateTarget: null,
  currentItem: null,
  upscaleTarget: null,
  moveTarget: null,
  selectMode: false,
  selected: new Set(),
  connOk: false,
};

const ASPECTS = [
  { label: '1:1', ar: 1 },
  { label: '4:5', ar: 4 / 5 },
  { label: '3:4', ar: 3 / 4 },
  { label: '2:3', ar: 2 / 3 },
  { label: '9:16', ar: 9 / 16 },
  { label: '3:2', ar: 3 / 2 },
  { label: '4:3', ar: 4 / 3 },
  { label: '16:9', ar: 16 / 9 },
  { label: '21:9', ar: 21 / 9 },
];

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toastZone').appendChild(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3200);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} failed (${res.status})`);
  return data;
}

let actionMenuEl = null;
let actionMenuCleanup = null;
function closeActionMenu() {
  if (actionMenuCleanup) actionMenuCleanup();
  actionMenuCleanup = null;
  if (actionMenuEl) actionMenuEl.remove();
  actionMenuEl = null;
}

function openActionMenu(anchor, items) {
  closeActionMenu();
  const menu = document.createElement('div');
  menu.className = 'action-menu';
  for (const item of items.filter(Boolean)) {
    const b = document.createElement('button');
    b.className = 'action-menu-item' + (item.danger ? ' danger' : '');
    b.type = 'button';
    b.textContent = item.label;
    b.addEventListener('click', () => {
      closeActionMenu();
      item.action();
    });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, rect.left));
  const top = Math.max(8, rect.top - menuRect.height - 8);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  actionMenuEl = menu;
  const onDoc = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) closeActionMenu();
  };
  const onKey = (e) => { if (e.key === 'Escape') closeActionMenu(); };
  setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
  document.addEventListener('keydown', onKey);
  actionMenuCleanup = () => {
    document.removeEventListener('pointerdown', onDoc);
    document.removeEventListener('keydown', onKey);
  };
}

function round32(n) { return Math.max(64, Math.round(n / 32) * 32); }

function computeDims() {
  if (state.customDims) return;
  const a = ASPECTS.find((x) => x.label === state.aspect) || ASPECTS[0];
  const px = state.mp * 1e6;
  state.width = round32(Math.sqrt(px * a.ar));
  state.height = round32(Math.sqrt(px / a.ar));
}

function saveForm() {
  try {
    localStorage.setItem('ks-form', JSON.stringify({
      enhance: state.enhance, aspect: state.aspect, mp: state.mp,
      loras: state.loras, videoLoras: state.videoLoras, editLoras: state.editLoras, prompts: state.prompts,
      editEngine: state.editEngine,
      customDims: state.customDims, width: state.width, height: state.height,
    }));
  } catch { /* noop */ }
}
function loadForm() {
  try {
    const f = JSON.parse(localStorage.getItem('ks-form') || 'null');
    if (!f) return;
    state.enhance = f.enhance !== false;
    state.aspect = f.aspect || '1:1';
    state.mp = f.mp || 1;
    state.loras = Array.isArray(f.loras) ? f.loras : [];
    state.videoLoras = Array.isArray(f.videoLoras) ? f.videoLoras : [];
    state.editLoras = Array.isArray(f.editLoras) ? f.editLoras : [];
    state.editEngine = f.editEngine === 'qwen' ? 'qwen' : (f.editEngine === 'klein9' ? 'klein9' : 'klein4');
    if (f.prompts && typeof f.prompts === 'object') {
      state.prompts = Object.assign({ create: '', edit: '', video: '' }, f.prompts);
    } else if (f.prompt) {
      state.prompts.create = f.prompt; // legacy single-prompt storage
    }
    state.customDims = !!f.customDims;
    if (f.width) state.width = f.width;
    if (f.height) state.height = f.height;
    if (f.prompt) $('#prompt').value = f.prompt;
  } catch { /* noop */ }
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

const tabButtons = $$('#tabs .tab');
function setView(view) {
  const prev = state.view;
  if (Object.prototype.hasOwnProperty.call(state.prompts, prev)) {
    state.prompts[prev] = $('#prompt').value;
  }
  state.view = view;
  if (Object.prototype.hasOwnProperty.call(state.prompts, view)) {
    $('#prompt').value = state.prompts[view] || '';
    updatePromptClear();
  }
  tabButtons.forEach((b, i) => {
    const active = b.dataset.view === view;
    b.classList.toggle('active', active);
    if (active) $('#tabPill').style.transform = `translateX(${i * 100}%)`;
  });
  exitSelect();
  const isGallery = view === 'gallery';
  $('#view-create').classList.toggle('active', !isGallery);
  $('#view-gallery').classList.toggle('active', isGallery);
  $('#genDock').style.display = isGallery ? 'none' : '';
  $('#refPanel').hidden = view !== 'edit';
  updateVideoPanels();
  renderEnhance();
  $('#genLbl').textContent = genLabel();
  if (isGallery) refreshGallery();
}
tabButtons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

function genLabel() {
  if (state.activeJobs.size) {
    return `➕ Add to Queue · ${state.activeJobs.size} running`;
  }
  return state.view === 'edit' ? 'Generate Edit' : (state.view === 'video' ? 'Generate Video' : 'Generate');
}

function updateVideoPanels() {
  const isVideo = state.view === 'video';
  $('#vidAttachRow').hidden = !isVideo;
  $('#vidOptsPanel').hidden = !isVideo;
  $('#vidExtras').hidden = !isVideo || state.vidEngine === 'wan' || state.vidEngine === 'scail';
  $('#createPromptTools').hidden = state.view !== 'create';
  $('#denoiseField').hidden = true; // both edit engines run fixed 4-step pipelines
  $('#aspectRow').closest('.panel').hidden = (isVideo && !!state.vidRef) || state.view === 'edit';
  $('#seedInput').closest('.panel').hidden = isVideo;
  if (isVideo) { renderVidAttach(); renderVidDrive(); }
  renderLoras();
}

/* Generic upload picker: uploads to ComfyUI via the server, returns {name,url,w,h} */
function pickUpload(accept, cb) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      toast('Uploading…');
      const buf = await file.arrayBuffer();
      const res = await api('/api/upload', {
        method: 'POST',
        headers: { 'x-filename': encodeURIComponent(file.name || 'file.bin') },
        body: buf,
      });
      const url = URL.createObjectURL(file);
      let dims = { w: 0, h: 0 };
      if (accept.startsWith('image')) {
        dims = await new Promise((resolve) => {
          const im = new Image();
          im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = () => resolve({ w: 1024, h: 1024 });
          im.src = url;
        });
      }
      cb({ name: res.name, url, w: dims.w, h: dims.h, label: file.name });
    } catch (e) { toast(e.message, true); }
  });
  input.click();
}

/* End frame attachment with thumbnail preview (Video tab + Animate sheet) */
const endFrameRefresh = {};
function wireEndFrame(prefix, stateKey) {
  const chip = $('#' + prefix + 'EndChip');
  const thumb = $('#' + prefix + 'EndThumb');
  const img = $('#' + prefix + 'EndImg');
  const x = $('#' + prefix + 'EndX');
  const refresh = () => {
    const has = !!state[stateKey];
    chip.hidden = has;
    thumb.hidden = !has;
    if (has) img.src = state[stateKey].url;
    if (stateKey === 'vidEnd' && typeof updateSwapChip === 'function') updateSwapChip();
  };
  chip.addEventListener('click', () => {
    pickUpload('image/*', (f) => { state[stateKey] = f; refresh(); });
  });
  x.addEventListener('click', () => {
    state[stateKey] = null;
    refresh();
    toast('End frame removed');
  });
  endFrameRefresh[stateKey] = refresh;
}
wireEndFrame('vid', 'vidEnd');
wireEndFrame('anim', 'animEnd');

/* Swap first/last frame in the Video tab */
function updateSwapChip() {
  $('#vidSwap').hidden = !(state.vidRef && state.vidEnd);
}
$('#vidSwap').addEventListener('click', () => {
  const a = state.vidRef;
  state.vidRef = state.vidEnd;
  state.vidEnd = a;
  renderVidAttach();
  endFrameRefresh.vidEnd();
  updateVideoPanels();
  toast('Frames swapped — end is now the start');
});

/* ---- Audio attach with trimming ---- */
let audioCtx = null;
let previewSrc = null;
function stopPreview() {
  if (previewSrc) { try { previewSrc.stop(); } catch { /* noop */ } previewSrc = null; }
  $$('.trim-play').forEach((b) => { b.textContent = '▶'; });
  $$('.playhead').forEach((p) => { p.style.display = 'none'; });
}
function fmtT(s) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}
function encodeWavSlice(buffer, start, end) {
  const sr = buffer.sampleRate;
  const ch = Math.min(2, buffer.numberOfChannels);
  const s0 = Math.max(0, Math.floor(start * sr));
  const s1 = Math.min(buffer.length, Math.ceil(end * sr));
  const n = Math.max(1, s1 - s0);
  const bytes = 44 + n * ch * 2;
  const ab = new ArrayBuffer(bytes);
  const v = new DataView(ab);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); v.setUint32(4, bytes - 8, true); wstr(8, 'WAVE'); wstr(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  wstr(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      let x = chans[c][s0 + i] || 0;
      x = Math.max(-1, Math.min(1, x));
      v.setInt16(o, x * 32767, true);
      o += 2;
    }
  }
  return ab;
}
async function ensureAudioUploaded(a) {
  const key = `${a.trimStart.toFixed(2)}-${a.trimEnd.toFixed(2)}`;
  if (a.uploadedKey === key && a.uploadedName) return a.uploadedName;
  const full = a.trimStart <= 0.05 && a.trimEnd >= a.duration - 0.05;
  const body = full ? a.raw : encodeWavSlice(a.buffer, a.trimStart, a.trimEnd);
  const fname = full ? (a.label || 'audio.wav') : 'trimmed.wav';
  const res = await api('/api/upload', {
    method: 'POST',
    headers: { 'x-filename': encodeURIComponent(fname) },
    body,
  });
  a.uploadedName = res.name;
  a.uploadedKey = key;
  return a.uploadedName;
}
const waveRedraw = {};
function wireAudioChip(prefix, stateKey, durInputId, durValId) {
  const chip = $('#' + prefix + 'AudioChip');
  const box = $('#' + prefix + 'AudioTrim');
  const lbl = $('#' + prefix + 'TrimLabel');
  const play = $('#' + prefix + 'TrimPlay');
  const wrap = $('#' + prefix + 'Wave');
  const canvas = $('#' + prefix + 'WaveCanvas');
  const sel = $('#' + prefix + 'Sel');
  const shadeL = $('#' + prefix + 'ShadeL');
  const shadeR = $('#' + prefix + 'ShadeR');
  const playhead = $('#' + prefix + 'Playhead');

  const drawWave = () => {
    const a = state[stateKey];
    if (!a || box.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const data = a.buffer.getChannelData(0);
    const buckets = Math.max(60, Math.floor(w / 3));
    const step = Math.max(1, Math.floor(data.length / buckets));
    ctx.fillStyle = 'rgba(160, 140, 255, 0.85)';
    for (let i = 0; i < buckets; i++) {
      let peak = 0;
      const s0 = i * step;
      for (let j = s0; j < s0 + step; j += 32) {
        const v = Math.abs(data[j] || 0);
        if (v > peak) peak = v;
      }
      const bh = Math.max(2, peak * (h - 10));
      ctx.fillRect(i * (w / buckets) + 0.5, (h - bh) / 2, Math.max(1.5, w / buckets - 1.5), bh);
    }
  };
  const layout = () => {
    const a = state[stateKey];
    if (!a) return;
    const p0 = (a.trimStart / a.duration) * 100;
    const p1 = (a.trimEnd / a.duration) * 100;
    sel.style.left = p0 + '%';
    sel.style.width = (p1 - p0) + '%';
    shadeL.style.width = p0 + '%';
    shadeR.style.width = (100 - p1) + '%';
    const len = a.trimEnd - a.trimStart;
    lbl.textContent = `${a.label || 'audio'} · ${fmtT(a.trimStart)} – ${fmtT(a.trimEnd)} · ${len.toFixed(1)}s`;
    const durEl = $('#' + durInputId);
    durEl.value = Math.max(1, Math.min(15, Math.round(len)));
    $('#' + durValId).textContent = durEl.value;
  };
  waveRedraw[stateKey] = () => { drawWave(); layout(); };

  // Drag: edges resize, middle moves, tap outside jumps the nearest edge
  let mode = null;
  let grabOff = 0;
  const MIN_LEN = 0.3;
  const timeAt = (clientX) => {
    const r = wrap.getBoundingClientRect();
    const a = state[stateKey];
    return Math.max(0, Math.min(a.duration, ((clientX - r.left) / r.width) * a.duration));
  };
  const applyDrag = (t) => {
    const a = state[stateKey];
    if (!a) return;
    if (mode === 'start') a.trimStart = Math.max(0, Math.min(t, a.trimEnd - MIN_LEN));
    else if (mode === 'end') a.trimEnd = Math.min(a.duration, Math.max(t, a.trimStart + MIN_LEN));
    else if (mode === 'move') {
      const len = a.trimEnd - a.trimStart;
      const s = Math.max(0, Math.min(a.duration - len, t - grabOff));
      a.trimStart = s;
      a.trimEnd = s + len;
    }
    layout();
  };
  wrap.addEventListener('pointerdown', (e) => {
    const a = state[stateKey];
    if (!a) return;
    stopPreview();
    const t = timeAt(e.clientX);
    const r = wrap.getBoundingClientRect();
    const pxPerSec = r.width / a.duration;
    const dStart = Math.abs(t - a.trimStart) * pxPerSec;
    const dEnd = Math.abs(t - a.trimEnd) * pxPerSec;
    if (dStart < 28 && dStart <= dEnd) mode = 'start';
    else if (dEnd < 28) mode = 'end';
    else if (t > a.trimStart && t < a.trimEnd) { mode = 'move'; grabOff = t - a.trimStart; }
    else { mode = t < a.trimStart ? 'start' : 'end'; applyDrag(t); }
    try { wrap.setPointerCapture(e.pointerId); } catch { /* noop */ }
  });
  wrap.addEventListener('pointermove', (e) => { if (mode) applyDrag(timeAt(e.clientX)); });
  wrap.addEventListener('pointerup', () => { mode = null; });
  wrap.addEventListener('pointercancel', () => { mode = null; });

  play.addEventListener('click', () => {
    const a = state[stateKey];
    if (!a) return;
    if (previewSrc) { stopPreview(); return; }
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = a.buffer;
    src.connect(audioCtx.destination);
    const startAt = audioCtx.currentTime;
    src.onended = stopPreview;
    src.start(0, a.trimStart, Math.max(0.1, a.trimEnd - a.trimStart));
    previewSrc = src;
    play.textContent = '⏹';
    playhead.style.display = 'block';
    const tick = () => {
      if (!previewSrc) return;
      const t = a.trimStart + (audioCtx.currentTime - startAt);
      playhead.style.left = Math.min(100, (t / a.duration) * 100) + '%';
      requestAnimationFrame(tick);
    };
    tick();
  });

  chip.addEventListener('click', () => {
    if (state[stateKey]) {
      stopPreview();
      state[stateKey] = null;
      chip.classList.remove('active');
      chip.textContent = '🎵 Audio';
      box.hidden = true;
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const raw = await file.arrayBuffer();
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const buffer = await audioCtx.decodeAudioData(raw.slice(0));
        state[stateKey] = {
          raw, buffer,
          duration: buffer.duration,
          trimStart: 0,
          trimEnd: buffer.duration,
          uploadedName: null,
          uploadedKey: null,
          label: file.name,
        };
        chip.classList.add('active');
        chip.textContent = '🎵 Audio ✓';
        box.hidden = false;
        requestAnimationFrame(() => { drawWave(); layout(); });
      } catch (e) { toast('Could not read audio: ' + e.message, true); }
    });
    input.click();
  });
}
window.addEventListener('resize', () => {
  Object.values(waveRedraw).forEach((fn) => fn());
});
wireAudioChip('vid', 'vidAudio', 'vidDur', 'vidDurVal');
wireAudioChip('anim', 'animAudio', 'animDur', 'animDurVal');

state.vidSigma = 'dmd';
state.animSigma = 'dmd';
state.vidSmooth = 1;
state.vidScailMode = 'chunked';
$$('#vidFpsRow .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#vidFpsRow .chip').forEach((x) => x.classList.toggle('active', x === c));
  state.vidSmooth = Number(c.dataset.smooth) || 1;
}));
$$('#vidScailModeRow .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#vidScailModeRow .chip').forEach((x) => x.classList.toggle('active', x === c));
  state.vidScailMode = c.dataset.scailMode === 'direct' ? 'direct' : 'chunked';
}));
function wireSigmaRow(rowId, key) {
  $$(`#${rowId} .chip`).forEach((c) => c.addEventListener('click', () => {
    $$(`#${rowId} .chip`).forEach((x) => x.classList.toggle('active', x === c));
    state[key] = c.dataset.sig;
  }));
}
wireSigmaRow('vidSigmaRow', 'vidSigma');
wireSigmaRow('animSigmaRow', 'animSigma');
$('#engineInfoBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#engineInfoSheet').classList.add('show');
});

/* ------------------------------------------------------------------ */
/* Prompt + enhance                                                    */
/* ------------------------------------------------------------------ */

function renderEnhance() {
  $('#enhanceBtn').classList.toggle('on', state.enhance);
  const isVideo = state.view === 'video';
  $('#enhanceHint').innerHTML = state.enhance
    ? (isVideo
      ? '<b>✨ Enhance on</b> — Gemma expands your motion prompt (and sees the image, if provided)'
      : '<b>✨ Enhance on</b> — Qwen3-VL rewrites your prompt before generating')
    : 'Enhance off — your prompt is used exactly as written';
}
$('#enhanceBtn').addEventListener('click', () => {
  state.enhance = !state.enhance;
  renderEnhance();
  saveForm();
});
function updatePromptClear() {
  $('#promptClear').hidden = !$('#prompt').value.trim();
}
$('#prompt').addEventListener('input', () => {
  if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) {
    state.prompts[state.view] = $('#prompt').value;
  }
  updatePromptClear();
  saveForm();
});
$('#promptClear').addEventListener('click', () => {
  $('#prompt').value = '';
  updatePromptClear();
  $('#prompt').focus();
  saveForm();
});

$('#imagePromptBtn').addEventListener('click', () => {
  const btn = $('#imagePromptBtn');
  pickUpload('image/*', async (file) => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Reading image...';
    try {
      const res = await api('/api/imageprompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageName: file.name }),
      });
      state.prompts.create = res.prompt || '';
      if (state.view !== 'create') setView('create');
      $('#prompt').value = state.prompts.create;
      updatePromptClear();
      saveForm();
      toast('Prompt created from image');
    } catch (e) {
      toast(e.message, true);
    }
    btn.disabled = false;
    btn.textContent = 'Image to Prompt';
  });
});

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

function renderAspects() {
  const row = $('#aspectRow');
  row.innerHTML = '';
  for (const a of ASPECTS) {
    const btn = document.createElement('button');
    btn.className = 'aspect-chip' + (a.label === state.aspect && !state.customDims ? ' active' : '');
    const maxSide = 22;
    const w = a.ar >= 1 ? maxSide : Math.round(maxSide * a.ar);
    const h = a.ar >= 1 ? Math.round(maxSide / a.ar) : maxSide;
    btn.innerHTML = `<span class="ar-box" style="width:${w}px;height:${h}px"></span>${a.label}`;
    btn.addEventListener('click', () => {
      state.aspect = a.label;
      state.customDims = false;
      computeDims();
      renderAspects();
      renderDims();
      saveForm();
    });
    row.appendChild(btn);
  }
}
function renderDims() {
  $('#wInput').value = state.width;
  $('#hInput').value = state.height;
  $('#resReadout').textContent = `${state.width} × ${state.height}`;
  $$('#sizeSeg button').forEach((b) => b.classList.toggle('active', Number(b.dataset.mp) === state.mp && !state.customDims));
}
$$('#sizeSeg button').forEach((b) => b.addEventListener('click', () => {
  state.mp = Number(b.dataset.mp);
  state.customDims = false;
  computeDims();
  renderAspects();
  renderDims();
  saveForm();
}));
for (const id of ['#wInput', '#hInput']) {
  $(id).addEventListener('change', () => {
    state.customDims = true;
    state.width = round32(Number($('#wInput').value) || 1024);
    state.height = round32(Number($('#hInput').value) || 1024);
    renderAspects();
    renderDims();
    saveForm();
  });
}

/* ------------------------------------------------------------------ */
/* LoRAs                                                               */
/* ------------------------------------------------------------------ */

function curLoras() {
  if (state.view === 'video') return state.videoLoras;
  if (state.view === 'edit') return state.editLoras;
  return state.loras;
}

function loraCategory(name) {
  return (state.metaLorasInfo[name] && state.metaLorasInfo[name].category) || 'unknown';
}

function compatibleLoraCategories() {
  if (state.view === 'video') return ['video', 'unknown'];
  if (state.view === 'edit') {
    if (state.editEngine === 'qwen') return ['qwen-edit', 'unknown'];
    if (state.editEngine === 'klein9') return ['klein9', 'unknown'];
    return ['klein4', 'unknown'];
  }
  return ['krea2', 'unknown'];
}

function loraOptionsFor(selected) {
  if (state.showAllLoras) return state.metaLoras;
  const allowed = new Set(compatibleLoraCategories());
  return state.metaLoras.filter((name) => name === selected || allowed.has(loraCategory(name)));
}

function incompatibleSelectedLoras() {
  const allowed = new Set(compatibleLoraCategories());
  return curLoras().filter((l) => l && l.on && l.name && !allowed.has(loraCategory(l.name)));
}

function renderLoraCompatibility() {
  const warn = $('#loraCompatWarn');
  if (!warn) return;
  const bad = incompatibleSelectedLoras();
  warn.classList.toggle('hidden', bad.length === 0);
  warn.textContent = bad.length ? `May not work here: ${bad.map((l) => prettyLora(l.name)).join(', ')}` : '';
  const allBtn = $('#loraAllBtn');
  if (allBtn) {
    allBtn.classList.toggle('active', state.showAllLoras);
    allBtn.textContent = state.showAllLoras ? 'Filter' : 'Show all';
  }
}

function renderLoras() {
  const arr = curLoras();
  const list = $('#loraList');
  list.innerHTML = '';
  $('#loraEmpty').classList.toggle('hidden', arr.length > 0);
  arr.forEach((l, idx) => {
    const row = document.createElement('div');
    row.className = 'lora-row';

    const tog = document.createElement('button');
    tog.className = 'toggle' + (l.on ? ' on' : '');
    tog.setAttribute('aria-label', 'Enable LoRA');
    tog.addEventListener('click', () => { l.on = !l.on; renderLoras(); saveForm(); });

    const sel = document.createElement('select');
    sel.className = 'lora-name';
    const opts = [...new Set([l.name, ...loraOptionsFor(l.name)].filter(Boolean))];
    if (!l.name) sel.appendChild(new Option('-- pick a LoRA --', ''));
    for (const name of opts) sel.appendChild(new Option(prettyLora(name), name, false, name === l.name));
    sel.addEventListener('change', () => { l.name = sel.value; renderLoras(); saveForm(); });

    const x = document.createElement('button');
    x.className = 'lora-x';
    x.textContent = '✕';
    x.addEventListener('click', () => { arr.splice(idx, 1); renderLoras(); saveForm(); });

    const sub = document.createElement('div');
    sub.className = 'lora-sub';
    const range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '2'; range.step = '0.05';
    range.value = String(l.strength);
    const val = document.createElement('span');
    val.className = 'lora-strength';
    val.textContent = Number(l.strength).toFixed(2);
    range.addEventListener('input', () => { l.strength = Number(range.value); val.textContent = l.strength.toFixed(2); });
    range.addEventListener('change', saveForm);
    sub.append(range, val);

    row.append(tog, sel, x, sub);
    list.appendChild(row);
  });
  renderLoraCompatibility();
}
function prettyLora(name) { return name.replace(/\.safetensors$/i, '').split(/[\\/]/).pop(); }
function editEngineLabel(engine) {
  if (engine === 'qwen') return 'Qwen Edit';
  if (engine === 'klein9') return 'Flux Klein 9B';
  return 'Flux Klein 4B';
}
$('#addLora').addEventListener('click', () => {
  curLoras().push({ name: '', strength: 1, on: true });
  renderLoras();
});
$('#loraAllBtn').addEventListener('click', () => {
  state.showAllLoras = !state.showAllLoras;
  renderLoras();
});

/* ---- LoRA presets (stored server-side, shared across devices) ---- */
$('#loraSaveBtn').addEventListener('click', async () => {
  const loras = curLoras().filter((l) => l.name);
  if (!loras.length) return toast('Add at least one LoRA first', true);
  const name = window.prompt('Preset name');
  if (!name) return;
  try {
    await api('/api/lorapresets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, loras: loras.map((l) => ({ name: l.name, strength: l.strength })) }),
    });
    toast(`Preset “${name.trim()}” saved`);
  } catch (e) { toast(e.message, true); }
});
async function renderLoraPresets() {
  const list = $('#loraPresetList');
  list.innerHTML = '';
  let presets = [];
  try { presets = (await api('/api/lorapresets')).presets; } catch (e) { toast(e.message, true); }
  if (!presets.length) {
    list.innerHTML = '<div class="queue-empty">No presets yet — build a LoRA stack and tap 💾 Save preset.</div>';
    return;
  }
  for (const pr of presets) {
    const row = document.createElement('div');
    row.className = 'queue-row q-click';
    const lb = document.createElement('span');
    lb.className = 'q-label';
    lb.textContent = `${pr.name} — ${pr.loras.map((l) => prettyLora(l.name)).join(', ')}`;
    lb.addEventListener('click', () => {
      const arr = curLoras();
      arr.splice(0, arr.length, ...pr.loras.map((l) => ({ name: l.name, strength: l.strength, on: true })));
      renderLoras();
      saveForm();
      $('#loraPresetSheet').classList.remove('show');
      toast(`Applied “${pr.name}”`);
    });
    const x = document.createElement('button');
    x.className = 'q-cancel';
    x.textContent = '✕';
    x.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!window.confirm(`Delete preset “${pr.name}”?`)) return;
      try {
        await api('/api/lorapresets/' + pr.id, { method: 'DELETE' });
        renderLoraPresets();
      } catch (e2) { toast(e2.message, true); }
    });
    row.append(lb, x);
    list.appendChild(row);
  }
}
$('#loraPresetsBtn').addEventListener('click', () => {
  $('#loraPresetSheet').classList.add('show');
  renderLoraPresets();
});

/* ------------------------------------------------------------------ */
/* Reference images (edit mode)                                        */
/* ------------------------------------------------------------------ */

function renderRefs() {
  const row = $('#refRow');
  row.innerHTML = '';
  state.refs.forEach((ref, idx) => {
    const slot = document.createElement('div');
    slot.className = 'ref-slot' + (ref ? ' filled' : '');
    const num = document.createElement('span');
    num.className = 'ref-num';
    num.textContent = String(idx + 1);
    slot.appendChild(num);
    if (ref) {
      const img = document.createElement('img');
      img.src = ref.url;
      const x = document.createElement('button');
      x.className = 'ref-x';
      x.textContent = '✕';
      x.addEventListener('click', (e) => { e.stopPropagation(); state.refs[idx] = null; renderRefs(); });
      slot.append(img, x);
    } else {
      slot.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2v-6Z"/></svg>');
      slot.addEventListener('click', () => pickRef(idx));
    }
    row.appendChild(slot);
  });
  const n = state.refs.filter(Boolean).length;
  $('#refCount').textContent = n ? `${n}/3` : 'optional · up to 3';
}

function pickRef(idx) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      toast('Uploading image…');
      const buf = await file.arrayBuffer();
      const res = await api('/api/upload', {
        method: 'POST',
        headers: { 'x-filename': encodeURIComponent(file.name || 'ref.png') },
        body: buf,
      });
      state.refs[idx] = { name: res.name, url: URL.createObjectURL(file) };
      renderRefs();
    } catch (e) { toast(e.message, true); }
  });
  input.click();
}

async function sendToVideoTab(item) {
  try {
    const blob = await (await fetch('/images/' + item.file)).blob();
    const buf = await blob.arrayBuffer();
    const res = await api('/api/upload', {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent(item.file) },
      body: buf,
    });
    state.vidRef = { name: res.name, url: '/images/' + item.file, w: item.width || 1024, h: item.height || 1024, srcItemId: item.id };
    closeLightbox();
    setView('video');
    renderVidAttach();
    updateVideoPanels();
    toast('Image loaded in the Video tab — pick engine, LoRAs & settings');
  } catch (e) { toast(e.message, true); }
}

/* Send a generated video to the Video tab as the SCAIL 2 motion input */
async function sendVideoAsDrive(it, v) {
  try {
    toast('Loading video…');
    const blob = await (await fetch('/videos/' + v.file)).blob();
    const buf = await blob.arrayBuffer();
    const res = await api('/api/upload', {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent(v.file) },
      body: buf,
    });
    const url = URL.createObjectURL(blob);
    const d = { name: res.name, url, label: 'from gallery' };
    state.vidDrive = d;
    $('#vidDriveTrimChip').classList.remove('active');
    $('#vidDriveLabel').textContent = d.label;
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = url;
    probe.onloadedmetadata = () => {
      d.dur = probe.duration || 0;
      d.trimStart = 0;
      d.trimEnd = d.dur;
      renderVidDrive();
    };
    closeLightbox();
    setView('video');
    const chip = $('#vidEngineRow .chip[data-engine="scail"]');
    if (chip) chip.click();
    renderVidDrive();
    updateVideoPanels();
    toast('Motion video loaded — add a source image and generate with SCAIL 2');
  } catch (e) { toast(e.message, true); }
}

async function useAsRef(item) {
  try {
    const blob = await (await fetch('/images/' + item.file)).blob();
    const buf = await blob.arrayBuffer();
    const res = await api('/api/upload', {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent(item.file) },
      body: buf,
    });
    const slot = state.refs.findIndex((r) => !r);
    state.refs[slot === -1 ? 0 : slot] = { name: res.name, url: '/images/' + item.file, srcItemId: item.id };
    renderRefs();
    closeLightbox();
    setView('edit');
    toast('Added as reference image');
  } catch (e) { toast(e.message, true); }
}

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

$('#seedDice').addEventListener('click', () => { $('#seedInput').value = ''; toast('Seed: random'); });
$('#liveDismiss').addEventListener('click', () => $('#livePreview').classList.remove('show'));
$('#denoiseInput').addEventListener('input', () => { $('#denoiseVal').textContent = Number($('#denoiseInput').value).toFixed(2); });

/* Video tab: inline source-image attachment */
function renderVidAttach() {
  const has = !!state.vidRef;
  $('#vidAttachBtn').hidden = has;
  $('#vidAttachThumb').hidden = !has;
  if (has) {
    $('#vidAttachImg').src = state.vidRef.url;
    $('#vidAttachDims').textContent = `${state.vidRef.w} × ${state.vidRef.h} — aspect follows the image`;
  }
  if (typeof updateSwapChip === 'function') updateSwapChip();
}
$('#vidAttachBtn').addEventListener('click', () => pickVidRef());
$('#vidAttachX').addEventListener('click', () => {
  state.vidRef = null;
  renderVidAttach();
  updateVideoPanels();
});
function pickVidRef() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      toast('Uploading image…');
      const buf = await file.arrayBuffer();
      const res = await api('/api/upload', {
        method: 'POST',
        headers: { 'x-filename': encodeURIComponent(file.name || 'src.png') },
        body: buf,
      });
      const url = URL.createObjectURL(file);
      const dims = await new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => resolve({ w: 1024, h: 1024 });
        im.src = url;
      });
      state.vidRef = { name: res.name, url, w: dims.w, h: dims.h };
      renderVidAttach();
      updateVideoPanels();
    } catch (e) { toast(e.message, true); }
  });
  input.click();
}
$('#vidDur').addEventListener('input', () => { $('#vidDurVal').textContent = $('#vidDur').value; });
$('#vid4k').addEventListener('click', () => $('#vid4k').classList.toggle('active'));

/* SCAIL 2 driving-video attachment (+ trim + first-frame extract) */
state.vidDrive = null;
function renderVidDrive() {
  const scail = state.vidEngine === 'scail';
  const has = !!state.vidDrive;
  $('#vidDriveBtn').hidden = !scail || has;
  $('#vidDriveThumb').hidden = !scail || !has;
  $('#vidDriveTools').hidden = !scail || !has;
  $('#vidDriveTrim').hidden = !scail || !has || !$('#vidDriveTrimChip').classList.contains('active');
  $('#vidAttachSub').textContent = scail
    ? 'required · the person to re-animate'
    : 'optional · image → video';
  if (scail && has) {
    const v = $('#vidDriveVideo');
    if (v.src !== state.vidDrive.url) v.src = state.vidDrive.url;
    driveLayout();
  }
}
$('#vidDriveBtn').addEventListener('click', () => {
  pickUpload('video/*', (f) => {
    state.vidDrive = f;
    $('#vidDriveTrimChip').classList.remove('active');
    $('#vidDriveLabel').textContent = f.label || 'drives the movement';
    // probe duration for the trimmer
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = f.url;
    probe.onloadedmetadata = () => {
      f.dur = probe.duration || 0;
      f.trimStart = 0;
      f.trimEnd = f.dur;
      driveLayout();
    };
    renderVidDrive();
  });
});
$('#vidDriveX').addEventListener('click', () => {
  state.vidDrive = null;
  $('#vidDriveVideo').removeAttribute('src');
  $('#vidDriveTrimChip').classList.remove('active');
  renderVidDrive();
});

/* Trim: filmstrip + draggable selection; applied losslessly on the server
   via VHS_LoadVideo skip_first_frames / frame_load_cap (no re-encode). */
function driveLayout() {
  const d = state.vidDrive;
  if (!d || !d.dur) { $('#driveTrimLabel').textContent = ''; return; }
  const p0 = (d.trimStart / d.dur) * 100;
  const p1 = (d.trimEnd / d.dur) * 100;
  $('#driveSel').style.left = p0 + '%';
  $('#driveSel').style.width = (p1 - p0) + '%';
  $('#driveShadeL').style.width = p0 + '%';
  $('#driveShadeR').style.width = (100 - p1) + '%';
  const len = d.trimEnd - d.trimStart;
  $('#driveTrimLabel').textContent = `${fmtT(d.trimStart)} – ${fmtT(d.trimEnd)} · ${len.toFixed(1)}s of ${d.dur.toFixed(1)}s`;
  if (state.vidEngine === 'scail') {
    const durEl = $('#vidDur');
    durEl.value = Math.max(1, Math.min(Number(durEl.max) || 10, Math.round(len)));
    $('#vidDurVal').textContent = durEl.value;
  }
}
let filmstripToken = 0;
async function drawFilmstrip() {
  const d = state.vidDrive;
  if (!d || !d.dur || $('#vidDriveTrim').hidden) return;
  const token = ++filmstripToken;
  const wrap = $('#driveWave');
  const canvas = $('#driveWaveCanvas');
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (!w) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, w, h);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = d.url;
    await new Promise((ok, bad) => { v.onloadedmetadata = ok; v.onerror = () => bad(new Error('read failed')); });
    const n = Math.max(6, Math.floor(w / 54));
    const tileW = w / n;
    const seekTo = (t) => new Promise((ok) => { v.onseeked = ok; v.currentTime = t; });
    for (let i = 0; i < n; i++) {
      if (token !== filmstripToken || state.vidDrive !== d) return;
      await seekTo(Math.max(0, Math.min(d.dur - 0.05, ((i + 0.5) / n) * d.dur)));
      const scale = Math.max(tileW / (v.videoWidth || 1), h / (v.videoHeight || 1));
      const dw = (v.videoWidth || 1) * scale;
      const dh = (v.videoHeight || 1) * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(i * tileW, 0, tileW, h);
      ctx.clip();
      ctx.drawImage(v, i * tileW + (tileW - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.restore();
    }
  } catch { /* filmstrip is decorative — selection still works */ }
}
waveRedraw.vidDrive = () => { drawFilmstrip(); driveLayout(); };
$('#vidDriveTrimChip').addEventListener('click', () => {
  $('#vidDriveTrimChip').classList.toggle('active');
  renderVidDrive();
  requestAnimationFrame(() => { drawFilmstrip(); driveLayout(); });
});
{
  const wrap = $('#driveWave');
  let mode = null;
  let grabOff = 0;
  const MIN_LEN = 0.5;
  const timeAt = (clientX) => {
    const r = wrap.getBoundingClientRect();
    const d = state.vidDrive;
    return Math.max(0, Math.min(d.dur, ((clientX - r.left) / r.width) * d.dur));
  };
  const applyDrag = (t) => {
    const d = state.vidDrive;
    if (!d || !d.dur) return;
    if (mode === 'start') d.trimStart = Math.max(0, Math.min(t, d.trimEnd - MIN_LEN));
    else if (mode === 'end') d.trimEnd = Math.min(d.dur, Math.max(t, d.trimStart + MIN_LEN));
    else if (mode === 'move') {
      const len = d.trimEnd - d.trimStart;
      const s = Math.max(0, Math.min(d.dur - len, t - grabOff));
      d.trimStart = s;
      d.trimEnd = s + len;
    }
    driveLayout();
  };
  wrap.addEventListener('pointerdown', (e) => {
    const d = state.vidDrive;
    if (!d || !d.dur) return;
    const t = timeAt(e.clientX);
    const r = wrap.getBoundingClientRect();
    const pxPerSec = r.width / d.dur;
    const dStart = Math.abs(t - d.trimStart) * pxPerSec;
    const dEnd = Math.abs(t - d.trimEnd) * pxPerSec;
    if (dStart < 28 && dStart <= dEnd) mode = 'start';
    else if (dEnd < 28) mode = 'end';
    else if (t > d.trimStart && t < d.trimEnd) { mode = 'move'; grabOff = t - d.trimStart; }
    else { mode = t < d.trimStart ? 'start' : 'end'; applyDrag(t); }
    try { wrap.setPointerCapture(e.pointerId); } catch { /* noop */ }
  });
  wrap.addEventListener('pointermove', (e) => { if (mode) applyDrag(timeAt(e.clientX)); });
  wrap.addEventListener('pointerup', () => {
    if (mode) {
      mode = null;
      const d = state.vidDrive;
      const dv = $('#vidDriveVideo');
      if (d && d.dur) try { dv.currentTime = d.trimStart; } catch { /* noop */ }
    }
  });
  wrap.addEventListener('pointercancel', () => { mode = null; });
}
/* Thumb video previews the trimmed section: loop within the selection
   (unless expanded with controls — then the user scrubs freely) */
$('#vidDriveVideo').addEventListener('timeupdate', () => {
  const d = state.vidDrive;
  const dv = $('#vidDriveVideo');
  if (!d || !d.dur) return;
  const freeScrub = $('#vidDriveThumb').classList.contains('expanded');
  if (!freeScrub && (dv.currentTime > d.trimEnd + 0.05 || dv.currentTime < d.trimStart - 0.3)) {
    try { dv.currentTime = d.trimStart; } catch { /* noop */ }
  }
  if (!$('#vidDriveTrim').hidden) {
    const ph = $('#drivePlayhead');
    ph.style.display = 'block';
    ph.style.left = Math.min(100, (dv.currentTime / d.dur) * 100) + '%';
  }
});
/* Expand the motion-video thumb into a full-width inline preview */
$('#vidDriveExpand').addEventListener('click', () => {
  const th = $('#vidDriveThumb');
  const v = $('#vidDriveVideo');
  const on = th.classList.toggle('expanded');
  v.controls = on;
  $('#vidDriveExpand').textContent = on ? '⤡' : '⤢';
});
$('#driveTrimPlay').addEventListener('click', () => {
  const dv = $('#vidDriveVideo');
  const d = state.vidDrive;
  if (!d) return;
  if (dv.paused) {
    if (d.dur) try { dv.currentTime = d.trimStart; } catch { /* noop */ }
    dv.play();
    $('#driveTrimPlay').textContent = '⏹';
  } else {
    dv.pause();
    $('#driveTrimPlay').textContent = '▶';
  }
});

/* Extract the first frame of the (trimmed) motion video -> Edit tab ref */
$('#vidDriveFrameChip').addEventListener('click', async () => {
  const d = state.vidDrive;
  if (!d) return;
  try {
    toast('Extracting frame…');
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = d.url;
    await new Promise((ok, bad) => { v.onloadedmetadata = ok; v.onerror = () => bad(new Error('Could not read the video')); });
    const t = Math.max(0, Math.min((d.trimStart || 0) + 0.001, (v.duration || 1) - 0.05));
    await new Promise((ok) => { v.onseeked = ok; v.currentTime = t; });
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 1;
    c.height = v.videoHeight || 1;
    c.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Frame capture failed'))), 'image/png'));
    const buf = await blob.arrayBuffer();
    const res = await api('/api/upload', {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent('drive_frame.png') },
      body: buf,
    });
    const slot = state.refs.findIndex((r) => !r);
    state.refs[slot === -1 ? 0 : slot] = { name: res.name, url: URL.createObjectURL(blob) };
    renderRefs();
    setView('edit');
    toast('First frame added to the Edit tab as a reference');
  } catch (e) { toast(e.message, true); }
});
$('#vidQuality').addEventListener('click', () => $('#vidQuality').classList.toggle('active'));
$('#animQuality').addEventListener('click', () => $('#animQuality').classList.toggle('active'));

state.vidEngine = 'ltx';
state.animEngine = 'ltx';
function markEngineRow(rowId, engine) {
  $$(`#${rowId} .chip[data-engine]`).forEach((x) => x.classList.toggle('active', x.dataset.engine === engine));
}
function wireEngineRow(rowId, noteWork) {
  $$(`#${rowId} .chip[data-engine]`).forEach((c) => c.addEventListener('click', () => {
    $$(`#${rowId} .chip[data-engine]`).forEach((x) => x.classList.toggle('active', x === c));
    noteWork(c.dataset.engine);
  }));
}
wireEngineRow('vidEngineRow', (engine) => {
  state.vidEngine = engine;
  const wan = engine === 'wan';
  const scail = engine === 'scail';
  $('#vidFreeField').hidden = wan || scail;
  $('#vidQuality').hidden = !wan;
  $('#vidSigmaRow').hidden = engine !== 'eros';
  $('#vidFpsRow').hidden = !(wan || scail);
  $('#vidScailModeRow').hidden = !scail;
  $('#vidExtras').hidden = wan || scail;
  const dur = $('#vidDur');
  dur.max = scail ? 60 : 15;
  if (Number(dur.value) > Number(dur.max)) { dur.value = dur.max; $('#vidDurVal').textContent = dur.value; }
  renderVidDrive();
  $('#vidEngineNote').textContent = wan ? 'Wan 2.2 · 16 fps · needs image'
    : scail ? 'SCAIL 2 · 16 fps · motion audio'
      : (engine === 'eros' ? '10Eros DMD · 24 fps · audio · needs image' : 'LTX 2.3 · 25 fps · audio');
});
wireEngineRow('animEngineRow', (engine) => {
  state.animEngine = engine;
  const wan = engine === 'wan';
  $('#animFreeField').hidden = wan;
  $('#animQuality').hidden = !wan;
  $('#animSigmaRow').hidden = engine !== 'eros';
  $('#animExtras').hidden = wan;
});
wireEngineRow('editEngineRow', (engine) => {
  state.editEngine = engine;
  updateVideoPanels();
  renderLoras();
  saveForm();
});
$('#editComposite').addEventListener('click', () => $('#editComposite').classList.toggle('active'));

$('#generateBtn').addEventListener('click', async () => {
  const prompt = $('#prompt').value.trim();
  if (!prompt) return toast('Type a prompt first', true);

  if (state.view === 'video') {
    if (state.vidEngine !== 'ltx' && !state.vidRef) {
      const lbl = { wan: 'Wan 2.2', eros: '10Eros DMD', scail: 'SCAIL 2' }[state.vidEngine];
      return toast(`${lbl} needs a source image — add one, or switch to LTX 2.3 for text-to-video`, true);
    }
    if (state.vidEngine === 'scail' && !state.vidDrive) {
      return toast('SCAIL 2 needs a motion video — attach the clip whose movement you want to copy', true);
    }
    let vidAudioName;
    if (state.vidAudio && (state.vidEngine === 'ltx' || state.vidEngine === 'eros')) {
      try { vidAudioName = await ensureAudioUploaded(state.vidAudio); }
      catch (e) { return toast('Audio upload failed: ' + e.message, true); }
    }
    const body = {
      prompt,
      engine: state.vidEngine,
      seconds: Number($('#vidDur').value) || 5,
      enhance: state.enhance,
      fourK: $('#vid4k').classList.contains('active'),
      fast: !$('#vidQuality').classList.contains('active'),
      motionFreedom: Number($('#vidFree').value),
      sigmaPreset: state.vidSigma,
      smooth: state.vidSmooth,
      scailMode: state.vidEngine === 'scail' ? state.vidScailMode : undefined,
      sourceItemId: state.vidRef ? state.vidRef.srcItemId : undefined,
      loras: state.videoLoras,
      audioName: vidAudioName,
      driveVideoName: state.vidEngine === 'scail' && state.vidDrive ? state.vidDrive.name : undefined,
      driveStartSeconds: state.vidEngine === 'scail' && state.vidDrive ? state.vidDrive.trimStart || 0 : undefined,
      driveDurSeconds: state.vidEngine === 'scail' && state.vidDrive && state.vidDrive.dur
        ? Math.max(0.5, (state.vidDrive.trimEnd || state.vidDrive.dur) - (state.vidDrive.trimStart || 0)) : undefined,
      endImageName: state.vidEnd ? state.vidEnd.name : undefined,
      imageName: state.vidRef ? state.vidRef.name : undefined,
      width: state.vidRef ? state.vidRef.w : state.width,
      height: state.vidRef ? state.vidRef.h : state.height,
    };
    try {
      setGenerating(true, 'Queued…');
      const res = await api('/api/animate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      state.activeJobs.add(res.jobId);
      $('#genLbl').textContent = genLabel();
      queueRefreshSoon();
    } catch (e) {
      setGenerating(false);
      toast(e.message, true);
    }
    return;
  }

  const mode = state.view === 'edit' ? 'edit' : 't2i';
  const seedRaw = $('#seedInput').value.trim();
  const body = {
    mode,
    editEngine: mode === 'edit' ? state.editEngine : undefined,
    composite: mode === 'edit' ? $('#editComposite').classList.contains('active') : undefined,
    prompt,
    enhance: state.enhance && mode === 't2i',
    width: state.width,
    height: state.height,
    steps: Number($('#stepsInput').value) || 12,
    cfg: Number($('#cfgInput').value) || 1,
    batch: Number($('#batchInput').value) || 1,
    denoise: mode === 'edit' ? Number($('#denoiseInput').value) : 1,
    seed: seedRaw === '' ? undefined : Number(seedRaw),
    loras: mode === 'edit' ? state.editLoras : state.loras,
    refImages: mode === 'edit' ? state.refs.filter(Boolean).map((r) => r.name) : [],
    sourceItemId: mode === 'edit' && state.refs[0] ? state.refs[0].srcItemId : undefined,
    folder: state.activeFolder !== 'all' ? state.activeFolder : null,
  };
  try {
    setGenerating(true, 'Queued…');
    const res = await api('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    state.activeJobs.add(res.jobId);
    $('#genLbl').textContent = genLabel();
  } catch (e) {
    setGenerating(false);
    toast(e.message, true);
  }
});

function setGenerating(on, statusText) {
  if (on) {
    $('#livePreview').classList.add('show');
    $('#livePreviewImg').removeAttribute('src');
    $('#liveStatusText').innerHTML = `<span class="spin"></span> ${statusText || 'Working…'}`;
    $('#livePct').textContent = '';
    $('#genFill').style.width = '0%';
  } else {
    if (!state.activeJobs.size) {
      $('#genFill').style.width = '0%';
      $('#liveStatusText').textContent = 'Done';
    }
    $('#genLbl').textContent = genLabel();
  }
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

state.queueProgress = {};
let queueRefreshAt = 0;

async function refreshQueue() {
  const q = await api('/api/queue');
  const total = (q.running || []).length + (q.pending || []).length;
  $('#queueCount').hidden = total === 0;
  $('#queueCount').textContent = String(total);
  if ($('#queueSheet').classList.contains('show')) renderQueue(q);
  return q;
}
function queueRefreshSoon() {
  const now = Date.now();
  if (now - queueRefreshAt > 2500) {
    queueRefreshAt = now;
    refreshQueue().catch(() => { /* noop */ });
  }
}
function agoStr(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return Math.max(1, Math.floor(s)) + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}
function openFromQueue(itemId, videoId) {
  $('#queueSheet').classList.remove('show');
  const go = () => { setView('gallery'); openLightbox(itemId, videoId || 'image'); };
  if (state.items.some((i) => i.id === itemId)) go();
  else refreshGallery(true).then(go);
}
function renderQueue(q) {
  const list = $('#queueList');
  list.innerHTML = '';
  const rows = [
    ...(q.running || []).map((j) => ({ ...j, run: true })),
    ...(q.pending || []).map((j) => ({ ...j, run: false })),
  ];
  if (!rows.length) {
    list.innerHTML = '<div class="queue-empty">Queue is empty — nothing running.</div>';
  }
  for (const j of rows) {
    const row = document.createElement('div');
    row.className = 'queue-row';
    const st = document.createElement('span');
    st.className = 'q-state' + (j.run ? ' run' : '');
    st.dataset.jobId = j.jobId;
    const pct = state.queueProgress[j.jobId];
    st.textContent = j.run ? (pct != null ? pct + '%' : 'Running') : 'Queued';
    const lb = document.createElement('span');
    lb.className = 'q-label';
    lb.textContent = j.label;
    if (j.itemId) {
      row.classList.add('q-click');
      lb.addEventListener('click', () => openFromQueue(j.itemId));
    }
    const x = document.createElement('button');
    x.className = 'q-cancel';
    x.textContent = '✕';
    x.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!window.confirm(j.run ? 'Stop this running job?' : 'Remove this job from the queue?')) return;
      try {
        await api('/api/queue/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: j.jobId }),
        });
        toast(j.run ? 'Job stopped' : 'Removed from queue');
        refreshQueue();
      } catch (e2) { toast(e2.message, true); }
    });
    row.append(st, lb, x);
    list.appendChild(row);
  }
  // Recent generations (history)
  const hist = q.history || [];
  if (hist.length) {
    const h = document.createElement('div');
    h.className = 'queue-section';
    h.textContent = 'Recent';
    list.appendChild(h);
    for (const e of hist) {
      const row = document.createElement('div');
      row.className = 'queue-row' + (e.itemId ? ' q-click' : '');
      const st = document.createElement('span');
      st.className = 'q-state' + (e.kind === 'error' ? ' q-err' : '');
      st.textContent = agoStr(e.ts);
      const lb = document.createElement('span');
      lb.className = 'q-label';
      lb.textContent = (e.kind === 'error' ? '⚠ ' : '') + e.label;
      row.append(st, lb);
      if (e.itemId) row.addEventListener('click', () => openFromQueue(e.itemId, e.videoId));
      list.appendChild(row);
    }
  }
}
let queuePoll = null;
$('#queueBtn').addEventListener('click', async () => {
  $('#queueSheet').classList.add('show');
  try { renderQueue(await refreshQueue()); } catch { /* noop */ }
  clearInterval(queuePoll);
  queuePoll = setInterval(() => {
    if (!$('#queueSheet').classList.contains('show')) { clearInterval(queuePoll); return; }
    refreshQueue().catch(() => { /* noop */ });
  }, 3000);
});

/* ------------------------------------------------------------------ */
/* SSE events                                                          */
/* ------------------------------------------------------------------ */

function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('progress', (ev) => {
    const d = JSON.parse(ev.data);
    const pct = d.max ? Math.round((d.value / d.max) * 100) : 0;
    state.queueProgress[d.jobId] = pct;
    const st = document.querySelector(`.q-state[data-job-id="${d.jobId}"]`);
    if (st) st.textContent = pct + '%';
    if (!state.activeJobs.has(d.jobId) && !isUpscaleJob(d.jobId)) return;
    $('#genFill').style.width = pct + '%';
    $('#livePct').textContent = pct + '%';
  });
  es.addEventListener('status', (ev) => {
    const d = JSON.parse(ev.data);
    if (state.activeJobs.has(d.jobId) || d.jobId === 'pre') {
      $('#liveStatusText').innerHTML = `<span class="spin"></span> ${d.text}`;
    }
  });
  es.addEventListener('preview', (ev) => {
    const d = JSON.parse(ev.data);
    if (state.activeJobs.size) $('#livePreviewImg').src = d.dataUrl;
  });
  es.addEventListener('jobDone', (ev) => {
    const d = JSON.parse(ev.data);
    if (state.activeJobs.has(d.jobId)) {
      state.activeJobs.delete(d.jobId);
      setGenerating(false);
      if (d.items && d.items.length) {
        $('#livePreviewImg').src = '/images/' + d.items[0].file;
        $('#liveStatusText').textContent = 'Done — tap to view';
        $('#livePct').textContent = '';
        const open = () => { refreshGallery().then(() => openLightbox(d.items[0].id)); };
        $('#livePreviewImg').onclick = open;
        $('#liveStatusText').onclick = open;
        toast('✓ Generated');
      }
    }
    refreshGallery(true);
    queueRefreshSoon();
  });
  es.addEventListener('videoDone', (ev) => {
    const d = JSON.parse(ev.data);
    state.animating.delete(d.item.id);
    const vids = d.item.videos || [];
    const newest = vids.length ? vids[vids.length - 1].id : 'image';
    if (state.activeJobs.has(d.jobId)) {
      // Video-tab job: show result in the dock thumbnail
      state.activeJobs.delete(d.jobId);
      setGenerating(false);
      $('#livePreviewImg').src = '/images/' + d.item.file;
      $('#liveStatusText').textContent = 'Video ready — tap to view';
      $('#livePct').textContent = '';
      const open = () => { refreshGallery().then(() => openLightbox(d.item.id, newest)); };
      $('#livePreviewImg').onclick = open;
      $('#liveStatusText').onclick = open;
    }
    toast('✓ Video ready');
    refreshGallery(true).then(() => {
      if (state.currentItem && state.currentItem.id === d.item.id) {
        openLightbox(d.item.id, newest);
      }
    });
    queueRefreshSoon();
  });
  es.addEventListener('upscaleDone', (ev) => {
    const d = JSON.parse(ev.data);
    state.upscaling.delete(d.item.id);
    toast('✓ Upscaled');
    refreshGallery(true).then(() => {
      if (state.currentItem && state.currentItem.id === d.item.id) openLightbox(d.item.id);
    });
  });
  es.addEventListener('jobError', (ev) => {
    const d = JSON.parse(ev.data);
    if (d.itemId) { state.upscaling.delete(d.itemId); state.animating.delete(d.itemId); }
    if (state.activeJobs.has(d.jobId)) {
      state.activeJobs.delete(d.jobId);
      setGenerating(false);
    }
    renderGrid();
    toast('Error: ' + d.message, true);
    queueRefreshSoon();
  });
  es.onerror = () => { /* browser auto-reconnects */ };
}
function isUpscaleJob() { return state.upscaling.size > 0; }

/* ------------------------------------------------------------------ */
/* Gallery                                                             */
/* ------------------------------------------------------------------ */

async function refreshGallery(soft) {
  try {
    const data = await api('/api/gallery');
    state.folders = data.folders;
    state.items = data.items;
    state.privateUnlocked = !!data.unlocked;
    if (state.activeFolder !== 'all' && !state.folders.some((f) => f.id === state.activeFolder)) {
      state.activeFolder = 'all';
    }
    renderFolders();
    renderGrid();
    updatePrivacyButton();
  } catch (e) { if (!soft) toast(e.message, true); }
}

function updatePrivacyButton() {
  const btn = $('#privacyBtn');
  if (!btn) return;
  btn.textContent = state.privateUnlocked ? 'Hide locked' : 'Locked';
  btn.classList.toggle('unlocked', state.privateUnlocked);
}

async function unlockPrivateGallery() {
  const password = window.prompt('Gallery password');
  if (password == null) return;
  await api('/api/private/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  state.privateUnlocked = true;
  await refreshGallery();
  toast('Locked folders shown');
}

async function lockPrivateGallery() {
  await api('/api/private/lock', { method: 'POST' });
  state.privateUnlocked = false;
  if ((state.folders || []).some((f) => f.id === state.activeFolder && f.locked)) state.activeFolder = 'all';
  await refreshGallery();
  toast('Locked folders hidden');
}

function renderFolders() {
  const row = $('#folderRow');
  row.innerHTML = '';
  const chips = [{ id: 'all', name: 'All' }, ...state.folders];
  for (const f of chips) {
    const btn = document.createElement('button');
    btn.className = 'folder-chip' + (state.activeFolder === f.id ? ' active' : '');
    btn.textContent = f.name;
    btn.classList.toggle('locked', !!f.locked);
    btn.addEventListener('click', () => { state.activeFolder = f.id; renderFolders(); renderGrid(); });
    if (f.id !== 'all') {
      let timer = null;
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); folderActions(f); });
      btn.addEventListener('touchstart', () => { timer = setTimeout(() => folderActions(f), 700); }, { passive: true });
      btn.addEventListener('touchend', () => clearTimeout(timer));
    }
    row.appendChild(btn);
  }
  const add = document.createElement('button');
  add.className = 'folder-chip';
  add.textContent = '＋ Folder';
  add.addEventListener('click', async () => {
    const name = window.prompt('Folder name');
    if (!name) return;
    try { await api('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); refreshGallery(); }
    catch (e) { toast(e.message, true); }
  });
  row.appendChild(add);
}

$('#privacyBtn')?.addEventListener('click', async () => {
  try {
    if (state.privateUnlocked) await lockPrivateGallery();
    else await unlockPrivateGallery();
  } catch (e) { toast(e.message, true); }
});

async function folderActions(f) {
  try {
    const action = window.prompt(`Folder "${f.name}": type lock, unlock, or delete`, f.locked ? 'unlock' : 'lock');
    if (!action) return;
    const cmd = action.trim().toLowerCase();
    if (cmd === 'delete') { await deleteFolder(f); return; }
    if (cmd !== 'lock' && cmd !== 'unlock') return;
    if (!state.privateUnlocked) {
      await unlockPrivateGallery();
      if (!state.privateUnlocked) return;
    }
    await api(`/api/folders/${f.id}/private`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: cmd === 'lock' }),
    });
    if (state.activeFolder === f.id && cmd === 'lock') state.activeFolder = 'all';
    await refreshGallery();
    toast(cmd === 'lock' ? 'Folder locked' : 'Folder unlocked');
  } catch (e) { toast(e.message, true); }
}

async function deleteFolder(f) {
  if (f.locked && !state.privateUnlocked) {
    await unlockPrivateGallery();
    if (!state.privateUnlocked) return;
  }
  if (!window.confirm(`Delete folder "${f.name}"? Images inside are kept (moved to All).`)) return;
  await api('/api/folders/' + f.id, { method: 'DELETE' });
  if (state.activeFolder === f.id) state.activeFolder = 'all';
  refreshGallery();
}

function itemActivity(it) {
  let t = it.createdAt || 0;
  for (const v of it.videos || []) t = Math.max(t, v.createdAt || 0);
  return t;
}
function visibleItems() {
  const arr = state.items.filter((it) => {
    if (state.activeFolder !== 'all' && it.folder !== state.activeFolder) return false;
    const hasVideos = it.videos && it.videos.length;
    if (state.mediaFilter === 'videos') return !!hasVideos;
    if (state.mediaFilter === 'images') return !hasVideos;
    return true;
  });
  if (state.sortMode === 'old') arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  else if (state.sortMode === 'az') arr.sort((a, b) => (a.prompt || '').localeCompare(b.prompt || ''));
  else if (state.sortMode === 'active') arr.sort((a, b) => itemActivity(b) - itemActivity(a));
  else arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return arr;
}

function renderGrid() {
  const grid = $('#galleryGrid');
  grid.innerHTML = '';
  const items = visibleItems();
  $('#galleryEmpty').classList.toggle('hidden', items.length > 0);
  for (const it of items) {
    const card = document.createElement('button');
    card.className = 'card';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = '/images/' + it.file;
    card.appendChild(img);
    if (it.videos && it.videos.length) {
      const v = document.createElement('span');
      v.className = 'badge vid';
      v.textContent = it.videos.length > 1 ? `▶ ${it.videos.length} Videos` : '▶ Video';
      card.appendChild(v);
    }
    if (it.upscaled) {
      const b = document.createElement('span');
      b.className = 'badge up';
      b.textContent = 'Upscaled';
      card.appendChild(b);
    } else if (it.mode === 'edit') {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = 'Edit';
      card.appendChild(b);
    }
    if (state.upscaling.has(it.id) || state.animating.has(it.id)) {
      const ov = document.createElement('div');
      ov.className = 'busy-overlay';
      ov.innerHTML = `<span><span class="spin"></span> ${state.animating.has(it.id) ? 'Animating…' : 'Upscaling…'}</span>`;
      card.appendChild(ov);
    }
    card.dataset.id = it.id;
    if (state.selected.has(it.id)) card.classList.add('selected');

    // long-press -> multi-select mode; tap -> toggle (in select mode) or open
    let lpTimer = null;
    let lpFired = false;
    let startXY = [0, 0];
    card.addEventListener('pointerdown', (e) => {
      lpFired = false;
      startXY = [e.clientX, e.clientY];
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        lpFired = true;
        if (navigator.vibrate) navigator.vibrate(12);
        if (!state.selectMode) enterSelectWith(it.id);
        else toggleSelect(it.id);
      }, 450);
    });
    card.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) > 12) clearTimeout(lpTimer);
    });
    card.addEventListener('pointerup', () => clearTimeout(lpTimer));
    card.addEventListener('pointercancel', () => clearTimeout(lpTimer));
    card.addEventListener('contextmenu', (e) => e.preventDefault());
    card.addEventListener('click', () => {
      if (lpFired) { lpFired = false; return; }
      if (state.selectMode) toggleSelect(it.id);
      else openLightbox(it.id);
    });
    grid.appendChild(card);
  }
}

/* ------------------------------------------------------------------ */
/* Multi-select                                                        */
/* ------------------------------------------------------------------ */

function enterSelectWith(id) {
  state.selectMode = true;
  state.selected = new Set([id]);
  document.querySelector(`.card[data-id="${id}"]`)?.classList.add('selected');
  updateSelectBar();
}
function toggleSelect(id) {
  const card = document.querySelector(`.card[data-id="${id}"]`);
  if (state.selected.has(id)) {
    state.selected.delete(id);
    card?.classList.remove('selected');
  } else {
    state.selected.add(id);
    card?.classList.add('selected');
  }
  if (!state.selected.size) exitSelect();
  else updateSelectBar();
}
function exitSelect() {
  if (!state.selectMode && !state.selected.size) { $('#selectBar').hidden = true; return; }
  state.selectMode = false;
  state.selected = new Set();
  $$('.card.selected').forEach((c) => c.classList.remove('selected'));
  $('#selectBar').hidden = true;
}
function updateSelectBar() {
  $('#selectBar').hidden = false;
  $('#selCount').textContent = `${state.selected.size} selected`;
}
$('#selCancel').addEventListener('click', exitSelect);
$('#selMove').addEventListener('click', () => {
  if (state.selected.size) openMoveSheet([...state.selected]);
});
$('#selDelete').addEventListener('click', async () => {
  const ids = [...state.selected];
  if (!ids.length) return;
  if (!window.confirm(`Delete ${ids.length} image${ids.length > 1 ? 's' : ''}? This can't be undone.`)) return;
  try {
    await Promise.all(ids.map((id) => api('/api/item/' + id, { method: 'DELETE' })));
    exitSelect();
    await refreshGallery();
    toast(`Deleted ${ids.length} image${ids.length > 1 ? 's' : ''}`);
  } catch (e) { toast(e.message, true); refreshGallery(); }
});

/* ------------------------------------------------------------------ */
/* Lightbox                                                            */
/* ------------------------------------------------------------------ */

/* Background scroll lock: the viewer behaves like its own page */
let savedScrollY = 0;
function lockScroll() {
  if (document.body.classList.contains('modal-open')) return;
  savedScrollY = window.scrollY;
  document.body.classList.add('modal-open');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
}
function unlockScroll() {
  if (!document.body.classList.contains('modal-open')) return;
  document.body.classList.remove('modal-open');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  window.scrollTo(0, savedScrollY);
}
window.addEventListener('popstate', () => {
  if ($('#compare').classList.contains('show')) { $('#compare').classList.remove('show'); return; }
  if ($('#lightbox').classList.contains('show')) closeLightbox(true);
});

function openLightbox(id, mediaSel) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  const freshOpen = !$('#lightbox').classList.contains('show');
  if (freshOpen) {
    lockScroll();
    try { history.pushState({ lb: 1 }, ''); } catch { /* noop */ }
  }
  state.currentItem = it;
  const videos = Array.isArray(it.videos) ? it.videos : [];
  let sel = mediaSel;
  if (sel !== 'image' && !videos.some((v) => v.id === sel)) sel = 'image';
  const selVideo = videos.find((v) => v.id === sel) || null;
  $('#lightbox').classList.add('show');

  const vid = $('#lbVideo');
  if (selVideo) {
    $('#lbImg').hidden = true;
    vid.hidden = false;
    vid.src = '/videos/' + selVideo.file;
    vid.poster = '/images/' + it.file;
  } else {
    try { vid.pause(); } catch { /* noop */ }
    vid.hidden = true;
    vid.removeAttribute('src');
    $('#lbImg').hidden = false;
    $('#lbImg').src = '/images/' + (it.upscaled || it.file);
  }
  $('#lbTitle').textContent = selVideo
    ? `Video ${videos.indexOf(selVideo) + 1} of ${videos.length}`
    : (it.upscaled ? 'Upscaled' : (it.mode === 'edit' ? 'Edit' : (it.mode === 'video' ? 'Video Poster' : 'Generation')));
  $('#lbCompareBtn').hidden = !(!selVideo && it.upscaled);

  // media switcher (only when the image has videos)
  const mrow = $('#lbMedia');
  mrow.innerHTML = '';
  if (videos.length) {
    const mkChip = (label, key) => {
      const b = document.createElement('button');
      b.className = 'chip' + ((key === 'image' ? !selVideo : selVideo && selVideo.id === key) ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => openLightbox(id, key));
      mrow.appendChild(b);
    };
    mkChip('🖼 Image', 'image');
    videos.forEach((v, i) => mkChip('▶ ' + (i + 1), v.id));
  }

  const meta = [];
  if (selVideo) {
    const info = selVideo.info || {};
    meta.push(`<b>🎬 Motion:</b> ${escapeHtml(info.motionPrompt || '')}`);
    if (info.refinedMotionPrompt) meta.push(`<b>✨ Enhanced motion:</b> ${escapeHtml(info.refinedMotionPrompt)}`);
    if (info.frames && info.fps) {
      const eng = { wan: 'Wan 2.2', eros: '10Eros DMD', scail: 'SCAIL 2' }[info.engine] || 'LTX 2.3';
      const flags = [info.composite && '⿻ side-by-side', info.processed === 'upscale' && 'RTX upscale', info.processed === 'interpolate' && 'RIFE pass', info.smooth && `⏫ RIFE ${info.smooth}×`, info.fourK && 'RTX 4K', info.engine === 'wan' && info.fast && '4-step', info.sigmaPreset && `sigmas: ${info.sigmaPreset}`, info.scailMode && `SCAIL ${info.scailMode}`, info.drivenAudio && '🎵 audio-driven', info.preservedAudio && '🎵 audio kept', info.endFrame && '🏁 end frame', info.motionVideo && !info.composite && '🎥 motion transfer'].filter(Boolean).join(' · ');
      meta.push(`<b>Video:</b> ${eng} · ${(info.frames / info.fps).toFixed(1)}s @ ${info.fps}fps${flags ? ' · ' + flags : ''} &nbsp; <b>Seed:</b> ${info.seed ?? '—'}`);
      if (info.loras && info.loras.length) meta.push('<b>Video LoRAs:</b> ' + info.loras.map((l) => `${prettyLora(l.name)} (${Number(l.strength).toFixed(2)})`).join(', '));
    }
  } else {
    meta.push(`<b>Prompt:</b> ${escapeHtml(it.prompt || '')}`);
    if (it.mode === 'edit' && it.editEngine) meta.push(`<b>Editor:</b> ${editEngineLabel(it.editEngine)}`);
    if (it.refinedPrompt) meta.push(`<b>✨ Enhanced:</b> ${escapeHtml(it.refinedPrompt)}`);
    meta.push(`<b>Size:</b> ${it.width}×${it.height} &nbsp; <b>Seed:</b> ${it.seed} &nbsp; <b>Steps:</b> ${it.steps} &nbsp; <b>CFG:</b> ${it.cfg}`);
    if (it.loras && it.loras.length) meta.push('<b>LoRAs:</b> ' + it.loras.map((l) => `${prettyLora(l.name)} (${Number(l.strength).toFixed(2)})`).join(', '));
    if (it.upscaleInfo) {
      if (it.upscaleInfo.engine === 'ultimate') {
        meta.push(`<b>Ultimate SD:</b> ${it.upscaleInfo.scaleFactor || 2}x prompt-guided upscale`);
      } else {
        const prof = it.upscaleInfo.profile === 'sharp' ? 'sharp' : 'balanced';
        const noise = it.upscaleInfo.noise || 'low';
        const pre = Number(it.upscaleInfo.preScale) === 1 ? 'off' : `${it.upscaleInfo.preScale}x`;
        const mode = it.upscaleInfo.upscaleMode === 'scale' && it.upscaleInfo.scaleFactor
          ? `${it.upscaleInfo.scaleFactor}x, ${it.upscaleInfo.resolution}p short edge`
          : `${it.upscaleInfo.resolution}p target`;
        meta.push(`<b>SeedVR2:</b> ${prof}, noise ${noise}, ${mode}, pre ${pre}`);
      }
    }
  }
  $('#lbMeta').innerHTML = meta.join('<br>');

  const actions = $('#lbActions');
  actions.innerHTML = '';
  const mk = (label, cls, fn) => {
    const b = document.createElement('button');
    b.className = 'action-btn' + (cls ? ' ' + cls : '');
    b.innerHTML = label;
    b.addEventListener('click', fn);
    actions.appendChild(b);
    return b;
  };
  const mkMenu = (label, cls, items) => {
    let b;
    b = mk(label, cls, () => {
      const list = typeof items === 'function' ? items() : items;
      openActionMenu(b, list || []);
    });
    return b;
  };

  if (state.animating.has(it.id)) {
    mk('<span class="spin"></span> Animating…', selVideo ? 'primary' : '', () => {});
  } else {
    mk(videos.length ? '🎬 Animate again' : '🎬 Animate', 'primary', () => openAnimateSheet(it, selVideo));
  }
  // Edits: hold to flash the original source image
  if (!selVideo && it.mode === 'edit' && it.sourceFile) {
    const hb = mk('👁 Hold: original', '', () => {});
    hb.style.userSelect = 'none';
    hb.style.webkitUserSelect = 'none';
    const show = (e) => { e.preventDefault(); $('#lbImg').src = '/images/' + it.sourceFile; };
    const hide = () => { $('#lbImg').src = '/images/' + (it.upscaled || it.file); };
    hb.addEventListener('pointerdown', show);
    hb.addEventListener('pointerup', hide);
    hb.addEventListener('pointercancel', hide);
    hb.addEventListener('pointerleave', hide);
    hb.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  if (selVideo) {
    const vinfo = selVideo.info || {};
    const videoUseItems = [];
    if (!vinfo.composite) videoUseItems.push({ label: 'Reuse settings', action: () => reuseVideo(it, selVideo) });
    // Toggle between the result and the motion video that drove it
    if (vinfo.driveVideoName && !vinfo.composite) {
      let showingInput = false;
      let inputUrl = null;
      const btn = mk('🎥 Motion input', '', async () => {
        const lv = $('#lbVideo');
        try {
          if (!showingInput) {
            btn.innerHTML = '<span class="spin"></span> Loading…';
            if (!inputUrl) {
              const r = await fetch('/api/input?name=' + encodeURIComponent(vinfo.driveVideoName));
              if (!r.ok) throw new Error('Motion video is no longer in the ComfyUI input folder');
              inputUrl = URL.createObjectURL(await r.blob());
            }
            lv.src = inputUrl;
            lv.play().catch(() => {});
            showingInput = true;
            btn.textContent = '▶ Result video';
            $('#lbTitle').textContent = 'Motion input';
          } else {
            lv.src = '/videos/' + selVideo.file;
            lv.play().catch(() => {});
            showingInput = false;
            btn.textContent = '🎥 Motion input';
            $('#lbTitle').textContent = `Video ${videos.indexOf(selVideo) + 1} of ${videos.length}`;
          }
        } catch (e) {
          btn.textContent = '🎥 Motion input';
          toast(e.message, true);
        }
      });
    }
    if (!vinfo.composite) videoUseItems.push({ label: 'Use as motion video', action: () => sendVideoAsDrive(it, selVideo) });
    if (videoUseItems.length) mkMenu('Use', '', videoUseItems);
    const processItems = [];
    if (!vinfo.composite) {
      processItems.push({ label: 'Upscale video', action: () => processVideo(it, selVideo, 'upscale') });
      processItems.push({ label: 'Increase FPS', action: () => processVideo(it, selVideo, 'interpolate') });
    }
    if (vinfo.engine === 'scail' && vinfo.driveVideoName && !vinfo.composite) {
      processItems.push({ label: 'Side-by-side', action: async () => {
        try {
          toast('Building side-by-side comparison…');
          const r = await api('/api/composite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: it.id, videoId: selVideo.id }),
          });
          state.activeJobs.add(r.jobId);
          $('#genLbl').textContent = genLabel();
          queueRefreshSoon();
          closeLightbox();
        } catch (e) { toast(e.message, true); }
      } });
    }
    if (processItems.length) mkMenu('Process video', '', processItems);
    mk('↓ Save video', '', () => {
      const a = document.createElement('a');
      a.href = '/videos/' + selVideo.file;
      a.download = (it.prompt || 'kreastudio').slice(0, 40).replace(/[^\w]+/g, '_') + '_v' + (videos.indexOf(selVideo) + 1) + '.mp4';
      a.click();
    });
    mk('🗑 Delete video', 'danger', async () => {
      const lastOfStandalone = it.mode === 'video' && videos.length === 1;
      const msg = lastOfStandalone
        ? 'Delete this video? It\'s the only one on this entry, so the whole gallery item goes with it.'
        : 'Delete this video? The image stays.';
      if (!window.confirm(msg)) return;
      if (lastOfStandalone) {
        await api('/api/item/' + it.id, { method: 'DELETE' });
        closeLightbox();
        refreshGallery();
        toast('Video deleted');
        return;
      }
      await api(`/api/item/${it.id}/video/${selVideo.id}`, { method: 'DELETE' });
      await refreshGallery(true);
      openLightbox(it.id, 'image');
      toast('Video deleted');
    });
  } else {
    if (state.upscaling.has(it.id)) {
      mk('<span class="spin"></span> Upscaling…', '', () => {});
    } else {
      mk(it.upscaled ? '⇪ Re-upscale' : '⇪ Upscale', '', () => openUpscaleSheet(it));
    }
    const imageUseItems = [
      { label: 'Use in Video tab', action: () => sendToVideoTab(it) },
      { label: 'Use in Edit', action: () => useAsRef(it) },
      { label: 'Reuse settings', action: () => reuseItem(it) },
    ];
    if (it.sourceItemId && state.items.some((x) => x.id === it.sourceItemId)) {
      imageUseItems.push({ label: 'Open original item', action: () => openLightbox(it.sourceItemId) });
    }
    mkMenu('Use', '', imageUseItems);
    mk('▤ Move', '', () => openMoveSheet(it));
    mkMenu('Save', '', it.upscaled
      ? [
        { label: 'Save upscaled', action: () => downloadItem(it, 'upscaled') },
        { label: 'Save original', action: () => downloadItem(it, 'original') },
      ]
      : [{ label: 'Save image', action: () => downloadItem(it, 'current') }]);
    mk('🗑 Delete', 'danger', async () => {
      const n = videos.length;
      if (!window.confirm(n ? `Delete this image and its ${n} video${n > 1 ? 's' : ''}?` : 'Delete this image?')) return;
      await api('/api/item/' + it.id, { method: 'DELETE' });
      closeLightbox();
      refreshGallery();
    });
  }
}
function closeLightbox(fromPop) {
  closeActionMenu();
  $('#lightbox').classList.remove('show');
  const vid = $('#lbVideo');
  try { vid.pause(); } catch { /* noop */ }
  state.currentItem = null;
  unlockScroll();
  if (!fromPop && window.history.state && window.history.state.lb) {
    try { history.back(); } catch { /* noop */ }
  }
}

async function processVideo(it, video, kind) {
  if (!it || !video) return;
  const route = kind === 'upscale' ? '/api/video/upscale' : '/api/video/interpolate';
  const label = kind === 'upscale' ? 'Video upscale queued' : 'Frame interpolation queued';
  try {
    setGenerating(true, 'Queued…');
    state.animating.add(it.id);
    const res = await api(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: it.id,
        videoId: video.id,
        scale: kind === 'upscale' ? 2 : undefined,
        multiplier: kind === 'interpolate' ? 2 : undefined,
      }),
    });
    state.activeJobs.add(res.jobId);
    $('#genLbl').textContent = genLabel();
    queueRefreshSoon();
    closeLightbox();
    toast(label);
  } catch (e) {
    state.animating.delete(it.id);
    setGenerating(false);
    toast(e.message, true);
  }
}

/* ------------------------------------------------------------------ */
/* Animate (LTX 2.3 image-to-video)                                    */
/* ------------------------------------------------------------------ */

function openAnimateSheet(it, selVideo) {
  state.animateTarget = it;
  const src = (selVideo && selVideo.info) || ((it.videos || []).length ? it.videos[it.videos.length - 1].info : null);
  if (src && src.motionPrompt) $('#animPrompt').value = src.motionPrompt;
  // fresh attachments per open
  state.animEnd = null;
  state.animAudio = null;
  stopPreview();
  endFrameRefresh.animEnd();
  $('#animAudioChip').classList.remove('active');
  $('#animAudioChip').textContent = '🎵 Audio';
  $('#animAudioTrim').hidden = true;
  $('#animateSheet').classList.add('show');
}
$('#animDur').addEventListener('input', () => { $('#animDurVal').textContent = $('#animDur').value; });
$('#animFree').addEventListener('input', () => { $('#animFreeVal').textContent = $('#animFree').value; });
$('#vidFree').addEventListener('input', () => { $('#vidFreeVal').textContent = $('#vidFree').value; });
$('#animEnhance').addEventListener('click', () => $('#animEnhance').classList.toggle('active'));
$$('#mediaFilter button').forEach((b) => b.addEventListener('click', () => {
  state.mediaFilter = b.dataset.f;
  $$('#mediaFilter button').forEach((x) => x.classList.toggle('active', x === b));
  renderGrid();
}));
state.sortMode = 'new';
$$('#sortSeg button').forEach((b) => b.addEventListener('click', () => {
  state.sortMode = b.dataset.sort;
  $$('#sortSeg button').forEach((x) => x.classList.toggle('active', x === b));
  renderGrid();
}));
$('#animUsePrompt').addEventListener('click', () => {
  const it = state.animateTarget;
  if (!it) return;
  $('#animPrompt').value = it.refinedPrompt || it.prompt || '';
});
$('#animAuto').addEventListener('click', async () => {
  const it = state.animateTarget;
  if (!it) return;
  const btn = $('#animAuto');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Looking at image…';
  try {
    const r = await api('/api/motionprompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: it.id }),
    });
    $('#animPrompt').value = r.prompt;
  } catch (e) { toast(e.message, true); }
  btn.disabled = false;
  btn.textContent = '👁 Auto from image';
});
$('#anim4k').addEventListener('click', () => $('#anim4k').classList.toggle('active'));
$('#animateGo').addEventListener('click', async () => {
  const it = state.animateTarget;
  if (!it) return;
  const prompt = $('#animPrompt').value.trim();
  if (!prompt) return toast('Describe the motion first', true);
  let animAudioName;
  if (state.animAudio && state.animEngine !== 'wan') {
    try { animAudioName = await ensureAudioUploaded(state.animAudio); }
    catch (e) { return toast('Audio upload failed: ' + e.message, true); }
  }
  const body = {
    id: it.id,
    prompt,
    engine: state.animEngine,
    seconds: Number($('#animDur').value) || 5,
    enhance: $('#animEnhance').classList.contains('active'),
    fourK: $('#anim4k').classList.contains('active'),
    fast: !$('#animQuality').classList.contains('active'),
    motionFreedom: Number($('#animFree').value),
    sigmaPreset: state.animSigma,
    audioName: animAudioName,
    endImageName: state.animEnd ? state.animEnd.name : undefined,
  };
  $('#animateSheet').classList.remove('show');
  try {
    state.animating.add(it.id);
    renderGrid();
    if (state.currentItem && state.currentItem.id === it.id) openLightbox(it.id);
    await api('/api/animate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    toast('🎬 Video queued — LTX 2.3');
  } catch (e) {
    state.animating.delete(it.id);
    renderGrid();
    toast(e.message, true);
  }
});
$('#lbClose').addEventListener('click', closeLightbox);
$('#lbCompareBtn').addEventListener('click', () => {
  if (state.currentItem && state.currentItem.upscaled) openCompare(state.currentItem);
});

/* Swipe left/right in the lightbox to move between generations */
(() => {
  const wrap = document.querySelector('.lightbox-img-wrap');
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let active = false;
  wrap.addEventListener('touchstart', (e) => {
    if (e.target.tagName === 'VIDEO') {
      // allow swiping on the video body, but not over the control bar
      const r = e.target.getBoundingClientRect();
      if (e.touches[0].clientY > r.bottom - 72) { active = false; return; }
    }
    const t = e.touches[0];
    x0 = t.clientX;
    y0 = t.clientY;
    t0 = Date.now();
    active = true;
  }, { passive: true });
  wrap.addEventListener('touchend', (e) => {
    if (!active) return;
    active = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7 || Date.now() - t0 > 600) return;
    if (!state.currentItem) return;
    const items = visibleItems();
    const idx = items.findIndex((i) => i.id === state.currentItem.id);
    if (idx === -1) return;
    const next = dx < 0 ? items[idx + 1] : items[idx - 1];
    if (next) openLightbox(next.id);
    else toast(dx < 0 ? 'Last item' : 'Newest item');
  }, { passive: true });
})();

function reuseItem(it, useEnhanced) {
  // Enhanced generations: ask whether to reuse the enhanced text directly
  // (skips re-running the LLM) or the original prompt with enhance on.
  if (useEnhanced === undefined && it.enhance && it.refinedPrompt) {
    state.reuseTarget = it;
    $('#reuseSheet').classList.add('show');
    return;
  }
  const targetView = it.mode === 'edit' ? 'edit' : 'create';
  state.prompts[targetView] = useEnhanced ? (it.refinedPrompt || it.prompt || '') : (it.prompt || '');
  state.enhance = useEnhanced ? false : !!it.enhance;
  renderEnhance();
  state.customDims = true;
  state.width = it.width || 1024;
  state.height = it.height || 1024;
  const restoredLoras = (it.loras || []).map((l) => ({ name: l.name, strength: Number(l.strength) || 1, on: true }));
  if (targetView === 'edit') {
    state.editLoras = restoredLoras;
    state.editEngine = it.editEngine === 'qwen' ? 'qwen' : (it.editEngine === 'klein9' ? 'klein9' : 'klein4');
    markEngineRow('editEngineRow', state.editEngine);
  } else {
    state.loras = restoredLoras;
  }
  $('#seedInput').value = it.seed !== undefined && it.seed !== null ? String(it.seed) : '';
  if (it.steps) $('#stepsInput').value = it.steps;
  if (it.cfg !== undefined && it.cfg !== null) $('#cfgInput').value = it.cfg;
  if (it.mode === 'edit') {
    $('#denoiseInput').value = it.denoise != null ? it.denoise : 0.4;
    $('#denoiseVal').textContent = Number($('#denoiseInput').value).toFixed(2);
  }
  renderAspects();
  renderDims();
  saveForm();
  closeLightbox();
  setView(it.mode === 'edit' ? 'edit' : 'create');
  renderLoras();
  if (it.mode === 'edit' && it.refImages && it.refImages.length) {
    toast('Settings loaded — re-add the reference image(s)');
  } else if (useEnhanced) {
    toast('Enhanced prompt loaded — ✨ enhance turned off');
  } else {
    toast('Settings loaded from this generation');
  }
}

/* Reuse a video generation: restore engine, prompt, settings and every
   input asset (source image, audio, end frame, motion video) in the
   Video tab. Assets are pulled back from ComfyUI's input dir. */
async function reuseVideo(it, v) {
  const info = v.info || {};
  const engine = ['wan', 'eros', 'scail'].includes(info.engine) ? info.engine : 'ltx';
  closeLightbox();
  setView('video');

  // Clear current attachments + their UI
  state.vidRef = null;
  state.vidEnd = null;
  state.vidDrive = null;
  if (state.vidAudio) stopPreview();
  state.vidAudio = null;
  $('#vidAudioChip').classList.remove('active');
  $('#vidAudioChip').textContent = '🎵 Audio';
  $('#vidAudioTrim').hidden = true;
  $('#vidDriveTrimChip').classList.remove('active');
  $('#vidDriveVideo').removeAttribute('src');

  // Engine chip (drives dependent UI: sigma row, extras, duration max…)
  const echip = $(`#vidEngineRow .chip[data-engine="${engine}"]`);
  if (echip) echip.click();
  const schip = $(`#vidSigmaRow .chip[data-sig="${info.sigmaPreset || 'dmd'}"]`);
  if (schip) schip.click();
  const fchip = $(`#vidFpsRow .chip[data-smooth="${info.smooth || 1}"]`);
  if (fchip) fchip.click();
  const scailModeChip = $(`#vidScailModeRow .chip[data-scail-mode="${info.scailMode || 'chunked'}"]`);
  if (scailModeChip) scailModeChip.click();

  // Prompt + toggles
  state.prompts.video = info.motionPrompt || '';
  $('#prompt').value = state.prompts.video;
  state.enhance = !!info.enhance;
  renderEnhance();
  $('#vid4k').classList.toggle('active', !!info.fourK);
  $('#vidQuality').classList.toggle('active', engine === 'wan' && info.fast === false);
  if (info.motionFreedom !== undefined && info.motionFreedom !== null) {
    $('#vidFree').value = info.motionFreedom;
    $('#vidFreeVal').textContent = info.motionFreedom;
  }
  const dur = $('#vidDur');
  const secs = info.frames && info.fps ? Math.round(info.frames / info.fps) : 5;
  dur.value = Math.max(1, Math.min(Number(dur.max) || 15, secs));
  $('#vidDurVal').textContent = dur.value;

  // LoRAs
  state.videoLoras = (info.loras || []).map((l) => ({ name: l.name, strength: Number(l.strength) || 1, on: true }));

  const missing = [];
  const inputBlob = async (name) => {
    const r = await fetch('/api/input?name=' + encodeURIComponent(name));
    if (!r.ok) throw new Error('gone');
    return r.blob();
  };

  // Source image
  if (!info.t2v) {
    try {
      if (it.mode !== 'video') {
        // grouped under a real image item -> reuse the item image (keeps grouping)
        const blob = await (await fetch('/images/' + it.file)).blob();
        const buf = await blob.arrayBuffer();
        const res = await api('/api/upload', {
          method: 'POST',
          headers: { 'x-filename': encodeURIComponent(it.file) },
          body: buf,
        });
        state.vidRef = { name: res.name, url: '/images/' + it.file, w: info.srcWidth || it.width || 1024, h: info.srcHeight || it.height || 1024, srcItemId: it.id };
      } else if (info.imageName) {
        // standalone item: the true source still sits in ComfyUI's input dir
        const blob = await inputBlob(info.imageName);
        state.vidRef = { name: info.imageName, url: URL.createObjectURL(blob), w: info.srcWidth || 1024, h: info.srcHeight || 1024, srcItemId: it.id };
      } else {
        missing.push('source image');
      }
    } catch { missing.push('source image'); }
  } else {
    state.customDims = true;
    state.width = info.width || 704;
    state.height = info.height || 1280;
    renderAspects();
    renderDims();
  }

  // Audio (already trimmed at original upload -> reused as-is, no re-upload)
  if (info.audioName) {
    try {
      const raw = await (await inputBlob(info.audioName)).arrayBuffer();
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await audioCtx.decodeAudioData(raw.slice(0));
      state.vidAudio = {
        raw, buffer,
        duration: buffer.duration,
        trimStart: 0,
        trimEnd: buffer.duration,
        uploadedName: info.audioName,
        uploadedKey: `0.00-${buffer.duration.toFixed(2)}`,
        label: 'reused audio',
      };
      $('#vidAudioChip').classList.add('active');
      $('#vidAudioChip').textContent = '🎵 Audio ✓';
      $('#vidAudioTrim').hidden = false;
      requestAnimationFrame(() => { if (waveRedraw.vidAudio) waveRedraw.vidAudio(); });
    } catch { missing.push('audio'); }
  }

  // End frame
  if (info.endImageName) {
    try {
      const blob = await inputBlob(info.endImageName);
      state.vidEnd = { name: info.endImageName, url: URL.createObjectURL(blob) };
    } catch { missing.push('end frame'); }
  }
  if (endFrameRefresh.vidEnd) endFrameRefresh.vidEnd();

  // Motion video (SCAIL) + its trim window
  if (engine === 'scail' && info.driveVideoName) {
    try {
      const blob = await inputBlob(info.driveVideoName);
      const urlObj = URL.createObjectURL(blob);
      const d = { name: info.driveVideoName, url: urlObj, label: 'reused motion video' };
      state.vidDrive = d;
      $('#vidDriveLabel').textContent = d.label;
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.src = urlObj;
      probe.onloadedmetadata = () => {
        d.dur = probe.duration || 0;
        const s = Math.min(info.driveStartSeconds || 0, d.dur);
        d.trimStart = s;
        d.trimEnd = info.driveDurSeconds ? Math.min(d.dur, s + info.driveDurSeconds) : d.dur;
        renderVidDrive();
      };
    } catch { missing.push('motion video'); }
  }

  renderLoras();
  renderVidAttach();
  updateVideoPanels();
  saveForm();
  toast(missing.length
    ? `Settings loaded — couldn't restore: ${missing.join(', ')} (re-add manually)`
    : 'Video settings + inputs loaded in the Video tab');
}

$('#reuseEnhanced').addEventListener('click', () => {
  $('#reuseSheet').classList.remove('show');
  if (state.reuseTarget) reuseItem(state.reuseTarget, true);
});
$('#reuseOriginal').addEventListener('click', () => {
  $('#reuseSheet').classList.remove('show');
  if (state.reuseTarget) reuseItem(state.reuseTarget, false);
});

function downloadItem(it, variant) {
  const a = document.createElement('a');
  const useUpscaled = variant === 'upscaled' || (variant !== 'original' && it.upscaled);
  const suffix = useUpscaled ? '_upscaled' : '_original';
  a.href = '/images/' + (useUpscaled ? it.upscaled : it.file);
  a.download = (it.prompt || 'kreastudio').slice(0, 40).replace(/[^\w]+/g, '_') + suffix + '.png';
  a.click();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------ */
/* Compare                                                             */
/* ------------------------------------------------------------------ */

function openCompare(it) {
  $('#compare').classList.add('show');
  $('#cmpA').src = '/images/' + it.file;
  $('#cmpB').src = '/images/' + it.upscaled;
  setCompare(50);
  try { history.pushState({ cmp: 1 }, ''); } catch { /* noop */ }
}
function setCompare(pct) {
  pct = Math.max(0, Math.min(100, pct));
  $('#cmpB').style.clipPath = `inset(0 0 0 ${pct}%)`;
  $('#cmpDivider').style.left = pct + '%';
}
(() => {
  const stage = $('#cmpStage');
  let dragging = false;
  const move = (x) => {
    const r = stage.getBoundingClientRect();
    setCompare(((x - r.left) / r.width) * 100);
  };
  stage.addEventListener('pointerdown', (e) => { dragging = true; stage.setPointerCapture(e.pointerId); move(e.clientX); });
  stage.addEventListener('pointermove', (e) => { if (dragging) move(e.clientX); });
  stage.addEventListener('pointerup', () => { dragging = false; });
})();
$('#cmpClose').addEventListener('click', () => {
  $('#compare').classList.remove('show');
  if (window.history.state && window.history.state.cmp) {
    try { history.back(); } catch { /* noop */ }
  }
});

/* ------------------------------------------------------------------ */
/* Upscale sheet                                                       */
/* ------------------------------------------------------------------ */

function openUpscaleSheet(it) {
  state.upscaleTarget = it;
  $('#upUltimatePrompt').value = '';
  renderUpscaleMode();
  $('#upscaleSheet').classList.add('show');
}
function renderUpscaleMode() {
  const engine = $('#upEngineChips .chip.active').dataset.engine || 'seedvr2';
  const ultimate = engine === 'ultimate';
  const mode = $('#upModeChips .chip.active').dataset.mode || 'resolution';
  const scale = ultimate || mode === 'scale';
  $('#upModeField').hidden = ultimate;
  $('#upModeChips').hidden = ultimate;
  $('#upTargetField').hidden = scale || ultimate;
  $('#upResChips').hidden = scale || ultimate;
  $('#upScaleField').hidden = !scale;
  $('#upScaleChips').hidden = !scale;
  $('#upProfileField').hidden = ultimate;
  $('#upProfileChips').hidden = ultimate;
  $('#upNoiseField').hidden = ultimate;
  $('#upNoiseChips').hidden = ultimate;
  $('#upPreField').hidden = ultimate;
  $('#upPreChips').hidden = ultimate;
  $('#upUltimatePromptField').hidden = !ultimate;
}
$$('#upEngineChips .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#upEngineChips .chip').forEach((x) => x.classList.remove('active'));
  c.classList.add('active');
  renderUpscaleMode();
}));
$$('#upModeChips .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#upModeChips .chip').forEach((x) => x.classList.remove('active'));
  c.classList.add('active');
  renderUpscaleMode();
}));
$$('#upResChips .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#upResChips .chip').forEach((x) => x.classList.remove('active'));
  c.classList.add('active');
}));
$$('#upScaleChips .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#upScaleChips .chip').forEach((x) => x.classList.remove('active'));
  c.classList.add('active');
}));
$$('#upPreChips .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#upPreChips .chip').forEach((x) => x.classList.remove('active'));
  c.classList.add('active');
}));
$$('#upProfileChips .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#upProfileChips .chip').forEach((x) => x.classList.remove('active'));
  c.classList.add('active');
}));
$$('#upNoiseChips .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#upNoiseChips .chip').forEach((x) => x.classList.remove('active'));
  c.classList.add('active');
}));
$('#upscaleGo').addEventListener('click', async () => {
  const it = state.upscaleTarget;
  if (!it) return;
  const engine = $('#upEngineChips .chip.active').dataset.engine || 'seedvr2';
  const upscaleMode = $('#upModeChips .chip.active').dataset.mode || 'resolution';
  const resolution = Number($('#upResChips .chip.active').dataset.res);
  const scaleFactor = Number($('#upScaleChips .chip.active').dataset.scale);
  const preScale = Number($('#upPreChips .chip.active').dataset.pre);
  const profile = $('#upProfileChips .chip.active').dataset.profile || 'sharp';
  const noise = $('#upNoiseChips .chip.active').dataset.noise || 'low';
  const prompt = $('#upUltimatePrompt').value.trim();
  $('#upscaleSheet').classList.remove('show');
  try {
    state.upscaling.add(it.id);
    renderGrid();
    if (state.currentItem && state.currentItem.id === it.id) openLightbox(it.id);
    await api('/api/upscale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: it.id, engine, upscaleMode, resolution, scaleFactor, preScale, profile, noise, prompt }),
    });
    toast(engine === 'ultimate' ? 'Upscale queued - Ultimate SD' : 'Upscale queued - SeedVR2');
  } catch (e) {
    state.upscaling.delete(it.id);
    renderGrid();
    toast(e.message, true);
  }
});

/* ------------------------------------------------------------------ */
/* Move sheet                                                          */
/* ------------------------------------------------------------------ */

function openMoveSheet(target) {
  // target: a single item object (from the lightbox) or an array of ids (multi-select)
  const multi = Array.isArray(target);
  const ids = multi ? target : [target.id];
  const currentFolder = multi ? undefined : (target.folder || null);
  state.moveTarget = target;
  const chips = $('#moveChips');
  chips.innerHTML = '';
  const all = [{ id: null, name: 'No folder' }, ...state.folders];
  for (const f of all) {
    const b = document.createElement('button');
    b.className = 'chip' + (currentFolder !== undefined && currentFolder === f.id ? ' active' : '');
    b.textContent = f.locked ? `Locked ${f.name}` : f.name;
    b.addEventListener('click', async () => {
      try {
        await Promise.all(ids.map((id) => api(`/api/item/${id}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: f.id }),
        })));
        $('#moveSheet').classList.remove('show');
        if (multi) exitSelect();
        await refreshGallery();
        const what = ids.length > 1 ? `${ids.length} images` : 'Image';
        toast(f.id ? `${what} moved to ${f.name}` : `${what} removed from folder`);
      } catch (e) { toast(e.message, true); }
    });
    chips.appendChild(b);
  }
  $('#moveSheet').classList.add('show');
}
$('#newFolderBtn').addEventListener('click', async () => {
  const name = $('#newFolderName').value.trim();
  if (!name) return;
  try {
    const folder = await api('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    $('#newFolderName').value = '';
    await refreshGallery(true);
    if (state.moveTarget) openMoveSheet(state.moveTarget);
    else toast(`Folder "${folder.name}" created`);
  } catch (e) { toast(e.message, true); }
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

$('#settingsBtn').addEventListener('click', async () => {
  try {
    const s = await api('/api/settings');
    $('#setComfy').value = s.comfyUrl;
    $('#galleryPasswordInput').value = s.galleryPassword || '1234';
    $('#setUnet').value = s.unet;
    $('#setClip').value = s.clip;
    $('#setVae').value = s.vae;
    $('#setKlein4Unet').value = s.klein4Unet || s.kleinUnet || '';
    $('#setKlein4Clip').value = s.klein4Clip || s.kleinClip || '';
    $('#setKlein9Unet').value = s.klein9Unet || '';
    $('#setKlein9Clip').value = s.klein9Clip || '';
    $('#setKleinVae').value = s.kleinVae || '';
    $('#setQeUnet').value = s.qwenEditUnet || '';
    $('#setQeClip').value = s.qwenEditClip || '';
    $('#setQeLora').value = s.qwenEditLora || '';
    $('#setDit').value = s.seedvr2Dit;
    $('#setSvVae').value = s.seedvr2Vae;
    $('#setSvAttn').value = s.seedvr2Attention || 'sdpa';
    $('#setSysPrompt').value = s.systemPrompt || '';
    $('#setLtxCkpt').value = s.ltxCkpt || '';
    $('#setLtxLora').value = s.ltxDistilledLora || '';
    $('#setLtxTe').value = s.ltxTextEncoder || '';
    $('#setLtxGemmaLora').value = s.ltxGemmaLora || '';
    $('#setLtxUps').value = s.ltxUpscaler || '';
    $('#setWanHigh').value = s.wanHighUnet || '';
    $('#setWanLow').value = s.wanLowUnet || '';
    $('#setWanClip').value = s.wanClip || '';
    $('#setWanVae').value = s.wanVae || '';
    $('#setWanHighLora').value = s.wanHighLora || '';
    $('#setWanLowLora').value = s.wanLowLora || '';
    $('#setErosCkpt').value = s.erosCkpt || '';
    $('#setErosTe').value = s.erosTextEncoder || '';
    $('#setErosDmd').value = s.erosDmdLora || '';
    $('#setErosSigF').value = s.erosSigmasFirst || '';
    $('#setErosSigU').value = s.erosSigmasUpscale || '';
    $('#setScailUnet').value = s.scailUnet || '';
    $('#setScailLora').value = s.scailLora || '';
    $('#setScailCv').value = s.scailClipVision || '';
    $('#setScailSam').value = s.scailSam || '';
  } catch { /* noop */ }
  $('#settingsSheet').classList.add('show');
  renderHealth();
});

$('#settingsSave').addEventListener('click', async () => {
  try {
    await api('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comfyUrl: $('#setComfy').value,
          galleryPassword: $('#galleryPasswordInput').value.trim() || '1234',
          unet: $('#setUnet').value,
        clip: $('#setClip').value,
        vae: $('#setVae').value,
        kleinUnet: $('#setKlein4Unet').value,
        kleinClip: $('#setKlein4Clip').value,
        klein4Unet: $('#setKlein4Unet').value,
        klein4Clip: $('#setKlein4Clip').value,
        klein9Unet: $('#setKlein9Unet').value,
        klein9Clip: $('#setKlein9Clip').value,
        kleinVae: $('#setKleinVae').value,
        qwenEditUnet: $('#setQeUnet').value,
        qwenEditClip: $('#setQeClip').value,
        qwenEditLora: $('#setQeLora').value,
        seedvr2Dit: $('#setDit').value,
        seedvr2Vae: $('#setSvVae').value,
        seedvr2Attention: $('#setSvAttn').value,
        systemPrompt: $('#setSysPrompt').value,
        ltxCkpt: $('#setLtxCkpt').value,
        ltxDistilledLora: $('#setLtxLora').value,
        ltxTextEncoder: $('#setLtxTe').value,
        ltxGemmaLora: $('#setLtxGemmaLora').value,
        ltxUpscaler: $('#setLtxUps').value,
        wanHighUnet: $('#setWanHigh').value,
        wanLowUnet: $('#setWanLow').value,
        wanClip: $('#setWanClip').value,
        wanVae: $('#setWanVae').value,
        wanHighLora: $('#setWanHighLora').value,
        wanLowLora: $('#setWanLowLora').value,
        erosCkpt: $('#setErosCkpt').value,
        erosTextEncoder: $('#setErosTe').value,
        erosDmdLora: $('#setErosDmd').value,
        erosSigmasFirst: $('#setErosSigF').value,
        erosSigmasUpscale: $('#setErosSigU').value,
        scailUnet: $('#setScailUnet').value,
        scailLora: $('#setScailLora').value,
        scailClipVision: $('#setScailCv').value,
        scailSam: $('#setScailSam').value,
      }),
    });
    toast('Settings saved');
    await loadMeta(true);
    renderHealth();
  } catch (e) { toast(e.message, true); }
});

let lastMeta = null;
async function loadMeta(refresh) {
  try {
    lastMeta = await api('/api/meta' + (refresh ? '?refresh=1' : ''));
    state.connOk = lastMeta.ok;
    state.metaLoras = lastMeta.loras || [];
    state.metaLorasInfo = lastMeta.lorasInfo || {};
    $('#connDot').className = 'conn-dot ' + (lastMeta.ok ? 'ok' : 'bad');
    renderLoras();
  } catch {
    state.connOk = false;
    $('#connDot').className = 'conn-dot bad';
  }
}

function renderHealth() {
  const el = $('#healthList');
  if (!lastMeta) { el.innerHTML = ''; return; }
  if (!lastMeta.ok) {
    el.innerHTML = `<span class="bad">● Can't reach ComfyUI</span> — ${escapeHtml(lastMeta.error || '')}<br>Make sure ComfyUI is running on the desktop.`;
    return;
  }
  const rows = [`<span class="ok">● Connected</span> — ${state.metaLoras.length} LoRAs found`];
  const labels = { core: 'Core nodes', enhance: 'Prompt enhance (TextGenerate)', klein: 'Edit (Flux 2 Klein) nodes', qwenedit: 'Edit (Qwen Image Edit) nodes', upscale: 'SeedVR2 nodes', ultimateupscale: 'Ultimate SD Upscale nodes', video: 'LTX 2.3 video nodes', video4k: 'RTX 4K pass (optional)', wan: 'Wan 2.2 nodes', eros: '10Eros DMD nodes', scail: 'SCAIL 2 motion transfer nodes' };
  for (const [group, missing] of Object.entries(lastMeta.missing || {})) {
    rows.push(missing.length
      ? `<span class="bad">●</span> ${labels[group]}: missing ${missing.map(escapeHtml).join(', ')}`
      : `<span class="ok">●</span> ${labels[group]}: OK`);
  }
  const fieldLabels = { unet: 'UNET', clip: 'text encoder', vae: 'VAE', lora: 'LoRA' };
  for (const engine of Object.values(lastMeta.models || {})) {
    const checks = Object.entries(engine).filter(([, v]) => v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'ok'));
    const missing = checks.filter(([, v]) => !v.ok);
    rows.push(missing.length
      ? `<span class="bad">●</span> ${escapeHtml(engine.label)} models: missing ${missing.map(([k, v]) => `${fieldLabels[k] || k} ${escapeHtml(v.name || '')}`).join(', ')}`
      : `<span class="ok">●</span> ${escapeHtml(engine.label)} models: OK`);
  }
  el.innerHTML = rows.join('<br>');
}

/* ------------------------------------------------------------------ */
/* Sheet close buttons                                                 */
/* ------------------------------------------------------------------ */

$$('.sheet').forEach((sheet) => {
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.classList.remove('show'); });
  sheet.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => sheet.classList.remove('show')));
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

loadForm();
markEngineRow('editEngineRow', state.editEngine);
updatePromptClear();
computeDims();
renderEnhance();
renderAspects();
renderDims();
renderLoras();
renderRefs();
setView('create');
connectEvents();
loadMeta();
refreshGallery(true);
setInterval(() => loadMeta(), 30000);
refreshQueue().catch(() => { /* noop */ });
setInterval(() => { refreshQueue().catch(() => { /* noop */ }); }, 15000);
