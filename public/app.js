/* KreaStudio front-end — mobile-first, Modatory design language */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const CameraSettings = window.KreaCameraSettings;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  view: 'create',            // create | video | edit | gallery
  createMode: 'image',       // image | region | video (nested under Create)
  enhance: true,
  aspect: '1:1',
  mp: 1,
  width: 1024,
  height: 1024,
  customDims: false,
  editAspectOverride: false,
  editAspect: '1:1',
  editWidth: 1024,
  editHeight: 1024,
  editUpscaleEnabled: false,
  editUpscaleResolution: 2160,
  editUpscaleProfile: 'sharp',
  editUpscaleNoise: 'low',
  editUpscaleExpanded: false,
  editSequential: false,
  createUpscaleEnabled: false,
  createUpscaleResolution: 2160,
  createUpscaleProfile: 'sharp',
  createUpscaleNoise: 'low',
  createUpscaleExpanded: false,
  qwenAngles: [],
  qwenAnglesMode: false,
  qwenAngleElevation: 'eye-level',
  qwenAngleDistance: 'medium shot',
  prompts: { create: '', edit: '', video: '' }, // per-tab prompt text
  loras: [],                 // {name, strength, on} - Create tab (Krea 2)
  videoLoras: [],            // {name, strength, on} - Video tab (LTX/Wan)
  editLoras: [],             // {name, strength, on} - Edit tab (Klein/Qwen)
  editLorasByEngine: {},     // remembered independently for each edit model
  editEngine: 'klein4',
  refs: [null, null, null],  // {name(comfy), url(local preview)}
  createRef: null,           // optional Krea 2 image-to-image source
  createImageGuideOpen: false,
  createMatchSource: false,
  createInfluence: 55,       // 0-100; mapped inversely to sampler denoise
  krea2Turbo: true,          // merged Turbo checkpoint vs Raw checkpoint
  krea2RawTurboLora: null,   // managed Raw-mode Turbo LoRA, preserved while hidden
  krea2SamplingReady: false,
  regions: [],
  activeRegionId: null,
  kreaMask: null,
  kreaMaskPreview: null,
  kreaMaskDirty: false,
  kreaMaskErase: false,
  kreaMaskTool: 'smart',
  kreaMaskKind: null,
  kreaBrush: 48,
  kreaMaskFeather: 8,
  editMaskInfluence: 78,
  editMaskExpand: 14,
  kreaMaskInvert: false,
  kreaMaskPoints: [],
  kreaMaskPointForeground: true,
  kreaMaskPointDeleteMode: false,
  kreaMaskPreviewCutout: false,
  vidRef: null,              // {name, url, w, h} - Video tab source image
  folders: [],
  items: [],
  privateUnlocked: false,
  activeFolder: 'all',
  mediaFilter: 'all',
  likesOnly: false,
  libraryQuery: '',
  metaLoras: [],
  metaLorasInfo: {},
  loraContext: {},
  contextOverrides: {},
  userDefaults: {
    create: { steps: 12, cfg: 1, batch: 1 },
    edit: { steps: 4, cfg: 1, batch: 1, denoise: 0.4 },
    video: { duration: 5, motionFreedom: 35 },
    seed: { mode: 'random', value: 0 },
  },
  cameraSettings: CameraSettings ? Object.assign({}, CameraSettings.DEFAULT_CAMERA_SETTINGS) : {},
  showAllLoras: false,
  activeJobs: new Set(),
  compositeJobs: new Map(), // prompt id -> parent item + composite type
  upscaling: new Set(),      // item ids
  animating: new Set(),      // item ids
  animateTarget: null,
  animateRouteTarget: null,
  currentItem: null,
  upscaleTarget: null,
  moveTarget: null,
  selectMode: false,
  selected: new Set(),
  connOk: false,
  features: {},              // machine-level installer choices, all on by default
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

const QWEN_ANGLE_VIEWS = [
  { id: 'front-left', label: 'Front left' },
  { id: 'front', label: 'Front' },
  { id: 'front-right', label: 'Front right' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'back-left', label: 'Back left' },
  { id: 'back', label: 'Back' },
  { id: 'back-right', label: 'Back right' },
];
const QWEN_ANGLE_IDS = new Set(QWEN_ANGLE_VIEWS.map((view) => view.id));
const QWEN_ANGLE_ELEVATIONS = [
  { id: 'low-angle', label: 'Low' },
  { id: 'eye-level', label: 'Eye level' },
  { id: 'elevated', label: 'Elevated' },
  { id: 'high-angle', label: 'High' },
];
const QWEN_ANGLE_DISTANCES = [
  { id: 'close-up', label: 'Close' },
  { id: 'medium shot', label: 'Medium' },
  { id: 'wide shot', label: 'Wide' },
];
const EDIT_ENGINES = ['klein4', 'klein9', 'qwen', 'krea2', 'krea2ref'];
const SEQUENTIAL_EDIT_ENGINES = new Set(['klein4', 'klein9', 'qwen', 'krea2ref']);
const EDIT_MASK_ENGINES = new Set(['klein4', 'klein9', 'qwen', 'krea2']);
const EDIT_FEATURES = { klein4: 'edit.klein4', klein9: 'edit.klein9', qwen: 'edit.qwen', krea2: 'edit.krea2', krea2ref: 'edit.krea2ref' };
const VIDEO_FEATURES = { ltx: 'video.ltx', 'ltx-edit': 'video.ltxEdit', eros: 'video.eros', wan: 'video.wan', scail: 'video.scail' };

function featureEnabled(key) { return state.features[key] !== false; }
function enabledEditEngines() { return EDIT_ENGINES.filter((engine) => featureEnabled(EDIT_FEATURES[engine])); }
function enabledVideoEngines() { return Object.keys(VIDEO_FEATURES).filter((engine) => featureEnabled(VIDEO_FEATURES[engine])); }

function renderFeatureVisibility() {
  const editEngines = enabledEditEngines();
  const videoEngines = enabledVideoEngines();
  const hasEdit = editEngines.length > 0;
  const hasVideo = videoEngines.length > 0;
  $$('[data-feature-engine]').forEach((button) => {
    button.hidden = !featureEnabled(button.dataset.featureEngine);
  });
  $$('[data-feature-view="edit"]').forEach((button) => { button.hidden = !hasEdit; });
  $$('[data-feature-view="video"]').forEach((button) => { button.hidden = !hasVideo; });
  $$('#animEngineRow .chip[data-engine]').forEach((button) => {
    button.hidden = !featureEnabled(VIDEO_FEATURES[button.dataset.engine]);
  });
  if (editEngines.length && !editEngines.includes(state.editEngine)) switchEditEngine(editEngines[0]);
  if (videoEngines.length && !videoEngines.includes(state.vidEngine)) state.vidEngine = videoEngines[0];
  if (videoEngines.length && !videoEngines.includes(state.animEngine)) state.animEngine = videoEngines[0];
  markEngineRow('editEngineRow', state.editEngine);
  markEngineRow('vidEngineRow', state.vidEngine);
  markEngineRow('animEngineRow', state.animEngine);
  if (!hasEdit && state.view === 'edit') setView('create', { createMode: 'image' });
  if (!hasVideo && state.view === 'video') setView('create', { createMode: 'image' });
}

function editEngineId(engine) {
  return EDIT_ENGINES.includes(engine) ? engine : 'klein4';
}

function rememberEditLoras() {
  state.editLorasByEngine ||= {};
  state.editLorasByEngine[editEngineId(state.editEngine)] = state.editLoras;
}

function switchEditEngine(engine) {
  const next = editEngineId(engine);
  rememberEditLoras();
  state.editEngine = next;
  state.editLoras = Array.isArray(state.editLorasByEngine[next]) ? state.editLorasByEngine[next] : [];
  state.editLorasByEngine[next] = state.editLoras;
}

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
  if (!res.ok) {
    if (res.status === 401 && data.code === 'auth') showProfileGate();
    throw new Error(data.error || `${path} failed (${res.status})`);
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* Prompt composer + image references                                  */
/* ------------------------------------------------------------------ */

let promptSelectionRange = null;

function promptDraft() {
  return $('#prompt').value || '';
}

function promptForGeneration() {
  return promptDraft().replace(/@image-(\d+)/g, 'image $1');
}

function refForPromptToken(index) {
  return state.refs[Number(index) - 1] || null;
}

function makePromptReferenceToken(index) {
  const ref = refForPromptToken(index);
  const token = document.createElement('span');
  token.className = 'prompt-ref-token';
  token.contentEditable = 'false';
  token.dataset.refIndex = String(index);
  token.title = `Reference image ${index}`;

  if (ref && (ref.url || ref.displayUrl)) {
    const img = document.createElement('img');
    img.src = ref.displayUrl || ref.url;
    img.alt = '';
    token.appendChild(img);
  }
  const label = document.createElement('b');
  label.textContent = `Image ${index}`;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'prompt-ref-remove';
  remove.dataset.removePromptRef = String(index);
  remove.setAttribute('aria-label', `Remove image ${index} from prompt`);
  remove.textContent = '×';
  token.append(label, remove);
  return token;
}

function renderPromptComposer() {
  const composer = $('#promptComposer');
  if (!composer) return;
  const value = promptDraft();
  const parts = value.split(/(@image-\d+)/g);
  composer.replaceChildren();
  parts.forEach((part) => {
    const match = /^@image-(\d+)$/.exec(part);
    if (match) composer.appendChild(makePromptReferenceToken(match[1]));
    else if (part) composer.appendChild(document.createTextNode(part));
  });
}

function composerNodeText(node, root) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node;
  if (el.classList.contains('prompt-ref-token')) return `@image-${el.dataset.refIndex}`;
  if (el.tagName === 'BR') return '\n';
  const text = [...el.childNodes].map((child) => composerNodeText(child, root)).join('');
  return el !== root && /^(DIV|P)$/.test(el.tagName) ? `${text}\n` : text;
}

function promptDraftFromComposer() {
  const composer = $('#promptComposer');
  return [...composer.childNodes].map((node) => composerNodeText(node, composer)).join('').replace(/\n$/, '');
}

function setPromptDraft(value, { render = true } = {}) {
  $('#prompt').value = value || '';
  if (render) renderPromptComposer();
  if ($('#editSequenceBtn')) renderEditSequence();
}

function syncPromptDraftFromComposer() {
  setPromptDraft(promptDraftFromComposer(), { render: false });
  if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) state.prompts[state.view] = promptDraft();
  updatePromptClear();
  renderPromptSuggestions();
  saveForm();
}

