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
  qwenAngles: [],
  qwenAngleElevation: 'eye-level',
  qwenAngleDistance: 'medium shot',
  prompts: { create: '', edit: '', video: '' }, // per-tab prompt text
  loras: [],                 // {name, strength, on} - Create tab (Krea 2)
  videoLoras: [],            // {name, strength, on} - Video tab (LTX/Wan)
  editLoras: [],             // {name, strength, on} - Edit tab (Klein/Qwen)
  editEngine: 'klein4',
  refs: [null, null, null],  // {name(comfy), url(local preview)}
  regions: [],
  activeRegionId: null,
  kreaMask: null,
  kreaMaskPreview: null,
  kreaMaskDirty: false,
  kreaMaskErase: false,
  kreaBrush: 48,
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
  cameraSettings: CameraSettings ? Object.assign({}, CameraSettings.DEFAULT_CAMERA_SETTINGS) : {},
  showAllLoras: false,
  activeJobs: new Set(),
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
  } catch {
    renderAppUpdateAccess(); // 401 -> api() already opened the gate
  }
}
checkAuth();

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

function openAppDrawer() {
  closeActionMenu();
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
  throw new Error('The update installed, but the app did not come back online. Start KreaStudio on the desktop.');
}

$('#appMenuBtn').addEventListener('click', openAppDrawer);
$('#appDrawerClose').addEventListener('click', closeAppDrawer);
$('#appDrawerBackdrop').addEventListener('click', closeAppDrawer);
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
      setAppUpdateStatus(`KreaStudio is up to date · ${result.version}`, 'good');
      appUpdateRunning = false;
      renderAppUpdateAccess();
      return;
    }
    if (result.restarting) {
      label.textContent = 'Restarting KreaStudio…';
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
    localStorage.setItem(formKey(), JSON.stringify({
      enhance: state.enhance, aspect: state.aspect, mp: state.mp,
      loras: state.loras, videoLoras: state.videoLoras, editLoras: state.editLoras, prompts: state.prompts,
      editEngine: state.editEngine, vidScailMode: state.vidScailMode,
      cameraSettings: state.cameraSettings,
      createMode: state.createMode,
      regions: state.regions,
      kreaBrush: state.kreaBrush,
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
    state.qwenAngles = Array.isArray(f.qwenAngles) ? [...new Set(f.qwenAngles.filter((id) => QWEN_ANGLE_IDS.has(id)))] : [];
    state.qwenAngleElevation = QWEN_ANGLE_ELEVATIONS.some((option) => option.id === f.qwenAngleElevation)
      ? f.qwenAngleElevation : 'eye-level';
    state.qwenAngleDistance = QWEN_ANGLE_DISTANCES.some((option) => option.id === f.qwenAngleDistance)
      ? f.qwenAngleDistance : 'medium shot';
    state.loras = Array.isArray(f.loras) ? f.loras : [];
    state.videoLoras = Array.isArray(f.videoLoras) ? f.videoLoras : [];
    state.editLoras = Array.isArray(f.editLoras) ? f.editLoras : [];
    state.editEngine = ['qwen', 'klein9', 'krea2', 'krea2ref'].includes(f.editEngine) ? f.editEngine : 'klein4';
    state.createMode = ['image', 'region', 'video'].includes(f.createMode) ? f.createMode : 'image';
    state.regions = Array.isArray(f.regions) ? f.regions : [];
    state.kreaBrush = Number(f.kreaBrush) || 48;
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
    ? (state.vidEngine === 'ltx-edit' ? 'Describe the edit…' : 'Describe the motion…')
    : (state.createMode === 'region' && state.view === 'create'
      ? 'Describe the full scene… (optional)'
      : (state.view === 'edit' ? 'Describe the change…' : 'Describe your image…'));
  $('#vidAttachRow').hidden = !isVideo;
  $('#vidModelPanel').hidden = !isVideo;
  $('#vidOptsPanel').hidden = !isVideo;
  $('#enhanceBtn').hidden = isVideo && state.vidEngine === 'ltx-edit';
  $('#qwenAngleTool').hidden = !(state.view === 'edit' && state.editEngine === 'qwen');
  renderQwenAngleTool();
  regionWorkspace.hidden = !isRegion;
  $('#vidExtras').hidden = !isVideo || state.vidEngine === 'wan' || state.vidEngine === 'scail' || state.vidEngine === 'ltx-edit';
  $('#createPromptTools').hidden = state.view !== 'create';
  const kreaEdit = state.view === 'edit' && state.editEngine === 'krea2';
  const kreaRef = state.view === 'edit' && state.editEngine === 'krea2ref';
  $('#denoiseField').hidden = !kreaEdit;
  $('#kreaMaskTools').hidden = !kreaEdit;
  $('#editComposite').hidden = kreaEdit || kreaRef; // pixel-composite is a Klein mechanism
  $('#editAspectControl').hidden = state.view !== 'edit' || kreaEdit;
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
      cb({ name: res.name, url, w: dims.w, h: dims.h, label: file.name });
    } catch (e) { toast(e.message, true); }
  });
  input.click();
}

/* ------------------------------------------------------------------ */
/* Regional prompting + Krea2 masks                                    */
/* ------------------------------------------------------------------ */

const REGION_COLORS = ['#46b4e6', '#e68246', '#82e646', '#e646b4', '#e6e646', '#46e6c8'];
let regionDrag = null;
let regionSettingsOpen = false;
let regionClickBlockedUntil = 0;
let kreaMaskDrawing = false;
let kreaMaskLast = null;

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
  let startX = 0;
  let startY = 0;
  let startStrength = region.strength;
  const strengthEl = card.querySelector('.lc-strength');
  const adjustEl = card.querySelector('.lc-adjust');
  card.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.lc-menu')) return;
    moved = false;
    adjusting = false;
    startX = event.clientX;
    startY = event.clientY;
    startStrength = normalizeRegionStrength(region.strength);
    holdTimer = setTimeout(() => {
      adjusting = true;
      card.classList.add('adjusting');
      adjustEl.textContent = startStrength.toFixed(2);
      if (navigator.vibrate) navigator.vibrate(10);
    }, 300);
    try { card.setPointerCapture(event.pointerId); } catch { /* noop */ }
  });
  card.addEventListener('pointermove', (event) => {
    if (adjusting) {
      const dx = event.clientX - startX;
      region.strength = normalizeRegionStrength(Math.round((startStrength + dx / 75) * 20) / 20);
      strengthEl.textContent = region.strength.toFixed(2);
      adjustEl.textContent = region.strength.toFixed(2);
    } else if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) {
      moved = true;
      clearTimeout(holdTimer);
    }
  });
  const finish = (event) => {
    if (event && event.target.closest('.lc-menu')) return;
    clearTimeout(holdTimer);
    if (adjusting) {
      card.classList.remove('adjusting');
      adjusting = false;
      renderRegionEditor();
      saveForm();
    } else if (!moved) {
      openRegionLoraPicker(region);
    }
  };
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', () => {
    clearTimeout(holdTimer);
    if (adjusting) {
      card.classList.remove('adjusting');
      adjusting = false;
      renderRegionEditor();
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

function renderRegionEditor() {
  const stage = $('#regionStage');
  if (!stage) return;
  if (!state.regions.length) createRegion();
  if (!selectedRegion()) state.activeRegionId = state.regions[0].id;

  // The canvas mirrors the output: match the selected aspect ratio
  const arW = state.width || 1024;
  const arH = state.height || 1024;
  stage.style.aspectRatio = `${arW} / ${arH}`;
  stage.style.flex = '0 0 auto';
  stage.style.minHeight = '0';
  stage.style.margin = '0 auto';
  stage.style.width = arW >= arH ? '100%' : 'min(100%, 430px)';
  stage.style.height = 'auto';

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
  const canvas = $('#kreaMaskCanvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width || 1, canvas.height || 1);
  if (state.refs[0] && state.refs[0].displayUrl) {
    delete state.refs[0].displayUrl;
    renderRefs();
  }
  renderKreaMaskTools();
  if (!silent) toast('Mask cleared');
}

function renderKreaMaskTools() {
  const tools = $('#kreaMaskTools');
  if (!tools) return;
  const hasMask = !!state.kreaMask || state.kreaMaskDirty || !!state.kreaMaskPreview;
  $('#kreaMaskStatus').textContent = hasMask ? (state.kreaMaskDirty ? 'Mask not uploaded yet' : 'Mask ready') : 'No mask';
  $('#kreaMaskClear').hidden = !hasMask;
}

function setupMaskCanvasFromImage() {
  const base = $('#kreaMaskBase');
  const canvas = $('#kreaMaskCanvas');
  const w = base.naturalWidth || 1024;
  const h = base.naturalHeight || 1024;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (state.kreaMaskPreview) {
    const im = new Image();
    im.onload = () => ctx.drawImage(im, 0, 0, w, h);
    im.src = state.kreaMaskPreview;
  }
}

function openKreaMaskPainter() {
  const ref = state.refs[0];
  if (!ref) return toast('Add a source image in the first reference slot before painting a mask', true);
  $('#kreaMaskBase').src = ref.url;
  $('#kreaMaskBase').onload = setupMaskCanvasFromImage;
  if ($('#kreaMaskBase').complete) setupMaskCanvasFromImage();
  $('#kreaBrushInput').value = String(state.kreaBrush);
  $('#kreaBrushVal').textContent = String(state.kreaBrush);
  $('#kreaMaskErase').classList.toggle('active', state.kreaMaskErase);
  $('#kreaMaskSheet').classList.add('show');
}

function maskPoint(e) {
  const canvas = $('#kreaMaskCanvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function drawKreaMask(e) {
  if (!kreaMaskDrawing) return;
  e.preventDefault();
  const p = maskPoint(e);
  const canvas = $('#kreaMaskCanvas');
  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = state.kreaBrush;
  ctx.globalCompositeOperation = state.kreaMaskErase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = 'rgba(255,255,255,0.86)';
  ctx.beginPath();
  ctx.moveTo(kreaMaskLast ? kreaMaskLast.x : p.x, kreaMaskLast ? kreaMaskLast.y : p.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  kreaMaskLast = p;
  state.kreaMaskDirty = true;
  state.kreaMaskPreview = canvas.toDataURL('image/png');
  renderKreaMaskTools();
}

async function ensureKreaMaskUploaded() {
  if (!state.kreaMaskDirty && state.kreaMask && state.kreaMask.name) return state.kreaMask.name;
  const canvas = $('#kreaMaskCanvas');
  if (!canvas || !canvas.width || !canvas.height || !state.kreaMaskPreview) return '';
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  const blob = await new Promise((ok, bad) => out.toBlob((b) => (b ? ok(b) : bad(new Error('Mask export failed'))), 'image/png'));
  const res = await api('/api/upload', {
    method: 'POST',
    headers: { 'x-filename': encodeURIComponent('krea2_mask.png') },
    body: await blob.arrayBuffer(),
  });
  state.kreaMask = { name: res.name, url: URL.createObjectURL(blob) };
  state.kreaMaskDirty = false;
  renderKreaMaskTools();
  return state.kreaMask.name;
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
$('#kreaMaskCanvas').addEventListener('pointerdown', (e) => {
  kreaMaskDrawing = true;
  kreaMaskLast = maskPoint(e);
  drawKreaMask(e);
});
$('#kreaMaskCanvas').addEventListener('pointermove', drawKreaMask);
document.addEventListener('pointerup', () => { kreaMaskDrawing = false; kreaMaskLast = null; });
$('#kreaBrushInput').addEventListener('input', () => {
  state.kreaBrush = Number($('#kreaBrushInput').value) || 48;
  $('#kreaBrushVal').textContent = String(state.kreaBrush);
  saveForm();
});
$('#kreaMaskErase').addEventListener('click', () => {
  state.kreaMaskErase = !state.kreaMaskErase;
  $('#kreaMaskErase').classList.toggle('active', state.kreaMaskErase);
});
$('#kreaMaskReset').addEventListener('click', () => clearKreaMask());
$('#kreaMaskApply').addEventListener('click', async () => {
  try {
    await ensureKreaMaskUploaded();
    updateMaskedRefPreview();
    $('#kreaMaskSheet').classList.remove('show');
    toast('Mask ready for Krea2 inpaint');
  } catch (e) { toast(e.message, true); }
});

/* Composite the painted mask (red tint) over the source thumbnail so the
   ref slot shows what will be inpainted after Apply. */
function updateMaskedRefPreview() {
  const ref = state.refs[0];
  const maskCanvas = $('#kreaMaskCanvas');
  if (!ref || !maskCanvas || !maskCanvas.width || !state.kreaMaskPreview) return;
  const base = $('#kreaMaskBase');
  const w = maskCanvas.width;
  const h = maskCanvas.height;
  const tint = document.createElement('canvas');
  tint.width = w;
  tint.height = h;
  const tctx = tint.getContext('2d');
  tctx.drawImage(maskCanvas, 0, 0);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
  tctx.fillRect(0, 0, w, h);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  try { ctx.drawImage(base, 0, 0, w, h); } catch { /* base not ready */ }
  ctx.globalAlpha = 0.55;
  ctx.drawImage(tint, 0, 0);
  ctx.globalAlpha = 1;
  ref.displayUrl = out.toDataURL('image/jpeg', 0.85);
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
  const elevation = QWEN_ANGLE_ELEVATIONS.find((option) => option.id === state.qwenAngleElevation)?.label.toLowerCase();
  const distance = QWEN_ANGLE_DISTANCES.find((option) => option.id === state.qwenAngleDistance)?.label.toLowerCase();
  $('#qwenAngleSummary').textContent = selected
    ? `${selected} angle export${selected === 1 ? '' : 's'} · ${elevation} · ${distance}`
    : 'No views selected';
  $('#qwenAnglesDone').textContent = selected ? `Use ${selected} angle${selected === 1 ? '' : 's'}` : 'Done';
}

function openQwenAngles() {
  renderQwenAnglePicker();
  $('#qwenAnglesSheet').classList.add('show');
}
function closeQwenAngles() { $('#qwenAnglesSheet').classList.remove('show'); }
$('#qwenAnglesBtn').addEventListener('click', openQwenAngles);
$('#qwenAnglesClose').addEventListener('click', closeQwenAngles);
$('#qwenAnglesDone').addEventListener('click', closeQwenAngles);

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
  $('#resSummary').textContent = state.customDims
    ? `custom · ${state.width} × ${state.height}`
    : `${state.aspect} · ${state.width} × ${state.height}`;
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

function renderEditUpscale() {
  const toggle = $('#editUpscaleToggle');
  const body = $('#editUpscaleBody');
  const enabled = state.editUpscaleEnabled === true;
  toggle.setAttribute('aria-pressed', String(enabled));
  $('#editUpscaleSummary').textContent = enabled ? `SeedVR2 · ${state.editUpscaleResolution === 3840 ? '4K' : `${state.editUpscaleResolution}p`}` : 'Off';
  body.classList.toggle('expanded', enabled);
  body.inert = !enabled;
  body.setAttribute('aria-hidden', String(!enabled));
  $$('#editUpscaleResolution .chip').forEach((button) => button.classList.toggle('active', Number(button.dataset.resolution) === state.editUpscaleResolution));
  $$('#editUpscaleProfile .chip').forEach((button) => button.classList.toggle('active', button.dataset.profile === state.editUpscaleProfile));
  $$('#editUpscaleNoise .chip').forEach((button) => button.classList.toggle('active', button.dataset.noise === state.editUpscaleNoise));
}

$('#editUpscaleToggle').addEventListener('click', () => {
  state.editUpscaleEnabled = !state.editUpscaleEnabled;
  renderEditUpscale();
  saveForm();
});
$$('#editUpscaleResolution .chip').forEach((button) => button.addEventListener('click', () => {
  state.editUpscaleResolution = Number(button.dataset.resolution) || 2160;
  renderEditUpscale();
  saveForm();
}));
$$('#editUpscaleProfile .chip').forEach((button) => button.addEventListener('click', () => {
  state.editUpscaleProfile = button.dataset.profile === 'balanced' ? 'balanced' : 'sharp';
  renderEditUpscale();
  saveForm();
}));
$$('#editUpscaleNoise .chip').forEach((button) => button.addEventListener('click', () => {
  state.editUpscaleNoise = ['off', 'low', 'medium'].includes(button.dataset.noise) ? button.dataset.noise : 'low';
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
  } catch {
    state.loraContext = {};
    renderPromptSuggestions();
  }
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
        renderLoras();
        saveForm();
      } },
      { label: 'Remove from stack', danger: true, action: () => { arr.splice(idx, 1); renderLoras(); saveForm(); } },
    ]);
  });

  let holdTimer = null;
  let adjusting = false;
  let moved = false;
  let startY = 0;
  let startStrength = l.strength;
  const strengthEl = card.querySelector('.lc-strength');
  const adjustEl = card.querySelector('.lc-adjust');

  card.addEventListener('pointerdown', (e) => {
    if (e.target === menuBtn) return;
    moved = false;
    adjusting = false;
    startY = e.clientY;
    startStrength = Number(l.strength) || 0;
    holdTimer = setTimeout(() => {
      adjusting = true;
      card.classList.add('adjusting');
      adjustEl.textContent = startStrength.toFixed(2);
      if (navigator.vibrate) navigator.vibrate(10);
    }, 300);
    try { card.setPointerCapture(e.pointerId); } catch { /* noop */ }
  });
  card.addEventListener('pointermove', (e) => {
    if (adjusting) {
      const dy = startY - e.clientY; // up = stronger
      l.strength = Math.max(0, Math.min(2, Math.round((startStrength + dy / 90) * 20) / 20));
      adjustEl.textContent = l.strength.toFixed(2);
      strengthEl.textContent = l.strength.toFixed(2);
    } else if (Math.abs(e.clientY - startY) > 12) {
      moved = true;
      clearTimeout(holdTimer);
    }
  });
  const finish = () => {
    clearTimeout(holdTimer);
    // renderLoras() can change layout (e.g. prompt-suggestion chips appear
    // when a context LoRA activates) — keep the viewport where it was.
    const sy = window.scrollY;
    if (adjusting) {
      card.classList.remove('adjusting');
      adjusting = false;
      saveForm();
      renderLoras(); // refresh badge formatting
      window.scrollTo(0, sy);
    } else if (!moved) {
      l.on = !l.on;
      renderLoras();
      window.scrollTo(0, sy);
      saveForm();
    }
  };
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', () => {
    clearTimeout(holdTimer);
    if (adjusting) { card.classList.remove('adjusting'); adjusting = false; saveForm(); renderLoras(); }
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
  $('#vidDurScrub').setAttribute('aria-valuenow', String(duration));
  $('#vidDurScrub').setAttribute('aria-valuemax', $('#vidDur').max || '15');
  $('#vidFreeScrub').setAttribute('aria-valuenow', String(motion));
}