function capturePromptSelection() {
  const composer = $('#promptComposer');
  const selection = window.getSelection();
  if (!composer || !selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (composer.contains(range.commonAncestorContainer)) promptSelectionRange = range.cloneRange();
}

function placePromptCaretAfter(node) {
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertPromptReference(index) {
  const composer = $('#promptComposer');
  composer.focus();
  const selection = window.getSelection();
  const range = promptSelectionRange && composer.contains(promptSelectionRange.commonAncestorContainer)
    ? promptSelectionRange : document.createRange();
  if (!promptSelectionRange || !composer.contains(promptSelectionRange.commonAncestorContainer)) range.selectNodeContents(composer), range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  range.deleteContents();
  const token = makePromptReferenceToken(index);
  const space = document.createTextNode(' ');
  range.insertNode(space);
  range.insertNode(token);
  placePromptCaretAfter(space);
  promptSelectionRange = null;
  syncPromptDraftFromComposer();
}

function renderPromptMentionPicker() {
  const list = $('#promptMentionList');
  list.replaceChildren();
  const refs = state.refs.map((ref, index) => ({ ref, index })).filter(({ ref }) => ref);
  if (!refs.length) {
    list.innerHTML = '<div class="prompt-mention-empty">Add a reference image above first, then type <b>@</b> here to place it in the prompt.</div>';
    return;
  }
  refs.forEach(({ ref, index }) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'prompt-mention-option';
    const img = document.createElement('img');
    img.src = ref.displayUrl || ref.url;
    img.alt = '';
    const copy = document.createElement('span');
    copy.innerHTML = `<b>Image ${index + 1}</b><small>Insert reference into prompt</small>`;
    const add = document.createElement('i');
    add.textContent = '+';
    option.append(img, copy, add);
    option.addEventListener('click', () => {
      $('#promptMentionSheet').classList.remove('show');
      insertPromptReference(index + 1);
    });
    list.appendChild(option);
  });
}

function openPromptMentionPicker() {
  capturePromptSelection();
  renderPromptMentionPicker();
  $('#promptMentionSheet').classList.add('show');
}

/* ------------------------------------------------------------------ */
/* Profiles (accounts)                                                 */
/* ------------------------------------------------------------------ */

let profileGateOpen = false;
let gateProfiles = [];

function avatarHtml(p, cls, idx) {
  if (p.avatar) return `<span class="${cls}"><img src="/avatars/${p.avatar}" alt="" /></span>`;
  const grad = `tile-grad-${(idx == null ? (p.name || '?').length : idx) % 5}`;
  return `<span class="${cls} ${grad}">${escapeHtml((p.name || '?')[0].toUpperCase())}</span>`;
}

async function showProfileGate() {
  if (profileGateOpen) return;
  profileGateOpen = true;
  $('#profileGate').hidden = false;
  try {
    const r = await fetch('/api/profiles').then((x) => x.json());
    gateProfiles = r.profiles || [];
  } catch { gateProfiles = []; }
  renderGateTiles();
}

function renderGateTiles() {
  const list = $('#profileList');
  list.innerHTML = '';
  gateProfiles.forEach((p, i) => {
    const tile = document.createElement('button');
    tile.className = 'profile-tile';
    tile.innerHTML = `${avatarHtml(p, 'tile-img', i)}<span class="tile-name">${escapeHtml(p.name)}${p.hasPin ? ' 🔒' : ''}</span>`;
    tile.addEventListener('click', () => loginProfile(p));
    list.appendChild(tile);
  });
  const add = document.createElement('button');
  add.className = 'profile-tile add';
  add.innerHTML = '<span class="tile-img">＋</span><span class="tile-name">Add profile</span>';
  add.addEventListener('click', () => {
    $('#profileNewForm').hidden = false;
    $('#newProfileName').focus();
  });
  list.appendChild(add);
}

async function loginProfile(p) {
  let pin = '';
  if (p.hasPin) {
    pin = window.prompt(`PIN for ${p.name}`) || '';
    if (!pin) return;
  }
  try {
    const r = await api(`/api/profiles/${p.id}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    localStorage.setItem('ks-profile-id', r.profile.id);
    location.reload();
  } catch (e) { toast(e.message, true); }
}

$('#newProfileCancel').addEventListener('click', () => { $('#profileNewForm').hidden = true; });
$('#newProfileBtn').addEventListener('click', async () => {
  const name = $('#newProfileName').value.trim();
  if (!name) return toast('Give the profile a name', true);
  try {
    const r = await api('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin: $('#newProfilePin').value.trim() }),
    });
    localStorage.setItem('ks-profile-id', r.profile.id);
    location.reload();
  } catch (e) { toast(e.message, true); }
});

function renderProfileChip() {
  const btn = $('#profileBtn');
  if (!state.profile) { btn.hidden = true; return; }
  btn.hidden = false;
  btn.textContent = `👤 ${state.profile.name}`;
}

$('#profileBtn').addEventListener('click', () => {
  const isOwner = state.profile && state.profileIsOwner;
  openActionMenu($('#profileBtn'), [
    { label: '✎ Edit profile', action: openProfileEdit },
    isOwner ? { label: '👥 Manage profiles', action: openProfileManage } : null,
    { label: '⇄ Switch profile', action: switchProfile },
  ]);
});

async function switchProfile() {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* noop */ }
  localStorage.removeItem('ks-profile-id');
  location.reload();
}

/* --- edit own profile: name, PIN, photo, delete --- */
function openProfileEdit() {
  if (!state.profile) return;
  $('#peName').value = state.profile.name;
  $('#pePin').value = '';
  $('#pePin').placeholder = state.profile.hasPin ? 'PIN set — type a new one or leave empty to remove' : 'No PIN — type one to add';
  $('#peAvatar').className = 'profile-avatar-lg' + (state.profile.avatar ? '' : ` tile-grad-${(state.profile.name || '?').length % 5}`);
  $('#peAvatar').innerHTML = state.profile.avatar
    ? `<img src="/avatars/${state.profile.avatar}" alt="" />`
    : escapeHtml((state.profile.name || '?')[0].toUpperCase());
  $('#profileEditSheet').classList.add('show');
}

$('#peChangePhoto').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      // Square cover-crop to 512 client-side, then upload raw PNG
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('Could not read the image')); img.src = url; });
      const size = 512;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const s = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      c.getContext('2d').drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
      const blob = await new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Crop failed'))), 'image/png'));
      const r = await api(`/api/profiles/${state.profile.id}/avatar`, { method: 'POST', body: blob });
      state.profile = r.profile;
      renderProfileChip();
      openProfileEdit(); // refresh the preview
      toast('Profile photo updated');
    } catch (e) { toast(e.message, true); }
  });
  input.click();
});

$('#peSave').addEventListener('click', async () => {
  try {
    const body = { name: $('#peName').value.trim() };
    const pin = $('#pePin').value.trim();
    // Only send pin when the field was touched (typing clears the mystery)
    if (pin || $('#pePin').dataset.cleared === '1') body.pin = pin;
    const r = await api(`/api/profiles/${state.profile.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    state.profile = r.profile;
    renderProfileChip();
    $('#profileEditSheet').classList.remove('show');
    toast('Profile updated');
  } catch (e) { toast(e.message, true); }
});
$('#pePin').addEventListener('input', () => { $('#pePin').dataset.cleared = '1'; });

$('#peDelete').addEventListener('click', async () => {
  if (!window.confirm(`Delete "${state.profile.name}" and ALL of its generations, folders, presets and faces? This cannot be undone.`)) return;
  const typed = window.prompt(`Type the profile name (${state.profile.name}) to confirm deletion`);
  if (typed !== state.profile.name) return toast('Name did not match — nothing deleted');
  try {
    await api(`/api/profiles/${state.profile.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmName: typed }),
    });
    localStorage.removeItem('ks-profile-id');
    location.reload();
  } catch (e) { toast(e.message, true); }
});

/* --- owner: manage all profiles --- */
async function openProfileManage() {
  try {
    const r = await api('/api/profiles');
    const list = $('#profileManageList');
    list.innerHTML = '';
    (r.profiles || []).forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'pm-row';
      row.innerHTML = `${avatarHtml(p, 'pm-avatar', i)}<b>${escapeHtml(p.name)}${p.hasPin ? ' 🔒' : ''} · ${p.itemCount}</b>`;
      if (p.hasPin) {
        const clear = document.createElement('button');
        clear.className = 'chip';
        clear.textContent = 'Clear PIN';
        clear.addEventListener('click', async () => {
          if (!window.confirm(`Remove the PIN from "${p.name}"?`)) return;
          try {
            await api(`/api/profiles/${p.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: '' }),
            });
            openProfileManage();
          } catch (e) { toast(e.message, true); }
        });
        row.appendChild(clear);
      }
      if (p.id !== state.profile.id) {
        const del = document.createElement('button');
        del.className = 'chip';
        del.textContent = '🗑';
        del.addEventListener('click', async () => {
          if (!window.confirm(`Delete "${p.name}" and all of its content (${p.itemCount} items)?`)) return;
          const typed = window.prompt(`Type the profile name (${p.name}) to confirm`);
          if (typed !== p.name) return toast('Name did not match — nothing deleted');
          try {
            await api(`/api/profiles/${p.id}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ confirmName: typed }),
            });
            openProfileManage();
            toast(`${p.name} deleted`);
          } catch (e) { toast(e.message, true); }
        });
        row.appendChild(del);
      }
      list.appendChild(row);
    });
    $('#profileManageSheet').classList.add('show');
  } catch (e) { toast(e.message, true); }
}

async function checkAuth() {
  try {
    const me = await api('/api/me');
    state.profile = me.profile;
    if (localStorage.getItem('ks-profile-id') !== me.profile.id) {
      // Cookie changed (another tab / new sign-in): reload under the right key
      localStorage.setItem('ks-profile-id', me.profile.id);
      location.reload();
      return;
    }
    try {
      const all = await fetch('/api/profiles').then((x) => x.json());
      state.profileIsOwner = !!(all.profiles && all.profiles[0] && all.profiles[0].id === me.profile.id);
    } catch { state.profileIsOwner = false; }
    renderProfileChip();
    renderAppUpdateAccess();
    await loadUserPreferences();
  } catch {
    renderAppUpdateAccess(); // 401 -> api() already opened the gate
  }
}
checkAuth();

let actionMenuEl = null;
let actionMenuCleanup = null;
function actionIconMarkup(icon) {
  const paths = {
    use: '<path d="M5 4h7v2H7v11h11v-5h2v7H5V4Zm8 0h7v7h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H13V4Z"/>',
    video: '<path d="M4 6h11a2 2 0 0 1 2 2v2.2l4-2.4v8.4l-4-2.4V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm0 2v8h11V8H4Zm13 2.5v.9l2 1.2v-3.3l-2 1.2Z"/>',
    edit: '<path d="m5 16.7 9.9-9.9 3.3 3.3-9.9 9.9L4 20l1-3.3Zm11.3-11.3 1.1-1.1a2.1 2.1 0 0 1 3 3l-1.1 1.1-3-3Zm-2.8 2.8L6.7 15l-.3 1.1 1.1-.3 6.9-6.9-1-1Z"/>',
    reuse: '<path d="M18.5 7.5A7 7 0 0 0 6.7 6L4 8.7V5H2v7h7v-2H5.5l2.6-2.6a5 5 0 1 1 .1 7.1l-1.4 1.4a7 7 0 1 0 11.7-8.4Z"/>',
    original: '<path d="M12 4a8 8 0 1 0 7.7 10.2l-1.9-.6A6 6 0 1 1 12 6v4l5-5-5-5v4Zm-1 4h2v5l3.4 2-1 1.7-4.4-2.6V8Z"/>',
    motion: '<path d="M4 7h8V5l4 3-4 3V9H4V7Zm16 8H12v-2l-4 3 4 3v-2h8v-2Z"/>',
    'first-frame': '<path d="M5 5h15v14H5V5Zm2 2v10h11V7H7Zm-5 4h2v2H2v-2Zm7 4 2.7-3.2 2 2.1 1.5-1.8L17 15H9Z"/>',
    'last-frame': '<path d="M4 5h15v14H4V5Zm2 2v10h11V7H6Zm14 4h2v2h-2v-2ZM8 15l2.7-3.2 2 2.1 1.5-1.8L17 15H8Z"/>',
  };
  return `<svg class="action-glyph" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${paths[icon] || paths.use}</svg>`;
}

function closeActionMenu() {
  if (actionMenuCleanup) actionMenuCleanup();
  actionMenuCleanup = null;
  if (actionMenuEl) actionMenuEl.remove();
  actionMenuEl = null;
}

function openActionMenu(anchor, items, options = {}) {
  closeActionMenu();
  const menu = document.createElement('div');
  menu.className = 'action-menu' + (options.tone ? ` action-menu-${options.tone}` : '');
  menu.setAttribute('role', 'menu');
  if (options.menuTitle) {
    const head = document.createElement('div');
    head.className = 'action-menu-title';
    head.innerHTML = '<span class="action-menu-dot" aria-hidden="true"></span>';
    const label = document.createElement('span');
    label.textContent = options.menuTitle;
    head.appendChild(label);
    menu.appendChild(head);
  }
  for (const item of items.filter(Boolean)) {
    const b = document.createElement('button');
    b.className = 'action-menu-item' + (item.danger ? ' danger' : '') + (item.tone ? ` action-menu-item-${item.tone}` : '');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    const icon = document.createElement('span');
    icon.className = 'action-menu-icon';
    icon.innerHTML = actionIconMarkup(item.icon || 'use');
    const copy = document.createElement('span');
    copy.className = 'action-menu-copy';
    const label = document.createElement('span');
    label.textContent = item.label;
    copy.appendChild(label);
    if (item.detail) {
      const detail = document.createElement('small');
      detail.textContent = item.detail;
      copy.appendChild(detail);
    }
    b.append(icon, copy);
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
  anchor.setAttribute('aria-expanded', 'true');
  const onDoc = (e) => {
    if (!menu.contains(e.target) && !anchor.contains(e.target)) closeActionMenu();
  };
  const onKey = (e) => { if (e.key === 'Escape') closeActionMenu(); };
  setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
  document.addEventListener('keydown', onKey);
  actionMenuCleanup = () => {
    document.removeEventListener('pointerdown', onDoc);
    document.removeEventListener('keydown', onKey);
    anchor.setAttribute('aria-expanded', 'false');
  };
}

let sheetScrollY = 0;
function syncSheetScrollLock() {
  const anySheetOpen = $$('.sheet').some((sheet) => sheet.classList.contains('show')) || $('#appDrawer').classList.contains('show');
  const locked = document.body.classList.contains('sheet-open');
  if (anySheetOpen && !locked) {
    sheetScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${sheetScrollY}px`;
    document.body.classList.add('sheet-open');
  } else if (!anySheetOpen && locked) {
    document.body.classList.remove('sheet-open');
    document.body.style.top = '';
    window.scrollTo(0, sheetScrollY);
  }
}

/* ------------------------------------------------------------------ */
/* App drawer + desktop updates                                       */
/* ------------------------------------------------------------------ */

let appUpdateRunning = false;
let appDrawerCreateExpanded = true;

function renderAppDrawerNavigation() {
  const createActive = state.view === 'create' || state.view === 'video';
  const createButton = $('#drawerCreateBtn');
  createButton.classList.toggle('active', createActive);
  const expanded = createActive && appDrawerCreateExpanded;
  createButton.setAttribute('aria-expanded', String(expanded));
  const modes = $('#drawerCreateModes');
  modes.classList.toggle('is-collapsed', !expanded);
  modes.setAttribute('aria-hidden', String(!expanded));
  modes.inert = !expanded;
  $$('[data-drawer-create-mode]').forEach((button) => {
    button.classList.toggle('active', createActive && button.dataset.drawerCreateMode === state.createMode);
  });
  $$('[data-drawer-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.drawerView === state.view);
  });
}

function openAppDrawer() {
  closeActionMenu();
  renderAppDrawerNavigation();
  document.body.classList.add('app-drawer-open');
  $('#appDrawer').classList.add('show');
  $('#appDrawer').setAttribute('aria-hidden', 'false');
  $('#appMenuBtn').setAttribute('aria-expanded', 'true');
  syncSheetScrollLock();
  setTimeout(() => $('#appDrawerClose').focus(), 80);
}

function closeAppDrawer() {
  document.body.classList.remove('app-drawer-open');
  $('#appDrawer').classList.remove('show');
  $('#appDrawer').setAttribute('aria-hidden', 'true');
  $('#appMenuBtn').setAttribute('aria-expanded', 'false');
  syncSheetScrollLock();
  $('#appMenuBtn').focus();
}

function setAppUpdateStatus(message, tone) {
  const status = $('#appUpdateStatus');
  status.textContent = message;
  status.classList.toggle('good', tone === 'good');
  status.classList.toggle('bad', tone === 'bad');
}

function renderAppUpdateAccess() {
  const button = $('#appUpdateBtn');
  if (appUpdateRunning) return;
  const label = button.querySelector('.app-drawer-label');
  if (!state.profile) {
    button.disabled = true;
    label.textContent = 'Sign in to update';
    return;
  }
  if (!state.profileIsOwner) {
    button.disabled = true;
    label.textContent = 'Owner access required';
    setAppUpdateStatus('Switch to the owner profile to install updates.', 'bad');
    return;
  }
  button.disabled = false;
  label.textContent = 'Update app';
}

async function waitForAppRestart() {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const response = await fetch(`/api/meta?update-restart=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        location.reload();
        return;
      }
    } catch { /* server is between processes */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('The update installed, but the app did not come back online. Start MixBox Studio on the desktop.');
}

$('#appMenuBtn').addEventListener('click', openAppDrawer);
$('#appDrawerClose').addEventListener('click', closeAppDrawer);
$('#appDrawerBackdrop').addEventListener('click', closeAppDrawer);
$('#drawerCreateBtn').addEventListener('click', () => {
  const createActive = state.view === 'create' || state.view === 'video';
  if (!createActive) {
    appDrawerCreateExpanded = true;
    setCreateMode('image');
  } else {
    appDrawerCreateExpanded = !appDrawerCreateExpanded;
    renderAppDrawerNavigation();
  }
});
$$('[data-drawer-create-mode]').forEach((button) => button.addEventListener('click', () => {
  appDrawerCreateExpanded = true;
  const mode = button.dataset.drawerCreateMode;
  setCreateMode(mode, mode === 'region');
  closeAppDrawer();
}));
$$('[data-drawer-view]').forEach((button) => button.addEventListener('click', () => {
  appDrawerCreateExpanded = false;
  setView(button.dataset.drawerView);
  closeAppDrawer();
}));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('#appDrawer').classList.contains('show')) closeAppDrawer();
});

$('#appUpdateBtn').addEventListener('click', async () => {
  if (appUpdateRunning) return;
  const button = $('#appUpdateBtn');
  const label = button.querySelector('.app-drawer-label');
  appUpdateRunning = true;
  button.disabled = true;
  button.classList.add('busy');
  label.textContent = 'Checking for updates…';
  setAppUpdateStatus('Connecting to GitHub and checking the current branch…');
  try {
    const result = await api('/api/update', { method: 'POST' });
    button.classList.remove('busy');
    if (!result.updated) {
      setAppUpdateStatus(`MixBox Studio is up to date · ${result.version}`, 'good');
      appUpdateRunning = false;
      renderAppUpdateAccess();
      return;
    }
    if (result.restarting) {
      label.textContent = 'Restarting MixBox Studio…';
      setAppUpdateStatus(`Updated to ${result.version}. Waiting for the desktop app to restart…`, 'good');
      await waitForAppRestart();
      return;
    }
    label.textContent = 'Update installed';
    setAppUpdateStatus(`Updated to ${result.version}. Reloading the app…`, 'good');
    setTimeout(() => location.reload(), 800);
  } catch (error) {
    button.classList.remove('busy');
    setAppUpdateStatus(error.message, 'bad');
    appUpdateRunning = false;
    renderAppUpdateAccess();
  }
});

function round32(n) { return Math.max(64, Math.round(n / 32) * 32); }

function computeDims() {
  if (state.customDims) return;
  const a = ASPECTS.find((x) => x.label === state.aspect) || ASPECTS[0];
  const px = state.mp * 1e6;
  state.width = round32(Math.sqrt(px * a.ar));
  state.height = round32(Math.sqrt(px / a.ar));
}

/* Form state is per profile (prompts/regions/LoRAs shouldn't leak
   between accounts). The id is cached so loadForm can run synchronously. */
function formKey() {
  return 'ks-form-' + (localStorage.getItem('ks-profile-id') || 'default');
}

function saveForm() {
  try {
    rememberEditLoras();
    localStorage.setItem(formKey(), JSON.stringify({
      enhance: state.enhance, aspect: state.aspect, mp: state.mp,
      loras: state.loras, videoLoras: state.videoLoras, editLoras: state.editLoras, editLorasByEngine: state.editLorasByEngine, prompts: state.prompts,
      editEngine: state.editEngine, vidScailMode: state.vidScailMode,
      cameraSettings: state.cameraSettings,
      createMode: state.createMode,
      createRef: state.createRef ? {
        name: state.createRef.name, w: state.createRef.w, h: state.createRef.h, label: state.createRef.label,
      } : null,
      createImageGuideOpen: state.createImageGuideOpen,
      createMatchSource: state.createMatchSource,
      createInfluence: state.createInfluence,
      krea2Turbo: state.krea2Turbo,
      krea2RawTurboLora: state.krea2RawTurboLora,
      regions: state.regions,
      kreaBrush: state.kreaBrush,
      kreaMaskTool: state.kreaMaskTool,
      kreaMaskFeather: state.kreaMaskFeather,
      editMaskInfluence: state.editMaskInfluence,
      editMaskExpand: state.editMaskExpand,
      kreaMaskInvert: state.kreaMaskInvert,
      scailModeVersion: 2,
      vidScailStableTracking: state.vidScailStableTracking,
      vidScailChunkFrames: state.vidScailChunkFrames,
      vidScailChunkOverlap: state.vidScailChunkOverlap,
      customDims: state.customDims, width: state.width, height: state.height,
      editAspectOverride: state.editAspectOverride, editAspect: state.editAspect,
      editWidth: state.editWidth, editHeight: state.editHeight,
      editUpscaleEnabled: state.editUpscaleEnabled,
      editUpscaleResolution: state.editUpscaleResolution,
      editUpscaleProfile: state.editUpscaleProfile,
      editUpscaleNoise: state.editUpscaleNoise,
      editUpscaleExpanded: state.editUpscaleExpanded,
      editSequential: state.editSequential,
      createUpscaleEnabled: state.createUpscaleEnabled,
      createUpscaleResolution: state.createUpscaleResolution,
      createUpscaleProfile: state.createUpscaleProfile,
      createUpscaleNoise: state.createUpscaleNoise,
      createUpscaleExpanded: state.createUpscaleExpanded,
      qwenAngles: state.qwenAngles,
      qwenAngleElevation: state.qwenAngleElevation,
      qwenAngleDistance: state.qwenAngleDistance,
    }));
  } catch { /* noop */ }
}
function loadForm() {
  try {
    const f = JSON.parse(localStorage.getItem(formKey()) || localStorage.getItem('ks-form') || 'null');
    if (!f) return;
    state.enhance = f.enhance !== false;
    state.aspect = f.aspect || '1:1';
    state.mp = f.mp || 1;
    state.editAspectOverride = f.editAspectOverride === true;
    state.editAspect = ASPECTS.some((a) => a.label === f.editAspect) ? f.editAspect : '1:1';
    state.editWidth = round32(Number(f.editWidth) || 1024);
    state.editHeight = round32(Number(f.editHeight) || 1024);
    state.editUpscaleEnabled = f.editUpscaleEnabled === true;
    state.editUpscaleResolution = [1440, 2160, 3840].includes(Number(f.editUpscaleResolution)) ? Number(f.editUpscaleResolution) : 2160;
    state.editUpscaleProfile = f.editUpscaleProfile === 'balanced' ? 'balanced' : 'sharp';
    state.editUpscaleNoise = ['off', 'low', 'medium'].includes(f.editUpscaleNoise) ? f.editUpscaleNoise : 'low';
    state.editUpscaleExpanded = f.editUpscaleExpanded === true;
    state.editSequential = f.editSequential === true;
    state.createUpscaleEnabled = f.createUpscaleEnabled === true;
    state.createUpscaleResolution = [1440, 2160, 3840].includes(Number(f.createUpscaleResolution)) ? Number(f.createUpscaleResolution) : 2160;
    state.createUpscaleProfile = f.createUpscaleProfile === 'balanced' ? 'balanced' : 'sharp';
    state.createUpscaleNoise = ['off', 'low', 'medium'].includes(f.createUpscaleNoise) ? f.createUpscaleNoise : 'low';
    state.createUpscaleExpanded = f.createUpscaleExpanded === true;
    state.qwenAngles = Array.isArray(f.qwenAngles) ? [...new Set(f.qwenAngles.filter((id) => QWEN_ANGLE_IDS.has(id)))] : [];
    state.qwenAngleElevation = QWEN_ANGLE_ELEVATIONS.some((option) => option.id === f.qwenAngleElevation)
      ? f.qwenAngleElevation : 'eye-level';
    state.qwenAngleDistance = QWEN_ANGLE_DISTANCES.some((option) => option.id === f.qwenAngleDistance)
      ? f.qwenAngleDistance : 'medium shot';
    state.loras = Array.isArray(f.loras) ? f.loras : [];
    state.videoLoras = Array.isArray(f.videoLoras) ? f.videoLoras : [];
    state.editEngine = editEngineId(f.editEngine);
    state.editLorasByEngine = {};
    if (f.editLorasByEngine && typeof f.editLorasByEngine === 'object') {
      EDIT_ENGINES.forEach((engine) => {
        if (Array.isArray(f.editLorasByEngine[engine])) state.editLorasByEngine[engine] = f.editLorasByEngine[engine];
      });
    } else if (Array.isArray(f.editLoras)) {
      // One-time migration from the original single edit-LoRA list.
      state.editLorasByEngine[state.editEngine] = f.editLoras;
    }
    state.editLoras = state.editLorasByEngine[state.editEngine] || [];
    state.editLorasByEngine[state.editEngine] = state.editLoras;
    state.createMode = ['image', 'region', 'video'].includes(f.createMode) ? f.createMode : 'image';
    const savedCreateInfluence = Number(f.createInfluence);
    state.createInfluence = Number.isFinite(savedCreateInfluence)
      ? Math.max(0, Math.min(100, savedCreateInfluence)) : 55;
    state.krea2Turbo = f.krea2Turbo !== false;
    state.krea2RawTurboLora = f.krea2RawTurboLora && f.krea2RawTurboLora.name ? {
      name: String(f.krea2RawTurboLora.name),
      strength: Math.max(0, Math.min(2, Number(f.krea2RawTurboLora.strength) || 0.6)),
      on: f.krea2RawTurboLora.on !== false,
      managed: 'krea2-raw-turbo',
    } : null;
    state.createRef = f.createRef && f.createRef.name ? {
      name: String(f.createRef.name),
      url: '/api/input?name=' + encodeURIComponent(String(f.createRef.name)),
      w: Number(f.createRef.w) || 0,
      h: Number(f.createRef.h) || 0,
      label: String(f.createRef.label || 'Source image'),
    } : null;
    state.createImageGuideOpen = f.createImageGuideOpen === true;
    state.createMatchSource = f.createMatchSource === true && !!state.createRef;
    state.kreaMaskTool = ['smart', 'brush', 'box'].includes(f.kreaMaskTool) ? f.kreaMaskTool : 'smart';
    state.regions = Array.isArray(f.regions) ? f.regions : [];
    state.kreaBrush = Number(f.kreaBrush) || 48;
    state.kreaMaskFeather = Math.max(0, Math.min(64, Number(f.kreaMaskFeather) || 8));
    state.editMaskInfluence = Math.max(25, Math.min(100, Math.round(Number(f.editMaskInfluence) || 78)));
    state.editMaskExpand = Math.max(6, Math.min(32, Math.round(Number(f.editMaskExpand) || 14)));
    // Older form state treated inversion as an export-time toggle. The mask
    // editor now applies inversion directly to the visible mask canvas.
    state.kreaMaskInvert = false;
    if (f.cameraSettings && CameraSettings) {
      state.cameraSettings = CameraSettings.normalizeSettings(f.cameraSettings);
    }
    state.vidScailMode = f.scailModeVersion >= 2 && ['infinity', 'chunked', 'direct'].includes(f.vidScailMode)
      ? f.vidScailMode
      : (f.vidScailMode === 'direct' ? 'direct' : 'infinity');
    state.vidScailStableTracking = f.vidScailStableTracking !== false;
    if ([41, 61, 81].includes(Number(f.vidScailChunkFrames))) state.vidScailChunkFrames = Number(f.vidScailChunkFrames);
    if ([5, 9, 13, 17].includes(Number(f.vidScailChunkOverlap))) state.vidScailChunkOverlap = Number(f.vidScailChunkOverlap);
    if (f.prompts && typeof f.prompts === 'object') {
      state.prompts = Object.assign({ create: '', edit: '', video: '' }, f.prompts);
    } else if (f.prompt) {
      state.prompts.create = f.prompt; // legacy single-prompt storage
    }
    state.customDims = !!f.customDims;
    if (f.width) state.width = f.width;
    if (f.height) state.height = f.height;
    if (f.prompt) setPromptDraft(f.prompt);
  } catch { /* noop */ }
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

const primaryTabButtons = $$('#primaryTabs .tab');
const createTabButtons = $$('#createTabs .tab');

function syncNavigation() {
  const createActive = state.view === 'create' || state.view === 'video';
  const primaryMode = createActive ? 'create' : state.view;
  primaryTabButtons.forEach((button, index) => {
    const active = button.dataset.primaryMode === primaryMode;
    button.classList.toggle('active', active);
    if (active) $('#primaryTabPill').style.transform = `translateX(${index * 100}%)`;
  });
  $('#createTabs').hidden = !createActive;
  createTabButtons.forEach((button, index) => {
    const active = button.dataset.createMode === state.createMode;
    button.classList.toggle('active', active);
    if (active) $('#createTabPill').style.transform = `translateX(${index * 100}%)`;
  });
  document.body.dataset.uiMode = createActive ? state.createMode : (state.view === 'gallery' ? 'library' : state.view);
  renderAppDrawerNavigation();
}

function setView(view, opts = {}) {
  const prev = state.view;
  if (Object.prototype.hasOwnProperty.call(state.prompts, prev)) {
    state.prompts[prev] = promptDraft();
  }
  if (view === 'video') state.createMode = 'video';
  if (view === 'create') {
    state.createMode = ['image', 'region'].includes(opts.createMode) ? opts.createMode : 'image';
    if (state.createMode === 'region' && !state.regions.length) createRegion();
  }
  state.view = view;
  if (Object.prototype.hasOwnProperty.call(state.prompts, view)) {
    setPromptDraft(state.prompts[view] || '');
    updatePromptClear();
  }
  syncNavigation();
  exitSelect();
  const isGallery = view === 'gallery';
  $('#view-create').classList.toggle('active', !isGallery);
  $('#view-gallery').classList.toggle('active', isGallery);
  $('#genDock').style.display = isGallery ? 'none' : '';
  $('#refPanel').hidden = view !== 'edit';
  if (prev !== view && !isGallery) applyGenerationDefaults();
  updateVideoPanels();
  renderEnhance();
  $('#genLbl').textContent = genLabel();
  if (isGallery) refreshGallery();
}

function setCreateMode(mode, openEditor) {
  if (mode === 'video') {
    setView('video');
  } else {
    setView('create', { createMode: mode });
    if (mode === 'region' && openEditor) setTimeout(openRegionEditor, 80);
  }
  saveForm();
}

primaryTabButtons.forEach((button) => button.addEventListener('click', () => {
  const mode = button.dataset.primaryMode;
  if (mode === 'create') setCreateMode(state.createMode || 'image');
  else setView(mode);
}));
createTabButtons.forEach((button) => button.addEventListener('click', () => {
  setCreateMode(button.dataset.createMode, button.dataset.createMode === 'region');
}));

function genLabel() {
  if (state.activeJobs.size) {
    return `➕ Add to Queue · ${state.activeJobs.size} running`;
  }
  if (state.view === 'edit' && state.editEngine === 'krea2' && hasEditMask()) return 'Generate Inpaint';
  return state.view === 'edit' ? 'Generate Edit' : (state.view === 'video' ? 'Generate Video' : 'Generate');
}

function updateVideoPanels() {
  const isVideo = state.view === 'video';
  const isRegion = state.view === 'create' && state.createMode === 'region';
  const promptPanel = $('#promptPanel');
  const regionWorkspace = $('#regionWorkspace');
  const promptSlot = $('#regionGlobalPromptSlot');
  if (isRegion && promptPanel.parentElement !== promptSlot) {
    promptSlot.appendChild(promptPanel);
  } else if (!isRegion && promptPanel.parentElement !== $('#view-create')) {
    $('#view-create').insertBefore(promptPanel, regionWorkspace);
  }
  $('#promptLabel').textContent = isRegion ? 'Global prompt' : 'Prompt';
  $('#promptComposer').dataset.placeholder = isVideo
    ? (state.vidEngine === 'ltx-edit' ? 'Describe the edit…' : (state.vidEngine === 'scail' ? 'Optional motion direction…' : 'Describe the motion…'))
    : (state.createMode === 'region' && state.view === 'create'
      ? 'Describe the full scene… (optional)'
      : (state.view === 'edit' ? 'Describe the change…' : 'Describe your image…'));
  $('#vidAttachRow').hidden = !isVideo;
  $('#vidModelPanel').hidden = !isVideo;
  $('#vidOptsPanel').hidden = !isVideo;
  $('#enhanceBtn').hidden = isVideo && state.vidEngine === 'ltx-edit';
  if (!(state.view === 'edit' && state.editEngine === 'qwen')) state.qwenAnglesMode = false;
  $('#qwenAngleTool').hidden = !(state.view === 'edit' && state.editEngine === 'qwen') || state.qwenAnglesMode || hasEditMask();
  renderQwenAngleTool();
  renderQwenAngleMode();
  renderEditSequence();
  regionWorkspace.hidden = !isRegion;
  $('#vidExtras').hidden = !isVideo || state.vidEngine === 'wan' || state.vidEngine === 'scail' || state.vidEngine === 'ltx-edit';
  $('#createPromptTools').hidden = state.view !== 'create';
  renderKrea2Mode();
  renderCreateImageGuide();
  const kreaEdit = state.view === 'edit' && state.editEngine === 'krea2';
  $('#denoiseField').hidden = !kreaEdit;
  syncEditAreaChrome();
  renderEditAspects();
  renderEditUpscale();
  renderKreaMaskTools();
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
      cb({ name: res.name, url, w: dims.w, h: dims.h, label: file.name, hasAudio: res.hasAudio === true });
    } catch (e) { toast(e.message, true); }
  });
  input.click();
}

function createDenoiseFromInfluence(influence = state.createInfluence) {
  const normalized = Math.max(0, Math.min(100, Number(influence) || 0)) / 100;
  return Number((1 - normalized * 0.95).toFixed(2));
}

const DEFAULT_KREA2_TURBO_LORA = 'krea2_turbo_lora_rank_64_bf16.safetensors';

function assetNameKey(name) {
  return String(name || '').replace(/\\/g, '/').toLowerCase();
}

function krea2TurboLoraName() {
  return (lastMeta && lastMeta.krea2 && lastMeta.krea2.turboLora) || DEFAULT_KREA2_TURBO_LORA;
}

function ensureKrea2RawTurboLora() {
  const name = krea2TurboLoraName();
  const key = assetNameKey(name);
  let lora = state.krea2RawTurboLora;
  if (!lora || assetNameKey(lora.name) !== key) {
    lora = state.loras.find((item) => item && assetNameKey(item.name) === key) || {
      name, strength: 0.6, on: true,
    };
  }
  lora.name = name;
  lora.managed = 'krea2-raw-turbo';
  if (!Number.isFinite(Number(lora.strength))) lora.strength = 0.6;
  if (typeof lora.on !== 'boolean') lora.on = true;
  state.krea2RawTurboLora = lora;
  state.loras = state.loras.filter((item) => item && item !== lora && item.managed !== 'krea2-raw-turbo' && assetNameKey(item.name) !== key);
  state.loras.unshift(lora);
  return lora;
}

function detachKrea2RawTurboLora() {
  const key = assetNameKey(krea2TurboLoraName());
  const current = state.loras.find((item) => item && (item.managed === 'krea2-raw-turbo' || assetNameKey(item.name) === key));
  if (current) {
    current.managed = 'krea2-raw-turbo';
    state.krea2RawTurboLora = current;
  }
  state.loras = state.loras.filter((item) => item && item.managed !== 'krea2-raw-turbo' && assetNameKey(item.name) !== key);
}

function applyKrea2SamplingPreset() {
  if (state.krea2Turbo) {
    $('#stepsInput').value = 8;
    $('#cfgInput').value = 1;
    return;
  }
  const turboLora = ensureKrea2RawTurboLora();
  $('#stepsInput').value = turboLora.on ? 12 : 52;
  $('#cfgInput').value = turboLora.on ? 1 : 3.5;
}

function renderKrea2Mode() {
  const button = $('#kreaTurboToggle');
  if (!button) return;
  const visible = state.view === 'create' && state.createMode === 'image';
  button.hidden = !visible;
  if (!visible) {
    detachKrea2RawTurboLora();
    state.krea2SamplingReady = false;
    return;
  }
  if (state.krea2Turbo) {
    detachKrea2RawTurboLora();
    if (!state.krea2SamplingReady) applyKrea2SamplingPreset();
  }
  else {
    ensureKrea2RawTurboLora();
    if (!state.krea2SamplingReady) applyKrea2SamplingPreset();
  }
  state.krea2SamplingReady = true;
  button.setAttribute('aria-checked', String(state.krea2Turbo));
  const rawStatus = lastMeta && lastMeta.models && lastMeta.models.krea2 && lastMeta.models.krea2.raw;
  if (state.krea2Turbo) {
    $('#kreaModelSummary').textContent = 'Krea 2 · fast · 8 steps';
  } else if (rawStatus && !rawStatus.ok) {
    $('#kreaModelSummary').textContent = 'Raw model missing · configure in Settings';
  } else {
    const lora = state.krea2RawTurboLora;
    $('#kreaModelSummary').textContent = lora && lora.on
      ? `Raw · LoRA ${Number(lora.strength).toFixed(2)} · ${$('#stepsInput').value || 12} steps`
      : `Raw · full sampling · ${$('#stepsInput').value || 52} steps`;
  }
}

function krea2ManagedLoraChanged(lora) {
  if (!lora || lora.managed !== 'krea2-raw-turbo') return;
  state.krea2RawTurboLora = lora;
  if (!state.krea2Turbo) applyKrea2SamplingPreset();
  renderKrea2Mode();
}

$('#kreaTurboToggle').addEventListener('click', () => {
  const nextTurbo = !state.krea2Turbo;
  if (!nextTurbo) {
    const rawStatus = lastMeta && lastMeta.models && lastMeta.models.krea2 && lastMeta.models.krea2.raw;
    if (rawStatus && !rawStatus.ok) {
      toast('Krea 2 Raw is not installed — configure the Raw UNET in Advanced Settings', true);
      return;
    }
  }
  state.krea2Turbo = nextTurbo;
  state.krea2SamplingReady = false;
  if (state.krea2Turbo) detachKrea2RawTurboLora();
  else {
    const lora = ensureKrea2RawTurboLora();
    const loraStatus = lastMeta && lastMeta.models && lastMeta.models.krea2 && lastMeta.models.krea2.turboLora;
    if (loraStatus && !loraStatus.ok) {
      lora.on = false;
      toast('Turbo LoRA is not installed — Raw will use full 52-step sampling', true);
    }
  }
  applyKrea2SamplingPreset();
  state.krea2SamplingReady = true;
  renderKrea2Mode();
  renderLoras();
  saveForm();
});

function createInfluenceFromDenoise(denoise) {
  const value = Math.max(0.05, Math.min(1, Number(denoise) || 1));
  return Math.round(((1 - value) / 0.95) * 20) * 5;
}

function matchedCreateOutputDimensions(ref = state.createRef) {
  const sourceWidth = Number(ref?.w);
  const sourceHeight = Number(ref?.h);
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) return null;
  const scale = Math.min(1, 4096 / Math.max(sourceWidth, sourceHeight));
  return {
    w: round32(sourceWidth * scale),
    h: round32(sourceHeight * scale),
  };
}

function applyCreateMatchedDimensions() {
  const matched = matchedCreateOutputDimensions();
  if (!matched) return false;
  state.createMatchSource = true;
  state.customDims = true;
  state.width = matched.w;
  state.height = matched.h;
  return true;
}

function renderCreateImageGuide() {
  const section = $('#createImageGuide');
  if (!section) return;
  const toggle = $('#createImageGuideToggle');
  const toolbar = $('#createPromptTools');
  const visible = state.view === 'create' && state.createMode === 'image';
  if (section.previousElementSibling !== toolbar) toolbar.after(section);
  section.hidden = !visible;
  toggle.hidden = !visible;
  const hasImage = !!state.createRef;
  const open = visible && state.createImageGuideOpen;
  toggle.classList.toggle('has-image', hasImage);
  toggle.classList.toggle('active', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', hasImage ? 'Image guide, source image added' : 'Image guide');
  section.classList.toggle('expanded', open);
  section.inert = !open;
  section.setAttribute('aria-hidden', String(!open));
  $('#createImageGuideAdd').hidden = hasImage;
  $('#createImageGuideFilled').hidden = !hasImage;
  const influence = Math.max(0, Math.min(100, Number(state.createInfluence) || 0));
  $('#createImageInfluence').value = String(influence);
  $('#createImageInfluence').style.setProperty('--influence', influence + '%');
  $('#createImageInfluenceVal').textContent = influence + '%';
  if (!hasImage) return;
  $('#createImageGuideImg').src = state.createRef.url;
  $('#createImageGuideName').textContent = state.createRef.label || 'Source image';
  $('#createImageGuideDims').textContent = state.createRef.w && state.createRef.h
    ? `${state.createRef.w} × ${state.createRef.h} · tap to replace`
    : 'Tap to replace';
}

function pickCreateImageGuide() {
  pickUpload('image/*', (file) => {
    state.createRef = file;
    if (state.createMatchSource) applyCreateMatchedDimensions();
    renderCreateImageGuide();
    renderAspects();
    renderDims();
    saveForm();
    toast('Image guide added');
  });
}

$('#createImageGuideToggle').addEventListener('click', () => {
  state.createImageGuideOpen = !state.createImageGuideOpen;
  renderCreateImageGuide();
  saveForm();
});
$('#createImageGuideAdd').addEventListener('click', pickCreateImageGuide);
$('#createImageGuideChange').addEventListener('click', pickCreateImageGuide);
$('#createImageGuideRemove').addEventListener('click', () => {
  state.createRef = null;
  state.createMatchSource = false;
  renderCreateImageGuide();
  renderAspects();
  renderDims();
  saveForm();
  toast('Image guide removed');
});
$('#createImageInfluence').addEventListener('input', (event) => {
  state.createInfluence = Number(event.target.value);
  renderCreateImageGuide();
  saveForm();
});

/* ------------------------------------------------------------------ */
/* Regional prompting + localized edit masks                           */
/* ------------------------------------------------------------------ */

const REGION_COLORS = ['#46b4e6', '#e68246', '#82e646', '#e646b4', '#e6e646', '#46e6c8'];
let regionDrag = null;
let regionSettingsOpen = false;
let regionClickBlockedUntil = 0;
let kreaMaskDrawing = false;
let kreaMaskLast = null;
let kreaMaskBoxStart = null;
let kreaMaskGesture = null;
let smartMaskPointDrag = null;

function clamp01(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function clampRegionBox(region) {
  region.x = clamp01(region.x, 0.1);
  region.y = clamp01(region.y, 0.1);
  region.w = Math.max(0.04, Math.min(1 - region.x, Number(region.w) || 0.35));
  region.h = Math.max(0.04, Math.min(1 - region.y, Number(region.h) || 0.45));
}

function selectedRegion() {
  return state.regions.find((r) => r.id === state.activeRegionId) || state.regions[0] || null;
}

function normalizeRegionStrength(value) {
  const strength = Number(value);
  return Number.isFinite(strength) ? Math.max(0, Math.min(2, strength)) : 1;
}

function createRegion() {
  const n = state.regions.length;
  const region = {
    id: `r${Date.now()}${Math.floor(Math.random() * 1000)}`,
    description: '',
    x: Math.min(0.62, 0.08 + n * 0.06),
    y: Math.min(0.56, 0.12 + n * 0.05),
    w: 0.34,
    h: 0.46,
    lora: 'None',
    strength: 1,
    refImageName: '',
    refUrl: '',
    color: REGION_COLORS[n % REGION_COLORS.length],
  };
  state.regions.push(region);
  state.activeRegionId = region.id;
  return region;
}

function activeRegionsForRequest() {
  if (state.view !== 'create') return []; // regions are a Create-tab feature
  if (state.createMode !== 'region') return [];
  return state.regions
    .filter(Boolean)
    .map((region) => {
      clampRegionBox(region);
      return {
        id: region.id,
        description: (region.description || '').trim(),
        x: region.x,
        y: region.y,
        w: region.w,
        h: region.h,
        lora: region.lora || 'None',
        strength: normalizeRegionStrength(region.strength),
        refImageName: region.refImageName || '',
        color: region.color || '',
        enabled: true,
      };
    })
    .filter((region) => region.description || (region.lora && region.lora !== 'None') || region.refImageName);
}

function regionLoraOptions(selected) {
  const allowed = new Set(['krea2', 'unknown']);
  return state.metaLoras.filter((name) => name === selected || allowed.has(loraCategory(name)));
}

function syncRegionSettings(focusPrompt) {
  const settings = $('#regionSettings');
  const region = selectedRegion();
  const open = regionSettingsOpen && !!region;
  settings.classList.toggle('show', open);
  settings.inert = !open;
  settings.setAttribute('aria-hidden', String(!open));
  if (region) {
    const index = state.regions.findIndex((item) => item.id === region.id);
    $('#regionSettingsTitle').textContent = `Region ${index + 1} settings`;
  }
  if (open && focusPrompt) setTimeout(() => $('#regionDescInput').focus(), 240);
}

function selectRegion(region, focusPrompt) {
  if (!region) return;
  const wasOpen = regionSettingsOpen;
  state.activeRegionId = region.id;
  regionSettingsOpen = true;
  renderRegionEditor();
  syncRegionSettings(focusPrompt);
  if (!wasOpen) {
    setTimeout(() => $('#regionSettings').scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
    }), 60);
  }
}

function regionsAtPoint(clientX, clientY) {
  const rect = $('#regionStage').getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  return state.regions.filter((region) => (
    x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h
  ));
}

function selectRegionUnderneath(clientX, clientY, currentRegion) {
  const hits = regionsAtPoint(clientX, clientY);
  if (hits.length < 2) {
    selectRegion(currentRegion, false);
    return;
  }
  const currentIndex = hits.findIndex((region) => region.id === currentRegion.id);
  const nextIndex = currentIndex > 0 ? currentIndex - 1 : hits.length - 1;
  regionClickBlockedUntil = Date.now() + 400;
  selectRegion(hits[nextIndex], false);
  if (navigator.vibrate) navigator.vibrate(12);
}

function openRegionLoraPicker(region) {
  if (!region) return;
  const regionId = region.id;
  openLoraPicker((name) => {
    const target = state.regions.find((item) => item.id === regionId);
    if (!target) return;
    if (name) {
      const selected = { name, strength: 1, on: true };
      applyContextLoraDefault(selected);
      target.lora = name;
      target.strength = normalizeRegionStrength(selected.strength);
    } else {
      target.lora = 'None';
      target.strength = 1;
    }
    renderRegionEditor();
    saveForm();
  }, { allowNone: true, title: 'Region LoRA' });
}

function renderRegionLoraCard(region) {
  const slot = $('#regionLoraSlot');
  slot.innerHTML = '';
  if (!region) return;
  const color = region.color || '#46b4e6';
  const hasLora = region.lora && region.lora !== 'None';
  if (!hasLora) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'lora-card add region-lora-add';
    add.style.setProperty('--region-card-color', color);
    add.textContent = '＋';
    add.setAttribute('aria-label', 'Add Region LoRA');
    add.addEventListener('click', () => openRegionLoraPicker(region));
    slot.appendChild(add);
    return;
  }

  region.strength = normalizeRegionStrength(region.strength);
  const card = document.createElement('div');
  card.className = 'lora-card on region-lora-card';
  card.style.setProperty('--region-card-color', color);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${prettyLora(region.lora)}, strength ${region.strength.toFixed(2)}. Tap to change.`);
  card.innerHTML = `${loraThumbHtml(region.lora, 'lc-thumb')}`
    + `<span class="lc-strength">${region.strength.toFixed(2)}</span>`
    + '<button class="lc-menu" type="button" aria-label="Region LoRA options">⋯</button>'
    + `<span class="lc-name" title="${escapeHtml(prettyLora(region.lora))}">${escapeHtml(prettyLora(region.lora))}</span>`
    + '<span class="lc-adjust"></span>';
  slot.appendChild(card);

  const menuBtn = card.querySelector('.lc-menu');
  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openActionMenu(menuBtn, [
      { label: 'Change LoRA', action: () => openRegionLoraPicker(region) },
      { label: `Strength: ${region.strength.toFixed(2)}`, action: () => {
        const value = window.prompt('Strength (0–2)', String(region.strength));
        if (value == null) return;
        region.strength = normalizeRegionStrength(value);
        renderRegionEditor();
        saveForm();
      } },
      { label: 'Remove from region', danger: true, action: () => {
        region.lora = 'None';
        region.strength = 1;
        renderRegionEditor();
        saveForm();
      } },
    ]);
  });

  let holdTimer = null;
  let adjusting = false;
  let moved = false;
  let startY = 0;
  let lastY = 0;
  let pointerId = null;
  let startStrength = region.strength;
  const strengthEl = card.querySelector('.lc-strength');
  const adjustEl = card.querySelector('.lc-adjust');
  card.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.lc-menu')) return;
    moved = false;
    adjusting = false;
    startY = event.clientY;
    lastY = event.clientY;
    pointerId = event.pointerId;
    startStrength = normalizeRegionStrength(region.strength);
    holdTimer = setTimeout(() => {
      adjusting = true;
      card.classList.add('adjusting');
      adjustEl.textContent = startStrength.toFixed(2);
      try { card.setPointerCapture(pointerId); } catch { /* noop */ }
      if (navigator.vibrate) navigator.vibrate(10);
    }, 300);
    try { card.setPointerCapture(pointerId); } catch { /* noop */ }
  });
  card.addEventListener('pointermove', (event) => {
    if (event.cancelable) event.preventDefault();
    if (adjusting) {
      const dy = startY - event.clientY;
      region.strength = normalizeRegionStrength(Math.round((startStrength + dy / 90) * 20) / 20);
      strengthEl.textContent = region.strength.toFixed(2);
      adjustEl.textContent = region.strength.toFixed(2);
    } else {
      const distance = Math.abs(event.clientY - startY);
      if (distance > 8) {
        moved = true;
        clearTimeout(holdTimer);
        window.scrollBy(0, lastY - event.clientY);
        lastY = event.clientY;
      }
    }
  }, { passive: false });
  const finish = (event) => {
    if (event && event.target.closest('.lc-menu')) return;
    clearTimeout(holdTimer);
    if (adjusting) {
      const scrollY = window.scrollY;
      card.classList.remove('adjusting');
      adjusting = false;
      renderRegionEditor();
      window.scrollTo(0, scrollY);
      saveForm();
    } else if (!moved) {
      openRegionLoraPicker(region);
    }
  };
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', () => {
    clearTimeout(holdTimer);
    if (adjusting) {
      const scrollY = window.scrollY;
      card.classList.remove('adjusting');
      adjusting = false;
      renderRegionEditor();
      window.scrollTo(0, scrollY);
      saveForm();
    }
  });
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openRegionLoraPicker(region);
  });
  card.addEventListener('contextmenu', (event) => event.preventDefault());
}

function syncRegionStageAspect() {
  const stage = $('#regionStage');
  if (!stage) return;
  const arW = state.width || 1024;
  const arH = state.height || 1024;
  stage.style.aspectRatio = `${arW} / ${arH}`;
  stage.style.flex = '0 0 auto';
  stage.style.minHeight = '0';
  stage.style.margin = '0 auto';
  stage.style.width = arW >= arH ? '100%' : 'min(100%, 430px)';
  stage.style.height = 'auto';
}

function renderRegionEditor() {
  const stage = $('#regionStage');
  if (!stage) return;
  if (!state.regions.length) createRegion();
  if (!selectedRegion()) state.activeRegionId = state.regions[0].id;

  // The canvas mirrors the output and updates independently of its boxes.
  syncRegionStageAspect();

  stage.innerHTML = '';
  state.regions.forEach((region, index) => {
    clampRegionBox(region);
    const box = document.createElement('button');
    box.type = 'button';
    box.className = 'region-box' + (region.id === state.activeRegionId ? ' active' : '');
    box.style.left = `${region.x * 100}%`;
    box.style.top = `${region.y * 100}%`;
    box.style.width = `${region.w * 100}%`;
    box.style.height = `${region.h * 100}%`;
    box.style.borderColor = region.color || REGION_COLORS[index % REGION_COLORS.length];
    box.setAttribute('aria-label', `Region ${index + 1}. Open region settings.`);
    box.innerHTML = `<span class="region-box-number" aria-hidden="true">${index + 1}</span><em class="region-box-settings" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 7h10v2H4V7Zm0 8h16v2H4v-2Zm14-9h2v4h-2V6Zm-8 8h2v4h-2v-4Z"/></svg></em><b>${escapeHtml(region.description || 'Region')}</b><i></i>`;
    box.addEventListener('click', (event) => {
      if (Date.now() < regionClickBlockedUntil) return;
      selectRegion(region, !!event.target.closest('.region-box-settings'));
    });
    box.addEventListener('pointerdown', (e) => startRegionDrag(e, region, false));
    box.querySelector('i').addEventListener('pointerdown', (e) => startRegionDrag(e, region, true));
    stage.appendChild(box);
  });

  const region = selectedRegion();
  const hasRegion = !!region;
  $('#regionDeleteBtn').disabled = !hasRegion;
  $('#regionDescInput').disabled = !hasRegion;
  $('#regionStrengthInput').disabled = !hasRegion;
  $('#regionRefBtn').disabled = !hasRegion;
  $('#regionRefClear').disabled = !hasRegion || !region.refImageName;
  if (!region) return;

  $('#regionDescInput').value = region.description || '';
  const hasLora = region.lora && region.lora !== 'None';
  $('#regionStrengthField').hidden = !hasLora;
  region.strength = normalizeRegionStrength(region.strength);
  renderRegionLoraCard(region);
  $('#regionStrengthInput').value = String(region.strength);
  $('#regionStrengthVal').textContent = region.strength.toFixed(2);
  const hasRef = !!region.refImageName;
  $('#regionRefBtn').hidden = hasRef;
  $('#regionRefPreview').hidden = !hasRef;
  $('#regionRefLabel').textContent = hasRef ? (region.refImageName.split('/').pop() || 'Reference added') : 'None';
  if (hasRef) {
    $('#regionRefPreviewImg').src = region.refUrl || `/api/input?name=${encodeURIComponent(region.refImageName)}`;
  }
  syncRegionSettings(false);
}

function startRegionDrag(e, region, resize) {
  e.preventDefault();
  e.stopPropagation();
  state.activeRegionId = region.id;
  const rect = $('#regionStage').getBoundingClientRect();
  const drag = {
    region,
    resize,
    rect,
    startX: e.clientX,
    startY: e.clientY,
    x: region.x,
    y: region.y,
    w: region.w,
    h: region.h,
    moved: false,
    holdTimer: null,
  };
  regionDrag = drag;
  if (!resize) {
    drag.holdTimer = setTimeout(() => {
      if (regionDrag !== drag || drag.moved) return;
      document.removeEventListener('pointermove', moveRegionDrag);
      document.removeEventListener('pointerup', endRegionDrag);
      document.removeEventListener('pointercancel', endRegionDrag);
      regionDrag = null;
      selectRegionUnderneath(drag.startX, drag.startY, region);
    }, 520);
  }
  document.addEventListener('pointermove', moveRegionDrag);
  document.addEventListener('pointerup', endRegionDrag, { once: true });
  document.addEventListener('pointercancel', endRegionDrag, { once: true });
}

function moveRegionDrag(e) {
  if (!regionDrag) return;
  const dx = (e.clientX - regionDrag.startX) / regionDrag.rect.width;
  const dy = (e.clientY - regionDrag.startY) / regionDrag.rect.height;
  const movedPx = Math.hypot(e.clientX - regionDrag.startX, e.clientY - regionDrag.startY);
  if (!regionDrag.resize && !regionDrag.moved && movedPx < 8) return;
  if (!regionDrag.moved) {
    regionDrag.moved = true;
    clearTimeout(regionDrag.holdTimer);
    regionClickBlockedUntil = Date.now() + 250;
  }
  const r = regionDrag.region;
  if (regionDrag.resize) {
    r.w = Math.max(0.04, Math.min(1 - r.x, regionDrag.w + dx));
    r.h = Math.max(0.04, Math.min(1 - r.y, regionDrag.h + dy));
  } else {
    r.x = Math.max(0, Math.min(1 - r.w, regionDrag.x + dx));
    r.y = Math.max(0, Math.min(1 - r.h, regionDrag.y + dy));
  }
  renderRegionEditor();
}

function endRegionDrag() {
  if (!regionDrag) return;
  clearTimeout(regionDrag.holdTimer);
  document.removeEventListener('pointermove', moveRegionDrag);
  document.removeEventListener('pointerup', endRegionDrag);
  document.removeEventListener('pointercancel', endRegionDrag);
  regionDrag = null;
  saveForm();
}

function openRegionEditor() {
  if (!state.regions.length) createRegion();
  renderRegionEditor();
  const workspace = $('#regionWorkspace');
  workspace.hidden = false;
}

async function uploadRegionReference(file) {
  const region = selectedRegion();
  if (!region || !file) return;
  try {
    toast('Uploading region reference...');
    const buf = await file.arrayBuffer();
    const res = await api('/api/upload', {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent(file.name || 'region_ref.png') },
      body: buf,
    });
    region.refImageName = res.name;
    region.refUrl = URL.createObjectURL(file);
    renderRegionEditor();
    saveForm();
  } catch (e) { toast(e.message, true); }
}

function clearKreaMask(silent) {
  state.kreaMask = null;
  state.kreaMaskPreview = null;
  state.kreaMaskDirty = false;
  state.kreaMaskKind = null;
  state.kreaMaskPoints = [];
  state.kreaMaskPointDeleteMode = false;
  state.kreaMaskInvert = false;
  state.kreaMaskPreviewCutout = false;
  const canvas = $('#kreaMaskCanvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width || 1, canvas.height || 1);
  const overlay = $('#kreaMaskOverlayCanvas');
  if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width || 1, overlay.height || 1);
  const cutout = $('#kreaMaskCutoutCanvas');
  if (cutout) cutout.getContext('2d').clearRect(0, 0, cutout.width || 1, cutout.height || 1);
  if (state.refs[0] && state.refs[0].displayUrl) {
    delete state.refs[0].displayUrl;
    renderRefs();
  }
  renderSmartMaskPoints();
  renderMaskAdjustments();
  renderKreaMaskTools();
  if (!silent) toast('Edit area cleared');
}

function supportsCurrentEditMask() {
  return state.view === 'edit' && EDIT_MASK_ENGINES.has(state.editEngine);
}

function hasEditMask() {
  return !!state.kreaMask || state.kreaMaskDirty || !!state.kreaMaskPreview;
}

function syncEditAreaChrome() {
  const supported = supportsCurrentEditMask();
  const active = supported && hasEditMask();
  const kreaEdit = state.view === 'edit' && state.editEngine === 'krea2';
  const kreaRef = state.view === 'edit' && state.editEngine === 'krea2ref';
  $('#kreaMaskTools').hidden = !supported;
  $('#editComposite').hidden = kreaEdit || kreaRef || active;
  $('#editAspectControl').hidden = state.view !== 'edit' || kreaEdit || active;
  $('#qwenAngleTool').hidden = !(state.view === 'edit' && state.editEngine === 'qwen') || state.qwenAnglesMode || active;
}

function renderKreaMaskTools() {
  const tools = $('#kreaMaskTools');
  if (!tools) return;
  const hasMask = hasEditMask();
  const isInpaint = state.editEngine === 'krea2';
  const kind = state.kreaMaskKind === 'box' ? 'Box selected'
    : (state.kreaMaskKind === 'smart' ? 'Smart mask selected' : 'Mask selected');
  $('#kreaMaskLabel').textContent = isInpaint ? 'Inpaint area' : 'Edit area';
  $('#kreaMaskStatus').textContent = hasMask ? (isInpaint ? `Inpaint · ${kind.toLowerCase()}` : kind) : (isInpaint ? 'Whole image · no inpaint' : 'Whole image');
  $('#kreaMaskClear').hidden = !hasMask;
  $('#kreaMaskBtn').classList.toggle('active', hasMask);
  syncEditAreaChrome();
  renderEditMaskAdvanced();
  $('#genLbl').textContent = genLabel();
}

function renderEditMaskAdvanced() {
  const panel = $('#editMaskAdvanced');
  if (!panel) return;
  const visible = supportsCurrentEditMask() && hasEditMask();
  panel.hidden = !visible;
  if (!visible) return;
  const influence = Math.max(25, Math.min(100, Math.round(Number(state.editMaskInfluence) || 78)));
  const expand = Math.max(6, Math.min(32, Math.round(Number(state.editMaskExpand) || 14)));
  state.editMaskInfluence = influence;
  state.editMaskExpand = expand;
  $('#editMaskInfluence').value = String(influence);
  $('#editMaskInfluenceVal').textContent = `${influence}%`;
  $('#editMaskExpand').value = String(expand);
  $('#editMaskExpandVal').textContent = `${expand} px`;
}

function renderKreaMaskMode() {
  const tool = state.kreaMaskTool;
  [['smart', '#kreaMaskSmartMode'], ['brush', '#kreaMaskBrushMode'], ['box', '#kreaMaskBoxMode']].forEach(([name, selector]) => {
    const active = tool === name;
    $(selector).classList.toggle('active', active);
    $(selector).setAttribute('aria-pressed', String(active));
  });
  $('#kreaMaskSmartControls').hidden = tool !== 'smart';
  $('#kreaBrushField').hidden = tool !== 'brush';
  $('#kreaMaskErase').hidden = tool !== 'brush';
  $('#kreaMaskStage').classList.toggle('box-mode', tool === 'box');
  $('#kreaMaskStage').classList.toggle('smart-mode', tool === 'smart');
  renderSmartPointMode();
}

function setupMaskCanvasFromImage() {
  const base = $('#kreaMaskBase');
  const canvas = $('#kreaMaskCanvas');
  const overlay = $('#kreaMaskOverlayCanvas');
  const cutout = $('#kreaMaskCutoutCanvas');
  const w = base.naturalWidth || 1024;
  const h = base.naturalHeight || 1024;
  $('#kreaMaskStage').style.setProperty('--mask-aspect', String(w / h));
  canvas.width = w;
  canvas.height = h;
  overlay.width = w;
  overlay.height = h;
  cutout.width = w;
  cutout.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (state.kreaMaskPreview) {
    const im = new Image();
    im.onload = () => {
      ctx.drawImage(im, 0, 0, w, h);
      renderMaskOverlay();
      refreshMaskCutoutPreview();
    };
    im.src = state.kreaMaskPreview;
  } else {
    renderMaskOverlay();
    refreshMaskCutoutPreview();
  }
  requestAnimationFrame(renderSmartMaskPoints);
}

function openKreaMaskPainter() {
  const ref = state.refs[0];
  if (!ref) return toast('Add a source image in reference slot 1 before selecting an edit area', true);
  if (state.qwenAnglesMode || state.qwenAngles.length) {
    state.qwenAnglesMode = false;
    state.qwenAngles = [];
    renderQwenAngleTool();
    renderQwenAngleMode();
  }
  state.editAspectOverride = false;
  renderEditAspects();
  $('#kreaMaskBase').src = ref.url;
  $('#kreaMaskBase').onload = setupMaskCanvasFromImage;
  if ($('#kreaMaskBase').complete) setupMaskCanvasFromImage();
  $('#kreaMaskTitle').textContent = state.editEngine === 'krea2'
    ? 'Krea 2 inpaint area'
    : `${editEngineLabel(state.editEngine)} edit area`;
  $('#kreaMaskPrompt').value = '';
  $('#kreaBrushInput').value = String(state.kreaBrush);
  $('#kreaBrushVal').textContent = String(state.kreaBrush);
  $('#kreaMaskFeather').value = String(state.kreaMaskFeather);
  $('#kreaMaskFeatherVal').textContent = String(state.kreaMaskFeather);
  $('#kreaMaskErase').classList.toggle('active', state.kreaMaskErase);
  renderKreaMaskMode();
  renderMaskAdjustments();
  $('#kreaMaskSheet').classList.add('show');
}

function maskContentRect() {
  const stage = $('#kreaMaskStage');
  const rect = stage.getBoundingClientRect();
  const base = $('#kreaMaskBase');
  const iw = base.naturalWidth || $('#kreaMaskCanvas').width || 1;
  const ih = base.naturalHeight || $('#kreaMaskCanvas').height || 1;
  const scale = Math.min(rect.width / iw, rect.height / ih);
  const width = iw * scale;
  const height = ih * scale;
  return { left: (rect.width - width) / 2, top: (rect.height - height) / 2, width, height, stageRect: rect };
}

function maskPoint(e) {
  const canvas = $('#kreaMaskCanvas');
  const content = maskContentRect();
  const nx = Math.max(0, Math.min(1, (e.clientX - content.stageRect.left - content.left) / content.width));
  const ny = Math.max(0, Math.min(1, (e.clientY - content.stageRect.top - content.top) / content.height));
  return {
    x: nx * canvas.width,
    y: ny * canvas.height,
    nx,
    ny,
  };
}

function drawKreaMask(e) {
  if (!kreaMaskDrawing) return;
  e.preventDefault();
  const p = maskPoint(e);
  const canvas = $('#kreaMaskCanvas');
  const ctx = canvas.getContext('2d');
  if (state.kreaMaskTool === 'box') {
    const start = kreaMaskBoxStart || p;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.min(start.x, p.x), Math.min(start.y, p.y), Math.abs(p.x - start.x), Math.abs(p.y - start.y));
    state.kreaMaskKind = 'box';
    state.kreaMaskErase = false;
  } else {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = state.kreaBrush;
    ctx.globalCompositeOperation = state.kreaMaskErase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(kreaMaskLast ? kreaMaskLast.x : p.x, kreaMaskLast ? kreaMaskLast.y : p.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    kreaMaskLast = p;
    state.kreaMaskKind = 'brush';
  }
  state.kreaMaskDirty = true;
  state.kreaMaskPreview = canvas.toDataURL('image/png');
  state.kreaMaskInvert = false;
  renderMaskOverlay();
  refreshMaskCutoutPreview();
  scheduleMaskedRefPreview();
  renderKreaMaskTools();
}

function processedMaskCanvas() {
  const source = $('#kreaMaskCanvas');
  if (!source || !source.width || !source.height) return null;
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.save();
  const feather = Math.max(0, Math.min(64, Number(state.kreaMaskFeather) || 0));
  if (feather) ctx.filter = `blur(${feather}px)`;
  ctx.drawImage(source, 0, 0);
  ctx.restore();
  return out;
}

function renderMaskOverlay() {
  const overlay = $('#kreaMaskOverlayCanvas');
  const mask = processedMaskCanvas();
  if (!overlay || !mask) return;
  if (overlay.width !== mask.width || overlay.height !== mask.height) {
    overlay.width = mask.width;
    overlay.height = mask.height;
  }
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.drawImage(mask, 0, 0);
}

function invertKreaMask() {
  const canvas = $('#kreaMaskCanvas');
  if (!canvas || !canvas.width || !canvas.height || !hasEditMask()) return toast('Create a mask before inverting it', true);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    // Brush masks are transparent outside the stroke, while SAM3 returns an
    // opaque black-and-white image. Invert the effective luminance so both
    // representations produce the same visible, exportable inverse.
    const current = (image.data[i] * image.data[i + 3]) / 255;
    const value = 255 - current;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  state.kreaMaskPreview = canvas.toDataURL('image/png');
  state.kreaMaskDirty = true;
  state.kreaMaskInvert = false;
  renderMaskOverlay();
  refreshMaskCutoutPreview();
  scheduleMaskedRefPreview();
  renderKreaMaskTools();
  renderMaskAdjustments();
  saveForm();
}

function maskAlphaCanvas(mask) {
  const alpha = document.createElement('canvas');
  alpha.width = mask.width;
  alpha.height = mask.height;
  const ctx = alpha.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(mask, 0, 0);
  const image = ctx.getImageData(0, 0, alpha.width, alpha.height);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i + 3] = image.data[i];
    image.data[i] = 255;
    image.data[i + 1] = 255;
    image.data[i + 2] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return alpha;
}

function refreshMaskCutoutPreview() {
  const base = $('#kreaMaskBase');
  const cutout = $('#kreaMaskCutoutCanvas');
  const mask = processedMaskCanvas();
  if (!cutout || !mask || !base.complete || !base.naturalWidth) return;
  if (cutout.width !== mask.width || cutout.height !== mask.height) {
    cutout.width = mask.width;
    cutout.height = mask.height;
  }
  const ctx = cutout.getContext('2d');
  ctx.clearRect(0, 0, cutout.width, cutout.height);
  ctx.drawImage(base, 0, 0, cutout.width, cutout.height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(maskAlphaCanvas(mask), 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

let maskedRefPreviewFrame = null;
function scheduleMaskedRefPreview() {
  if (maskedRefPreviewFrame || !hasEditMask()) return;
  maskedRefPreviewFrame = requestAnimationFrame(() => {
    maskedRefPreviewFrame = null;
    updateMaskedRefPreview();
  });
}

function renderMaskAdjustments() {
  $('#kreaBrushInput').value = String(state.kreaBrush);
  $('#kreaBrushVal').textContent = String(state.kreaBrush);
  $('#kreaMaskFeatherVal').textContent = String(state.kreaMaskFeather);
  $('#kreaMaskFeather').value = String(state.kreaMaskFeather);
  $('#kreaMaskInvert').classList.remove('active');
  $('#kreaMaskInvert').setAttribute('aria-pressed', 'false');
  $('#kreaMaskPreviewToggle').classList.toggle('active', state.kreaMaskPreviewCutout);
  $('#kreaMaskPreviewToggle').setAttribute('aria-pressed', String(state.kreaMaskPreviewCutout));
  $('#kreaMaskStage').classList.toggle('preview-cutout', state.kreaMaskPreviewCutout);
  const gesture = $('#kreaMaskGesture');
  const preview = $('#kreaMaskBrushPreview');
  const values = $('#kreaMaskGestureValues');
  if (gesture && preview && values) {
    const diameter = Math.round(20 + (state.kreaBrush / 160) * 50);
    preview.style.setProperty('--brush-diameter', `${diameter}px`);
    preview.style.setProperty('--brush-feather', `${Math.round(3 + (state.kreaMaskFeather / 64) * 15)}px`);
    values.textContent = `${state.kreaBrush} px · Soft ${state.kreaMaskFeather}`;
  }
}

function renderSmartPointMode() {
  const include = state.kreaMaskPointForeground;
  $('#kreaMaskPointAdd').classList.toggle('active', include);
  $('#kreaMaskPointAdd').setAttribute('aria-pressed', String(include));
  $('#kreaMaskPointRemove').classList.toggle('active', !include);
  $('#kreaMaskPointRemove').setAttribute('aria-pressed', String(!include));
  $('#kreaMaskPointDelete').classList.toggle('active', state.kreaMaskPointDeleteMode);
  $('#kreaMaskPointDelete').setAttribute('aria-pressed', String(state.kreaMaskPointDeleteMode));
  $('#kreaMaskStage').classList.toggle('delete-points-mode', state.kreaMaskPointDeleteMode);
}

function renderSmartMaskPoints() {
  const layer = $('#kreaMaskPoints');
  if (!layer) return;
  layer.innerHTML = '';
  const content = maskContentRect();
  for (const [index, point] of state.kreaMaskPoints.entries()) {
    const dot = document.createElement('i');
    dot.className = `smart-mask-point${point.foreground === false ? ' negative' : ''}`;
    dot.dataset.pointIndex = String(index);
    dot.setAttribute('role', 'button');
    dot.setAttribute('aria-label', `${point.foreground === false ? 'Exclude' : 'Include'} selection point ${index + 1}. Drag to move; delete mode removes it.`);
    dot.tabIndex = 0;
    dot.style.left = `${content.left + point.x * content.width}px`;
    dot.style.top = `${content.top + point.y * content.height}px`;
    layer.append(dot);
  }
}

function rerunSmartMaskFromPoints() {
  if (state.kreaMaskPoints.length) runSmartMask();
  else clearKreaMask(true);
}

function beginSmartMaskPointDrag(event) {
  const dot = event.target.closest('.smart-mask-point');
  if (!dot || smartMaskRunning) return;
  const index = Number(dot.dataset.pointIndex);
  if (!Number.isInteger(index) || !state.kreaMaskPoints[index]) return;
  event.preventDefault();
  event.stopPropagation();
  if (state.kreaMaskPointDeleteMode) {
    state.kreaMaskPoints.splice(index, 1);
    renderSmartMaskPoints();
    rerunSmartMaskFromPoints();
    return;
  }
  smartMaskPointDrag = { pointerId: event.pointerId, index, moved: false, dot };
  dot.setPointerCapture?.(event.pointerId);
  dot.classList.add('dragging');
}

function moveSmartMaskPointDrag(event) {
  const drag = smartMaskPointDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const point = state.kreaMaskPoints[drag.index];
  if (!point) return;
  const next = maskPoint(event);
  point.x = next.nx;
  point.y = next.ny;
  drag.moved = true;
  const content = maskContentRect();
  drag.dot.style.left = `${content.left + point.x * content.width}px`;
  drag.dot.style.top = `${content.top + point.y * content.height}px`;
}

function finishSmartMaskPointDrag(event) {
  const drag = smartMaskPointDrag;
  if (!drag || (event && drag.pointerId !== event.pointerId)) return;
  drag.dot?.classList.remove('dragging');
  if (drag.dot?.hasPointerCapture?.(drag.pointerId)) drag.dot.releasePointerCapture(drag.pointerId);
  smartMaskPointDrag = null;
  renderSmartMaskPoints();
  if (drag.moved) rerunSmartMaskFromPoints();
}

let smartMaskRunning = false;
let smartMaskSlowTimer = null;
function setSmartMaskLoading(message) {
  const label = $('#kreaMaskLoadingText');
  if (label) label.textContent = message;
}
async function runSmartMask({ prompt = '', point = null } = {}) {
  if (smartMaskRunning) return;
  const ref = state.refs[0];
  if (!ref || !ref.name) return toast('Add a source image before using Smart Select', true);
  if (point) {
    state.kreaMaskPoints.push({ x: point.nx, y: point.ny, foreground: state.kreaMaskPointForeground });
    renderSmartMaskPoints();
  }
  const textPrompt = String(prompt || '').trim();
  if (!textPrompt && !state.kreaMaskPoints.length) return toast('Describe an object or tap the image', true);
  smartMaskRunning = true;
  setSmartMaskLoading('Starting Smart Select…');
  $('#kreaMaskLoading').hidden = false;
  clearTimeout(smartMaskSlowTimer);
  smartMaskSlowTimer = setTimeout(() => {
    if (smartMaskRunning) setSmartMaskLoading('Still loading SAM3 — first use can take a few minutes');
  }, 12000);
  try {
    const result = await api('/api/edit-mask/sam3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageName: ref.name,
        prompt: textPrompt,
        points: textPrompt ? [] : state.kreaMaskPoints,
      }),
    });
    const maskImages = await Promise.all((Array.isArray(result.dataUrls) && result.dataUrls.length
      ? result.dataUrls : [result.dataUrl]).map((src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not read the SAM3 mask'));
      image.src = src;
    })));
    const canvas = $('#kreaMaskCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    maskImages.forEach((image, index) => {
      ctx.globalCompositeOperation = index ? 'lighten' : 'source-over';
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    });
    ctx.globalCompositeOperation = 'source-over';
    state.kreaMaskPreview = canvas.toDataURL('image/png');
    state.kreaMaskDirty = true;
    state.kreaMaskInvert = false;
    state.kreaMaskKind = 'smart';
    renderMaskOverlay();
    refreshMaskCutoutPreview();
    scheduleMaskedRefPreview();
    renderKreaMaskTools();
  } catch (error) {
    if (point) state.kreaMaskPoints.pop();
    renderSmartMaskPoints();
    toast(error.message, true);
  } finally {
    smartMaskRunning = false;
    clearTimeout(smartMaskSlowTimer);
    smartMaskSlowTimer = null;
    $('#kreaMaskLoading').hidden = true;
  }
}

async function ensureKreaMaskUploaded() {
  if (!state.kreaMaskDirty && state.kreaMask && state.kreaMask.name) return state.kreaMask.name;
  const canvas = $('#kreaMaskCanvas');
  if (!canvas || !canvas.width || !canvas.height || !state.kreaMaskPreview) return '';
  const out = processedMaskCanvas();
  if (!out) return '';
  const blob = await new Promise((ok, bad) => out.toBlob((b) => (b ? ok(b) : bad(new Error('Mask export failed'))), 'image/png'));
  const res = await api('/api/upload', {
    method: 'POST',
    headers: { 'x-filename': encodeURIComponent('edit_mask.png') },
    body: await blob.arrayBuffer(),
  });
  state.kreaMask = { name: res.name, url: URL.createObjectURL(blob) };
  state.kreaMaskDirty = false;
  renderKreaMaskTools();
  return state.kreaMask.name;
}

function setMaskGestureValues(brush, feather, { announce = false } = {}) {
  state.kreaBrush = Math.max(12, Math.min(160, Math.round(Number(brush) / 4) * 4 || 48));
  state.kreaMaskFeather = Math.max(0, Math.min(64, Math.round(Number(feather) || 0)));
  if (hasEditMask()) state.kreaMaskDirty = true;
  renderMaskAdjustments();
  renderMaskOverlay();
  refreshMaskCutoutPreview();
  scheduleMaskedRefPreview();
  const live = $('#kreaMaskGestureLive');
  if (announce && live) live.textContent = `Brush Size ${state.kreaBrush} px · Brush Pressure ${state.kreaMaskFeather}`;
}

function finishMaskGesture() {
  if (!kreaMaskGesture) return;
  clearTimeout(kreaMaskGesture.timer);
  const wasAdjusting = kreaMaskGesture.active;
  const control = $('#kreaMaskGesture');
  control?.classList.remove('is-adjusting');
  if (control?.hasPointerCapture?.(kreaMaskGesture.pointerId)) control.releasePointerCapture(kreaMaskGesture.pointerId);
  kreaMaskGesture = null;
  if (wasAdjusting) saveForm();
}

function beginMaskGesture(event) {
  if (kreaMaskGesture) return;
  const control = $('#kreaMaskGesture');
  if (!control) return;
  const start = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    brush: state.kreaBrush,
    feather: state.kreaMaskFeather,
    active: false,
    timer: null,
  };
  kreaMaskGesture = start;
  control.setPointerCapture?.(event.pointerId);
  start.timer = setTimeout(() => {
    if (kreaMaskGesture !== start) return;
    start.active = true;
    control.classList.add('is-adjusting');
    $('#kreaMaskGestureLive').textContent = `Brush Size ${state.kreaBrush} px · Brush Pressure ${state.kreaMaskFeather}`;
    if (navigator.vibrate) navigator.vibrate(10);
  }, 180);
}

function moveMaskGesture(event) {
  const current = kreaMaskGesture;
  if (!current || current.pointerId !== event.pointerId) return;
  const dx = event.clientX - current.x;
  const dy = current.y - event.clientY;
  if (!current.active) {
    if (Math.hypot(dx, dy) > 12) finishMaskGesture();
    return;
  }
  event.preventDefault();
  setMaskGestureValues(current.brush + dy, current.feather + dx / 2, { announce: true });
}

function keyboardMaskGesture(event) {
  const key = event.key;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;
  event.preventDefault();
  const brush = state.kreaBrush + (key === 'ArrowUp' ? 4 : key === 'ArrowDown' ? -4 : 0);
  const feather = state.kreaMaskFeather + (key === 'ArrowRight' ? 2 : key === 'ArrowLeft' ? -2 : 0);
  setMaskGestureValues(brush, feather, { announce: true });
  saveForm();
}

$('#regionsPromptBtn').addEventListener('click', () => setCreateMode('region', true));
$('#regionAddBtn').addEventListener('click', () => {
  const region = createRegion();
  selectRegion(region, true);
  saveForm();
});
$('#regionDeleteBtn').addEventListener('click', () => {
  const region = selectedRegion();
  if (!region) return;
  state.regions = state.regions.filter((r) => r.id !== region.id);
  state.activeRegionId = state.regions[0] ? state.regions[0].id : null;
  renderRegionEditor();
  saveForm();
});
$('#regionDescInput').addEventListener('input', () => {
  const region = selectedRegion();
  if (!region) return;
  region.description = $('#regionDescInput').value;
  const active = $('#regionStage .region-box.active b');
  if (active) active.textContent = region.description || 'Region';
  saveForm();
});
$('#regionStrengthInput').addEventListener('input', () => {
  const region = selectedRegion();
  if (!region) return;
  region.strength = normalizeRegionStrength($('#regionStrengthInput').value);
  $('#regionStrengthVal').textContent = region.strength.toFixed(2);
  const badge = $('#regionLoraSlot .lc-strength');
  if (badge) badge.textContent = region.strength.toFixed(2);
});
$('#regionStrengthInput').addEventListener('change', saveForm);
$('#regionRefBtn').addEventListener('click', () => $('#regionRefInput').click());
$('#regionRefInput').addEventListener('change', () => uploadRegionReference($('#regionRefInput').files && $('#regionRefInput').files[0]));
$('#regionRefClear').addEventListener('click', () => {
  const region = selectedRegion();
  if (!region) return;
  region.refImageName = '';
  region.refUrl = '';
  renderRegionEditor();
  saveForm();
});
$('#regionSettingsClose').addEventListener('click', () => {
  regionSettingsOpen = false;
  syncRegionSettings(false);
});

$('#kreaMaskBtn').addEventListener('click', openKreaMaskPainter);
$('#kreaMaskClear').addEventListener('click', () => clearKreaMask());
$('#kreaMaskGesture').addEventListener('pointerdown', beginMaskGesture);
$('#kreaMaskGesture').addEventListener('pointermove', moveMaskGesture);
$('#kreaMaskGesture').addEventListener('pointerup', finishMaskGesture);
$('#kreaMaskGesture').addEventListener('pointercancel', finishMaskGesture);
$('#kreaMaskGesture').addEventListener('keydown', keyboardMaskGesture);
$('#kreaMaskCanvas').addEventListener('pointerdown', (e) => {
  if (state.kreaMaskTool === 'smart') {
    if (state.kreaMaskPointDeleteMode) return;
    if (!state.kreaMaskPreviewCutout) runSmartMask({ point: maskPoint(e) });
    return;
  }
  kreaMaskDrawing = true;
  kreaMaskLast = maskPoint(e);
  kreaMaskBoxStart = state.kreaMaskTool === 'box' ? kreaMaskLast : null;
  drawKreaMask(e);
});
$('#kreaMaskPoints').addEventListener('pointerdown', beginSmartMaskPointDrag);
$('#kreaMaskPoints').addEventListener('pointermove', moveSmartMaskPointDrag);
$('#kreaMaskPoints').addEventListener('pointerup', finishSmartMaskPointDrag);
$('#kreaMaskPoints').addEventListener('pointercancel', finishSmartMaskPointDrag);
$('#kreaMaskCanvas').addEventListener('pointermove', drawKreaMask);
document.addEventListener('pointerup', () => {
  kreaMaskDrawing = false;
  kreaMaskLast = null;
  kreaMaskBoxStart = null;
});
$('#kreaMaskSmartMode').addEventListener('click', () => {
  state.kreaMaskTool = 'smart';
  state.kreaMaskErase = false;
  state.kreaMaskPreviewCutout = false;
  renderKreaMaskMode();
  renderMaskAdjustments();
  saveForm();
});
$('#kreaMaskBrushMode').addEventListener('click', () => {
  state.kreaMaskTool = 'brush';
  state.kreaMaskPreviewCutout = false;
  renderKreaMaskMode();
  renderMaskAdjustments();
  saveForm();
});
$('#kreaMaskBoxMode').addEventListener('click', () => {
  state.kreaMaskTool = 'box';
  state.kreaMaskErase = false;
  state.kreaMaskPreviewCutout = false;
  renderKreaMaskMode();
  renderMaskAdjustments();
  saveForm();
});
$('#kreaMaskPointAdd').addEventListener('click', () => { state.kreaMaskPointForeground = true; state.kreaMaskPointDeleteMode = false; renderSmartPointMode(); });
$('#kreaMaskPointRemove').addEventListener('click', () => { state.kreaMaskPointForeground = false; state.kreaMaskPointDeleteMode = false; renderSmartPointMode(); });
$('#kreaMaskPointDelete').addEventListener('click', () => { state.kreaMaskPointDeleteMode = !state.kreaMaskPointDeleteMode; renderSmartPointMode(); });
$('#kreaMaskPromptRun').addEventListener('click', () => runSmartMask({ prompt: $('#kreaMaskPrompt').value }));
$('#kreaMaskPrompt').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); runSmartMask({ prompt: $('#kreaMaskPrompt').value }); }
});
$('#kreaBrushInput').addEventListener('input', () => {
  state.kreaBrush = Number($('#kreaBrushInput').value) || 48;
  renderMaskAdjustments();
  saveForm();
});
$('#kreaMaskErase').addEventListener('click', () => {
  state.kreaMaskErase = !state.kreaMaskErase;
  $('#kreaMaskErase').classList.toggle('active', state.kreaMaskErase);
});
$('#kreaMaskFeather').addEventListener('input', () => {
  state.kreaMaskFeather = Number($('#kreaMaskFeather').value) || 0;
  state.kreaMaskDirty = hasEditMask();
  renderMaskAdjustments();
  renderMaskOverlay();
  refreshMaskCutoutPreview();
  scheduleMaskedRefPreview();
  saveForm();
});
$('#editMaskInfluence').addEventListener('input', () => {
  state.editMaskInfluence = Math.max(25, Math.min(100, Math.round(Number($('#editMaskInfluence').value) || 78)));
  renderEditMaskAdvanced();
  saveForm();
});
$('#editMaskExpand').addEventListener('input', () => {
  state.editMaskExpand = Math.max(6, Math.min(32, Math.round(Number($('#editMaskExpand').value) || 14)));
  renderEditMaskAdvanced();
  saveForm();
});
$('#kreaMaskInvert').addEventListener('click', () => {
  invertKreaMask();
});
$('#kreaMaskPreviewToggle').addEventListener('click', () => {
  if (!hasEditMask()) return toast('Create a mask before previewing it', true);
  state.kreaMaskPreviewCutout = !state.kreaMaskPreviewCutout;
  refreshMaskCutoutPreview();
  renderMaskAdjustments();
});
$('#kreaMaskReset').addEventListener('click', () => clearKreaMask());
$('#kreaMaskApply').addEventListener('click', async () => {
  try {
    updateMaskedRefPreview();
    $('#kreaMaskSheet').classList.remove('show');
    renderKreaMaskTools();
    toast(hasEditMask() ? 'Edit area is active — changes stay inside the mask' : 'No edit area selected');
  } catch (e) { toast(e.message, true); }
});