function renderDurationWheel() {
  const input = $('#vidDur');
  const wheel = $('#durationWheel');
  const current = Number(input.value) || 1;
  const min = Number(input.min) || 1;
  const max = Number(input.max) || 15;
  const step = Number(input.step) || 1;
  wheel.replaceChildren();
  for (let value = min; value <= max; value += step) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'duration-wheel-option' + (value === current ? ' active' : '');
    option.dataset.duration = String(value);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(value === current));
    option.textContent = String(value);
    option.addEventListener('click', () => {
      setVideoScrubValue(input, value);
      renderDurationWheel();
      centerDurationWheel();
    });
    wheel.appendChild(option);
  }
}

function centerDurationWheel() {
  const active = $('#durationWheel .duration-wheel-option.active');
  if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function syncDurationWheelFromScroll() {
  const wheel = $('#durationWheel');
  const options = $$('#durationWheel .duration-wheel-option');
  if (!options.length) return;
  const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
  const nearest = options.reduce((best, option) => {
    const rect = option.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - center);
    return !best || distance < best.distance ? { option, distance } : best;
  }, null);
  if (!nearest) return;
  const value = Number(nearest.option.dataset.duration);
  if (value !== Number($('#vidDur').value)) setVideoScrubValue($('#vidDur'), value);
  options.forEach((option) => {
    const active = option === nearest.option;
    option.classList.toggle('active', active);
    option.setAttribute('aria-selected', String(active));
  });
}