/* The reference thumbnail shows a real cutout: selected pixels become
   transparent instead of receiving a decorative color tint. */
function updateMaskedRefPreview() {
  const ref = state.refs[0];
  const cutout = $('#kreaMaskCutoutCanvas');
  if (!ref || !cutout || !cutout.width || !state.kreaMaskPreview) return;
  refreshMaskCutoutPreview();
  ref.displayUrl = cutout.toDataURL('image/png');
  renderRefs();
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
    toast('Last frame removed');
  });
  endFrameRefresh[stateKey] = refresh;
}
wireEndFrame('vid', 'vidEnd');
wireEndFrame('anim', 'animEnd');

/* Swap first/last frame in the Video tab */
function updateSwapChip() {
  const swap = $('#vidSwap');
  const supportsEnd = state.vidEngine === 'ltx' || state.vidEngine === 'eros';
  const hasFirst = !!state.vidRef;
  const hasLast = !!state.vidEnd;
  swap.hidden = !supportsEnd || (!hasFirst && !hasLast);
  const label = hasFirst && hasLast
    ? 'Swap first and last'
    : (hasFirst ? 'Move to last frame' : 'Move to first frame');
  $('#vidSwapLabel').textContent = label;
  swap.setAttribute('aria-label', label);
}

function swapVideoFrames(message = 'First and last frames swapped') {
  [state.vidRef, state.vidEnd] = [state.vidEnd || null, state.vidRef || null];
  renderVidAttach();
  endFrameRefresh.vidEnd();
  updateVideoPanels();
  toast(message);
}

$('#vidSwap').addEventListener('click', () => {
  const message = state.vidRef && state.vidEnd
    ? 'First and last frames swapped'
    : (state.vidRef ? 'Image moved to the last frame' : 'Image moved to the first frame');
  swapVideoFrames(message);
});

let videoFrameDrag = null;
function clearVideoFrameDrag() {
  if (videoFrameDrag) clearTimeout(videoFrameDrag.timer);
  $$('.video-frame-slot.frame-reordering, .video-frame-slot.frame-drop-target')
    .forEach((slot) => slot.classList.remove('frame-reordering', 'frame-drop-target'));
  videoFrameDrag = null;
}

function wireVideoFrameDrag(slot, role) {
  slot.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.attach-x')) return;
    clearVideoFrameDrag();
    const drag = {
      pointerId: event.pointerId,
      role,
      target: role,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      timer: null,
    };
    videoFrameDrag = drag;
    drag.timer = setTimeout(() => {
      if (videoFrameDrag !== drag) return;
      drag.active = true;
      slot.classList.add('frame-reordering');
      try { slot.setPointerCapture(event.pointerId); } catch { /* noop */ }
      if (navigator.vibrate) navigator.vibrate(10);
    }, 300);
  });
  slot.addEventListener('pointermove', (event) => {
    const drag = videoFrameDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) clearVideoFrameDrag();
      return;
    }
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.video-frame-slot');
    const targetRole = target?.dataset.frameRole;
    $$('.video-frame-slot.frame-drop-target').forEach((item) => item.classList.remove('frame-drop-target'));
    drag.target = targetRole === 'start' || targetRole === 'end' ? targetRole : drag.role;
    if (drag.target !== drag.role) target.classList.add('frame-drop-target');
  }, { passive: false });
  const finish = (event) => {
    const drag = videoFrameDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.active && drag.target !== drag.role) {
      swapVideoFrames(state.vidRef && state.vidEnd
        ? 'First and last frames swapped'
        : `Image moved to the ${drag.target === 'start' ? 'first' : 'last'} frame`);
    }
    clearVideoFrameDrag();
  };
  slot.addEventListener('pointerup', finish);
  slot.addEventListener('pointercancel', clearVideoFrameDrag);
  slot.addEventListener('contextmenu', (event) => event.preventDefault());
}
wireVideoFrameDrag($('#vidAttachThumb'), 'start');
wireVideoFrameDrag($('#vidEndThumb'), 'end');

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
    durEl.dispatchEvent(new Event('input', { bubbles: true }));
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
      setAudioChipVisual(chip, false);
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
        setAudioChipVisual(chip, true);
        box.hidden = false;
        requestAnimationFrame(() => { drawWave(); layout(); });
      } catch (e) { toast('Could not read audio: ' + e.message, true); }
    });
    input.click();
  });
}
function setAudioChipVisual(chip, active) {
  chip.classList.toggle('active', active);
  const title = chip.querySelector('[data-audio-title]');
  const detail = chip.querySelector('[data-audio-detail]');
  if (title) {
    title.textContent = active ? 'Audio added' : 'Audio';
    if (detail) detail.textContent = active ? 'Tap to remove or replace' : 'Optional soundtrack';
  } else {
    chip.textContent = active ? '🎵 Audio ✓' : '🎵 Audio';
  }
}
window.addEventListener('resize', () => {
  Object.values(waveRedraw).forEach((fn) => fn());
});
wireAudioChip('vid', 'vidAudio', 'vidDur', 'vidDurVal');
wireAudioChip('anim', 'animAudio', 'animDur', 'animDurVal');

state.vidSigma = 'dmd';
state.animSigma = 'dmd';
state.vidSmooth = 1;
state.vidScailMode = 'infinity';
state.vidScailStableTracking = true;
state.vidScailChunkFrames = 81;
state.vidScailChunkOverlap = 13;
function renderScailChunkControls() {
  const row = $('#vidScailAdvancedRow');
  if (!row) return;
  $$('#vidScailModeRow .chip').forEach((x) => {
    x.classList.toggle('active', x.dataset.scailMode === state.vidScailMode);
  });
  const chunked = state.vidEngine === 'scail' && state.vidScailMode === 'chunked';
  row.hidden = !chunked;
  $('#vidScailStable').classList.toggle('active', state.vidScailStableTracking !== false);
  $$('#vidScailChunkRow .chip').forEach((x) => {
    x.classList.toggle('active', Number(x.dataset.scailChunkFrames) === Number(state.vidScailChunkFrames || 81));
  });
  $$('#vidScailOverlapRow .chip').forEach((x) => {
    x.classList.toggle('active', Number(x.dataset.scailOverlap) === Number(state.vidScailChunkOverlap || 13));
  });
}
$$('#vidFpsRow .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#vidFpsRow .chip').forEach((x) => x.classList.toggle('active', x === c));
  state.vidSmooth = Number(c.dataset.smooth) || 1;
}));
$$('#vidScailModeRow .chip').forEach((c) => c.addEventListener('click', () => {
  $$('#vidScailModeRow .chip').forEach((x) => x.classList.toggle('active', x === c));
  state.vidScailMode = ['infinity', 'chunked', 'direct'].includes(c.dataset.scailMode) ? c.dataset.scailMode : 'infinity';
  renderScailChunkControls();
  saveForm();
}));
$('#vidScailStable').addEventListener('click', () => {
  const isOn = state.vidScailStableTracking !== false;
  state.vidScailStableTracking = !isOn;
  renderScailChunkControls();
  saveForm();
});
$$('#vidScailChunkRow .chip').forEach((c) => c.addEventListener('click', () => {
  state.vidScailChunkFrames = Number(c.dataset.scailChunkFrames) || 81;
  renderScailChunkControls();
  saveForm();
}));
$$('#vidScailOverlapRow .chip').forEach((c) => c.addEventListener('click', () => {
  state.vidScailChunkOverlap = Number(c.dataset.scailOverlap) || 13;
  renderScailChunkControls();
  saveForm();
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

function selectedQwenAngleViews() {
  return QWEN_ANGLE_VIEWS
    .filter((view) => state.qwenAngles.includes(view.id))
    .map((view) => ({ view: view.id, elevation: state.qwenAngleElevation, distance: state.qwenAngleDistance }));
}

function createAngleGroupId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `angles-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function renderQwenAngleTool() {
  const button = $('#qwenAnglesBtn');
  const count = state.qwenAngles.length;
  button.classList.toggle('active', count > 0);
  button.setAttribute('aria-label', count ? `Camera angles, ${count} selected` : 'Camera angles');
  $('#qwenAngleCount').hidden = count === 0;
  $('#qwenAngleCount').textContent = String(count);
}

function renderQwenAngleMode() {
  const active = state.view === 'edit' && state.editEngine === 'qwen' && state.qwenAnglesMode;
  const inline = $('#qwenAnglesInline');
  const textPane = $('#qwenTextPromptPane');
  const promptBox = textPane.closest('.prompt-box');
  inline.classList.toggle('is-active', active);
  inline.setAttribute('aria-hidden', String(!active));
  inline.inert = !active;
  textPane.classList.toggle('is-collapsed', active);
  textPane.setAttribute('aria-hidden', String(active));
  textPane.inert = active;
  promptBox.classList.toggle('qwen-angles-active', active);
  const enhance = $('#enhanceBtn');
  enhance.hidden = state.view === 'video' && state.vidEngine === 'ltx-edit';
  enhance.classList.toggle('qwen-angle-faded', active);
  enhance.inert = active || enhance.hidden;
  $('#promptClear').hidden = active || !promptDraft().trim();
  $('#qwenAngleTool').hidden = !(state.view === 'edit' && state.editEngine === 'qwen') || active;
  $('#qwenAnglesModeBtn').setAttribute('aria-pressed', String(active));
  $('#qwenAnglesTextBtn').setAttribute('aria-pressed', String(!active));
  if (active) renderQwenAnglePicker();
}

function renderQwenAnglePicker() {
  const grid = $('#qwenAngleGrid');
  grid.replaceChildren();
  const slots = [
    'front-left', 'front', 'front-right',
    'left', 'subject', 'right',
    'back-left', 'back', 'back-right',
  ];
  slots.forEach((id) => {
    if (id === 'subject') {
      const center = document.createElement('div');
      center.className = 'qwen-angle-center';
      center.setAttribute('aria-hidden', 'true');
      grid.appendChild(center);
      return;
    }
    const view = QWEN_ANGLE_VIEWS.find((option) => option.id === id);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.angleView = id;
    button.className = 'qwen-angle-card' + (state.qwenAngles.includes(id) ? ' active' : '');
    button.textContent = view.label;
    button.setAttribute('aria-pressed', String(state.qwenAngles.includes(id)));
    button.addEventListener('click', () => {
      state.qwenAngles = state.qwenAngles.includes(id)
        ? state.qwenAngles.filter((selected) => selected !== id)
        : [...state.qwenAngles, id];
      renderQwenAnglePicker();
      renderQwenAngleTool();
      saveForm();
    });
    grid.appendChild(button);
  });
  const framingIcon = (id) => {
    const rect = id === 'close-up' ? 'x="5" y="5" width="14" height="14"'
      : (id === 'wide shot' ? 'x="2.5" y="8" width="19" height="8"' : 'x="7" y="7" width="10" height="10"');
    return `<svg class="qwen-framing-icon" viewBox="0 0 24 24" aria-hidden="true"><rect ${rect} rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  };
  const renderChoiceRow = (row, options, value, setValue) => {
    row.replaceChildren();
    options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = option.id === value ? 'active' : '';
      if (row.id === 'qwenDistanceRow') button.innerHTML = `${framingIcon(option.id)}<span>${option.label}</span>`;
      else button.textContent = option.label;
      button.setAttribute('aria-pressed', String(option.id === value));
      button.addEventListener('click', () => {
        setValue(option.id);
        renderQwenAnglePicker();
        saveForm();
      });
      row.appendChild(button);
    });
  };
  renderChoiceRow($('#qwenElevationRow'), QWEN_ANGLE_ELEVATIONS, state.qwenAngleElevation, (value) => { state.qwenAngleElevation = value; });
  renderChoiceRow($('#qwenDistanceRow'), QWEN_ANGLE_DISTANCES, state.qwenAngleDistance, (value) => { state.qwenAngleDistance = value; });
  const selected = state.qwenAngles.length;
  const allSelected = selected === QWEN_ANGLE_VIEWS.length;
  const allToggle = $('#qwenAnglesToggleAll');
  allToggle.textContent = allSelected ? 'Clear all' : 'Select all';
  allToggle.setAttribute('aria-pressed', String(allSelected));
  const elevation = QWEN_ANGLE_ELEVATIONS.find((option) => option.id === state.qwenAngleElevation)?.label.toLowerCase();
  const distance = QWEN_ANGLE_DISTANCES.find((option) => option.id === state.qwenAngleDistance)?.label.toLowerCase();
  $('#qwenAngleSummary').textContent = selected
    ? `${selected} angle export${selected === 1 ? '' : 's'} · ${elevation} · ${distance}`
    : 'No views selected';
}

function openQwenAngles() {
  if (state.editSequential) {
    state.editSequential = false;
    renderEditSequence();
  }
  state.qwenAnglesMode = true;
  renderQwenAngleMode();
  saveForm();
}
function closeQwenAngles() {
  state.qwenAnglesMode = false;
  renderQwenAngleMode();
}
$('#qwenAnglesBtn').addEventListener('click', openQwenAngles);
$('#qwenAnglesModeBtn').addEventListener('click', openQwenAngles);
$('#qwenAnglesTextBtn').addEventListener('click', closeQwenAngles);
$('#qwenAnglesToggleAll').addEventListener('click', () => {
  const allSelected = state.qwenAngles.length === QWEN_ANGLE_VIEWS.length;
  state.qwenAngles = allSelected ? [] : QWEN_ANGLE_VIEWS.map((view) => view.id);
  renderQwenAnglePicker();
  renderQwenAngleTool();
  saveForm();
});

function renderEnhance() {
  const btn = $('#enhanceBtn');
  btn.classList.toggle('on', state.enhance);
  btn.title = state.enhance ? 'Prompt enhance: on' : 'Prompt enhance: off';
}
$('#enhanceBtn').addEventListener('click', () => {
  state.enhance = !state.enhance;
  renderEnhance();
  saveForm();
});

function sequentialEditPrompts(value = promptForGeneration()) {
  return String(value || '')
    .trim()
    .split(/(?<=[.!?])\s+|\n+/)
    .map((step) => step.trim())
    .filter(Boolean);
}

function renderEditSequence() {
  const button = $('#editSequenceBtn');
  if (!button) return;
  const inEdit = state.view === 'edit';
  const engineSupported = SEQUENTIAL_EDIT_ENGINES.has(state.editEngine);
  const supported = inEdit && engineSupported;
  if (inEdit && !engineSupported) state.editSequential = false;
  button.hidden = !supported;
  button.setAttribute('aria-pressed', String(supported && state.editSequential));
  const steps = supported && state.editSequential ? sequentialEditPrompts() : [];
  const count = $('#editSequenceCount');
  count.hidden = !state.editSequential;
  count.textContent = String(steps.length);
  const tooltip = state.editSequential
    ? `Sequential edits on — ${steps.length || 0} sentence${steps.length === 1 ? '' : 's'}; each result feeds the next edit`
    : 'Sequential edits off — run the prompt as one edit';
  button.title = tooltip;
  button.setAttribute('aria-label', tooltip);
}

$('#editSequenceBtn').addEventListener('click', () => {
  if (!SEQUENTIAL_EDIT_ENGINES.has(state.editEngine)) return;
  state.editSequential = !state.editSequential;
  if (state.editSequential && state.qwenAnglesMode) closeQwenAngles();
  renderEditSequence();
  saveForm();
});

function updatePromptClear() {
  $('#promptClear').hidden = !promptDraft().trim();
}
$('#promptComposer').addEventListener('beforeinput', (event) => {
  if (state.view === 'edit' && event.inputType === 'insertText' && event.data === '@') {
    event.preventDefault();
    openPromptMentionPicker();
  }
});
$('#promptComposer').addEventListener('input', syncPromptDraftFromComposer);
$('#promptComposer').addEventListener('keyup', capturePromptSelection);
$('#promptComposer').addEventListener('mouseup', capturePromptSelection);
$('#promptComposer').addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove-prompt-ref]');
  if (!remove) return;
  const token = remove.closest('.prompt-ref-token');
  token.remove();
  syncPromptDraftFromComposer();
  $('#promptComposer').focus();
});
$('#promptClear').addEventListener('click', () => {
  setPromptDraft('');
  if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) state.prompts[state.view] = '';
  updatePromptClear();
  renderPromptSuggestions();
  $('#promptComposer').focus();
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
      setPromptDraft(state.prompts.create);
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

const CAMERA_WHEEL_KEYS = ['camera', 'lens', 'focalLength', 'aperture', 'shutter', 'iso'];
const cameraWheelScrollTimers = {};
let cameraWheelSyncing = false;

function clearCameraWheelScrollTimers() {
  Object.keys(cameraWheelScrollTimers).forEach((key) => {
    clearTimeout(cameraWheelScrollTimers[key]);
    delete cameraWheelScrollTimers[key];
  });
}

function setCameraSetting(key, value) {
  if (!CameraSettings) return;
  state.cameraSettings = CameraSettings.normalizeSettings(Object.assign({}, state.cameraSettings, { [key]: value }));
  renderCameraPicker();
  saveForm();
}

function updateCameraPreview() {
  const preview = $('#cameraPreview');
  if (preview) preview.textContent = CameraSettings.cameraPromptPhrase(state.cameraSettings);
}

function cameraMatchesSettings(settings) {
  const current = CameraSettings.normalizeSettings(state.cameraSettings);
  const next = CameraSettings.normalizeSettings(settings);
  return ['camera', 'lens', 'focalLength', 'aperture', 'shutter', 'iso']
    .every((key) => current[key] === next[key]);
}

function applyCameraCombo(comboId) {
  if (!CameraSettings) return;
  state.cameraSettings = CameraSettings.applyCameraCombo(comboId, state.cameraSettings);
  renderCameraPicker();
  saveForm();
}

function renderCameraCombos() {
  const row = $('#cameraComboGrid');
  if (!row || !CameraSettings) return;
  row.innerHTML = '';
  for (const combo of CameraSettings.CAMERA_COMBOS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'camera-combo' + (cameraMatchesSettings(combo.settings) ? ' active' : '');
    btn.innerHTML = `<b>${escapeHtml(combo.label)}</b><span>${escapeHtml(combo.note || '')}</span>`;
    btn.addEventListener('click', () => applyCameraCombo(combo.id));
    row.appendChild(btn);
  }
}

function updateCameraWheelActiveState(key) {
  const wheel = $(`[data-camera-wheel="${key}"]`);
  if (!wheel) return;
  wheel.querySelectorAll('.camera-wheel-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.value === state.cameraSettings[key]);
  });
}

function cameraWheelOptions(key) {
  if (key === 'camera') {
    return CameraSettings.CAMERA_PRESETS.map((item) => ({
      value: item.id,
      label: item.label,
      sub: item.tag || '',
    }));
  }
  if (key === 'lens') {
    return CameraSettings.LENS_PRESETS.map((item) => ({
      value: item.id,
      label: item.label,
      sub: item.tag || '',
    }));
  }
  if (key === 'focalLength') {
    return CameraSettings.FOCAL_LENGTHS.map((value) => ({ value, label: value, sub: 'mm' }));
  }
  if (key === 'aperture') {
    return CameraSettings.APERTURES.map((value) => ({ value, label: `f/${value}`, sub: 'aperture' }));
  }
  if (key === 'shutter') {
    return CameraSettings.SHUTTERS.map((value) => ({ value, label: `${value}s`, sub: 'shutter' }));
  }
  if (key === 'iso') {
    return CameraSettings.ISOS.map((value) => ({ value, label: `ISO ${value}`, sub: 'sensitivity' }));
  }
  return [];
}

function selectCameraWheelFromScroll(list) {
  const items = [...list.querySelectorAll('.camera-wheel-item')];
  if (!items.length) return null;
  const listRect = list.getBoundingClientRect();
  const center = listRect.top + (listRect.height / 2);
  let closest = items[0];
  let closestDistance = Infinity;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    const itemCenter = rect.top + (rect.height / 2);
    const distance = Math.abs(itemCenter - center);
    if (distance < closestDistance) {
      closest = item;
      closestDistance = distance;
    }
  }
  return closest.dataset.value || null;
}

function commitCameraWheelScroll(key, list) {
  if (!CameraSettings) return;
  const value = selectCameraWheelFromScroll(list);
  if (!value || state.cameraSettings[key] === value) return;
  state.cameraSettings = CameraSettings.normalizeSettings(Object.assign({}, state.cameraSettings, { [key]: value }));
  updateCameraWheelActiveState(key);
  renderCameraCombos();
  updateCameraPreview();
  saveForm();
}

function centerCameraWheels() {
  clearCameraWheelScrollTimers();
  cameraWheelSyncing = true;
  requestAnimationFrame(() => {
    $$('.camera-wheel-list').forEach((list) => {
      const active = list.querySelector('.camera-wheel-item.active');
      if (!active) return;
      list.scrollTop = Math.max(0, active.offsetTop - ((list.clientHeight - active.clientHeight) / 2));
    });
    setTimeout(() => {
      cameraWheelSyncing = false;
    }, 140);
  });
}

function renderCameraWheel(key) {
  const wheel = $(`[data-camera-wheel="${key}"]`);
  if (!wheel || !CameraSettings) return;
  const list = wheel.querySelector('.camera-wheel-list');
  if (!list) return;
  list.innerHTML = '';
  for (const option of cameraWheelOptions(key)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.value = option.value;
    btn.className = 'camera-wheel-item' + (state.cameraSettings[key] === option.value ? ' active' : '');
    btn.innerHTML = `<b>${escapeHtml(option.label)}</b><span>${escapeHtml(option.sub || '')}</span>`;
    btn.addEventListener('click', () => setCameraSetting(key, option.value));
    list.appendChild(btn);
  }
  if (list.dataset.cameraScrollWired !== '1') {
    list.dataset.cameraScrollWired = '1';
    list.addEventListener('scroll', () => {
      if (cameraWheelSyncing) return;
      clearTimeout(cameraWheelScrollTimers[key]);
      cameraWheelScrollTimers[key] = setTimeout(() => commitCameraWheelScroll(key, list), 90);
    }, { passive: true });
  }
}

function renderCameraPicker() {
  if (!CameraSettings) return;
  state.cameraSettings = CameraSettings.normalizeSettings(state.cameraSettings);
  clearCameraWheelScrollTimers();
  renderCameraCombos();
  CAMERA_WHEEL_KEYS.forEach(renderCameraWheel);
  updateCameraPreview();
  centerCameraWheels();
}

function openCameraPicker() {
  if (!CameraSettings) return;
  renderCameraPicker();
  $('#cameraSheet').classList.add('show');
}

function applyCameraPrompt() {
  if (!CameraSettings) return;
  const value = CameraSettings.applyCameraPrompt(promptDraft(), state.cameraSettings);
  setPromptDraft(value);
  if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) {
    state.prompts[state.view] = value;
  }
  updatePromptClear();
  renderPromptSuggestions();
  saveForm();
  $('#cameraSheet').classList.remove('show');
  toast('Camera settings added');
}

$('#cameraPromptBtn').addEventListener('click', openCameraPicker);
$('#cameraApply').addEventListener('click', applyCameraPrompt);

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

function renderAspects() {
  const row = $('#aspectRow');
  row.innerHTML = '';
  const matched = state.view === 'create' && state.createMode === 'image'
    ? matchedCreateOutputDimensions()
    : null;
  if (matched) {
    const source = document.createElement('button');
    source.type = 'button';
    source.className = 'aspect-chip create-match-aspect' + (state.createMatchSource && state.customDims ? ' active' : '');
    source.setAttribute('aria-label', `Match source image at ${matched.w} by ${matched.h}`);
    const ratio = matched.w / matched.h;
    const maxSide = 22;
    const w = ratio >= 1 ? maxSide : Math.max(7, Math.round(maxSide * ratio));
    const h = ratio >= 1 ? Math.max(7, Math.round(maxSide / ratio)) : maxSide;
    source.innerHTML = `<span class="ar-box" style="width:${w}px;height:${h}px"></span>Match image<small>${matched.w} × ${matched.h}</small>`;
    source.addEventListener('click', () => {
      applyCreateMatchedDimensions();
      renderAspects();
      renderDims();
      saveForm();
    });
    row.appendChild(source);
  }
  for (const a of ASPECTS) {
    const btn = document.createElement('button');
    btn.className = 'aspect-chip' + (a.label === state.aspect && !state.customDims ? ' active' : '');
    const maxSide = 22;
    const w = a.ar >= 1 ? maxSide : Math.round(maxSide * a.ar);
    const h = a.ar >= 1 ? Math.round(maxSide / a.ar) : maxSide;
    btn.innerHTML = `<span class="ar-box" style="width:${w}px;height:${h}px"></span>${a.label}`;
    btn.addEventListener('click', () => {
      state.aspect = a.label;
      state.createMatchSource = false;
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
  $('#resSummary').textContent = state.view === 'create' && state.createMode === 'image' && state.createMatchSource && matchedCreateOutputDimensions()
    ? `Match image · ${state.width} × ${state.height}`
    : (state.customDims
      ? `custom · ${state.width} × ${state.height}`
      : `${state.aspect} · ${state.width} × ${state.height}`);
  // Tiny aspect glyph shaped like the output
  const icon = $('#resAspectIcon');
  if (icon) {
    const ar = (state.width || 1) / (state.height || 1);
    const base = 15;
    const w = ar >= 1 ? base : Math.max(7, Math.round(base * ar));
    const h = ar >= 1 ? Math.max(7, Math.round(base / ar)) : base;
    icon.style.width = `${w}px`;
    icon.style.height = `${h}px`;
  }
  $$('#sizeSeg button').forEach((b) => b.classList.toggle('active', Number(b.dataset.mp) === state.mp && !state.customDims));
  syncRegionStageAspect();
}

function renderEditAspects() {
  const control = $('#editAspectControl');
  if (!control) return;
  const override = state.editAspectOverride;
  const matched = matchedEditOutputDimensions(state.refs[0]);
  $('#editAspectSummary').textContent = override
    ? `${state.editAspect} · ${state.editWidth} × ${state.editHeight}`
    : (matched ? `Match image · ${matched.w} × ${matched.h}` : 'Match first image');
  $('#editWInput').value = state.editWidth;
  $('#editHInput').value = state.editHeight;
  const row = $('#editAspectRow');
  row.innerHTML = '';
  const source = document.createElement('button');
  source.type = 'button';
  source.className = 'aspect-chip edit-aspect-source' + (!override ? ' active' : '');
  source.innerHTML = `<span class="ar-box edit-source-box"></span>Match image${matched ? `<small>${matched.w} × ${matched.h}</small>` : ''}`;
  source.addEventListener('click', () => {
    state.editAspectOverride = false;
    if (matched) {
      state.editWidth = matched.w;
      state.editHeight = matched.h;
    }
    renderEditAspects();
    saveForm();
  });
  row.appendChild(source);
  ASPECTS.forEach((a) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'aspect-chip' + (override && a.label === state.editAspect ? ' active' : '');
    const maxSide = 22;
    const w = a.ar >= 1 ? maxSide : Math.round(maxSide * a.ar);
    const h = a.ar >= 1 ? Math.round(maxSide / a.ar) : maxSide;
    btn.innerHTML = `<span class="ar-box" style="width:${w}px;height:${h}px"></span>${a.label}`;
    btn.addEventListener('click', () => {
      state.editAspectOverride = true;
      state.editAspect = a.label;
      const px = state.mp * 1e6;
      state.editWidth = round32(Math.sqrt(px * a.ar));
      state.editHeight = round32(Math.sqrt(px / a.ar));
      renderEditAspects();
      saveForm();
    });
    row.appendChild(btn);
  });
  const body = $('#editAspectBody');
  $('#editAspectToggle').classList.toggle('custom', override);
  body.classList.toggle('expanded', $('#editAspectToggle').getAttribute('aria-expanded') === 'true');
}

function matchedEditOutputDimensions(ref) {
  const width = Number(ref?.w);
  const height = Number(ref?.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const ratio = width / height;
  return {
    w: round32(Math.sqrt(1e6 * ratio)),
    h: round32(Math.sqrt(1e6 / ratio)),
  };
}

function upscaleFinishSettings() {
  const prefix = state.view === 'edit' ? 'edit' : 'create';
  return {
    prefix,
    enabled: state[`${prefix}UpscaleEnabled`] === true,
    resolution: state[`${prefix}UpscaleResolution`],
    profile: state[`${prefix}UpscaleProfile`],
    noise: state[`${prefix}UpscaleNoise`],
  };
}

function positionUpscaleFinish() {
  const control = $('#editUpscaleControl');
  const isEdit = state.view === 'edit';
  const isCreate = state.view === 'create';
  control.hidden = !(isEdit || isCreate);
  control.classList.toggle('is-create', isCreate);
  if (isEdit) {
    const refRow = $('#refRow');
    if (control.parentElement !== $('#refPanel') || control.nextElementSibling !== refRow) {
      $('#refPanel').insertBefore(control, refRow);
    }
  } else if (isCreate && (control.parentElement !== $('#view-create') || control.nextElementSibling !== $('#resPanel'))) {
    $('#view-create').insertBefore(control, $('#resPanel'));
  }
}

function renderEditUpscale() {
  positionUpscaleFinish();
  const control = $('#editUpscaleControl');
  const toggle = $('#editUpscaleToggle');
  const details = $('#editUpscaleDetails');
  const body = $('#editUpscaleBody');
  const settings = upscaleFinishSettings();
  const enabled = settings.enabled;
  const expanded = enabled && state[`${settings.prefix}UpscaleExpanded`] === true;
  toggle.setAttribute('aria-pressed', String(enabled));
  control.classList.toggle('is-enabled', enabled);
  details.disabled = !enabled;
  details.setAttribute('aria-expanded', String(expanded));
  details.setAttribute('aria-label', enabled
    ? `${expanded ? 'Hide' : 'Show'} upscale settings`
    : 'Enable Upscale from the switch to configure its settings');
  $('#editUpscaleSummary').textContent = enabled ? `SeedVR2 · ${settings.resolution === 3840 ? '4K' : `${settings.resolution}p`}` : 'Off';
  body.classList.toggle('expanded', expanded);
  body.inert = !expanded;
  body.setAttribute('aria-hidden', String(!expanded));
  $$('#editUpscaleResolution .chip').forEach((button) => button.classList.toggle('active', Number(button.dataset.resolution) === settings.resolution));
  $$('#editUpscaleProfile .chip').forEach((button) => button.classList.toggle('active', button.dataset.profile === settings.profile));
  $$('#editUpscaleNoise .chip').forEach((button) => button.classList.toggle('active', button.dataset.noise === settings.noise));
}

$('#editUpscaleToggle').addEventListener('click', () => {
  const { prefix, enabled } = upscaleFinishSettings();
  state[`${prefix}UpscaleEnabled`] = !enabled;
  if (enabled) state[`${prefix}UpscaleExpanded`] = false;
  renderEditUpscale();
  saveForm();
});
$('#editUpscaleDetails').addEventListener('click', () => {
  const { prefix, enabled } = upscaleFinishSettings();
  if (!enabled) return;
  state[`${prefix}UpscaleExpanded`] = !state[`${prefix}UpscaleExpanded`];
  renderEditUpscale();
  saveForm();
});
$$('#editUpscaleResolution .chip').forEach((button) => button.addEventListener('click', () => {
  const { prefix } = upscaleFinishSettings();
  state[`${prefix}UpscaleResolution`] = Number(button.dataset.resolution) || 2160;
  renderEditUpscale();
  saveForm();
}));
$$('#editUpscaleProfile .chip').forEach((button) => button.addEventListener('click', () => {
  const { prefix } = upscaleFinishSettings();
  state[`${prefix}UpscaleProfile`] = button.dataset.profile === 'balanced' ? 'balanced' : 'sharp';
  renderEditUpscale();
  saveForm();
}));
$$('#editUpscaleNoise .chip').forEach((button) => button.addEventListener('click', () => {
  const { prefix } = upscaleFinishSettings();
  state[`${prefix}UpscaleNoise`] = ['off', 'low', 'medium'].includes(button.dataset.noise) ? button.dataset.noise : 'low';
  renderEditUpscale();
  saveForm();
}));
$('#editAspectToggle').addEventListener('click', () => {
  const open = $('#editAspectToggle').getAttribute('aria-expanded') !== 'true';
  $('#editAspectToggle').setAttribute('aria-expanded', String(open));
  $('#editAspectBody').setAttribute('aria-hidden', String(!open));
  $('#editAspectBody').inert = !open;
  renderEditAspects();
});
for (const id of ['#editWInput', '#editHInput']) {
  $(id).addEventListener('change', () => {
    state.editAspectOverride = true;
    state.editWidth = round32(Number($('#editWInput').value) || 1024);
    state.editHeight = round32(Number($('#editHInput').value) || 1024);
    state.editAspect = 'custom';
    renderEditAspects();
    saveForm();
  });
}
$$('#sizeSeg button').forEach((b) => b.addEventListener('click', () => {
  state.mp = Number(b.dataset.mp);
  state.createMatchSource = false;
  state.customDims = false;
  computeDims();
  renderAspects();
  renderDims();
  saveForm();
}));
for (const id of ['#wInput', '#hInput']) {
  $(id).addEventListener('change', () => {
    state.createMatchSource = false;
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
    if (state.editEngine === 'krea2') return ['krea2', 'unknown'];
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

function loraContextProfile(name) {
  return name ? state.loraContext[name] || null : null;
}

function applyContextLoraDefault(lora) {
  const profile = loraContextProfile(lora && lora.name);
  if (!profile || !Number.isFinite(Number(profile.defaultStrength))) return;
  lora.strength = Number(profile.defaultStrength);
}

async function refreshLoraContext() {
  try {
    const data = await api('/api/context');
    state.loraContext = data.loras || {};
    renderLoras();
    renderContextPreferences();
  } catch {
    state.loraContext = {};
    renderPromptSuggestions();
  }
}

function generationDefaultsFromControls() {
  return {
    create: { steps: Number($('#defaultCreateSteps').value), cfg: Number($('#defaultCreateCfg').value), batch: Number($('#defaultCreateBatch').value) },
    edit: { steps: Number($('#defaultEditSteps').value), cfg: Number($('#defaultEditCfg').value), batch: Number($('#defaultEditBatch').value), denoise: Number($('#defaultEditDenoise').value) },
    video: { duration: Number($('#defaultVideoDuration').value), motionFreedom: Number($('#defaultVideoMotion').value) },
    seed: { mode: $('#defaultSeedMode .active')?.dataset.seedMode || 'random', value: Number($('#defaultSeedValue').value) || 0 },
  };
}

function renderGenerationDefaults() {
  const d = state.userDefaults;
  $('#defaultCreateSteps').value = d.create.steps;
  $('#defaultCreateCfg').value = d.create.cfg;
  $('#defaultCreateBatch').value = d.create.batch;
  $('#defaultEditSteps').value = d.edit.steps;
  $('#defaultEditCfg').value = d.edit.cfg;
  $('#defaultEditBatch').value = d.edit.batch;
  $('#defaultEditDenoise').value = d.edit.denoise;
  $('#defaultVideoDuration').value = d.video.duration;
  $('#defaultVideoMotion').value = d.video.motionFreedom;
  $('#defaultSeedValue').value = d.seed.value;
  $$('#defaultSeedMode button').forEach((button) => button.classList.toggle('active', button.dataset.seedMode === d.seed.mode));
  $('#defaultSeedValueField').hidden = d.seed.mode !== 'fixed';
}

function applyGenerationDefaults() {
  const d = state.userDefaults;
  const image = state.view === 'edit' ? d.edit : d.create;
  $('#stepsInput').value = image.steps;
  $('#cfgInput').value = image.cfg;
  $('#batchInput').value = image.batch;
  $('#denoiseInput').value = d.edit.denoise;
  $('#denoiseVal').textContent = Number(d.edit.denoise).toFixed(2);
  $('#seedInput').value = d.seed.mode === 'fixed' ? String(d.seed.value) : '';
  $('#vidDur').value = d.video.duration;
  $('#vidFree').value = d.video.motionFreedom;
  updateVideoTuningSummary();
}

async function loadUserPreferences() {
  try {
    const prefs = await api('/api/preferences');
    state.userDefaults = prefs.defaults || state.userDefaults;
    state.contextOverrides = prefs.contextOverrides || {};
    renderGenerationDefaults();
    applyGenerationDefaults();
  } catch { /* profile gate handles auth */ }
}

async function saveUserPreferences() {
  state.userDefaults = generationDefaultsFromControls();
  const prefs = await api('/api/preferences', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ defaults: state.userDefaults, contextOverrides: state.contextOverrides }),
  });
  state.userDefaults = prefs.defaults;
  state.contextOverrides = prefs.contextOverrides;
  renderGenerationDefaults();
  applyGenerationDefaults();
  await refreshLoraContext();
}

function renderContextPreferences() {
  const list = $('#contextPreferenceList');
  if (!list) return;
  list.replaceChildren();
  const entries = Object.entries(state.loraContext).sort(([a], [b]) => prettyLora(a).localeCompare(prettyLora(b)));
  if (!entries.length) {
    list.innerHTML = '<div class="queue-empty">No learned LoRA suggestions yet. They appear after a LoRA is used repeatedly with similar prompt phrases.</div>';
    return;
  }
  entries.forEach(([name, profile]) => {
    const override = state.contextOverrides[name] || {
      defaultStrength: profile.learnedDefaultStrength ?? profile.defaultStrength,
      suggestion: profile.learnedSuggestion ?? profile.suggestion,
    };
    const card = document.createElement('div');
    card.className = 'context-preference-card';
    const title = document.createElement('div');
    title.className = 'context-preference-title';
    title.innerHTML = `<strong>${escapeHtml(prettyLora(name))}</strong><small>${profile.uses || 0} uses</small>`;
    const strength = document.createElement('label');
    strength.innerHTML = '<span>Default strength</span>';
    const strengthInput = document.createElement('input');
    strengthInput.type = 'number'; strengthInput.min = '0'; strengthInput.max = '2'; strengthInput.step = '0.05';
    strengthInput.value = override.defaultStrength ?? profile.defaultStrength ?? 1;
    strengthInput.addEventListener('input', () => {
      state.contextOverrides[name] = { ...state.contextOverrides[name], defaultStrength: Number(strengthInput.value) };
    });
    strength.appendChild(strengthInput);
    const phrase = document.createElement('label');
    phrase.innerHTML = '<span>Prompt suggestion</span>';
    const phraseInput = document.createElement('input');
    phraseInput.type = 'text'; phraseInput.placeholder = 'No saved phrase';
    phraseInput.value = override.suggestion ?? profile.suggestion ?? '';
    phraseInput.addEventListener('input', () => {
      state.contextOverrides[name] = { ...state.contextOverrides[name], suggestion: phraseInput.value };
    });
    phrase.appendChild(phraseInput);
    const enabled = document.createElement('button');
    enabled.type = 'button'; enabled.className = 'context-preference-toggle';
    const syncEnabled = () => {
      const disabled = state.contextOverrides[name]?.disabled === true;
      enabled.classList.toggle('off', disabled);
      enabled.setAttribute('aria-pressed', String(!disabled));
      enabled.textContent = disabled ? 'Suggestion off' : 'Suggestion on';
    };
    enabled.addEventListener('click', () => {
      state.contextOverrides[name] = { ...state.contextOverrides[name], disabled: !(state.contextOverrides[name]?.disabled === true) };
      syncEnabled();
    });
    syncEnabled();
    const reset = document.createElement('button');
    reset.type = 'button'; reset.className = 'context-preference-reset'; reset.textContent = 'Reset learned values';
    reset.addEventListener('click', () => { delete state.contextOverrides[name]; renderContextPreferences(); });
    card.append(title, strength, phrase, enabled, reset);
    list.appendChild(card);
  });
}

function selectedPromptSuggestions() {
  const current = promptDraft().toLowerCase();
  const seen = new Set();
  const out = [];
  for (const lora of curLoras()) {
    if (!lora || !lora.on || !lora.name) continue;
    const profile = loraContextProfile(lora.name);
    const phrase = profile && profile.suggestion;
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key) || current.includes(key)) continue;
    seen.add(key);
    out.push({ phrase, lora: lora.name });
  }
  return out.slice(0, 3);
}

function appendPromptSuggestion(phrase) {
  const current = promptDraft().trim();
  const separator = current ? (/[,.!?;:]$/.test(current) ? ' ' : ', ') : '';
  const value = current + separator + phrase;
  setPromptDraft(value);
  if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) {
    state.prompts[state.view] = value;
  }
  updatePromptClear();
  renderPromptSuggestions();
  saveForm();
  $('#promptComposer').focus();
}

function renderPromptSuggestions() {
  const row = $('#contextPromptTools');
  if (!row) return;
  const suggestions = selectedPromptSuggestions();
  row.innerHTML = '';
  row.hidden = suggestions.length === 0;
  for (const suggestion of suggestions) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = `Add: ${suggestion.phrase}`;
    b.title = `${prettyLora(suggestion.lora)}: ${suggestion.phrase}`;
    b.addEventListener('click', () => appendPromptSuggestion(suggestion.phrase));
    row.appendChild(b);
  }
}

function renderLoraCompatibility() {
  const warn = $('#loraCompatWarn');
  if (!warn) return;
  const bad = incompatibleSelectedLoras();
  warn.classList.toggle('hidden', bad.length === 0);
  warn.textContent = bad.length ? `May not work here: ${bad.map((l) => prettyLora(l.name)).join(', ')}` : '';
  const allBtn = $('#loraAllBtn');
  if (allBtn) allBtn.classList.toggle('active', state.showAllLoras);
}

function loraThumbHtml(name, cls) {
  const thumb = state.loraThumbs && state.loraThumbs[name];
  if (thumb) return `<span class="${cls}"><img src="/lorathumbs/${thumb}" alt="" /></span>`;
  const initials = prettyLora(name || '?').slice(0, 2).toUpperCase();
  return `<span class="${cls}">${escapeHtml(initials)}</span>`;
}

function renderLoras() {
  const arr = curLoras();
  const list = $('#loraList');
  list.innerHTML = '';
  arr.forEach((l, idx) => {
    if (!l.name) { arr.splice(idx, 1); return; } // legacy empty rows
    const card = document.createElement('div');
    card.className = 'lora-card' + (l.on ? ' on' : '');
    card.innerHTML = `${loraThumbHtml(l.name, 'lc-thumb')}`
      + `<span class="lc-strength">${Number(l.strength).toFixed(2)}</span>`
      + `<button class="lc-menu" aria-label="LoRA options">⋯</button>`
      + `<span class="lc-name" title="${escapeHtml(prettyLora(l.name))}">${escapeHtml(prettyLora(l.name))}</span>`
      + `<span class="lc-adjust"></span>`;
    wireLoraCard(card, l, idx, arr);
    list.appendChild(card);
  });
  const add = document.createElement('button');
  add.className = 'lora-card add';
  add.type = 'button';
  add.textContent = '＋';
  add.setAttribute('aria-label', 'Add LoRA');
  add.addEventListener('click', () => openLoraPicker());
  list.appendChild(add);
  const loaded = arr.filter((l) => l && l.name).length;
  const active = arr.filter((l) => l && l.name && l.on).length;
  const summary = $('#loraSummary');
  if (summary) summary.textContent = active ? `${active} active` : (loaded ? `${loaded} loaded · off` : 'None selected');
  $('#loraHint').hidden = !arr.length;
  renderLoraCompatibility();
  renderPromptSuggestions();
}

/* Card interactions: tap toggles, hold (300ms) + slide up/down adjusts
   strength. The ⋯ menu handles thumbnail + remove. */
function wireLoraCard(card, l, idx, arr) {
  const menuBtn = card.querySelector('.lc-menu');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openActionMenu(menuBtn, [
      { label: '🖼 Set thumbnail', action: () => setLoraThumb(l.name) },
      { label: `Strength: ${Number(l.strength).toFixed(2)}`, action: () => {
        const v = window.prompt('Strength (0–2)', String(l.strength));
        if (v == null) return;
        l.strength = Math.max(0, Math.min(2, Number(v) || 0));
        krea2ManagedLoraChanged(l);
        renderLoras();
        saveForm();
      } },
      { label: l.managed === 'krea2-raw-turbo' ? 'Turn off Turbo LoRA' : 'Remove from stack', danger: true, action: () => {
        if (l.managed === 'krea2-raw-turbo') {
          l.on = false;
          krea2ManagedLoraChanged(l);
        } else {
          arr.splice(idx, 1);
        }
        renderLoras();
        saveForm();
      } },
    ]);
  });

  let holdTimer = null;
  let adjusting = false;
  let moved = false;
  let startY = 0;
  let lastY = 0;
  let pointerId = null;
  let startStrength = l.strength;
  const strengthEl = card.querySelector('.lc-strength');
  const adjustEl = card.querySelector('.lc-adjust');

  card.addEventListener('pointerdown', (e) => {
    if (e.target === menuBtn) return;
    moved = false;
    adjusting = false;
    startY = e.clientY;
    lastY = e.clientY;
    pointerId = e.pointerId;
    startStrength = Number(l.strength) || 0;
    holdTimer = setTimeout(() => {
      adjusting = true;
      card.classList.add('adjusting');
      adjustEl.textContent = startStrength.toFixed(2);
      try { card.setPointerCapture(pointerId); } catch { /* noop */ }
      if (navigator.vibrate) navigator.vibrate(10);
    }, 300);
    try { card.setPointerCapture(pointerId); } catch { /* noop */ }
  });
  card.addEventListener('pointermove', (e) => {
    if (e.cancelable) e.preventDefault();
    if (adjusting) {
      const dy = startY - e.clientY; // up = stronger
      l.strength = Math.max(0, Math.min(2, Math.round((startStrength + dy / 90) * 20) / 20));
      adjustEl.textContent = l.strength.toFixed(2);
      strengthEl.textContent = l.strength.toFixed(2);
    } else {
      const distance = Math.abs(e.clientY - startY);
      if (distance > 8) {
        moved = true;
        clearTimeout(holdTimer);
        window.scrollBy(0, lastY - e.clientY);
        lastY = e.clientY;
      }
    }
  }, { passive: false });
  const finish = () => {
    clearTimeout(holdTimer);
    // renderLoras() can change layout (e.g. prompt-suggestion chips appear
    // when a context LoRA activates) — keep the viewport where it was.
    const sy = window.scrollY;
    if (adjusting) {
      card.classList.remove('adjusting');
      adjusting = false;
      krea2ManagedLoraChanged(l);
      saveForm();
      renderLoras(); // refresh badge formatting
      window.scrollTo(0, sy);
    } else if (!moved) {
      l.on = !l.on;
      krea2ManagedLoraChanged(l);
      renderLoras();
      window.scrollTo(0, sy);
      saveForm();
    }
  };
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', () => {
    clearTimeout(holdTimer);
    if (adjusting) {
      const sy = window.scrollY;
      card.classList.remove('adjusting');
      adjusting = false;
      krea2ManagedLoraChanged(l);
      saveForm();
      renderLoras();
      window.scrollTo(0, sy);
    }
  });
  card.addEventListener('contextmenu', (e) => e.preventDefault());
}

/* Thumbnail: square-crop client-side, stored server-side per LoRA file */
function setLoraThumb(name) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('Could not read the image')); img.src = url; });
      const size = 256;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const s = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      c.getContext('2d').drawImage(img, (size - img.naturalWidth * s) / 2, (size - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      const blob = await new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Crop failed'))), 'image/jpeg', 0.85));
      const r = await api('/api/lorathumb', {
        method: 'POST',
        headers: { 'x-lora-name': encodeURIComponent(name) },
        body: blob,
      });
      state.loraThumbs = r.loraThumbs || {};
      renderLoras();
      toast('LoRA thumbnail saved');
    } catch (e) { toast(e.message, true); }
  });
  input.click();
}

/* Picker sheet: searchable list of available LoRAs. With no handler it
   adds to the current tab's stack; pass onPick to reuse it anywhere
   (regions, future engines). */
let loraPickHandler = null;
let loraPickAllowNone = false;
function openLoraPicker(onPick, opts) {
  loraPickHandler = typeof onPick === 'function' ? onPick : null;
  loraPickAllowNone = !!(opts && opts.allowNone);
  $('#loraPickTitle').textContent = (opts && opts.title) || 'Add LoRA';
  $('#loraSearch').value = '';
  renderLoraPicker('');
  $('#loraPickSheet').classList.add('show');
  syncSheetScrollLock();
}
function closeLoraPicker() {
  $('#loraPickSheet').classList.remove('show');
  syncSheetScrollLock();
}
function renderLoraPicker(query) {
  const listEl = $('#loraPickList');
  listEl.innerHTML = '';
  const q = query.trim().toLowerCase();
  const pick = (name) => {
    if (loraPickHandler) {
      loraPickHandler(name);
    } else {
      const l = { name, strength: 1, on: true };
      applyContextLoraDefault(l);
      curLoras().push(l);
      renderLoras();
      saveForm();
    }
    closeLoraPicker();
  };
  if (loraPickAllowNone && !q) {
    const none = document.createElement('button');
    none.className = 'lora-pick-row';
    none.innerHTML = '<span class="lp-thumb">–</span>None';
    none.addEventListener('click', () => pick(''));
    listEl.appendChild(none);
  }
  const inStack = loraPickHandler ? new Set() : new Set(curLoras().map((l) => l.name));
  const names = loraOptionsFor('').filter((n) => !inStack.has(n) && (!q || n.toLowerCase().includes(q)));
  if (!names.length && !loraPickAllowNone) {
    listEl.innerHTML = '<div class="queue-empty">No matching LoRAs.</div>';
    return;
  }
  for (const name of names.slice(0, 200)) {
    const row = document.createElement('button');
    row.className = 'lora-pick-row';
    row.innerHTML = `${loraThumbHtml(name, 'lp-thumb')}${escapeHtml(prettyLora(name))}`;
    row.addEventListener('click', () => pick(name));
    listEl.appendChild(row);
  }
}
$('#loraSearch').addEventListener('input', () => renderLoraPicker($('#loraSearch').value));
function prettyLora(name) { return name.replace(/\.safetensors$/i, '').split(/[\\/]/).pop(); }
function editEngineLabel(engine) {
  if (engine === 'krea2') return 'Krea2';
  if (engine === 'krea2ref') return 'Krea 2 Edit';
  if (engine === 'qwen') return 'Qwen Edit';
  if (engine === 'klein9') return 'Flux Klein 9B';
  return 'Flux Klein 4B';
}
$('#addLora').addEventListener('click', () => openLoraPicker());
$('#loraAllBtn').addEventListener('click', () => {
  state.showAllLoras = !state.showAllLoras;
  renderLoras();
  if ($('#loraPickSheet').classList.contains('show')) renderLoraPicker($('#loraSearch').value);
  toast(state.showAllLoras ? 'Showing every LoRA' : 'Filtering to compatible LoRAs');
});

/* Collapsible resolution panel: header shows the pick; choosing an
   aspect or size collapses it again. */
function collapseRes(open) {
  const expand = open === true;
  const body = $('#resBody');
  $('#resPanel').classList.toggle('expanded', expand);
  body.inert = !expand;
  body.setAttribute('aria-hidden', String(!expand));
  $('#resHeader').setAttribute('aria-expanded', String(expand));
}
$('#resHeader').addEventListener('click', () => collapseRes(!$('#resPanel').classList.contains('expanded')));
$('#aspectRow').addEventListener('click', (e) => {
  if (e.target.closest('button')) setTimeout(() => collapseRes(false), 140);
});
$('#sizeSeg').addEventListener('click', (e) => {
  if (e.target.closest('button')) setTimeout(() => collapseRes(false), 140);
});

function setVideoOptionsExpanded(open) {
  const expand = open === true;
  const body = $('#vidOptsBody');
  $('#vidOptsPanel').classList.toggle('expanded', expand);
  body.inert = !expand;
  body.setAttribute('aria-hidden', String(!expand));
  $('#vidOptsHeader').setAttribute('aria-expanded', String(expand));
}
$('#vidOptsHeader').addEventListener('click', () => {
  setVideoOptionsExpanded(!$('#vidOptsPanel').classList.contains('expanded'));
});

function setVideoModelExpanded(open) {
  const expand = open === true;
  const body = $('#vidModelBody');
  $('#vidModelPanel').classList.toggle('expanded', expand);
  body.inert = !expand;
  body.setAttribute('aria-hidden', String(!expand));
  $('#vidModelHeader').setAttribute('aria-expanded', String(expand));
}
$('#vidModelHeader').addEventListener('click', () => {
  setVideoModelExpanded(!$('#vidModelPanel').classList.contains('expanded'));
});

function setVideoTimingExpanded(open) {
  const expand = open === true;
  const body = $('#vidTimingBody');
  $('#vidTimingPanel').classList.toggle('expanded', expand);
  body.inert = !expand;
  body.setAttribute('aria-hidden', String(!expand));
  $('#vidTimingHeader').setAttribute('aria-expanded', String(expand));
}
$('#vidTimingHeader').addEventListener('click', () => {
  setVideoTimingExpanded(!$('#vidTimingPanel').classList.contains('expanded'));
});

function updateVideoTuningSummary() {
  const durationInput = $('#vidDur');
  const duration = Number(durationInput.value) || 1;
  const motion = Number($('#vidFree').value) || 0;
  const motionVisible = !$('#vidFreeField').hidden;
  const summary = motionVisible ? `${duration}s · motion ${motion}` : `${duration}s`;
  $('#vidTimingSummary').textContent = summary;
  $('#vidControlsNote').textContent = summary;
  $('#vidDurVal').textContent = String(duration);
  $('#vidDurPrev').textContent = String(Math.max(Number(durationInput.min) || 1, duration - (Number(durationInput.step) || 1)));
  $('#vidDurNext').textContent = String(Math.min(Number(durationInput.max) || 15, duration + (Number(durationInput.step) || 1)));
  $('#vidFreeVal').textContent = String(motion);
  $('#vidFreePrev').textContent = String(Math.max(Number($('#vidFree').min) || 0, motion - (Number($('#vidFree').step) || 1)));
  $('#vidFreeNext').textContent = String(Math.min(Number($('#vidFree').max) || 100, motion + (Number($('#vidFree').step) || 1)));
  $('#vidDurScrub').setAttribute('aria-valuenow', String(duration));
  $('#vidDurScrub').setAttribute('aria-valuemax', $('#vidDur').max || '15');
  $('#vidFreeScrub').setAttribute('aria-valuenow', String(motion));
}

function renderVideoValueWheel(inputId, wheelId) {
  const input = $('#' + inputId);
  const wheel = $('#' + wheelId);
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Number(input.step) || 1;
  const currentValue = Number(input.value);
  const current = Number.isFinite(currentValue) ? currentValue : min;
  wheel.replaceChildren();
  for (let value = min; value <= max; value += step) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'duration-wheel-option' + (value === current ? ' active' : '');
    option.dataset.videoValue = String(value);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(value === current));
    option.textContent = String(value);
    option.addEventListener('click', () => {
      setVideoScrubValue(input, value);
      renderVideoValueWheel(inputId, wheelId);
      centerVideoValueWheel(wheelId);
    });
    wheel.appendChild(option);
  }
}

function centerVideoValueWheel(wheelId) {
  const active = $('#' + wheelId + ' .duration-wheel-option.active');
  if (active) active.scrollIntoView({ block: 'center', behavior: 'auto' });
}

function syncVideoValueWheelFromScroll(inputId, wheelId) {
  const input = $('#' + inputId);
  const wheel = $('#' + wheelId);
  const options = $$('#' + wheelId + ' .duration-wheel-option');
  if (!options.length) return;
  const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
  const nearest = options.reduce((best, option) => {
    const rect = option.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - center);
    return !best || distance < best.distance ? { option, distance } : best;
  }, null);
  if (!nearest) return;
  const value = Number(nearest.option.dataset.videoValue);
  if (value !== Number(input.value)) setVideoScrubValue(input, value);
  options.forEach((option) => {
    const active = option === nearest.option;
    option.classList.toggle('active', active);
    option.setAttribute('aria-selected', String(active));
  });
}

function wireVideoValueWheel(inputId, wheelId) {
  let frame = 0;
  $('#' + wheelId).addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      syncVideoValueWheelFromScroll(inputId, wheelId);
    });
  }, { passive: true });
}

wireVideoValueWheel('vidDur', 'durationWheel');
wireVideoValueWheel('vidFree', 'motionWheel');

function openDurationPicker() {
  renderVideoValueWheel('vidDur', 'durationWheel');
  $('#durationPickerSheet').classList.add('show');
  requestAnimationFrame(() => centerVideoValueWheel('durationWheel'));
}

function openMotionPicker() {
  renderVideoValueWheel('vidFree', 'motionWheel');
  $('#motionPickerSheet').classList.add('show');
  requestAnimationFrame(() => centerVideoValueWheel('motionWheel'));
}

$('#durationPickerDone').addEventListener('click', () => $('#durationPickerSheet').classList.remove('show'));
$('#motionPickerDone').addEventListener('click', () => $('#motionPickerSheet').classList.remove('show'));

function setVideoScrubValue(input, value) {
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Number(input.step) || 1;
  const next = Math.max(min, Math.min(max, Math.round(value / step) * step));
  if (Number(input.value) === next) return;
  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function wireVideoScrubber(buttonId, inputId, onTap) {
  const button = $('#' + buttonId);
  const input = $('#' + inputId);
  let drag = null;
  button.addEventListener('pointerdown', (event) => {
    drag = { id: event.pointerId, y: event.clientY, value: Number(input.value), moved: false };
    button.classList.add('adjusting');
    try { button.setPointerCapture(event.pointerId); } catch { /* noop */ }
  });
  button.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const delta = Math.round((drag.y - event.clientY) / 10);
    if (delta) drag.moved = true;
    setVideoScrubValue(input, drag.value + delta * (Number(input.step) || 1));
    event.preventDefault();
  });
  const finish = () => {
    const wasTap = drag && !drag.moved;
    drag = null;
    button.classList.remove('adjusting');
    if (wasTap && onTap) onTap();
  };
  button.addEventListener('pointerup', finish);
  button.addEventListener('pointercancel', finish);
  button.addEventListener('wheel', (event) => {
    event.preventDefault();
    setVideoScrubValue(input, Number(input.value) + (event.deltaY < 0 ? 1 : -1) * (Number(input.step) || 1));
  }, { passive: false });
  button.addEventListener('keydown', (event) => {
    let next = null;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = Number(input.value) + (Number(input.step) || 1);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = Number(input.value) - (Number(input.step) || 1);
    else if (event.key === 'Home') next = Number(input.min);
    else if (event.key === 'End') next = Number(input.max);
    if (next == null) return;
    event.preventDefault();
    setVideoScrubValue(input, next);
  });
  button.addEventListener('click', (event) => {
    if (event.detail === 0 && onTap) onTap();
  });
}

wireVideoScrubber('vidDurScrub', 'vidDur', openDurationPicker);
wireVideoScrubber('vidFreeScrub', 'vidFree', openMotionPicker);

function setLorasExpanded(open) {
  const expand = open === true;
  const body = $('#loraBody');
  $('#loraPanel').classList.toggle('expanded', expand);
  body.inert = !expand;
  body.setAttribute('aria-hidden', String(!expand));
  $('#loraHeader').setAttribute('aria-expanded', String(expand));
}
$('#loraHeader').addEventListener('click', () => {
  setLorasExpanded(!$('#loraPanel').classList.contains('expanded'));
});

function setAdvancedExpanded(open) {
  const expand = open === true;
  const body = $('#advBody');
  $('#advPanel').classList.toggle('expanded', expand);
  body.inert = !expand;
  body.setAttribute('aria-hidden', String(!expand));
  $('#advHeader').setAttribute('aria-expanded', String(expand));
}
$('#advHeader').addEventListener('click', () => {
  setAdvancedExpanded(!$('#advPanel').classList.contains('expanded'));
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
  // Krea2 inpaint uses a single source image — hide the unused slots
  const kreaEdit = state.editEngine === 'krea2';
  const maxSlots = kreaEdit ? 1 : state.refs.length;
  state.refs.slice(0, maxSlots).forEach((ref, idx) => {
    const slot = document.createElement('div');
    slot.className = 'ref-slot' + (ref ? ' filled' : '');
    slot.dataset.refIndex = String(idx);
    const num = document.createElement('span');
    num.className = 'ref-num';
    num.textContent = String(idx + 1);
    slot.appendChild(num);
    if (ref) {
      const img = document.createElement('img');
      img.src = (idx === 0 && ref.displayUrl) || ref.url;
      const x = document.createElement('button');
      x.className = 'ref-x';
      x.textContent = '✕';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        state.refs[idx] = null;
        if (idx === 0) clearKreaMask(true);
        renderRefs();
      });
      slot.append(img, x);
      wireRefReorder(slot, idx, maxSlots);
    } else {
      slot.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2v-6Z"/></svg>');
      slot.addEventListener('click', () => pickRef(idx));
    }
    row.appendChild(slot);
  });
  if (state.view === 'edit') renderEditAspects();
  renderPromptComposer();
}

let refReorder = null;
function clearRefReorder() {
  if (!refReorder) return;
  clearTimeout(refReorder.timer);
  $$('.ref-slot.ref-drop-target, .ref-slot.ref-reordering')
    .forEach((el) => el.classList.remove('ref-drop-target', 'ref-reordering'));
  refReorder = null;
}

function wireRefReorder(slot, index, maxSlots) {
  if (maxSlots < 2) return;
  slot.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.ref-x')) return;
    clearRefReorder();
    const drag = { pointerId: event.pointerId, from: index, active: false, target: index, timer: null };
    refReorder = drag;
    try { slot.setPointerCapture(event.pointerId); } catch {}
    drag.timer = setTimeout(() => {
      if (refReorder !== drag) return;
      drag.active = true;
      slot.classList.add('ref-reordering');
    }, 280);
  });
  slot.addEventListener('pointermove', (event) => {
    const drag = refReorder;
    if (!drag || drag.pointerId !== event.pointerId || !drag.active) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.ref-slot');
    const targetIndex = Number(target?.dataset.refIndex);
    if (!Number.isInteger(targetIndex) || targetIndex === drag.target) return;
    $$('.ref-slot.ref-drop-target').forEach((el) => el.classList.remove('ref-drop-target'));
    drag.target = targetIndex;
    target?.classList.add('ref-drop-target');
  });
  const finish = (event) => {
    const drag = refReorder;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.active && drag.target !== drag.from) {
      if (drag.from === 0 || drag.target === 0) clearKreaMask(true);
      [state.refs[drag.from], state.refs[drag.target]] = [state.refs[drag.target], state.refs[drag.from]];
      renderRefs();
      saveForm();
    }
    clearRefReorder();
  };
  slot.addEventListener('pointerup', finish);
  slot.addEventListener('pointercancel', clearRefReorder);
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
      const url = URL.createObjectURL(file);
      const dims = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ w: image.naturalWidth, h: image.naturalHeight });
        image.onerror = () => resolve({ w: 0, h: 0 });
        image.src = url;
      });
      state.refs[idx] = { name: res.name, url, w: dims.w, h: dims.h };
      if (idx === 0) clearKreaMask(true);
      renderRefs();
    } catch (e) { toast(e.message, true); }
  });
  input.click();
}

async function sendToVideoTab(item, role = 'start') {
  try {
    const enabled = enabledVideoEngines();
    if (role === 'end' && !['ltx', 'eros'].includes(state.vidEngine)) {
      const endEngine = ['ltx', 'eros'].find((engine) => enabled.includes(engine));
      if (!endEngine) throw new Error('Enable LTX 2.3 or 10Eros to use a gallery image as the last frame');
      state.vidEngine = endEngine;
    } else if (role === 'start' && state.vidEngine === 'ltx-edit') {
      state.vidEngine = ['ltx', 'eros', 'wan', 'scail'].find((engine) => enabled.includes(engine)) || state.vidEngine;
    }
    const blob = await (await fetch('/images/' + item.file)).blob();
    const buf = await blob.arrayBuffer();
    const res = await api('/api/upload', {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent(item.file) },
      body: buf,
    });
    const frame = { name: res.name, url: '/images/' + item.file, w: item.width || 1024, h: item.height || 1024, srcItemId: item.id };
    if (role === 'end') state.vidEnd = frame;
    else state.vidRef = frame;
    closeAnimateRouteSheet();
    closeLightbox();
    setView('video');
    renderVidAttach();
    if (endFrameRefresh.vidEnd) endFrameRefresh.vidEnd();
    updateVideoPanels();
    toast(role === 'end'
      ? 'Image set as the last frame — choose the first frame and video settings'
      : 'Image set as the first frame — choose video settings');
  } catch (e) { toast(e.message, true); }
}