let durationWheelFrame = 0;
$('#durationWheel').addEventListener('scroll', () => {
  if (durationWheelFrame) return;
  durationWheelFrame = requestAnimationFrame(() => {
    durationWheelFrame = 0;
    syncDurationWheelFromScroll();
  });
}, { passive: true });

function openDurationPicker() {
  renderDurationWheel();
  $('#durationPickerSheet').classList.add('show');
  requestAnimationFrame(centerDurationWheel);
}

$('#durationPickerDone').addEventListener('click', () => $('#durationPickerSheet').classList.remove('show'));

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
wireVideoScrubber('vidFreeScrub', 'vidFree');

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
      ? 'Image set as the end frame — choose the start frame and video settings'
      : 'Image set as the start frame — choose video settings');
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
  state.editEngine = engine;
  if (engine === 'krea2' && Number($('#denoiseInput').value) <= 0.5) {
    // Soft inpaint needs a strong denoise to actually repaint the mask
    $('#denoiseInput').value = 0.9;
    $('#denoiseVal').textContent = '0.90';
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
  const qwenAngleExports = state.view === 'edit' && state.editEngine === 'qwen' ? selectedQwenAngleViews() : [];
  if (!prompt && !hasRegionPrompts && !qwenAngleExports.length) return toast('Type a prompt first', true);

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
  const seedRaw = $('#seedInput').value.trim();
  let maskImageName = '';
  if (mode === 'edit' && state.editEngine === 'krea2' && (state.kreaMask || state.kreaMaskDirty || state.kreaMaskPreview)) {
    if (!state.refs[0]) return toast('Krea2 inpaint needs a source image in reference slot 1', true);
    try { maskImageName = await ensureKreaMaskUploaded(); }
    catch (e) { return toast(e.message, true); }
  }
  const body = {
    mode,
    editEngine: mode === 'edit' ? state.editEngine : undefined,
    composite: mode === 'edit' ? $('#editComposite').getAttribute('aria-pressed') === 'true' : undefined,
    prompt,
    enhance: state.enhance && mode === 't2i',
    width: mode === 'edit' && state.editAspectOverride ? state.editWidth : state.width,
    height: mode === 'edit' && state.editAspectOverride ? state.editHeight : state.height,
    editAspectOverride: mode === 'edit' && state.editAspectOverride,
    postUpscale: mode === 'edit' && state.editUpscaleEnabled ? {
      enabled: true,
      resolution: state.editUpscaleResolution,
      profile: state.editUpscaleProfile,
      noise: state.editUpscaleNoise,
    } : undefined,
    steps: Number($('#stepsInput').value) || 12,
    cfg: Number($('#cfgInput').value) || 1,
    batch: Number($('#batchInput').value) || 1,
    denoise: mode === 'edit' ? Number($('#denoiseInput').value) : 1,
    seed: seedRaw === '' ? undefined : Number(seedRaw),
    loras: mode === 'edit' ? state.editLoras : state.loras,
    refImages: mode === 'edit'
      ? state.refs.slice(0, state.editEngine === 'krea2' ? 1 : 3).filter(Boolean).map((r) => r.name)
      : [],
    regions: activeRegionsForRequest(),
    maskImageName,
    sourceItemId: mode === 'edit' && state.refs[0] ? state.refs[0].srcItemId : undefined,
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
    setGenerating(true, requests.length > 1 ? `Queueing ${requests.length} angles…` : 'Queued…');
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
    it.compositeInfo && it.compositeInfo.label,
    it.file,
    folder && folder.name,
    ...loras,
    ...regions,
    ...videoText,
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
  for (const entry of entries) {
    const it = entry.item;
    const card = document.createElement('button');
    card.className = 'card' + (entry.angleGroupId ? ' angle-group' : '');
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
    } else if (it.mode === 'composite') {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = 'Composite';
      card.appendChild(b);
    } else if (it.mode === 'edit') {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = 'Edit';
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

function playLikeBurst(target) {
  if (!target) return;
  const burst = target.id === 'lightboxLikeBurst'
    ? target : document.createElement('div');
  burst.className = 'like-burst';
  burst.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21 3.9 12.9A5.6 5.6 0 0 1 12 5.15a5.6 5.6 0 0 1 8.1 7.75L12 21Z"/></svg>';
  if (burst !== target) target.appendChild(burst);
  burst.classList.remove('pop');
  requestAnimationFrame(() => burst.classList.add('pop'));
  setTimeout(() => {
    burst.classList.remove('pop');
    if (burst !== target) burst.remove();
  }, 760);
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
  if (liked) playLikeBurst(burstTarget);
  renderGrid();
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
    : (angleItems.length > 1
      ? `${angleViewLabel(it)} · Angle ${angleIndex + 1} of ${angleItems.length}`
      : (it.upscaled ? 'Upscaled' : (it.mode === 'edit' ? 'Edit' : (it.mode === 'video' ? 'Video Poster' : 'Generation'))));
  $('#lbCompareBtn').hidden = !(!selVideo && it.upscaled);

  // media switcher (only when the image has videos)
  const mrow = $('#lbMedia');
  mrow.innerHTML = '';
  if (angleItems.length > 1) {
    angleItems.forEach((angleItem, index) => {
      const button = document.createElement('button');
      button.className = 'chip angle-group-chip' + (angleItem.id === it.id ? ' active' : '');
      button.textContent = `${index + 1}. ${angleViewLabel(angleItem)}`;
      button.addEventListener('click', () => openLightbox(angleItem.id, 'image'));
      mrow.appendChild(button);
    });
  }
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
      const eng = { wan: 'Wan 2.2', eros: '10Eros DMD', scail: 'SCAIL 2', 'ltx-edit': 'LTX Edit' }[info.engine] || 'LTX 2.3';
      const scailFlags = [info.scailMode && `SCAIL ${info.scailMode}`, info.scailMode === 'chunked' && info.scailStableTracking && 'stable', info.scailMode === 'chunked' && info.scailChunkFrames && `${info.scailChunkFrames}f chunks`, info.scailMode === 'chunked' && info.scailChunkOverlap && `${info.scailChunkOverlap}f overlap`].filter(Boolean).join(', ');
      const flags = [info.composite && '⿻ side-by-side', info.faceId && '🪪 Face ID', info.processed === 'upscale' && 'RTX upscale', info.processed === 'interpolate' && 'RIFE pass', info.smooth && `⏫ RIFE ${info.smooth}×`, info.fourK && 'RTX 4K', info.engine === 'wan' && info.fast && '4-step', info.sigmaPreset && `sigmas: ${info.sigmaPreset}`, scailFlags, info.drivenAudio && '🎵 audio-driven', info.preservedAudio && '🎵 audio kept', info.endFrame && '🏁 end frame', info.motionVideo && !info.composite && '🎥 motion transfer'].filter(Boolean).join(' · ');
      meta.push(`<b>Video:</b> ${eng} · ${(info.frames / info.fps).toFixed(1)}s @ ${info.fps}fps${flags ? ' · ' + flags : ''} &nbsp; <b>Seed:</b> ${info.seed ?? '—'}`);
      if (info.loras && info.loras.length) meta.push('<b>Video LoRAs:</b> ' + info.loras.map((l) => `${prettyLora(l.name)} (${Number(l.strength).toFixed(2)})`).join(', '));
    }
  } else {
    meta.push(`<b>Prompt:</b> ${escapeHtml(it.prompt || '')}`);
    if (it.mode === 'composite' && it.compositeInfo) meta.push(`<b>Composite:</b> ${escapeHtml(it.compositeInfo.label || 'Saved composite')}`);
    if (angleItems.length > 1) meta.push(`<b>Camera angle set:</b> ${angleViewLabel(it)} · ${angleItems.length} views`);
    if (it.mode === 'edit' && it.editEngine) meta.push(`<b>Editor:</b> ${editEngineLabel(it.editEngine)}`);
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
  } else if (it.mode !== 'composite') {
    mk(videos.length ? '🎬 Animate again' : '🎬 Animate', 'primary', () => openAnimateRouteSheet(it));
  }
  if (!selVideo || videos.length) {
    mk(it.liked ? '♥ Liked' : '♡ Like', it.liked ? 'primary' : '', () => toggleItemLike(it, $('#lightboxLikeBurst')));
  }
  if (!selVideo && angleItems.length > 1) {
    mk('▦ Save angle composite', '', () => saveImageComposite(it, 'angles'));
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
    mk('▣ Save before + after', '', () => saveImageComposite(it, 'before-after'));
  }

  // Region-prompted images: hold to overlay the color-coded boxes,
  // plus export the annotated version.
  if (!selVideo && Array.isArray(it.regions) && it.regions.length) {
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
    const items = state.currentItem && state.currentItem.angleGroupId
      ? angleGroupItems(state.currentItem)
      : visibleItems();
    const idx = items.findIndex((i) => i.id === state.currentItem.id);
    if (idx === -1) return;
    const next = dx < 0 ? items[idx + 1] : items[idx - 1];
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

async function restoreKreaMask(item) {
  clearKreaMask(true);
  if (!item.maskImageName || state.editEngine !== 'krea2') return false;
  try {
    const response = await fetch('/api/input?name=' + encodeURIComponent(item.maskImageName));
    if (!response.ok) throw new Error('missing mask');
    const url = URL.createObjectURL(await response.blob());
    state.kreaMask = { name: item.maskImageName, url };
    state.kreaMaskPreview = url;
    state.kreaMaskDirty = false;
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
  state.activeRegionId = state.regions[0] ? state.regions[0].id : null;
  if (restoringEdit) {
    state.editLoras = restoredLoraList(it.loras);
    state.editEngine = restoredEditEngine(it.editEngine);
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
  }
  renderEnhance();
  renderAspects();
  renderDims();
  renderLoras();
  renderEditUpscale();
  renderQwenAngleTool();
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
const settingsTabNames = ['general', 'image', 'video', 'system'];

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

$('#settingsBtn').addEventListener('click', async () => {
  closeAppDrawer();
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
    state.loraThumbs = lastMeta.loraThumbs || {};
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
  const labels = { core: 'Core nodes', enhance: 'Prompt enhance (TextGenerate)', klein: 'Edit (Flux 2 Klein) nodes', qwenedit: 'Edit (Qwen Image Edit) nodes', regional: 'Krea2 regional prompting nodes', krea2inpaint: 'Krea2 inpaint nodes', krea2ref: 'Krea 2 Edit (Rebalance) nodes', upscale: 'SeedVR2 nodes', ultimateupscale: 'Ultimate SD Upscale nodes', video: 'LTX 2.3 video nodes', videoedit: 'LTX Edit guide-video nodes', video4k: 'RTX 4K pass (optional)', wan: 'Wan 2.2 nodes', eros: '10Eros DMD nodes', scail: 'SCAIL 2 motion transfer nodes', scailinfinity: 'SCAIL 2 Infinity node', faceid: 'LTX Face ID (BFS) nodes' };
  for (const [group, missing] of Object.entries(lastMeta.missing || {})) {
    rows.push(missing.length
      ? `<span class="bad">●</span> ${labels[group]}: missing ${missing.map(escapeHtml).join(', ')}`
      : `<span class="ok">●</span> ${labels[group]}: OK`);
  }
  const fieldLabels = { unet: 'UNET', clip: 'text encoder', vae: 'VAE', lora: 'LoRA', node: 'node', pusa: 'Pusa LoRA' };
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