function openAnimateRouteSheet(item) {
  state.animateRouteTarget = item;
  $('#animateRouteSheet').classList.add('show');
}
function closeAnimateRouteSheet() {
  $('#animateRouteSheet').classList.remove('show');
  state.animateRouteTarget = null;
}
$('#animateRouteClose').addEventListener('click', closeAnimateRouteSheet);
$('#animateRouteSheet').addEventListener('click', (event) => {
  if (event.target === $('#animateRouteSheet')) closeAnimateRouteSheet();
});
$('#animateRouteStart').addEventListener('click', () => {
  const item = state.animateRouteTarget;
  if (item) sendToVideoTab(item, 'start');
});
$('#animateRouteEnd').addEventListener('click', () => {
  const item = state.animateRouteTarget;
  if (item) sendToVideoTab(item, 'end');
});

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
    const d = { name: res.name, url, label: 'from gallery', hasAudio: res.hasAudio === true };
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
    state.refs[slot === -1 ? 0 : slot] = {
      name: res.name, url: '/images/' + item.file, srcItemId: item.id,
      w: item.width || 0, h: item.height || 0,
    };
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
let livePreviewSwipe = null;
let livePreviewDismissTimer = null;

function resetLivePreviewMotion() {
  clearTimeout(livePreviewDismissTimer);
  const preview = $('#livePreview');
  preview.classList.remove('swiping', 'dismissing');
  preview.style.transform = '';
  preview.style.opacity = '';
  livePreviewSwipe = null;
}

function dismissLivePreview(direction = 1) {
  const preview = $('#livePreview');
  if (!preview.classList.contains('show')) return;
  clearTimeout(livePreviewDismissTimer);
  preview.classList.remove('swiping');
  preview.classList.add('dismissing');
  preview.style.transform = `translateX(${direction * (window.innerWidth + 40)}px)`;
  preview.style.opacity = '0';
  livePreviewDismissTimer = setTimeout(() => {
    preview.classList.remove('show');
    resetLivePreviewMotion();
  }, 180);
}

function settleLivePreviewSwipe() {
  const preview = $('#livePreview');
  preview.classList.remove('swiping');
  preview.style.transform = '';
  preview.style.opacity = '';
  livePreviewSwipe = null;
}

$('#liveDismiss').addEventListener('click', () => dismissLivePreview(1));
$('#livePreview').addEventListener('pointerdown', (event) => {
  if (event.target.closest('#liveDismiss') || event.button !== 0) return;
  livePreviewSwipe = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastAt: performance.now(),
    velocityX: 0,
    active: false,
  };
});
$('#livePreview').addEventListener('pointermove', (event) => {
  const swipe = livePreviewSwipe;
  if (!swipe || swipe.pointerId !== event.pointerId) return;
  const dx = event.clientX - swipe.startX;
  const dy = event.clientY - swipe.startY;
  if (!swipe.active) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (Math.abs(dy) >= Math.abs(dx)) { livePreviewSwipe = null; return; }
    swipe.active = true;
    $('#livePreview').classList.add('swiping');
    try { $('#livePreview').setPointerCapture(event.pointerId); } catch { /* noop */ }
  }
  const now = performance.now();
  const elapsed = Math.max(1, now - swipe.lastAt);
  swipe.velocityX = (event.clientX - swipe.lastX) / elapsed;
  swipe.lastX = event.clientX;
  swipe.lastAt = now;
  $('#livePreview').style.transform = `translateX(${dx}px)`;
  $('#livePreview').style.opacity = String(Math.max(0.28, 1 - Math.abs(dx) / 260));
});
$('#livePreview').addEventListener('pointerup', (event) => {
  const swipe = livePreviewSwipe;
  if (!swipe || swipe.pointerId !== event.pointerId) return;
  const dx = event.clientX - swipe.startX;
  if (swipe.active && (Math.abs(dx) >= 72 || Math.abs(swipe.velocityX) >= 0.55)) {
    dismissLivePreview(dx < 0 ? -1 : 1);
  } else {
    settleLivePreviewSwipe();
  }
});
$('#livePreview').addEventListener('pointercancel', settleLivePreviewSwipe);
$('#livePreviewImg').addEventListener('error', () => $('#livePreviewImg').removeAttribute('src'));
$('#denoiseInput').addEventListener('input', () => { $('#denoiseVal').textContent = Number($('#denoiseInput').value).toFixed(2); });

/* Video tab: inline source-image attachment */
function renderVidAttach() {
  const has = !!state.vidRef;
  const editAnything = state.vidEngine === 'ltx-edit';
  $('#vidAttachBtn').hidden = editAnything || has || !!state.vidFace;
  $('#vidAttachThumb').hidden = editAnything || !has;
  $('#vidMotionPromptBtn').hidden = editAnything || !has;
  if (has) {
    $('#vidAttachImg').src = state.vidRef.url;
    $('#vidAttachDims').textContent = `${state.vidRef.w} × ${state.vidRef.h} — aspect follows the image`;
  }
  if (typeof updateSwapChip === 'function') updateSwapChip();
  renderVidFace();
}

/* LTX Face ID: a reference face whose identity drives a text-to-video gen */
function renderVidFace() {
  const ltx = state.vidEngine === 'ltx';
  const ltxEdit = state.vidEngine === 'ltx-edit';
  const ltxFamily = ltx || ltxEdit;
  const has = !!state.vidFace;
  const faceMode = ltx && has;
  // Face ID is t2v-based: hide it when a source image (i2v) is attached,
  // and hide the end-frame chip while a face is attached (not supported).
  $('#vidFaceChip').hidden = !ltx || has || !!state.vidRef;
  $('#vidFaceThumb').hidden = !ltx || !has;
  // The end-frame renderer owns the card/preview swap. Do not re-show the
  // empty input card after swapping while an end frame is already attached.
  $('#vidEndChip').hidden = faceMode || ltxEdit || !!state.vidEnd;
  if (has) {
    $('#vidFaceImg').src = state.vidFace.url;
    $('#vidFaceLabel').textContent = state.vidFace.label
      ? `${state.vidFace.label} — identity drives the video`
      : "this person's identity drives the video";
  }
  // RIFE can smooth any LTX, Wan, or SCAIL output. Motion freedom stays
  // specific to standard LTX only.
  const wanOrScail = state.vidEngine === 'wan' || state.vidEngine === 'scail';
  $('#vidFpsRow').hidden = !(ltxFamily || wanOrScail);
  $('#vidFreeField').hidden = wanOrScail || ltxEdit || faceMode;
  renderVideoFpsChoices();
  if (ltxFamily) {
    $('#vidLtxGenerationRow').hidden = false;
    $('#vidLtxPlaybackRow').hidden = false;
    $('#vidLtxGeneration').textContent = ltxEdit
      ? 'Video-guided · Edit Anything'
      : (faceMode ? 'Single-stage · Face ID' : 'Two-stage · base + refine');
    const nativeFps = faceMode ? 24 : 25;
    $('#vidLtxPlayback').textContent = state.vidSmooth > 1
      ? `${nativeFps * state.vidSmooth} fps · RIFE ${state.vidSmooth}×`
      : `${nativeFps} fps · native`;
  }
  const labels = { ltx: 'LTX 2.3', 'ltx-edit': 'LTX Edit', eros: '10Eros DMD', wan: 'Wan 2.2', scail: 'SCAIL 2' };
  const notes = {
    ltx: faceMode ? 'Face ID · 24 fps' : '25 fps · audio',
    'ltx-edit': 'guide video · exact prompt',
    eros: '24 fps · image required',
    wan: '16 fps · image required',
    scail: '16 fps · motion transfer',
  };
  $('#vidEngineSelected').textContent = labels[state.vidEngine] || labels.ltx;
  $('#vidEngineNote').textContent = notes[state.vidEngine] || notes.ltx;
  updateVideoTuningSummary();
}

function renderVideoFpsChoices() {
  const ltx = state.vidEngine === 'ltx' || state.vidEngine === 'ltx-edit';
  const baseFps = ltx ? (state.vidFace ? 24 : 25) : 16;
  $$('#vidFpsRow .chip').forEach((chip) => {
    const multiplier = Number(chip.dataset.smooth) || 1;
    chip.textContent = multiplier === 1 ? `${baseFps} fps` : `${baseFps * multiplier} fps · RIFE`;
  });
}
$('#vidFaceChip').addEventListener('click', () => openFaceSheet());
$('#vidFaceSwap').addEventListener('click', () => openFaceSheet());
$('#vidFaceImg').addEventListener('click', () => openFaceSheet());
$('#vidFaceX').addEventListener('click', () => {
  state.vidFace = null;
  renderVidAttach();
});

/* ---------------- Face ID library (named, reusable faces) ------------ */
let faceLibrary = [];
async function openFaceSheet() {
  $('#faceSheet').classList.add('show');
  try {
    const r = await api('/api/faces');
    faceLibrary = r.faces || [];
  } catch (e) { toast(e.message, true); }
  renderFaceGrid();
}
function renderFaceGrid() {
  const grid = $('#faceGrid');
  grid.innerHTML = '';
  $('#faceEmpty').hidden = !!faceLibrary.length;
  faceLibrary.forEach((face) => {
    const card = document.createElement('div');
    card.className = 'face-card' + (state.vidFace && state.vidFace.faceId === face.id ? ' active' : '');
    const img = document.createElement('img');
    img.src = '/faces/' + face.file;
    img.alt = face.name;
    img.addEventListener('click', () => useFace(face));
    const name = document.createElement('button');
    name.className = 'face-name';
    name.textContent = face.name;
    name.addEventListener('click', async () => {
      const next = window.prompt('Rename this face', face.name);
      if (!next || next.trim() === face.name) return;
      try {
        const r = await api('/api/faces/' + face.id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: next.trim() }),
        });
        faceLibrary = r.faces || [];
        if (state.vidFace && state.vidFace.faceId === face.id) {
          state.vidFace.label = next.trim();
          renderVidFace();
        }
        renderFaceGrid();
      } catch (e) { toast(e.message, true); }
    });
    const del = document.createElement('button');
    del.className = 'face-del';
    del.textContent = '🗑';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!window.confirm(`Delete "${face.name}" from the library?`)) return;
      try {
        const r = await api('/api/faces/' + face.id, { method: 'DELETE' });
        faceLibrary = r.faces || [];
        renderFaceGrid();
      } catch (e2) { toast(e2.message, true); }
    });
    card.append(img, name, del);
    grid.appendChild(card);
  });
}
async function useFace(face) {
  try {
    toast(`Loading ${face.name}…`);
    // Fresh upload from the local library copy — ComfyUI's input dir may
    // have been cleaned since this face was first uploaded.
    const blob = await (await fetch('/faces/' + face.file)).blob();
    const buf = await blob.arrayBuffer();
    const res = await api('/api/upload', {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent(face.name.replace(/[^\w]+/g, '_') + '.png') },
      body: buf,
    });
    state.vidFace = { name: res.name, url: URL.createObjectURL(blob), label: face.name, faceId: face.id };
    $('#faceSheet').classList.remove('show');
    renderVidAttach();
    toast(`${face.name} set as the Face ID reference`);
  } catch (e) { toast(e.message, true); }
}
$('#faceUploadBtn').addEventListener('click', () => {
  pickUpload('image/*', async (f) => {
    const suggested = (f.label || 'Face').replace(/\.[^.]+$/, '').slice(0, 40);
    const name = (window.prompt('Name this face', suggested) || suggested).trim() || 'Face';
    try {
      const r = await api('/api/faces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, imageName: f.name }),
      });
      faceLibrary = r.faces || [];
      const saved = faceLibrary.find((x) => x.name === name) || faceLibrary[0];
      state.vidFace = { name: f.name, url: f.url, label: name, faceId: saved && saved.id };
      $('#faceSheet').classList.remove('show');
      renderVidAttach();
      toast(`${name} saved to the library and set as reference`);
    } catch (e) { toast(e.message, true); }
  });
});
$('#vidAttachBtn').addEventListener('click', () => pickVidRef());
$('#vidAttachX').addEventListener('click', () => {
  state.vidRef = null;
  renderVidAttach();
  updateVideoPanels();
});
$('#vidMotionPromptBtn').addEventListener('click', async () => {
  if (!state.vidRef || state.vidEngine === 'ltx-edit') return;
  const btn = $('#vidMotionPromptBtn');
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    toast('Reading the start frame…');
    const res = await api('/api/motionprompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageName: state.vidRef.name }),
    });
    if (!res.prompt) throw new Error('Vision model returned no usable motion prompt');
    state.prompts.video = res.prompt;
    setPromptDraft(res.prompt);
    updatePromptClear();
    saveForm();
    toast('Motion prompt created from the start frame');
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
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
$('#vidDur').addEventListener('input', updateVideoTuningSummary);
$('#vid4k').addEventListener('click', () => $('#vid4k').classList.toggle('active'));

/* SCAIL 2 driving-video attachment (+ trim + first-frame extract) */
state.vidDrive = null;
state.vidFace = null;
function renderVidDrive() {
  const scail = state.vidEngine === 'scail';
  const editAnything = state.vidEngine === 'ltx-edit';
  const usesGuideVideo = scail || editAnything;
  const has = !!state.vidDrive;
  $('#vidDriveBtn').hidden = !usesGuideVideo || has;
  $('#vidDriveThumb').hidden = !usesGuideVideo || !has;
  $('#vidDriveTools').hidden = !usesGuideVideo || !has;
  $('#vidDriveTrim').hidden = !usesGuideVideo || !has || !$('#vidDriveTrimChip').classList.contains('active');
  $('#vidDriveFrameChip').hidden = editAnything;
  $('#vidDriveTitle').textContent = editAnything ? 'Source video' : 'Motion video';
  $('#vidDriveSub').textContent = editAnything ? 'Required · video to edit' : 'Required · drives movement';
  $('#vidDriveFilledTitle').textContent = editAnything ? 'Source video' : 'Motion video';
  $('#vidAttachSub').textContent = scail
    ? 'required · the person to re-animate'
    : 'optional · image → video';
  if (usesGuideVideo && has) {
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
      f.w = probe.videoWidth || 0;
      f.h = probe.videoHeight || 0;
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
    durEl.dispatchEvent(new Event('input', { bubbles: true }));
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
  const ltxEdit = engine === 'ltx-edit';
  const ltxFamily = engine === 'ltx' || ltxEdit;
  $('#vidFreeField').hidden = wan || scail || ltxEdit;
  $('#vidQuality').hidden = !wan;
  $('#vidSigmaRow').hidden = engine !== 'eros';
  $('#vidFpsRow').hidden = !(ltxFamily || wan || scail);
  $('#vidScailModeRow').hidden = !scail;
  $('#vidLtxGenerationRow').hidden = !ltxFamily;
  $('#vidLtxPlaybackRow').hidden = !ltxFamily;
  $('#vidExtras').hidden = wan || scail || ltxEdit;
  // The Edit Anything workflow is trained on literal edit captions; do not
  // send those captions through the creative prompt enhancer.
  $('#enhanceBtn').hidden = ltxEdit;
  renderScailChunkControls();
  const dur = $('#vidDur');
  dur.max = scail ? 60 : 15;
  $('#vidDurScrub').setAttribute('aria-valuemax', dur.max);
  if (Number(dur.value) > Number(dur.max)) dur.value = dur.max;
  renderVidDrive();
  renderVidFace();
  updateVideoPanels();
  setTimeout(() => setVideoModelExpanded(false), 120);
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
  switchEditEngine(engine);
  if (engine === 'krea2' && Number($('#denoiseInput').value) <= 0.5) {
    // Keep enough source signal for the new content to inherit its surroundings.
    $('#denoiseInput').value = 0.78;
    $('#denoiseVal').textContent = '0.78';
  }
  renderRefs();
  updateVideoPanels();
  renderLoras();
  saveForm();
});
$('#editComposite').addEventListener('click', () => {
  const button = $('#editComposite');
  button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
});
$('#generateBtn').addEventListener('click', async () => {
  const prompt = promptForGeneration().trim();
  const hasRegionPrompts = state.view === 'create' && activeRegionsForRequest().some((r) => r.description);
  const qwenAngleExports = state.view === 'edit' && state.editEngine === 'qwen' && !state.editSequential && !hasEditMask()
    ? selectedQwenAngleViews() : [];
  const promptOptional = state.view === 'video' && state.vidEngine === 'scail';
  if (!prompt && !promptOptional && !hasRegionPrompts && !qwenAngleExports.length) return toast('Type a prompt first', true);

  if (state.view === 'video') {
    const ltxEdit = state.vidEngine === 'ltx-edit';
    if (!ltxEdit && state.vidEngine !== 'ltx' && !state.vidRef) {
      const lbl = { wan: 'Wan 2.2', eros: '10Eros DMD', scail: 'SCAIL 2' }[state.vidEngine];
      return toast(`${lbl} needs a source image — add one, or switch to LTX 2.3 for text-to-video`, true);
    }
    if (ltxEdit && !state.vidDrive) {
      return toast('LTX Edit needs the source video you want to edit', true);
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
      enhance: ltxEdit ? false : state.enhance,
      fourK: $('#vid4k').classList.contains('active'),
      fast: !$('#vidQuality').classList.contains('active'),
      motionFreedom: Number($('#vidFree').value),
      sigmaPreset: state.vidSigma,
      smooth: state.vidSmooth,
      scailMode: state.vidEngine === 'scail' ? state.vidScailMode : undefined,
      scailStableTracking: state.vidEngine === 'scail' ? state.vidScailStableTracking !== false : undefined,
      scailChunkFrames: state.vidEngine === 'scail' ? state.vidScailChunkFrames : undefined,
      scailChunkOverlap: state.vidEngine === 'scail' ? state.vidScailChunkOverlap : undefined,
      sourceItemId: state.vidRef ? state.vidRef.srcItemId : undefined,
      loras: state.videoLoras,
      audioName: vidAudioName,
      faceImageName: state.vidEngine === 'ltx' && state.vidFace && !state.vidRef ? state.vidFace.name : undefined,
      driveVideoName: (state.vidEngine === 'scail' || ltxEdit) && state.vidDrive ? state.vidDrive.name : undefined,
      driveHasAudio: state.vidEngine === 'scail' && state.vidDrive ? state.vidDrive.hasAudio === true : undefined,
      driveStartSeconds: (state.vidEngine === 'scail' || ltxEdit) && state.vidDrive ? state.vidDrive.trimStart || 0 : undefined,
      driveDurSeconds: (state.vidEngine === 'scail' || ltxEdit) && state.vidDrive && state.vidDrive.dur
        ? Math.max(0.5, (state.vidDrive.trimEnd || state.vidDrive.dur) - (state.vidDrive.trimStart || 0)) : undefined,
      endImageName: state.vidEnd ? state.vidEnd.name : undefined,
      imageName: state.vidRef ? state.vidRef.name : undefined,
      width: ltxEdit && state.vidDrive ? (state.vidDrive.w || state.width) : (state.vidRef ? state.vidRef.w : state.width),
      height: ltxEdit && state.vidDrive ? (state.vidDrive.h || state.height) : (state.vidRef ? state.vidRef.h : state.height),
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
  const sequenceSteps = mode === 'edit' && state.editSequential && SEQUENTIAL_EDIT_ENGINES.has(state.editEngine)
    ? sequentialEditPrompts(prompt)
    : [];
  if (state.editSequential && sequenceSteps.length < 2) {
    return toast('Sequential edits need at least two sentences', true);
  }
  const createImageGuide = mode === 't2i' && state.createMode === 'image' ? state.createRef : null;
  const krea2Raw = mode === 't2i' && state.createMode === 'image' && state.krea2Turbo === false;
  const seedRaw = $('#seedInput').value.trim();
  let maskImageName = '';
  if (mode === 'edit' && supportsCurrentEditMask() && hasEditMask()) {
    if (!state.refs[0]) return toast('A localized edit needs a source image in reference slot 1', true);
    try { maskImageName = await ensureKreaMaskUploaded(); }
    catch (e) { return toast(e.message, true); }
  }
  const localizedEdit = !!maskImageName;
  const upscaleFinish = mode === 'edit' ? {
    enabled: state.editUpscaleEnabled,
    resolution: state.editUpscaleResolution,
    profile: state.editUpscaleProfile,
    noise: state.editUpscaleNoise,
  } : {
    enabled: state.createUpscaleEnabled,
    resolution: state.createUpscaleResolution,
    profile: state.createUpscaleProfile,
    noise: state.createUpscaleNoise,
  };
  const body = {
    mode,
    editEngine: mode === 'edit' ? state.editEngine : undefined,
    krea2Turbo: !krea2Raw,
    krea2RawTurboLora: krea2Raw ? state.krea2RawTurboLora : undefined,
    composite: mode === 'edit' ? $('#editComposite').getAttribute('aria-pressed') === 'true' : undefined,
    prompt: sequenceSteps.length ? sequenceSteps[0] : prompt,
    editSequence: sequenceSteps.length ? { prompts: sequenceSteps } : undefined,
    enhance: state.enhance && mode === 't2i',
    width: mode === 'edit' && state.editAspectOverride && !localizedEdit ? state.editWidth : state.width,
    height: mode === 'edit' && state.editAspectOverride && !localizedEdit ? state.editHeight : state.height,
    editAspectOverride: mode === 'edit' && state.editAspectOverride && !localizedEdit,
    postUpscale: upscaleFinish.enabled ? {
      enabled: true,
      resolution: upscaleFinish.resolution,
      profile: upscaleFinish.profile,
      noise: upscaleFinish.noise,
    } : undefined,
    steps: Number($('#stepsInput').value) || (mode === 't2i' && state.krea2Turbo ? 8 : 12),
    cfg: Number($('#cfgInput').value) || 1,
    batch: sequenceSteps.length ? 1 : (Number($('#batchInput').value) || 1),
    denoise: mode === 'edit' ? Number($('#denoiseInput').value)
      : (createImageGuide ? createDenoiseFromInfluence() : 1),
    seed: seedRaw === '' ? undefined : Number(seedRaw),
    loras: mode === 'edit' ? state.editLoras : state.loras,
    refImages: mode === 'edit'
      ? state.refs.slice(0, state.editEngine === 'krea2' ? 1 : 3).filter(Boolean).map((r) => r.name)
      : [],
    imageName: createImageGuide ? createImageGuide.name : undefined,
    regions: activeRegionsForRequest(),
    maskImageName,
    editMaskMode: localizedEdit ? (state.kreaMaskKind || state.kreaMaskTool) : undefined,
    editMaskFeather: localizedEdit ? state.kreaMaskFeather : undefined,
    editMaskInvert: localizedEdit ? state.kreaMaskInvert : undefined,
    maskInfluence: localizedEdit ? state.editMaskInfluence : undefined,
    maskExpand: localizedEdit ? state.editMaskExpand : undefined,
    sourceItemId: mode === 'edit' && state.refs[0] ? state.refs[0].srcItemId
      : (createImageGuide ? createImageGuide.srcItemId : undefined),
    folder: state.activeFolder !== 'all' ? state.activeFolder : null,
  };
  try {
    const angleGroupId = qwenAngleExports.length > 1 ? createAngleGroupId() : null;
    const requests = qwenAngleExports.length
      ? qwenAngleExports.map((angle, index) => Object.assign({}, body, {
        qwenAngle: angle,
        angleGroupId,
        seed: seedRaw === '' ? undefined : Number(seedRaw) + index,
      }))
      : [body];
    setGenerating(true, sequenceSteps.length
      ? `Sequential edit 1 of ${sequenceSteps.length}…`
      : (requests.length > 1 ? `Queueing ${requests.length} angles…` : 'Queued…'));
    const jobIds = [];
    for (const request of requests) {
      const res = await api('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      jobIds.push(res.jobId);
      state.activeJobs.add(res.jobId);
    }
    $('#genLbl').textContent = genLabel();
    queueRefreshSoon();
    if (jobIds.length > 1) toast(`${jobIds.length} camera-angle exports queued`);
  } catch (e) {
    setGenerating(false);
    toast(e.message, true);
  }
});

function setGenerating(on, statusText) {
  if (on) {
    resetLivePreviewMotion();
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
function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
function renderQueueHealth(health) {
  const box = $('#queueHealth');
  if (!box) return;
  if (!health) {
    box.innerHTML = '<span class="health-dot unknown"></span><b>Health unavailable</b>';
    return;
  }
  const gpu = health.gpu || {};
  const memPct = gpu.memoryTotalMb ? Math.round((gpu.memoryUsedMb / gpu.memoryTotalMb) * 100) : null;
  const cls = health.state === 'stalled' ? 'bad' : (health.state === 'active' ? 'good' : (health.state === 'idle' ? 'idle' : 'watch'));
  const parts = [
    `<span class="health-dot ${cls}"></span>`,
    `<b>${escapeHtml(health.message || 'Queue health')}</b>`,
  ];
  if (gpu.utilization != null) parts.push(`<span>GPU ${Math.round(gpu.utilization)}%</span>`);
  if (memPct != null) parts.push(`<span>VRAM ${memPct}%</span>`);
  if (health.longestRunningMs) parts.push(`<span>Longest ${formatDuration(health.longestRunningMs)}</span>`);
  box.innerHTML = parts.join('');
}
function openFromQueue(itemId, videoId) {
  $('#queueSheet').classList.remove('show');
  const go = () => { setView('gallery'); openLightbox(itemId, videoId || 'image'); };
  if (state.items.some((i) => i.id === itemId)) go();
  else refreshGallery(true).then(go);
}
function renderQueue(q) {
  renderQueueHealth(q.health);
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
    const elapsed = j.elapsedMs != null ? formatDuration(j.elapsedMs) : '';
    st.textContent = j.run ? (pct != null ? pct + '%' : 'Running') : 'Queued';
    const lb = document.createElement('span');
    lb.className = 'q-label';
    lb.textContent = elapsed ? `${j.label} - ${elapsed}` : j.label;
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
      if (e.durationMs) lb.textContent += ` - ${formatDuration(e.durationMs)}`;
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

$('#queueResetBtn').addEventListener('click', async () => {
  if (!window.confirm('Hard reset ComfyUI? This stops the active job, clears queued jobs, and unloads model memory.')) return;
  const btn = $('#queueResetBtn');
  btn.disabled = true;
  try {
    const res = await api('/api/queue/reset', { method: 'POST' });
    state.queueProgress = {};
    toast(`Hard reset complete${res.clearedJobs ? ` - ${res.clearedJobs} tracked job${res.clearedJobs === 1 ? '' : 's'} cleared` : ''}`);
    await refreshQueue();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
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
    if (d.kind === 'smartMask' && smartMaskRunning) setSmartMaskLoading(d.text || 'Finding selection…');
    if (state.activeJobs.has(d.jobId) || d.jobId === 'pre') {
      $('#liveStatusText').innerHTML = `<span class="spin"></span> ${d.text}`;
    }
  });
  es.addEventListener('preview', (ev) => {
    const d = JSON.parse(ev.data);
    if (state.activeJobs.size && (!d.jobId || state.activeJobs.has(d.jobId))) $('#livePreviewImg').src = d.dataUrl;
  });
  es.addEventListener('sequenceStep', (ev) => {
    const d = JSON.parse(ev.data);
    if (state.activeJobs.has(d.jobId)) {
      state.activeJobs.delete(d.jobId);
      state.activeJobs.add(d.nextJobId);
      setGenerating(true, `Sequential edit ${d.nextStep} of ${d.total}…`);
      if (d.items && d.items[0]) $('#livePreviewImg').src = '/images/' + d.items[0].file;
    }
    toast(`Step ${d.completedStep} complete · running ${d.nextStep} of ${d.total}`);
    refreshGallery(true);
    queueRefreshSoon();
  });
  es.addEventListener('jobDone', (ev) => {
    const d = JSON.parse(ev.data);
    const compositeJob = state.compositeJobs.get(d.jobId);
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
        toast(d.sequenceComplete ? '✓ Sequential edits complete' : '✓ Generated');
      }
    }
    refreshGallery(true).then(() => {
      // Angle composites remain standalone gallery items. Take the person
      // straight to the saved result instead of leaving the result buried.
      if (compositeJob && d.items && d.items[0]) {
        state.compositeJobs.delete(d.jobId);
        setView('gallery');
        openLightbox(d.items[0].id);
      }
    });
    queueRefreshSoon();
  });
  es.addEventListener('imageCompositeDone', (ev) => {
    const d = JSON.parse(ev.data);
    state.compositeJobs.delete(d.jobId);
    if (state.activeJobs.has(d.jobId)) {
      state.activeJobs.delete(d.jobId);
      setGenerating(false);
    }
    $('#livePreviewImg').src = '/images/' + d.composite.file;
    $('#liveStatusText').textContent = 'Before + after saved — tap to view';
    $('#livePct').textContent = '';
    const open = () => {
      refreshGallery(true).then(() => {
        setView('gallery');
        openLightbox(d.item.id, 'composite:' + d.composite.id);
      });
    };
    $('#livePreviewImg').onclick = open;
    $('#liveStatusText').onclick = open;
    refreshGallery(true).then(open);
    queueRefreshSoon();
    toast('✓ Before + after saved');
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
    if (d.items && d.items.length) refreshGallery(true);
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
    await refreshLoraContext();
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
  let error = '';
  while (true) {
    const password = await openPrivateUnlockSheet(error);
    if (password == null) return false;
    try {
      await api('/api/private/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      state.privateUnlocked = true;
      await refreshGallery();
      toast('Locked folders shown');
      return true;
    } catch (e) {
      error = e.message;
    }
  }
}

let privateUnlockResolver = null;
function closePrivateUnlockSheet(password = null) {
  $('#privateUnlockSheet').classList.remove('show');
  const resolve = privateUnlockResolver;
  privateUnlockResolver = null;
  if (resolve) resolve(password);
}
function openPrivateUnlockSheet(error = '') {
  $('#privatePasswordInput').value = '';
  $('#privatePasswordError').textContent = error;
  $('#privatePasswordError').hidden = !error;
  $('#privateUnlockSheet').classList.add('show');
  setTimeout(() => $('#privatePasswordInput').focus(), 80);
  return new Promise((resolve) => { privateUnlockResolver = resolve; });
}
$('#privateUnlockClose').addEventListener('click', () => closePrivateUnlockSheet());
$('#privateUnlockSheet').addEventListener('click', (event) => {
  if (event.target === $('#privateUnlockSheet')) closePrivateUnlockSheet();
});
$('#privateUnlockForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const password = $('#privatePasswordInput').value;
  if (!password) {
    $('#privatePasswordError').textContent = 'Enter the gallery password.';
    $('#privatePasswordError').hidden = false;
    return;
  }
  closePrivateUnlockSheet(password);
});

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
    if (f.locked && !state.privateUnlocked) btn.textContent = `🔒 ${f.name}`;
    btn.addEventListener('click', async () => {
      if (f.locked && !state.privateUnlocked) {
        // Contents are hidden until unlocked — prompt for the gallery PIN
        await unlockPrivateGallery();
        if (!state.privateUnlocked) return;
      }
      state.activeFolder = f.id;
      renderFolders();
      renderGrid();
    });
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
  state.folderActionTarget = f;
  $('#folderActionsTitle').textContent = f.name;
  $('#folderActionsCopy').textContent = f.locked
    ? 'This folder is hidden whenever the gallery is locked.'
    : 'Lock this folder to hide its contents until the gallery is unlocked.';
  $('#folderLockAction').textContent = f.locked ? 'Unlock folder' : 'Lock folder';
  $('#folderActionsSheet').classList.add('show');
}

function closeFolderActionsSheet() {
  $('#folderActionsSheet').classList.remove('show');
  state.folderActionTarget = null;
}
$('#folderActionsClose').addEventListener('click', closeFolderActionsSheet);
$('#folderActionsSheet').addEventListener('click', (event) => {
  if (event.target === $('#folderActionsSheet')) closeFolderActionsSheet();
});
$('#folderLockAction').addEventListener('click', async () => {
  const f = state.folderActionTarget;
  if (!f) return;
  try {
    if (!state.privateUnlocked) {
      const unlocked = await unlockPrivateGallery();
      if (!unlocked || !state.privateUnlocked) return;
    }
    await api(`/api/folders/${f.id}/private`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: !f.locked }),
    });
    if (state.activeFolder === f.id && !f.locked) state.activeFolder = 'all';
    closeFolderActionsSheet();
    await refreshGallery();
    toast(f.locked ? 'Folder unlocked' : 'Folder locked');
  } catch (e) { toast(e.message, true); }
});
$('#folderMergeAction').addEventListener('click', () => {
  const f = state.folderActionTarget;
  closeFolderActionsSheet();
  if (f) mergeFolder(f);
});
$('#folderDeleteAction').addEventListener('click', () => {
  const f = state.folderActionTarget;
  closeFolderActionsSheet();
  if (f) deleteFolder(f);
});

async function mergeFolder(f) {
  if (f.locked && !state.privateUnlocked) {
    await unlockPrivateGallery();
    if (!state.privateUnlocked) return;
  }
  const others = state.folders.filter((x) => x.id !== f.id);
  const names = ['none (All)', ...others.map((x) => x.name)];
  const pick = window.prompt(`Merge "${f.name}" into which folder?\n${names.join(', ')}`, names[1] || 'none (All)');
  if (!pick) return;
  const target = pick.trim().toLowerCase() === 'none (all)' || pick.trim().toLowerCase() === 'none'
    ? null
    : others.find((x) => x.name.toLowerCase() === pick.trim().toLowerCase());
  if (target === undefined) return toast('No folder with that name', true);
  if (!window.confirm(`Move everything from "${f.name}" ${target ? `into "${target.name}"` : 'out of folders'} and remove "${f.name}"?`)) return;
  try {
    const r = await api(`/api/folders/${f.id}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ into: target ? target.id : null }),
    });
    if (state.activeFolder === f.id) state.activeFolder = target ? target.id : 'all';
    await refreshGallery();
    toast(`Merged ${r.moved} item${r.moved === 1 ? '' : 's'} ${target ? `into ${target.name}` : 'to All'}`);
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

function videoEngineLabel(engine) {
  return {
    ltx: 'LTX 2.3',
    'ltx-edit': 'LTX Edit',
    eros: '10Eros DMD',
    wan: 'Wan 2.2',
    scail: 'SCAIL 2',
  }[engine] || 'LTX 2.3';
}

function galleryImageModelLabel(item) {
  if (!item) return '';
  if (item.mode === 'edit') return editEngineLabel(item.editEngine || 'klein4');
  if (item.mode === 't2i') return item.krea2Turbo === false ? 'Krea 2 Raw' : 'Krea 2 Turbo';
  return '';
}

function latestGalleryVideo(item) {
  const videos = Array.isArray(item && item.videos) ? item.videos : [];
  return videos.reduce((newest, video) => {
    if (!newest) return video;
    return Number(video.createdAt || 0) >= Number(newest.createdAt || 0) ? video : newest;
  }, null);
}

function librarySearchText(it) {
  const folder = state.folders.find((entry) => entry.id === it.folder);
  const loras = (it.loras || []).map((lora) => lora && lora.name).filter(Boolean);
  const regions = (it.regions || []).flatMap((region) => [region && region.description, region && region.lora]).filter(Boolean);
  const videoText = (it.videos || []).flatMap((video) => {
    const info = (video && video.info) || {};
    return [info.engine, info.motionPrompt, info.refinedMotionPrompt];
  }).filter(Boolean);
  return [
    it.prompt,
    it.refinedPrompt,
    it.mode,
    galleryImageModelLabel(it),
    it.compositeInfo && it.compositeInfo.label,
    it.file,
    folder && folder.name,
    ...loras,
    ...regions,
    ...videoText,
    ...(it.videos || []).map((video) => videoEngineLabel(video && video.info && video.info.engine)),
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

function matchesLibrarySearch(it, query) {
  const terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = librarySearchText(it);
  return terms.every((term) => text.includes(term));
}

function visibleItems() {
  const arr = state.items.filter((it) => {
    if (state.activeFolder !== 'all' && it.folder !== state.activeFolder) return false;
    if (state.likesOnly && !it.liked) return false;
    const hasVideos = it.videos && it.videos.length;
    if (state.mediaFilter === 'videos' && !hasVideos) return false;
    if (state.mediaFilter === 'images' && hasVideos) return false;
    return matchesLibrarySearch(it, state.libraryQuery);
  });
  if (state.sortMode === 'old') arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  else if (state.sortMode === 'az') arr.sort((a, b) => (a.prompt || '').localeCompare(b.prompt || ''));
  else if (state.sortMode === 'active') arr.sort((a, b) => itemActivity(b) - itemActivity(a));
  else arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return arr;
}

/* Multi-angle Qwen exports are generated as separate jobs so each view has
   its own reliable result and settings, but they present as one gallery set. */
function galleryEntries(items) {
  const entries = [];
  const byAngleGroup = new Map();
  items.forEach((item) => {
    const groupId = item.angleGroupId;
    if (!groupId) {
      entries.push({ item, items: [item] });
      return;
    }
    let entry = byAngleGroup.get(groupId);
    if (!entry) {
      entry = { item, items: [item], angleGroupId: groupId };
      byAngleGroup.set(groupId, entry);
      entries.push(entry);
    } else {
      entry.items.push(item);
    }
  });
  return entries;
}

function angleGroupItems(item) {
  if (!item || !item.angleGroupId) return [];
  return state.items
    .filter((candidate) => candidate.angleGroupId === item.angleGroupId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function angleViewLabel(item) {
  const id = item && item.angleView && item.angleView.view;
  return QWEN_ANGLE_VIEWS.find((view) => view.id === id)?.label || 'Angle';
}

function angleViewGlyph(item) {
  return ({
    'front-left': '↖', front: '↑', 'front-right': '↗', left: '←', right: '→',
    'back-left': '↙', back: '↓', 'back-right': '↘',
  })[item && item.angleView && item.angleView.view] || '•';
}

function galleryNavigationTarget(item, direction) {
  const entries = galleryEntries(visibleItems());
  const entryIndex = entries.findIndex((entry) => entry.items.some((candidate) => candidate.id === item.id));
  if (entryIndex < 0) return null;
  const currentEntry = entries[entryIndex];
  if (currentEntry.angleGroupId) {
    const angles = angleGroupItems(item);
    const angleIndex = angles.findIndex((candidate) => candidate.id === item.id);
    const withinGroup = angles[angleIndex + direction];
    if (withinGroup) return withinGroup;
  }
  const adjacentEntry = entries[entryIndex + direction];
  return adjacentEntry ? adjacentEntry.item : null;
}

function galleryDateKey(timestamp) {
  const date = new Date(timestamp || 0);
  return [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
}

function galleryDateLabel(timestamp) {
  const date = new Date(timestamp || 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return 'Today';
  if (day.getTime() === yesterday.getTime()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

function galleryItemDurationMs(item) {
  const latest = latestGalleryVideo(item);
  if (latest) {
    const videoDuration = Number(latest && latest.info && latest.info.durationMs);
    if (Number.isFinite(videoDuration) && videoDuration > 0) return videoDuration;
  }
  const itemDuration = Number(item && item.durationMs);
  return Number.isFinite(itemDuration) && itemDuration > 0 ? itemDuration : null;
}

function addGalleryDuration(badge, durationMs, standalone = false) {
  if (!durationMs) return;
  const duration = document.createElement('span');
  duration.className = 'gallery-card-duration' + (standalone ? ' standalone' : '');
  duration.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Zm1-13h-2v6l5 3 1-1.7-4-2.3V7Z"/></svg><span>'
    + escapeHtml(formatDuration(durationMs)) + '</span>';
  badge.title = `Generated in ${formatDuration(durationMs)}`;
  badge.appendChild(duration);
}

function renderGrid() {
  const grid = $('#galleryGrid');
  grid.innerHTML = '';
  const items = visibleItems();
  const entries = galleryEntries(items);
  $('#galleryEmpty').classList.toggle('hidden', entries.length > 0);
  const query = state.libraryQuery.trim();
  $('#galleryEmpty').textContent = query ? `No matches for “${query}”` : 'Nothing here yet';
  $('#gallerySearchStatus').textContent = query
    ? `${entries.length} matching generation${entries.length === 1 ? '' : 's'}`
    : '';
  let previousDate = '';
  const showDates = state.sortMode !== 'az';
  for (const entry of entries) {
    const it = entry.item;
    const dateKey = galleryDateKey(it.createdAt);
    if (showDates && dateKey !== previousDate) {
      previousDate = dateKey;
      const divider = document.createElement('div');
      divider.className = 'gallery-date-divider';
      divider.innerHTML = `<span>${escapeHtml(galleryDateLabel(it.createdAt))}</span>`;
      grid.appendChild(divider);
    }
    const card = document.createElement('button');
    card.className = 'card' + (entry.angleGroupId ? ' angle-group' : '');
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = '/images/' + it.file;
    card.appendChild(img);
    const cardDuration = galleryItemDurationMs(it);
    const imageModel = galleryImageModelLabel(it);
    if (imageModel) {
      const model = document.createElement('span');
      model.className = 'badge model-badge' + (it.upscaled ? ' up' : '');
      model.textContent = `${it.upscaled ? '↑ ' : ''}${imageModel}`;
      model.title = `${it.upscaled ? 'Upscaled · ' : ''}Image model: ${imageModel}`;
      if (!(it.videos && it.videos.length)) addGalleryDuration(model, cardDuration);
      card.appendChild(model);
    }
    if (it.videos && it.videos.length) {
      const latestVideo = latestGalleryVideo(it);
      const videoModel = videoEngineLabel(latestVideo && latestVideo.info && latestVideo.info.engine);
      const v = document.createElement('span');
      v.className = 'badge vid';
      v.textContent = it.videos.length > 1 ? `▶ ${videoModel} +${it.videos.length - 1}` : `▶ ${videoModel}`;
      v.title = `Video model: ${videoModel}`;
      addGalleryDuration(v, cardDuration);
      card.appendChild(v);
    }
    if (it.mode === 'composite') {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = 'Composite';
      if (!(it.videos && it.videos.length)) addGalleryDuration(b, cardDuration);
      card.appendChild(b);
    } else if (!imageModel && cardDuration && !(it.videos && it.videos.length)) {
      const b = document.createElement('span');
      b.className = 'badge duration-badge';
      addGalleryDuration(b, cardDuration, true);
      card.appendChild(b);
    }
    if (Array.isArray(it.composites) && it.composites.length) {
      const b = document.createElement('span');
      b.className = 'badge attached-composite-badge';
      b.textContent = 'Before + after';
      card.appendChild(b);
    }
    if (entry.angleGroupId) {
      const badge = document.createElement('span');
      badge.className = 'badge angle-group-badge';
      badge.title = `${entry.items.length} camera angles`;
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 8 4.5v9L12 20l-8-4.5v-9L12 2Zm0 2.1L6.1 7.4 12 10.7l5.9-3.3L12 4.1Zm-6 5v5.1l5 2.8v-5.2L6 9.2Zm7 7.9 5-2.8V9.2l-5 2.5v5.4Z"/></svg><b>'
        + entry.items.length + '</b>';
      card.appendChild(badge);
    }
    if (it.liked) {
      const badge = document.createElement('span');
      badge.className = 'badge liked-badge';
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 20.5 4.5 13A5.15 5.15 0 0 1 12 5.95 5.15 5.15 0 0 1 19.5 13L12 20.5Z"/></svg>';
      card.appendChild(badge);
    }
    if (state.upscaling.has(it.id) || state.animating.has(it.id) || it.upscalePending) {
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
      // After the hold engages, dragging across tiles sweeps them into the
      // selection (Google-Photos style).
      if (lpFired && state.selectMode) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const other = el && el.closest ? el.closest('.card') : null;
        const oid = other && other.dataset.id;
        if (oid && !state.selected.has(oid)) {
          state.selected.add(oid);
          other.classList.add('selected');
          updateSelectBar();
        }
        return;
      }
      if (Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) > 12) clearTimeout(lpTimer);
    });
    // Once drag-select is live, stop the page from scrolling underneath
    card.addEventListener('touchmove', (e) => {
      if (lpFired && state.selectMode) e.preventDefault();
    }, { passive: false });
    card.addEventListener('pointerup', () => clearTimeout(lpTimer));
    card.addEventListener('pointercancel', () => clearTimeout(lpTimer));
    card.addEventListener('contextmenu', (e) => e.preventDefault());
    card.addEventListener('click', () => {
      if (lpFired) { lpFired = false; return; }
      if (state.selectMode) toggleSelect(it.id);
      else handleGalleryTap(it, card);
    });
    grid.appendChild(card);
  }
}

let galleryTap = null;
let lightboxTap = null;

function playLikeBurst(target, mode = 'like') {
  if (!target) return;
  const burst = target.id === 'lightboxLikeBurst'
    ? target : document.createElement('div');
  burst.className = 'like-burst';
  burst.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21 3.9 12.9A5.6 5.6 0 0 1 12 5.15a5.6 5.6 0 0 1 8.1 7.75L12 21Z"/></svg>';
  if (burst !== target) target.appendChild(burst);
  burst.classList.remove('pop', 'unlike');
  requestAnimationFrame(() => burst.classList.add(mode === 'like' ? 'pop' : 'unlike'));
  setTimeout(() => {
    burst.classList.remove('pop', 'unlike');
    if (burst !== target) burst.remove();
  }, mode === 'like' ? 760 : 580);
}

async function setItemLiked(item, liked, burstTarget) {
  if (!item) return;
  const items = angleGroupItems(item);
  const targets = items.length > 1 ? items : [item];
  if (targets.some((target) => target._likePending)) return;
  const previous = targets.map((target) => !!target.liked);
  targets.forEach((target) => {
    target.liked = liked;
    target._likePending = true;
  });
  playLikeBurst(burstTarget, liked ? 'like' : 'unlike');
  // Leave the original card mounted until the heart motion has painted.
  // Rendering immediately used to remove the grid burst before it was visible.
  setTimeout(renderGrid, liked ? 720 : 520);
  try {
    const updated = await Promise.all(targets.map((target) => api(`/api/item/${target.id}/like`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ liked }),
    })));
    updated.forEach((result, index) => Object.assign(targets[index], result));
  } catch (error) {
    targets.forEach((target, index) => { target.liked = previous[index]; });
    toast(error.message, true);
    renderGrid();
  } finally {
    targets.forEach((target) => { target._likePending = false; });
  }
}

function toggleItemLike(item, burstTarget) {
  setItemLiked(item, !item.liked, burstTarget);
}

function handleGalleryTap(item, card) {
  const now = Date.now();
  if (galleryTap && galleryTap.itemId === item.id && now - galleryTap.time < 300) {
    clearTimeout(galleryTap.timer);
    galleryTap = null;
    toggleItemLike(item, card);
    return;
  }
  if (galleryTap) clearTimeout(galleryTap.timer);
  galleryTap = {
    itemId: item.id,
    time: now,
    timer: setTimeout(() => {
      if (galleryTap && galleryTap.itemId === item.id) {
        galleryTap = null;
        openLightbox(item.id);
      }
    }, 260),
  };
}

function handleLightboxTap() {
  const item = state.currentItem;
  if (!item) return;
  const now = Date.now();
  if (lightboxTap && lightboxTap.itemId === item.id && now - lightboxTap.time < 300) {
    lightboxTap = null;
    toggleItemLike(item, $('#lightboxLikeBurst'));
    return;
  }
  lightboxTap = { itemId: item.id, time: now };
  setTimeout(() => { if (lightboxTap && lightboxTap.itemId === item.id) lightboxTap = null; }, 320);
}

function updateLibrarySearch() {
  state.libraryQuery = $('#gallerySearch').value;
  $('#gallerySearchClear').hidden = !state.libraryQuery;
  renderGrid();
}
$('#gallerySearch').addEventListener('input', updateLibrarySearch);
$('#gallerySearch').addEventListener('search', updateLibrarySearch);
$('#gallerySearch').addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !state.libraryQuery) return;
  event.preventDefault();
  $('#gallerySearch').value = '';
  updateLibrarySearch();
});
$('#gallerySearchClear').addEventListener('click', () => {
  $('#gallerySearch').value = '';
  updateLibrarySearch();
  $('#gallerySearch').focus();
});

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

async function saveImageComposite(item, type) {
  try {
    const label = type === 'before-after' ? 'before + after' : 'camera-angle';
    toast(`Building ${label} composite…`);
    const result = await api('/api/image-composite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, type }),
    });
    state.activeJobs.add(result.jobId);
    state.compositeJobs.set(result.jobId, { parentId: item.id, type });
    $('#genLbl').textContent = genLabel();
    queueRefreshSoon();
    closeLightbox();
  } catch (error) {
    toast(error.message, true);
  }
}

function openLightbox(id, mediaSel) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  const freshOpen = !$('#lightbox').classList.contains('show');
  if (freshOpen) {
    lockScroll();
    try { history.pushState({ lb: 1 }, ''); } catch { /* noop */ }
  }
  state.currentItem = it;
  const angleItems = angleGroupItems(it);
  const angleIndex = angleItems.findIndex((item) => item.id === it.id);
  const videos = Array.isArray(it.videos) ? it.videos : [];
  const composites = Array.isArray(it.composites) ? it.composites : [];
  let sel = mediaSel;
  if (sel !== 'image' && !videos.some((v) => v.id === sel) && !composites.some((composite) => 'composite:' + composite.id === sel)) sel = 'image';
  const selVideo = videos.find((v) => v.id === sel) || null;
  const selComposite = composites.find((composite) => 'composite:' + composite.id === sel) || null;
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
    $('#lbImg').src = '/images/' + (selComposite ? selComposite.file : (it.upscaled || it.file));
  }
  $('#lbTitle').textContent = selVideo
    ? `Video ${videos.indexOf(selVideo) + 1} of ${videos.length}`
    : (selComposite ? (selComposite.label || 'Before + after')
    : (angleItems.length > 1
      ? `${angleViewLabel(it)} · Angle ${angleIndex + 1} of ${angleItems.length}`
      : (it.upscaled ? 'Upscaled' : (it.mode === 'edit' ? 'Edit' : (it.mode === 'video' ? 'Video Poster' : 'Generation')))));
  $('#lbCompareBtn').hidden = !(!selVideo && !selComposite && it.upscaled);

  // media switcher keeps attached composites with the image they describe.
  const mrow = $('#lbMedia');
  mrow.innerHTML = '';
  if (angleItems.length > 1) {
    angleItems.forEach((angleItem, index) => {
      const button = document.createElement('button');
      button.className = 'chip angle-group-chip' + (angleItem.id === it.id ? ' active' : '');
      button.innerHTML = `<span class="angle-group-glyph" aria-hidden="true">${angleViewGlyph(angleItem)}</span><span>${escapeHtml(angleViewLabel(angleItem))}</span>`;
      button.title = `Angle ${index + 1} of ${angleItems.length}: ${angleViewLabel(angleItem)}`;
      button.addEventListener('click', () => openLightbox(angleItem.id, 'image'));
      mrow.appendChild(button);
    });
  }
  if (videos.length || composites.length) {
    const mkChip = (label, key) => {
      const b = document.createElement('button');
      b.className = 'chip' + ((key === 'image' ? (!selVideo && !selComposite) : (selVideo && selVideo.id === key) || (selComposite && 'composite:' + selComposite.id === key)) ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => openLightbox(id, key));
      mrow.appendChild(b);
    };
    mkChip('🖼 Image', 'image');
    composites.forEach((composite) => mkChip('▣ ' + (composite.label || 'Before + after'), 'composite:' + composite.id));
    videos.forEach((v, i) => mkChip('▶ ' + (i + 1), v.id));
  }

  const meta = [];
  if (selVideo) {
    const info = selVideo.info || {};
    const model = videoEngineLabel(info.engine);
    meta.push(`<b>Model:</b> ${escapeHtml(model)}`);
    meta.push(`<b>🎬 Motion:</b> ${escapeHtml(info.motionPrompt || '')}`);
    if (info.refinedMotionPrompt) meta.push(`<b>✨ Enhanced motion:</b> ${escapeHtml(info.refinedMotionPrompt)}`);
    if (info.durationMs) meta.push(`<b>Generated in:</b> ${formatDuration(info.durationMs)}`);
    if (info.frames && info.fps) {
      const scailFlags = [info.scailMode && `SCAIL ${info.scailMode}`, info.scailMode === 'chunked' && info.scailStableTracking && 'stable', info.scailMode === 'chunked' && info.scailChunkFrames && `${info.scailChunkFrames}f chunks`, info.scailMode === 'chunked' && info.scailChunkOverlap && `${info.scailChunkOverlap}f overlap`].filter(Boolean).join(', ');
      const flags = [info.composite && '⿻ side-by-side', info.faceId && '🪪 Face ID', info.processed === 'upscale' && 'RTX upscale', info.processed === 'interpolate' && 'RIFE pass', info.smooth && `⏫ RIFE ${info.smooth}×`, info.fourK && 'RTX 4K', info.engine === 'wan' && info.fast && '4-step', info.sigmaPreset && `sigmas: ${info.sigmaPreset}`, scailFlags, info.drivenAudio && '🎵 audio-driven', info.preservedAudio && '🎵 audio kept', info.endFrame && '🏁 end frame', info.motionVideo && !info.composite && '🎥 motion transfer'].filter(Boolean).join(' · ');
      meta.push(`<b>Playback:</b> ${(info.frames / info.fps).toFixed(1)}s @ ${info.fps}fps${flags ? ' · ' + flags : ''} &nbsp; <b>Seed:</b> ${info.seed ?? '—'}`);
      if (info.loras && info.loras.length) meta.push('<b>Video LoRAs:</b> ' + info.loras.map((l) => `${prettyLora(l.name)} (${Number(l.strength).toFixed(2)})`).join(', '));
    }
  } else {
    const model = galleryImageModelLabel(it);
    if (model) meta.push(`<b>Model:</b> ${escapeHtml(model)}`);
    meta.push(`<b>Prompt:</b> ${escapeHtml(it.prompt || '')}`);
    if (selComposite) meta.push(`<b>Composite:</b> ${escapeHtml(selComposite.label || 'Before + after')}`);
    else if (it.mode === 'composite' && it.compositeInfo) meta.push(`<b>Composite:</b> ${escapeHtml(it.compositeInfo.label || 'Saved composite')}`);
    if (angleItems.length > 1) meta.push(`<b>Camera angle set:</b> ${angleViewLabel(it)} · ${angleItems.length} views`);
    if (it.refinedPrompt) meta.push(`<b>✨ Enhanced:</b> ${escapeHtml(it.refinedPrompt)}`);
    meta.push(`<b>Size:</b> ${it.width}×${it.height} &nbsp; <b>Seed:</b> ${it.seed} &nbsp; <b>Steps:</b> ${it.steps} &nbsp; <b>CFG:</b> ${it.cfg}`);
    if (it.durationMs) meta.push(`<b>Generated in:</b> ${formatDuration(it.durationMs)}`);
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
  const mk = (label, cls, fn, options = {}) => {
    const b = document.createElement('button');
    b.className = 'action-btn' + (cls ? ' ' + cls : '');
    b.innerHTML = label;
    if (options.ariaLabel) b.setAttribute('aria-label', options.ariaLabel);
    if (options.title) b.title = options.title;
    b.addEventListener('click', fn);
    actions.appendChild(b);
    return b;
  };
  const mkIcon = (icon, label, cls, fn) => mk(actionIconMarkup(icon), `icon-only ${cls || ''}`.trim(), fn, { ariaLabel: label, title: label });
  const mkMenu = (label, cls, items, options = {}) => {
    let b;
    const onOpen = () => {
      const list = typeof items === 'function' ? items() : items;
      openActionMenu(b, list || [], options);
    };
    b = options.icon ? mkIcon(options.icon, options.ariaLabel || label, cls, onOpen) : mk(label, cls, onOpen);
    if (options.icon) b.setAttribute('aria-haspopup', 'menu');
    return b;
  };

  if (state.animating.has(it.id)) {
    mk('<span class="spin"></span> Animating…', selVideo ? 'primary' : '', () => {});
  } else if (it.mode !== 'composite') {
    mk(videos.length ? '🎬 Animate again' : '🎬 Animate', 'primary', () => openAnimateRouteSheet(it));
  }
  if ((!selVideo && !selComposite) || videos.length) {
    mk(it.liked ? '♥ Liked' : '♡ Like', it.liked ? 'primary' : '', () => toggleItemLike(it, $('#lightboxLikeBurst')));
  }
  if (!selVideo && !selComposite && angleItems.length > 1) {
    mk('▦ Save angle composite', '', () => saveImageComposite(it, 'angles'));
  }
  // Edits: hold to flash the original source image
  if (!selVideo && !selComposite && it.mode === 'edit' && it.sourceFile) {
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
    mk('▣ Save before + after', '', () => saveImageComposite(it, 'before-after'));
  }

  // Region-prompted images: hold to overlay the color-coded boxes,
  // plus export the annotated version.
  if (!selVideo && !selComposite && Array.isArray(it.regions) && it.regions.length) {
    const rb = mk('⬚ Hold: regions', '', () => {});
    rb.style.userSelect = 'none';
    rb.style.webkitUserSelect = 'none';
    const showR = async (e) => {
      e.preventDefault();
      try {
        if (!it._regionOverlayUrl) {
          const canvas = await buildRegionOverlay(it);
          it._regionOverlayUrl = canvas.toDataURL('image/jpeg', 0.9);
        }
        $('#lbImg').src = it._regionOverlayUrl;
      } catch { toast('Could not render the region overlay', true); }
    };
    const hideR = () => { $('#lbImg').src = '/images/' + (it.upscaled || it.file); };
    rb.addEventListener('pointerdown', showR);
    rb.addEventListener('pointerup', hideR);
    rb.addEventListener('pointercancel', hideR);
    rb.addEventListener('pointerleave', hideR);
    rb.addEventListener('contextmenu', (e) => e.preventDefault());
    mk('⬚ Save region map', '', async () => {
      try {
        const canvas = await buildRegionOverlay(it);
        canvas.toBlob((blob) => {
          if (!blob) return toast('Export failed', true);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = (it.prompt || 'kreastudio').slice(0, 40).replace(/[^\w]+/g, '_') + '_regions.png';
          a.click();
        }, 'image/png');
      } catch (e2) { toast(e2.message, true); }
    });
  }
  if (selVideo) {
    const vinfo = selVideo.info || {};
    const videoUseItems = [];
    if (!vinfo.composite) videoUseItems.push({ label: 'Reuse', detail: 'Settings', icon: 'reuse', tone: 'reuse', action: () => reuseVideo(it, selVideo) });
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
    if (!vinfo.composite) videoUseItems.push({ label: 'Motion input', detail: 'Video tab', icon: 'motion', tone: 'video', action: () => sendVideoAsDrive(it, selVideo) });
    if (videoUseItems.length) mkMenu('Use', '', videoUseItems, { icon: 'use', ariaLabel: 'Use video', menuTitle: 'Use video', tone: 'video' });
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
  } else if (selComposite) {
    mk('↓ Save image', '', () => downloadComposite(it, selComposite));
  } else {
    if (state.upscaling.has(it.id)) {
      mk('<span class="spin"></span> Upscaling…', '', () => {});
    } else {
      mk(it.upscaled ? '⇪ Re-upscale' : '⇪ Upscale', '', () => openUpscaleSheet(it));
    }
    const imageUseItems = [
      { label: 'First frame', detail: 'Start a video here', icon: 'first-frame', tone: 'video', action: () => sendToVideoTab(it, 'start') },
      { label: 'Last frame', detail: 'End a video here', icon: 'last-frame', tone: 'video', action: () => sendToVideoTab(it, 'end') },
      { label: 'Edit', detail: 'Image editor', icon: 'edit', tone: 'edit', action: () => useAsRef(it) },
      { label: 'Reuse', detail: 'Generation settings', icon: 'reuse', tone: 'reuse', action: () => reuseItem(it) },
    ];
    if (it.sourceItemId && state.items.some((x) => x.id === it.sourceItemId)) {
      imageUseItems.push({ label: 'Original', detail: 'Source image', icon: 'original', action: () => openLightbox(it.sourceItemId) });
    }
    mkMenu('Use', '', imageUseItems, { icon: 'use', ariaLabel: 'Use image', menuTitle: 'Use image', tone: 'image' });
    mk('▤ Move', '', () => openMoveSheet(it));
    if (it.upscaled) {
      mkMenu('Save', '', [
        { label: 'Save upscaled', action: () => downloadItem(it, 'upscaled') },
        { label: 'Save original', action: () => downloadItem(it, 'original') },
      ]);
    } else {
      mk('↓ Save', '', () => downloadItem(it, 'current'));
    }
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
$('#vidFree').addEventListener('input', updateVideoTuningSummary);
$('#animEnhance').addEventListener('click', () => $('#animEnhance').classList.toggle('active'));
$$('#mediaFilter button').forEach((b) => b.addEventListener('click', () => {
  state.mediaFilter = b.dataset.f;
  $$('#mediaFilter button').forEach((x) => x.classList.toggle('active', x === b));
  renderGrid();
}));
$('#likesFilter').addEventListener('click', () => {
  state.likesOnly = !state.likesOnly;
  $('#likesFilter').setAttribute('aria-pressed', String(state.likesOnly));
  renderGrid();
});
$('#lbImg').addEventListener('click', handleLightboxTap);
$('#lbVideo').addEventListener('click', handleLightboxTap);
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
    const next = galleryNavigationTarget(state.currentItem, dx < 0 ? 1 : -1);
    if (next) openLightbox(next.id);
    else toast(dx < 0 ? 'Last item' : 'Newest item');
  }, { passive: true });
})();

function restoredLoraList(loras) {
  return (Array.isArray(loras) ? loras : [])
    .filter((lora) => lora && lora.name)
    .map((lora) => ({ name: lora.name, strength: Number(lora.strength) || 1, on: true }));
}

function restoredEditEngine(engine) {
  return ['qwen', 'klein9', 'krea2', 'krea2ref'].includes(engine) ? engine : 'klein4';
}

function restoredEditAspect(width, height) {
  const ratio = Number(width) / Number(height);
  const match = ASPECTS.find((aspect) => Math.abs(aspect.ar - ratio) < 0.002);
  return match ? match.label : 'custom';
}

function imageDimensions(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ w: image.naturalWidth || 0, h: image.naturalHeight || 0 });
    image.onerror = () => resolve({ w: 0, h: 0 });
    image.src = url;
  });
}

/* Rehydrate an edit input directly from ComfyUI. Older gallery items may
   have lost their first input, so the source copy saved alongside an edit is
   uploaded back into ComfyUI as a durable fallback. */
async function restoreEditReference(name, item, index) {
  let blob = null;
  let inputName = name;
  try {
    const response = await fetch('/api/input?name=' + encodeURIComponent(name));
    if (!response.ok) throw new Error('missing input');
    blob = await response.blob();
  } catch (error) {
    if (index !== 0 || !item.sourceFile) throw error;
    const response = await fetch('/images/' + encodeURIComponent(item.sourceFile));
    if (!response.ok) throw new Error('missing saved source');
    blob = await response.blob();
    const upload = await api('/api/upload', {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent(item.sourceFile) },
      body: await blob.arrayBuffer(),
    });
    inputName = upload.name;
  }
  const url = URL.createObjectURL(blob);
  const dims = await imageDimensions(url);
  return {
    name: inputName,
    url,
    w: dims.w || item.width || 0,
    h: dims.h || item.height || 0,
    srcItemId: index === 0 ? item.sourceItemId || item.id : undefined,
  };
}

async function restoreEditReferences(item) {
  const names = Array.isArray(item.refImages) ? item.refImages.filter(Boolean).slice(0, 3) : [];
  const refs = [null, null, null];
  const missing = [];
  for (let index = 0; index < names.length; index += 1) {
    try {
      refs[index] = await restoreEditReference(names[index], item, index);
    } catch {
      missing.push(`reference image ${index + 1}`);
    }
  }
  // Very early edits did not retain refImages, but do have a source copy.
  if (!refs[0] && item.sourceFile) {
    try {
      refs[0] = await restoreEditReference('', item, 0);
    } catch {
      missing.push('reference image 1');
    }
  }
  state.refs = refs;
  return [...new Set(missing)];
}

async function restoreCreateImageGuide(item) {
  const name = Array.isArray(item.refImages) ? item.refImages.filter(Boolean)[0] : '';
  if (!name && !item.sourceFile) return null;
  const ref = await restoreEditReference(name, item, 0);
  ref.srcItemId = item.sourceItemId || undefined;
  ref.label = 'Restored source image';
  return ref;
}

async function restoreKreaMask(item) {
  clearKreaMask(true);
  if (!item.maskImageName || !EDIT_MASK_ENGINES.has(state.editEngine)) return false;
  try {
    const response = await fetch('/api/input?name=' + encodeURIComponent(item.maskImageName));
    if (!response.ok) throw new Error('missing mask');
    const url = URL.createObjectURL(await response.blob());
    state.kreaMask = { name: item.maskImageName, url };
    state.kreaMaskPreview = url;
    state.kreaMaskDirty = false;
    state.kreaMaskKind = ['smart', 'box', 'brush'].includes(item.editMaskMode) ? item.editMaskMode : 'brush';
    state.kreaMaskTool = state.kreaMaskKind;
    state.kreaMaskFeather = Math.max(0, Math.min(64, Number(item.editMaskFeather) || 0));
    state.editMaskInfluence = Math.max(25, Math.min(100, Math.round(Number(item.editMaskInfluence) || 78)));
    state.editMaskExpand = Math.max(6, Math.min(32, Math.round(Number(item.editMaskExpand) || 14)));
    // Saved mask files already contain their final (possibly inverted) pixels.
    state.kreaMaskInvert = false;
    return true;
  } catch {
    return false;
  }
}

async function reuseItem(it, useEnhanced) {
  // Enhanced generations: ask whether to reuse the enhanced text directly
  // (skips re-running the LLM) or the original prompt with enhance on.
  if (useEnhanced === undefined && it.enhance && it.refinedPrompt) {
    state.reuseTarget = it;
    $('#reuseSheet').classList.add('show');
    return;
  }
  const targetView = it.mode === 'edit' ? 'edit' : 'create';
  const restoringEdit = targetView === 'edit';
  const restoredRegions = Array.isArray(it.regions) ? it.regions.map((region) => Object.assign({}, region, {
    refUrl: region.refImageName ? `/api/input?name=${encodeURIComponent(region.refImageName)}` : '',
  })) : [];

  state.prompts[targetView] = useEnhanced ? (it.refinedPrompt || it.prompt || '') : (it.prompt || '');
  state.enhance = useEnhanced ? false : !!it.enhance;
  state.customDims = true;
  state.width = it.width || 1024;
  state.height = it.height || 1024;
  state.loras = restoringEdit ? state.loras : restoredLoraList(it.loras);
  state.regions = restoringEdit ? state.regions : restoredRegions;
  if (!restoringEdit) {
    state.createRef = null;
    state.createMatchSource = false;
    state.createInfluence = createInfluenceFromDenoise(it.denoise);
    state.krea2Turbo = it.krea2Turbo !== false;
    const savedRawTurboLora = it.krea2RawTurboLora || (!state.krea2Turbo
      ? (Array.isArray(it.loras) ? it.loras.find((lora) => assetNameKey(lora && lora.name) === assetNameKey(krea2TurboLoraName())) : null)
      : null);
    state.krea2RawTurboLora = savedRawTurboLora && savedRawTurboLora.name ? {
      name: savedRawTurboLora.name,
      strength: Number.isFinite(Number(savedRawTurboLora.strength)) ? Number(savedRawTurboLora.strength) : 0.6,
      on: savedRawTurboLora.on !== false,
      managed: 'krea2-raw-turbo',
    } : null;
    state.createUpscaleEnabled = !!it.postUpscale;
    state.createUpscaleResolution = [1440, 2160, 3840].includes(Number(it.postUpscale?.resolution)) ? Number(it.postUpscale.resolution) : 2160;
    state.createUpscaleProfile = it.postUpscale?.profile === 'balanced' ? 'balanced' : 'sharp';
    state.createUpscaleNoise = ['off', 'low', 'medium'].includes(it.postUpscale?.noise) ? it.postUpscale.noise : 'low';
  }
  state.activeRegionId = state.regions[0] ? state.regions[0].id : null;
  if (restoringEdit) {
    switchEditEngine(restoredEditEngine(it.editEngine));
    state.editLoras = restoredLoraList(it.loras);
    state.editLorasByEngine[state.editEngine] = state.editLoras;
    state.editAspectOverride = it.editAspectOverride === true;
    state.editWidth = it.width || 1024;
    state.editHeight = it.height || 1024;
    state.editAspect = restoredEditAspect(state.editWidth, state.editHeight);
    state.editUpscaleEnabled = !!it.postUpscale;
    state.editUpscaleResolution = [1440, 2160, 3840].includes(Number(it.postUpscale?.resolution)) ? Number(it.postUpscale.resolution) : 2160;
    state.editUpscaleProfile = it.postUpscale?.profile === 'balanced' ? 'balanced' : 'sharp';
    state.editUpscaleNoise = ['off', 'low', 'medium'].includes(it.postUpscale?.noise) ? it.postUpscale.noise : 'low';
    const angle = it.angleView && QWEN_ANGLE_IDS.has(it.angleView.view) ? it.angleView : null;
    state.qwenAngles = angle ? [angle.view] : [];
    state.qwenAngleElevation = angle && QWEN_ANGLE_ELEVATIONS.some((option) => option.id === angle.elevation)
      ? angle.elevation : 'eye-level';
    state.qwenAngleDistance = angle && QWEN_ANGLE_DISTANCES.some((option) => option.id === angle.distance)
      ? angle.distance : 'medium shot';
    markEngineRow('editEngineRow', state.editEngine);
  }

  $('#seedInput').value = it.seed !== undefined && it.seed !== null ? String(it.seed) : '';
  if (it.steps !== undefined && it.steps !== null) $('#stepsInput').value = it.steps;
  if (it.cfg !== undefined && it.cfg !== null) $('#cfgInput').value = it.cfg;
  if (it.batch !== undefined && it.batch !== null) $('#batchInput').value = it.batch;
  if (restoringEdit) {
    $('#denoiseInput').value = it.denoise != null ? it.denoise : 0.4;
    $('#denoiseVal').textContent = Number($('#denoiseInput').value).toFixed(2);
    $('#editComposite').setAttribute('aria-pressed', String(it.composite === true));
  }

  closeLightbox();
  setView(restoringEdit ? 'edit' : 'create', restoringEdit ? {} : { createMode: restoredRegions.length ? 'region' : 'image' });
  let missing = [];
  if (restoringEdit) {
    toast('Restoring settings and reference images…');
    missing = await restoreEditReferences(it);
    if (it.maskImageName && !(await restoreKreaMask(it))) missing.push('inpaint mask');
    renderRefs();
  } else if (restoredRegions.length) {
    renderRegionEditor();
  } else if ((Array.isArray(it.refImages) && it.refImages.some(Boolean)) || it.sourceFile) {
    toast('Restoring settings and image guide…');
    try { state.createRef = await restoreCreateImageGuide(it); }
    catch { missing.push('image guide'); }
  }
  renderEnhance();
  renderAspects();
  renderDims();
  renderLoras();
  renderEditUpscale();
  renderQwenAngleTool();
  renderCreateImageGuide();
  saveForm();

  if (missing.length) {
    toast(`Settings loaded — couldn't restore: ${[...new Set(missing)].join(', ')} (re-add manually)`);
  } else if (useEnhanced) {
    toast('Enhanced prompt loaded — ✨ enhance turned off');
  } else {
    toast('Settings, inputs, prompt, and LoRAs loaded');
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
  state.vidFace = null;
  if (state.vidAudio) stopPreview();
  state.vidAudio = null;
  setAudioChipVisual($('#vidAudioChip'), false);
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
  const scailModeChip = $(`#vidScailModeRow .chip[data-scail-mode="${info.scailMode || 'infinity'}"]`);
  if (scailModeChip) scailModeChip.click();
  state.vidScailStableTracking = info.scailStableTracking !== false;
  state.vidScailChunkFrames = [41, 61, 81].includes(Number(info.scailChunkFrames)) ? Number(info.scailChunkFrames) : 81;
  state.vidScailChunkOverlap = [5, 9, 13, 17].includes(Number(info.scailChunkOverlap)) ? Number(info.scailChunkOverlap) : 13;
  renderScailChunkControls();

  // Prompt + toggles
  state.prompts.video = info.motionPrompt || '';
  setPromptDraft(state.prompts.video);
  state.enhance = !!info.enhance;
  renderEnhance();
  $('#vid4k').classList.toggle('active', !!info.fourK);
  $('#vidQuality').classList.toggle('active', engine === 'wan' && info.fast === false);
  if (info.motionFreedom !== undefined && info.motionFreedom !== null) {
    $('#vidFree').value = info.motionFreedom;
  }
  const dur = $('#vidDur');
  const secs = info.frames && info.fps ? Math.round(info.frames / info.fps) : 5;
  dur.value = Math.max(1, Math.min(Number(dur.max) || 15, secs));
  updateVideoTuningSummary();

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
      setAudioChipVisual($('#vidAudioChip'), true);
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

  // Face ID reference (LTX reference-to-video)
  if (engine === 'ltx' && info.faceImageName) {
    try {
      const blob = await inputBlob(info.faceImageName);
      state.vidFace = { name: info.faceImageName, url: URL.createObjectURL(blob) };
    } catch { missing.push('face reference'); }
  }

  // Motion video (SCAIL) + its trim window
  if (engine === 'scail' && info.driveVideoName) {
    try {
      const blob = await inputBlob(info.driveVideoName);
      const urlObj = URL.createObjectURL(blob);
      const d = { name: info.driveVideoName, url: urlObj, label: 'reused motion video', hasAudio: info.driveHasAudio === true };
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

/* Render color-coded region boxes + their prompts (bottom-left of each
   box) over the generated image. Used for the gallery hold-preview and
   the annotated export. */
async function buildRegionOverlay(it) {
  const img = new Image();
  await new Promise((ok, bad) => {
    img.onload = ok;
    img.onerror = () => bad(new Error('Could not load the image'));
    img.src = '/images/' + (it.upscaled || it.file);
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || 1024;
  c.height = img.naturalHeight || 1024;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const lw = Math.max(3, Math.round(c.width / 320));
  const fs = Math.max(13, Math.round(c.width / 52));
  const lh = Math.round(fs * 1.3);
  const pad = Math.round(fs * 0.45);
  ctx.font = `600 ${fs}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  it.regions.forEach((r, i) => {
    const color = r.color || REGION_COLORS[i % REGION_COLORS.length];
    const x = (r.x || 0) * c.width;
    const y = (r.y || 0) * c.height;
    const w = (r.w || 0) * c.width;
    const h = (r.h || 0) * c.height;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
    // Numbered tag, top-left
    const tag = String(i + 1);
    const tagW = ctx.measureText(tag).width + pad * 2;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, tagW, lh + pad);
    ctx.fillStyle = '#000';
    ctx.fillText(tag, x + pad, y + lh);
    // Prompt label, bottom-left inside the box, wrapped
    const label = (r.description || '').trim() || `Region ${i + 1}`;
    const maxW = Math.max(80, w - pad * 3 - lw * 2);
    const words = label.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    const textW = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)));
    const boxH = lines.length * lh + pad * 2;
    const bx = x + lw;
    const by = y + h - lw - boxH;
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(bx, by, textW + pad * 2 + lw * 2, boxH);
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, Math.max(3, lw), boxH); // color key strip
    ctx.fillStyle = '#fff';
    lines.forEach((l, li) => ctx.fillText(l, bx + pad + lw * 2, by + pad + (li + 1) * lh - Math.round(lh * 0.25)));
  });
  return c;
}

function downloadItem(it, variant) {
  const a = document.createElement('a');
  const useUpscaled = variant === 'upscaled' || (variant !== 'original' && it.upscaled);
  const suffix = useUpscaled ? '_upscaled' : '_original';
  a.href = '/images/' + (useUpscaled ? it.upscaled : it.file);
  a.download = (it.prompt || 'kreastudio').slice(0, 40).replace(/[^\w]+/g, '_') + suffix + '.png';
  a.click();
}
function downloadComposite(it, composite) {
  const a = document.createElement('a');
  a.href = '/images/' + composite.file;
  a.download = (it.prompt || 'kreastudio').slice(0, 40).replace(/[^\w]+/g, '_') + '_before_after.png';
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
    b.textContent = f.locked ? `🔒 ${f.name}` : f.name;
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

const svAttentionOptions = {
  sdpa: { label: 'SDPA', description: 'Safest · no extra DLLs' },
  sageattn_2: { label: 'SageAttention 2', description: 'Faster · requires Triton' },
  sageattn_3: { label: 'SageAttention 3', description: 'RTX 50-series only' },
  flash_attn_2: { label: 'Flash Attention 2', description: 'Flash Attention compatible GPUs' },
  flash_attn_3: { label: 'Flash Attention 3', description: 'Hopper generation and newer' },
};

function setSvAttnValue(value) {
  const next = svAttentionOptions[value] ? value : 'sdpa';
  const copy = svAttentionOptions[next];
  $('#setSvAttn').value = next;
  $('#svAttnLabel').textContent = copy.label;
  $('#svAttnDescription').textContent = copy.description;
  $$('#svAttnList [role="option"]').forEach((option) => {
    option.setAttribute('aria-selected', String(option.dataset.attention === next));
  });
}

function setSvAttnPickerOpen(open, focusOption = false) {
  const expand = open === true;
  const picker = $('#svAttnPicker');
  const list = $('#svAttnList');
  picker.classList.toggle('open', expand);
  list.inert = !expand;
  list.setAttribute('aria-hidden', String(!expand));
  $('#svAttnTrigger').setAttribute('aria-expanded', String(expand));
  if (expand && focusOption) {
    const selected = $('#svAttnList [aria-selected="true"]');
    if (selected) selected.focus();
  }
}

$('#svAttnTrigger').addEventListener('click', () => {
  setSvAttnPickerOpen(!$('#svAttnPicker').classList.contains('open'));
});
$('#svAttnTrigger').addEventListener('keydown', (event) => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  setSvAttnPickerOpen(true, true);
  if (event.key === 'ArrowUp' || event.key === 'End') {
    const options = $$('#svAttnList [role="option"]');
    options[options.length - 1]?.focus();
  } else if (event.key === 'Home') {
    $('#svAttnList [role="option"]')?.focus();
  }
});
const svAttnOptionButtons = $$('#svAttnList [role="option"]');
svAttnOptionButtons.forEach((option, index) => {
  option.addEventListener('click', () => {
    setSvAttnValue(option.dataset.attention);
    setSvAttnPickerOpen(false);
    $('#svAttnTrigger').focus();
  });
  option.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setSvAttnPickerOpen(false);
      $('#svAttnTrigger').focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? svAttnOptionButtons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + svAttnOptionButtons.length) % svAttnOptionButtons.length;
    svAttnOptionButtons[next].focus();
  });
});
document.addEventListener('pointerdown', (event) => {
  if (!$('#svAttnPicker').contains(event.target)) setSvAttnPickerOpen(false);
});
setSvAttnValue('sdpa');

let settingsActiveTab = 'general';
const settingsTabNames = ['general', 'image', 'video', 'defaults', 'suggestions', 'system'];

function setSettingsTab(name, focus = false) {
  if (!settingsTabNames.includes(name)) name = 'general';
  if (name !== 'system') setSvAttnPickerOpen(false);
  settingsActiveTab = name;
  $$('[data-settings-tab]').forEach((tab) => {
    const active = tab.dataset.settingsTab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
  $$('[data-settings-pane]').forEach((pane) => {
    const active = pane.dataset.settingsPane === name;
    pane.hidden = !active;
    pane.classList.toggle('active', active);
  });
  const content = $('.settings-content');
  if (content) content.scrollTop = 0;
}

$$('[data-settings-tab]').forEach((tab) => {
  tab.addEventListener('click', () => setSettingsTab(tab.dataset.settingsTab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = settingsTabNames.indexOf(tab.dataset.settingsTab);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? settingsTabNames.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + settingsTabNames.length) % settingsTabNames.length;
    setSettingsTab(settingsTabNames[next], true);
  });
});

$$('#defaultSeedMode button').forEach((button) => button.addEventListener('click', () => {
  $$('#defaultSeedMode button').forEach((item) => item.classList.toggle('active', item === button));
  $('#defaultSeedValueField').hidden = button.dataset.seedMode !== 'fixed';
}));

$('#settingsBtn').addEventListener('click', async () => {
  closeAppDrawer();
  await loadUserPreferences();
  await refreshLoraContext();
  try {
    const s = await api('/api/settings');
    $('#setComfy').value = s.comfyUrl;
    $('#galleryPasswordInput').value = s.galleryPassword || '1234';
    $('#setUnet').value = s.unet;
    $('#setKrea2RawUnet').value = s.krea2RawUnet || '';
    $('#setKrea2TurboLora').value = s.krea2TurboLora || '';
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
    $('#setQeAnglesLora').value = s.qwenEditAnglesLora || '';
    $('#setDit').value = s.seedvr2Dit;
    $('#setSvVae').value = s.seedvr2Vae;
    setSvAttnValue(s.seedvr2Attention || 'sdpa');
    $('#setSysPrompt').value = s.systemPrompt || '';
    $('#setLtxCkpt').value = s.ltxCkpt || '';
    $('#setLtxLora').value = s.ltxDistilledLora || '';
    $('#setLtxEditLora').value = s.ltxEditLora || '';
    $('#setLtxTe').value = s.ltxTextEncoder || '';
    $('#setLtxGemmaLora').value = s.ltxGemmaLora || '';
    $('#setLtxUps').value = s.ltxUpscaler || '';
    $('#setFaceIdLora').value = s.ltxFaceIdLora || '';
    $('#setFaceIdDistilled').value = s.ltxFaceIdDistilledLora || '';
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
    $('#setScailPusaLora').value = s.scailPusaLora || '';
    $('#setScailCv').value = s.scailClipVision || '';
    $('#setScailSam').value = s.scailSam || '';
  } catch { /* noop */ }
  setSettingsTab(settingsActiveTab);
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
        krea2RawUnet: $('#setKrea2RawUnet').value,
        krea2TurboLora: $('#setKrea2TurboLora').value,
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
        qwenEditAnglesLora: $('#setQeAnglesLora').value,
        seedvr2Dit: $('#setDit').value,
        seedvr2Vae: $('#setSvVae').value,
        seedvr2Attention: $('#setSvAttn').value,
        systemPrompt: $('#setSysPrompt').value,
        ltxCkpt: $('#setLtxCkpt').value,
        ltxDistilledLora: $('#setLtxLora').value,
        ltxEditLora: $('#setLtxEditLora').value,
        ltxTextEncoder: $('#setLtxTe').value,
        ltxGemmaLora: $('#setLtxGemmaLora').value,
        ltxUpscaler: $('#setLtxUps').value,
        ltxFaceIdLora: $('#setFaceIdLora').value,
        ltxFaceIdDistilledLora: $('#setFaceIdDistilled').value,
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
            scailPusaLora: $('#setScailPusaLora').value,
            scailClipVision: $('#setScailCv').value,
            scailSam: $('#setScailSam').value,
      }),
    });
    await saveUserPreferences();
    toast('Settings saved');
    await loadMeta(true);
    renderHealth();
  } catch (e) { toast(e.message, true); }
});

let lastMeta = null;
let sam3InstallBusy = false;
let sam3InstallResult = null;
let dependencyPollTimer = null;

function formatDependencyBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** power)).toFixed(power ? 1 : 0)} ${units[power]}`;
}

function dependencyMissingLabels() {
  const dependency = lastMeta && lastMeta.dependencies;
  const labels = new Map(((dependency && dependency.components) || []).map((entry) => [entry.id, entry.label]));
  return ((dependency && dependency.missingComponents) || []).map((id) => ({ id, label: labels.get(id) || id }));
}

function renderDependencyManager() {
  const card = $('#dependencyManagerCard');
  if (!card) return;
  const dependency = (lastMeta && lastMeta.dependencies) || {};
  const installState = dependency.install || { state: 'idle', phase: 'idle' };
  const missing = dependencyMissingLabels();
  const badge = $('#dependencyManagerBadge');
  const status = $('#dependencyManagerStatus');
  const progress = $('#dependencyProgress');
  const fill = $('#dependencyProgressFill');
  const list = $('#dependencyMissingList');
  const install = $('#dependencyInstallMissing');
  const repair = $('#dependencyRepairMissing');
  const restart = $('#dependencyRestartComfy');
  const check = $('#dependencyCheckAll');
  const busy = installState.state === 'running' || installState.state === 'restarting';
  const ready = !!lastMeta?.ok && !missing.length && !busy;
  card.classList.toggle('ready', ready);
  card.classList.toggle('installing', busy);
  list.innerHTML = missing.map((entry) => `<span class="bad" title="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</span>`).join('');
  install.disabled = busy;
  repair.disabled = busy;
  restart.disabled = busy;
  check.disabled = busy;
  progress.hidden = !busy;
  progress.classList.toggle('indeterminate', busy && !(Number(installState.total) > 0));
  if (busy && Number(installState.total) > 0) {
    const pct = Math.max(3, Math.min(100, (Number(installState.completed || 0) / Number(installState.total)) * 100));
    fill.style.width = `${pct}%`;
  } else {
    fill.style.width = '0';
  }

  if (!lastMeta?.ok) {
    badge.textContent = 'Offline';
    status.textContent = 'Start ComfyUI to scan models and nodes. You can still install trusted missing packs once its folder is configured.';
  } else if (busy) {
    badge.textContent = installState.state === 'restarting' ? 'Restarting' : 'Installing';
    const transfer = installState.phase === 'downloading-model' && installState.downloaded
      ? ` ${formatDependencyBytes(installState.downloaded)}${installState.downloadTotal ? ` / ${formatDependencyBytes(installState.downloadTotal)}` : ''}`
      : '';
    status.textContent = `${installState.message || 'Working…'}${transfer}`;
  } else if (installState.state === 'error') {
    badge.textContent = 'Needs attention';
    status.textContent = installState.error || installState.message || 'The last dependency operation did not finish.';
  } else if (ready) {
    badge.textContent = 'Green';
    status.textContent = 'Every enabled MixBox model and node group is ready.';
  } else if (installState.restartRequired) {
    badge.textContent = 'Restart needed';
    status.textContent = 'The downloads are finished. Restart ComfyUI, then Check again to load the new nodes and models.';
  } else if (!state.profileIsOwner) {
    badge.textContent = 'Owner only';
    status.textContent = `${missing.length} missing component${missing.length === 1 ? '' : 's'} can be installed by the owner profile.`;
  } else if (!dependency.canInstall) {
    badge.textContent = 'Setup needed';
    status.textContent = dependency.reason || 'Run install.bat and select the existing ComfyUI folder to enable downloads.';
  } else {
    badge.textContent = 'Missing';
    status.textContent = `${missing.length} component${missing.length === 1 ? '' : 's'} need${missing.length === 1 ? 's' : ''} attention. Install only those missing pieces.`;
  }

  install.hidden = ready || !state.profileIsOwner;
  repair.hidden = ready || !state.profileIsOwner;
  install.textContent = busy ? 'Installing…' : `Install ${missing.length || 'missing'}`;
  install.disabled = busy || !missing.length || !dependency.canInstall || !state.profileIsOwner;
  repair.textContent = busy ? 'Repairing…' : 'Repair missing tools';
  repair.disabled = busy || !missing.length || !dependency.canInstall || !state.profileIsOwner;
  const restartInfo = dependency.restart || {};
  restart.hidden = !state.profileIsOwner || !restartInfo.canRestart;
  restart.title = restartInfo.canRestart ? 'Stops and starts the configured Windows ComfyUI instance when queues are idle' : (restartInfo.reason || 'Restart unavailable');
}

function scheduleDependencyPoll() {
  clearTimeout(dependencyPollTimer);
  const install = lastMeta && lastMeta.dependencies && lastMeta.dependencies.install;
  if (!install || !['running', 'restarting'].includes(install.state)) return;
  dependencyPollTimer = setTimeout(async () => {
    try {
      const status = await api('/api/dependencies/status');
      if (lastMeta && lastMeta.dependencies) lastMeta.dependencies.install = status;
      renderDependencyManager();
      renderSam3Dependency();
      if (status.state === 'complete' && status.phase === 'reconnected') await loadMeta(true);
    } catch { /* keep the last visible progress while the desktop reconnects */ }
    scheduleDependencyPoll();
  }, 1000);
}

function renderSam3Dependency() {
  const card = $('#sam3DependencyCard');
  if (!card) return;
  const missing = (lastMeta && lastMeta.missing && lastMeta.missing.smartmask) || [];
  const dependency = (lastMeta && lastMeta.dependencies && lastMeta.dependencies.sam3) || {};
  const sharedInstall = (lastMeta && lastMeta.dependencies && lastMeta.dependencies.install) || {};
  const installingSmartMask = sharedInstall.state === 'running'
    && Array.isArray(sharedInstall.components)
    && sharedInstall.components.includes('smartmask');
  const busy = sam3InstallBusy || installingSmartMask;
  const ready = !!lastMeta?.ok && missing.length === 0;
  const badge = $('#sam3DependencyBadge');
  const status = $('#sam3DependencyStatus');
  const install = $('#sam3DependencyInstall');
  const check = $('#sam3DependencyCheck');
  card.classList.toggle('ready', ready);
  card.classList.toggle('installing', busy);
  install.disabled = busy;
  check.disabled = busy;

  if (ready) {
    badge.textContent = 'Ready';
    status.textContent = 'Tap selection and text-guided masks are available.';
    install.hidden = true;
    return;
  }
  if (busy) {
    badge.textContent = 'Installing';
    status.textContent = sharedInstall.message || 'Installing SAM3 without force-upgrading ComfyUI’s shared Python environment. This can take several minutes.';
    install.hidden = false;
    install.textContent = 'Installing…';
    return;
  }
  if (sam3InstallResult?.restartRequired) {
    badge.textContent = 'Restart needed';
    status.textContent = 'Installation finished. Restart ComfyUI, wait for it to reconnect, then press Check again. The SAM3 model downloads on first use.';
    install.hidden = true;
    return;
  }

  badge.textContent = 'Missing';
  install.textContent = 'Install required tools';
  install.hidden = !dependency.canInstall || !state.profileIsOwner;
  if (!state.profileIsOwner) {
    status.textContent = 'Switch to the owner profile to install the missing SAM3 tools.';
  } else if (!dependency.canInstall) {
    status.textContent = dependency.reason || 'Run install.bat again and select the existing ComfyUI folder so MixBox Studio can find its Python environment.';
  } else {
    status.textContent = `${missing.length || 'Some'} SAM3 components are missing. MixBox Studio can install the official node pack without changing gallery data.`;
  }
}

async function loadMeta(refresh) {
  try {
    lastMeta = await api('/api/meta' + (refresh ? '?refresh=1' : ''));
    state.connOk = lastMeta.ok;
    state.metaLoras = lastMeta.loras || [];
    state.metaLorasInfo = lastMeta.lorasInfo || {};
    state.loraThumbs = lastMeta.loraThumbs || {};
    state.features = lastMeta.features || {};
    renderFeatureVisibility();
    $('#connDot').className = 'conn-dot ' + (lastMeta.ok ? 'ok' : 'bad');
    renderKrea2Mode();
    renderLoras();
    renderSam3Dependency();
    renderDependencyManager();
    scheduleDependencyPoll();
  } catch {
    state.connOk = false;
    $('#connDot').className = 'conn-dot bad';
    renderSam3Dependency();
    renderDependencyManager();
  }
}

$('#sam3DependencyInstall').addEventListener('click', async () => {
  if (sam3InstallBusy) return;
  sam3InstallBusy = true;
  sam3InstallResult = null;
  renderSam3Dependency();
  try {
    const result = await api('/api/dependencies/sam3/install', { method: 'POST' });
    sam3InstallResult = result.install || result;
    if (lastMeta && lastMeta.dependencies) lastMeta.dependencies.install = result.install;
    scheduleDependencyPoll();
    toast('Smart Mask installation started — progress is shown below');
  } catch (error) {
    toast(error.message, true);
  } finally {
    sam3InstallBusy = false;
    renderSam3Dependency();
  }
});

$('#sam3DependencyCheck').addEventListener('click', async () => {
  await loadMeta(true);
  if (!lastMeta?.missing?.smartmask?.length) sam3InstallResult = null;
  renderHealth();
  renderSam3Dependency();
});

$('#dependencyInstallMissing').addEventListener('click', async () => {
  const components = dependencyMissingLabels().map((entry) => entry.id);
  if (!components.length) return;
  try {
    const result = await api('/api/dependencies/install', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ components }),
    });
    if (lastMeta && lastMeta.dependencies) lastMeta.dependencies.install = result.install;
    renderDependencyManager();
    scheduleDependencyPoll();
  } catch (error) { toast(error.message, true); }
});

$('#dependencyRepairMissing').addEventListener('click', async () => {
  const components = dependencyMissingLabels().map((entry) => entry.id);
  if (!components.length) return;
  try {
    const result = await api('/api/dependencies/install', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ components, repair: true }),
    });
    if (lastMeta && lastMeta.dependencies) lastMeta.dependencies.install = result.install;
    renderDependencyManager();
    scheduleDependencyPoll();
  } catch (error) { toast(error.message, true); }
});

$('#dependencyRestartComfy').addEventListener('click', async () => {
  try {
    const result = await api('/api/comfy/restart', { method: 'POST' });
    if (lastMeta && lastMeta.dependencies) lastMeta.dependencies.install = result.install;
    renderDependencyManager();
    scheduleDependencyPoll();
  } catch (error) { toast(error.message, true); }
});

$('#dependencyCheckAll').addEventListener('click', async () => {
  await loadMeta(true);
  renderHealth();
  renderDependencyManager();
});

function renderHealth() {
  const el = $('#healthList');
  if (!lastMeta) { el.innerHTML = ''; return; }
  if (!lastMeta.ok) {
    el.innerHTML = `<span class="bad">● Can't reach ComfyUI</span> — ${escapeHtml(lastMeta.error || '')}<br>Make sure ComfyUI is running on the desktop.`;
    return;
  }
  const rows = [`<span class="ok">● Connected</span> — ${state.metaLoras.length} LoRAs found`];
  const labels = { core: 'Core nodes', enhance: 'Prompt enhance (TextGenerate)', klein: 'Edit (Flux 2 Klein) nodes', qwenedit: 'Edit (Qwen Image Edit) nodes', regional: 'Krea2 regional prompting nodes', krea2inpaint: 'Krea2 inpaint nodes', krea2ref: 'Krea 2 Edit (Rebalance) nodes', smartmask: 'Smart Mask (SAM3) nodes', upscale: 'SeedVR2 nodes', ultimateupscale: 'Ultimate SD Upscale nodes', video: 'LTX 2.3 video nodes', videoedit: 'LTX Edit guide-video nodes', video4k: 'RTX 4K pass (optional)', wan: 'Wan 2.2 nodes', eros: '10Eros DMD nodes', scail: 'SCAIL 2 motion transfer nodes', scailinfinity: 'SCAIL 2 Infinity node', faceid: 'LTX Face ID (BFS) nodes' };
  for (const [group, missing] of Object.entries(lastMeta.missing || {})) {
    if (group === 'smartmask') continue; // The actionable installer card above owns this status.
    const label = labels[group] || group.replace(/([a-z])([A-Z])/g, '$1 $2');
    rows.push(missing.length
      ? `<span class="bad">●</span> ${escapeHtml(label)}: missing ${missing.map(escapeHtml).join(', ')}`
      : `<span class="ok">●</span> ${escapeHtml(label)}: OK`);
  }
  const fieldLabels = { unet: 'UNET', turbo: 'Turbo UNET', raw: 'Raw UNET', turboLora: 'Turbo LoRA', clip: 'text encoder', vae: 'VAE', lora: 'LoRA', node: 'node', pusa: 'Pusa LoRA', angles: 'multi-angle LoRA', dit: 'DiT', checkpoint: 'checkpoint', distilled: 'distilled LoRA', textEncoder: 'text encoder', gemmaLora: 'Gemma LoRA', upscaler: 'spatial upscaler', faceLora: 'Face ID LoRA', high: 'high-noise UNET', low: 'low-noise UNET', highLora: 'high-noise LoRA', lowLora: 'low-noise LoRA', lightx: 'lightx2v LoRA', clipVision: 'CLIP Vision', sam: 'SAM3 checkpoint' };
  for (const engine of Object.values(lastMeta.models || {})) {
    const checks = Object.entries(engine).filter(([, v]) => v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'ok'));
    const missing = checks.filter(([, v]) => !v.ok);
    rows.push(missing.length
      ? `<span class="bad">●</span> ${escapeHtml(engine.label)} models: missing ${missing.map(([k, v]) => `${fieldLabels[k] || k} ${escapeHtml(v.name || '')}`).join(', ')}`
      : `<span class="ok">●</span> ${escapeHtml(engine.label)} models: OK`);
  }
  el.innerHTML = rows.join('<br>');
  renderSam3Dependency();
  renderDependencyManager();
}

/* ------------------------------------------------------------------ */
/* Sheet close buttons                                                 */
/* ------------------------------------------------------------------ */

$$('.sheet').forEach((sheet) => {
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.classList.remove('show'); });
  sheet.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => sheet.classList.remove('show')));
  new MutationObserver(syncSheetScrollLock).observe(sheet, { attributes: true, attributeFilter: ['class'] });
});
syncSheetScrollLock();

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
