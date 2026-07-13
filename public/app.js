/* KreaStudio front-end — mobile-first, Modatory design language */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const CameraSettings = window.KreaCameraSettings;
const ProgressEta = window.KreaProgressEta;
const JobReconciliation = window.KreaJobReconciliation;
const progressEta = ProgressEta.createProgressEtaTracker();
// Keep every local workspace write bound to the profile that loaded this
// document. Profile transitions update localStorage before the old page exits,
// so consulting the live key during pagehide can otherwise copy one profile's
// setup into another profile.
const workspaceSessionProfileId = localStorage.getItem('ks-profile-id') || '';
let suppressWorkspaceAutosave = false;

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
  editMp: 1,
  editWidth: 1024,
  editHeight: 1024,
  editOutpaint: false,
  editOutpaintPosition: 'center',
  editOutpaintOffsetX: null,
  editOutpaintOffsetY: null,
  editOutpaintScale: 100,
  editOutpaintFeather: 12,
  editOutpaintMaskOffset: 0,
  editRefSlots: 1,
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
  qwenAngleElevations: [],
  qwenAngleDistances: [],
  qwenQuality: 'quality',
  prompts: { create: '', edit: '', video: '' }, // per-tab prompt text
  loras: [],                 // {name, strength, on} - Create tab (Krea 2)
  videoLoras: [],            // {name, strength, on} - Video tab (LTX/Wan)
  editLoras: [],             // {name, strength, on} - Edit tab (Klein/Qwen)
  editLorasByEngine: {},     // remembered independently for each edit model
  kleinOutpaintConsistencyLoras: {}, // managed per-model LoRA settings, shown only during Klein outpaint
  editAutomaticLoras: {},    // managed Qwen/Krea workflow LoRAs, shown while their workflow is active
  loraTriggers: {},          // profile-local trigger phrase by LoRA filename
  editEngine: 'klein4',
  editEngineOrder: ['klein4', 'klein9', 'qwen', 'krea2', 'krea2ref'],
  editEngineDefault: 'klein4',
  videoEngineOrder: ['ltx', 'ltx-edit', 'eros', 'wan', 'scail'],
  videoEngineDefault: 'ltx',
  refs: [null, null, null],  // {name(comfy), url(local preview)}
  createRef: null,           // optional Krea 2 image-to-image source
  createImageGuideOpen: false,
  createGuideMode: 'image',  // image-to-image pixels or depth-only structure control
  createMatchSource: false,
  createMatchNative: false,
  createInfluence: 55,       // 0-100; mapped inversely to sampler denoise
  createDepthStrength: 100,  // 5-200; maps to Control LoRA strength 0.05-2.0
  createDepthPreview: null,  // { name, url } — cached DA3 map for the current guide image
  createDepthPreviewShown: false,
  krea2Turbo: true,          // merged Turbo checkpoint vs Raw checkpoint
  krea2RawTurboLora: null,   // managed Raw-mode Turbo LoRA, preserved while hidden
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
  kreaMaskViewMode: 'dim',
  vidRef: null,              // {name, url, w, h} - Video tab source image
  vidAutoMotionPrompt: false,
  motionPromptRequestsPending: 0,
  folders: [],
  items: [],
  privateUnlocked: false,
  activeFolder: 'all',
  mediaFilter: 'all',
  sortMode: 'new',
  likesOnly: false,
  libraryQuery: '',
  mediaPreferences: {
    videoPreviews: true,
    previewCache: false,
  },
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
  generationTuning: { create: null, edit: null, video: null },
  cameraSettings: CameraSettings ? Object.assign({}, CameraSettings.DEFAULT_CAMERA_SETTINGS) : {},
  showAllLoras: true,
  activeJobs: new Set(),
  activeJobSequences: new Map(), // prompt id -> sequential edit id
  compositeJobs: new Map(), // prompt id -> parent item + composite type
  upscaling: new Set(),      // item ids
  animating: new Set(),      // item ids
  pendingGalleryRequests: new Set(), // kind:item while its queue POST is in flight
  animateTarget: null,
  animateRouteTarget: null,
  currentItem: null,
  currentMedia: null,
  desktopItemId: null,
  desktopMediaId: 'image',
  desktopReuseToken: 0,
  desktopSettingsReady: false,
  desktopStageDismissed: false,
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
const RESOLUTION_SIZE_OPTIONS = [0.75, 1, 1.75];

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
const OUTPAINT_EDIT_ENGINES = new Set(EDIT_ENGINES);
const ANGLE_EDIT_ENGINES = new Set(['klein4', 'klein9', 'qwen']);
const SEQUENTIAL_EDIT_ENGINES = new Set(['klein4', 'klein9', 'qwen', 'krea2ref']);
const EDIT_MASK_ENGINES = new Set(['klein4', 'klein9', 'qwen', 'krea2']);
const EDIT_FEATURES = { klein4: 'edit.klein4', klein9: 'edit.klein9', qwen: 'edit.qwen', krea2: 'edit.krea2', krea2ref: 'edit.krea2ref' };
const VIDEO_FEATURES = { ltx: 'video.ltx', 'ltx-edit': 'video.ltxEdit', eros: 'video.eros', wan: 'video.wan', scail: 'video.scail' };
const VIDEO_ENGINES = Object.keys(VIDEO_FEATURES);

function normalizeEngineOrder(order, engines) {
  const valid = Array.isArray(order) ? order.filter((engine) => engines.includes(engine)) : [];
  return [...new Set(valid.concat(engines))];
}

function promoteEngineDefault(order, preferred, engines) {
  const normalized = normalizeEngineOrder(order, engines);
  if (!engines.includes(preferred)) return normalized;
  return [preferred, ...normalized.filter((engine) => engine !== preferred)];
}

function featureEnabled(key) { return state.features[key] !== false; }
function enabledEditEngines() { return normalizeEngineOrder(state.editEngineOrder, EDIT_ENGINES).filter((engine) => featureEnabled(EDIT_FEATURES[engine])); }
function enabledVideoEngines() { return normalizeEngineOrder(state.videoEngineOrder, VIDEO_ENGINES).filter((engine) => featureEnabled(VIDEO_FEATURES[engine])); }
function supportsCurrentEditAngles() { return state.view === 'edit' && ANGLE_EDIT_ENGINES.has(state.editEngine); }

function renderFeatureVisibility() {
  applySavedEngineOrders();
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
  if (isError && String(msg || '').length > 220) {
    showErrorDetail(msg);
    return;
  }
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toastZone').appendChild(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3200);
}

let errorDetailText = '';

function closeErrorDetail() {
  const sheet = $('#errorDetailSheet');
  if (sheet.contains(document.activeElement)) document.activeElement.blur();
  sheet.classList.remove('show');
}

function showErrorDetail(message, title = 'Generation error') {
  errorDetailText = String(message || 'An unknown error occurred.');
  $('#errorDetailTitle').textContent = title;
  $('#errorDetailMessage').textContent = errorDetailText;
  const copyLabel = $('#errorDetailCopy span');
  if (copyLabel) copyLabel.textContent = 'Copy error';
  $('#errorDetailSheet').classList.add('show');
  setTimeout(() => $('#errorDetailCopy').focus(), 80);
}

$('#errorDetailClose').addEventListener('click', closeErrorDetail);
$('#errorDetailDismiss').addEventListener('click', closeErrorDetail);
$('#errorDetailSheet').addEventListener('click', (event) => {
  if (event.target === $('#errorDetailSheet')) closeErrorDetail();
});
$('#errorDetailCopy').addEventListener('click', async () => {
  try {
    await copyTextToClipboard(errorDetailText);
    $('#errorDetailCopy span').textContent = 'Copied';
  } catch {
    $('#errorDetailCopy span').textContent = 'Copy failed';
  }
});

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

function loraTriggerToken(name) {
  return `@lora-trigger[${encodeURIComponent(String(name || ''))}]`;
}

function loraNameFromTriggerToken(token) {
  const value = String(token || '');
  const current = /^@lora-trigger\[([^\]]+)\]$/.exec(value);
  const legacy = /^@lora-trigger-([^\s,;:!?]+)$/.exec(value);
  const encoded = (current && current[1]) || (legacy && legacy[1]) || '';
  try { return decodeURIComponent(encoded); } catch { return ''; }
}

function promptLoraTriggerTokens(value) {
  return String(value || '').match(/@lora-trigger\[[^\]]+\]|@lora-trigger-[^\s,;:!?]+/g) || [];
}

function promptHasLoraTriggerToken(value, name) {
  return promptLoraTriggerTokens(value).some((token) => loraNameFromTriggerToken(token) === name);
}

function expandPromptLoraTriggers(value) {
  return String(value || '').replace(/@lora-trigger\[[^\]]+\]|@lora-trigger-[^\s,;:!?]+/g, (token) => {
    const name = loraNameFromTriggerToken(token);
    const phrase = name && typeof loraTriggerPhrase === 'function' ? loraTriggerPhrase({ name }) : '';
    return phrase || token;
  });
}

function promptForGeneration() {
  return expandPromptLoraTriggers(promptDraft().replace(/@image-(\d+)/g, 'image $1'));
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

function makePromptLoraTriggerToken(name) {
  const token = document.createElement('span');
  const phrase = typeof loraTriggerPhrase === 'function' ? loraTriggerPhrase({ name }) : '';
  token.className = 'prompt-lora-token';
  token.contentEditable = 'false';
  token.dataset.loraName = name;
  token.style.setProperty('--lora-trigger-color', loraTriggerColor(name));
  token.title = `LoRA trigger: ${phrase || prettyLora(name)}`;
  token.textContent = phrase || prettyLora(name);
  return token;
}

function renderPromptComposer() {
  const composer = $('#promptComposer');
  if (!composer) return;
  const value = promptDraft();
  const parts = value.split(/(@image-\d+|@lora-trigger\[[^\]]+\]|@lora-trigger-[^\s,;:!?]+)/g);
  composer.replaceChildren();
  parts.forEach((part) => {
    const refMatch = /^@image-(\d+)$/.exec(part);
    const loraMatch = /^@lora-trigger(?:\[[^\]]+\]|-[^\s,;:!?]+)$/.test(part);
    if (refMatch) composer.appendChild(makePromptReferenceToken(refMatch[1]));
    else if (loraMatch) composer.appendChild(makePromptLoraTriggerToken(loraNameFromTriggerToken(part)));
    else if (part) composer.appendChild(document.createTextNode(part));
  });
}

function composerNodeText(node, root) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node;
  if (el.classList.contains('prompt-ref-token')) return `@image-${el.dataset.refIndex}`;
  if (el.classList.contains('prompt-lora-token')) return loraTriggerToken(el.dataset.loraName);
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

let appDialogResolver = null;
let appDialogOptions = null;
let appDialogChoice = null;

function closeAppDialog(value = null) {
  const sheet = $('#appDialogSheet');
  if (sheet.contains(document.activeElement)) document.activeElement.blur();
  sheet.classList.remove('show', 'over-profile-gate');
  const resolve = appDialogResolver;
  appDialogResolver = null;
  appDialogOptions = null;
  appDialogChoice = null;
  if (resolve) resolve(value);
}

function openAppDialog(options = {}) {
  if (appDialogResolver) closeAppDialog();
  appDialogOptions = options;
  appDialogChoice = options.defaultChoice ?? null;
  $('#appDialogTitle').textContent = options.title || 'Continue?';
  $('#appDialogCopy').textContent = options.message || '';
  $('#appDialogCopy').hidden = !options.message;
  $('#appDialogConfirm').textContent = options.confirmLabel || 'Continue';
  $('#appDialogCancel').textContent = options.cancelLabel || 'Cancel';
  $('#appDialogForm').classList.toggle('danger', !!options.danger);
  $('#appDialogError').hidden = true;
  $('#appDialogError').textContent = '';

  const inputOptions = options.input;
  $('#appDialogField').hidden = !inputOptions;
  if (inputOptions) {
    const input = $('#appDialogInput');
    $('#appDialogLabel').textContent = inputOptions.label || 'Value';
    input.type = inputOptions.type || 'text';
    input.value = inputOptions.value == null ? '' : String(inputOptions.value);
    input.placeholder = inputOptions.placeholder || '';
    input.setAttribute('maxlength', String(inputOptions.maxLength || 160));
    if (inputOptions.min != null) input.min = String(inputOptions.min); else input.removeAttribute('min');
    if (inputOptions.max != null) input.max = String(inputOptions.max); else input.removeAttribute('max');
    if (inputOptions.step != null) input.step = String(inputOptions.step); else input.removeAttribute('step');
    input.autocomplete = inputOptions.autocomplete || 'off';
  }

  const choices = Array.isArray(options.choices) ? options.choices : [];
  const list = $('#appDialogChoices');
  list.innerHTML = '';
  list.hidden = !choices.length;
  choices.forEach((choice, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-dialog-choice' + ((appDialogChoice ?? choices[0].value) === choice.value ? ' active' : '');
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(button.classList.contains('active')));
    button.innerHTML = `<b>${escapeHtml(choice.label)}</b>${choice.detail ? `<small>${escapeHtml(choice.detail)}</small>` : ''}<i>✓</i>`;
    button.addEventListener('click', () => {
      appDialogChoice = choice.value;
      [...list.querySelectorAll('.app-dialog-choice')].forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
    });
    if (index === 0 && appDialogChoice == null) appDialogChoice = choice.value;
    list.appendChild(button);
  });

  $('#appDialogSheet').classList.toggle('over-profile-gate', profileGateOpen);
  $('#appDialogSheet').classList.add('show');
  setTimeout(() => {
    if (inputOptions) $('#appDialogInput').focus();
    else list.querySelector('.app-dialog-choice')?.focus();
    if (!inputOptions && !choices.length) $('#appDialogConfirm').focus();
  }, 80);
  return new Promise((resolve) => { appDialogResolver = resolve; });
}

function askText(options = {}) {
  return openAppDialog(Object.assign({}, options, {
    input: Object.assign({ required: true }, options.input || {}),
  }));
}

async function askConfirm(options = {}) {
  return (await openAppDialog(Object.assign({ confirmLabel: 'Confirm' }, options))) === true;
}

$('#appDialogClose').addEventListener('click', () => closeAppDialog());
$('#appDialogCancel').addEventListener('click', () => closeAppDialog());
$('#appDialogSheet').addEventListener('click', (event) => {
  if (event.target === $('#appDialogSheet')) closeAppDialog();
});
$('#appDialogForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const options = appDialogOptions || {};
  let value = true;
  if (options.input) {
    value = options.input.trim === false ? $('#appDialogInput').value : $('#appDialogInput').value.trim();
    if (options.input.required !== false && !value) {
      $('#appDialogError').textContent = options.input.requiredMessage || 'Enter a value to continue.';
      $('#appDialogError').hidden = false;
      return;
    }
    if (options.input.expected != null && value !== String(options.input.expected)) {
      $('#appDialogError').textContent = options.input.expectedMessage || 'The value does not match.';
      $('#appDialogError').hidden = false;
      return;
    }
  } else if (Array.isArray(options.choices) && options.choices.length) {
    value = appDialogChoice;
  }
  closeAppDialog(value);
});

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
  closeProfileCreate();
  renderGateTiles();
}

function closeProfileCreate() {
  const layer = $('#profileNewForm');
  if (layer.contains(document.activeElement)) document.activeElement.blur();
  layer.hidden = true;
  $('#newProfileError').hidden = true;
  $('#newProfileError').textContent = '';
}

function openProfileCreate() {
  $('#newProfileName').value = '';
  $('#newProfilePin').value = '';
  $('#newProfileError').hidden = true;
  $('#profileNewForm').hidden = false;
  requestAnimationFrame(() => $('#newProfileName').focus({ preventScroll: true }));
}

function renderGateTiles() {
  const list = $('#profileList');
  list.innerHTML = '';
  gateProfiles.forEach((p, i) => {
    const tile = document.createElement('button');
    tile.className = 'profile-tile';
    tile.innerHTML = `${avatarHtml(p, 'tile-img', i)}<span class="tile-name">${escapeHtml(p.name)}${p.hasPin ? ' · PIN' : ''}</span>`;
    tile.addEventListener('click', () => loginProfile(p));
    list.appendChild(tile);
  });
  const add = document.createElement('button');
  add.className = 'profile-tile add';
  add.innerHTML = '<span class="tile-img">＋</span><span class="tile-name">Add profile</span>';
  add.addEventListener('click', openProfileCreate);
  list.appendChild(add);
}

async function loginProfile(p) {
  closeProfileCreate();
  let pin = '';
  if (p.hasPin) {
    pin = await askText({
      title: `Unlock ${p.name}`,
      message: 'Enter this profile’s PIN.',
      confirmLabel: 'Unlock profile',
      input: { label: 'PIN', type: 'password', autocomplete: 'current-password', requiredMessage: 'Enter the profile PIN.' },
    });
    if (pin == null) return;
  }
  try {
    const r = await api(`/api/profiles/${p.id}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    localStorage.setItem('ks-profile-id', r.profile.id);
    reloadWithoutWorkspaceAutosave();
  } catch (e) { toast(e.message, true); }
}

$('#newProfileCancel').addEventListener('click', closeProfileCreate);
$('#profileNewForm').addEventListener('click', (event) => {
  if (event.target === $('#profileNewForm')) closeProfileCreate();
});
$('#profileCreateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('#newProfileName').value.trim();
  if (!name) {
    $('#newProfileError').textContent = 'Give the profile a name.';
    $('#newProfileError').hidden = false;
    $('#newProfileName').focus();
    return;
  }
  $('#newProfileError').hidden = true;
  try {
    const r = await api('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin: $('#newProfilePin').value.trim() }),
    });
    // The server returned a newly created identity, so it must always begin
    // without an autosave or named workspaces from an earlier browser session.
    localStorage.removeItem(profileStorageKey('ks-form', r.profile.id));
    localStorage.removeItem(profileStorageKey('ks-workspaces', r.profile.id));
    localStorage.setItem('ks-profile-id', r.profile.id);
    reloadWithoutWorkspaceAutosave();
  } catch (e) {
    $('#newProfileError').textContent = e.message;
    $('#newProfileError').hidden = false;
  }
});

function renderProfileChip() {
  const btn = $('#profileBtn');
  if (!state.profile) { btn.hidden = true; return; }
  btn.hidden = false;
  $('#profileBtnName').textContent = state.profile.name;
  btn.setAttribute('aria-label', `Profile: ${state.profile.name}`);
}

$('#profileBtn').addEventListener('click', () => {
  const isOwner = state.profile && state.profileIsOwner;
  openActionMenu($('#profileBtn'), [
    { label: 'Edit profile', icon: 'profile', action: openProfileEdit },
    isOwner ? { label: 'Manage profiles', icon: 'users', action: openProfileManage } : null,
    { label: 'Switch profile', icon: 'switch', action: switchProfile },
  ]);
});

async function switchProfile() {
  saveForm();
  try { await api('/api/logout', { method: 'POST' }); } catch { /* noop */ }
  localStorage.removeItem('ks-profile-id');
  reloadWithoutWorkspaceAutosave();
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
  const typed = await askText({
    title: `Delete ${state.profile.name}?`,
    message: 'This permanently removes this profile, its generations, folders, presets, and faces. Type the profile name to confirm.',
    confirmLabel: 'Delete profile',
    danger: true,
    input: { label: 'Profile name', expected: state.profile.name, expectedMessage: 'The profile name does not match.' },
  });
  if (typed == null) return;
  try {
    await api(`/api/profiles/${state.profile.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmName: typed }),
    });
    localStorage.removeItem('ks-profile-id');
    reloadWithoutWorkspaceAutosave();
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
      row.innerHTML = `${avatarHtml(p, 'pm-avatar', i)}<b>${escapeHtml(p.name)}${p.hasPin ? ' · PIN' : ''} · ${p.itemCount}</b>`;
      if (p.hasPin) {
        const clear = document.createElement('button');
        clear.className = 'chip';
        clear.textContent = 'Clear PIN';
        clear.addEventListener('click', async () => {
          if (!await askConfirm({ title: 'Remove profile PIN?', message: `${p.name} will open without a PIN.`, confirmLabel: 'Remove PIN' })) return;
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
        del.innerHTML = actionIconMarkup('delete');
        del.setAttribute('aria-label', `Delete ${p.name}`);
        del.addEventListener('click', async () => {
          const typed = await askText({
            title: `Delete ${p.name}?`,
            message: `This permanently removes the profile and its ${p.itemCount} item${p.itemCount === 1 ? '' : 's'}. Type the profile name to confirm.`,
            confirmLabel: 'Delete profile',
            danger: true,
            input: { label: 'Profile name', expected: p.name, expectedMessage: 'The profile name does not match.' },
          });
          if (typed == null) return;
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
      saveForm();
      localStorage.setItem('ks-profile-id', me.profile.id);
      reloadWithoutWorkspaceAutosave();
      return;
    }
    try {
      const all = await fetch('/api/profiles').then((x) => x.json());
      state.profileIsOwner = !!(all.profiles && all.profiles[0] && all.profiles[0].id === me.profile.id);
    } catch { state.profileIsOwner = false; }
    renderProfileChip();
    renderAppUpdateAccess();
    loadMediaPreferences();
    await loadUserPreferences();
  } catch {
    renderAppUpdateAccess(); // 401 -> api() already opened the gate
  }
}
checkAuth();

window.addEventListener('storage', (event) => {
  if (event.key !== 'ks-profile-id' || (event.newValue || '') === workspaceSessionProfileId) return;
  // A different tab changed the shared profile session. Preserve this tab's
  // setup under its original profile, then reload before it can write or submit
  // work as the newly active cookie identity.
  saveForm();
  reloadWithoutWorkspaceAutosave();
});

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
    depth: '<path d="M12 3 3 8l9 5 9-5-9-5Zm-7.4 8.2L12 15l7.4-3.8L21 12l-9 5-9-5 1.6-.8Zm0 4L12 19l7.4-3.8L21 16l-9 5-9-5 1.6-.8Z"/>',
    'last-frame': '<path d="M4 5h15v14H4V5Zm2 2v10h11V7H6Zm14 4h2v2h-2v-2ZM8 15l2.7-3.2 2 2.1 1.5-1.8L17 15H8Z"/>',
    save: '<path d="M5 3h12l3 3v15H4V3h1Zm1 2v14h12V6.8L16.2 5H6Zm2 0h6v5H8V5Zm1 10h6v4H9v-4Z"/>',
    documentation: '<path d="M5 3h10l4 4v14H5V3Zm2 2v14h10V8h-3V5H7Zm2 6h6v2H9v-2Zm0 4h6v2H9v-2Z"/>',
    composite: '<path d="M5 5h11v11H5V5Zm2 2v7h7V7H7Zm6 4h6v8H9v-3h2v1h6v-4h-4v-2Z"/>',
    process: '<path d="M4 7h10v2H4V7Zm13-1h3v4h-3V6ZM4 15h6v2H4v-2Zm9-1h3v4h-3v-4Zm-3-4h10v2H10v-2Z"/>',
    delete: '<path d="M7 7h10l-.7 13H7.7L7 7Zm2 2 .45 9h5.1L15 9H9Zm1-5h4l1 1h4v2H5V5h4l1-1Z"/>',
    profile: '<path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm0 9c4.4 0 8 2.2 8 5v2H4v-2c0-2.8 3.6-5 8-5Zm0 2c-3.5 0-6 1.6-6 3h12c0-1.4-2.5-3-6-3Z"/>',
    users: '<path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 1a3 3 0 1 1 0 6v-2a1 1 0 1 0 0-2V7ZM9 14c4 0 7 2 7 5v2H2v-2c0-3 3-5 7-5Zm0 2c-3 0-5 1.3-5 3h10c0-1.7-2-3-5-3Zm7-1c3.5 0 6 1.7 6 4.5V21h-4v-2h1.8c-.3-1.1-1.7-1.8-3.8-2V15Z"/>',
    switch: '<path d="m15 4 5 4-5 4V9H5V7h10V4Zm-6 8v3h10v2H9v3l-5-4 5-4Z"/>',
    image: '<path d="M4 4h16v16H4V4Zm2 2v12h12V6H6Zm2 9 3-4 2.4 2.7 1.8-2.1L18 15H8Zm7-7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/>',
    eye: '<path d="M12 5c5.2 0 9 5.3 9 7s-3.8 7-9 7-9-5.3-9-7 3.8-7 9-7Zm0 2c-3.8 0-6.7 3.7-7 5 .3 1.3 3.2 5 7 5s6.7-3.7 7-5c-.3-1.3-3.2-5-7-5Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/>',
    enhance: '<path d="m12 2 1.2 4.1L17 8l-3.8 1.9L12 14l-1.2-4.1L7 8l3.8-1.9L12 2Zm6 10 .8 2.7L21 16l-2.2 1.3L18 20l-.8-2.7L15 16l2.2-1.3L18 12ZM6 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/>',
    heart: '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/>',
    'heart-fill': '<path d="M12 21 3.9 12.9A5.6 5.6 0 0 1 12 5.15a5.6 5.6 0 0 1 8.1 7.75L12 21Z"/>',
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
    sheetScrollY = desktopWorkspaceActive() ? 0 : (window.scrollY || document.documentElement.scrollTop || 0);
    document.body.style.top = desktopWorkspaceActive() ? '0px' : `-${sheetScrollY}px`;
    document.body.classList.add('sheet-open');
  } else if (!anySheetOpen && locked) {
    document.body.classList.remove('sheet-open');
    if (document.body.classList.contains('modal-open')) {
      document.body.style.top = desktopWorkspaceActive() ? '0px' : `-${savedScrollY}px`;
    } else {
      document.body.style.top = '';
      window.scrollTo(0, desktopWorkspaceActive() ? 0 : sheetScrollY);
    }
  }
}

/* ------------------------------------------------------------------ */
/* App drawer + desktop updates                                       */
/* ------------------------------------------------------------------ */

let appUpdateRunning = false;
let appRestartRunning = false;
let appDrawerCreateExpanded = true;
const standaloneDisplayQuery = window.matchMedia('(display-mode: standalone)');

function syncAppDrawerScrollFades() {
  const body = $('#appDrawer .app-drawer-body');
  const region = $('#appDrawer .app-drawer-scroll-region');
  if (!body || !region) return;
  const remaining = body.scrollHeight - body.clientHeight - body.scrollTop;
  region.classList.toggle('can-scroll-up', body.scrollTop > 2);
  region.classList.toggle('can-scroll-down', remaining > 2);
}

function activeFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function runningStandalone() {
  return standaloneDisplayQuery.matches || window.navigator.standalone === true;
}

function syncFullscreenControl() {
  const button = $('#fullscreenBtn');
  if (!button) return;
  const fullscreen = !!activeFullscreenElement();
  const standalone = runningStandalone();
  button.setAttribute('aria-pressed', String(fullscreen || standalone));
  button.querySelector('.app-drawer-label').textContent = fullscreen
    ? 'Exit full screen'
    : (standalone ? 'Full screen active' : 'Full screen');
  button.querySelector('small').textContent = fullscreen
    ? 'Restore window'
    : (standalone ? 'Standalone app' : 'Hide browser controls');
}

async function toggleFullscreen() {
  const current = activeFullscreenElement();
  if (current) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) await exit.call(document);
    return;
  }
  if (runningStandalone()) {
    toast('Mix Studio is already running full screen');
    return;
  }
  const target = document.documentElement;
  const request = target.requestFullscreen || target.webkitRequestFullscreen;
  if (!request) {
    toast('Full screen is unavailable here. Add Mix Studio to your Home Screen instead.', true);
    return;
  }
  try {
    await request.call(target, { navigationUI: 'hide' });
  } catch (error) {
    if (error instanceof TypeError) await request.call(target);
    else throw error;
  }
}

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
  requestAnimationFrame(syncAppDrawerScrollFades);
}

function openAppDrawer() {
  closeActionMenu();
  renderAppDrawerNavigation();
  document.body.classList.add('app-drawer-open');
  $('#appDrawer').classList.add('show');
  $('#appDrawer').setAttribute('aria-hidden', 'false');
  $('#appMenuBtn').setAttribute('aria-expanded', 'true');
  syncSheetScrollLock();
  requestAnimationFrame(syncAppDrawerScrollFades);
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
  const restartButton = $('#appRestartBtn');
  if (appUpdateRunning || appRestartRunning) return;
  const label = button.querySelector('.app-drawer-label');
  const restartLabel = restartButton.querySelector('.app-drawer-label');
  if (!state.profile) {
    button.disabled = true;
    restartButton.disabled = true;
    label.textContent = 'Sign in to update';
    restartLabel.textContent = 'Sign in to restart';
    return;
  }
  if (!state.profileIsOwner) {
    button.disabled = true;
    restartButton.disabled = true;
    label.textContent = 'Owner access required';
    restartLabel.textContent = 'Owner access required';
    setAppUpdateStatus('Switch to the owner profile to install updates.', 'bad');
    return;
  }
  button.disabled = false;
  restartButton.disabled = false;
  label.textContent = 'Update app';
  restartLabel.textContent = 'Restart app';
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
  throw new Error('The update installed, but the app did not come back online. Start Mix Studio on the desktop.');
}

$('#appMenuBtn').addEventListener('click', openAppDrawer);
$('#appDrawerClose').addEventListener('click', closeAppDrawer);
$('#appDrawerBackdrop').addEventListener('click', closeAppDrawer);
$('#appDrawer .app-drawer-body').addEventListener('scroll', syncAppDrawerScrollFades, { passive: true });
window.addEventListener('resize', syncAppDrawerScrollFades);
new MutationObserver(() => requestAnimationFrame(syncAppDrawerScrollFades)).observe($('#appDrawer .app-drawer-body'), {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['class', 'hidden', 'aria-hidden'],
});
$('#fullscreenBtn').addEventListener('click', async () => {
  closeAppDrawer();
  try {
    await toggleFullscreen();
  } catch {
    toast('Could not enter full screen in this browser', true);
  } finally {
    syncFullscreenControl();
  }
});
document.addEventListener('fullscreenchange', syncFullscreenControl);
document.addEventListener('webkitfullscreenchange', syncFullscreenControl);
standaloneDisplayQuery.addEventListener?.('change', syncFullscreenControl);
syncFullscreenControl();
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
      setAppUpdateStatus(`Mix Studio is up to date · ${result.version}`, 'good');
      appUpdateRunning = false;
      renderAppUpdateAccess();
      return;
    }
    if (result.restarting) {
      label.textContent = 'Restarting Mix Studio…';
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

$('#appRestartBtn').addEventListener('click', async () => {
  if (appRestartRunning) return;
  const button = $('#appRestartBtn');
  const label = button.querySelector('.app-drawer-label');
  appRestartRunning = true;
  button.disabled = true;
  button.classList.add('busy');
  label.textContent = 'Restarting Mix Studio…';
  setAppUpdateStatus('Checking both queues, then restarting Mix Studio…');
  try {
    await api('/api/app/restart', { method: 'POST' });
    await waitForAppRestart();
  } catch (error) {
    button.classList.remove('busy');
    appRestartRunning = false;
    setAppUpdateStatus(error.message, 'bad');
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
   between accounts). The id is captured once so outgoing autosaves cannot be
   redirected when login changes the live localStorage value before reload. */
function profileStorageKey(prefix, profileId = workspaceSessionProfileId) {
  const id = String(profileId || '').trim();
  return id ? `${prefix}-${id}` : '';
}

function formKey() {
  return profileStorageKey('ks-form');
}

function mediaPreferencesKey() {
  return profileStorageKey('ks-media-preferences');
}

function loadMediaPreferences() {
  const key = mediaPreferencesKey();
  if (!key) {
    state.mediaPreferences = { videoPreviews: true, previewCache: false };
    return;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    state.mediaPreferences = {
      videoPreviews: saved?.videoPreviews !== false,
      previewCache: saved?.previewCache === true,
    };
  } catch {
    state.mediaPreferences = { videoPreviews: true, previewCache: false };
  }
}

function saveMediaPreferences(next) {
  state.mediaPreferences = {
    videoPreviews: next.videoPreviews !== false,
    previewCache: next.previewCache === true,
  };
  const key = mediaPreferencesKey();
  if (key) {
    try { localStorage.setItem(key, JSON.stringify(state.mediaPreferences)); } catch { /* noop */ }
  }
  if (state.view === 'gallery') renderGrid();
  if (!state.mediaPreferences.previewCache) stopPreviewCacheWarmup();
}

const WORKSPACE_ASSET_FIELDS = [
  'name', 'w', 'h', 'label', 'safeName', 'safeW', 'safeH', 'srcItemId',
  'faceId', 'hasAudio', 'dur', 'trimStart', 'trimEnd', 'duration',
];

function serializeWorkspaceAsset(asset) {
  if (!asset || !asset.name) return null;
  const serialized = Object.fromEntries(WORKSPACE_ASSET_FIELDS
    .filter((key) => asset[key] !== undefined && asset[key] !== null)
    .map((key) => [key, asset[key]]));
  if (asset.cropOriginal && asset.cropOriginal.name) {
    serialized.cropOriginal = Object.fromEntries(WORKSPACE_ASSET_FIELDS
      .filter((key) => asset.cropOriginal[key] !== undefined && asset.cropOriginal[key] !== null)
      .map((key) => [key, asset.cropOriginal[key]]));
  }
  return serialized;
}

function restoreWorkspaceAsset(asset) {
  if (!asset || !asset.name) return null;
  const restored = Object.assign({}, asset, { url: '/api/input?name=' + encodeURIComponent(asset.name) });
  if (asset.cropOriginal && asset.cropOriginal.name) {
    restored.cropOriginal = Object.assign({}, asset.cropOriginal, {
      url: '/api/input?name=' + encodeURIComponent(asset.cropOriginal.name),
    });
  }
  return restored;
}

function serializeWorkspaceAudio(audio) {
  if (!audio || !audio.uploadedName) return null;
  return {
    name: audio.uploadedName,
    label: audio.label || 'audio',
    duration: Number(audio.duration) || 0,
    trimStart: Number(audio.trimStart) || 0,
    trimEnd: Number(audio.trimEnd) || Number(audio.duration) || 0,
  };
}

let persistedWorkspaceAudio = null;
let persistedWorkspaceVideoControls = null;

function saveForm() {
  const key = formKey();
  if (suppressWorkspaceAutosave || !key) return;
  try {
    rememberEditLoras();
    if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) state.prompts[state.view] = promptDraft();
    captureGenerationTuning(generationTuningMode());
    localStorage.setItem(key, JSON.stringify({
      workspaceVersion: 2,
      activeView: ['create', 'edit', 'video'].includes(state.view) ? state.view : 'create',
      gallerySort: ['new', 'active', 'old', 'az'].includes(state.sortMode) ? state.sortMode : 'new',
      enhance: state.enhance, aspect: state.aspect, mp: state.mp,
      loras: state.loras, videoLoras: state.videoLoras, editLoras: state.editLoras, editLorasByEngine: state.editLorasByEngine, prompts: state.prompts,
      kleinOutpaintConsistencyLoras: state.kleinOutpaintConsistencyLoras,
      editAutomaticLoras: state.editAutomaticLoras,
      loraTriggers: state.loraTriggers,
      editEngine: state.editEngine, vidEngine: state.vidEngine, vidScailMode: state.vidScailMode,
      editEngineOrder: state.editEngineOrder, editEngineDefault: state.editEngineDefault,
      videoEngineOrder: state.videoEngineOrder, videoEngineDefault: state.videoEngineDefault,
      cameraSettings: state.cameraSettings,
      createMode: state.createMode,
      createRef: state.createRef ? {
        name: state.createRef.name, w: state.createRef.w, h: state.createRef.h, label: state.createRef.label,
        safeName: state.createRef.safeName, safeW: state.createRef.safeW, safeH: state.createRef.safeH, srcItemId: state.createRef.srcItemId,
      } : null,
      refs: state.refs.map(serializeWorkspaceAsset),
      vidRef: serializeWorkspaceAsset(state.vidRef),
      vidEnd: serializeWorkspaceAsset(state.vidEnd),
      vidDrive: serializeWorkspaceAsset(state.vidDrive),
      vidFace: serializeWorkspaceAsset(state.vidFace),
      vidAudio: serializeWorkspaceAudio(state.vidAudio),
      vidSigma: state.vidSigma,
      vidSmooth: state.vidSmooth,
      videoDuration: $('#vidDur').value,
      videoMotionFreedom: $('#vidFree').value,
      videoFourK: $('#vid4k').classList.contains('active'),
      videoQuality: $('#vidQuality').classList.contains('active'),
      createImageGuideOpen: state.createImageGuideOpen,
      createGuideMode: state.createGuideMode,
      createMatchSource: state.createMatchSource,
      createMatchNative: state.createMatchNative,
      createInfluence: state.createInfluence,
      createDepthStrength: state.createDepthStrength,
      krea2Turbo: state.krea2Turbo,
      krea2RawTurboLora: state.krea2RawTurboLora,
      regions: state.regions.map((region) => Object.assign({}, region, {
        refUrl: region.refImageName ? `/api/input?name=${encodeURIComponent(region.refImageName)}` : '',
        refAsset: serializeWorkspaceAsset(region.refAsset),
      })),
      kreaBrush: state.kreaBrush,
      kreaMaskTool: state.kreaMaskTool,
      kreaMaskFeather: state.kreaMaskFeather,
      editMaskInfluence: state.editMaskInfluence,
      editMaskExpand: state.editMaskExpand,
      kreaMaskInvert: state.kreaMaskInvert,
      kreaMaskViewMode: state.kreaMaskViewMode,
      scailModeVersion: 2,
      vidAutoMotionPrompt: state.vidAutoMotionPrompt,
      vidScailStableTracking: state.vidScailStableTracking,
      vidScailChunkFrames: state.vidScailChunkFrames,
      vidScailChunkOverlap: state.vidScailChunkOverlap,
      customDims: state.customDims, width: state.width, height: state.height,
      editAspectOverride: state.editAspectOverride, editAspect: state.editAspect,
      editMp: state.editMp, editWidth: state.editWidth, editHeight: state.editHeight,
      editOutpaint: state.editOutpaint,
      editOutpaintPosition: state.editOutpaintPosition,
      editOutpaintOffsetX: state.editOutpaintOffsetX,
      editOutpaintOffsetY: state.editOutpaintOffsetY,
      editOutpaintScale: state.editOutpaintScale,
      editOutpaintFeather: state.editOutpaintFeather,
      editOutpaintMaskOffset: state.editOutpaintMaskOffset,
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
      qwenAngleElevations: state.qwenAngleElevations,
      qwenAngleDistances: state.qwenAngleDistances,
      qwenQuality: state.qwenQuality,
      generationTuning: state.generationTuning,
    }));
  } catch { /* noop */ }
}
function loadForm() {
  const key = formKey();
  if (!key) return;
  try {
    const f = JSON.parse(localStorage.getItem(key) || 'null');
    if (!f) return;
    state.view = ['create', 'edit', 'video'].includes(f.activeView) ? f.activeView : 'create';
    state.sortMode = ['new', 'active', 'old', 'az'].includes(f.gallerySort) ? f.gallerySort : 'new';
    state.enhance = f.enhance !== false;
    state.aspect = f.aspect || '1:1';
    state.mp = f.mp || 1;
    state.editAspectOverride = f.editAspectOverride === true;
    state.editAspect = ASPECTS.some((a) => a.label === f.editAspect) ? f.editAspect : '1:1';
    state.editWidth = round32(Number(f.editWidth) || 1024);
    state.editHeight = round32(Number(f.editHeight) || 1024);
    state.editMp = state.editAspectOverride
      ? normalizeResolutionMegapixels(f.editMp, nearestResolutionMegapixels(state.editWidth, state.editHeight))
      : 1;
    state.editOutpaint = f.editOutpaint === true;
    state.editOutpaintPosition = ['start', 'center', 'end'].includes(f.editOutpaintPosition) ? f.editOutpaintPosition : 'center';
    state.editOutpaintOffsetX = optionalUnitOffset(f.editOutpaintOffsetX);
    state.editOutpaintOffsetY = optionalUnitOffset(f.editOutpaintOffsetY);
    state.editOutpaintScale = Math.max(45, Math.min(100, Math.round(Number(f.editOutpaintScale) || 100)));
    state.editOutpaintFeather = Number.isFinite(Number(f.editOutpaintFeather))
      ? Math.max(0, Math.min(25, Math.round(Number(f.editOutpaintFeather)))) : 12;
    state.editOutpaintMaskOffset = Number.isFinite(Number(f.editOutpaintMaskOffset))
      ? Math.max(-15, Math.min(15, Math.round(Number(f.editOutpaintMaskOffset)))) : 0;
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
    state.qwenAngleElevations = Array.isArray(f.qwenAngleElevations)
      ? [...new Set(f.qwenAngleElevations.filter((id) => QWEN_ANGLE_ELEVATIONS.some((option) => option.id === id)))] : [];
    state.qwenAngleDistances = Array.isArray(f.qwenAngleDistances)
      ? [...new Set(f.qwenAngleDistances.filter((id) => QWEN_ANGLE_DISTANCES.some((option) => option.id === id)))] : [];
    state.qwenQuality = f.qwenQuality === 'fast' ? 'fast' : 'quality';
    state.loras = Array.isArray(f.loras) ? f.loras : [];
    state.videoLoras = Array.isArray(f.videoLoras) ? f.videoLoras : [];
    state.loraTriggers = f.loraTriggers && typeof f.loraTriggers === 'object' ? Object.fromEntries(
      Object.entries(f.loraTriggers).map(([name, phrase]) => [name, normalizeLoraTriggerPhrase(phrase)]).filter(([, phrase]) => phrase),
    ) : {};
    [...state.loras, ...state.videoLoras, ...Object.values(f.editLorasByEngine || {}).flat()].forEach((lora) => {
      const phrase = normalizeLoraTriggerPhrase(lora && lora.triggerPhrase);
      if (lora && lora.name && phrase && !state.loraTriggers[lora.name]) state.loraTriggers[lora.name] = phrase;
    });
    const editDefault = EDIT_ENGINES.includes(f.editEngineDefault)
      ? f.editEngineDefault : editEngineId(f.editEngine);
    state.editEngineOrder = promoteEngineDefault(f.editEngineOrder, editDefault, EDIT_ENGINES);
    state.editEngineDefault = state.editEngineOrder[0];
    state.editEngine = EDIT_ENGINES.includes(f.editEngine) ? f.editEngine : state.editEngineDefault;
    const videoDefault = VIDEO_ENGINES.includes(f.videoEngineDefault)
      ? f.videoEngineDefault : (VIDEO_ENGINES.includes(f.vidEngine) ? f.vidEngine : 'ltx');
    state.videoEngineOrder = promoteEngineDefault(f.videoEngineOrder, videoDefault, VIDEO_ENGINES);
    state.videoEngineDefault = state.videoEngineOrder[0];
    state.vidEngine = VIDEO_ENGINES.includes(f.vidEngine) ? f.vidEngine : state.videoEngineDefault;
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
    state.editAutomaticLoras = {};
    if (f.editAutomaticLoras && typeof f.editAutomaticLoras === 'object') {
      Object.entries(f.editAutomaticLoras).forEach(([key, saved]) => {
        if (!saved || !saved.name) return;
        state.editAutomaticLoras[key] = {
          name: String(saved.name),
          strength: Math.max(0, Math.min(2, Number(saved.strength) || 1)),
          on: saved.on !== false,
          managed: 'edit-workflow-auto',
          managedKey: key,
        };
      });
    }
    EDIT_ENGINES.forEach((engine) => {
      const stack = state.editLorasByEngine[engine];
      if (!Array.isArray(stack)) return;
      stack.filter((item) => item && item.managed === 'edit-workflow-auto').forEach((item) => {
        if (item.managedKey && !state.editAutomaticLoras[item.managedKey]) state.editAutomaticLoras[item.managedKey] = item;
      });
      state.editLorasByEngine[engine] = stack.filter((item) => item && item.managed !== 'edit-workflow-auto');
    });
    state.kleinOutpaintConsistencyLoras = {};
    if (f.kleinOutpaintConsistencyLoras && typeof f.kleinOutpaintConsistencyLoras === 'object') {
      ['klein4', 'klein9'].forEach((engine) => {
        const saved = f.kleinOutpaintConsistencyLoras[engine];
        if (!saved || !saved.name) return;
        state.kleinOutpaintConsistencyLoras[engine] = {
          name: String(saved.name),
          strength: Math.max(0, Math.min(2, Number(saved.strength) || 0.6)),
          on: saved.on !== false,
          managed: 'klein-outpaint-consistency',
        };
      });
    }
    ['klein4', 'klein9'].forEach((engine) => {
      const stack = state.editLorasByEngine[engine];
      if (!Array.isArray(stack)) return;
      const legacy = stack.find((item) => item && item.managed === 'klein-outpaint-consistency');
      if (legacy && legacy.name && !state.kleinOutpaintConsistencyLoras[engine]) {
        state.kleinOutpaintConsistencyLoras[engine] = legacy;
      }
      state.editLorasByEngine[engine] = stack.filter((item) => item && item.managed !== 'klein-outpaint-consistency');
    });
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
      safeName: String(f.createRef.safeName || ''),
      safeW: Number(f.createRef.safeW) || 0,
      safeH: Number(f.createRef.safeH) || 0,
      srcItemId: f.createRef.srcItemId || undefined,
    } : null;
    state.refs = Array.isArray(f.refs)
      ? [0, 1, 2].map((index) => restoreWorkspaceAsset(f.refs[index]))
      : [null, null, null];
    state.editRefSlots = Math.max(1, state.refs.reduce((count, ref, index) => ref ? Math.max(count, index + 1) : count, 1));
    state.vidRef = restoreWorkspaceAsset(f.vidRef);
    state.vidEnd = restoreWorkspaceAsset(f.vidEnd);
    state.vidDrive = restoreWorkspaceAsset(f.vidDrive);
    state.vidFace = restoreWorkspaceAsset(f.vidFace);
    persistedWorkspaceAudio = f.vidAudio && f.vidAudio.name ? f.vidAudio : null;
    state.vidSigma = f.vidSigma || state.vidSigma;
    state.vidSmooth = [1, 2, 3].includes(Number(f.vidSmooth)) ? Number(f.vidSmooth) : state.vidSmooth;
    persistedWorkspaceVideoControls = {
      duration: f.videoDuration,
      motionFreedom: f.videoMotionFreedom,
      fourK: f.videoFourK === true,
      quality: f.videoQuality === true,
    };
    state.createImageGuideOpen = f.createImageGuideOpen === true;
    state.createGuideMode = f.createGuideMode === 'depth' ? 'depth' : 'image';
    state.createMatchSource = f.createMatchSource === true && !!state.createRef;
    state.createMatchNative = f.createMatchNative === true && state.createMatchSource;
    const savedDepthStrength = Number(f.createDepthStrength);
    state.createDepthStrength = Number.isFinite(savedDepthStrength)
      ? Math.max(5, Math.min(200, savedDepthStrength)) : 100;
    state.generationTuning = {
      create: normalizeGenerationTuning('create', f.generationTuning && f.generationTuning.create),
      edit: normalizeGenerationTuning('edit', f.generationTuning && f.generationTuning.edit),
      video: normalizeGenerationTuning('video', f.generationTuning && f.generationTuning.video),
    };
    state.kreaMaskTool = ['smart', 'brush', 'box'].includes(f.kreaMaskTool) ? f.kreaMaskTool : 'smart';
    state.regions = Array.isArray(f.regions) ? f.regions.map((region) => Object.assign({}, region, {
      refUrl: region.refImageName ? `/api/input?name=${encodeURIComponent(region.refImageName)}` : '',
      refAsset: restoreWorkspaceAsset(region.refAsset),
    })) : [];
    state.kreaBrush = Number(f.kreaBrush) || 48;
    state.kreaMaskFeather = Math.max(0, Math.min(64, Number(f.kreaMaskFeather) || 8));
    state.kreaMaskViewMode = ['dim', 'color'].includes(f.kreaMaskViewMode) ? f.kreaMaskViewMode : 'dim';
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
    state.vidAutoMotionPrompt = f.vidAutoMotionPrompt === true;
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

function workspaceLibraryKey() {
  return profileStorageKey('ks-workspaces');
}

function savedWorkspaces() {
  const key = workspaceLibraryKey();
  if (!key) return [];
  try {
    const entries = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(entries) ? entries.filter((entry) => entry && entry.id && entry.snapshot).slice(0, 30) : [];
  } catch { return []; }
}

function writeSavedWorkspaces(entries) {
  const key = workspaceLibraryKey();
  if (key) localStorage.setItem(key, JSON.stringify(entries.slice(0, 30)));
}

function workspaceModeLabel(snapshot) {
  if (snapshot.activeView === 'edit') return 'Edit';
  if (snapshot.activeView === 'video') return 'Video';
  return snapshot.createMode === 'region' ? 'Region' : 'Create Image';
}

function renderSavedWorkspaces() {
  const list = $('#savedWorkspaceList');
  const entries = savedWorkspaces();
  list.innerHTML = '';
  $('#savedWorkspaceEmpty').hidden = !!entries.length;
  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'saved-workspace';
    const copy = document.createElement('span');
    copy.className = 'saved-workspace-copy';
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const detail = document.createElement('small');
    detail.textContent = `${workspaceModeLabel(entry.snapshot)} · ${new Date(entry.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
    copy.append(name, detail);
    const actions = document.createElement('span');
    actions.className = 'saved-workspace-actions';
    const load = document.createElement('button');
    load.type = 'button';
    load.textContent = 'Load';
    load.addEventListener('click', () => {
      const key = formKey();
      if (!key) return;
      localStorage.setItem(key, JSON.stringify(entry.snapshot));
      reloadWithoutWorkspaceAutosave();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', `Delete ${entry.name}`);
    del.addEventListener('click', async () => {
      if (!await askConfirm({ title: `Delete ${entry.name}?`, message: 'The current autosaved workspace is not affected.', confirmLabel: 'Delete', danger: true })) return;
      writeSavedWorkspaces(savedWorkspaces().filter((candidate) => candidate.id !== entry.id));
      renderSavedWorkspaces();
    });
    actions.append(load, del);
    row.append(copy, actions);
    list.appendChild(row);
  });
}

function openWorkspaces() {
  saveForm();
  renderSavedWorkspaces();
  closeAppDrawer();
  $('#workspacesSheet').classList.add('show');
}

$('#workspacesBtn').addEventListener('click', openWorkspaces);
$('#workspaceSaveCurrent').addEventListener('click', async () => {
  saveForm();
  const key = formKey();
  const snapshot = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
  if (!snapshot) return;
  const proposed = await askText({
    title: 'Save workspace',
    message: 'Save this complete generation setup for later.',
    confirmLabel: 'Save workspace',
    input: { label: 'Workspace name', placeholder: 'Campaign, character, scene…', maxLength: 60 },
  });
  const name = String(proposed || '').trim();
  if (!name) return;
  const entries = savedWorkspaces();
  const existing = entries.find((entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (existing && !await askConfirm({ title: `Replace ${existing.name}?`, message: 'Update this saved workspace with the current setup.', confirmLabel: 'Replace' })) return;
  const entry = existing || { id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), name };
  entry.name = name;
  entry.snapshot = snapshot;
  entry.updatedAt = Date.now();
  writeSavedWorkspaces([entry, ...entries.filter((candidate) => candidate.id !== entry.id)]);
  renderSavedWorkspaces();
  toast(`Saved workspace “${name}”`);
});

$('#workspaceReset').addEventListener('click', async () => {
  if (!await askConfirm({
    title: 'Reset current workspace?',
    message: 'Clear all prompts, LoRAs, reference media, and generation settings. Named workspaces will remain available.',
    confirmLabel: 'Reset workspace',
    danger: true,
  })) return;
  const key = formKey();
  if (key) localStorage.removeItem(key);
  localStorage.removeItem('ks-form');
  reloadWithoutWorkspaceAutosave();
});

window.addEventListener('pagehide', saveForm);

function reloadWithoutWorkspaceAutosave() {
  suppressWorkspaceAutosave = true;
  location.reload();
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

const primaryTabButtons = $$('#primaryTabs .tab');
const createTabButtons = $$('#createTabs .tab');
const desktopWorkspaceQuery = window.matchMedia('(min-width: 1180px)');
const wideRegionResolutionQuery = window.matchMedia('(min-width: 641px)');

function desktopWorkspaceActive() {
  return desktopWorkspaceQuery.matches;
}

function pinDesktopViewport() {
  if (!desktopWorkspaceActive() || (!window.scrollX && !window.scrollY)) return;
  window.scrollTo(0, 0);
}

window.addEventListener('scroll', pinDesktopViewport, { passive: true });
desktopWorkspaceQuery.addEventListener('change', () => requestAnimationFrame(pinDesktopViewport));
wideRegionResolutionQuery.addEventListener('change', () => {
  if (state.view !== 'create' || state.createMode !== 'region') return;
  setRegionResolutionExpanded(false);
  collapseRes(false);
  updateVideoPanels();
});

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
  document.body.classList.toggle('desktop-library-expanded', desktopWorkspaceActive() && state.view === 'gallery');
  renderAppDrawerNavigation();
}

function setView(view, opts = {}) {
  const prev = state.view;
  if (prev !== view) captureGenerationTuning(generationTuningMode(prev));
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
  if (prev !== view && !isGallery) restoreGenerationTuning(generationTuningMode(view));
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
  const activeCount = state.activeJobs.size + state.motionPromptRequestsPending;
  if (activeCount) {
    return `➕ Add to Queue · ${activeCount} active`;
  }
  if (editOutpaintActive()) return 'Generate Expand';
  if (state.view === 'edit' && state.editEngine === 'krea2' && hasEditMask()) return 'Generate Fill';
  return state.view === 'edit' ? 'Generate Edit' : (state.view === 'video' ? 'Generate Video' : 'Generate');
}

function updateVideoPanels() {
  const isVideo = state.view === 'video';
  const isEdit = state.view === 'edit';
  const isRegion = state.view === 'create' && state.createMode === 'region';
  const useSharedRegionResolution = isRegion && wideRegionResolutionQuery.matches;
  if (isVideo) syncVideoDurationLimit();
  const promptPanel = $('#promptPanel');
  const regionWorkspace = $('#regionWorkspace');
  const promptSlot = $('#regionGlobalPromptSlot');
  const editPromptSlot = $('#editPromptSlot');
  if (isRegion) {
    if (promptPanel.parentElement !== promptSlot) promptSlot.appendChild(promptPanel);
  } else if (isEdit) {
    if (promptPanel.parentElement !== editPromptSlot) editPromptSlot.appendChild(promptPanel);
  } else if (!isRegion && promptPanel.parentElement !== $('#view-create')) {
    $('#view-create').insertBefore(promptPanel, regionWorkspace);
  }
  const scailInputFirst = isVideo && state.vidEngine === 'scail';
  promptPanel.classList.toggle('scail-input-first', scailInputFirst);
  $('#promptLabel').textContent = isRegion ? 'Global prompt' : (scailInputFirst ? 'Creative direction · optional' : 'Prompt');
  $('#promptComposer').dataset.placeholder = isVideo
    ? (state.vidEngine === 'ltx-edit' ? 'Describe the edit…' : (state.vidEngine === 'scail' ? 'Optional — add style or motion direction…' : 'Describe the motion…'))
    : (state.createMode === 'region' && state.view === 'create'
      ? 'Describe the full scene… (optional)'
      : (state.view === 'edit'
        ? (editOutpaintActive() ? 'Optional — describe what should continue beyond the frame…' : 'Describe the change…')
        : 'Describe your image…'));
  $('#vidAttachRow').hidden = !isVideo;
  $('#vidModelPanel').hidden = !isVideo;
  $('#editModelPanel').hidden = !isEdit;
  if (!isEdit) setEditModelExpanded(false);
  $('#vidOptsPanel').hidden = !isVideo;
  $('#enhanceBtn').hidden = isVideo && state.vidEngine === 'ltx-edit';
  if (!supportsCurrentEditAngles()) state.qwenAnglesMode = false;
  $('#qwenAngleTool').hidden = !supportsCurrentEditAngles() || state.qwenAnglesMode || hasEditMask();
  renderQwenAngleTool();
  renderQwenAngleMode();
  renderQwenQuality();
  renderEditModelSummary();
  renderEditSequence();
  regionWorkspace.hidden = !isRegion;
  if (!isRegion) setRegionResolutionExpanded(false);
  $('#vidExtras').hidden = !isVideo || state.vidEngine === 'wan' || state.vidEngine === 'scail' || state.vidEngine === 'ltx-edit';
  $('#createPromptTools').hidden = state.view !== 'create';
  $('#regionsPromptBtn').hidden = isRegion;
  renderKrea2Mode();
  renderCreateImageGuide();
  const kreaEdit = state.view === 'edit' && state.editEngine === 'krea2' && !editOutpaintActive();
  $('#denoiseField').hidden = !kreaEdit;
  syncEditAreaChrome();
  renderEditAspects();
  renderEditUpscale();
  renderKreaMaskTools();
  $('#resPanel').hidden = state.view === 'edit'
    || (isVideo && !!state.vidRef)
    || (isRegion && !useSharedRegionResolution);
  $('.region-resolution-picker').hidden = useSharedRegionResolution;
  if (useSharedRegionResolution) setRegionResolutionExpanded(false);
  $('#seedInput').closest('.panel').hidden = false;
  $('#advancedStepsField').hidden = isVideo;
  $('#advancedCfgField').hidden = isVideo;
  $('#videoAdvancedNote').hidden = !isVideo;
  if (isVideo) { renderVidAttach(); renderVidDrive(); }
  renderLoras();
}

/* Shared source picker: every generation media dropzone can accept either a
   fresh device file or an existing image/video from the current gallery. */
let assetPickerState = null;
let resetAssetPickerSwipeVisuals = () => {};
let animateAssetPickerNavigation = () => {};

function assetPickerKind(accept) {
  return String(accept || '').toLowerCase().startsWith('video') ? 'video' : 'image';
}

function previousGenerationAssets(accept) {
  const kind = assetPickerKind(accept);
  const assets = [];
  for (const item of state.items || []) {
    const folder = (state.folders || []).find((entry) => entry.id === item.folder);
    if (kind === 'video') {
      for (const video of Array.isArray(item.videos) ? item.videos : []) {
        if (!video || !video.file) continue;
        const engine = videoEngineLabel(video.info && video.info.engine);
        const createdAt = Number(video.createdAt || item.createdAt || 0);
        assets.push({
          key: `${item.id}:video:${video.id || video.file}`,
          kind, file: video.file, itemId: item.id, videoId: video.id,
          label: video.info?.motionPrompt || item.prompt || 'Previous video',
          detail: `${engine} · ${new Date(createdAt || Date.now()).toLocaleDateString()}`,
          poster: item.file, activity: createdAt || itemActivity(item), createdAt,
          folder: item.folder || null, folderName: folder?.name || '',
          liked: video.liked === true || item.liked === true,
        });
      }
    } else if (item.file) {
      const model = galleryImageModelLabel(item);
      const createdAt = Number(item.createdAt || 0);
      assets.push({
        key: `${item.id}:image:${item.upscaled || item.file}`,
        kind, file: item.upscaled || item.file, itemId: item.id,
        label: item.prompt || 'Previous image',
        detail: `${model || 'Image'} · ${new Date(item.createdAt || Date.now()).toLocaleDateString()}`,
        activity: createdAt || itemActivity(item), createdAt,
        folder: item.folder || null, folderName: folder?.name || '', liked: item.liked === true,
      });
    }
  }
  return assets.sort((a, b) => b.activity - a.activity);
}

function assetPickerImageUrl(asset) {
  if (asset.kind === 'video') return asset.poster ? '/images/' + encodeURIComponent(asset.poster) : '';
  return '/images/' + encodeURIComponent(asset.file);
}

function assetPickerMediaUrl(asset) {
  return (asset.kind === 'video' ? '/videos/' : '/images/') + encodeURIComponent(asset.file);
}

function assetMatchesQuery(asset, query) {
  const terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = `${asset.label || ''} ${asset.detail || ''} ${asset.file || ''} ${asset.folderName || ''}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function assetPickerVisibleAssets() {
  if (!assetPickerState) return [];
  let assets = previousGenerationAssets(assetPickerState.accept).filter((asset) => {
    if (!assetMatchesQuery(asset, assetPickerState.query)) return false;
    if (assetPickerState.folder !== 'all' && asset.folder !== assetPickerState.folder) return false;
    if (assetPickerState.likes && !asset.liked) return false;
    return true;
  });
  if (assetPickerState.sort === 'old') assets.sort((a, b) => a.createdAt - b.createdAt);
  else if (assetPickerState.sort === 'az') assets.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  else if (assetPickerState.sort === 'active') assets.sort((a, b) => b.activity - a.activity);
  else assets.sort((a, b) => b.createdAt - a.createdAt);
  assetPickerState.assets = assets;
  return assets;
}

function closeAssetPickerMenus(except = null) {
  ['folder', 'sort'].forEach((name) => {
    if (name === except) return;
    const trigger = $(`#assetPicker${name[0].toUpperCase() + name.slice(1)}Trigger`);
    const menu = $(`#assetPicker${name[0].toUpperCase() + name.slice(1)}Menu`);
    if (!trigger || !menu) return;
    trigger.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    menu.inert = true;
  });
}

function renderAssetPickerFilters() {
  if (!assetPickerState) return;
  const folder = (state.folders || []).find((entry) => entry.id === assetPickerState.folder);
  if (assetPickerState.folder !== 'all' && !folder) assetPickerState.folder = 'all';
  $('#assetPickerFolderLabel').textContent = folder?.name || 'All folders';
  $('#assetPickerLikes').setAttribute('aria-pressed', String(assetPickerState.likes));
  const sortLabels = { new: 'Newest', active: 'Active', old: 'Oldest', az: 'A–Z' };
  $('#assetPickerSortLabel').textContent = sortLabels[assetPickerState.sort] || 'Newest';
  $$('#assetPickerSortMenu [data-asset-sort]').forEach((button) => {
    const active = button.dataset.assetSort === assetPickerState.sort;
    button.setAttribute('aria-selected', String(active));
  });

  const menu = $('#assetPickerFolderMenu');
  menu.replaceChildren();
  [{ id: 'all', name: 'All folders' }, ...(state.folders || [])].forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(assetPickerState.folder === entry.id));
    const folderIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    folderIcon.setAttribute('viewBox', '0 0 24 24');
    folderIcon.setAttribute('aria-hidden', 'true');
    folderIcon.innerHTML = '<path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>';
    const label = document.createElement('span');
    label.textContent = entry.name;
    button.append(folderIcon, label);
    if (entry.locked) {
      const lock = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      lock.classList.add('asset-picker-menu-check');
      lock.setAttribute('viewBox', '0 0 24 24');
      lock.setAttribute('aria-label', 'Locked');
      lock.innerHTML = '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>';
      button.appendChild(lock);
    } else if (assetPickerState.folder === entry.id) {
      const check = document.createElement('span');
      check.className = 'asset-picker-menu-check';
      check.textContent = '✓';
      button.appendChild(check);
    }
    button.addEventListener('click', async () => {
      if (entry.locked && !state.privateUnlocked) {
        const unlocked = await unlockPrivateGallery();
        if (!unlocked || !assetPickerState) return;
      }
      assetPickerState.folder = entry.id;
      closeAssetPickerMenus();
      renderAssetPickerFilters();
      renderAssetPickerList();
    });
    menu.appendChild(button);
  });
}

function renderAssetPickerList() {
  const list = $('#assetPickerList');
  const gallery = $('#assetPickerGallery');
  const count = $('#assetPickerCount');
  if (!list || !gallery || !assetPickerState) return;
  const allAssets = previousGenerationAssets(assetPickerState.accept);
  const assets = assetPickerVisibleAssets();
  list.replaceChildren();
  const filtered = assetPickerState.query || assetPickerState.folder !== 'all' || assetPickerState.likes;
  count.textContent = filtered
    ? `${assets.length} of ${allAssets.length}`
    : `${allAssets.length} available`;
  if (!assets.length) {
    list.innerHTML = `<div class="asset-picker-empty">${allAssets.length ? 'No generations match these filters.' : `No previous ${assetPickerKind(assetPickerState.accept)} generations yet.`}</div>`;
    return;
  }
  assets.forEach((asset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'asset-picker-item';
    button.setAttribute('aria-label', `Preview ${asset.label || `previous ${asset.kind}`}`);
    const thumb = document.createElement('span');
    thumb.className = 'asset-picker-thumb';
    const src = assetPickerImageUrl(asset);
    if (src) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = src;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.textContent = '▶';
    }
    if (asset.kind === 'video') {
      const badge = document.createElement('i');
      badge.textContent = '▶';
      thumb.appendChild(badge);
    }
    const copy = document.createElement('span');
    copy.className = 'asset-picker-item-copy';
    const label = document.createElement('b');
    label.textContent = asset.label;
    label.title = asset.label;
    const detail = document.createElement('small');
    detail.textContent = asset.detail;
    copy.append(label, detail);
    button.append(thumb, copy);
    button.addEventListener('click', () => openAssetPickerPreview(asset));
    list.appendChild(button);
  });
}

function openAssetPickerPreview(asset) {
  if (!assetPickerState || !asset) return;
  const canonical = (assetPickerState.assets || []).find((entry) => entry.key === asset.key) || asset;
  assetPickerState.preview = canonical;
  const panel = $('#assetPickerSheet .asset-picker-panel');
  const current = $('#assetPickerPreviewCurrent');
  resetAssetPickerSwipeVisuals();
  panel.scrollTop = 0;
  panel.classList.add('previewing');
  $('#assetPickerGallery').hidden = true;
  $('#assetPickerPreview').hidden = false;
  current.replaceChildren();
  if (canonical.kind === 'video') {
    const video = document.createElement('video');
    video.src = assetPickerMediaUrl(canonical);
    video.poster = assetPickerImageUrl(canonical);
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    current.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = assetPickerMediaUrl(canonical);
    img.alt = canonical.label || 'Previous generation preview';
    current.appendChild(img);
  }
  const index = Math.max(0, (assetPickerState.assets || []).findIndex((entry) => entry.key === canonical.key));
  const total = (assetPickerState.assets || []).length;
  $('#assetPickerPreviewPosition').textContent = total ? `${index + 1} / ${total}` : '';
  $('#assetPickerPreviewPrevious').disabled = index <= 0;
  $('#assetPickerPreviewNext').disabled = index < 0 || index >= total - 1;
  $('#assetPickerPreviewDetail').textContent = canonical.detail || '';
  $('#assetPickerPreviewPrompt').textContent = canonical.label || '';
  $('#assetPickerPreviewUse').textContent = canonical.kind === 'video' ? 'Use video' : 'Use image';
}

function closeAssetPickerPreview() {
  if (!assetPickerState) return;
  assetPickerState.preview = null;
  resetAssetPickerSwipeVisuals();
  $('#assetPickerSheet .asset-picker-panel').classList.remove('previewing');
  $('#assetPickerPreview').hidden = true;
  $('#assetPickerPreviewCurrent').replaceChildren();
  $('#assetPickerGallery').hidden = false;
}

function openAssetPicker(accept, callback, title) {
  const folder = state.activeFolder === 'all' || (state.folders || []).some((entry) => entry.id === state.activeFolder)
    ? state.activeFolder : 'all';
  assetPickerState = {
    accept, callback, query: '', preview: null, assets: [], folder,
    likes: state.likesOnly === true,
    sort: ['new', 'active', 'old', 'az'].includes(state.sortMode) ? state.sortMode : 'new',
  };
  const picker = assetPickerState;
  const panel = $('#assetPickerSheet .asset-picker-panel');
  panel.classList.remove('browsing', 'previewing');
  $('#assetPickerSearch').value = '';
  $('#assetPickerSearchClear').hidden = true;
  $('#assetPickerPreview').hidden = true;
  $('#assetPickerPreviewCurrent').replaceChildren();
  closeAssetPickerMenus();
  renderAssetPickerFilters();
  $('#assetPickerTitle').textContent = title || (assetPickerKind(accept) === 'video' ? 'Choose a video source' : 'Choose an image source');
  $('#assetPickerCopy').textContent = assetPickerKind(accept) === 'video'
    ? 'Use a video from your device or select one from your gallery.'
    : 'Use an image from your device or select one from your gallery.';
  $('#assetPickerSheet').classList.add('show');
  $('#assetPickerGallery').hidden = true;
  syncSheetScrollLock();
  if (!state.items.length) {
    refreshGallery(true).then(() => {
      if (assetPickerState !== picker) return;
      if (panel.classList.contains('browsing') && !panel.classList.contains('previewing')) renderAssetPickerList();
    });
  }
}

function closeAssetPicker() {
  resetAssetPickerSwipeVisuals();
  closeAssetPickerMenus();
  $('#assetPickerSheet').classList.remove('show');
  $('#assetPickerSheet .asset-picker-panel').classList.remove('browsing', 'previewing');
  $('#assetPickerPreviewCurrent').replaceChildren();
  assetPickerState = null;
  syncSheetScrollLock();
}

const MAX_INPUT_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

function formatUploadBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function uploadInputAsset(blob, filename) {
  if (blob.size > MAX_INPUT_UPLOAD_BYTES) {
    return Promise.reject(new Error('This file is larger than the 2 GB input limit. Trim or compress it before uploading.'));
  }
  const status = document.createElement('div');
  status.className = 'toast upload-progress';
  const copy = document.createElement('span');
  const label = document.createElement('b');
  const detail = document.createElement('small');
  const track = document.createElement('i');
  const fill = document.createElement('i');
  label.textContent = `Uploading ${filename || 'input'}`;
  detail.textContent = `0% · ${formatUploadBytes(blob.size)}`;
  copy.append(label, detail);
  track.appendChild(fill);
  status.append(copy, track);
  $('#toastZone').appendChild(status);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/upload');
    request.setRequestHeader('x-filename', encodeURIComponent(filename || 'input.bin'));
    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      detail.textContent = `${percent}% · ${formatUploadBytes(event.total)}`;
      fill.style.width = `${percent}%`;
    });
    request.addEventListener('load', () => {
      const data = (() => { try { return JSON.parse(request.responseText || '{}'); } catch { return {}; } })();
      if (request.status < 200 || request.status >= 300) {
        if (request.status === 401 && data.code === 'auth') showProfileGate();
        status.remove();
        reject(new Error(data.error || `Upload failed (${request.status})`));
        return;
      }
      label.textContent = 'Input saved';
      detail.textContent = 'Available after refresh';
      fill.style.width = '100%';
      setTimeout(() => status.remove(), 1200);
      resolve(data);
    });
    request.addEventListener('error', () => {
      status.remove();
      reject(new Error('Upload was interrupted. Check the connection and try again.'));
    });
    request.send(blob);
  });
}

function pickDeviceUpload(accept, cb) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const res = await uploadInputAsset(file, file.name || 'file.bin');
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

async function usePreviousGeneration(asset) {
  const picker = assetPickerState;
  if (!picker || !asset) return;
  try {
    toast('Loading previous generation…');
    const path = asset.kind === 'video' ? '/videos/' : '/images/';
    const response = await fetch(path + encodeURIComponent(asset.file));
    if (!response.ok) throw new Error('That generation is no longer available');
    const blob = await response.blob();
    const res = await uploadInputAsset(blob, asset.file);
    const url = URL.createObjectURL(blob);
    const dims = asset.kind === 'image' ? await imageDimensions(url) : { w: 0, h: 0 };
    closeAssetPicker();
    await picker.callback({
      name: res.name, url, w: dims.w, h: dims.h,
      label: asset.label || 'Previous generation', hasAudio: res.hasAudio === true,
      srcItemId: asset.itemId,
    });
  } catch (e) {
    toast(e.message, true);
  }
}

/* Generic upload picker: uploads to ComfyUI via the server, returns {name,url,w,h}. */
function pickUpload(accept, cb, title) {
  openAssetPicker(accept, (asset) => cb(asset), title);
}

const IMAGE_CROP_RATIOS = { '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, '16:9': 16 / 9, '9:16': 9 / 16 };
let inputCropState = null;

function imageAssetSnapshot(asset) {
  if (!asset || !asset.name) return null;
  return Object.assign({}, Object.fromEntries(WORKSPACE_ASSET_FIELDS
    .filter((key) => asset[key] !== undefined && asset[key] !== null)
    .map((key) => [key, asset[key]])), {
    url: asset.url || `/api/input?name=${encodeURIComponent(asset.name)}`,
  });
}

function originalImageAsset(asset) {
  return asset && asset.cropOriginal && asset.cropOriginal.name
    ? Object.assign({}, asset.cropOriginal, {
        url: asset.cropOriginal.url || `/api/input?name=${encodeURIComponent(asset.cropOriginal.name)}`,
      })
    : imageAssetSnapshot(asset);
}

function cropAspectRatio() {
  const crop = inputCropState;
  if (!crop) return 1;
  if (crop.aspect !== 'source') return IMAGE_CROP_RATIOS[crop.aspect] || 1;
  return crop.naturalWidth > 0 && crop.naturalHeight > 0 ? crop.naturalWidth / crop.naturalHeight : 1;
}

function layoutInputCrop() {
  const crop = inputCropState;
  const stage = $('#imageCropStage');
  const image = $('#imageCropImage');
  const frame = $('#imageCropFrame');
  if (!crop || !stage || !image || !crop.naturalWidth || !crop.naturalHeight) return;
  const stageWidth = stage.clientWidth;
  const stageHeight = stage.clientHeight;
  if (!stageWidth || !stageHeight) return;
  const ratio = cropAspectRatio();
  const availableWidth = Math.max(80, stageWidth - 44);
  const availableHeight = Math.max(80, stageHeight - 44);
  let frameWidth = availableWidth;
  let frameHeight = frameWidth / ratio;
  if (frameHeight > availableHeight) {
    frameHeight = availableHeight;
    frameWidth = frameHeight * ratio;
  }
  const frameLeft = (stageWidth - frameWidth) / 2;
  const frameTop = (stageHeight - frameHeight) / 2;
  const baseScale = Math.max(frameWidth / crop.naturalWidth, frameHeight / crop.naturalHeight);
  const scale = baseScale * crop.zoom;
  const imageWidth = crop.naturalWidth * scale;
  const imageHeight = crop.naturalHeight * scale;
  const maxOffsetX = Math.max(0, (imageWidth - frameWidth) / 2);
  const maxOffsetY = Math.max(0, (imageHeight - frameHeight) / 2);
  crop.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, crop.offsetX));
  crop.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, crop.offsetY));
  const imageLeft = (stageWidth - imageWidth) / 2 + crop.offsetX;
  const imageTop = (stageHeight - imageHeight) / 2 + crop.offsetY;
  Object.assign(crop, {
    stageWidth, stageHeight, frameWidth, frameHeight, frameLeft, frameTop,
    baseScale, scale, imageLeft, imageTop,
  });
  frame.style.left = `${frameLeft}px`;
  frame.style.top = `${frameTop}px`;
  frame.style.width = `${frameWidth}px`;
  frame.style.height = `${frameHeight}px`;
  frame.style.setProperty('--crop-frame-width', `${frameWidth}px`);
  frame.style.setProperty('--crop-frame-height', `${frameHeight}px`);
  image.style.left = `${imageLeft}px`;
  image.style.top = `${imageTop}px`;
  image.style.width = `${imageWidth}px`;
  image.style.height = `${imageHeight}px`;
}

function openInputImageCrop(asset, onApply, title = 'Crop input image') {
  if (!asset || !asset.name || typeof onApply !== 'function') return;
  inputCropState = {
    asset,
    original: originalImageAsset(asset),
    onApply,
    aspect: 'source',
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    naturalWidth: Number(asset.w) || 0,
    naturalHeight: Number(asset.h) || 0,
    drag: null,
  };
  $('#imageCropTitle').textContent = title;
  $('#imageCropRestore').hidden = !(asset.cropOriginal && asset.cropOriginal.name);
  $('#imageCropZoom').value = '100';
  $('#imageCropZoomVal').textContent = '100%';
  $$('#imageCropAspects [data-crop-aspect]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.cropAspect === 'source'));
  });
  const image = $('#imageCropImage');
  image.onload = () => {
    if (!inputCropState) return;
    inputCropState.naturalWidth = image.naturalWidth;
    inputCropState.naturalHeight = image.naturalHeight;
    requestAnimationFrame(layoutInputCrop);
  };
  image.onerror = () => toast('Could not load this input image for cropping', true);
  image.src = asset.url || `/api/input?name=${encodeURIComponent(asset.name)}`;
  $('#imageCropSheet').classList.add('show');
  syncSheetScrollLock();
  requestAnimationFrame(layoutInputCrop);
}

function closeInputImageCrop() {
  $('#imageCropSheet').classList.remove('show');
  inputCropState = null;
  syncSheetScrollLock();
}

async function applyInputImageCrop() {
  const crop = inputCropState;
  const image = $('#imageCropImage');
  if (!crop || !crop.scale || !image.naturalWidth) return;
  const sourceX = Math.max(0, (crop.frameLeft - crop.imageLeft) / crop.scale);
  const sourceY = Math.max(0, (crop.frameTop - crop.imageTop) / crop.scale);
  const sourceWidth = Math.min(crop.naturalWidth - sourceX, crop.frameWidth / crop.scale);
  const sourceHeight = Math.min(crop.naturalHeight - sourceY, crop.frameHeight / crop.scale);
  const outputWidth = Math.max(64, Math.round(sourceWidth));
  const outputHeight = Math.max(64, Math.round(sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  canvas.getContext('2d').drawImage(
    image, sourceX, sourceY, sourceWidth, sourceHeight,
    0, 0, outputWidth, outputHeight,
  );
  const applyButton = $('#imageCropApply');
  applyButton.disabled = true;
  applyButton.textContent = 'Applying…';
  try {
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Could not create the crop')),
      'image/png',
    ));
    const response = await api('/api/upload', {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent(`crop_${outputWidth}x${outputHeight}.png`) },
      body: await blob.arrayBuffer(),
    });
    const next = Object.assign({}, crop.asset, {
      name: response.name,
      url: URL.createObjectURL(blob),
      w: outputWidth,
      h: outputHeight,
      label: `${crop.original.label || crop.asset.label || 'Input image'} · crop`,
      safeName: response.name,
      safeW: outputWidth,
      safeH: outputHeight,
      cropOriginal: crop.original,
    });
    delete next.displayUrl;
    await crop.onApply(next);
    closeInputImageCrop();
    toast(`Crop applied · ${outputWidth} × ${outputHeight}`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    applyButton.disabled = false;
    applyButton.textContent = 'Apply crop';
  }
}

$('#imageCropAspects').addEventListener('click', (event) => {
  const button = event.target.closest('[data-crop-aspect]');
  if (!button || !inputCropState) return;
  inputCropState.aspect = button.dataset.cropAspect;
  inputCropState.zoom = 1;
  inputCropState.offsetX = 0;
  inputCropState.offsetY = 0;
  $('#imageCropZoom').value = '100';
  $('#imageCropZoomVal').textContent = '100%';
  $$('#imageCropAspects [data-crop-aspect]').forEach((item) => {
    item.setAttribute('aria-pressed', String(item === button));
  });
  layoutInputCrop();
});
$('#imageCropZoom').addEventListener('input', () => {
  if (!inputCropState) return;
  inputCropState.zoom = Math.max(1, Math.min(3, Number($('#imageCropZoom').value) / 100 || 1));
  $('#imageCropZoomVal').textContent = `${Math.round(inputCropState.zoom * 100)}%`;
  layoutInputCrop();
});
$('#imageCropStage').addEventListener('pointerdown', (event) => {
  if (!inputCropState || event.button !== 0) return;
  inputCropState.drag = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    offsetX: inputCropState.offsetX,
    offsetY: inputCropState.offsetY,
  };
  try { $('#imageCropStage').setPointerCapture(event.pointerId); } catch { /* noop */ }
});
$('#imageCropStage').addEventListener('pointermove', (event) => {
  const drag = inputCropState && inputCropState.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  inputCropState.offsetX = drag.offsetX + event.clientX - drag.x;
  inputCropState.offsetY = drag.offsetY + event.clientY - drag.y;
  layoutInputCrop();
}, { passive: false });
['pointerup', 'pointercancel'].forEach((type) => $('#imageCropStage').addEventListener(type, (event) => {
  if (inputCropState && inputCropState.drag && inputCropState.drag.pointerId === event.pointerId) inputCropState.drag = null;
}));
$('#imageCropStage').addEventListener('keydown', (event) => {
  if (!inputCropState || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  inputCropState.offsetX += event.key === 'ArrowLeft' ? -8 : (event.key === 'ArrowRight' ? 8 : 0);
  inputCropState.offsetY += event.key === 'ArrowUp' ? -8 : (event.key === 'ArrowDown' ? 8 : 0);
  layoutInputCrop();
});
$('#imageCropApply').addEventListener('click', applyInputImageCrop);
$('#imageCropRestore').addEventListener('click', async () => {
  const crop = inputCropState;
  if (!crop || !crop.asset.cropOriginal) return;
  await crop.onApply(originalImageAsset(crop.asset));
  closeInputImageCrop();
  toast('Original input restored');
});
$('#imageCropSheet [data-close]').addEventListener('click', () => { inputCropState = null; });
window.addEventListener('resize', () => {
  if (inputCropState && $('#imageCropSheet').classList.contains('show')) requestAnimationFrame(layoutInputCrop);
});

$('#assetPickerUpload').addEventListener('click', () => {
  const picker = assetPickerState;
  if (!picker) return;
  closeAssetPicker();
  pickDeviceUpload(picker.accept, picker.callback);
});
$('#assetPickerPrevious').addEventListener('click', () => {
  const panel = $('#assetPickerSheet .asset-picker-panel');
  panel.scrollTop = 0;
  panel.classList.add('browsing');
  $('#assetPickerGallery').hidden = false;
  renderAssetPickerList();
  requestAnimationFrame(() => $('#assetPickerSearch').focus());
});
$('#assetPickerBrowseBack').addEventListener('click', () => {
  if (!assetPickerState) return;
  resetAssetPickerSwipeVisuals();
  assetPickerState.preview = null;
  $('#assetPickerSheet .asset-picker-panel').classList.remove('browsing', 'previewing');
  $('#assetPickerGallery').hidden = true;
  $('#assetPickerPreview').hidden = true;
  $('#assetPickerPreviewCurrent').replaceChildren();
});
$('#assetPickerSearch').addEventListener('input', (event) => {
  if (!assetPickerState) return;
  assetPickerState.query = event.target.value;
  $('#assetPickerSearchClear').hidden = !event.target.value;
  renderAssetPickerList();
});
$('#assetPickerSearchClear').addEventListener('click', () => {
  if (!assetPickerState) return;
  assetPickerState.query = '';
  $('#assetPickerSearch').value = '';
  $('#assetPickerSearchClear').hidden = true;
  renderAssetPickerList();
  $('#assetPickerSearch').focus();
});
$('#assetPickerPreviewBack').addEventListener('click', closeAssetPickerPreview);
$('#assetPickerFolderTrigger').addEventListener('click', () => {
  if (!assetPickerState) return;
  const trigger = $('#assetPickerFolderTrigger');
  const menu = $('#assetPickerFolderMenu');
  const open = trigger.getAttribute('aria-expanded') !== 'true';
  closeAssetPickerMenus(open ? 'folder' : null);
  trigger.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  menu.inert = !open;
});
$('#assetPickerSortTrigger').addEventListener('click', () => {
  if (!assetPickerState) return;
  const trigger = $('#assetPickerSortTrigger');
  const menu = $('#assetPickerSortMenu');
  const open = trigger.getAttribute('aria-expanded') !== 'true';
  closeAssetPickerMenus(open ? 'sort' : null);
  trigger.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  menu.inert = !open;
});
$('#assetPickerLikes').addEventListener('click', () => {
  if (!assetPickerState) return;
  assetPickerState.likes = !assetPickerState.likes;
  closeAssetPickerMenus();
  renderAssetPickerFilters();
  renderAssetPickerList();
});
$$('#assetPickerSortMenu [data-asset-sort]').forEach((button) => button.addEventListener('click', () => {
  if (!assetPickerState) return;
  assetPickerState.sort = button.dataset.assetSort;
  closeAssetPickerMenus();
  renderAssetPickerFilters();
  renderAssetPickerList();
}));
$('#assetPickerPreviewPrevious').addEventListener('click', () => animateAssetPickerNavigation(-1));
$('#assetPickerPreviewNext').addEventListener('click', () => animateAssetPickerNavigation(1));
$('#assetPickerPreviewUse').addEventListener('click', () => {
  if (assetPickerState?.preview) usePreviousGeneration(assetPickerState.preview);
});
$('#assetPickerSheet').addEventListener('click', (event) => {
  if (event.target === $('#assetPickerSheet') || event.target.closest('[data-close]')) closeAssetPicker();
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.asset-picker-dropdown')) closeAssetPickerMenus();
});

/* Match the focused gallery's push/pull gesture while keeping native video
   controls available. The next asset is owned as soon as a swipe commits, so
   rapid follow-up swipes keep advancing even while media is decoding. */
(() => {
  const wrap = $('#assetPickerPreviewMedia');
  const current = $('#assetPickerPreviewCurrent');
  const neighbor = $('#assetPickerPreviewNeighbor');
  let swipe = null;
  let animationToken = 0;
  let pendingAsset = null;

  function adjacentAsset(direction) {
    if (!assetPickerState?.preview) return null;
    const assets = assetPickerState.assets || [];
    const index = assets.findIndex((entry) => entry.key === assetPickerState.preview.key);
    return index >= 0 ? assets[index + direction] || null : null;
  }

  function clearVisuals() {
    animationToken += 1;
    [current, neighbor].forEach((element) => {
      element.getAnimations().forEach((animation) => animation.cancel());
      element.style.transform = '';
      element.style.opacity = '';
    });
    neighbor.hidden = true;
    neighbor.removeAttribute('src');
    wrap.classList.remove('is-swiping', 'is-settling');
    swipe = null;
    pendingAsset = null;
  }
  resetAssetPickerSwipeVisuals = clearVisuals;

  function setNeighbor(direction) {
    if (!swipe || swipe.direction === direction) return;
    swipe.direction = direction;
    swipe.neighbor = adjacentAsset(direction);
    const src = swipe.neighbor && assetPickerImageUrl(swipe.neighbor);
    if (!src) {
      neighbor.hidden = true;
      neighbor.removeAttribute('src');
      return;
    }
    neighbor.src = src;
    neighbor.hidden = false;
  }

  function renderSwipe(rawDx) {
    if (!swipe) return;
    const width = Math.max(1, wrap.clientWidth);
    const direction = rawDx < 0 ? 1 : -1;
    setNeighbor(direction);
    const dx = swipe.neighbor ? rawDx : rawDx * .22;
    const progress = Math.min(1, Math.abs(dx) / width);
    const side = direction > 0 ? width : -width;
    swipe.dx = dx;
    current.style.transform = `translate3d(${dx}px,0,0) scale(${1 - progress * .018})`;
    current.style.opacity = String(1 - progress * .22);
    if (swipe.neighbor && !neighbor.hidden) {
      neighbor.style.transform = `translate3d(${side + dx}px,0,0) scale(${.985 + progress * .015})`;
      neighbor.style.opacity = String(.46 + progress * .54);
    }
    wrap.classList.add('is-swiping');
  }

  function finishSwipe(commit) {
    if (!swipe) return;
    const currentSwipe = swipe;
    const width = Math.max(1, wrap.clientWidth);
    const side = currentSwipe.direction > 0 ? width : -width;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 1 : (commit ? 210 : 255);
    const easing = commit ? 'cubic-bezier(.2,.78,.22,1)' : 'cubic-bezier(.18,.82,.22,1)';
    const token = ++animationToken;
    if (commit && currentSwipe.neighbor) pendingAsset = currentSwipe.neighbor;
    wrap.classList.add('is-settling');
    const animations = [current.animate([
      { transform: current.style.transform || 'translate3d(0,0,0)', opacity: current.style.opacity || 1 },
      { transform: `translate3d(${commit ? -side : 0}px,0,0) scale(${commit ? .98 : 1})`, opacity: commit ? .18 : 1 },
    ], { duration, easing, fill: 'forwards' })];
    if (currentSwipe.neighbor && !neighbor.hidden) {
      animations.push(neighbor.animate([
        { transform: neighbor.style.transform, opacity: neighbor.style.opacity || .46 },
        { transform: `translate3d(${commit ? 0 : side}px,0,0) scale(${commit ? 1 : .985})`, opacity: commit ? 1 : .46 },
      ], { duration, easing, fill: 'forwards' }));
    }
    Promise.all(animations.map((animation) => animation.finished.catch(() => null))).then(() => {
      if (token !== animationToken) return;
      const next = commit ? currentSwipe.neighbor : null;
      clearVisuals();
      if (next) openAssetPickerPreview(next);
    });
  }

  function beginSwipe(x, y) {
    const now = performance.now();
    swipe = { x0: x, y0: y, t0: now, lastX: x, lastTime: now, velocityX: 0, dx: 0, direction: 0, neighbor: null, locked: false };
  }

  animateAssetPickerNavigation = (direction) => {
    if (!assetPickerState?.preview || !adjacentAsset(direction)) return;
    clearVisuals();
    beginSwipe(0, 0);
    renderSwipe((direction > 0 ? -1 : 1) * Math.max(90, wrap.clientWidth * .32));
    finishSwipe(true);
  };

  wrap.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || !assetPickerState?.preview) return;
    if (event.target.tagName === 'VIDEO') {
      const rect = event.target.getBoundingClientRect();
      if (event.touches[0].clientY > rect.bottom - 72) return;
    }
    if (pendingAsset) openAssetPickerPreview(pendingAsset);
    else clearVisuals();
    const touch = event.touches[0];
    beginSwipe(touch.clientX, touch.clientY);
  }, { passive: true });
  wrap.addEventListener('touchmove', (event) => {
    if (!swipe || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - swipe.x0;
    const dy = touch.clientY - swipe.y0;
    if (!swipe.locked) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * .82) {
        clearVisuals();
        return;
      }
      swipe.locked = true;
    }
    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(1, now - swipe.lastTime);
    swipe.velocityX = (touch.clientX - swipe.lastX) / elapsed;
    swipe.lastX = touch.clientX;
    swipe.lastTime = now;
    renderSwipe(dx);
  }, { passive: false });
  wrap.addEventListener('touchend', (event) => {
    if (!swipe) return;
    const touch = event.changedTouches[0];
    const rawDx = touch.clientX - swipe.x0;
    if (!swipe.locked) return clearVisuals();
    renderSwipe(rawDx);
    const velocity = Math.abs(swipe.velocityX) > .05
      ? swipe.velocityX
      : rawDx / Math.max(1, performance.now() - swipe.t0);
    const commit = !!swipe.neighbor && (Math.abs(rawDx) >= wrap.clientWidth * .2 || Math.abs(velocity) >= .48);
    finishSwipe(commit);
  }, { passive: true });
  wrap.addEventListener('touchcancel', () => finishSwipe(false), { passive: true });
  wrap.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    animateAssetPickerNavigation(event.key === 'ArrowRight' ? 1 : -1);
  });
})();

function createDenoiseFromInfluence(influence = state.createInfluence) {
  const normalized = Math.max(0, Math.min(100, Number(influence) || 0)) / 100;
  return Number((1 - normalized * 0.95).toFixed(2));
}

const DEFAULT_KREA2_TURBO_LORA = 'krea2_turbo_lora_rank_64_bf16.safetensors';
const DEFAULT_KLEIN_OUTPAINT_LORAS = {
  klein4: 'f2k_4B_consist_20260314.safetensors',
  klein9: 'f2k_9B_lcs_consist_20260415.safetensors',
};
const DEFAULT_EDIT_AUTOMATIC_LORAS = {
  'krea2-outpaint': 'krea2_identity_edit_v1_1_r128.safetensors',
  'qwen-lightning': 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
};

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

function renderKrea2Mode() {
  const button = $('#kreaTurboToggle');
  if (!button) return;
  const visible = state.view === 'create' && state.createMode === 'image';
  $('#kreaModelPanel').hidden = !visible;
  button.hidden = !visible;
  if (!visible) {
    detachKrea2RawTurboLora();
    return;
  }
  if (state.krea2Turbo) {
    detachKrea2RawTurboLora();
  }
  else {
    ensureKrea2RawTurboLora();
  }
  button.setAttribute('aria-checked', String(state.krea2Turbo));
  const rawStatus = lastMeta && lastMeta.models && lastMeta.models.krea2 && lastMeta.models.krea2.raw;
  const steps = Number($('#stepsInput').value) || state.userDefaults.create.steps;
  if (state.krea2Turbo) {
    $('#kreaModelSummary').textContent = `Krea 2 · fast · ${steps} steps`;
  } else if (rawStatus && !rawStatus.ok) {
    $('#kreaModelSummary').textContent = 'Raw model missing · configure in Settings';
  } else {
    const lora = state.krea2RawTurboLora;
    $('#kreaModelSummary').textContent = lora && lora.on
      ? `Raw · LoRA ${Number(lora.strength).toFixed(2)} · ${steps} steps`
      : `Raw · full sampling · ${steps} steps`;
  }
}

function krea2ManagedLoraChanged(lora) {
  if (!lora || lora.managed !== 'krea2-raw-turbo') return;
  state.krea2RawTurboLora = lora;
  renderKrea2Mode();
}

function kleinOutpaintConsistencySpec(engine = state.editEngine) {
  if (engine !== 'klein4' && engine !== 'klein9') return null;
  const status = lastMeta && lastMeta.models && lastMeta.models[engine]
    && lastMeta.models[engine].consistencyLora;
  return {
    name: (status && status.name) || DEFAULT_KLEIN_OUTPAINT_LORAS[engine],
    installed: !status || status.ok !== false,
  };
}

function detachKleinOutpaintConsistencyLora(engine, stack) {
  if (!Array.isArray(stack)) return;
  const managed = stack.find((item) => item && item.managed === 'klein-outpaint-consistency');
  if (managed && managed.name) state.kleinOutpaintConsistencyLoras[engine] = managed;
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index] && stack[index].managed === 'klein-outpaint-consistency') stack.splice(index, 1);
  }
}

function syncKleinOutpaintConsistencyLora() {
  state.kleinOutpaintConsistencyLoras ||= {};
  const activeEngine = state.view === 'edit' && state.editOutpaint
    && (state.editEngine === 'klein4' || state.editEngine === 'klein9') ? state.editEngine : '';
  ['klein4', 'klein9'].forEach((engine) => {
    const stack = engine === state.editEngine ? state.editLoras : state.editLorasByEngine[engine];
    if (engine !== activeEngine) detachKleinOutpaintConsistencyLora(engine, stack);
  });
  if (!activeEngine) return null;
  const spec = kleinOutpaintConsistencySpec(activeEngine);
  const stack = state.editLoras;
  const key = assetNameKey(spec.name);
  let managed = stack.find((item) => item && assetNameKey(item.name) === key)
    || state.kleinOutpaintConsistencyLoras[activeEngine];
  if (!managed || assetNameKey(managed.name) !== key) {
    managed = { name: spec.name, strength: 0.6, on: true };
  }
  managed.name = spec.name;
  managed.strength = Math.max(0, Math.min(2, Number(managed.strength) || 0.6));
  if (typeof managed.on !== 'boolean') managed.on = true;
  managed.managed = 'klein-outpaint-consistency';
  managed.missing = !spec.installed;
  state.kleinOutpaintConsistencyLoras[activeEngine] = managed;
  const others = stack.filter((item) => item && item !== managed
    && item.managed !== 'klein-outpaint-consistency' && assetNameKey(item.name) !== key);
  stack.splice(0, stack.length, managed, ...others);
  state.editLorasByEngine[activeEngine] = stack;
  return managed;
}

function activeEditAutomaticLoraSpec() {
  if (state.view !== 'edit') return null;
  if (state.editEngine === 'krea2' && state.editOutpaint) {
    const status = lastMeta?.models?.krea2Outpaint?.lora;
    return {
      key: 'krea2-outpaint',
      name: status?.name || DEFAULT_EDIT_AUTOMATIC_LORAS['krea2-outpaint'],
      strength: 1,
      installed: !status || status.ok !== false,
    };
  }
  if (state.editEngine === 'qwen' && state.qwenQuality === 'fast') {
    const status = lastMeta?.models?.qwen?.lora;
    return {
      key: 'qwen-lightning',
      name: status?.name || DEFAULT_EDIT_AUTOMATIC_LORAS['qwen-lightning'],
      strength: 1,
      installed: !status || status.ok !== false,
    };
  }
  return null;
}

function syncEditAutomaticLora() {
  state.editAutomaticLoras ||= {};
  const active = activeEditAutomaticLoraSpec();
  EDIT_ENGINES.forEach((engine) => {
    const stack = engine === state.editEngine ? state.editLoras : state.editLorasByEngine[engine];
    if (!Array.isArray(stack)) return;
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const item = stack[index];
      if (!item || item.managed !== 'edit-workflow-auto') continue;
      if (item.managedKey) state.editAutomaticLoras[item.managedKey] = item;
      stack.splice(index, 1);
    }
  });
  if (!active) return null;
  const stack = state.editLoras;
  const key = assetNameKey(active.name);
  let managed = stack.find((item) => item && assetNameKey(item.name) === key)
    || state.editAutomaticLoras[active.key];
  if (!managed || assetNameKey(managed.name) !== key) {
    managed = { name: active.name, strength: active.strength, on: true };
  }
  managed.name = active.name;
  managed.strength = Math.max(0, Math.min(2, Number(managed.strength) || active.strength));
  if (typeof managed.on !== 'boolean') managed.on = true;
  managed.managed = 'edit-workflow-auto';
  managed.managedKey = active.key;
  managed.missing = !active.installed;
  state.editAutomaticLoras[active.key] = managed;
  const others = stack.filter((item) => item && item !== managed
    && item.managed !== 'edit-workflow-auto' && assetNameKey(item.name) !== key);
  stack.splice(0, stack.length, managed, ...others);
  state.editLorasByEngine[state.editEngine] = stack;
  return managed;
}

function managedLoraChanged(lora) {
  krea2ManagedLoraChanged(lora);
  if (!lora) return;
  if (lora.managed === 'klein-outpaint-consistency' && (state.editEngine === 'klein4' || state.editEngine === 'klein9')) {
    state.kleinOutpaintConsistencyLoras[state.editEngine] = lora;
  }
  if (lora.managed === 'edit-workflow-auto' && lora.managedKey) {
    state.editAutomaticLoras[lora.managedKey] = lora;
  }
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
  if (state.krea2Turbo) detachKrea2RawTurboLora();
  else {
    const lora = ensureKrea2RawTurboLora();
    const loraStatus = lastMeta && lastMeta.models && lastMeta.models.krea2 && lastMeta.models.krea2.turboLora;
    if (loraStatus && !loraStatus.ok) {
      lora.on = false;
      toast('Turbo LoRA is not installed — Raw will use the current sampling settings', true);
    }
  }
  renderKrea2Mode();
  renderLoras();
  saveForm();
});

function createInfluenceFromDenoise(denoise) {
  const value = Math.max(0.05, Math.min(1, Number(denoise) || 1));
  return Math.round(((1 - value) / 0.95) * 20) * 5;
}

function generationSafeCreateDimensions(ref = state.createRef, megapixels = state.mp) {
  const sourceWidth = Number(ref?.w);
  const sourceHeight = Number(ref?.h);
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) return null;
  const ratio = sourceWidth / sourceHeight;
  const pixels = Math.max(0.5, Math.min(2, Number(megapixels) || 1)) * 1e6;
  let rawWidth = Math.sqrt(pixels * ratio);
  let rawHeight = Math.sqrt(pixels / ratio);
  const maxSide = Math.max(rawWidth, rawHeight);
  if (maxSide > 2048) {
    const scale = 2048 / maxSide;
    rawWidth *= scale;
    rawHeight *= scale;
  }
  const widthFirst = { w: round32(rawWidth), h: round32(round32(rawWidth) / ratio) };
  const heightFirst = { w: round32(round32(rawHeight) * ratio), h: round32(rawHeight) };
  const score = (candidate) => (
    Math.abs((candidate.w / candidate.h) - ratio) / ratio
    + Math.abs((candidate.w * candidate.h) - pixels) / pixels * 0.05
  );
  return score(widthFirst) <= score(heightFirst) ? widthFirst : heightFirst;
}

function derivedAspectLabel(width, height) {
  const ratio = Number(width) / Number(height);
  if (!Number.isFinite(ratio) || ratio <= 0) return 'Custom';
  const standard = ASPECTS.reduce((best, aspect) => {
    const error = Math.abs(aspect.ar - ratio) / ratio;
    return !best || error < best.error ? { label: aspect.label, error } : best;
  }, null);
  if (standard && standard.error <= 0.025) return standard.label;
  let best = { w: Math.max(1, Math.round(ratio)), h: 1, error: Infinity };
  for (let denominator = 1; denominator <= 20; denominator += 1) {
    const numerator = Math.max(1, Math.round(ratio * denominator));
    const error = Math.abs((numerator / denominator) - ratio);
    if (error < best.error) best = { w: numerator, h: denominator, error };
  }
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const divisor = gcd(best.w, best.h);
  return `${best.w / divisor}:${best.h / divisor}`;
}

function createSizeLabel(megapixels = state.mp) {
  return Number(megapixels) === 0.75 ? 'S' : (Number(megapixels) === 1.75 ? 'L' : 'M');
}

function normalizeResolutionMegapixels(value, fallback = 1) {
  const number = Number(value);
  return RESOLUTION_SIZE_OPTIONS.includes(number) ? number : fallback;
}

function nearestResolutionMegapixels(width, height) {
  const megapixels = Math.max(0, Number(width) * Number(height)) / 1e6;
  return RESOLUTION_SIZE_OPTIONS.reduce((best, option) => (
    Math.abs(option - megapixels) < Math.abs(best - megapixels) ? option : best
  ), 1);
}

function dimensionsForMegapixels(ratio, megapixels) {
  const safeRatio = Math.max(0.1, Math.min(10, Number(ratio) || 1));
  const pixels = normalizeResolutionMegapixels(megapixels) * 1e6;
  return {
    w: round32(Math.sqrt(pixels * safeRatio)),
    h: round32(Math.sqrt(pixels / safeRatio)),
  };
}

function editResolutionSizeLabel(width = state.editWidth, height = state.editHeight) {
  const megapixels = Math.max(0, Number(width) * Number(height)) / 1e6;
  const nearest = nearestResolutionMegapixels(width, height);
  return Math.abs(megapixels - nearest) <= 0.08 ? createSizeLabel(nearest) : '';
}

function nativeCreateOutputDimensions(ref = state.createRef) {
  const sourceWidth = Number(ref?.w);
  const sourceHeight = Number(ref?.h);
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) return null;
  const scale = Math.min(1, 4096 / Math.max(sourceWidth, sourceHeight));
  return {
    w: round32(sourceWidth * scale),
    h: round32(sourceHeight * scale),
  };
}

function matchedCreateOutputDimensions(ref = state.createRef, native = state.createMatchNative) {
  return native ? nativeCreateOutputDimensions(ref) : generationSafeCreateDimensions(ref);
}

function createGuideInput(ref = state.createRef) {
  if (!ref) return null;
  const optimized = state.createMatchSource && !state.createMatchNative && ref.safeName;
  return {
    name: optimized ? ref.safeName : ref.name,
    w: optimized ? (ref.safeW || ref.w) : ref.w,
    h: optimized ? (ref.safeH || ref.h) : ref.h,
  };
}

function applyCreateMatchedDimensions(options = {}) {
  const nextNative = options.native === true;
  if (state.createMatchNative !== nextNative) clearCreateDepthPreview();
  state.createMatchNative = nextNative;
  const matched = matchedCreateOutputDimensions(state.createRef, state.createMatchNative);
  if (!matched) return false;
  state.createMatchSource = true;
  state.customDims = true;
  state.width = matched.w;
  state.height = matched.h;
  state.aspect = derivedAspectLabel(state.createRef.w, state.createRef.h);
  return true;
}

async function resizedCreateGuideBlob(asset, dimensions) {
  const image = new Image();
  image.decoding = 'async';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Could not resize the image guide'));
    image.src = asset.url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.w;
  canvas.height = dimensions.h;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not resize the image guide')),
    'image/png',
  ));
}

async function prepareCreateImageGuideAsset(asset) {
  if (!asset) return null;
  // Keep one optimized copy large enough for every S/M/L output. The active
  // generation still uses the user's selected size.
  const safe = generationSafeCreateDimensions(asset, 1.75);
  if (!safe) return asset;
  const sourcePixels = Number(asset.w) * Number(asset.h);
  const safePixels = safe.w * safe.h;
  if (sourcePixels <= safePixels * 1.12 && Math.max(asset.w, asset.h) <= 2048) {
    return Object.assign({}, asset, { safeName: asset.name, safeW: asset.w, safeH: asset.h });
  }
  toast(`Optimizing guide to ${safe.w} × ${safe.h}…`);
  const blob = await resizedCreateGuideBlob(asset, safe);
  const response = await api('/api/upload', {
    method: 'POST',
    headers: { 'x-filename': encodeURIComponent(`image_guide_${safe.w}x${safe.h}.png`) },
    body: await blob.arrayBuffer(),
  });
  return Object.assign({}, asset, { safeName: response.name, safeW: safe.w, safeH: safe.h });
}

async function setCreateImageGuideAsset(asset, mode = 'image') {
  state.createRef = await prepareCreateImageGuideAsset(asset);
  clearCreateDepthPreview();
  state.createGuideMode = mode === 'depth' ? 'depth' : 'image';
  state.createImageGuideOpen = true;
  applyCreateMatchedDimensions();
  setView('create', { createMode: 'image' });
  renderCreateImageGuide();
  renderAspects();
  renderDims();
  saveForm();
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
  const depthMode = state.createGuideMode === 'depth';
  $('#createImageGuideHint').textContent = depthMode
    ? 'Depth control · matched to source aspect'
    : 'Image to image · matched to source aspect';
  const influence = depthMode
    ? Math.max(5, Math.min(200, Number(state.createDepthStrength) || 100))
    : Math.max(0, Math.min(100, Number(state.createInfluence) || 0));
  $$('#createImageGuideModes [data-guide-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.guideMode === state.createGuideMode));
  });
  $('#createImageInfluenceTitle').textContent = depthMode ? 'Depth strength' : 'Image influence';
  $('#createImageInfluenceHint').textContent = depthMode
    ? 'Preserves perspective and 3D structure'
    : 'Higher stays closer to the source';
  $('#createImageInfluence').min = depthMode ? '5' : '0';
  $('#createImageInfluence').max = depthMode ? '200' : '100';
  $('#createImageInfluence').setAttribute('aria-label', depthMode ? 'Depth strength' : 'Image influence');
  $('#createImageInfluence').value = String(influence);
  // The track fill must follow the thumb, not the raw value: depth strength
  // spans 5-200, so 100% sits mid-track.
  const fillMin = depthMode ? 5 : 0;
  const fillMax = depthMode ? 200 : 100;
  const fillPct = ((influence - fillMin) / (fillMax - fillMin)) * 100;
  $('#createImageInfluence').style.setProperty('--influence', fillPct + '%');
  $('#createImageInfluenceVal').textContent = influence + '%';
  const scale = $('.create-image-influence-scale');
  if (scale) {
    scale.children[0].textContent = depthMode ? 'Looser' : 'Freer';
    scale.children[1].textContent = depthMode ? 'Stricter' : 'Closer';
  }
  const previewBtn = $('#createDepthPreviewBtn');
  const cachedDepth = hasImage && state.createDepthPreview
    && state.createDepthPreview.name === createGuideInput().name ? state.createDepthPreview : null;
  const showingDepth = depthMode && state.createDepthPreviewShown && !!cachedDepth;
  if (previewBtn) {
    previewBtn.hidden = !(depthMode && hasImage);
    previewBtn.classList.toggle('showing-depth', showingDepth);
    if (!previewBtn.disabled) {
      $('#createDepthPreviewLbl').textContent = showingDepth ? 'Show source image'
        : (cachedDepth ? 'Show depth map' : 'Preview depth map');
    }
  }
  if (!hasImage) return;
  $('#createImageGuideImg').src = showingDepth ? cachedDepth.url : state.createRef.url;
  $('#createImageGuideName').textContent = showingDepth ? 'Depth map'
    : (state.createRef.label || 'Source image');
  $('#createImageGuideDims').textContent = showingDepth
    ? 'What the generation will follow'
    : (state.createRef.w && state.createRef.h
      ? `${state.createRef.w} × ${state.createRef.h} · tap to replace`
      : 'Tap to replace');
}

function clearCreateDepthPreview() {
  if (state.createDepthPreview && state.createDepthPreview.url) {
    try { URL.revokeObjectURL(state.createDepthPreview.url); } catch { /* noop */ }
  }
  state.createDepthPreview = null;
  state.createDepthPreviewShown = false;
}

function pickCreateImageGuide() {
  pickUpload('image/*', async (file) => {
    try {
      await setCreateImageGuideAsset(file, state.createGuideMode);
      toast('Image guide added at a generation-safe size');
    } catch (error) {
      toast(error.message, true);
    }
  });
}

$('#createImageGuideToggle').addEventListener('click', () => {
  state.createImageGuideOpen = !state.createImageGuideOpen;
  renderCreateImageGuide();
  saveForm();
});
$('#createImageGuideAdd').addEventListener('click', pickCreateImageGuide);
$('#createImageGuideChange').addEventListener('click', pickCreateImageGuide);
$('#createImageGuideCrop').addEventListener('click', () => {
  if (!state.createRef) return;
  openInputImageCrop(state.createRef, async (next) => {
    state.createRef = await prepareCreateImageGuideAsset(next);
    clearCreateDepthPreview();
    applyCreateMatchedDimensions();
    renderCreateImageGuide();
    renderAspects();
    renderDims();
    saveForm();
  }, 'Crop image guide');
});
$('#createImageGuideModes').addEventListener('click', (event) => {
  const button = event.target.closest('[data-guide-mode]');
  if (!button) return;
  state.createGuideMode = button.dataset.guideMode === 'depth' ? 'depth' : 'image';
  renderCreateImageGuide();
  saveForm();
});
$('#createDepthPreviewBtn').addEventListener('click', async () => {
  if (!state.createRef) return;
  const cached = state.createDepthPreview && state.createDepthPreview.name === createGuideInput().name;
  if (cached) {
    state.createDepthPreviewShown = !state.createDepthPreviewShown;
    renderCreateImageGuide();
    return;
  }
  const btn = $('#createDepthPreviewBtn');
  btn.disabled = true;
  $('#createDepthPreviewLbl').textContent = 'Rendering depth map…';
  try {
    const response = await fetch('/api/depth-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageName: createGuideInput().name,
        width: createGuideInput().w || 0,
        height: createGuideInput().h || 0,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Depth preview failed');
    }
    const blob = await response.blob();
    clearCreateDepthPreview();
    state.createDepthPreview = { name: createGuideInput().name, url: URL.createObjectURL(blob) };
    state.createDepthPreviewShown = true;
  } catch (error) {
    toast(error.message, true);
  }
  btn.disabled = false;
  renderCreateImageGuide();
});
$('#createImageGuideRemove').addEventListener('click', () => {
  state.createRef = null;
  state.createMatchSource = false;
  state.createMatchNative = false;
  clearCreateDepthPreview();
  renderCreateImageGuide();
  renderAspects();
  renderDims();
  saveForm();
  toast('Image guide removed');
});
$('#createImageInfluence').addEventListener('input', (event) => {
  if (state.createGuideMode === 'depth') state.createDepthStrength = Number(event.target.value);
  else state.createInfluence = Number(event.target.value);
  renderCreateImageGuide();
  saveForm();
});

/* ------------------------------------------------------------------ */
/* Regional prompting + localized edit masks                           */
/* ------------------------------------------------------------------ */

const REGION_COLORS = ['#46b4e6', '#e68246', '#82e646', '#e646b4', '#e6e646', '#46e6c8'];
let regionDrag = null;
let regionSettingsOpen = false;
let regionLoraExpanded = false;
let regionClickBlockedUntil = 0;
let kreaMaskDrawing = false;
let kreaMaskLast = null;
let kreaMaskBoxStart = null;
let kreaMaskGesture = null;
let smartMaskPointDrag = null;
let kreaMaskPixelRevision = 0;
let processedMaskCache = { key: '', canvas: null };

function invalidateProcessedMask() {
  kreaMaskPixelRevision += 1;
  processedMaskCache = { key: '', canvas: null };
}

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
    enhance: state.enhance !== false,
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
        enhance: region.enhance !== false,
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

function setRegionLoraExpanded(open) {
  const expanded = open === true;
  regionLoraExpanded = expanded;
  const disclosure = $('#regionLoraDisclosure');
  const body = $('#regionLoraBody');
  disclosure.classList.toggle('expanded', expanded);
  $('#regionLoraHeader').setAttribute('aria-expanded', String(expanded));
  body.inert = !expanded;
  body.setAttribute('aria-hidden', String(!expanded));
}

function syncRegionLoraDisclosure(region) {
  const hasLora = !!(region && region.lora && region.lora !== 'None');
  $('#regionLoraSummary').textContent = hasLora ? prettyLora(region.lora) : 'None selected';
  $('#regionLoraDisclosure').style.setProperty('--region-card-color', region?.color || '#46b4e6');
  setRegionLoraExpanded(regionLoraExpanded);
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
  if (!wasOpen || focusPrompt) {
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
  selectRegion(hits[nextIndex], false);
  if (navigator.vibrate) navigator.vibrate(12);
}

function openRegionLoraPicker(region) {
  if (!region) return;
  setRegionLoraExpanded(true);
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
      { label: `Strength: ${region.strength.toFixed(2)}`, action: async () => {
        const value = await askText({
          title: 'Region LoRA strength',
          confirmLabel: 'Set strength',
          input: { label: 'Strength · 0 to 2', value: region.strength, type: 'number' },
        });
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

function setRegionResolutionExpanded(open) {
  const expanded = open === true;
  const picker = $('.region-resolution-picker');
  const menu = $('#regionResolutionMenu');
  if (!picker || !menu) return;
  picker.classList.toggle('expanded', expanded);
  $('#regionResolutionBtn').setAttribute('aria-expanded', String(expanded));
  menu.inert = !expanded;
  menu.setAttribute('aria-hidden', String(!expanded));
}

function renderRegionResolutionPicker() {
  const summary = $('#regionResolutionSummary');
  if (!summary) return;
  summary.textContent = state.customDims
    ? `Custom · ${state.width} × ${state.height}`
    : `${state.aspect} · ${state.width} × ${state.height}`;
  const icon = $('#regionResolutionIcon');
  const ratio = (state.width || 1) / (state.height || 1);
  const base = 14;
  icon.style.width = `${ratio >= 1 ? base : Math.max(7, Math.round(base * ratio))}px`;
  icon.style.height = `${ratio >= 1 ? Math.max(7, Math.round(base / ratio)) : base}px`;

  const aspectMenu = $('#regionAspectMenu');
  aspectMenu.innerHTML = '';
  ASPECTS.forEach((aspect) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'region-aspect-option' + (!state.customDims && state.aspect === aspect.label ? ' active' : '');
    const maxSide = 22;
    const width = aspect.ar >= 1 ? maxSide : Math.max(7, Math.round(maxSide * aspect.ar));
    const height = aspect.ar >= 1 ? Math.max(7, Math.round(maxSide / aspect.ar)) : maxSide;
    const dimensions = dimensionsForMegapixels(aspect.ar, state.mp);
    button.innerHTML = `<span class="ar-box" style="width:${width}px;height:${height}px"></span><b>${aspect.label}</b><small>${dimensions.w} × ${dimensions.h}</small>`;
    button.addEventListener('click', () => {
      state.aspect = aspect.label;
      state.createMatchSource = false;
      state.createMatchNative = false;
      state.customDims = false;
      computeDims();
      renderAspects();
      renderDims();
      saveForm();
      setRegionResolutionExpanded(false);
    });
    aspectMenu.appendChild(button);
  });

  const sizeMenu = $('#regionSizeMenu');
  sizeMenu.innerHTML = '';
  [{ value: 0.75, label: 'S' }, { value: 1, label: 'M' }, { value: 1.75, label: 'L' }].forEach((size) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = Number(state.mp) === size.value && !state.customDims ? 'active' : '';
    button.textContent = size.label;
    button.setAttribute('aria-label', `${size.label} resolution`);
    button.addEventListener('click', () => {
      state.mp = size.value;
      state.createMatchSource = false;
      state.createMatchNative = false;
      state.customDims = false;
      computeDims();
      renderAspects();
      renderDims();
      saveForm();
      setRegionResolutionExpanded(false);
    });
    sizeMenu.appendChild(button);
  });
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
    box.dataset.regionId = region.id;
    box.style.left = `${region.x * 100}%`;
    box.style.top = `${region.y * 100}%`;
    box.style.width = `${region.w * 100}%`;
    box.style.height = `${region.h * 100}%`;
    box.style.borderColor = region.color || REGION_COLORS[index % REGION_COLORS.length];
    box.setAttribute('aria-label', `Region ${index + 1}. Open region settings.`);
    box.innerHTML = `<span class="region-box-number" aria-hidden="true">${index + 1}</span><em class="region-box-settings" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 7h10v2H4V7Zm0 8h16v2H4v-2Zm14-9h2v4h-2V6Zm-8 8h2v4h-2v-4Z"/></svg></em><b>${escapeHtml(region.description || 'Region')}</b><i class="region-box-resize"></i>`;
    box.addEventListener('click', (event) => {
      if (Date.now() < regionClickBlockedUntil) return;
      const settingsClick = !!event.target.closest('.region-box-settings');
      const directSelection = event.detail === 0 || settingsClick || !!event.target.closest('.region-box-resize');
      if (directSelection || state.activeRegionId !== region.id) {
        selectRegion(region, settingsClick);
      } else {
        selectRegionUnderneath(event.clientX, event.clientY, region);
      }
    });
    box.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.region-box-settings')) return;
      startRegionDrag(event, region, false);
    });
    box.querySelector('.region-box-resize').addEventListener('pointerdown', (event) => startRegionDrag(event, region, true));
    stage.appendChild(box);
  });

  const region = selectedRegion();
  const hasRegion = !!region;
  $('#regionDeleteBtn').disabled = !hasRegion;
  $('#regionDescInput').disabled = !hasRegion;
  $('#regionEnhanceBtn').disabled = !hasRegion;
  $('#regionStrengthInput').disabled = !hasRegion;
  $('#regionRefBtn').disabled = !hasRegion;
  $('#regionRefClear').disabled = !hasRegion || !region.refImageName;
  $('#regionLoraHeader').disabled = !hasRegion;
  if (!region) {
    syncRegionLoraDisclosure(null);
    return;
  }

  $('#regionDescInput').value = region.description || '';
  const enhanceRegion = region.enhance !== false;
  const regionEnhanceButton = $('#regionEnhanceBtn');
  regionEnhanceButton.classList.toggle('on', enhanceRegion);
  regionEnhanceButton.setAttribute('aria-pressed', String(enhanceRegion));
  regionEnhanceButton.title = `Enhance this region prompt: ${enhanceRegion ? 'on' : 'off'}`;
  regionEnhanceButton.setAttribute('aria-label', regionEnhanceButton.title);
  const hasLora = region.lora && region.lora !== 'None';
  $('#regionStrengthField').hidden = !hasLora;
  region.strength = normalizeRegionStrength(region.strength);
  syncRegionLoraDisclosure(region);
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
      regionClickBlockedUntil = Date.now() + 400;
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
    state.activeRegionId = regionDrag.region.id;
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

function setRegionReference(asset) {
  const region = selectedRegion();
  if (!region || !asset) return;
  region.refImageName = asset.name;
  region.refUrl = asset.url;
  region.refAsset = asset;
  renderRegionEditor();
  saveForm();
  toast('Region reference added');
}

function clearKreaMask(silent) {
  invalidateProcessedMask();
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
  if (state.view !== 'edit') return false;
  return editOutpaintActive()
    ? OUTPAINT_EDIT_ENGINES.has(state.editEngine)
    : EDIT_MASK_ENGINES.has(state.editEngine);
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
  const outpaint = editOutpaintActive();
  const localizedActive = active && !outpaint;
  const preserve = $('#editComposite');
  preserve.hidden = localizedActive || (!outpaint && (kreaEdit || kreaRef));
  const preserveLabel = outpaint ? 'Keep the source at native resolution and blend the generated border' : 'Preserve unchanged areas';
  preserve.setAttribute('aria-label', preserveLabel);
  preserve.title = preserveLabel;
  const preserveText = preserve.querySelector('.preserve-text');
  if (preserveText) preserveText.textContent = outpaint ? 'Native preserve' : 'Preserve';
  $('#editAspectControl').hidden = state.view !== 'edit' || (kreaEdit && !editOutpaintActive()) || localizedActive;
  $('#qwenAngleTool').hidden = !supportsCurrentEditAngles() || state.qwenAnglesMode || active;
  syncEditSamplingRow();
}

function renderKreaMaskTools() {
  const tools = $('#kreaMaskTools');
  if (!tools) return;
  const hasMask = hasEditMask();
  const outpaint = editOutpaintActive();
  const isInpaint = !outpaint && state.editEngine === 'krea2';
  const kind = state.kreaMaskKind === 'box' ? 'Box selected'
    : (state.kreaMaskKind === 'smart' ? 'Smart mask selected' : 'Mask selected');
  $('#kreaMaskLabel').textContent = outpaint ? 'Preserve area' : (isInpaint ? 'Fill area' : 'Edit area');
  $('#kreaMaskStatus').textContent = outpaint
    ? (hasMask ? `${kind} · subject preserved` : 'Full source')
    : (hasMask ? (isInpaint ? `Fill · ${kind.toLowerCase()}` : kind) : (isInpaint ? 'Whole image · no fill area' : 'Whole image'));
  $('#kreaMaskClear').hidden = !hasMask;
  $('#kreaMaskClear').setAttribute('aria-label', outpaint ? 'Clear preserve area' : 'Clear edit area');
  $('#kreaMaskClear').title = outpaint ? 'Clear preserve area' : 'Clear edit area';
  $('#kreaMaskBtn').classList.toggle('active', hasMask);
  syncEditAreaChrome();
  renderEditMaskAdvanced();
  $('#genLbl').textContent = genLabel();
}

function renderEditMaskAdvanced() {
  const panel = $('#editMaskAdvanced');
  if (!panel) return;
  const visible = supportsCurrentEditMask() && !editOutpaintActive() && hasEditMask();
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
  invalidateProcessedMask();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (state.kreaMaskPreview) {
    const im = new Image();
    im.onload = () => {
      ctx.drawImage(im, 0, 0, w, h);
      invalidateProcessedMask();
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
  const outpaint = editOutpaintActive();
  if (state.qwenAnglesMode || selectedQwenAngleViews().length) {
    state.qwenAnglesMode = false;
    state.qwenAngles = [];
    state.qwenAngleElevations = [];
    state.qwenAngleDistances = [];
    renderQwenAngleTool();
    renderQwenAngleMode();
  }
  if (!outpaint) {
    state.editAspectOverride = false;
    renderEditAspects();
  } else {
    $('#editComposite').setAttribute('aria-pressed', 'true');
    renderEditOutpaint();
  }
  $('#kreaMaskBase').src = ref.url;
  $('#kreaMaskBase').onload = setupMaskCanvasFromImage;
  if ($('#kreaMaskBase').complete) setupMaskCanvasFromImage();
  $('#kreaMaskTitle').textContent = outpaint
    ? 'Expand preserve area'
    : (state.editEngine === 'krea2' ? 'Krea 2 fill area' : `${editEngineLabel(state.editEngine)} edit area`);
  $('#kreaMaskPrompt').placeholder = outpaint ? 'Preserve a person, product, foreground…' : 'Mask a person, jacket, sky…';
  $('.edit-area-mode').setAttribute('aria-label', outpaint ? 'Preserve area selection tool' : 'Edit area selection tool');
  $('#kreaMaskApply').textContent = outpaint ? 'Use preserve mask' : 'Done';
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
  invalidateProcessedMask();
  renderMaskOverlay();
  refreshMaskCutoutPreview();
  scheduleMaskedRefPreview();
  renderKreaMaskTools();
}

function maskExtremaPass(source, output, lineCount, lineLength, lineStride, itemStride, radius, expand) {
  const queueLength = lineLength + radius * 2 + 2;
  const queueIndexes = new Int32Array(queueLength);
  const queueValues = new Uint8ClampedArray(queueLength);
  for (let line = 0; line < lineCount; line += 1) {
    let head = 0;
    let tail = 0;
    const lineStart = line * lineStride;
    for (let cursor = -radius; cursor < lineLength + radius; cursor += 1) {
      const value = cursor >= 0 && cursor < lineLength
        ? source[lineStart + cursor * itemStride]
        : 0;
      const oldest = cursor - radius * 2;
      while (head < tail && queueIndexes[head] < oldest) head += 1;
      while (head < tail && (expand
        ? queueValues[tail - 1] <= value
        : queueValues[tail - 1] >= value)) tail -= 1;
      queueIndexes[tail] = cursor;
      queueValues[tail] = value;
      tail += 1;
      const destination = cursor - radius;
      if (destination >= 0 && destination < lineLength) {
        output[lineStart + destination * itemStride] = queueValues[head];
      }
    }
  }
}

function offsetMaskValues(values, width, height, radius, expand) {
  if (!radius) return values;
  const horizontal = new Uint8ClampedArray(values.length);
  const output = new Uint8ClampedArray(values.length);
  maskExtremaPass(values, horizontal, height, width, width, 1, radius, expand);
  maskExtremaPass(horizontal, output, width, height, 1, width, radius, expand);
  return output;
}

function processedMaskCanvas() {
  const source = $('#kreaMaskCanvas');
  if (!source || !source.width || !source.height) return null;
  const outpaint = editOutpaintActive();
  const offset = outpaint ? Math.max(-15, Math.min(15, Math.round(Number(state.editOutpaintMaskOffset) || 0))) : 0;
  const feather = outpaint
    ? Math.min(384, Math.round(Math.min(source.width, source.height) * Math.max(0, Math.min(25, Number(state.editOutpaintFeather) || 0)) / 100))
    : Math.max(0, Math.min(64, Number(state.kreaMaskFeather) || 0));
  const cacheKey = `${kreaMaskPixelRevision}:${source.width}x${source.height}:${outpaint ? 'outpaint' : 'edit'}:${offset}:${feather}`;
  if (processedMaskCache.key === cacheKey && processedMaskCache.canvas) return processedMaskCache.canvas;

  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  const sourceImage = sourceContext.getImageData(0, 0, source.width, source.height);
  let values = new Uint8ClampedArray(source.width * source.height);
  for (let pixel = 0, dataIndex = 0; pixel < values.length; pixel += 1, dataIndex += 4) {
    values[pixel] = Math.round((sourceImage.data[dataIndex] * sourceImage.data[dataIndex + 3]) / 255);
  }
  const offsetRadius = offset
    ? Math.min(1024, Math.round(Math.min(source.width, source.height) * Math.abs(offset) / 100))
    : 0;
  if (offsetRadius) values = offsetMaskValues(values, source.width, source.height, offsetRadius, offset > 0);

  const normalized = document.createElement('canvas');
  normalized.width = source.width;
  normalized.height = source.height;
  const normalizedContext = normalized.getContext('2d');
  const normalizedImage = normalizedContext.createImageData(source.width, source.height);
  for (let pixel = 0, dataIndex = 0; pixel < values.length; pixel += 1, dataIndex += 4) {
    const value = values[pixel];
    normalizedImage.data[dataIndex] = value;
    normalizedImage.data[dataIndex + 1] = value;
    normalizedImage.data[dataIndex + 2] = value;
    normalizedImage.data[dataIndex + 3] = 255;
  }
  normalizedContext.putImageData(normalizedImage, 0, 0);

  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const context = out.getContext('2d');
  context.fillStyle = '#000';
  context.fillRect(0, 0, out.width, out.height);
  context.save();
  if (feather) context.filter = `blur(${feather}px)`;
  context.drawImage(normalized, 0, 0);
  context.restore();
  processedMaskCache = { key: cacheKey, canvas: out };
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
  const alpha = maskAlphaCanvas(mask);
  if (state.kreaMaskViewMode === 'color') {
    ctx.fillStyle = 'rgba(255, 102, 93, .48)';
    ctx.fillRect(0, 0, overlay.width, overlay.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(alpha, 0, 0);
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, .68)';
    ctx.fillRect(0, 0, overlay.width, overlay.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(alpha, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
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
  invalidateProcessedMask();
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
  ctx.globalCompositeOperation = editOutpaintActive() ? 'destination-in' : 'destination-out';
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
  const outpaint = editOutpaintActive();
  const featherValue = outpaint ? state.editOutpaintFeather : state.kreaMaskFeather;
  const featherMax = outpaint ? 25 : 64;
  const featherStep = outpaint ? 1 : 2;
  const featherSuffix = outpaint ? '%' : '';
  $('#kreaBrushInput').value = String(state.kreaBrush);
  $('#kreaBrushVal').textContent = String(state.kreaBrush);
  $('#kreaMaskFeatherLabel').textContent = outpaint ? 'Preserve feather' : 'Feather';
  $('#kreaMaskFeatherVal').textContent = `${featherValue}${featherSuffix}`;
  $('#kreaMaskFeather').max = String(featherMax);
  $('#kreaMaskFeather').step = String(featherStep);
  $('#kreaMaskFeather').value = String(featherValue);
  const offset = Math.max(-15, Math.min(15, Math.round(Number(state.editOutpaintMaskOffset) || 0)));
  $('#kreaMaskOffsetField').hidden = !outpaint;
  $('#kreaMaskOffset').value = String(offset);
  $('#kreaMaskOffsetVal').textContent = `${offset > 0 ? '+' : ''}${offset}%`;
  $('#kreaMaskInvert').classList.remove('active');
  $('#kreaMaskInvert').setAttribute('aria-pressed', 'false');
  $('#kreaMaskStage').classList.remove('preview-cutout');
  $('#kreaMaskStage').dataset.maskView = state.kreaMaskViewMode;
  $$('#kreaMaskViewMode [data-mask-view]').forEach((button) => {
    const active = button.dataset.maskView === state.kreaMaskViewMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const gesture = $('#kreaMaskGesture');
  const preview = $('#kreaMaskBrushPreview');
  const values = $('#kreaMaskGestureValues');
  if (gesture && preview && values) {
    const diameter = Math.round(20 + (state.kreaBrush / 160) * 50);
    preview.style.setProperty('--brush-diameter', `${diameter}px`);
    preview.style.setProperty('--brush-feather', `${Math.round(3 + (featherValue / featherMax) * 15)}px`);
    values.textContent = `${state.kreaBrush} px · ${outpaint ? `Blend ${featherValue}%` : `Soft ${featherValue}`}`;
    gesture.setAttribute('aria-label', outpaint
      ? 'Hold and drag to adjust brush size and preserve feather'
      : 'Hold and drag to adjust brush size and feathering');
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
    invalidateProcessedMask();
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
  if (editOutpaintActive()) state.editOutpaintFeather = Math.max(0, Math.min(25, Math.round(Number(feather) || 0)));
  else state.kreaMaskFeather = Math.max(0, Math.min(64, Math.round(Number(feather) || 0)));
  if (hasEditMask()) state.kreaMaskDirty = true;
  renderMaskAdjustments();
  renderMaskOverlay();
  refreshMaskCutoutPreview();
  scheduleMaskedRefPreview();
  const live = $('#kreaMaskGestureLive');
  const activeFeather = editOutpaintActive() ? `${state.editOutpaintFeather}% preserve feather` : `${state.kreaMaskFeather} feather`;
  if (announce && live) live.textContent = `Brush size ${state.kreaBrush} px · ${activeFeather}`;
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
    feather: editOutpaintActive() ? state.editOutpaintFeather : state.kreaMaskFeather,
    active: false,
    timer: null,
  };
  kreaMaskGesture = start;
  control.setPointerCapture?.(event.pointerId);
  start.timer = setTimeout(() => {
    if (kreaMaskGesture !== start) return;
    start.active = true;
    control.classList.add('is-adjusting');
    $('#kreaMaskGestureLive').textContent = editOutpaintActive()
      ? `Brush size ${state.kreaBrush} px · ${state.editOutpaintFeather}% preserve feather`
      : `Brush size ${state.kreaBrush} px · ${state.kreaMaskFeather} feather`;
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
  setMaskGestureValues(current.brush + dy, current.feather + dx / (editOutpaintActive() ? 8 : 2), { announce: true });
}

function keyboardMaskGesture(event) {
  const key = event.key;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;
  event.preventDefault();
  const brush = state.kreaBrush + (key === 'ArrowUp' ? 4 : key === 'ArrowDown' ? -4 : 0);
  const featherStep = editOutpaintActive() ? 1 : 2;
  const feather = (editOutpaintActive() ? state.editOutpaintFeather : state.kreaMaskFeather)
    + (key === 'ArrowRight' ? featherStep : key === 'ArrowLeft' ? -featherStep : 0);
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
  delete region.refinedDescription;
  const active = $('#regionStage .region-box.active b');
  if (active) active.textContent = region.description || 'Region';
  saveForm();
});
$('#regionEnhanceBtn').addEventListener('click', () => {
  const region = selectedRegion();
  if (!region) return;
  region.enhance = region.enhance === false;
  renderRegionEditor();
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
$('#regionRefBtn').addEventListener('click', () => pickUpload('image/*', setRegionReference, 'Choose region reference'));
$('#regionRefInput').addEventListener('change', () => uploadRegionReference($('#regionRefInput').files && $('#regionRefInput').files[0]));
$('#regionRefClear').addEventListener('click', () => {
  const region = selectedRegion();
  if (!region) return;
  region.refImageName = '';
  region.refUrl = '';
  region.refAsset = null;
  renderRegionEditor();
  saveForm();
});
$('#regionRefCrop').addEventListener('click', () => {
  const region = selectedRegion();
  if (!region || !region.refImageName) return;
  const asset = region.refAsset || {
    name: region.refImageName,
    url: region.refUrl || `/api/input?name=${encodeURIComponent(region.refImageName)}`,
    label: 'Region reference',
  };
  openInputImageCrop(asset, (next) => setRegionReference(next), 'Crop region reference');
});
$('#regionSettingsClose').addEventListener('click', () => {
  regionSettingsOpen = false;
  syncRegionSettings(false);
});
$('#regionLoraHeader').addEventListener('click', () => {
  setRegionLoraExpanded($('#regionLoraHeader').getAttribute('aria-expanded') !== 'true');
});
$('#regionResolutionBtn').addEventListener('click', () => {
  setRegionResolutionExpanded($('#regionResolutionBtn').getAttribute('aria-expanded') !== 'true');
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.region-resolution-picker')) setRegionResolutionExpanded(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setRegionResolutionExpanded(false);
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
  if (editOutpaintActive()) state.editOutpaintFeather = Math.max(0, Math.min(25, Number($('#kreaMaskFeather').value) || 0));
  else state.kreaMaskFeather = Math.max(0, Math.min(64, Number($('#kreaMaskFeather').value) || 0));
  state.kreaMaskDirty = hasEditMask();
  renderMaskAdjustments();
  renderMaskOverlay();
  refreshMaskCutoutPreview();
  scheduleMaskedRefPreview();
  saveForm();
});
$('#kreaMaskOffset').addEventListener('input', () => {
  state.editOutpaintMaskOffset = Math.max(-15, Math.min(15, Math.round(Number($('#kreaMaskOffset').value) || 0)));
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
$('#kreaMaskViewMode').addEventListener('click', (event) => {
  const button = event.target.closest('[data-mask-view]');
  if (!button) return;
  state.kreaMaskViewMode = button.dataset.maskView === 'color' ? 'color' : 'dim';
  state.kreaMaskPreviewCutout = false;
  renderMaskAdjustments();
  renderMaskOverlay();
  saveForm();
});
$('#kreaMaskReset').addEventListener('click', () => clearKreaMask());
$('#kreaMaskApply').addEventListener('click', async () => {
  try {
    updateMaskedRefPreview();
    $('#kreaMaskSheet').classList.remove('show');
    renderKreaMaskTools();
    toast(editOutpaintActive()
      ? (hasEditMask() ? 'Preserve area active — only the masked subject stays native' : 'Full source preserve remains active')
      : (hasEditMask() ? 'Edit area is active — changes stay inside the mask' : 'No edit area selected'));
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
  const crop = $('#' + prefix + 'EndCrop');
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
    saveForm();
  });
  if (crop) crop.addEventListener('click', (event) => {
    event.stopPropagation();
    const asset = state[stateKey];
    if (!asset) return;
    openInputImageCrop(asset, (next) => {
      state[stateKey] = next;
      refresh();
      saveForm();
    }, 'Crop end frame');
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
    if (event.target.closest('.attach-x, .input-crop-action')) return;
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
const TRIM_PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13L18 12 8 5.5Z" fill="currentColor"/></svg>';
const TRIM_PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/></svg>';
function setTrimPlaybackIcon(button, playing) {
  if (!button) return;
  button.innerHTML = playing ? TRIM_PAUSE_ICON : TRIM_PLAY_ICON;
  button.setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
}
function stopPreview() {
  if (previewSrc) { try { previewSrc.stop(); } catch { /* noop */ } previewSrc = null; }
  $$('.trim-play:not(#driveTrimPlay)').forEach((b) => setTrimPlaybackIcon(b, false));
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
    durEl.value = Math.max(1, Math.min(Number(durEl.max) || 15, Math.round(len)));
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
  wrap.addEventListener('pointerup', () => { mode = null; saveForm(); });
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
    setTrimPlaybackIcon(play, true);
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
      saveForm();
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
        let uploadedName = null;
        try {
          const uploaded = await api('/api/upload', {
            method: 'POST', headers: { 'x-filename': encodeURIComponent(file.name) }, body: raw,
          });
          uploadedName = uploaded.name;
        } catch { /* audio remains usable for this session, but cannot survive a reload */ }
        state[stateKey] = {
          raw, buffer,
          duration: buffer.duration,
          trimStart: 0,
          trimEnd: buffer.duration,
          uploadedName,
          uploadedKey: uploadedName ? `0.00-${buffer.duration.toFixed(2)}` : null,
          label: file.name,
        };
        setAudioChipVisual(chip, true);
        box.hidden = false;
        requestAnimationFrame(() => { drawWave(); layout(); });
        saveForm();
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
    chip.textContent = active ? 'Audio added' : 'Audio';
  }
  // Face ID mode rewrites the video audio chip with lipsync copy.
  if (chip && chip.id === 'vidAudioChip' && typeof renderVidFace === 'function') renderVidFace();
}
window.addEventListener('resize', () => {
  Object.values(waveRedraw).forEach((fn) => fn());
});
wireAudioChip('vid', 'vidAudio', 'vidDur', 'vidDurVal');
wireAudioChip('anim', 'animAudio', 'animDur', 'animDurVal');

async function restorePersistedWorkspaceMedia() {
  const saved = persistedWorkspaceAudio;
  persistedWorkspaceAudio = null;
  if (!saved || !saved.name) return;
  try {
    const response = await fetch('/api/input?name=' + encodeURIComponent(saved.name));
    if (!response.ok) throw new Error('saved audio is unavailable');
    const raw = await response.arrayBuffer();
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const buffer = await audioCtx.decodeAudioData(raw.slice(0));
    state.vidAudio = {
      raw,
      buffer,
      duration: buffer.duration,
      trimStart: Math.max(0, Math.min(buffer.duration, Number(saved.trimStart) || 0)),
      trimEnd: Math.max(0, Math.min(buffer.duration, Number(saved.trimEnd) || buffer.duration)),
      uploadedName: saved.name,
      uploadedKey: `${(Number(saved.trimStart) || 0).toFixed(2)}-${(Number(saved.trimEnd) || buffer.duration).toFixed(2)}`,
      label: saved.label || 'audio',
    };
    setAudioChipVisual($('#vidAudioChip'), true);
    $('#vidAudioTrim').hidden = false;
    requestAnimationFrame(() => { if (waveRedraw.vidAudio) waveRedraw.vidAudio(); });
  } catch { toast('A saved workspace audio file is no longer available', true); }
}

function restorePersistedWorkspaceControls() {
  const controls = persistedWorkspaceVideoControls;
  persistedWorkspaceVideoControls = null;
  if (!controls) return;
  if (controls.duration != null) $('#vidDur').value = controls.duration;
  if (controls.motionFreedom != null) $('#vidFree').value = controls.motionFreedom;
  $('#vid4k').classList.toggle('active', controls.fourK);
  $('#vidQuality').classList.toggle('active', controls.quality);
  syncVideoDurationLimit();
  updateVideoPanels();
}

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

function renderQwenQuality() {
  const active = state.view === 'edit' && state.editEngine === 'qwen';
  const control = $('#qwenQualityControl');
  const steps = $('#stepsInput');
  const cfg = $('#cfgInput');
  const wasLocked = steps.dataset.qwenLocked === 'true';
  control.hidden = !active;
  syncEditSamplingRow();
  if (active) {
    const quality = state.qwenQuality === 'fast' ? 'fast' : 'quality';
    const preset = quality === 'fast' ? { steps: 4, cfg: 1 } : { steps: 20, cfg: 4 };
    control.querySelectorAll('[data-qwen-quality]').forEach((button) => {
      const selected = button.dataset.qwenQuality === quality;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('#qwenQualitySummary').textContent = quality === 'fast' ? '4 steps · quick preview' : '20 steps · best detail';
    steps.value = preset.steps;
    cfg.value = preset.cfg;
    steps.disabled = true;
    cfg.disabled = true;
    steps.dataset.qwenLocked = 'true';
    cfg.dataset.qwenLocked = 'true';
    steps.title = 'Controlled by the Qwen sampling preset';
    cfg.title = 'Controlled by the Qwen sampling preset';
  } else {
    steps.disabled = false;
    cfg.disabled = false;
    delete steps.dataset.qwenLocked;
    delete cfg.dataset.qwenLocked;
    steps.title = 'Double-tap to reset to your default';
    cfg.title = 'Double-tap to reset to your default';
    if (wasLocked && state.view === 'edit') restoreGenerationTuning('edit');
  }
}

function syncEditSamplingRow() {
  const row = $('#editSamplingRow');
  if (!row) return;
  const samplingChoice = state.view === 'edit' && state.editEngine === 'qwen';
  const preserveChoice = state.view === 'edit' && !$('#editComposite').hidden;
  row.hidden = !samplingChoice && !preserveChoice;
  row.classList.toggle('preserve-only', !samplingChoice && preserveChoice);
}

$('#qwenQualityControl').addEventListener('click', (event) => {
  const button = event.target.closest('[data-qwen-quality]');
  if (!button) return;
  state.qwenQuality = button.dataset.qwenQuality === 'fast' ? 'fast' : 'quality';
  renderQwenQuality();
  renderEditModelSummary();
  renderLoras();
  saveForm();
});

function selectedQwenAngleViews() {
  const views = QWEN_ANGLE_VIEWS
    .filter((view) => state.qwenAngles.includes(view.id))
    .map((view) => ({ view: view.id }));
  const elevations = QWEN_ANGLE_ELEVATIONS
    .filter((option) => state.qwenAngleElevations.includes(option.id))
    .map((option) => ({ elevation: option.id }));
  const distances = QWEN_ANGLE_DISTANCES
    .filter((option) => state.qwenAngleDistances.includes(option.id))
    .map((option) => ({ distance: option.id }));
  return [...views, ...elevations, ...distances];
}

function createAngleGroupId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `angles-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function renderQwenAngleTool() {
  const button = $('#qwenAnglesBtn');
  const count = selectedQwenAngleViews().length;
  button.classList.toggle('active', count > 0);
  button.setAttribute('aria-label', count ? `Camera angles, ${count} selected` : 'Camera angles');
  $('#qwenAngleCount').hidden = count === 0;
  $('#qwenAngleCount').textContent = String(count);
}

function renderQwenAngleMode() {
  const active = supportsCurrentEditAngles() && state.qwenAnglesMode;
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
  $('#qwenAngleTool').hidden = !supportsCurrentEditAngles() || active;
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
  const renderChoiceRow = (row, options, values, setValues) => {
    row.replaceChildren();
    options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      const selected = values.includes(option.id);
      button.className = selected ? 'active' : '';
      if (row.id === 'qwenDistanceRow') button.innerHTML = `${framingIcon(option.id)}<span>${option.label}</span>`;
      else button.textContent = option.label;
      button.setAttribute('aria-pressed', String(selected));
      button.addEventListener('click', () => {
        setValues(values.includes(option.id)
          ? values.filter((value) => value !== option.id)
          : [...values, option.id]);
        renderQwenAnglePicker();
        renderQwenAngleTool();
        saveForm();
      });
      row.appendChild(button);
    });
  };
  renderChoiceRow($('#qwenElevationRow'), QWEN_ANGLE_ELEVATIONS, state.qwenAngleElevations, (values) => { state.qwenAngleElevations = values; });
  renderChoiceRow($('#qwenDistanceRow'), QWEN_ANGLE_DISTANCES, state.qwenAngleDistances, (values) => { state.qwenAngleDistances = values; });
  const selectedViews = state.qwenAngles.length;
  const allSelected = selectedViews === QWEN_ANGLE_VIEWS.length;
  const allToggle = $('#qwenAnglesToggleAll');
  allToggle.textContent = allSelected ? 'Clear views' : 'All views';
  allToggle.setAttribute('aria-pressed', String(allSelected));
  const selected = selectedQwenAngleViews().length;
  const parts = [
    selectedViews ? `${selectedViews} view${selectedViews === 1 ? '' : 's'}` : '',
    state.qwenAngleElevations.length ? `${state.qwenAngleElevations.length} height${state.qwenAngleElevations.length === 1 ? '' : 's'}` : '',
    state.qwenAngleDistances.length ? `${state.qwenAngleDistances.length} framing${state.qwenAngleDistances.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  $('#qwenAngleSummary').textContent = selected
    ? `${selected} export${selected === 1 ? '' : 's'} · ${parts.join(' · ')}`
    : 'No camera options selected';
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
  const frameAwareVideo = state.view === 'video' && !!state.vidRef
    && !['ltx-edit'].includes(state.vidEngine);
  btn.classList.toggle('on', state.enhance);
  btn.title = state.enhance
    ? (frameAwareVideo ? 'Enhance with start frame + prompt: on' : 'Prompt enhance: on')
    : 'Prompt enhance: off';
  btn.setAttribute('aria-label', btn.title);
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
  const supported = inEdit && engineSupported && !editOutpaintActive();
  if (inEdit && (!engineSupported || editOutpaintActive())) state.editSequential = false;
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
  if (!SEQUENTIAL_EDIT_ENGINES.has(state.editEngine) || editOutpaintActive()) return;
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
  const remove = event.target.closest('[data-remove-prompt-ref], [data-remove-prompt-lora]');
  if (!remove) return;
  const token = remove.closest('.prompt-ref-token, .prompt-lora-token');
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
  const safeMatch = state.view === 'create' && state.createMode === 'image'
    ? matchedCreateOutputDimensions(state.createRef, false)
    : null;
  const nativeMatch = safeMatch ? matchedCreateOutputDimensions(state.createRef, true) : null;
  if (safeMatch) {
    const source = document.createElement('button');
    source.type = 'button';
    source.className = 'aspect-chip create-match-aspect' + (state.createMatchSource && !state.createMatchNative && state.customDims ? ' active' : '');
    source.setAttribute('aria-label', `Match image aspect at a generation-safe ${safeMatch.w} by ${safeMatch.h}`);
    const ratio = safeMatch.w / safeMatch.h;
    const maxSide = 22;
    const w = ratio >= 1 ? maxSide : Math.max(7, Math.round(maxSide * ratio));
    const h = ratio >= 1 ? Math.max(7, Math.round(maxSide / ratio)) : maxSide;
    const derivedAspect = derivedAspectLabel(state.createRef.w, state.createRef.h);
    source.innerHTML = `<span class="ar-box" style="width:${w}px;height:${h}px"></span>Match image<small>${derivedAspect} · ${createSizeLabel()} · ${safeMatch.w} × ${safeMatch.h}</small>`;
    source.addEventListener('click', () => {
      applyCreateMatchedDimensions();
      renderAspects();
      renderDims();
      saveForm();
    });
    row.appendChild(source);

    const native = document.createElement('button');
    native.type = 'button';
    native.className = 'aspect-chip create-match-aspect' + (state.createMatchSource && state.createMatchNative && state.customDims ? ' active' : '');
    native.setAttribute('aria-label', `Use native image size at ${nativeMatch.w} by ${nativeMatch.h}`);
    native.innerHTML = `<span class="ar-box" style="width:${w}px;height:${h}px"></span>Native<small>${derivedAspect} · ${nativeMatch.w} × ${nativeMatch.h}</small>`;
    native.addEventListener('click', () => {
      applyCreateMatchedDimensions({ native: true });
      renderAspects();
      renderDims();
      saveForm();
    });
    row.appendChild(native);
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
      state.createMatchNative = false;
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
    ? `${state.aspect} · ${state.createMatchNative ? 'Native image' : `Match image ${createSizeLabel()}`} · ${state.width} × ${state.height}`
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
  $$('#sizeSeg button').forEach((b) => b.classList.toggle('active', Number(b.dataset.mp) === state.mp
    && (!state.customDims || (state.createMatchSource && !state.createMatchNative))));
  syncRegionStageAspect();
  renderRegionResolutionPicker();
}

function renderEditAspects() {
  const control = $('#editAspectControl');
  if (!control) return;
  const override = state.editAspectOverride;
  const matched = matchedEditOutputDimensions(state.refs[0]);
  const sizeLabel = override ? editResolutionSizeLabel() : 'M';
  $('#editAspectSummary').textContent = override
    ? `${state.editAspect}${sizeLabel ? ` · ${sizeLabel}` : ''} · ${state.editWidth} × ${state.editHeight}`
    : (matched ? `Match image · M · ${matched.w} × ${matched.h}` : 'Match first image');
  $('#editWInput').value = state.editWidth;
  $('#editHInput').value = state.editHeight;
  const row = $('#editAspectRow');
  row.innerHTML = '';
  const source = document.createElement('button');
  source.type = 'button';
  source.className = 'aspect-chip edit-aspect-source' + (!override ? ' active' : '');
  source.innerHTML = `<span class="ar-box edit-source-box"></span>Match image${matched ? `<small>${matched.w} × ${matched.h}</small>` : ''}`;
  source.addEventListener('click', () => {
    state.editMp = 1;
    state.editAspectOverride = false;
    const nextMatched = matchedEditOutputDimensions(state.refs[0]);
    if (nextMatched) {
      state.editWidth = nextMatched.w;
      state.editHeight = nextMatched.h;
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
      const dimensions = dimensionsForMegapixels(a.ar, state.editMp);
      state.editWidth = dimensions.w;
      state.editHeight = dimensions.h;
      renderEditAspects();
      saveForm();
    });
    row.appendChild(btn);
  });
  const selectedSize = override ? editResolutionSizeLabel() : 'M';
  $$('#editSizeSeg button').forEach((button) => button.classList.toggle('active', button.textContent === selectedSize));
  const body = $('#editAspectBody');
  $('#editAspectToggle').classList.toggle('custom', override);
  body.classList.toggle('expanded', $('#editAspectToggle').getAttribute('aria-expanded') === 'true');
  renderEditOutpaint();
}

function matchedEditOutputDimensions(ref, megapixels = 1) {
  const width = Number(ref?.w);
  const height = Number(ref?.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const ratio = width / height;
  return dimensionsForMegapixels(ratio, megapixels);
}

function optionalUnitOffset(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

function editOutpaintGeometry() {
  const ref = state.refs[0];
  const sourceWidth = Number(ref?.w);
  const sourceHeight = Number(ref?.h);
  const targetWidth = Number(state.editWidth);
  const targetHeight = Number(state.editHeight);
  if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight || !state.editAspectOverride) {
    return { valid: false, ref, axis: 'horizontal', sourceWidthPercent: 100, sourceHeightPercent: 100 };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const ratioDiffers = Math.abs(Math.log(targetRatio / sourceRatio)) >= .012;
  const scale = Math.max(.45, Math.min(1, Number(state.editOutpaintScale) / 100 || 1));
  const axis = targetRatio >= sourceRatio ? 'horizontal' : 'vertical';
  const legacyOffset = state.editOutpaintPosition === 'start' ? 0 : (state.editOutpaintPosition === 'end' ? 1 : .5);
  const savedOffsetX = optionalUnitOffset(state.editOutpaintOffsetX);
  const savedOffsetY = optionalUnitOffset(state.editOutpaintOffsetY);
  const offsetX = savedOffsetX ?? (axis === 'horizontal' ? legacyOffset : .5);
  const offsetY = savedOffsetY ?? (axis === 'vertical' ? legacyOffset : .5);
  const nativePreserve = $('#editComposite')?.getAttribute('aria-pressed') === 'true';
  let finalWidth = targetWidth;
  let finalHeight = targetHeight;
  let limited = false;
  if (nativePreserve) {
    if (axis === 'horizontal') {
      finalHeight = Math.max(256, Math.ceil((sourceHeight / scale) / 16) * 16);
      finalWidth = Math.max(256, Math.ceil((finalHeight * targetRatio) / 16) * 16);
    } else {
      finalWidth = Math.max(256, Math.ceil((sourceWidth / scale) / 16) * 16);
      finalHeight = Math.max(256, Math.ceil((finalWidth / targetRatio) / 16) * 16);
    }
    if (finalWidth * finalHeight > 32_000_000) {
      const shrink = Math.sqrt(32_000_000 / (finalWidth * finalHeight));
      finalWidth = Math.max(256, Math.floor((finalWidth * shrink) / 16) * 16);
      finalHeight = Math.max(256, Math.floor((finalHeight * shrink) / 16) * 16);
      limited = true;
    }
  }
  const fitWidth = axis === 'horizontal' ? sourceRatio / targetRatio * 100 : 100;
  const fitHeight = axis === 'vertical' ? targetRatio / sourceRatio * 100 : 100;
  const sourceWidthPercent = nativePreserve ? sourceWidth / finalWidth * 100 : fitWidth * scale;
  const sourceHeightPercent = nativePreserve ? sourceHeight / finalHeight * 100 : fitHeight * scale;
  return {
    valid: ratioDiffers || scale < .999,
    ref,
    sourceRatio,
    targetRatio,
    axis,
    offsetX,
    offsetY,
    nativePreserve,
    finalWidth,
    finalHeight,
    limited,
    refineNeeded: nativePreserve && finalWidth * finalHeight > 2_000_000,
    sourceWidthPercent: Math.max(8, Math.min(100, sourceWidthPercent)),
    sourceHeightPercent: Math.max(8, Math.min(100, sourceHeightPercent)),
  };
}

function editOutpaintActive() {
  return state.view === 'edit' && OUTPAINT_EDIT_ENGINES.has(state.editEngine) && state.editOutpaint;
}

function defaultEditOutpaintAspect(ref) {
  const ratio = Number(ref?.w) / Number(ref?.h);
  if (!Number.isFinite(ratio) || ratio <= 0) return '16:9';
  if (ratio >= 2.05) return '16:9';
  if (ratio >= 1.55) return '21:9';
  if (ratio >= 1) return '16:9';
  if (ratio <= .62) return '2:3';
  return '9:16';
}

function applyEditOutpaintAspect(label) {
  const aspect = ASPECTS.find((entry) => entry.label === label) || ASPECTS.find((entry) => entry.label === '16:9');
  state.editAspectOverride = true;
  state.editAspect = aspect.label;
  state.editWidth = round32(Math.sqrt(1e6 * aspect.ar));
  state.editHeight = round32(Math.sqrt(1e6 / aspect.ar));
}

function syncEditOutpaintPlacement(geometry = editOutpaintGeometry()) {
  const source = $('#editOutpaintSource');
  if (!source) return;
  const offsetX = Number.isFinite(geometry.offsetX) ? geometry.offsetX : .5;
  const offsetY = Number.isFinite(geometry.offsetY) ? geometry.offsetY : .5;
  source.style.left = `${(100 - geometry.sourceWidthPercent) * offsetX}%`;
  source.style.top = `${(100 - geometry.sourceHeightPercent) * offsetY}%`;
  source.setAttribute('aria-valuenow', String(Math.round((geometry.axis === 'horizontal' ? offsetX : offsetY) * 100)));
  source.setAttribute('aria-valuetext', `${Math.round(offsetX * 100)}% across, ${Math.round(offsetY * 100)}% down`);

  const labels = geometry.axis === 'vertical' ? ['Top', 'Center', 'Bottom'] : ['Left', 'Center', 'Right'];
  const primaryOffset = geometry.axis === 'horizontal' ? offsetX : offsetY;
  const secondaryOffset = geometry.axis === 'horizontal' ? offsetY : offsetX;
  $$('#editOutpaintPosition button').forEach((button, index) => {
    button.textContent = labels[index];
    const expected = index / 2;
    button.classList.toggle('active', Math.abs(primaryOffset - expected) < .01 && Math.abs(secondaryOffset - .5) < .01);
  });
  const freePlacement = Math.abs(secondaryOffset - .5) >= .01
    || ![0, .5, 1].some((value) => Math.abs(primaryOffset - value) < .01);
  $('#editOutpaintPlacementLabel').textContent = freePlacement
    ? 'Free placement'
    : (geometry.axis === 'vertical' ? 'Vertical placement' : 'Horizontal placement');
}

function renderEditOutpaint() {
  const control = $('#editOutpaintControl');
  if (!control) return;
  const available = state.view === 'edit' && OUTPAINT_EDIT_ENGINES.has(state.editEngine);
  const enabled = available && state.editOutpaint;
  const geometry = editOutpaintGeometry();
  control.hidden = !available;
  control.classList.toggle('is-enabled', enabled);
  const toggle = $('#editOutpaintToggle');
  toggle.setAttribute('aria-checked', String(enabled));
  const body = $('#editOutpaintBody');
  body.classList.toggle('expanded', enabled);
  body.setAttribute('aria-hidden', String(!enabled));
  body.inert = !enabled;
  const summary = $('#editOutpaintSummary');
  summary.textContent = !enabled ? 'Extend beyond the frame'
    : (!geometry.ref ? 'Add a source image'
      : (geometry.valid ? `${state.editOutpaintScale}% · ${geometry.finalWidth} × ${geometry.finalHeight}` : '100% · no added canvas'));

  const preview = $('#editOutpaintPreview');
  const source = $('#editOutpaintSource');
  const image = $('#editOutpaintPreviewImage');
  source.classList.toggle('preserve-masked', enabled && geometry.nativePreserve && hasEditMask());
  const hasPreviewGeometry = !!geometry.ref && geometry.finalWidth > 0 && geometry.finalHeight > 0;
  const previewRatio = hasPreviewGeometry ? geometry.finalWidth / geometry.finalHeight : 16 / 9;
  preview.style.aspectRatio = hasPreviewGeometry ? `${geometry.finalWidth} / ${geometry.finalHeight}` : '16 / 9';
  preview.style.width = previewRatio < 1
    ? `min(${Math.round(210 * previewRatio)}px, ${(previewRatio * 100).toFixed(2)}%)`
    : 'min(210px, 100%)';
  source.style.width = `${geometry.sourceWidthPercent}%`;
  source.style.height = `${geometry.sourceHeightPercent}%`;
  syncEditOutpaintPlacement(geometry);
  image.hidden = true;
  if (geometry.ref) {
    const sourceUrl = geometry.ref.displayUrl || geometry.ref.url || '';
    image.onload = () => {
      image.hidden = false;
      if (geometry.ref.w && geometry.ref.h) return;
      geometry.ref.w = image.naturalWidth;
      geometry.ref.h = image.naturalHeight;
      renderEditAspects();
    };
    if (sourceUrl) {
      const absoluteUrl = new URL(sourceUrl, location.href).href;
      if (image.src !== absoluteUrl) image.src = sourceUrl;
      else if (image.complete && image.naturalWidth) image.onload();
    }
  }

  $('#editOutpaintScale').value = String(state.editOutpaintScale);
  $('#editOutpaintScaleValue').textContent = `${state.editOutpaintScale}%`;
  $('#editOutpaintOutputValue').textContent = hasPreviewGeometry ? `${geometry.finalWidth} × ${geometry.finalHeight}` : '—';
  $('#editOutpaintOutputNote').textContent = !geometry.ref ? 'Add a source image to calculate the canvas.'
    : (geometry.nativePreserve
      ? `${geometry.ref.w} × ${geometry.ref.h} ${hasEditMask() ? 'masked subject' : 'source'} retained${geometry.limited ? ' · canvas limit applied' : (geometry.refineNeeded ? ' · SeedVR2 detail upscale' : '')}`
      : 'The source and generated canvas use the selected working resolution.');
  $('#editOutpaintHint').textContent = !geometry.ref ? 'Add the image you want to extend.'
    : (!geometry.valid ? 'Reduce Source on canvas or choose a different ratio to add space.'
      : (geometry.nativePreserve
        ? (hasEditMask()
          ? 'Drag the subject to position it. Only the preserve mask stays at native resolution.'
          : 'Drag the source to position it. It stays at native resolution while the surrounding canvas is generated.')
        : `Drag the source to position it on the ${state.editWidth} × ${state.editHeight} canvas.`));
}

$('#editOutpaintToggle').addEventListener('click', () => {
  const enabling = !state.editOutpaint;
  if (enabling && !state.refs[0]) return toast('Add a source image before enabling Expand', true);
  state.editOutpaint = enabling;
  if (enabling) {
    state.editSequential = false;
    $('#editComposite').setAttribute('aria-pressed', 'true');
    if (state.qwenAnglesMode) closeQwenAngles();
    if (!editOutpaintGeometry().valid) applyEditOutpaintAspect(defaultEditOutpaintAspect(state.refs[0]));
  }
  if (hasEditMask()) {
    state.kreaMaskDirty = true;
    updateMaskedRefPreview();
  }
  renderRefs();
  renderEditSequence();
  updateVideoPanels();
  saveForm();
});

$('#editOutpaintPosition').addEventListener('click', (event) => {
  const button = event.target.closest('[data-outpaint-position]');
  if (!button) return;
  state.editOutpaintPosition = ['start', 'center', 'end'].includes(button.dataset.outpaintPosition)
    ? button.dataset.outpaintPosition : 'center';
  const offset = state.editOutpaintPosition === 'start' ? 0 : (state.editOutpaintPosition === 'end' ? 1 : .5);
  const geometry = editOutpaintGeometry();
  state.editOutpaintOffsetX = geometry.axis === 'horizontal' ? offset : .5;
  state.editOutpaintOffsetY = geometry.axis === 'vertical' ? offset : .5;
  renderEditOutpaint();
  saveForm();
});

(() => {
  const source = $('#editOutpaintSource');
  const preview = $('#editOutpaintPreview');
  let drag = null;

  function updatePosition(clientX, clientY) {
    if (!drag) return;
    const previewRect = preview.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const availableX = Math.max(0, previewRect.width - sourceRect.width);
    const availableY = Math.max(0, previewRect.height - sourceRect.height);
    const left = Math.max(0, Math.min(availableX, clientX - previewRect.left - drag.grabX));
    const top = Math.max(0, Math.min(availableY, clientY - previewRect.top - drag.grabY));
    state.editOutpaintOffsetX = availableX > .5 ? left / availableX : .5;
    state.editOutpaintOffsetY = availableY > .5 ? top / availableY : .5;
    const geometry = editOutpaintGeometry();
    const primary = geometry.axis === 'horizontal' ? geometry.offsetX : geometry.offsetY;
    state.editOutpaintPosition = primary < .25 ? 'start' : (primary > .75 ? 'end' : 'center');
    syncEditOutpaintPlacement(geometry);
  }

  source.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const geometry = editOutpaintGeometry();
    if (!editOutpaintActive() || !geometry.valid || !geometry.ref) return;
    const sourceRect = source.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      grabX: event.clientX - sourceRect.left,
      grabY: event.clientY - sourceRect.top,
    };
    source.classList.add('dragging');
    source.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  source.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    updatePosition(event.clientX, event.clientY);
    event.preventDefault();
  });
  const finishDrag = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    drag = null;
    source.classList.remove('dragging');
    saveForm();
  };
  source.addEventListener('pointerup', finishDrag);
  source.addEventListener('pointercancel', finishDrag);
  source.addEventListener('lostpointercapture', finishDrag);
  source.addEventListener('keydown', (event) => {
    if (!editOutpaintActive()) return;
    const step = event.shiftKey ? .1 : .025;
    let handled = true;
    if (event.key === 'ArrowLeft') state.editOutpaintOffsetX = Math.max(0, (editOutpaintGeometry().offsetX || 0) - step);
    else if (event.key === 'ArrowRight') state.editOutpaintOffsetX = Math.min(1, editOutpaintGeometry().offsetX + step);
    else if (event.key === 'ArrowUp') state.editOutpaintOffsetY = Math.max(0, (editOutpaintGeometry().offsetY || 0) - step);
    else if (event.key === 'ArrowDown') state.editOutpaintOffsetY = Math.min(1, editOutpaintGeometry().offsetY + step);
    else if (event.key === 'Home') {
      state.editOutpaintOffsetX = .5;
      state.editOutpaintOffsetY = .5;
      state.editOutpaintPosition = 'center';
    } else handled = false;
    if (!handled) return;
    event.preventDefault();
    syncEditOutpaintPlacement(editOutpaintGeometry());
    saveForm();
  });
})();

$('#editOutpaintScale').addEventListener('input', (event) => {
  state.editOutpaintScale = Math.max(45, Math.min(100, Math.round(Number(event.target.value) || 100)));
  renderEditOutpaint();
});
$('#editOutpaintScale').addEventListener('change', saveForm);

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
    const outpaint = $('#editOutpaintControl');
    if (control.parentElement !== $('#refPanel') || control.previousElementSibling !== outpaint) {
      outpaint.after(control);
    }
  } else if (isCreate) {
    const turboPanel = $('#kreaModelPanel');
    if (control.parentElement !== $('#view-create') || control.previousElementSibling !== turboPanel) {
      turboPanel.after(control);
    }
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
    state.editMp = state.editAspectOverride
      ? nearestResolutionMegapixels(state.editWidth, state.editHeight)
      : 1;
    state.editAspect = 'custom';
    renderEditAspects();
    saveForm();
  });
}
$$('#editSizeSeg button').forEach((button) => button.addEventListener('click', () => {
  const megapixels = normalizeResolutionMegapixels(button.dataset.editMp);
  const source = state.refs[0];
  const ratio = state.editAspectOverride
    ? state.editWidth / Math.max(1, state.editHeight)
    : (Number(source?.w) / Math.max(1, Number(source?.h)) || 1);
  const dimensions = dimensionsForMegapixels(ratio, megapixels);
  state.editMp = megapixels;
  state.editAspectOverride = true;
  state.editAspect = derivedAspectLabel(dimensions.w, dimensions.h);
  state.editWidth = dimensions.w;
  state.editHeight = dimensions.h;
  renderEditAspects();
  saveForm();
}));
$$('#sizeSeg button').forEach((b) => b.addEventListener('click', () => {
  const keepImageMatch = state.createMatchSource && !!state.createRef;
  state.mp = Number(b.dataset.mp);
  if (keepImageMatch) {
    applyCreateMatchedDimensions();
  } else {
    state.createMatchSource = false;
    state.createMatchNative = false;
    state.customDims = false;
    computeDims();
  }
  renderAspects();
  renderDims();
  saveForm();
}));
for (const id of ['#wInput', '#hInput']) {
  $(id).addEventListener('change', () => {
    state.createMatchSource = false;
    state.createMatchNative = false;
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

function normalizeLoraTriggerPhrase(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 160);
}

function loraTriggerPhrase(lora) {
  const direct = normalizeLoraTriggerPhrase(lora && lora.triggerPhrase);
  if (direct) return direct;
  const name = lora && lora.name;
  const registered = normalizeLoraTriggerPhrase(name ? state.loraTriggers[name] : '');
  if (registered) return registered;
  if (!name) return '';
  const stacks = [
    state.loras,
    state.videoLoras,
    state.editLoras,
    ...Object.values(state.editLorasByEngine || {}),
  ];
  const match = stacks.flat().find((item) => item && item.name === name && item !== lora);
  return normalizeLoraTriggerPhrase(match && match.triggerPhrase);
}

function loraTriggerColor(name) {
  const index = curLoras().findIndex((item) => item && item.name === name);
  return REGION_COLORS[(index < 0 ? 0 : index) % REGION_COLORS.length];
}

function syncPromptLoraTokenColors() {
  $$('.prompt-lora-token').forEach((token) => {
    token.style.setProperty('--lora-trigger-color', loraTriggerColor(token.dataset.loraName));
  });
}

function promptHasLoraTrigger(prompt, phrase) {
  const needle = normalizeLoraTriggerPhrase(phrase).toLocaleLowerCase();
  const resolvedPrompt = expandPromptLoraTriggers(prompt);
  return !!needle && resolvedPrompt.toLocaleLowerCase().includes(needle);
}

function loraTriggerLiteralPattern(phrase) {
  const escaped = normalizeLoraTriggerPhrase(phrase)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  return escaped ? new RegExp(escaped, 'i') : null;
}

function promoteLoraTriggerInPrompt(lora) {
  const phrase = loraTriggerPhrase(lora);
  const draft = promptDraft();
  const token = loraTriggerToken(lora && lora.name);
  if (!phrase) return false;
  if (lora && lora.name) state.loraTriggers[lora.name] = phrase;
  if (promptHasLoraTriggerToken(draft, lora && lora.name)) return false;
  const pattern = loraTriggerLiteralPattern(phrase);
  const match = pattern && pattern.exec(draft);
  if (!match) return false;
  const value = draft.slice(0, match.index) + token + draft.slice(match.index + match[0].length);
  setPromptDraft(value);
  if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) state.prompts[state.view] = value;
  updatePromptClear();
  return true;
}

function demoteLoraTriggerInPrompt(lora) {
  const name = lora && lora.name;
  const phrase = loraTriggerPhrase(lora);
  if (!name || !phrase) return false;
  let changed = false;
  const value = promptDraft().replace(/@lora-trigger\[[^\]]+\]|@lora-trigger-[^\s,;:!?]+/g, (token) => {
    if (loraNameFromTriggerToken(token) !== name) return token;
    changed = true;
    return phrase;
  });
  if (!changed) return false;
  setPromptDraft(value);
  if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) state.prompts[state.view] = value;
  updatePromptClear();
  return true;
}

function ensureLoraTriggerInPrompt(lora) {
  const phrase = loraTriggerPhrase(lora);
  if (!phrase) return false;
  if (promoteLoraTriggerInPrompt(lora)) return true;
  if (promptHasLoraTrigger(promptDraft(), phrase)) return false;
  const current = promptDraft().trim();
  const separator = current ? (/[,.!?;:]$/.test(current) ? ' ' : ', ') : '';
  const value = current + separator + loraTriggerToken(lora.name) + ' ';
  setPromptDraft(value);
  if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) state.prompts[state.view] = value;
  updatePromptClear();
  return true;
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

function generationTuningMode(view = state.view) {
  if (view === 'create') return 'create';
  if (view === 'edit') return 'edit';
  if (view === 'video') return 'video';
  return null;
}

function defaultGenerationTuning(mode) {
  if (mode === 'video') {
    return {
      steps: 1,
      cfg: 1,
      batch: 1,
      denoise: undefined,
      seed: state.userDefaults.seed.mode === 'fixed' ? String(state.userDefaults.seed.value) : '',
    };
  }
  const defaults = state.userDefaults[mode] || state.userDefaults.create;
  return {
    steps: Number(defaults.steps),
    cfg: Number(defaults.cfg),
    batch: Number(defaults.batch),
    denoise: mode === 'edit' ? Number(state.userDefaults.edit.denoise) : undefined,
    seed: state.userDefaults.seed.mode === 'fixed' ? String(state.userDefaults.seed.value) : '',
  };
}

function normalizeGenerationTuning(mode, value) {
  if (!value || typeof value !== 'object') return null;
  const defaults = defaultGenerationTuning(mode);
  const number = (input, min, max, fallback) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  const seed = String(value.seed ?? '').trim();
  return {
    steps: Math.round(number(value.steps, 1, 100, defaults.steps)),
    cfg: number(value.cfg, 0, 30, defaults.cfg),
    batch: Math.round(number(value.batch, 1, 8, defaults.batch)),
    denoise: mode === 'edit' ? number(value.denoise, 0.1, 1, defaults.denoise) : undefined,
    seed: /^\d+$/.test(seed) ? seed : '',
  };
}

function captureGenerationTuning(mode = generationTuningMode()) {
  if (!mode) return;
  const previous = state.generationTuning[mode] || defaultGenerationTuning(mode);
  const qwenLocked = mode === 'edit' && state.editEngine === 'qwen';
  state.generationTuning[mode] = normalizeGenerationTuning(mode, {
    steps: qwenLocked ? previous.steps : ($('#stepsInput').value || previous.steps),
    cfg: qwenLocked ? previous.cfg : ($('#cfgInput').value === '' ? previous.cfg : $('#cfgInput').value),
    batch: $('#batchInput').value || previous.batch,
    denoise: mode === 'edit' ? $('#denoiseInput').value : undefined,
    seed: $('#seedInput').value,
  });
}

function restoreGenerationTuning(mode = generationTuningMode()) {
  if (!mode) return;
  const tuning = state.generationTuning[mode] || defaultGenerationTuning(mode);
  $('#stepsInput').value = tuning.steps;
  $('#cfgInput').value = tuning.cfg;
  $('#batchInput').value = tuning.batch;
  $('#seedInput').value = tuning.seed;
  if (mode === 'edit') {
    $('#denoiseInput').value = tuning.denoise;
    $('#denoiseVal').textContent = Number(tuning.denoise).toFixed(2);
  }
  renderKrea2Mode();
}

function resetGenerationControl(control) {
  const mode = generationTuningMode();
  if (!mode || !control) return;
  const defaults = defaultGenerationTuning(mode);
  const key = control.dataset.defaultReset;
  if (key === 'seed') control.value = defaults.seed;
  else if (Object.prototype.hasOwnProperty.call(defaults, key)) control.value = defaults[key];
  if (key === 'denoise') $('#denoiseVal').textContent = Number(control.value).toFixed(2);
  captureGenerationTuning(mode);
  renderKrea2Mode();
  saveForm();
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
  restoreGenerationTuning();
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
  const current = expandPromptLoraTriggers(promptDraft()).toLowerCase();
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

function appendPromptSuggestion(phrase, loraName) {
  const current = promptDraft().trim();
  const separator = current ? (/[,.!?;:]$/.test(current) ? ' ' : ', ') : '';
  const value = current + separator + phrase;
  setPromptDraft(value);
  if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) {
    state.prompts[state.view] = value;
  }
  const lora = curLoras().find((item) => item && item.on && item.name === loraName);
  if (lora) promoteLoraTriggerInPrompt(lora);
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
    b.addEventListener('click', () => appendPromptSuggestion(suggestion.phrase, suggestion.lora));
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
  if (allBtn) {
    const filtering = !state.showAllLoras;
    allBtn.classList.toggle('active', filtering);
    allBtn.setAttribute('aria-pressed', String(filtering));
    allBtn.title = filtering ? 'Show all LoRAs' : 'Filter to compatible LoRAs';
    allBtn.setAttribute('aria-label', allBtn.title);
  }
}

function loraThumbHtml(name, cls) {
  const thumb = state.loraThumbs && state.loraThumbs[name];
  if (thumb) return `<span class="${cls}"><img src="/lorathumbs/${thumb}" alt="" /></span>`;
  const initials = prettyLora(name || '?').slice(0, 2).toUpperCase();
  return `<span class="${cls}">${escapeHtml(initials)}</span>`;
}

function renderLoras() {
  syncKleinOutpaintConsistencyLora();
  syncEditAutomaticLora();
  const arr = curLoras();
  const list = $('#loraList');
  list.innerHTML = '';
  arr.forEach((l, idx) => {
    if (!l.name) { arr.splice(idx, 1); return; } // legacy empty rows
    const card = document.createElement('div');
    const trigger = loraTriggerPhrase(l);
    const managedConsistency = l.managed === 'klein-outpaint-consistency' || l.managed === 'edit-workflow-auto';
    card.className = 'lora-card' + (l.on ? ' on' : '') + (trigger ? ' has-trigger' : '')
      + (managedConsistency ? ' managed-consistency' : '') + (l.missing ? ' missing' : '');
    card.style.setProperty('--lora-color', loraTriggerColor(l.name));
    card.innerHTML = `${loraThumbHtml(l.name, 'lc-thumb')}`
      + `<span class="lc-strength">${Number(l.strength).toFixed(2)}</span>`
      + `<button class="lc-menu" type="button" aria-label="LoRA options" aria-haspopup="menu" aria-expanded="false">⋯</button>`
      + (trigger ? `<span class="lc-trigger-badge" title="Trigger phrase: ${escapeHtml(trigger)}" aria-label="Has trigger phrase">✦</span>` : '')
      + (managedConsistency ? '<span class="lc-auto-badge" title="Applied automatically for Klein Expand">Auto</span>' : '')
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
  syncPromptLoraTokenColors();
  renderPromptSuggestions();
}

/* Card interactions: tap toggles, hold (300ms) + slide up/down adjusts
   strength. The ⋯ menu handles thumbnail + remove. */
function wireLoraCard(card, l, idx, arr) {
  const menuBtn = card.querySelector('.lc-menu');
  ['pointerdown', 'pointerup', 'pointercancel'].forEach((type) => {
    menuBtn.addEventListener(type, (event) => event.stopPropagation());
  });
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openActionMenu(menuBtn, [
      { label: 'Set thumbnail', icon: 'image', action: () => setLoraThumb(l.name) },
      { label: loraTriggerPhrase(l) ? `Trigger: ${loraTriggerPhrase(l)}` : 'Add trigger phrase', action: async () => {
        const value = await askText({
          title: 'LoRA trigger phrase',
          message: 'This phrase is highlighted in the prompt whenever the LoRA is active. Leave it blank to clear it.',
          confirmLabel: 'Save phrase',
          input: { label: 'Trigger word or phrase', value: loraTriggerPhrase(l), required: false, maxLength: 160 },
        });
        if (value == null) return;
        l.triggerPhrase = normalizeLoraTriggerPhrase(value);
        if (l.triggerPhrase) state.loraTriggers[l.name] = l.triggerPhrase;
        else delete state.loraTriggers[l.name];
        if (l.on) ensureLoraTriggerInPrompt(l);
        renderLoras();
        saveForm();
      } },
      { label: `Strength: ${Number(l.strength).toFixed(2)}`, action: async () => {
        const v = await askText({
          title: 'LoRA strength',
          confirmLabel: 'Set strength',
          input: { label: 'Strength · 0 to 2', value: l.strength, type: 'number' },
        });
        if (v == null) return;
        l.strength = Math.max(0, Math.min(2, Number(v) || 0));
        managedLoraChanged(l);
        renderLoras();
        saveForm();
      } },
      { label: l.managed === 'krea2-raw-turbo' ? 'Turn off Turbo LoRA'
        : ((l.managed === 'klein-outpaint-consistency' || l.managed === 'edit-workflow-auto') ? 'Turn off automatic LoRA' : 'Remove from stack'), danger: true, action: () => {
        demoteLoraTriggerInPrompt(l);
        if (l.managed === 'krea2-raw-turbo' || l.managed === 'klein-outpaint-consistency' || l.managed === 'edit-workflow-auto') {
          l.on = false;
          managedLoraChanged(l);
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
    if (e.target.closest('.lc-menu')) return;
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
      managedLoraChanged(l);
      saveForm();
      renderLoras(); // refresh badge formatting
      window.scrollTo(0, sy);
    } else if (!moved) {
      const wasOn = l.on === true;
      l.on = !l.on;
      if (!wasOn && l.on) ensureLoraTriggerInPrompt(l);
      else if (wasOn && !l.on) demoteLoraTriggerInPrompt(l);
      managedLoraChanged(l);
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
      managedLoraChanged(l);
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
      ensureLoraTriggerInPrompt(l);
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

function renderEditModelSummary() {
  const labels = {
    klein4: 'Klein 4B',
    klein9: 'Klein 9B',
    qwen: 'Qwen Edit',
    krea2: 'Krea2',
    krea2ref: 'Krea 2 Edit',
  };
  const outpaintSteps = state.editEngine === 'qwen' ? (state.qwenQuality === 'fast' ? 4 : 20)
    : ((state.editEngine === 'krea2' || state.editEngine === 'krea2ref') ? 8 : 4);
  const notes = editOutpaintActive() ? {
    klein4: `expand · ${outpaintSteps} steps`,
    klein9: `expand · ${outpaintSteps} steps`,
    qwen: `expand · ${outpaintSteps} steps`,
    krea2: `expand · ${outpaintSteps} steps`,
    krea2ref: `expand · ${outpaintSteps} steps`,
  } : {
    klein4: '4B · fast edits',
    klein9: '9B · higher fidelity',
    qwen: state.qwenQuality === 'fast' ? 'multi-reference · fast' : 'multi-reference · quality',
    krea2: 'fill · one reference',
    krea2ref: 'reference-guided · 8 steps',
  };
  $('#editEngineSelected').textContent = labels[state.editEngine] || labels.klein4;
  $('#editEngineNote').textContent = notes[state.editEngine] || notes.klein4;
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

function setEditModelExpanded(open) {
  const expand = open === true;
  const body = $('#editModelBody');
  $('#editModelPanel').classList.toggle('expanded', expand);
  body.inert = !expand;
  body.setAttribute('aria-hidden', String(!expand));
  $('#editModelHeader').setAttribute('aria-expanded', String(expand));
}
$('#editModelHeader').addEventListener('click', () => {
  setEditModelExpanded(!$('#editModelPanel').classList.contains('expanded'));
});

function videoDurationMax(engine) {
  if (engine === 'scail') return 60;
  if (engine === 'ltx') return 20;
  return 15;
}

function clampVideoDurationInput(input, engine) {
  const max = videoDurationMax(engine);
  const requested = Number(input.value);
  input.max = String(max);
  input.value = String(Math.max(1, Math.min(max, Number.isFinite(requested) ? requested : 5)));
  return max;
}

function syncVideoDurationLimit() {
  const durationInput = $('#vidDur');
  const max = clampVideoDurationInput(durationInput, state.vidEngine);
  $('#vidDurScrub').setAttribute('aria-valuemax', String(max));
  const longLtx = state.vidEngine === 'ltx' && Number(durationInput.value) > 15;
  $('#vidDurationHint').textContent = longLtx ? 'Long clip · slower, higher memory' : 'Video length';
  $('#durationPickerCopy').textContent = state.vidEngine === 'ltx'
    ? 'Seconds · up to 20 with LTX 2.3' : 'Seconds';
}

function syncAnimateDurationLimit() {
  const input = $('#animDur');
  clampVideoDurationInput(input, state.animEngine);
  $('#animDurVal').textContent = input.value;
  $('#animDurationHint').hidden = !(state.animEngine === 'ltx' && Number(input.value) > 15);
}

function updateVideoTuningSummary() {
  syncVideoDurationLimit();
  const durationInput = $('#vidDur');
  const duration = Number(durationInput.value) || 1;
  const motion = Number($('#vidFree').value) || 0;
  const motionVisible = !$('#vidFreeField').hidden;
  const summary = motionVisible ? `${duration}s · motion ${motion}` : `${duration}s`;
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
  if (!active) return;
  const horizontal = $('#' + wheelId).classList.contains('horizontal-duration-wheel');
  active.scrollIntoView(horizontal
    ? { inline: 'center', block: 'nearest', behavior: 'auto' }
    : { block: 'center', behavior: 'auto' });
}

function syncVideoValueWheelFromScroll(inputId, wheelId) {
  const input = $('#' + inputId);
  const wheel = $('#' + wheelId);
  const options = $$('#' + wheelId + ' .duration-wheel-option');
  if (!options.length) return;
  const horizontal = wheel.classList.contains('horizontal-duration-wheel');
  const wheelRect = wheel.getBoundingClientRect();
  const center = horizontal
    ? wheelRect.left + wheel.clientWidth / 2
    : wheelRect.top + wheel.clientHeight / 2;
  const nearest = options.reduce((best, option) => {
    const rect = option.getBoundingClientRect();
    const optionCenter = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    const distance = Math.abs(optionCenter - center);
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
  syncVideoDurationLimit();
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

function wireVideoScrubber(buttonId, inputId, onTap, { horizontal = false } = {}) {
  const button = $('#' + buttonId);
  const input = $('#' + inputId);
  let drag = null;
  button.addEventListener('pointerdown', (event) => {
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, value: Number(input.value), moved: false };
    button.classList.add('adjusting');
    try { button.setPointerCapture(event.pointerId); } catch { /* noop */ }
  });
  button.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    // Horizontal duration follows the visible number strip: drag toward the
    // larger values on the right to increase, and left to decrease.
    const distance = horizontal ? event.clientX - drag.x : drag.y - event.clientY;
    const delta = Math.round(distance / 10);
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
    const wheelDelta = horizontal && Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    setVideoScrubValue(input, Number(input.value) + (wheelDelta < 0 ? 1 : -1) * (Number(input.step) || 1));
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

wireVideoScrubber('vidDurScrub', 'vidDur', openDurationPicker, { horizontal: true });
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
$('#advDefaultsBtn').addEventListener('click', () => {
  setSettingsTab('defaults');
  $('#settingsBtn').click();
});

const generationResetControls = {
  seedInput: 'seed',
  stepsInput: 'steps',
  cfgInput: 'cfg',
  batchInput: 'batch',
  denoiseInput: 'denoise',
};
Object.entries(generationResetControls).forEach(([id, key]) => {
  const control = $('#' + id);
  let lastTouchTap = 0;
  control.dataset.defaultReset = key;
  control.title = 'Double-tap to reset to your default';
  control.addEventListener('dblclick', (event) => {
    event.preventDefault();
    resetGenerationControl(control);
  });
  control.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    const now = performance.now();
    if (now - lastTouchTap < 360) {
      event.preventDefault();
      resetGenerationControl(control);
      lastTouchTap = 0;
    } else {
      lastTouchTap = now;
    }
  });
  control.addEventListener('change', () => {
    captureGenerationTuning();
    renderKrea2Mode();
    saveForm();
  });
});
$('#stepsInput').addEventListener('input', renderKrea2Mode);

/* ---- LoRA presets (stored server-side, shared across devices) ---- */
let presetSaveLoras = [];
let presetSaveThumbnail = '';

function closeLoraPresetSaveSheet() {
  $('#loraPresetSaveSheet').classList.remove('show');
  presetSaveLoras = [];
  presetSaveThumbnail = '';
}

function openLoraPresetSaveSheet() {
  presetSaveLoras = curLoras().filter((l) => l.name);
  if (!presetSaveLoras.length) return toast('Add at least one LoRA first', true);
  presetSaveThumbnail = presetSaveLoras[0].name;
  $('#loraPresetName').value = '';
  $('#loraPresetSaveError').hidden = true;
  const choices = $('#loraPresetThumbChoices');
  choices.innerHTML = '';
  presetSaveLoras.forEach((lora, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lora-preset-thumb-choice' + (index === 0 ? ' active' : '');
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(index === 0));
    button.innerHTML = `${loraThumbHtml(lora.name, 'preset-thumb')}<span>${escapeHtml(prettyLora(lora.name))}</span>`;
    button.addEventListener('click', () => {
      presetSaveThumbnail = lora.name;
      [...choices.children].forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-checked', String(active));
      });
    });
    choices.appendChild(button);
  });
  $('#loraPresetSaveSheet').classList.add('show');
  setTimeout(() => $('#loraPresetName').focus(), 80);
}

$('#loraSaveBtn').addEventListener('click', openLoraPresetSaveSheet);
$('#loraPresetSaveClose').addEventListener('click', closeLoraPresetSaveSheet);
$('#loraPresetSaveSheet').addEventListener('click', (event) => {
  if (event.target === $('#loraPresetSaveSheet')) closeLoraPresetSaveSheet();
});
$('#loraPresetSaveForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const loras = presetSaveLoras;
  if (!loras.length) return toast('Add at least one LoRA first', true);
  const name = $('#loraPresetName').value.trim();
  if (!name) {
    $('#loraPresetSaveError').textContent = 'Enter a preset name.';
    $('#loraPresetSaveError').hidden = false;
    return;
  }
  try {
    await api('/api/lorapresets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, thumbnailLora: presetSaveThumbnail, loras: loras.map((l) => ({ name: l.name, strength: l.strength, triggerPhrase: loraTriggerPhrase(l) })) }),
    });
    closeLoraPresetSaveSheet();
    toast(`Preset “${name.trim()}” saved`);
  } catch (e) { toast(e.message, true); }
});
async function renderLoraPresets() {
  const list = $('#loraPresetList');
  list.innerHTML = '';
  let presets = [];
  try { presets = (await api('/api/lorapresets')).presets; } catch (e) { toast(e.message, true); }
  if (!presets.length) {
    list.innerHTML = '<div class="queue-empty">No presets yet — build a LoRA stack and choose Save preset.</div>';
    return;
  }
  list.className = 'lora-preset-list';
  for (const pr of presets) {
    const row = document.createElement('div');
    row.className = 'lora-preset-card';
    row.insertAdjacentHTML('afterbegin', loraThumbHtml(pr.thumbnailLora || pr.loras[0]?.name, 'preset-thumb'));
    const lb = document.createElement('button');
    lb.type = 'button';
    lb.className = 'lora-preset-apply';
    lb.innerHTML = `<b>${escapeHtml(pr.name)}</b><small>${escapeHtml(pr.loras.map((l) => prettyLora(l.name)).join(', '))}</small>`;
    lb.addEventListener('click', () => {
      const arr = curLoras();
      arr.splice(0, arr.length, ...pr.loras.map((l) => {
        const triggerPhrase = normalizeLoraTriggerPhrase(l.triggerPhrase);
        if (triggerPhrase) state.loraTriggers[l.name] = triggerPhrase;
        return { name: l.name, strength: l.strength, triggerPhrase, on: true };
      }));
      arr.forEach((l) => ensureLoraTriggerInPrompt(l));
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
      if (!await askConfirm({ title: `Delete “${pr.name}”?`, message: 'The LoRAs themselves will not be removed.', confirmLabel: 'Delete preset', danger: true })) return;
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
  // Begin with one source image. Multi-reference engines reveal additional
  // slots only when requested, keeping this flow aligned with Create.
  const kreaEdit = state.editEngine === 'krea2';
  const maxSlots = kreaEdit || (OUTPAINT_EDIT_ENGINES.has(state.editEngine) && state.editOutpaint) ? 1 : state.refs.length;
  const populatedSlots = state.refs.reduce((highest, ref, index) => ref ? Math.max(highest, index + 1) : highest, 1);
  const requestedSlots = Math.max(1, Math.min(3, Math.round(Number(state.editRefSlots) || 1)));
  const visibleSlots = Math.max(1, Math.min(maxSlots, Math.max(requestedSlots, populatedSlots)));
  state.editRefSlots = visibleSlots;
  row.dataset.slots = String(visibleSlots);
  state.refs.slice(0, visibleSlots).forEach((ref, idx) => {
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
      slot.appendChild(img);
      const crop = document.createElement('button');
      crop.className = 'input-crop-action';
      crop.type = 'button';
      crop.setAttribute('aria-label', `Crop input image ${idx + 1}`);
      crop.title = `Crop input image ${idx + 1}`;
      crop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12"/></svg>';
      crop.addEventListener('click', (event) => {
        event.stopPropagation();
        openInputImageCrop(ref, (next) => {
          if (idx === 0) clearKreaMask(true);
          state.refs[idx] = next;
          renderRefs();
          saveForm();
        }, `Crop input image ${idx + 1}`);
      });
      slot.appendChild(crop);
      wireRefReorder(slot, idx, maxSlots);
    } else {
      slot.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2v-6Z"/></svg>');
      slot.addEventListener('click', () => pickRef(idx));
    }
    if (ref || idx > 0) {
      const remove = document.createElement('button');
      remove.className = 'ref-x';
      remove.type = 'button';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', idx ? `Remove input image slot ${idx + 1}` : 'Clear input image');
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        if (idx === 0) {
          state.refs[0] = null;
          clearKreaMask(true);
        } else {
          state.refs.splice(idx, 1);
          state.refs.push(null);
          state.editRefSlots = Math.max(1, state.editRefSlots - 1);
        }
        renderRefs();
        saveForm();
      });
      slot.appendChild(remove);
    }
    row.appendChild(slot);
  });
  const add = $('#addEditReference');
  if (add) add.hidden = visibleSlots >= maxSlots;
  if (state.view === 'edit') renderEditAspects();
  renderPromptComposer();
}

$('#addEditReference').addEventListener('click', () => {
  const maxSlots = state.editEngine === 'krea2' || editOutpaintActive() ? 1 : state.refs.length;
  if (state.editRefSlots >= maxSlots) return;
  state.editRefSlots += 1;
  renderRefs();
  saveForm();
});

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
    if (event.target.closest('.ref-x, .input-crop-action')) return;
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
  pickUpload('image/*', (file) => {
    state.refs[idx] = file;
    if (idx === 0) clearKreaMask(true);
    renderRefs();
    saveForm();
  }, `Choose reference image ${idx + 1}`);
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
  const options = arguments[2] || {};
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
    if (!options.preserveEngine || !['scail', 'ltx-edit'].includes(state.vidEngine)) {
      const chip = $('#vidEngineRow .chip[data-engine="scail"]');
      if (chip) chip.click();
    }
    renderVidDrive();
    updateVideoPanels();
    toast(state.vidEngine === 'ltx-edit'
      ? 'Source video loaded for LTX Edit'
      : 'Motion video loaded — add a source image and generate with SCAIL 2');
  } catch (e) { toast(e.message, true); }
}

async function galleryItemEditReference(item) {
  const blob = await (await fetch('/images/' + item.file)).blob();
  const buf = await blob.arrayBuffer();
  const res = await api('/api/upload', {
    method: 'POST',
    headers: { 'x-filename': encodeURIComponent(item.file) },
    body: buf,
  });
  return {
    name: res.name, url: '/images/' + item.file, srcItemId: item.id,
    w: item.width || 0, h: item.height || 0,
  };
}

async function useAsRef(item) {
  try {
    const capacity = state.editEngine === 'krea2' || editOutpaintActive() ? 1 : state.refs.length;
    const occupied = state.refs.slice(0, capacity)
      .map((reference, index) => ({ reference, index }))
      .filter(({ reference }) => reference);
    let targetIndex = 0;
    let replacing = false;
    if (occupied.length) {
      const emptyIndex = state.refs.slice(0, capacity).findIndex((reference) => !reference);
      const choices = occupied.map(({ index }) => ({
        value: `replace-${index}`,
        label: `Replace input ${index + 1}`,
        detail: index === 0 ? 'Replace the current source image' : `Replace reference ${index + 1}`,
      }));
      if (emptyIndex >= 0) choices.push({
        value: `add-${emptyIndex}`,
        label: `Add as input ${emptyIndex + 1}`,
        detail: 'Keep the current Edit inputs',
      });
      const defaultChoice = emptyIndex >= 0 ? `add-${emptyIndex}` : choices[0].value;
      const choice = await openAppDialog({
        title: 'Use image in Edit',
        message: 'Choose whether to replace an existing input or add another reference.',
        confirmLabel: 'Use image',
        defaultChoice,
        choices,
      });
      if (choice == null) return;
      const match = /^(replace|add)-(\d+)$/.exec(String(choice));
      if (!match) return;
      replacing = match[1] === 'replace';
      targetIndex = Math.max(0, Math.min(capacity - 1, Number(match[2]) || 0));
    }
    const reference = await galleryItemEditReference(item);
    if (targetIndex === 0) clearKreaMask(true);
    state.refs[targetIndex] = reference;
    state.editRefSlots = Math.max(1, Math.min(capacity, Math.max(state.editRefSlots, targetIndex + 1)));
    renderRefs();
    closeLightbox();
    setView('edit');
    saveForm();
    toast(replacing ? `Replaced input ${targetIndex + 1}` : `Added as input ${targetIndex + 1}`);
  } catch (e) { toast(e.message, true); }
}

async function useGalleryItemAsGuide(item, mode = 'image') {
  try {
    await setCreateImageGuideAsset(await galleryItemEditReference(item), mode);
    closeLightbox();
    state.createMode = 'image';
    setView('image');
    toast(mode === 'depth' ? 'Added as a depth guide' : 'Added as an image guide');
  } catch (error) { toast(error.message, true); }
}

function galleryImageDestinationActions(item, { includeReuse = true } = {}) {
  return [
    { label: 'Edit', detail: 'Use as an Edit reference', icon: 'edit', tone: 'edit', action: () => useAsRef(item) },
    { label: 'Image guide', detail: 'Start an image-to-image generation', icon: 'first-frame', tone: 'reuse', action: () => useGalleryItemAsGuide(item, 'image') },
    { label: 'Depth guide', detail: 'Preserve camera and scene structure', icon: 'depth', tone: 'reuse', action: () => useGalleryItemAsGuide(item, 'depth') },
    { label: 'First frame', detail: 'Start a video here', icon: 'first-frame', tone: 'video', action: () => sendToVideoTab(item, 'start') },
    { label: 'Last frame', detail: 'End a video here', icon: 'last-frame', tone: 'video', action: () => sendToVideoTab(item, 'end') },
    includeReuse ? { label: 'Reuse', detail: 'Load generation settings', icon: 'reuse', tone: 'reuse', action: () => reuseItem(item) } : null,
  ].filter(Boolean);
}

async function continueEditingResult(item) {
  try {
    toast('Loading edit result…');
    const nextReference = await galleryItemEditReference(item);
    clearKreaMask(true);
    state.refs[0] = nextReference;
    renderRefs();
    closeLightbox();
    setView('edit');
    toast('Edit result is now the source image');
  } catch (e) { toast(e.message, true); }
}

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

$('#seedDice').addEventListener('click', () => {
  $('#seedInput').value = '';
  captureGenerationTuning();
  saveForm();
  toast('Seed: random');
});
let livePreviewSwipe = null;
let livePreviewDismissTimer = null;
let lightboxContinueEditId = null;

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
$('#livePreviewImg').addEventListener('error', () => {
  $('#livePreviewImg').removeAttribute('src');
  $('#livePreviewImg').hidden = true;
  if (state.activeJobs.size) startLivePreviewSimulation();
});
$('#denoiseInput').addEventListener('input', () => {
  $('#denoiseVal').textContent = Number($('#denoiseInput').value).toFixed(2);
});

/* Video tab: inline source-image attachment */
function renderVidAttach() {
  const has = !!state.vidRef;
  const editAnything = state.vidEngine === 'ltx-edit';
  const scail = state.vidEngine === 'scail';
  const canSuggestMotion = !editAnything && !scail && has;
  $('#vidAttachBtn').hidden = editAnything || has || !!state.vidFace;
  $('#vidAttachThumb').hidden = editAnything || !has;
  $('#vidMotionPromptRow').hidden = !canSuggestMotion;
  $('#vidInputsHint').hidden = false;
  syncVideoAutoMotionUi();
  if (has) {
    $('#vidAttachImg').src = state.vidRef.url;
    $('#vidAttachDims').textContent = `${state.vidRef.w} × ${state.vidRef.h} — aspect follows the image`;
  }
  if (typeof updateSwapChip === 'function') updateSwapChip();
  renderVidFace();
}

function syncVideoAutoMotionUi() {
  const armed = state.vidAutoMotionPrompt && !!state.vidRef
    && !['ltx-edit', 'scail'].includes(state.vidEngine);
  const toggle = $('#vidAutoMotionToggle');
  const action = $('#vidMotionPromptBtn');
  const label = $('#vidMotionPromptLabel');
  toggle.setAttribute('aria-checked', String(state.vidAutoMotionPrompt));
  toggle.setAttribute('aria-label', state.vidAutoMotionPrompt
    ? 'Automatic motion prompting on'
    : 'Automatic motion prompting off');
  action.classList.toggle('auto-armed', armed);
  action.setAttribute('aria-label', armed
    ? 'Automatic motion prompting is armed for the next generation'
    : 'Create a motion prompt from this first frame');
  action.title = armed
    ? 'Auto armed — the start frame and your prompt will be combined when you generate'
    : 'Create a motion prompt from this first frame';
  if (!action.classList.contains('is-loading')) label.textContent = armed ? 'Auto motion armed' : 'Motion prompt';
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
  // Face ID + audio = frozen-audio lipsync: the joint AV denoise conforms the
  // face to the locked recording. Make the audio chip say so.
  const audioTitle = $('#vidAudioChip [data-audio-title]');
  const audioDetail = $('#vidAudioChip [data-audio-detail]');
  if (audioTitle && audioDetail) {
    const hasAudio = !!state.vidAudio;
    if (faceMode) {
      audioTitle.textContent = hasAudio ? 'Voice locked · lipsync' : 'Your voice';
      audioDetail.textContent = hasAudio
        ? 'Lips will follow this recording'
        : 'Optional · lipsync to a recording';
    } else {
      audioTitle.textContent = hasAudio ? 'Audio added' : 'Audio';
      audioDetail.textContent = hasAudio ? 'Tap to remove or replace' : 'Optional soundtrack';
    }
  }
  const labels = { ltx: 'LTX 2.3', 'ltx-edit': 'LTX Edit', eros: '10Eros DMD', wan: 'Wan 2.2', scail: 'SCAIL 2' };
  const notes = {
    ltx: faceMode
      ? (state.vidAudio ? 'Face ID · lipsync to your voice' : 'Face ID · 24 fps · voice optional')
      : '25 fps · audio',
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
$('#vidFaceCrop').addEventListener('click', (event) => {
  event.stopPropagation();
  if (!state.vidFace) return;
  openInputImageCrop(state.vidFace, (next) => {
    state.vidFace = next;
    renderVidAttach();
    saveForm();
  }, 'Crop Face ID image');
});
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
      const next = await askText({ title: 'Rename face', confirmLabel: 'Rename', input: { label: 'Face name', value: face.name, maxLength: 40 } });
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
    del.innerHTML = actionIconMarkup('delete');
    del.setAttribute('aria-label', `Delete ${face.name}`);
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!await askConfirm({ title: `Delete ${face.name}?`, message: 'This removes the saved Face ID reference.', confirmLabel: 'Delete face', danger: true })) return;
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
    const chosen = await askText({ title: 'Name this face', confirmLabel: 'Save face', input: { label: 'Face name', value: suggested, maxLength: 40 } });
    if (chosen == null) return;
    const name = chosen.trim() || 'Face';
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
$('#vidAttachCrop').addEventListener('click', (event) => {
  event.stopPropagation();
  if (!state.vidRef) return;
  openInputImageCrop(state.vidRef, (next) => {
    state.vidRef = next;
    renderVidAttach();
    updateVideoPanels();
    saveForm();
  }, state.vidEngine === 'scail' ? 'Crop reference image' : 'Crop first frame');
});
$('#vidAttachX').addEventListener('click', () => {
  state.vidRef = null;
  renderVidAttach();
  updateVideoPanels();
  saveForm();
});
async function createMotionPromptFromFirstFrame({ automatic = false } = {}) {
  if (!state.vidRef || state.vidEngine === 'ltx-edit') return;
  const btn = $('#vidMotionPromptBtn');
  const label = $('#vidMotionPromptLabel');
  btn.disabled = true;
  btn.classList.add('is-loading');
  label.textContent = 'Reading frame';
  try {
    if (!automatic) toast('Reading the start frame…');
    const res = await api('/api/motionprompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageName: state.vidRef.name, prompt: promptDraft().trim() }),
    });
    if (!res.prompt) throw new Error('Vision model returned no usable motion prompt');
    state.prompts.video = res.prompt;
    setPromptDraft(res.prompt);
    updatePromptClear();
    saveForm();
    toast(automatic ? 'Motion prompt added automatically' : 'Motion prompt created from the start frame');
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    syncVideoAutoMotionUi();
  }
}
async function maybeCreateAutomaticMotionPrompt() {
  if (!state.vidAutoMotionPrompt || !state.vidRef || promptDraft().trim()
    || state.activeJobs.size || state.motionPromptRequestsPending) return;
  try {
    const queue = await refreshQueue();
    if ((queue.running || []).length || (queue.pending || []).length) return;
  } catch { return; }
  if (state.vidAutoMotionPrompt && state.vidRef && !promptDraft().trim()) {
    createMotionPromptFromFirstFrame({ automatic: true });
  }
}
$('#vidMotionPromptBtn').addEventListener('click', () => createMotionPromptFromFirstFrame());
$('#vidAutoMotionToggle').addEventListener('click', () => {
  state.vidAutoMotionPrompt = !state.vidAutoMotionPrompt;
  renderVidAttach();
  saveForm();
  if (state.vidAutoMotionPrompt) maybeCreateAutomaticMotionPrompt();
});
function pickVidRef() {
  pickUpload('image/*', (file) => {
    state.vidRef = file;
    renderVidAttach();
    updateVideoPanels();
    maybeCreateAutomaticMotionPrompt();
    saveForm();
  }, 'Choose first frame');
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
  $('#vidInputsHint').textContent = scail ? 'Motion video + reference image' : 'Tap to add · hold frames to move';
  $('#vidAttachTitle').textContent = scail ? 'Reference image' : 'First frame';
  $('#vidAttachFilledTitle').textContent = scail ? 'Reference image' : 'First frame';
  $('#vidAttachImg').alt = scail ? 'Reference image preview' : 'First frame preview';
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
    saveForm();
  });
});
$('#vidDriveX').addEventListener('click', () => {
  state.vidDrive = null;
  $('#vidDriveVideo').removeAttribute('src');
  $('#vidDriveTrimChip').classList.remove('active');
  renderVidDrive();
  saveForm();
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
$('#vidDriveVideo').addEventListener('play', () => setTrimPlaybackIcon($('#driveTrimPlay'), true));
$('#vidDriveVideo').addEventListener('pause', () => setTrimPlaybackIcon($('#driveTrimPlay'), false));
$('#vidDriveVideo').addEventListener('ended', () => setTrimPlaybackIcon($('#driveTrimPlay'), false));
/* Expand the motion-video thumb into a full-width inline preview */
$('#vidDriveExpand').addEventListener('click', () => {
  const th = $('#vidDriveThumb');
  const v = $('#vidDriveVideo');
  const on = th.classList.toggle('expanded');
  v.controls = on;
  $('#vidDriveExpand').innerHTML = on
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9H4V4M15 9h5V4M15 15h5v5M9 15H4v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  $('#vidDriveExpand').setAttribute('aria-label', on ? 'Collapse preview' : 'Expand preview');
});
$('#driveTrimPlay').addEventListener('click', () => {
  const dv = $('#vidDriveVideo');
  const d = state.vidDrive;
  if (!d) return;
  if (dv.paused) {
    if (d.dur) try { dv.currentTime = d.trimStart; } catch { /* noop */ }
    dv.play();
    setTrimPlaybackIcon($('#driveTrimPlay'), true);
  } else {
    dv.pause();
    setTrimPlaybackIcon($('#driveTrimPlay'), false);
  }
});

/* Extract the first frame of the trimmed motion video once, then route it to
   Edit, image-to-image, or depth guidance without asking for another upload. */
async function extractDriveFirstFrame() {
  const d = state.vidDrive;
  if (!d) throw new Error('Add a motion video first');
  const trimStart = Number(d.trimStart) || 0;
  if (d.firstFrame && Math.abs(Number(d.firstFrame.trimStart) - trimStart) < 0.001) return d.firstFrame;
  toast('Extracting first frame…');
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = d.url;
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('Could not read the video'));
  });
  const time = Math.max(0, Math.min(trimStart + 0.001, (video.duration || 1) - 0.05));
  await new Promise((resolve) => { video.onseeked = resolve; video.currentTime = time; });
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1;
  canvas.height = video.videoHeight || 1;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('Frame capture failed')),
    'image/png',
  ));
  const response = await api('/api/upload', {
    method: 'POST',
    headers: { 'x-filename': encodeURIComponent('motion_first_frame.png') },
    body: await blob.arrayBuffer(),
  });
  if (d.firstFrame?.url) try { URL.revokeObjectURL(d.firstFrame.url); } catch { /* noop */ }
  d.firstFrame = {
    name: response.name,
    url: URL.createObjectURL(blob),
    w: canvas.width,
    h: canvas.height,
    label: 'Motion video first frame',
    trimStart,
  };
  return d.firstFrame;
}

async function useDriveFirstFrame(destination) {
  try {
    const frame = await extractDriveFirstFrame();
    if (destination === 'edit') {
      const slot = state.refs.findIndex((ref) => !ref);
      state.refs[slot === -1 ? 0 : slot] = Object.assign({}, frame);
      renderRefs();
      setView('edit');
      toast('First frame added to Edit');
      return;
    }
    await setCreateImageGuideAsset(frame, destination === 'depth' ? 'depth' : 'image');
    toast(destination === 'depth'
      ? 'First frame added as a depth guide'
      : 'First frame added as an image guide');
  } catch (error) {
    toast(error.message, true);
  }
}

$('#vidDriveFrameChip').addEventListener('click', () => {
  openActionMenu($('#vidDriveFrameChip'), [
    { label: 'Edit image', detail: 'Add as an Edit reference', icon: 'edit', tone: 'edit', action: () => useDriveFirstFrame('edit') },
    { label: 'Image guide', detail: 'Start an image-to-image generation', icon: 'first-frame', tone: 'reuse', action: () => useDriveFirstFrame('image') },
    { label: 'Depth guide', detail: 'Preserve camera and scene structure', icon: 'depth', tone: 'reuse', action: () => useDriveFirstFrame('depth') },
  ], { menuTitle: 'Use first frame', tone: 'image' });
});
$('#vidQuality').addEventListener('click', () => $('#vidQuality').classList.toggle('active'));
$('#animQuality').addEventListener('click', () => $('#animQuality').classList.toggle('active'));

const MODEL_ORDER_CONFIG = {
  editEngineRow: {
    orderKey: 'editEngineOrder',
    defaultKey: 'editEngineDefault',
    engines: EDIT_ENGINES,
    features: EDIT_FEATURES,
    kind: 'Edit',
  },
  vidEngineRow: {
    orderKey: 'videoEngineOrder',
    defaultKey: 'videoEngineDefault',
    engines: VIDEO_ENGINES,
    features: VIDEO_FEATURES,
    kind: 'Video',
  },
};
let modelOrderDrag = null;

function modelOrderButtons(rowId, visibleOnly = false) {
  return $$(`#${rowId} .chip[data-engine]`).filter((button) => !visibleOnly || !button.hidden);
}

function firstEnabledModel(config) {
  return normalizeEngineOrder(state[config.orderKey], config.engines)
    .find((engine) => featureEnabled(config.features[engine]));
}

function syncModelOrderDefault(rowId) {
  const config = MODEL_ORDER_CONFIG[rowId];
  if (!config) return;
  const fallback = firstEnabledModel(config) || state[config.orderKey][0];
  modelOrderButtons(rowId).forEach((button) => {
    const isDefault = button.dataset.engine === fallback;
    button.classList.toggle('model-default', isDefault);
    const label = button.textContent.trim();
    button.setAttribute('aria-label', isDefault ? `${label}, default model` : label);
    button.setAttribute('aria-roledescription', 'draggable model');
    button.title = isDefault ? `${label} · default for the next session` : 'Hold and drag to reorder';
  });
}

function applyEngineOrder(rowId, order) {
  const row = $(`#${rowId}`);
  const config = MODEL_ORDER_CONFIG[rowId];
  if (!row || !config) return;
  const buttons = new Map(modelOrderButtons(rowId).map((button) => [button.dataset.engine, button]));
  const fragment = document.createDocumentFragment();
  normalizeEngineOrder(order, config.engines).forEach((engine) => {
    const button = buttons.get(engine);
    if (button) fragment.appendChild(button);
  });
  row.appendChild(fragment);
  syncModelOrderDefault(rowId);
}

function applySavedEngineOrders() {
  if (modelOrderDrag) return;
  applyEngineOrder('editEngineRow', state.editEngineOrder);
  applyEngineOrder('vidEngineRow', state.videoEngineOrder);
}

function animateModelOrderLayout(row, mutate) {
  const before = new Map(modelOrderButtons(row.id).map((button) => [button, button.getBoundingClientRect()]));
  mutate();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  modelOrderButtons(row.id).forEach((button) => {
    const prior = before.get(button);
    const next = button.getBoundingClientRect();
    if (!prior || (!Math.round(prior.left - next.left) && !Math.round(prior.top - next.top))) return;
    button.animate([
      { transform: `translate3d(${prior.left - next.left}px, ${prior.top - next.top}px, 0)` },
      { transform: 'translate3d(0, 0, 0)' },
    ], { duration: 230, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

function preventModelOrderTouchScroll(event) {
  if (!modelOrderDrag || !modelOrderDrag.active) return;
  if (event.cancelable) event.preventDefault();
  window.scrollTo(0, modelOrderDrag.scrollY);
}

function beginModelOrderDrag(gesture) {
  if (!gesture || modelOrderDrag !== gesture || gesture.active) return;
  gesture.active = true;
  gesture.scrollY = window.scrollY;
  gesture.button.classList.add('model-order-source');
  gesture.row.classList.add('model-order-active');
  document.body.classList.add('model-order-dragging');
  document.addEventListener('touchmove', preventModelOrderTouchScroll, { passive: false, capture: true });
  const rect = gesture.button.getBoundingClientRect();
  const ghost = gesture.button.cloneNode(true);
  ghost.classList.remove('model-order-source');
  ghost.classList.add('model-order-ghost');
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.transform = 'translate3d(0,0,0) scale(1.04)';
  document.body.appendChild(ghost);
  gesture.ghost = ghost;
  const buttons = modelOrderButtons(gesture.row.id, true);
  gesture.slots = buttons.map((button) => {
    const slot = button.getBoundingClientRect();
    return { x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 };
  });
  gesture.slotIndex = buttons.indexOf(gesture.button);
  navigator.vibrate?.(8);
}

function cleanupModelOrderDrag(gesture) {
  if (!gesture || modelOrderDrag !== gesture) return;
  clearTimeout(gesture.timer);
  document.removeEventListener('touchmove', preventModelOrderTouchScroll, true);
  document.body.classList.remove('model-order-dragging');
  gesture.row.classList.remove('model-order-active');
  gesture.button.classList.remove('model-order-source');
  gesture.ghost?.remove();
  try { gesture.button.releasePointerCapture(gesture.pointerId); } catch { /* noop */ }
  modelOrderDrag = null;
}

function modelOrderSlotIndex(slots, clientX, clientY, currentIndex, hysteresis = 14) {
  if (!Array.isArray(slots) || !slots.length) return currentIndex;
  const distances = slots.map((slot) => Math.hypot(clientX - slot.x, clientY - slot.y));
  const candidate = distances.indexOf(Math.min(...distances));
  if (candidate === currentIndex || currentIndex < 0 || !slots[currentIndex]) return candidate;
  return distances[candidate] + hysteresis < distances[currentIndex] ? candidate : currentIndex;
}

function updateModelOrderDrag(gesture, event) {
  if (!gesture.active) return;
  if (event.cancelable) event.preventDefault();
  window.scrollTo(0, gesture.scrollY);
  if (gesture.ghost) {
    gesture.ghost.style.transform = `translate3d(${event.clientX - gesture.startX}px, ${event.clientY - gesture.startY}px, 0) scale(1.04)`;
  }
  const targetIndex = modelOrderSlotIndex(gesture.slots, event.clientX, event.clientY, gesture.slotIndex);
  if (targetIndex === gesture.slotIndex || targetIndex < 0) return;
  animateModelOrderLayout(gesture.row, () => {
    const remaining = modelOrderButtons(gesture.row.id, true).filter((button) => button !== gesture.button);
    const anchor = remaining[targetIndex];
    if (anchor) gesture.row.insertBefore(gesture.button, anchor);
    else gesture.row.appendChild(gesture.button);
  });
  gesture.slotIndex = targetIndex;
}

function persistModelOrder(rowId, announce = true) {
  const config = MODEL_ORDER_CONFIG[rowId];
  if (!config) return;
  const visible = modelOrderButtons(rowId, true).map((button) => button.dataset.engine);
  const hidden = modelOrderButtons(rowId).filter((button) => button.hidden).map((button) => button.dataset.engine);
  state[config.orderKey] = normalizeEngineOrder([...visible, ...hidden], config.engines);
  state[config.defaultKey] = state[config.orderKey][0];
  syncModelOrderDefault(rowId);
  saveForm();
  if (announce) {
    const first = $(`#${rowId} .chip[data-engine="${state[config.defaultKey]}"]`);
    toast(`${config.kind} default for next session: ${first?.textContent.trim() || state[config.defaultKey]}`);
  }
}

function finishModelOrderDrag(gesture) {
  if (!gesture || modelOrderDrag !== gesture) return;
  if (!gesture.active) {
    cleanupModelOrderDrag(gesture);
    return;
  }
  const order = modelOrderButtons(gesture.row.id).map((button) => button.dataset.engine);
  const changed = order.join('|') !== gesture.originalOrder.join('|');
  gesture.row.dataset.modelDragSuppress = 'true';
  setTimeout(() => gesture.row.removeAttribute('data-model-drag-suppress'), 0);
  cleanupModelOrderDrag(gesture);
  if (changed) persistModelOrder(gesture.row.id);
  else syncModelOrderDefault(gesture.row.id);
}

function cancelModelOrderDrag(gesture) {
  if (!gesture || modelOrderDrag !== gesture) return;
  const wasActive = gesture.active;
  cleanupModelOrderDrag(gesture);
  if (wasActive) applyEngineOrder(gesture.row.id, gesture.originalOrder);
}

function moveModelWithKeyboard(rowId, button, direction) {
  const row = $(`#${rowId}`);
  const buttons = modelOrderButtons(rowId, true);
  const index = buttons.indexOf(button);
  const target = buttons[index + direction];
  if (!row || index === -1 || !target) return;
  animateModelOrderLayout(row, () => {
    if (direction < 0) target.before(button);
    else target.after(button);
  });
  persistModelOrder(rowId);
  button.focus();
}

function wireModelOrder(rowId) {
  const row = $(`#${rowId}`);
  if (!row) return;
  row.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('.chip[data-engine]');
    if (!button || button.hidden || (event.button !== undefined && event.button !== 0) || modelOrderDrag) return;
    const gesture = {
      row,
      button,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollY: window.scrollY,
      originalOrder: modelOrderButtons(rowId).map((item) => item.dataset.engine),
      active: false,
      slots: [],
      slotIndex: -1,
      ghost: null,
    };
    gesture.timer = setTimeout(() => beginModelOrderDrag(gesture), 260);
    modelOrderDrag = gesture;
    try { button.setPointerCapture(event.pointerId); } catch { /* noop */ }
  });
  row.addEventListener('pointermove', (event) => {
    const gesture = modelOrderDrag;
    if (!gesture || gesture.row !== row || event.pointerId !== gesture.pointerId) return;
    if (!gesture.active && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 8) {
      cancelModelOrderDrag(gesture);
      return;
    }
    updateModelOrderDrag(gesture, event);
  });
  row.addEventListener('pointerup', (event) => {
    const gesture = modelOrderDrag;
    if (gesture && gesture.row === row && event.pointerId === gesture.pointerId) finishModelOrderDrag(gesture);
  });
  row.addEventListener('pointercancel', () => cancelModelOrderDrag(modelOrderDrag));
  row.addEventListener('keydown', (event) => {
    if (!event.shiftKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const button = event.target.closest('.chip[data-engine]');
    if (!button) return;
    event.preventDefault();
    moveModelWithKeyboard(rowId, button, ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
  });
  syncModelOrderDefault(rowId);
}

state.vidEngine = 'ltx';
state.animEngine = 'ltx';
function markEngineRow(rowId, engine) {
  $$(`#${rowId} .chip[data-engine]`).forEach((x) => x.classList.toggle('active', x.dataset.engine === engine));
}
function wireEngineRow(rowId, noteWork) {
  $$(`#${rowId} .chip[data-engine]`).forEach((c) => c.addEventListener('click', () => {
    if ($(`#${rowId}`).dataset.modelDragSuppress === 'true') return;
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
  $('#vidExtras').hidden = wan || scail || ltxEdit;
  // The Edit Anything workflow is trained on literal edit captions; do not
  // send those captions through the creative prompt enhancer.
  $('#enhanceBtn').hidden = ltxEdit;
  renderScailChunkControls();
  syncVideoDurationLimit();
  renderVidDrive();
  renderVidFace();
  updateVideoPanels();
  saveForm();
  setTimeout(() => setVideoModelExpanded(false), 120);
});
wireEngineRow('animEngineRow', (engine) => {
  state.animEngine = engine;
  const wan = engine === 'wan';
  $('#animFreeField').hidden = wan;
  $('#animQuality').hidden = !wan;
  $('#animSigmaRow').hidden = engine !== 'eros';
  $('#animExtras').hidden = wan;
  syncAnimateDurationLimit();
});
wireEngineRow('editEngineRow', (engine) => {
  captureGenerationTuning('edit');
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
wireModelOrder('vidEngineRow');
wireModelOrder('editEngineRow');
$('#editComposite').addEventListener('click', () => {
  const button = $('#editComposite');
  button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
  renderEditOutpaint();
  renderKreaMaskTools();
  saveForm();
});
$('#generateBtn').addEventListener('click', async () => {
  const prompt = promptForGeneration().trim();
  const outpaintActive = state.view === 'edit' && OUTPAINT_EDIT_ENGINES.has(state.editEngine) && state.editOutpaint;
  const hasRegionPrompts = state.view === 'create' && activeRegionsForRequest().some((r) => r.description);
  const qwenAngleExports = supportsCurrentEditAngles() && !state.editSequential && !hasEditMask()
    ? selectedQwenAngleViews() : [];
  const autoMotionPrompt = state.view === 'video'
    && state.vidAutoMotionPrompt
    && !!state.vidRef
    && !['ltx-edit', 'scail'].includes(state.vidEngine);
  const promptOptional = (state.view === 'video' && (state.vidEngine === 'scail' || autoMotionPrompt)) || outpaintActive;
  if (!prompt && !promptOptional && !hasRegionPrompts && !qwenAngleExports.length) return toast('Type a prompt first', true);
  if (qwenAngleExports.length && !state.refs[0]) return toast('Camera variations need a source image in reference slot 1', true);
  if (outpaintActive && !state.refs[0]) return toast('Expand needs a source image in reference slot 1', true);
  if (outpaintActive && !editOutpaintGeometry().valid) return toast('Reduce Source on canvas below 100%, or choose a different Resolution ratio', true);

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
    if (!(await ensureGenerationSetup())) return;
    let vidAudioName;
    if (state.vidAudio && (state.vidEngine === 'ltx' || state.vidEngine === 'eros')) {
      try { vidAudioName = await ensureAudioUploaded(state.vidAudio); }
      catch (e) { return toast('Audio upload failed: ' + e.message, true); }
    }
    const seedRaw = $('#seedInput').value.trim();
    const baseSeed = seedRaw === '' ? undefined : Number(seedRaw);
    const batch = Math.max(1, Math.min(8, Number($('#batchInput').value) || 1));
    const body = {
      prompt,
      autoMotionPrompt,
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
      seed: baseSeed,
    };
    try {
      setGenerating(true, 'Queued…');
      state.motionPromptRequestsPending += autoMotionPrompt ? batch : 0;
      $('#genLbl').textContent = genLabel();
      const requests = Array.from({ length: batch }, (_, index) => Object.assign({}, body, {
        seed: baseSeed == null ? undefined : baseSeed + index,
      }));
      const results = await Promise.all(requests.map(async (request) => {
        try {
          const result = await api('/api/animate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          });
          state.activeJobs.add(result.jobId);
          return result;
        } finally {
          if (request.autoMotionPrompt) state.motionPromptRequestsPending = Math.max(0, state.motionPromptRequestsPending - 1);
          $('#genLbl').textContent = genLabel();
        }
      }));
      $('#genLbl').textContent = genLabel();
      queueRefreshSoon();
      if (results.length > 1) toast(`${results.length} videos queued`);
    } catch (e) {
      setGenerating(false);
      toast(e.message, true);
    }
    return;
  }

  const mode = state.view === 'edit' ? 'edit' : 't2i';
  const sequenceSteps = mode === 'edit' && !outpaintActive && state.editSequential && SEQUENTIAL_EDIT_ENGINES.has(state.editEngine)
    ? sequentialEditPrompts(prompt)
    : [];
  if (state.editSequential && sequenceSteps.length < 2) {
    return toast('Sequential edits need at least two sentences', true);
  }
  if (!(await ensureGenerationSetup())) return;
  const createImageGuide = mode === 't2i' && state.createMode === 'image' ? state.createRef : null;
  const createImageGuideName = createImageGuide ? createGuideInput(createImageGuide).name : undefined;
  const krea2Raw = mode === 't2i' && state.createMode === 'image' && state.krea2Turbo === false;
  const seedRaw = $('#seedInput').value.trim();
  const nativePreserve = mode === 'edit'
    && !$('#editComposite').hidden
    && $('#editComposite').getAttribute('aria-pressed') === 'true';
  let maskImageName = '';
  if (mode === 'edit' && supportsCurrentEditMask() && hasEditMask() && (!outpaintActive || nativePreserve)) {
    if (!state.refs[0]) return toast(outpaintActive
      ? 'A preserve mask needs a source image in reference slot 1'
      : 'A localized edit needs a source image in reference slot 1', true);
    try { maskImageName = await ensureKreaMaskUploaded(); }
    catch (e) { return toast(e.message, true); }
  }
  const preserveMask = outpaintActive && !!maskImageName;
  const localizedEdit = !outpaintActive && !!maskImageName;
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
    qwenQuality: mode === 'edit' && state.editEngine === 'qwen' ? state.qwenQuality : undefined,
    krea2Turbo: !krea2Raw,
    krea2RawTurboLora: krea2Raw ? state.krea2RawTurboLora : undefined,
    composite: mode === 'edit' ? nativePreserve : undefined,
    prompt: sequenceSteps.length ? sequenceSteps[0] : prompt,
    editOutpaint: outpaintActive || undefined,
    editOutpaintPosition: outpaintActive ? state.editOutpaintPosition : undefined,
    editOutpaintOffsetX: outpaintActive ? editOutpaintGeometry().offsetX : undefined,
    editOutpaintOffsetY: outpaintActive ? editOutpaintGeometry().offsetY : undefined,
    editOutpaintScale: outpaintActive ? state.editOutpaintScale : undefined,
    editOutpaintFeather: outpaintActive ? state.editOutpaintFeather : undefined,
    editOutpaintMaskOffset: outpaintActive ? state.editOutpaintMaskOffset : undefined,
    editOutpaintSourceWidth: outpaintActive && state.refs[0] ? state.refs[0].w : undefined,
    editOutpaintSourceHeight: outpaintActive && state.refs[0] ? state.refs[0].h : undefined,
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
      : (createImageGuide && state.createGuideMode !== 'depth' ? createDenoiseFromInfluence() : 1),
    seed: seedRaw === '' ? undefined : Number(seedRaw),
    loras: mode === 'edit' ? state.editLoras : state.loras,
    refImages: mode === 'edit'
      ? state.refs.slice(0, state.editEngine === 'krea2' || outpaintActive ? 1 : 3).filter(Boolean).map((r) => r.name)
      : [],
    imageName: createImageGuideName,
    imageGuideMode: createImageGuide ? state.createGuideMode : undefined,
    depthStrength: createImageGuide && state.createGuideMode === 'depth'
      ? Number((state.createDepthStrength / 100).toFixed(2)) : undefined,
    regions: activeRegionsForRequest(),
    maskImageName,
    editMaskMode: localizedEdit || preserveMask ? (state.kreaMaskKind || state.kreaMaskTool) : undefined,
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
      : (requests.length > 1 ? `Queueing ${requests.length} camera variations…` : 'Queued…'));
    const jobIds = [];
    for (const request of requests) {
      const res = await api('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      jobIds.push(res.jobId);
      state.activeJobs.add(res.jobId);
      if (res.sequenceId) state.activeJobSequences.set(res.jobId, res.sequenceId);
    }
    $('#genLbl').textContent = genLabel();
    queueRefreshSoon();
    if (jobIds.length > 1) toast(`${jobIds.length} camera variations queued`);
  } catch (e) {
    setGenerating(false);
    toast(e.message, true);
  }
});

function setGenerating(on, statusText) {
  if (on) {
    resetLivePreviewMotion();
    lightboxContinueEditId = null;
    $('#livePreviewImg').onclick = null;
    $('#liveStatusText').onclick = null;
    renderDesktopStageGenerating(statusText || 'Working…');
    $('#livePreview').classList.add('show');
    startLivePreviewSimulation(state.view === 'video' ? 'video' : 'image');
    $('#liveStatusText').innerHTML = `<span class="spin"></span> ${statusText || 'Working…'}`;
    $('#livePct').textContent = '';
    $('#livePct').title = '';
    $('#genFill').style.width = '0%';
  } else {
    if (!state.activeJobs.size && !state.motionPromptRequestsPending) {
      $('#genFill').style.width = '0%';
      $('#liveStatusText').textContent = 'Done';
      $('#livePct').textContent = '';
      $('#livePct').title = '';
      renderDesktopStage();
    }
    $('#genLbl').textContent = genLabel();
  }
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

state.queueProgress = {};
let queueRefreshAt = 0;
let queueDrag = null;

async function refreshQueue() {
  const q = await api('/api/queue');
  reconcileGenerationState(q);
  const total = (q.running || []).length + (q.pending || []).length + (q.finalizing || []).length;
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

function queueReorderRows() {
  return [...document.querySelectorAll('#queueList .queue-row[data-reorderable="true"]')];
}

function clearQueueDragClasses() {
  document.querySelectorAll('#queueList .queue-drag-over-before, #queueList .queue-drag-over-after')
    .forEach((row) => row.classList.remove('queue-drag-over-before', 'queue-drag-over-after'));
}

function preventQueueDragTouchScroll(event) {
  if (!queueDrag || !queueDrag.active) return;
  if (event.cancelable) event.preventDefault();
  if (queueDrag.scrollPanel && Number.isFinite(queueDrag.scrollTop)) {
    queueDrag.scrollPanel.scrollTop = queueDrag.scrollTop;
  }
}

function setQueueDragScrollLock(gesture, locked) {
  if (!gesture) return;
  if (locked) {
    const panel = gesture.row.closest('.sheet-panel');
    gesture.scrollPanel = panel;
    gesture.scrollTop = panel ? panel.scrollTop : 0;
    if (panel) panel.classList.add('queue-drag-scroll-lock');
    document.addEventListener('touchmove', preventQueueDragTouchScroll, { passive: false, capture: true });
    return;
  }
  document.removeEventListener('touchmove', preventQueueDragTouchScroll, true);
  if (gesture.scrollPanel) {
    gesture.scrollPanel.classList.remove('queue-drag-scroll-lock');
    if (Number.isFinite(gesture.scrollTop)) gesture.scrollPanel.scrollTop = gesture.scrollTop;
  }
  gesture.scrollPanel = null;
}

function cancelQueueDrag(gesture) {
  if (!gesture || queueDrag !== gesture) return;
  clearTimeout(gesture.timer);
  setQueueDragScrollLock(gesture, false);
  try { gesture.row.releasePointerCapture(gesture.pointerId); } catch { /* noop */ }
  if (gesture.ghost) gesture.ghost.remove();
  gesture.row.classList.remove('queue-drag-source');
  clearQueueDragClasses();
  queueDrag = null;
}

function updateQueueDragTarget(gesture, clientY) {
  clearQueueDragClasses();
  const target = queueReorderRows().find((row) => {
    if (row === gesture.row) return false;
    const rect = row.getBoundingClientRect();
    return clientY >= rect.top && clientY <= rect.bottom;
  });
  if (!target) {
    gesture.target = null;
    return;
  }
  const rect = target.getBoundingClientRect();
  const before = clientY < rect.top + rect.height / 2;
  gesture.target = { row: target, before };
  target.classList.add(before ? 'queue-drag-over-before' : 'queue-drag-over-after');
}

function beginQueueDrag(gesture) {
  if (!gesture || queueDrag !== gesture || gesture.active) return;
  gesture.active = true;
  setQueueDragScrollLock(gesture, true);
  gesture.row.classList.add('queue-drag-source');
  const rect = gesture.row.getBoundingClientRect();
  const ghost = gesture.row.cloneNode(true);
  ghost.classList.add('queue-drag-ghost', 'queue-drag-ghost-lifted');
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.appendChild(ghost);
  gesture.ghost = ghost;
}

function finishQueueDrag(gesture, clientY) {
  if (!gesture || queueDrag !== gesture) return;
  if (!gesture.active) return cancelQueueDrag(gesture);
  updateQueueDragTarget(gesture, clientY);
  const rows = queueReorderRows();
  const target = gesture.target;
  const current = rows.map((row) => row.dataset.jobId);
  const sourceIndex = current.indexOf(gesture.jobId);
  let order = current.slice();
  if (target && sourceIndex !== -1) {
    order.splice(sourceIndex, 1);
    let targetIndex = order.indexOf(target.row.dataset.jobId);
    if (targetIndex !== -1 && !target.before) targetIndex += 1;
    order.splice(Math.max(0, targetIndex), 0, gesture.jobId);
  }
  gesture.row.dataset.queueDragged = 'true';
  setTimeout(() => gesture.row.removeAttribute('data-queue-dragged'), 0);
  cancelQueueDrag(gesture);
  if (order.join('|') === current.join('|')) return;
  const rowById = new Map(rows.map((row) => [row.dataset.jobId, row]));
  const fragment = document.createDocumentFragment();
  order.forEach((id) => fragment.appendChild(rowById.get(id)));
  $('#queueList').insertBefore(fragment, $('#queueList').firstElementChild);
  submitQueueReorder(order);
}

function attachQueueDrag(row, job) {
  let gesture = null;
  row.dataset.reorderable = 'true';
  row.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('button, a, input, select, textarea')) return;
    if (queueDrag) return;
    gesture = {
      row,
      jobId: job.jobId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      timer: setTimeout(() => beginQueueDrag(gesture), 180),
      ghost: null,
      target: null,
      scrollPanel: null,
      scrollTop: null,
    };
    queueDrag = gesture;
    try { row.setPointerCapture(event.pointerId); } catch { /* noop */ }
  });
  row.addEventListener('pointermove', (event) => {
    if (!gesture || queueDrag !== gesture || event.pointerId !== gesture.pointerId) return;
    if (!gesture.active) {
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 8) cancelQueueDrag(gesture);
      return;
    }
    if (event.cancelable) event.preventDefault();
    if (gesture.scrollPanel && Number.isFinite(gesture.scrollTop)) gesture.scrollPanel.scrollTop = gesture.scrollTop;
    if (gesture.ghost) gesture.ghost.style.transform = `translate3d(0, ${event.clientY - gesture.startY}px, 0)`;
    updateQueueDragTarget(gesture, event.clientY);
  });
  row.addEventListener('pointerup', (event) => {
    if (gesture && event.pointerId === gesture.pointerId) finishQueueDrag(gesture, event.clientY);
  });
  row.addEventListener('pointercancel', () => cancelQueueDrag(gesture));
}

function applyQueueJobMapping(mapping) {
  for (const [oldId, newId] of Object.entries(mapping || {})) {
    if (state.activeJobs.has(oldId)) {
      state.activeJobs.delete(oldId);
      state.activeJobs.add(newId);
    }
    if (state.activeJobSequences.has(oldId)) {
      state.activeJobSequences.set(newId, state.activeJobSequences.get(oldId));
      state.activeJobSequences.delete(oldId);
    }
    if (state.queueProgress[oldId] != null) {
      state.queueProgress[newId] = state.queueProgress[oldId];
      delete state.queueProgress[oldId];
    }
    progressEta.move(oldId, newId);
    const composite = state.compositeJobs.get(oldId);
    if (composite) {
      state.compositeJobs.delete(oldId);
      state.compositeJobs.set(newId, composite);
    }
  }
}

function reconcileGenerationState(queue) {
  if (!JobReconciliation) return false;
  const plan = JobReconciliation.buildJobReconciliation(queue, {
    activeJobIds: [...state.activeJobs],
    activeJobSequences: state.activeJobSequences,
    compositeJobIds: [...state.compositeJobs.keys()],
    animatingItemIds: [...state.animating],
    upscalingItemIds: [...state.upscaling],
  });
  if (!plan.authoritative) return false;

  let changed = false;
  for (const migration of plan.migrations) {
    applyQueueJobMapping({ [migration.oldJobId]: migration.newJobId });
    changed = true;
  }
  for (const jobId of plan.staleJobIds) {
    state.activeJobs.delete(jobId);
    state.activeJobSequences.delete(jobId);
    delete state.queueProgress[jobId];
    progressEta.clear(jobId);
    changed = true;
  }
  for (const jobId of plan.staleCompositeJobIds) {
    state.compositeJobs.delete(jobId);
    changed = true;
  }
  for (const itemId of plan.staleAnimatingItemIds) {
    if (state.pendingGalleryRequests.has(`animate:${itemId}`)) continue;
    state.animating.delete(itemId);
    changed = true;
  }
  for (const itemId of plan.staleUpscalingItemIds) {
    if (state.pendingGalleryRequests.has(`upscale:${itemId}`)) continue;
    state.upscaling.delete(itemId);
    changed = true;
  }
  if (!changed) return false;

  if (!state.activeJobs.size && !state.motionPromptRequestsPending) {
    stopLivePreviewSimulation();
    setGenerating(false);
    $('#liveStatusText').textContent = 'Finished — check Library';
    $('#livePct').textContent = '';
    $('#livePct').title = '';
  } else {
    $('#genLbl').textContent = genLabel();
  }
  renderGrid();
  refreshGallery(true).catch(() => { /* noop */ });
  return true;
}

let generationResumePromise = null;
let generationResumeAt = 0;
function reconcileGenerationAfterResume() {
  if (document.hidden) return Promise.resolve();
  if (generationResumePromise) return generationResumePromise;
  const now = Date.now();
  if (now - generationResumeAt < 500) return Promise.resolve();
  generationResumeAt = now;
  generationResumePromise = refreshQueue()
    .catch(() => { /* keep local state when the server is unavailable */ })
    .finally(() => { generationResumePromise = null; });
  return generationResumePromise;
}

async function submitQueueReorder(order) {
  try {
    const result = await api('/api/queue/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    applyQueueJobMapping(result.mapping);
    toast('Queue order updated');
    await refreshQueue();
  } catch (error) {
    toast(error.message, true);
    try { await refreshQueue(); } catch { /* noop */ }
  }
}

function queueThumbnail(entry) {
  const thumb = document.createElement('span');
  const video = entry.kind === 'video';
  thumb.className = 'q-thumb' + (video ? ' video' : '') + (entry.kind === 'error' ? ' error' : '');
  thumb.setAttribute('aria-hidden', 'true');
  if (entry.thumbnail) {
    const image = document.createElement('img');
    image.src = entry.thumbnail;
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => image.remove());
    thumb.appendChild(image);
  }
  const icon = video
    ? '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="12" height="14" rx="2"/><path d="m15.5 10 5-3v10l-5-3Z"/></svg>'
    : '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="m5.5 17 4.5-5 3 3 2-2.5 3.5 4.5M8 8.5h.01"/></svg>';
  thumb.insertAdjacentHTML('beforeend', icon);
  return thumb;
}

function renderQueue(q) {
  renderQueueHealth(q.health);
  if (queueDrag) return;
  const list = $('#queueList');
  list.innerHTML = '';
  const rows = [
    ...(q.running || []).map((j) => ({ ...j, run: true })),
    ...(q.finalizing || []).map((j) => ({ ...j, run: true, finalizing: true })),
    ...(q.pending || []).map((j) => ({ ...j, run: false })),
  ];
  if (!rows.length) {
    list.innerHTML = '<div class="queue-empty">Queue is empty — nothing running.</div>';
  }
  const pending = q.pending || [];
  const canReorder = pending.length > 1 && pending.every((job) => job.reorderable === true);
  const hint = $('#queueReorderHint');
  if (hint) hint.hidden = !canReorder;
  const clearHistory = $('#queueClearHistoryBtn');
  if (clearHistory) clearHistory.disabled = !(q.history || []).length;
  for (const j of rows) {
    const row = document.createElement('div');
    row.className = 'queue-row';
    row.dataset.jobId = j.jobId;
    const st = document.createElement('span');
    st.className = 'q-state' + (j.run ? ' run' : '');
    st.dataset.jobId = j.jobId;
    const pct = state.queueProgress[j.jobId];
    const elapsed = j.elapsedMs != null ? formatDuration(j.elapsedMs) : '';
    st.textContent = j.finalizing ? 'Finalizing' : (j.run ? (pct != null ? pct + '%' : 'Running') : 'Queued');
    const lb = document.createElement('span');
    lb.className = 'q-label';
    lb.textContent = elapsed ? `${j.label} - ${elapsed}` : j.label;
    if (j.itemId) {
      row.classList.add('q-click');
      row.title = 'Open in Library';
      row.addEventListener('click', (event) => {
        if (event.target.closest('button, a')) return;
        if (row.dataset.queueDragged === 'true') return;
        openFromQueue(j.itemId, j.videoId);
      });
    }
    const x = document.createElement('button');
    x.className = 'q-cancel';
    x.textContent = '✕';
    x.hidden = !!j.finalizing;
    x.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!await askConfirm({
        title: j.run ? 'Stop this job?' : 'Remove queued job?',
        message: j.run ? 'The current generation will be interrupted.' : 'This generation will not run.',
        confirmLabel: j.run ? 'Stop job' : 'Remove job',
        danger: true,
      })) return;
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
    if (!j.run && canReorder) {
      const handle = document.createElement('span');
      handle.className = 'q-handle';
      handle.textContent = '⋮⋮';
      handle.setAttribute('aria-hidden', 'true');
      row.append(handle, queueThumbnail(j), st, lb, x);
      attachQueueDrag(row, j);
    } else {
      row.append(queueThumbnail(j), st, lb, x);
    }
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
      row.append(queueThumbnail(e), st, lb);
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
  if (!await askConfirm({ title: 'Hard reset ComfyUI?', message: 'This stops the active job, clears queued jobs, and unloads model memory.', confirmLabel: 'Hard reset', danger: true })) return;
  const btn = $('#queueResetBtn');
  btn.disabled = true;
  try {
    const res = await api('/api/queue/reset', { method: 'POST' });
    state.queueProgress = {};
    progressEta.reset();
    toast(`Hard reset complete${res.clearedJobs ? ` - ${res.clearedJobs} tracked job${res.clearedJobs === 1 ? '' : 's'} cleared` : ''}`);
    await refreshQueue();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
});

$('#queueClearHistoryBtn').addEventListener('click', async () => {
  const btn = $('#queueClearHistoryBtn');
  if (btn.disabled) return;
  if (!await askConfirm({ title: 'Clear queue history?', message: 'Gallery items will not be deleted.', confirmLabel: 'Clear history' })) return;
  btn.disabled = true;
  try {
    const result = await api('/api/queue/history/clear', { method: 'POST' });
    toast(`${result.cleared || 0} history item${result.cleared === 1 ? '' : 's'} cleared`);
    await refreshQueue();
  } catch (error) {
    toast(error.message, true);
    btn.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* SSE events                                                          */
/* ------------------------------------------------------------------ */

function generationPhaseText(d) {
  if (!(d && d.isSampling && d.phaseCount > 1)) return '';
  return `Stage ${d.phaseIndex} of ${d.phaseCount} · ${d.phaseLabel || 'Video pass'}`;
}

function renderGenerationProgress(d) {
  const localPct = Number.isFinite(Number(d.localPercent))
    ? Number(d.localPercent)
    : (d.max ? Math.round((d.value / d.max) * 100) : 0);
  const pct = Number.isFinite(Number(d.overallPercent)) ? Number(d.overallPercent) : localPct;
  const remainingMs = progressEta.update({
    jobId: d.jobId,
    value: d.value,
    max: d.max,
    nodeId: d.nodeId,
  });
  const etaText = remainingMs == null ? '' : ProgressEta.formatEtaRemaining(remainingMs);
  const phaseText = generationPhaseText(d);
  state.queueProgress[d.jobId] = pct;
  const st = document.querySelector(`.q-state[data-job-id="${d.jobId}"]`);
  if (st) {
    st.textContent = pct + '%';
    st.title = phaseText ? `${phaseText} · ${localPct}% through this pass` : '';
  }
  if (!state.activeJobs.has(d.jobId) && !isUpscaleJob(d.jobId)) return;
  $('#genFill').style.width = pct + '%';
  if (phaseText) $('#liveStatusText').innerHTML = `<span class="spin"></span> ${phaseText}`;
  $('#livePct').textContent = phaseText
    ? `${pct}% overall · ${localPct}% pass${etaText ? ` · ${etaText}` : ''}`
    : `${pct}%${etaText ? ` · ${etaText}` : ''}`;
  $('#livePct').title = etaText ? `Estimated completion ${etaText}` : '';
  $('#desktopStageProgress').hidden = false;
  $('#desktopStageProgress').querySelector('i').style.width = pct + '%';
  $('#desktopStageStatus').textContent = phaseText
    ? `${phaseText} · ${pct}% overall`
    : pct
      ? `Working · ${pct}%${etaText ? ` · ${etaText}` : ''}`
      : 'Working';
}

function renderGenerationStatus(d) {
  if (d.profileId && state.profile && d.profileId !== state.profile.id) return;
  const phaseText = generationPhaseText(d);
  if (d.kind === 'smartMask' && smartMaskRunning) setSmartMaskLoading(d.text || 'Finding selection…');
  if (state.activeJobs.has(d.jobId) || d.jobId === 'pre') {
    $('#liveStatusText').innerHTML = `<span class="spin"></span> ${phaseText || d.text}`;
    $('#desktopStageDims').textContent = phaseText || d.text || 'Working…';
    $('#desktopStageStatus').textContent = phaseText || d.text || 'Working…';
    if (d.isSampling === false) {
      $('#livePct').textContent = '';
      $('#livePct').title = '';
      $('#desktopStageProgress').hidden = true;
      const st = document.querySelector(`.q-state[data-job-id="${d.jobId}"]`);
      if (st) {
        st.textContent = /Decoding|Encoding|Saving|Upsampling|RTX/.test(d.text || '') ? 'Finalizing' : String(d.text || 'Working').replace(/\.{3}$/, '');
        st.title = d.text || '';
      }
    }
  }
}

function connectEvents() {
  const es = new EventSource('/api/events');
  es.onopen = () => { reconcileGenerationAfterResume(); };
  es.addEventListener('progress', (ev) => {
    renderGenerationProgress(JSON.parse(ev.data));
  });
  es.addEventListener('status', (ev) => {
    renderGenerationStatus(JSON.parse(ev.data));
  });
  es.addEventListener('preview', (ev) => {
    const d = JSON.parse(ev.data);
    if (state.activeJobs.size && (!d.jobId || state.activeJobs.has(d.jobId))) {
      // The compact progress card uses a stable simulation; real sampler
      // frames remain useful in the larger desktop stage.
      setDesktopStageMedia({ image: d.dataUrl });
    }
  });
  es.addEventListener('sequenceStep', (ev) => {
    const d = JSON.parse(ev.data);
    if (state.activeJobs.has(d.jobId)) {
      applyQueueJobMapping({ [d.jobId]: d.nextJobId });
      setGenerating(true, `Sequential edit ${d.nextStep} of ${d.total}…`);
    }
    toast(`Step ${d.completedStep} complete · running ${d.nextStep} of ${d.total}`);
    refreshGallery(true);
    queueRefreshSoon();
  });
  es.addEventListener('jobDone', (ev) => {
    const d = JSON.parse(ev.data);
    progressEta.clear(d.jobId);
    delete state.queueProgress[d.jobId];
    state.activeJobSequences.delete(d.jobId);
    const compositeJob = state.compositeJobs.get(d.jobId);
    if (state.activeJobs.has(d.jobId)) {
      state.activeJobs.delete(d.jobId);
      setGenerating(false);
      if (d.items && d.items.length) {
        const completedItem = d.items[0];
        showLivePreviewImage('/images/' + completedItem.file);
        $('#liveStatusText').textContent = 'Done — tap to view';
        $('#livePct').textContent = '';
        const open = () => {
          refreshGallery().then(() => {
            lightboxContinueEditId = completedItem.mode === 'edit' ? completedItem.id : null;
            openLightbox(completedItem.id);
          });
        };
        $('#livePreviewImg').onclick = open;
        $('#liveStatusText').onclick = open;
        toast(d.sequenceComplete ? '✓ Sequential edits complete' : '✓ Generated');
      }
    }
    refreshGallery(true).then(() => {
      if (d.items && d.items[0]) focusCompletedDesktopOutput(d.items[0].id, 'image');
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
    progressEta.clear(d.jobId);
    delete state.queueProgress[d.jobId];
    state.activeJobSequences.delete(d.jobId);
    state.compositeJobs.delete(d.jobId);
    if (state.activeJobs.has(d.jobId)) {
      state.activeJobs.delete(d.jobId);
      setGenerating(false);
    }
    showLivePreviewImage('/images/' + d.composite.file);
    $('#liveStatusText').textContent = `${d.composite.label || 'Composite'} saved — tap to view`;
    $('#livePct').textContent = '';
    const open = () => {
      refreshGallery(true).then(() => {
        setView('gallery');
        openLightbox(d.item.id, 'composite:' + d.composite.id);
      });
    };
    $('#livePreviewImg').onclick = open;
    $('#liveStatusText').onclick = open;
    refreshGallery(true).then(() => {
      focusCompletedDesktopOutput(d.item.id, 'image');
      open();
    });
    queueRefreshSoon();
    toast(`✓ ${d.composite.label || 'Composite'} saved`);
  });
  es.addEventListener('videoDone', (ev) => {
    const d = JSON.parse(ev.data);
    progressEta.clear(d.jobId);
    delete state.queueProgress[d.jobId];
    state.activeJobSequences.delete(d.jobId);
    state.animating.delete(d.item.id);
    const vids = d.item.videos || [];
    const newest = vids.length ? vids[vids.length - 1].id : 'image';
    if (state.activeJobs.has(d.jobId)) {
      // Video-tab job: show result in the dock thumbnail
      state.activeJobs.delete(d.jobId);
      setGenerating(false);
      showLivePreviewImage('/images/' + d.item.file);
      $('#liveStatusText').textContent = 'Video ready — tap to view';
      $('#livePct').textContent = '';
      const open = () => { refreshGallery().then(() => openLightbox(d.item.id, newest)); };
      $('#livePreviewImg').onclick = open;
      $('#liveStatusText').onclick = open;
    }
    toast('✓ Video ready');
    refreshGallery(true).then(() => {
      focusCompletedDesktopOutput(d.item.id, newest);
      if (state.currentItem && state.currentItem.id === d.item.id) {
        openLightbox(d.item.id, newest);
      }
    });
    queueRefreshSoon();
  });
  es.addEventListener('upscaleDone', (ev) => {
    const d = JSON.parse(ev.data);
    progressEta.clear(d.jobId);
    delete state.queueProgress[d.jobId];
    state.upscaling.delete(d.item.id);
    toast('✓ Upscaled');
    refreshGallery(true).then(() => {
      if (state.currentItem && state.currentItem.id === d.item.id) openLightbox(d.item.id);
    });
  });
  es.addEventListener('jobError', (ev) => {
    const d = JSON.parse(ev.data);
    progressEta.clear(d.jobId);
    delete state.queueProgress[d.jobId];
    state.activeJobSequences.delete(d.jobId);
    if (d.itemId) { state.upscaling.delete(d.itemId); state.animating.delete(d.itemId); }
    if (state.activeJobs.has(d.jobId)) {
      state.activeJobs.delete(d.jobId);
      setGenerating(false);
      if (!state.activeJobs.size) stopLivePreviewSimulation();
    }
    renderGrid();
    if (d.items && d.items.length) refreshGallery(true);
    showErrorDetail(d.message, d.kind === 'upscale' || d.operation === 'upscale' ? 'Upscale error' : 'Generation error');
    queueRefreshSoon();
  });
  es.addEventListener('queueReset', () => {
    state.activeJobs.clear();
    state.activeJobSequences.clear();
    state.compositeJobs.clear();
    state.animating.clear();
    state.upscaling.clear();
    state.queueProgress = {};
    progressEta.reset();
    stopLivePreviewSimulation();
    setGenerating(false);
    renderGrid();
    refreshGallery(true).catch(() => { /* noop */ });
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
    renderDesktopStage();
    updatePrivacyButton();
  } catch (e) { if (!soft) toast(e.message, true); }
}

function updatePrivacyButton() {
  const btn = $('#privacyBtn');
  if (!btn) return;
  btn.classList.toggle('unlocked', state.privateUnlocked);
  const label = state.privateUnlocked ? 'Hide locked folders' : 'Show locked folders';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = state.privateUnlocked
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M9 10V7a4 4 0 0 1 7.5-2"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
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
  const active = chips.find((folder) => folder.id === state.activeFolder) || chips[0];
  $('#folderPickerLabel').textContent = active.name;
  for (const f of chips) {
    const btn = document.createElement('button');
    btn.className = 'folder-chip' + (state.activeFolder === f.id ? ' active' : '');
    btn.type = 'button';
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', String(state.activeFolder === f.id));
    btn.innerHTML = `<span>${escapeHtml(f.name)}</span>${f.locked ? '<svg viewBox="0 0 24 24" aria-label="Locked"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' : ''}`;
    btn.classList.toggle('locked', !!f.locked);
    btn.addEventListener('click', async () => {
      if (f.locked && !state.privateUnlocked) {
        // Contents are hidden until unlocked — prompt for the gallery PIN
        await unlockPrivateGallery();
        if (!state.privateUnlocked) return;
      }
      state.activeFolder = f.id;
      closeFolderPicker();
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
}

function closeFolderPicker() {
  $('.folder-picker')?.classList.remove('open');
  $('#folderPickerTrigger')?.setAttribute('aria-expanded', 'false');
  $('#folderRow')?.setAttribute('aria-hidden', 'true');
  if ($('#folderRow')) $('#folderRow').inert = true;
}

$('#folderPickerTrigger')?.addEventListener('click', () => {
  const picker = $('.folder-picker');
  const open = !picker.classList.contains('open');
  closeFolderPicker();
  if (open) {
    picker.classList.add('open');
    $('#folderPickerTrigger').setAttribute('aria-expanded', 'true');
    $('#folderRow').setAttribute('aria-hidden', 'false');
    $('#folderRow').inert = false;
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.folder-picker')) closeFolderPicker();
});
$('#folderAddBtn')?.addEventListener('click', async () => {
  const name = await askText({ title: 'Create folder', confirmLabel: 'Create folder', input: { label: 'Folder name', maxLength: 60 } });
  if (name == null) return;
  try {
    await api('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    refreshGallery();
  } catch (e) { toast(e.message, true); }
});

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
  const targetId = await openAppDialog({
    title: `Merge ${f.name}`,
    message: 'Choose where its gallery items should move.',
    confirmLabel: 'Choose destination',
    defaultChoice: 'all',
    choices: [{ value: 'all', label: 'All', detail: 'Remove the folder without assigning another' }, ...others.map((folder) => ({ value: folder.id, label: folder.name, detail: folder.locked ? 'Locked folder' : '' }))],
  });
  if (targetId == null) return;
  const target = targetId === 'all' ? null : others.find((folder) => folder.id === targetId);
  if (!await askConfirm({
    title: `Merge ${f.name}?`,
    message: `Move everything ${target ? `into ${target.name}` : 'to All'} and remove the original folder.`,
    confirmLabel: 'Merge folder',
    danger: true,
  })) return;
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
  if (!await askConfirm({ title: `Delete ${f.name}?`, message: 'Images inside are kept and moved to All.', confirmLabel: 'Delete folder', danger: true })) return;
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

function galleryCardModelLabel(item) {
  if (!item) return '';
  if (item.mode === 't2i') return item.krea2Turbo === false ? 'Raw' : 'Turbo';
  return galleryImageModelLabel(item);
}

function itemHasLike(item) {
  return !!(item && (item.liked || (item.videos || []).some((video) => video && video.liked)));
}

function latestGalleryVideo(item) {
  const videos = Array.isArray(item && item.videos) ? item.videos : [];
  return videos.reduce((newest, video) => {
    if (!newest) return video;
    return Number(video.createdAt || 0) >= Number(newest.createdAt || 0) ? video : newest;
  }, null);
}

function latestDesktopStageItem() {
  return state.items.reduce((latest, item) => {
    if (!latest) return item;
    return itemActivity(item) >= itemActivity(latest) ? item : latest;
  }, null);
}

function focusCompletedDesktopOutput(itemId, media = 'image') {
  state.desktopReuseToken += 1;
  state.desktopItemId = null;
  state.desktopMediaId = 'image';
  state.desktopSettingsReady = false;
  state.desktopStageDismissed = false;
  const item = state.items.find((entry) => entry.id === itemId) || null;
  renderDesktopStage(item || undefined, item ? media : undefined);
  syncDesktopGallerySelection();
}

function setDesktopStageMedia({ image = '', video = '', poster = '' } = {}) {
  const img = $('#desktopStageImg');
  const vid = $('#desktopStageVideo');
  const empty = $('#desktopStageEmpty');
  if (!img || !vid || !empty) return;
  try { vid.pause(); } catch { /* noop */ }
  vid.hidden = true;
  img.hidden = true;
  empty.hidden = !!(image || video);
  if (video) {
    vid.poster = poster || '';
    if (vid.dataset.src !== video) {
      vid.dataset.src = video;
      vid.src = video;
      vid.load();
    }
    vid.hidden = false;
    if (desktopWorkspaceActive() && state.mediaPreferences.videoPreviews
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      vid.play().catch(() => { /* autoplay is an enhancement */ });
    }
  } else {
    vid.removeAttribute('src');
    vid.dataset.src = '';
    if (image) {
      img.src = image;
      img.hidden = false;
    }
  }
}

function desktopStageSelection() {
  if (state.desktopStageDismissed) return { item: null, media: null, selected: false };
  const selected = state.desktopItemId && state.items.find((item) => item.id === state.desktopItemId);
  if (!selected) {
    state.desktopItemId = null;
    state.desktopMediaId = 'image';
    state.desktopSettingsReady = false;
    return { item: latestDesktopStageItem(), media: null, selected: false };
  }
  const media = (selected.videos || []).some((video) => video.id === state.desktopMediaId)
    ? state.desktopMediaId
    : 'image';
  state.desktopMediaId = media;
  return { item: selected, media, selected: true };
}

function syncDesktopGallerySelection() {
  $$('#galleryGrid .card').forEach((card) => {
    const groupedIds = (card.dataset.groupItemIds || '').split(',').filter(Boolean);
    const itemMatches = card.dataset.id === state.desktopItemId || groupedIds.includes(state.desktopItemId);
    const mediaMatches = groupedIds.length > 1
      || (card.dataset.media || 'image') === (state.desktopMediaId || 'image');
    const active = desktopWorkspaceActive()
      && itemMatches
      && mediaMatches;
    card.classList.toggle('desktop-active', active);
    if (active) card.setAttribute('aria-current', 'true');
    else card.removeAttribute('aria-current');
  });
}

function desktopStageChoices(item) {
  if (!item) return [];
  const angles = angleGroupItems(item);
  const generations = generationGroupItems(item);
  const group = angles.length > 1 ? angles : (generations.length > 1 ? generations : [item]);
  const grouped = group.length > 1;
  const choices = [];
  group.forEach((groupItem, groupIndex) => {
    const imageFile = groupItem.upscaled || groupItem.file;
    if (imageFile) {
      choices.push({
        item: groupItem,
        media: 'image',
        src: '/images/' + imageFile,
        label: angles.length > 1
          ? angleViewLabel(groupItem)
          : (grouped ? `Generation ${groupIndex + 1}` : 'Image'),
        badge: angles.length > 1 ? angleViewGlyph(groupItem) : (grouped ? String(groupIndex + 1) : ''),
        video: false,
      });
    }
    (groupItem.videos || []).forEach((video, videoIndex) => {
      choices.push({
        item: groupItem,
        media: video.id,
        src: imageFile ? '/images/' + imageFile : '',
        label: grouped ? `Generation ${groupIndex + 1}, video ${videoIndex + 1}` : `Video ${videoIndex + 1}`,
        badge: 'play',
        video: true,
      });
    });
  });
  return choices;
}

function renderDesktopStagePicker(item, media = 'image') {
  const picker = $('#desktopStagePicker');
  if (!picker) return;
  const choices = desktopStageChoices(item);
  picker.innerHTML = '';
  picker.hidden = choices.length < 2;
  if (choices.length < 2) return;
  choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'desktop-stage-choice';
    const active = choice.item.id === item.id && choice.media === (media || 'image');
    button.classList.toggle('active', active);
    button.setAttribute('aria-label', choice.label);
    button.setAttribute('aria-pressed', String(active));
    button.title = choice.label;
    if (choice.src) {
      const image = document.createElement('img');
      image.src = choice.src;
      image.alt = '';
      image.loading = 'eager';
      button.appendChild(image);
    }
    const badge = document.createElement('span');
    badge.className = 'desktop-stage-choice-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = choice.video
      ? '<svg viewBox="0 0 20 20"><path d="m7.5 5.5 6 4.5-6 4.5Z"/></svg>'
      : escapeHtml(choice.badge);
    button.appendChild(badge);
    button.addEventListener('click', () => selectDesktopLibraryItem(choice.item, choice.media));
    picker.appendChild(button);
  });
}

function renderDesktopStage(item, mediaSel) {
  const open = $('#desktopStageOpen');
  if (!open) return;
  const resolved = item ? { item, media: mediaSel || 'image', selected: !!state.desktopItemId } : desktopStageSelection();
  item = resolved.item;
  const status = $('#desktopStageStatus');
  const progress = $('#desktopStageProgress');
  const info = $('#desktopStageInfo');
  const clear = $('#desktopStageClear');
  status.classList.remove('working');
  status.hidden = false;
  progress.hidden = true;
  progress.querySelector('i').style.width = '0%';
  if (!item) {
    open.disabled = true;
    info.disabled = true;
    clear.hidden = true;
    open.dataset.itemId = '';
    open.dataset.media = '';
    info.dataset.itemId = '';
    info.dataset.media = '';
    setDesktopStageMedia();
    $('#desktopStageTitle').textContent = 'Ready to create';
    status.textContent = 'Ready';
    $('#desktopStagePrompt').textContent = 'Choose a mode and describe what you want to make.';
    $('#desktopStageModel').textContent = 'Mix Studio';
    $('#desktopStageDims').textContent = 'Desktop workspace';
    renderDesktopStagePicker();
    renderDesktopStageActions();
    return;
  }
  const latestVideo = latestGalleryVideo(item);
  const selectedVideo = (item.videos || []).find((video) => video.id === resolved.media)
    || (resolved.media == null ? latestVideo : null);
  const imageFile = item.upscaled || item.file;
  const image = imageFile ? '/images/' + imageFile : '';
  open.disabled = false;
  info.disabled = false;
  clear.hidden = !resolved.selected;
  open.dataset.itemId = item.id;
  open.dataset.media = selectedVideo ? selectedVideo.id : 'image';
  info.dataset.itemId = item.id;
  info.dataset.media = selectedVideo ? selectedVideo.id : 'image';
  setDesktopStageMedia({
    image,
    video: selectedVideo ? '/videos/' + selectedVideo.file : '',
    poster: image,
  });
  const angleItems = angleGroupItems(item);
  const generationItems = generationGroupItems(item);
  const groupItems = angleItems.length > 1 ? angleItems : generationItems;
  const groupIndex = groupItems.findIndex((entry) => entry.id === item.id);
  $('#desktopStageTitle').textContent = selectedVideo
    ? (resolved.selected ? 'Selected video' : 'Latest video')
    : (angleItems.length > 1
      ? `${angleViewLabel(item)} · ${groupIndex + 1} of ${groupItems.length}`
      : (generationItems.length > 1
        ? `Generation ${groupIndex + 1} of ${groupItems.length}`
        : (resolved.selected ? (item.mode === 'edit' ? 'Selected edit' : 'Selected generation') : (item.mode === 'edit' ? 'Latest edit' : 'Latest generation'))));
  status.hidden = resolved.selected;
  status.textContent = resolved.selected ? '' : 'Latest output';
  $('#desktopStagePrompt').textContent = item.prompt || item.refinedPrompt || 'Untitled generation';
  $('#desktopStageModel').textContent = selectedVideo
    ? videoEngineLabel(selectedVideo.info && selectedVideo.info.engine)
    : (galleryImageModelLabel(item) || (item.mode === 'composite' ? 'Composite' : 'Image'));
  $('#desktopStageDims').textContent = item.width && item.height
    ? `${item.width} × ${item.height}`
    : new Date(itemActivity(item) || Date.now()).toLocaleDateString();
  renderDesktopStagePicker(item, selectedVideo ? selectedVideo.id : 'image');
  renderDesktopStageActions(item, selectedVideo, resolved.selected);
}

function renderDesktopStageGenerating(statusText = 'Working…') {
  const open = $('#desktopStageOpen');
  if (!open) return;
  state.desktopStageDismissed = false;
  open.disabled = true;
  $('#desktopStageInfo').disabled = true;
  open.dataset.itemId = '';
  open.dataset.media = '';
  $('#desktopStageInfo').dataset.itemId = '';
  $('#desktopStageInfo').dataset.media = '';
  $('#desktopStageClear').hidden = true;
  $('#desktopStageStatus').hidden = false;
  renderDesktopStageActions();
  setDesktopStageMedia();
  $('#desktopStageTitle').textContent = 'Creating new output';
  $('#desktopStageStatus').textContent = 'Working';
  $('#desktopStageStatus').classList.add('working');
  $('#desktopStagePrompt').textContent = promptDraft() || 'Your generation is in progress.';
  $('#desktopStageModel').textContent = state.view === 'video' ? videoEngineLabel(state.vidEngine) : (state.view === 'edit' ? editEngineLabel(state.editEngine) : 'Krea 2');
  $('#desktopStageDims').textContent = statusText;
  renderDesktopStagePicker();
  $('#desktopStageProgress').hidden = false;
  $('#desktopStageProgress').querySelector('i').style.width = '0%';
}

$('#desktopStageOpen').addEventListener('click', () => {
  const open = $('#desktopStageOpen');
  if (!open.dataset.itemId) return;
  openLightbox(open.dataset.itemId, open.dataset.media || 'image');
});

$('#desktopStageInfo').addEventListener('click', () => {
  const info = $('#desktopStageInfo');
  if (!info.dataset.itemId) return;
  openLightbox(info.dataset.itemId, info.dataset.media || 'image');
});

function renderDesktopStageActions(item, video, selected = false) {
  const actions = $('#desktopStageActions');
  if (!actions) return;
  actions.hidden = !selected || !item;
  if (!selected || !item) return;
  const liked = video ? !!video.liked : !!item.liked;
  const like = $('#desktopStageLike');
  like.classList.toggle('liked', liked);
  like.setAttribute('aria-pressed', String(liked));
  like.setAttribute('aria-label', video ? (liked ? 'Unlike selected video' : 'Like selected video') : (liked ? 'Unlike selected image' : 'Like selected image'));
  $('#desktopStageSave').setAttribute('aria-label', video ? 'Save selected video' : 'Save selected image');
  $('#desktopStageEdit').hidden = !!video || item.mode === 'composite';
  $('#desktopStageUpscale').hidden = !!video || item.mode === 'composite';
}

function activeDesktopStageMedia() {
  const item = state.desktopItemId && state.items.find((entry) => entry.id === state.desktopItemId);
  if (!item) return { item: null, video: null };
  return { item, video: (item.videos || []).find((entry) => entry.id === state.desktopMediaId) || null };
}

const DESKTOP_INPUT_STATE_KEYS = [
  'createMode', 'enhance', 'aspect', 'mp', 'width', 'height', 'customDims',
  'editAspectOverride', 'editAspect', 'editMp', 'editWidth', 'editHeight', 'editOutpaint', 'editOutpaintPosition', 'editOutpaintOffsetX', 'editOutpaintOffsetY', 'editOutpaintScale', 'editOutpaintFeather', 'editOutpaintMaskOffset',
  'editUpscaleEnabled', 'editUpscaleResolution', 'editUpscaleProfile', 'editUpscaleNoise', 'editUpscaleExpanded', 'editSequential',
  'createUpscaleEnabled', 'createUpscaleResolution', 'createUpscaleProfile', 'createUpscaleNoise', 'createUpscaleExpanded',
  'qwenAngles', 'qwenAnglesMode', 'qwenAngleElevations', 'qwenAngleDistances', 'qwenQuality',
  'prompts', 'loras', 'videoLoras', 'editLoras', 'editLorasByEngine', 'editEngine', 'refs',
  'createRef', 'createImageGuideOpen', 'createGuideMode', 'createMatchSource', 'createMatchNative',
  'createInfluence', 'createDepthStrength', 'createDepthPreview', 'createDepthPreviewShown', 'krea2Turbo', 'krea2RawTurboLora',
  'regions', 'activeRegionId', 'kreaMask', 'kreaMaskPreview', 'kreaMaskDirty', 'kreaMaskErase', 'kreaMaskTool', 'kreaMaskKind',
  'kreaBrush', 'kreaMaskFeather', 'editMaskInfluence', 'editMaskExpand', 'kreaMaskInvert', 'kreaMaskPoints',
  'kreaMaskPointForeground', 'kreaMaskPointDeleteMode', 'kreaMaskPreviewCutout', 'kreaMaskViewMode',
  'vidRef', 'vidEnd', 'vidDrive', 'vidFace', 'vidAudio', 'vidEngine', 'vidSigma', 'vidSmooth',
  'vidScailMode', 'vidScailStableTracking', 'vidScailChunkFrames', 'vidScailChunkOverlap', 'vidAutoMotionPrompt',
  'generationTuning',
];
const desktopInputHistory = { entries: [], index: -1, restoring: false };

function cloneGenerationSetup(value) {
  try { return structuredClone(value); }
  catch {
    if (Array.isArray(value)) return value.map(cloneGenerationSetup);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneGenerationSetup(item)]));
    return value;
  }
}

function captureDesktopInputSetup() {
  if (Object.prototype.hasOwnProperty.call(state.prompts, state.view)) state.prompts[state.view] = promptDraft();
  captureGenerationTuning(generationTuningMode());
  const values = {};
  DESKTOP_INPUT_STATE_KEYS.forEach((key) => { values[key] = cloneGenerationSetup(state[key]); });
  return {
    view: ['create', 'edit', 'video'].includes(state.view) ? state.view : 'create',
    values,
    controls: {
      seed: $('#seedInput').value,
      steps: $('#stepsInput').value,
      cfg: $('#cfgInput').value,
      batch: $('#batchInput').value,
      denoise: $('#denoiseInput').value,
      duration: $('#vidDur').value,
      motionFreedom: $('#vidFree').value,
      fourK: $('#vid4k').classList.contains('active'),
      quality: $('#vidQuality').classList.contains('active'),
    },
  };
}

function updateDesktopInputHistoryButtons() {
  const back = $('#desktopInputsBack');
  const forward = $('#desktopInputsForward');
  if (!back || !forward) return;
  back.disabled = desktopInputHistory.index <= 0;
  forward.disabled = desktopInputHistory.index < 0 || desktopInputHistory.index >= desktopInputHistory.entries.length - 1;
}

function checkpointDesktopInputSetup() {
  if (desktopInputHistory.restoring) return;
  const snapshot = captureDesktopInputSetup();
  if (desktopInputHistory.index < 0) {
    desktopInputHistory.entries = [snapshot];
    desktopInputHistory.index = 0;
  } else {
    desktopInputHistory.entries[desktopInputHistory.index] = snapshot;
    desktopInputHistory.entries.splice(desktopInputHistory.index + 1);
  }
  updateDesktopInputHistoryButtons();
}

function appendDesktopInputSetup() {
  if (desktopInputHistory.restoring) return;
  desktopInputHistory.entries.splice(desktopInputHistory.index + 1);
  desktopInputHistory.entries.push(captureDesktopInputSetup());
  desktopInputHistory.index = desktopInputHistory.entries.length - 1;
  if (desktopInputHistory.entries.length > 20) {
    desktopInputHistory.entries.shift();
    desktopInputHistory.index -= 1;
  }
  updateDesktopInputHistoryButtons();
}

function restoreDesktopInputSetup(snapshot) {
  if (!snapshot) return;
  desktopInputHistory.restoring = true;
  state.desktopReuseToken += 1;
  setView(snapshot.view, snapshot.view === 'create' ? { createMode: snapshot.values.createMode } : {});
  Object.entries(cloneGenerationSetup(snapshot.values)).forEach(([key, value]) => { state[key] = value; });
  const controls = snapshot.controls || {};
  $('#seedInput').value = controls.seed ?? '';
  $('#stepsInput').value = controls.steps ?? 1;
  $('#cfgInput').value = controls.cfg ?? 1;
  $('#batchInput').value = controls.batch ?? 1;
  $('#denoiseInput').value = controls.denoise ?? .4;
  $('#denoiseVal').textContent = Number($('#denoiseInput').value).toFixed(2);
  $('#vidDur').value = controls.duration ?? state.userDefaults.video.duration;
  $('#vidFree').value = controls.motionFreedom ?? state.userDefaults.video.motionFreedom;
  $('#vid4k').classList.toggle('active', controls.fourK === true);
  $('#vidQuality').classList.toggle('active', controls.quality === true);
  setPromptDraft(state.prompts[state.view] || '');
  markEngineRow('editEngineRow', state.editEngine);
  markEngineRow('vidEngineRow', state.vidEngine);
  syncNavigation();
  updatePromptClear();
  updateVideoPanels();
  renderRefs();
  renderEnhance();
  renderAspects();
  renderDims();
  renderLoras();
  renderEditUpscale();
  renderQwenAngleTool();
  renderCreateImageGuide();
  renderVidAttach();
  renderVidDrive();
  renderScailChunkControls();
  if (endFrameRefresh.vidEnd) endFrameRefresh.vidEnd();
  saveForm();
  desktopInputHistory.restoring = false;
  updateDesktopInputHistoryButtons();
}

function moveDesktopInputHistory(direction) {
  if (desktopInputHistory.index >= 0 && !desktopInputHistory.restoring) {
    desktopInputHistory.entries[desktopInputHistory.index] = captureDesktopInputSetup();
  }
  const next = desktopInputHistory.index + direction;
  if (next < 0 || next >= desktopInputHistory.entries.length) return;
  desktopInputHistory.index = next;
  restoreDesktopInputSetup(desktopInputHistory.entries[next]);
}

$('#desktopInputsBack').addEventListener('click', () => moveDesktopInputHistory(-1));
$('#desktopInputsForward').addEventListener('click', () => moveDesktopInputHistory(1));

function resetActiveGenerationForm() {
  const mode = state.view;
  if (mode === 'edit') {
    switchEditEngine(enabledEditEngines()[0] || state.editEngineDefault || 'klein4');
    markEngineRow('editEngineRow', state.editEngine);
    state.refs = [null, null, null];
    state.editRefSlots = 1;
    state.editLoras = [];
    state.editLorasByEngine[state.editEngine] = state.editLoras;
    state.editAspectOverride = false;
    state.editUpscaleEnabled = false;
    state.qwenAngles = [];
    state.qwenAngleElevations = [];
    state.qwenAngleDistances = [];
    clearKreaMask(true);
    state.generationTuning.edit = defaultGenerationTuning('edit');
    renderRefs();
    renderEditModelSummary();
    renderEditUpscale();
    renderQwenAngleTool();
  } else if (mode === 'video') {
    state.vidRef = null;
    state.vidEnd = null;
    state.vidDrive = null;
    state.vidFace = null;
    if (state.vidAudio) stopPreview();
    state.vidAudio = null;
    state.videoLoras = [];
    state.vidEngine = enabledVideoEngines()[0] || state.videoEngineDefault || 'ltx';
    $('#vidDriveVideo').removeAttribute('src');
    $('#vidDriveTrimChip').classList.remove('active');
    setAudioChipVisual($('#vidAudioChip'), false);
    $('#vidAudioTrim').hidden = true;
    $('#vidDur').value = state.userDefaults.video.duration;
    $('#vidFree').value = state.userDefaults.video.motionFreedom;
    state.generationTuning.video = defaultGenerationTuning('video');
    markEngineRow('vidEngineRow', state.vidEngine);
    renderVidAttach();
    renderVidDrive();
    if (endFrameRefresh.vidEnd) endFrameRefresh.vidEnd();
    updateVideoPanels();
  } else {
    state.loras = [];
    state.regions = [];
    state.activeRegionId = null;
    state.createRef = null;
    state.createMatchSource = false;
    state.createMatchNative = false;
    state.createGuideMode = 'image';
    state.createUpscaleEnabled = false;
    state.customDims = false;
    state.aspect = '1:1';
    state.mp = 1;
    state.krea2Turbo = true;
    state.generationTuning.create = defaultGenerationTuning('create');
    state.createMode = 'image';
    syncNavigation();
    renderCreateImageGuide();
  }
  if (Object.prototype.hasOwnProperty.call(state.prompts, mode)) state.prompts[mode] = '';
  setPromptDraft('');
  updatePromptClear();
  restoreGenerationTuning(generationTuningMode(mode));
  renderEnhance();
  renderAspects();
  renderDims();
  renderLoras();
  saveForm();
}

function clearDesktopStageSelection() {
  checkpointDesktopInputSetup();
  state.desktopReuseToken += 1;
  state.desktopItemId = null;
  state.desktopMediaId = 'image';
  state.desktopSettingsReady = false;
  state.desktopStageDismissed = true;
  resetActiveGenerationForm();
  appendDesktopInputSetup();
  renderDesktopStage();
  syncDesktopGallerySelection();
}

$('#desktopStageClear').addEventListener('click', clearDesktopStageSelection);
$('#desktopStageLike').addEventListener('click', () => {
  const { item, video } = activeDesktopStageMedia();
  if (!item) return;
  if (video) setVideoLiked(item, video, !video.liked);
  else toggleItemLike(item);
  setTimeout(() => renderDesktopStage(item, video ? video.id : 'image'), 0);
});
$('#desktopStageSave').addEventListener('click', () => {
  const { item, video } = activeDesktopStageMedia();
  if (!item) return;
  if (!video) return downloadItem(item, 'current');
  mirrorGalleryExport({ id: item.id, asset: 'video', videoId: video.id });
  const link = document.createElement('a');
  link.href = '/videos/' + video.file;
  link.download = generationDownloadStem(item, 'mix_studio') + '.mp4';
  link.click();
});
$('#desktopStageEdit').addEventListener('click', () => {
  const { item } = activeDesktopStageMedia();
  if (!item) return;
  openActionMenu($('#desktopStageEdit'), galleryImageDestinationActions(item), {
    menuTitle: 'Use image',
    tone: 'image',
  });
});
$('#desktopStageUpscale').addEventListener('click', () => {
  const { item } = activeDesktopStageMedia();
  if (item) openUpscaleSheet(item);
});

function generationMediaFilename(item, media = null) {
  if (media && media.file) return String(media.file);
  return String((item && (item.upscaled || item.file)) || 'untitled-generation');
}

function generationDisplayName(item, media = null) {
  return String((item && item.name) || generationMediaFilename(item, media));
}

function generationDownloadStem(item, fallback = 'generation') {
  const raw = String((item && item.name) || (item && item.prompt) || fallback).trim();
  return raw
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .slice(0, 64)
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || fallback;
}

function setGenerationNameInput(item, media = null) {
  const input = $('#lbTitle');
  const fallback = generationMediaFilename(item, media);
  const display = generationDisplayName(item, media);
  input.value = display;
  input.dataset.itemId = item.id;
  input.dataset.fallback = fallback;
  input.dataset.initialValue = display;
  input.disabled = false;
  input.setAttribute('aria-label', item.name ? `Rename ${item.name}` : `Name ${fallback}`);
}

async function saveGenerationNameInput(input) {
  const item = state.items.find((entry) => entry.id === input.dataset.itemId);
  if (!item) return;
  const initialValue = String(input.dataset.initialValue || '');
  const typed = input.value.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (typed === initialValue) return;
  const fallback = String(input.dataset.fallback || generationMediaFilename(item));
  const editToken = `${item.id}\u0000${fallback}\u0000${initialValue}`;
  const nextName = typed === fallback ? '' : typed;
  input.classList.add('saving');
  input.setAttribute('aria-busy', 'true');
  try {
    const updated = await api('/api/item/' + encodeURIComponent(item.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nextName }),
    });
    Object.assign(item, updated);
    if (state.currentItem && state.currentItem.id === item.id) Object.assign(state.currentItem, updated);
    const currentToken = `${input.dataset.itemId}\u0000${input.dataset.fallback}\u0000${input.dataset.initialValue}`;
    if (currentToken === editToken && input.value.replace(/\s+/g, ' ').trim().slice(0, 80) === typed) {
      const display = generationDisplayName(item, { file: fallback });
      input.value = display;
      input.dataset.initialValue = display;
    }
    renderGrid();
  } catch (error) {
    const currentToken = `${input.dataset.itemId}\u0000${input.dataset.fallback}\u0000${input.dataset.initialValue}`;
    if (currentToken === editToken && input.value.replace(/\s+/g, ' ').trim().slice(0, 80) === typed) {
      input.value = initialValue;
    }
    toast(error.message, true);
  } finally {
    input.classList.remove('saving');
    input.removeAttribute('aria-busy');
  }
}

$('#lbTitle').addEventListener('focus', (event) => {
  requestAnimationFrame(() => event.target.select());
});
$('#lbTitle').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.currentTarget.blur();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.currentTarget.value = event.currentTarget.dataset.initialValue || '';
    event.currentTarget.blur();
  }
});
$('#lbTitle').addEventListener('blur', (event) => saveGenerationNameInput(event.currentTarget));

function librarySearchText(it) {
  const folder = state.folders.find((entry) => entry.id === it.folder);
  const loras = (it.loras || []).map((lora) => lora && lora.name).filter(Boolean);
  const regions = (it.regions || []).flatMap((region) => [region && region.description, region && region.lora]).filter(Boolean);
  const videoText = (it.videos || []).flatMap((video) => {
    const info = (video && video.info) || {};
    return [info.engine, info.motionPrompt, info.refinedMotionPrompt];
  }).filter(Boolean);
  return [
    it.name,
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
  const eligible = state.items.filter((it) => {
    if (state.activeFolder !== 'all' && it.folder !== state.activeFolder) return false;
    const hasVideos = it.videos && it.videos.length;
    if (state.mediaFilter === 'videos' && !hasVideos) return false;
    if (state.mediaFilter === 'images' && hasVideos) return false;
    return matchesLibrarySearch(it, state.libraryQuery);
  });
  let arr = eligible.filter((it) => {
    if (state.likesOnly && !it.liked) {
      const videoLiked = (it.videos || []).some((video) => video && video.liked);
      if (!videoLiked) return false;
    }
    return true;
  });
  if (state.likesOnly) {
    const likedIds = new Set(arr.map((it) => it.id));
    const likedAngleGroups = new Set(arr.map((it) => it.angleGroupId).filter(Boolean));
    if (likedAngleGroups.size) {
      arr = eligible.filter((it) => likedIds.has(it.id)
        || (it.angleGroupId && likedAngleGroups.has(it.angleGroupId)));
    }
  }
  if (state.sortMode === 'old') arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  else if (state.sortMode === 'az') arr.sort((a, b) => (a.name || a.file || a.prompt || '').localeCompare(b.name || b.file || b.prompt || ''));
  else if (state.sortMode === 'active') arr.sort((a, b) => itemActivity(b) - itemActivity(a));
  else arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return arr;
}

/* Multi-angle Qwen exports are generated as separate jobs so each view has
   its own reliable result and settings, but they present as one gallery set. */
function galleryEntries(items) {
  const entries = [];
  const byGroup = new Map();
  items.forEach((item) => {
    const groupId = item.angleGroupId || item.generationGroupId;
    if (!groupId) {
      entries.push({ item, items: [item] });
      return;
    }
    const key = `${item.angleGroupId ? 'angle' : 'generation'}:${groupId}`;
    let entry = byGroup.get(key);
    if (!entry) {
      entry = {
        item,
        items: [item],
        angleGroupId: item.angleGroupId || null,
        generationGroupId: item.generationGroupId || null,
      };
      byGroup.set(key, entry);
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

function generationGroupItems(item) {
  if (!item || !item.generationGroupId) return [];
  return state.items
    .filter((candidate) => candidate.generationGroupId === item.generationGroupId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function angleViewLabel(item) {
  const angle = item && item.angleView;
  if (!angle) return 'Camera variation';
  if (angle.view) return QWEN_ANGLE_VIEWS.find((view) => view.id === angle.view)?.label || 'View';
  if (angle.elevation) return QWEN_ANGLE_ELEVATIONS.find((option) => option.id === angle.elevation)?.label || 'Height';
  if (angle.distance) return `${QWEN_ANGLE_DISTANCES.find((option) => option.id === angle.distance)?.label || 'Custom'} framing`;
  return 'Camera variation';
}

function angleViewGlyph(item) {
  return ({
    'front-left': '↖', front: '↑', 'front-right': '↗', left: '←', right: '→',
    'back-left': '↙', back: '↓', 'back-right': '↘',
  })[item && item.angleView && item.angleView.view]
    || (item && item.angleView && item.angleView.elevation ? '↕' : '□');
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
  if (currentEntry.generationGroupId) {
    const grouped = generationGroupItems(item);
    const groupedIndex = grouped.findIndex((candidate) => candidate.id === item.id);
    const withinGroup = grouped[groupedIndex + direction];
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

const PREVIEW_CACHE_PREFIX = 'mixstudio-image-previews-v1-';
const MAX_PREVIEW_CACHE_ITEMS = 250;
let previewCacheRun = null;
const previewCacheObjectUrls = new Set();
const previewCacheStatus = {
  state: 'off',
  completed: 0,
  total: 0,
  cached: 0,
  bytes: 0,
  signature: '',
  error: '',
};

function previewCacheAvailable() {
  return typeof window.caches !== 'undefined'
    && typeof window.createImageBitmap === 'function'
    && typeof window.Response === 'function';
}

function previewCacheName() {
  return PREVIEW_CACHE_PREFIX + (workspaceSessionProfileId || 'anonymous');
}

function galleryImageSource(item) {
  return '/images/' + item.file;
}

function galleryCacheSources(items = visibleItems()) {
  return [...new Set(items.filter((item) => item && item.file).map(galleryImageSource))]
    .slice(0, MAX_PREVIEW_CACHE_ITEMS);
}

function renderPreviewCacheStatus() {
  const status = $('#previewCacheStatus');
  const clear = $('#previewCacheClear');
  if (!status) return;
  const prefEnabled = state.mediaPreferences.previewCache;
  if (!prefEnabled) {
    status.textContent = 'Off · no background preview work';
    status.className = 'media-cache-status';
    if (clear) clear.disabled = previewCacheStatus.cached === 0;
    return;
  }
  if (!previewCacheAvailable()) {
    status.textContent = 'Unavailable in this browser';
    status.className = 'media-cache-status bad';
    if (clear) clear.disabled = true;
    return;
  }
  if (previewCacheStatus.state === 'running') {
    status.textContent = `Building compressed previews · ${previewCacheStatus.completed} of ${previewCacheStatus.total}`;
    status.className = 'media-cache-status running';
  } else if (previewCacheStatus.state === 'error') {
    status.textContent = previewCacheStatus.error || 'Preview cache paused';
    status.className = 'media-cache-status bad';
  } else if (previewCacheStatus.cached) {
    status.textContent = `${previewCacheStatus.cached} compressed preview${previewCacheStatus.cached === 1 ? '' : 's'} ready`;
    status.className = 'media-cache-status ready';
  } else {
    status.textContent = 'Ready · previews will build during idle time';
    status.className = 'media-cache-status';
  }
  if (clear) clear.disabled = previewCacheStatus.cached === 0 && !previewCacheRun;
}

function releasePreviewCacheObjectUrls() {
  previewCacheObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  previewCacheObjectUrls.clear();
}

async function compressedPreviewResponse(response) {
  if (!response.ok) return null;
  const bitmap = await window.createImageBitmap(await response.blob());
  const maxEdge = 640;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    bitmap.close?.();
    return null;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
  if (!blob) return null;
  return new Response(blob, { headers: { 'Content-Type': blob.type || 'image/webp' } });
}

function schedulePreviewCacheStep(run, delay = 120) {
  window.setTimeout(() => {
    const work = async () => {
    if (previewCacheRun !== run || !state.mediaPreferences.previewCache) return;
    if (document.hidden || navigator.onLine === false) {
      schedulePreviewCacheStep(run, 1200);
      return;
    }
    if (run.index >= run.sources.length) {
      previewCacheStatus.state = 'complete';
      previewCacheStatus.cached = run.cached;
      previewCacheStatus.bytes = run.bytes;
      previewCacheRun = null;
      renderPreviewCacheStatus();
      return;
    }
    const source = run.sources[run.index++];
    try {
      const existing = await run.cache.match(source);
      if (existing) {
        run.cached += 1;
        run.bytes += Number(existing.headers.get('content-length')) || 0;
      } else {
        const response = await fetch(source, { cache: 'no-store', signal: run.controller.signal });
        const compressed = await compressedPreviewResponse(response);
        if (compressed) {
          const bytes = await compressed.clone().arrayBuffer();
          await run.cache.put(source, compressed);
          run.cached += 1;
          run.bytes += bytes.byteLength;
        }
      }
    } catch (error) {
      if (previewCacheRun !== run) return;
      previewCacheStatus.state = 'error';
      previewCacheStatus.error = `Preview cache paused · ${error.message || 'storage error'}`;
      previewCacheRun = null;
      renderPreviewCacheStatus();
      return;
    }
    previewCacheStatus.completed = run.index;
    previewCacheStatus.cached = run.cached;
    previewCacheStatus.bytes = run.bytes;
    renderPreviewCacheStatus();
    schedulePreviewCacheStep(run);
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(work, { timeout: 1000 });
    else work();
  }, delay);
}

async function schedulePreviewCacheWarmup(items = visibleItems()) {
  if (!state.mediaPreferences.previewCache || !previewCacheAvailable()) {
    renderPreviewCacheStatus();
    return;
  }
  const sources = galleryCacheSources(items);
  const signature = sources.join('|');
  if (previewCacheRun && previewCacheRun.signature === signature) return;
  if (previewCacheStatus.state === 'complete' && previewCacheStatus.signature === signature) return;
  try {
    const cache = await window.caches.open(previewCacheName());
    if (!state.mediaPreferences.previewCache) return;
    const run = { cache, sources, signature, index: 0, cached: 0, bytes: 0, controller: new AbortController() };
    previewCacheRun = run;
    Object.assign(previewCacheStatus, { state: 'running', completed: 0, total: sources.length, cached: 0, bytes: 0, signature, error: '' });
    renderPreviewCacheStatus();
    schedulePreviewCacheStep(run, 300);
  } catch (error) {
    previewCacheStatus.state = 'error';
    previewCacheStatus.error = `Preview cache unavailable · ${error.message || 'storage error'}`;
    renderPreviewCacheStatus();
  }
}

function stopPreviewCacheWarmup() {
  previewCacheRun?.controller?.abort();
  previewCacheRun = null;
  previewCacheStatus.state = 'off';
  previewCacheStatus.completed = 0;
  previewCacheStatus.total = 0;
  previewCacheStatus.error = '';
  renderPreviewCacheStatus();
}

async function refreshPreviewCacheStatus() {
  if (!previewCacheAvailable()) {
    renderPreviewCacheStatus();
    return;
  }
  try {
    const cache = await window.caches.open(previewCacheName());
    previewCacheStatus.cached = (await cache.keys()).length;
  } catch { /* status remains useful even if storage is unavailable */ }
  renderPreviewCacheStatus();
}

async function clearPreviewCache() {
  stopPreviewCacheWarmup();
  releasePreviewCacheObjectUrls();
  try { await window.caches.delete(previewCacheName()); } catch { /* noop */ }
  previewCacheStatus.cached = 0;
  previewCacheStatus.signature = '';
  renderPreviewCacheStatus();
  if (state.view === 'gallery') renderGrid();
  toast('Compressed preview cache cleared');
}

function useCachedGalleryImage(target, source, property = 'src') {
  if (!state.mediaPreferences.previewCache || !previewCacheAvailable()) return;
  const request = {};
  target._previewCacheRequest = request;
  window.caches.open(previewCacheName()).then((cache) => cache.match(source)).then(async (response) => {
    if (!response) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (target._previewCacheRequest !== request || !target.isConnected) {
      URL.revokeObjectURL(url);
      return;
    }
    previewCacheObjectUrls.add(url);
    target[property] = url;
  }).catch(() => { /* fall back to the original image source */ });
}

let galleryPreviewObserver = null;
let galleryPreviewActive = new Set();
let galleryPreviewSettleTimer = null;
let galleryPreviewScrollTimer = null;
function galleryPreviewMotionAllowed() {
  return document.visibilityState === 'visible'
    && state.mediaPreferences.videoPreviews
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function pauseGalleryPreview(video, unloadDelay = 2800) {
  if (!video) return;
  video.pause();
  clearTimeout(video._previewUnloadTimer);
  video._previewUnloadTimer = setTimeout(() => {
    if (galleryPreviewActive.has(video) || !video.isConnected || video.dataset.loaded !== 'true') return;
    const rect = video.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) return;
    try { video.currentTime = 0; } catch { /* noop */ }
    video.removeAttribute('src');
    video.dataset.loaded = 'false';
    video.load();
  }, unloadDelay);
}
function playGalleryPreview(video) {
  if (!video || !galleryPreviewMotionAllowed()) return;
  clearTimeout(video._previewUnloadTimer);
  if (video.dataset.loaded !== 'true' && video.dataset.src) {
    video.src = video.dataset.src;
    video.dataset.loaded = 'true';
  }
  video.play().catch(() => { /* autoplay may be blocked */ });
}
function centeredGalleryPreviewRow(candidates, center) {
  const rows = [];
  candidates
    .map((video) => {
      const rect = video.getBoundingClientRect();
      return { video, rect, middle: rect.top + rect.height / 2 };
    })
    .sort((a, b) => a.middle - b.middle)
    .forEach((entry) => {
      const row = rows[rows.length - 1];
      const tolerance = row ? Math.max(12, Math.min(row.height, entry.rect.height) * .24) : 0;
      if (!row || Math.abs(entry.middle - row.middle) > tolerance) {
        rows.push({ videos: [entry.video], middle: entry.middle, height: entry.rect.height });
        return;
      }
      const count = row.videos.length;
      row.videos.push(entry.video);
      row.middle = (row.middle * count + entry.middle) / (count + 1);
      row.height = (row.height * count + entry.rect.height) / (count + 1);
    });
  if (!rows.length) return [];
  const best = rows.reduce((nearest, row) => (
    Math.abs(row.middle - center) < Math.abs(nearest.middle - center) ? row : nearest
  ));
  const current = rows.find((row) => row.videos.some((video) => galleryPreviewActive.has(video)));
  if (current) {
    const hysteresis = Math.max(18, current.height * .12);
    if (Math.abs(current.middle - center) <= Math.abs(best.middle - center) + hysteresis) return current.videos;
  }
  return best.videos;
}
function settleGalleryPreviewPlayback() {
  galleryPreviewSettleTimer = null;
  if (!galleryPreviewMotionAllowed() || state.view !== 'gallery') return;
  const center = window.innerHeight / 2;
  const candidates = $$('.gallery-card-video').filter((video) => {
    const rect = video.getBoundingClientRect();
    return rect.bottom > window.innerHeight * 0.16 && rect.top < window.innerHeight * 0.84;
  });
  const next = new Set(centeredGalleryPreviewRow(candidates, center));
  galleryPreviewActive.forEach((video) => {
    if (!next.has(video)) pauseGalleryPreview(video);
  });
  galleryPreviewActive = next;
  galleryPreviewActive.forEach(playGalleryPreview);
}
function scheduleGalleryPreviewPlayback(delay = 140) {
  clearTimeout(galleryPreviewSettleTimer);
  galleryPreviewSettleTimer = setTimeout(settleGalleryPreviewPlayback, delay);
}
function ensureGalleryPreviewObserver() {
  if (galleryPreviewObserver || !('IntersectionObserver' in window)) return;
  galleryPreviewObserver = new IntersectionObserver(() => scheduleGalleryPreviewPlayback(), {
    root: null,
    rootMargin: '-16% 0px -16% 0px',
    threshold: [0, 0.25, 0.5, 0.75],
  });
}
function resetGalleryPreviewObservation() {
  if (!galleryPreviewObserver) return;
  clearTimeout(galleryPreviewSettleTimer);
  galleryPreviewObserver.disconnect();
  galleryPreviewActive = new Set([...galleryPreviewActive].filter((video) => video.isConnected));
  $$('.gallery-card-video').forEach((video) => galleryPreviewObserver.observe(video));
  scheduleGalleryPreviewPlayback(180);
}

window.addEventListener('scroll', () => {
  if (state.view !== 'gallery' || !galleryPreviewMotionAllowed()) return;
  clearTimeout(galleryPreviewScrollTimer);
  galleryPreviewActive.forEach((video) => pauseGalleryPreview(video, 3600));
  galleryPreviewScrollTimer = setTimeout(() => scheduleGalleryPreviewPlayback(0), 150);
}, { passive: true });

const galleryDateScrub = {
  active: false,
  pointerId: null,
  index: 0,
  ratio: 0,
  groups: [],
  holdTimer: null,
  previewResumeTimer: null,
  ignoreScrollUntil: 0,
  trackTop: 0,
  trackHeight: 1,
  previewTarget: 0,
  previewFrame: 0,
  settleFrame: 0,
  dragOffsetY: 0,
  dragMoved: false,
  startX: 0,
  startY: 0,
};
let galleryDateScrollFrame = 0;

function galleryDateScrubberGroups() {
  return $$('#galleryGrid .gallery-date-divider').map((divider, index) => ({
    divider,
    index,
    label: (divider.textContent || '').trim(),
  }));
}

function setGalleryDateScrubberRatio(ratio, haptic = false) {
  const scrubber = $('#galleryDateScrubber');
  const label = $('#galleryDateScrubberLabel');
  const groups = galleryDateScrub.groups;
  if (!scrubber || !groups.length) return;
  const bounded = Math.max(0, Math.min(1, Number(ratio) || 0));
  const next = Math.round(bounded * Math.max(0, groups.length - 1));
  const changed = next !== galleryDateScrub.index;
  galleryDateScrub.index = next;
  galleryDateScrub.ratio = bounded;
  scrubber.style.setProperty('--gallery-scrub-ratio', String(bounded));
  scrubber.setAttribute('aria-valuenow', String(next));
  scrubber.setAttribute('aria-valuetext', groups[next].label);
  label.textContent = groups[next].label;
  if (haptic && changed && navigator.vibrate) navigator.vibrate(6);
}

function galleryDateLayoutTop(element) {
  let top = 0;
  let current = element;
  while (current) {
    top += current.offsetTop || 0;
    current = current.offsetParent;
  }
  return Math.max(0, top - 72);
}

function scrollGalleryToDate(index, behavior = 'smooth') {
  const group = galleryDateScrub.groups[index];
  if (!group) return;
  galleryDateScrub.ignoreScrollUntil = performance.now() + (behavior === 'smooth' ? 720 : 80);
  const target = galleryDateLayoutTop(group.divider);
  window.scrollTo({ top: Math.max(0, target), behavior });
}

function galleryDateScrollTarget(ratio) {
  const groups = galleryDateScrub.groups;
  if (!groups.length) return window.scrollY;
  const position = Math.max(0, Math.min(groups.length - 1, ratio * Math.max(0, groups.length - 1)));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const mix = position - lower;
  const targetFor = (index) => galleryDateLayoutTop(groups[index].divider);
  const start = targetFor(lower);
  const end = targetFor(upper);
  return start + (end - start) * mix;
}

function galleryDateRatioForScroll(scrollY = window.scrollY) {
  const groups = galleryDateScrub.groups;
  if (groups.length < 2) return 0;
  const targets = groups.map((group) => galleryDateLayoutTop(group.divider));
  if (scrollY <= targets[0]) return 0;
  if (scrollY >= targets[targets.length - 1]) return 1;
  for (let index = 0; index < targets.length - 1; index += 1) {
    if (scrollY > targets[index + 1]) continue;
    const span = Math.max(1, targets[index + 1] - targets[index]);
    const local = Math.max(0, Math.min(1, (scrollY - targets[index]) / span));
    return (index + local) / (targets.length - 1);
  }
  return 1;
}

function runGalleryDatePreviewScroll() {
  galleryDateScrub.previewFrame = 0;
  if (!galleryDateScrub.active) return;
  const delta = galleryDateScrub.previewTarget - window.scrollY;
  if (Math.abs(delta) > 0.8) {
    const step = Math.sign(delta) * Math.min(Math.abs(delta) * 0.105 + 1.5, 52);
    window.scrollTo({ top: window.scrollY + step, behavior: 'auto' });
  }
  galleryDateScrub.previewFrame = requestAnimationFrame(runGalleryDatePreviewScroll);
}

function previewGalleryDateScroll(ratio) {
  galleryDateScrub.previewTarget = galleryDateScrollTarget(ratio);
  if (!galleryDateScrub.previewFrame) galleryDateScrub.previewFrame = requestAnimationFrame(runGalleryDatePreviewScroll);
}

function settleGalleryToDate(index) {
  const groups = galleryDateScrub.groups;
  if (!groups[index]) return;
  if (galleryDateScrub.previewFrame) cancelAnimationFrame(galleryDateScrub.previewFrame);
  if (galleryDateScrub.settleFrame) cancelAnimationFrame(galleryDateScrub.settleFrame);
  galleryDateScrub.previewFrame = 0;
  const start = window.scrollY;
  const target = galleryDateLayoutTop(groups[index].divider);
  const distance = target - start;
  const duration = Math.max(150, Math.min(280, 150 + Math.abs(distance) * 0.035));
  const started = performance.now();
  galleryDateScrub.ignoreScrollUntil = started + duration + 120;
  const tick = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    window.scrollTo({ top: start + distance * eased, behavior: 'auto' });
    if (progress < 1) galleryDateScrub.settleFrame = requestAnimationFrame(tick);
    else galleryDateScrub.settleFrame = 0;
  };
  galleryDateScrub.settleFrame = requestAnimationFrame(tick);
}

function setGalleryDateScrubberIndex(index, scroll = false, haptic = false, behavior = 'smooth') {
  const groups = galleryDateScrub.groups;
  if (!groups.length) return;
  const next = Math.max(0, Math.min(groups.length - 1, Math.round(index)));
  const ratio = groups.length > 1 ? next / (groups.length - 1) : 0;
  setGalleryDateScrubberRatio(ratio, haptic);
  if (scroll) scrollGalleryToDate(next, behavior);
}

function currentGalleryDateIndex() {
  const groups = galleryDateScrub.groups;
  if (!groups.length) return 0;
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 3) return groups.length - 1;
  const marker = 76;
  let index = 0;
  groups.forEach((group, groupIndex) => {
    if (group.divider.getBoundingClientRect().top <= marker) index = groupIndex;
  });
  return index;
}

function resetGalleryDateScrubGesture() {
  const scrubber = $('#galleryDateScrubber');
  clearTimeout(galleryDateScrub.holdTimer);
  galleryDateScrub.holdTimer = null;
  if (scrubber && galleryDateScrub.pointerId !== null) {
    try { scrubber.releasePointerCapture(galleryDateScrub.pointerId); } catch { /* noop */ }
  }
  galleryDateScrub.active = false;
  galleryDateScrub.pointerId = null;
  galleryDateScrub.dragOffsetY = 0;
  galleryDateScrub.dragMoved = false;
  if (scrubber) scrubber.classList.remove('is-active', 'is-pressed');
  document.body.classList.remove('gallery-date-scrubbing');
}

function positionGalleryDateScrubber() {
  const scrubber = $('#galleryDateScrubber');
  const grid = $('#galleryGrid');
  if (!scrubber || !grid) return;
  const gridRect = grid.getBoundingClientRect();
  const selectBar = $('#selectBar');
  const viewportBottom = selectBar && !selectBar.hidden
    ? Math.min(window.innerHeight - 16, selectBar.getBoundingClientRect().top - 12)
    : window.innerHeight - 18;
  let top = Math.max(88, gridRect.top);
  let bottom = Math.min(viewportBottom, gridRect.bottom);
  if (bottom - top < 180) {
    top = Math.max(88, Math.min(gridRect.top, window.innerHeight * 0.36));
    bottom = Math.max(top + 180, viewportBottom);
  }
  const height = Math.max(180, Math.min(480, bottom - top));
  const center = top + (bottom - top) / 2;
  galleryDateScrub.trackTop = center - height / 2 + 30;
  galleryDateScrub.trackHeight = Math.max(1, height - 60);
  scrubber.style.setProperty('--gallery-scrub-center', `${center}px`);
  scrubber.style.setProperty('--gallery-scrub-expanded-height', `${height}px`);
}

function resumeGalleryDateMedia(delay = 0) {
  clearTimeout(galleryDateScrub.previewResumeTimer);
  galleryDateScrub.previewResumeTimer = setTimeout(() => {
    galleryDateScrub.previewResumeTimer = null;
    resetGalleryPreviewObservation();
  }, delay);
}

function syncGalleryDateScrubber() {
  const scrubber = $('#galleryDateScrubber');
  if (!scrubber) return;
  galleryDateScrub.groups = galleryDateScrubberGroups();
  const visible = state.view === 'gallery' && galleryDateScrub.groups.length > 1;
  scrubber.hidden = !visible;
  if (!visible) {
    resetGalleryDateScrubGesture();
    scrubber.classList.remove('is-keyboard-active');
    return;
  }
  scrubber.setAttribute('aria-valuemax', String(galleryDateScrub.groups.length - 1));
  positionGalleryDateScrubber();
  setGalleryDateScrubberRatio(galleryDateRatioForScroll());
}

function scrubGalleryDateAt(clientY, haptic = true) {
  const scrubber = $('#galleryDateScrubber');
  const rail = scrubber && scrubber.querySelector('.gallery-date-scrubber-rail');
  if (!rail || !galleryDateScrub.groups.length) return;
  const rect = rail.getBoundingClientRect();
  const top = galleryDateScrub.active ? galleryDateScrub.trackTop : rect.top;
  const height = galleryDateScrub.active ? galleryDateScrub.trackHeight : rect.height;
  const effectiveY = clientY - galleryDateScrub.dragOffsetY;
  const ratio = Math.max(0, Math.min(1, (effectiveY - top) / Math.max(1, height)));
  setGalleryDateScrubberRatio(ratio, haptic);
  if (galleryDateScrub.active) previewGalleryDateScroll(ratio);
}

function finishGalleryDateScrub(event) {
  if (event && galleryDateScrub.pointerId !== null && event.pointerId !== galleryDateScrub.pointerId) return;
  const shouldSettle = galleryDateScrub.active && galleryDateScrub.dragMoved;
  const selectedIndex = galleryDateScrub.index;
  if (shouldSettle) setGalleryDateScrubberIndex(selectedIndex);
  resetGalleryDateScrubGesture();
  if (shouldSettle) {
    settleGalleryToDate(selectedIndex);
    resumeGalleryDateMedia(380);
  } else {
    resumeGalleryDateMedia();
  }
}

function beginGalleryDateScrub() {
  if (galleryDateScrub.pointerId === null || galleryDateScrub.active) return;
  galleryDateScrub.holdTimer = null;
  galleryDateScrub.active = true;
  const currentRatio = galleryDateRatioForScroll();
  setGalleryDateScrubberRatio(currentRatio);
  const thumbY = galleryDateScrub.trackTop + galleryDateScrub.trackHeight * currentRatio;
  galleryDateScrub.dragOffsetY = galleryDateScrub.startY - thumbY;
  galleryDateScrub.dragMoved = false;
  $('#galleryDateScrubber').classList.remove('is-pressed');
  $('#galleryDateScrubber').classList.add('is-active');
  document.body.classList.add('gallery-date-scrubbing');
  galleryDateScrub.previewTarget = window.scrollY;
  if (galleryPreviewObserver) galleryPreviewObserver.disconnect();
  $$('.gallery-card-video').forEach((video) => video.pause());
  if (navigator.vibrate) navigator.vibrate(10);
}

$('#galleryDateScrubber').addEventListener('pointerdown', (event) => {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  resetGalleryDateScrubGesture();
  galleryDateScrub.pointerId = event.pointerId;
  galleryDateScrub.startX = event.clientX;
  galleryDateScrub.startY = event.clientY;
  galleryDateScrub.dragMoved = false;
  $('#galleryDateScrubber').classList.add('is-pressed');
  try { $('#galleryDateScrubber').setPointerCapture(event.pointerId); } catch { /* noop */ }
  galleryDateScrub.holdTimer = setTimeout(beginGalleryDateScrub, 180);
});
$('#galleryDateScrubber').addEventListener('pointermove', (event) => {
  if (event.pointerId !== galleryDateScrub.pointerId) return;
  if (!galleryDateScrub.active) {
    if (Math.hypot(event.clientX - galleryDateScrub.startX, event.clientY - galleryDateScrub.startY) > 10) {
      resetGalleryDateScrubGesture();
    }
    return;
  }
  event.preventDefault();
  if (!galleryDateScrub.dragMoved) {
    if (Math.abs(event.clientY - galleryDateScrub.startY) < 4) return;
    galleryDateScrub.dragMoved = true;
  }
  scrubGalleryDateAt(event.clientY);
});
$('#galleryDateScrubber').addEventListener('pointerup', finishGalleryDateScrub);
$('#galleryDateScrubber').addEventListener('pointercancel', finishGalleryDateScrub);
$('#galleryDateScrubber').addEventListener('keydown', (event) => {
  const last = galleryDateScrub.groups.length - 1;
  let next = null;
  if (event.key === 'ArrowDown' || event.key === 'PageDown') next = galleryDateScrub.index + 1;
  if (event.key === 'ArrowUp' || event.key === 'PageUp') next = galleryDateScrub.index - 1;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = last;
  if (next === null) return;
  event.preventDefault();
  $('#galleryDateScrubber').classList.add('is-keyboard-active');
  setGalleryDateScrubberIndex(next, true);
});
$('#galleryDateScrubber').addEventListener('blur', () => {
  if (!galleryDateScrub.active) $('#galleryDateScrubber').classList.remove('is-keyboard-active');
});
window.addEventListener('scroll', () => {
  if (galleryDateScrub.active || performance.now() < galleryDateScrub.ignoreScrollUntil || state.view !== 'gallery' || galleryDateScrollFrame) return;
  galleryDateScrollFrame = requestAnimationFrame(() => {
    galleryDateScrollFrame = 0;
    if (!galleryDateScrub.active && !$('#galleryDateScrubber').hidden) {
      positionGalleryDateScrubber();
      setGalleryDateScrubberRatio(galleryDateRatioForScroll());
    }
  });
}, { passive: true });
window.addEventListener('resize', syncGalleryDateScrubber);

const gallerySelectionDrag = {
  active: false,
  pointerId: null,
  card: null,
  x: 0,
  y: 0,
  frame: 0,
};

function selectGalleryCardAtPoint(clientX, clientY) {
  const actionBar = $('#selectBar');
  const barTop = actionBar && !actionBar.hidden ? actionBar.getBoundingClientRect().top : window.innerHeight;
  const sampleY = Math.max(84, Math.min(clientY, barTop - 10));
  const element = document.elementFromPoint(clientX, sampleY);
  const card = element && element.closest ? element.closest('#galleryGrid .card') : null;
  const id = card && card.dataset.id;
  if (!id || state.selected.has(id)) return;
  state.selected.add(id);
  card.classList.add('selected');
  updateSelectBar();
}

function gallerySelectionScrollSpeed(clientY) {
  const actionBar = $('#selectBar');
  const bottom = actionBar && !actionBar.hidden
    ? Math.min(window.innerHeight - 8, actionBar.getBoundingClientRect().top - 8)
    : window.innerHeight - 8;
  const top = 82;
  const zone = Math.min(88, Math.max(54, (bottom - top) * 0.18));
  if (clientY < top + zone) {
    const pressure = Math.max(0, Math.min(1, (top + zone - clientY) / zone));
    return -Math.round(4 + pressure * 18);
  }
  if (clientY > bottom - zone) {
    const pressure = Math.max(0, Math.min(1, (clientY - (bottom - zone)) / zone));
    return Math.round(4 + pressure * 18);
  }
  return 0;
}

function runGallerySelectionAutoScroll() {
  gallerySelectionDrag.frame = 0;
  if (!gallerySelectionDrag.active) return;
  const speed = gallerySelectionScrollSpeed(gallerySelectionDrag.y);
  if (speed) {
    if (desktopWorkspaceActive()) $('#view-gallery').scrollTop += speed;
    else window.scrollBy(0, speed);
    selectGalleryCardAtPoint(gallerySelectionDrag.x, gallerySelectionDrag.y);
  }
  gallerySelectionDrag.frame = requestAnimationFrame(runGallerySelectionAutoScroll);
}

function beginGallerySelectionDrag(card, pointerId, clientX, clientY) {
  gallerySelectionDrag.active = true;
  gallerySelectionDrag.pointerId = pointerId;
  gallerySelectionDrag.card = card;
  gallerySelectionDrag.x = clientX;
  gallerySelectionDrag.y = clientY;
  document.body.classList.add('gallery-select-dragging');
  try { card.setPointerCapture(pointerId); } catch { /* pointer capture is an enhancement */ }
  if (!gallerySelectionDrag.frame) gallerySelectionDrag.frame = requestAnimationFrame(runGallerySelectionAutoScroll);
}

function updateGallerySelectionDrag(event) {
  if (!gallerySelectionDrag.active || event.pointerId !== gallerySelectionDrag.pointerId) return;
  gallerySelectionDrag.x = event.clientX;
  gallerySelectionDrag.y = event.clientY;
  selectGalleryCardAtPoint(event.clientX, event.clientY);
}

function stopGallerySelectionDrag(event) {
  if (!gallerySelectionDrag.active || (event && event.pointerId !== gallerySelectionDrag.pointerId)) return;
  if (gallerySelectionDrag.frame) cancelAnimationFrame(gallerySelectionDrag.frame);
  try { gallerySelectionDrag.card && gallerySelectionDrag.card.releasePointerCapture(gallerySelectionDrag.pointerId); } catch { /* noop */ }
  gallerySelectionDrag.active = false;
  gallerySelectionDrag.pointerId = null;
  gallerySelectionDrag.card = null;
  gallerySelectionDrag.frame = 0;
  document.body.classList.remove('gallery-select-dragging');
}

function renderGrid() {
  const grid = $('#galleryGrid');
  ensureGalleryPreviewObserver();
  if (galleryPreviewObserver) galleryPreviewObserver.disconnect();
  releasePreviewCacheObjectUrls();
  grid.innerHTML = '';
  const items = visibleItems();
  const entries = galleryEntries(items);
  const dateItemIds = new Map();
  items.forEach((item) => {
    const key = galleryDateKey(item.createdAt);
    if (!dateItemIds.has(key)) dateItemIds.set(key, []);
    dateItemIds.get(key).push(item.id);
  });
  $('#galleryEmpty').classList.toggle('hidden', entries.length > 0);
  const query = state.libraryQuery.trim();
  $('#galleryEmpty').textContent = query ? `No matches for “${query}”` : 'Nothing here yet';
  $('#gallerySearchStatus').textContent = query
    ? `${entries.length} matching generation${entries.length === 1 ? '' : 's'}`
    : '';
  $('#gallerySearchSelectAll').hidden = !query || !items.length;
  let previousDate = '';
  const showDates = state.sortMode !== 'az';
  for (const entry of entries) {
    const it = entry.item;
    const dateKey = galleryDateKey(it.createdAt);
    if (showDates && dateKey !== previousDate) {
      previousDate = dateKey;
      const divider = document.createElement('button');
      divider.type = 'button';
      divider.className = 'gallery-date-divider';
      const dateIds = dateItemIds.get(dateKey) || [];
      divider.dataset.itemIds = dateIds.join(',');
      divider.setAttribute('aria-pressed', String(dateIds.length > 0 && dateIds.every((id) => state.selected.has(id))));
      divider.setAttribute('aria-label', `Select all from ${galleryDateLabel(it.createdAt)}`);
      divider.innerHTML = `<span>${escapeHtml(galleryDateLabel(it.createdAt))}</span>`;
      divider.addEventListener('click', () => toggleBulkSelection(dateIds));
      grid.appendChild(divider);
    }
    const card = document.createElement('button');
    const hasAttachedComposite = Array.isArray(it.composites) && it.composites.length > 0;
    card.className = 'card'
      + (entry.angleGroupId ? ' angle-group' : '')
      + (entry.generationGroupId ? ' generation-group' : '')
      + (hasAttachedComposite ? ' has-attached-composite' : '');
    const latestVideo = latestGalleryVideo(it);
    if (latestVideo && state.mediaPreferences.videoPreviews) {
      const preview = document.createElement('video');
      preview.className = 'gallery-card-video';
      preview.muted = true;
      preview.loop = true;
      preview.playsInline = true;
      preview.preload = 'none';
      preview.draggable = false;
      const posterSource = galleryImageSource(it);
      preview.poster = posterSource;
      useCachedGalleryImage(preview, posterSource, 'poster');
      preview.dataset.src = '/videos/' + latestVideo.file;
      preview.dataset.loaded = 'false';
      preview.tabIndex = -1;
      preview.setAttribute('aria-hidden', 'true');
      if (!galleryPreviewObserver) preview.src = preview.dataset.src;
      card.appendChild(preview);
    } else {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.draggable = false;
      const source = galleryImageSource(it);
      img.src = source;
      useCachedGalleryImage(img, source);
      card.appendChild(img);
    }
    const cardDuration = galleryItemDurationMs(it);
    const imageModel = galleryCardModelLabel(it);
    if (imageModel) {
      const model = document.createElement('span');
      model.className = 'badge model-badge' + (it.upscaled ? ' up' : '');
      model.textContent = `${it.upscaled ? '↑ ' : ''}${imageModel}`;
      model.title = `${it.upscaled ? 'Upscaled · ' : ''}Image model: ${galleryImageModelLabel(it)}`;
      if (!(it.videos && it.videos.length)) addGalleryDuration(model, cardDuration);
      card.appendChild(model);
    }
    if (it.videos && it.videos.length) {
      const latestVideo = latestGalleryVideo(it);
      const videoModel = videoEngineLabel(latestVideo && latestVideo.info && latestVideo.info.engine);
      const v = document.createElement('span');
      v.className = 'badge vid';
      v.textContent = `▶ ${videoModel}`;
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
    if (hasAttachedComposite) {
      const b = document.createElement('span');
      b.className = 'badge attached-composite-badge';
      b.textContent = 'Before + after';
      card.appendChild(b);
    }
    const groupCount = (entry.angleGroupId || entry.generationGroupId) && entry.items.length > 1
      ? entry.items.length
      : (it.videos && it.videos.length > 1 ? it.videos.length : 0);
    if (groupCount) {
      const badge = document.createElement('span');
      badge.className = 'badge generation-count-badge' + (entry.angleGroupId ? ' angle-group-badge' : '');
      badge.textContent = String(groupCount);
      badge.title = `${groupCount} generations grouped`;
      card.appendChild(badge);
    }
    if (entry.items.some(itemHasLike)) {
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
    card.dataset.groupItemIds = entry.items.map((groupItem) => groupItem.id).join(',');
    card.dataset.media = latestVideo ? latestVideo.id : 'image';
    card.draggable = false;
    card.classList.toggle('desktop-drag-source', desktopWorkspaceActive());
    if (state.selected.has(it.id)) card.classList.add('selected');

    // long-press -> multi-select mode; tap -> toggle (in select mode) or open
    let lpTimer = null;
    let lpFired = false;
    let startXY = [0, 0];
    let lastXY = [0, 0];
    let pointerId = null;
    let desktopPointerCandidate = null;
    card.addEventListener('pointerdown', (e) => {
      lpFired = false;
      pointerId = e.pointerId;
      startXY = [e.clientX, e.clientY];
      lastXY = startXY;
      desktopPointerCandidate = desktopWorkspaceActive() && !state.selectMode && (e.button == null || e.button === 0)
        ? { item: it, media: card.dataset.media || 'image', card, pointerId: e.pointerId, active: false }
        : null;
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        if (desktopPointerCandidate) desktopPointerCandidate.selectionStarted = true;
        lpFired = true;
        if (navigator.vibrate) navigator.vibrate(12);
        if (!state.selectMode) enterSelectWith(it.id);
        else toggleSelect(it.id);
        beginGallerySelectionDrag(card, pointerId, lastXY[0], lastXY[1]);
      }, 450);
    });
    card.addEventListener('pointermove', (e) => {
      lastXY = [e.clientX, e.clientY];
      if (desktopPointerCandidate && desktopPointerCandidate.pointerId === e.pointerId) {
        const dx = e.clientX - startXY[0];
        const dy = e.clientY - startXY[1];
        const galleryLeft = $('#view-gallery').getBoundingClientRect().left;
        const movedOutAfterHold = desktopPointerCandidate.selectionStarted && e.clientX < galleryLeft - 6;
        const movedOutImmediately = !desktopPointerCandidate.selectionStarted && dx < -10 && Math.abs(dx) > Math.abs(dy) * 0.65;
        if (!desktopPointerCandidate.active && (movedOutImmediately || movedOutAfterHold)) {
          clearTimeout(lpTimer);
          lpFired = true;
          if (desktopPointerCandidate.selectionStarted) {
            stopGallerySelectionDrag(e);
            exitSelect();
          }
          desktopPointerCandidate.active = true;
          beginDesktopGalleryPointerDrag(desktopPointerCandidate, e);
        }
        if (desktopPointerCandidate.active) {
          e.preventDefault();
          updateDesktopGalleryPointerDrag(e);
          return;
        }
      }
      // After the hold engages, dragging across tiles sweeps them into the
      // selection (Google-Photos style).
      if (lpFired && state.selectMode) {
        e.preventDefault();
        updateGallerySelectionDrag(e);
        return;
      }
      if (Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) > 12) clearTimeout(lpTimer);
    });
    // Once drag-select is live, stop the page from scrolling underneath
    card.addEventListener('touchmove', (e) => {
      if (lpFired && state.selectMode) e.preventDefault();
    }, { passive: false });
    card.addEventListener('pointerup', (event) => {
      clearTimeout(lpTimer);
      if (desktopPointerCandidate && desktopPointerCandidate.active) {
        finishDesktopGalleryPointerDrag(event, true);
        desktopPointerCandidate = null;
        return;
      }
      desktopPointerCandidate = null;
      stopGallerySelectionDrag(event);
    });
    card.addEventListener('pointercancel', (event) => {
      clearTimeout(lpTimer);
      if (desktopPointerCandidate && desktopPointerCandidate.active) finishDesktopGalleryPointerDrag(event, false);
      desktopPointerCandidate = null;
      stopGallerySelectionDrag(event);
    });
    card.addEventListener('contextmenu', (e) => e.preventDefault());
    card.addEventListener('dragstart', (event) => event.preventDefault());
    card.addEventListener('click', () => {
      if (lpFired) { lpFired = false; return; }
      if (state.selectMode) toggleSelect(it.id);
      else if (desktopWorkspaceActive() && state.view !== 'gallery') handleDesktopGalleryTap(it, card);
      else handleGalleryTap(it, card);
    });
    grid.appendChild(card);
  }
  resetGalleryPreviewObservation();
  syncSelectionVisuals();
  syncDesktopGallerySelection();
  syncGalleryDateScrubber();
  if (state.mediaPreferences.previewCache) schedulePreviewCacheWarmup(items);
}

async function selectDesktopLibraryItem(item, media = 'image') {
  checkpointDesktopInputSetup();
  const video = (item.videos || []).find((entry) => entry.id === media) || null;
  state.desktopStageDismissed = false;
  state.desktopItemId = item.id;
  state.desktopMediaId = video ? video.id : 'image';
  state.desktopSettingsReady = false;
  const token = ++state.desktopReuseToken;
  renderDesktopStage(item, state.desktopMediaId);
  syncDesktopGallerySelection();
  try {
    if (video) await reuseVideo(item, video, { desktopToken: token, silent: true });
    else await reuseItem(item, false, { desktopToken: token, silent: true });
    if (state.desktopReuseToken === token) {
      state.desktopSettingsReady = true;
      appendDesktopInputSetup();
      renderDesktopStage(item, state.desktopMediaId);
      syncDesktopGallerySelection();
    }
  } catch (error) {
    if (state.desktopReuseToken === token) toast(error.message, true);
  }
}

function handleDesktopGalleryTap(item, card) {
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
      if (galleryTap && galleryTap.itemId === item.id) galleryTap = null;
    }, 320),
  };
  selectDesktopLibraryItem(item, card.dataset.media || 'image');
}

let desktopGalleryDrag = null;
const DESKTOP_GALLERY_DROP_SELECTOR = [
  '.ref-slot',
  '#createImageGuideAdd', '#createImageGuideFilled',
  '#regionRefBtn', '#regionRefPreview',
  '#vidAttachBtn', '#vidAttachThumb',
  '#vidEndChip', '#vidEndThumb',
  '#vidFaceChip', '#vidFaceThumb',
  '#vidDriveBtn', '#vidDriveThumb',
].join(',');

function desktopGalleryDropTarget(node) {
  const target = node && node.closest ? node.closest(DESKTOP_GALLERY_DROP_SELECTOR) : null;
  return target && target.getClientRects().length ? target : null;
}

function desktopGalleryDropTargets(drag = desktopGalleryDrag) {
  if (!drag) return [];
  return $$(DESKTOP_GALLERY_DROP_SELECTOR).filter((target) => {
    if (!target.getClientRects().length) return false;
    if (target.closest('[inert], [aria-hidden="true"]')) return false;
    if ((target.id === 'vidDriveBtn' || target.id === 'vidDriveThumb') && !drag.video) return false;
    if ((target.id === 'regionRefBtn' || target.id === 'regionRefPreview') && !selectedRegion()) return false;
    return true;
  });
}

function clearDesktopGalleryDropTargets() {
  $$('.gallery-drop-ready, .gallery-drop-active').forEach((target) => target.classList.remove('gallery-drop-ready', 'gallery-drop-active'));
}

function activateDesktopGalleryDrag(item, media, card) {
  const video = (item.videos || []).find((entry) => entry.id === media) || null;
  desktopGalleryDrag = { item, media, video, card };
  card.classList.add('is-dragging');
  document.body.classList.add('desktop-gallery-dragging');
  desktopGalleryDropTargets().forEach((target) => target.classList.add('gallery-drop-ready'));
}

let desktopGalleryPointerDrag = null;

function beginDesktopGalleryPointerDrag(candidate, event) {
  activateDesktopGalleryDrag(candidate.item, candidate.media, candidate.card);
  const ghost = document.createElement('div');
  ghost.className = 'desktop-gallery-drag-ghost';
  const preview = candidate.card.querySelector('img');
  if (preview && preview.src) ghost.style.backgroundImage = `url("${preview.src.replace(/"/g, '%22')}")`;
  ghost.innerHTML = '<span>Drop into an input</span>';
  document.body.appendChild(ghost);
  desktopGalleryPointerDrag = { pointerId: event.pointerId, card: candidate.card, ghost, target: null };
  try { candidate.card.setPointerCapture(event.pointerId); } catch { /* pointer capture is an enhancement */ }
}

function updateDesktopGalleryPointerDrag(event) {
  const pointer = desktopGalleryPointerDrag;
  if (!pointer || pointer.pointerId !== event.pointerId) return;
  pointer.ghost.style.transform = `translate3d(${event.clientX + 14}px, ${event.clientY + 14}px, 0)`;
  const target = desktopGalleryDropTarget(document.elementFromPoint(event.clientX, event.clientY));
  const allowed = target && desktopGalleryDropTargets().includes(target) ? target : null;
  if (pointer.target !== allowed) {
    if (pointer.target) pointer.target.classList.remove('gallery-drop-active');
    pointer.target = allowed;
    if (allowed) allowed.classList.add('gallery-drop-active');
  }
}

async function finishDesktopGalleryPointerDrag(event, shouldDrop) {
  const pointer = desktopGalleryPointerDrag;
  const drag = desktopGalleryDrag;
  if (!pointer || pointer.pointerId !== event.pointerId) return;
  const target = shouldDrop ? pointer.target : null;
  try { pointer.card.releasePointerCapture(event.pointerId); } catch { /* noop */ }
  pointer.ghost.remove();
  desktopGalleryPointerDrag = null;
  endDesktopGalleryDrag();
  if (!target || !drag) return;
  target.classList.add('gallery-drop-received');
  setTimeout(() => target.classList.remove('gallery-drop-received'), 520);
  try { await applyDesktopGalleryDrop(target, drag); }
  catch (error) { toast(error.message, true); }
}

function endDesktopGalleryDrag() {
  if (desktopGalleryDrag && desktopGalleryDrag.card) desktopGalleryDrag.card.classList.remove('is-dragging');
  desktopGalleryDrag = null;
  document.body.classList.remove('desktop-gallery-dragging');
  clearDesktopGalleryDropTargets();
}

async function applyDesktopGalleryDrop(target, drag) {
  const { item, video } = drag;
  if (target.matches('.ref-slot')) {
    const index = Number(target.dataset.refIndex);
    if (!Number.isInteger(index)) return;
    const reference = await galleryItemEditReference(item);
    if (index === 0) clearKreaMask(true);
    state.refs[index] = reference;
    renderRefs();
    saveForm();
    toast(`Added to reference ${index + 1}`);
    return;
  }
  if (target.matches('#createImageGuideAdd, #createImageGuideFilled')) {
    await setCreateImageGuideAsset(await galleryItemEditReference(item), state.createGuideMode);
    toast('Gallery image added as the image guide');
    return;
  }
  if (target.matches('#regionRefBtn, #regionRefPreview')) {
    setRegionReference(await galleryItemEditReference(item));
    return;
  }
  if (target.matches('#vidAttachBtn, #vidAttachThumb')) {
    await sendToVideoTab(item, 'start');
    return;
  }
  if (target.matches('#vidEndChip, #vidEndThumb')) {
    await sendToVideoTab(item, 'end');
    return;
  }
  if (target.matches('#vidFaceChip, #vidFaceThumb')) {
    const reference = await galleryItemEditReference(item);
    state.vidFace = Object.assign(reference, { label: 'from gallery' });
    state.vidRef = null;
    renderVidAttach();
    updateVideoPanels();
    saveForm();
    toast('Gallery image added as the Face ID reference');
    return;
  }
  if (target.matches('#vidDriveBtn, #vidDriveThumb') && video) {
    await sendVideoAsDrive(item, video, { preserveEngine: true });
  }
}

$('#view-create').addEventListener('dragover', (event) => {
  if (!desktopGalleryDrag) return;
  const target = desktopGalleryDropTarget(event.target);
  const allowed = target && desktopGalleryDropTargets().includes(target);
  clearDesktopGalleryDropTargets();
  desktopGalleryDropTargets().forEach((entry) => entry.classList.add('gallery-drop-ready'));
  if (!allowed) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  target.classList.add('gallery-drop-active');
});
$('#view-create').addEventListener('dragleave', (event) => {
  const target = desktopGalleryDropTarget(event.target);
  if (target && !target.contains(event.relatedTarget)) target.classList.remove('gallery-drop-active');
});
$('#view-create').addEventListener('drop', async (event) => {
  const drag = desktopGalleryDrag;
  const target = desktopGalleryDropTarget(event.target);
  if (!drag || !target || !desktopGalleryDropTargets(drag).includes(target)) return;
  event.preventDefault();
  endDesktopGalleryDrag();
  target.classList.add('gallery-drop-received');
  setTimeout(() => target.classList.remove('gallery-drop-received'), 520);
  try { await applyDesktopGalleryDrop(target, drag); }
  catch (error) { toast(error.message, true); }
});

document.addEventListener('visibilitychange', () => {
  const previews = $$('.gallery-card-video');
  if (document.hidden || !galleryPreviewMotionAllowed()) {
    previews.forEach((video) => {
      video.pause();
      try { video.currentTime = 0; } catch { /* noop */ }
    });
  } else {
    resetGalleryPreviewObservation();
    reconcileGenerationAfterResume();
  }
});
window.addEventListener('pageshow', () => { reconcileGenerationAfterResume(); });
window.addEventListener('focus', () => { reconcileGenerationAfterResume(); });
window.addEventListener('online', () => { reconcileGenerationAfterResume(); });

let galleryTap = null;
let lightboxTap = null;
let lightboxVideoTap = null;
let lightboxVideoPointer = null;
let suppressLightboxVideoClick = false;
let lightboxSwipeSuppressTap = false;
let likeAnimationDataPromise = null;
let likeAnimationRuntimePromise = null;

function loadLikeAnimationData() {
  if (!likeAnimationDataPromise) {
    likeAnimationDataPromise = fetch('/like.json')
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
  }
  return likeAnimationDataPromise;
}

function loadLikeAnimationRuntime() {
  if (window.lottie) return Promise.resolve(window.lottie);
  if (!likeAnimationRuntimePromise) {
    likeAnimationRuntimePromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = '/lottie_light.min.js';
      script.async = true;
      script.onload = () => resolve(window.lottie || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }
  return likeAnimationRuntimePromise;
}

function warmLikeAnimation() {
  loadLikeAnimationData();
  loadLikeAnimationRuntime();
  loadProgressAnimationData('image');
  loadProgressAnimationData('video');
}
if ('requestIdleCallback' in window) window.requestIdleCallback(warmLikeAnimation, { timeout: 3000 });
else setTimeout(warmLikeAnimation, 1200);

function cloneLikeAnimationData(data) {
  if (!data) return null;
  return typeof structuredClone === 'function'
    ? structuredClone(data)
    : JSON.parse(JSON.stringify(data));
}

function recolorStaticLottie(data, darkColor, lightColor) {
  const cloned = cloneLikeAnimationData(data);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.c && value.c.k && Array.isArray(value.c.k)
      && value.c.k.length >= 3 && value.c.k.slice(0, 3).every(Number.isFinite)) {
      const luminance = (value.c.k[0] + value.c.k[1] + value.c.k[2]) / 3;
      value.c.k = (luminance < 0.5 ? darkColor : lightColor).slice();
    }
    Object.values(value).forEach(visit);
  };
  visit(cloned);
  return cloned;
}

function whiteLikeAnimationData(data) {
  return recolorStaticLottie(data, [1, 1, 1, 1], [1, 1, 1, 1]);
}

function outlinedProgressAnimationData(data, outline) {
  const cloned = cloneLikeAnimationData(data);
  const face = [0, 0, 0, 1];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if ((value.ty === 'st' || value.ty === 'fl') && value.c?.k && Array.isArray(value.c.k)) {
      value.c.k = (value.ty === 'st' ? outline : face).slice();
    }
    Object.values(value).forEach(visit);
  };
  visit(cloned);
  return cloned;
}

function imageProgressAnimationData(data) {
  return outlinedProgressAnimationData(data, [66 / 255, 133 / 255, 244 / 255, 1]);
}

function videoProgressAnimationData(data) {
  return outlinedProgressAnimationData(data, [234 / 255, 67 / 255, 53 / 255, 1]);
}

const progressAnimationData = new Map();
let livePreviewAnimation = null;
let livePreviewAnimationToken = 0;

function loadProgressAnimationData(kind) {
  if (!progressAnimationData.has(kind)) {
    // Image and video jobs share one motion language. Video uses the same
    // geometry with a red outline treatment applied at render time.
    const path = '/progress-image.json';
    progressAnimationData.set(kind, fetch(path)
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null));
  }
  return progressAnimationData.get(kind);
}

function stopLivePreviewSimulation() {
  livePreviewAnimationToken += 1;
  if (livePreviewAnimation) livePreviewAnimation.destroy();
  livePreviewAnimation = null;
  const host = $('#livePreviewLottie');
  if (host) {
    host.replaceChildren();
    host.hidden = true;
  }
}

async function startLivePreviewSimulation(kind = state.view === 'video' ? 'video' : 'image') {
  const token = ++livePreviewAnimationToken;
  if (livePreviewAnimation) livePreviewAnimation.destroy();
  livePreviewAnimation = null;
  const host = $('#livePreviewLottie');
  const image = $('#livePreviewImg');
  image.hidden = true;
  image.removeAttribute('src');
  host.hidden = false;
  host.dataset.kind = kind;
  host.replaceChildren();
  const [lottie, data] = await Promise.all([loadLikeAnimationRuntime(), loadProgressAnimationData(kind)]);
  if (token !== livePreviewAnimationToken || !lottie || !data || !host.isConnected) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  livePreviewAnimation = lottie.loadAnimation({
    container: host,
    renderer: 'svg',
    loop: !reduced,
    autoplay: !reduced,
    animationData: kind === 'video' ? videoProgressAnimationData(data) : imageProgressAnimationData(data),
    rendererSettings: { progressiveLoad: true },
  });
  if (reduced) livePreviewAnimation.goToAndStop(0, true);
}

function showLivePreviewImage(source) {
  stopLivePreviewSimulation();
  const image = $('#livePreviewImg');
  image.hidden = false;
  image.src = source;
}

function playCssLikeBurst(burst, target, mode) {
  burst.innerHTML = `<span class="like-burst-ring"></span>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21 3.9 12.9A5.6 5.6 0 0 1 12 5.15a5.6 5.6 0 0 1 8.1 7.75L12 21Z"/></svg>
    <span class="like-burst-particle" style="--x:0px;--y:-76px;--delay:0ms"></span>
    <span class="like-burst-particle" style="--x:54px;--y:-54px;--delay:18ms"></span>
    <span class="like-burst-particle" style="--x:76px;--y:0px;--delay:36ms"></span>
    <span class="like-burst-particle" style="--x:54px;--y:54px;--delay:54ms"></span>
    <span class="like-burst-particle" style="--x:0px;--y:76px;--delay:72ms"></span>
    <span class="like-burst-particle" style="--x:-54px;--y:54px;--delay:90ms"></span>
    <span class="like-burst-particle" style="--x:-76px;--y:0px;--delay:108ms"></span>
    <span class="like-burst-particle" style="--x:-54px;--y:-54px;--delay:126ms"></span>`;
  burst.classList.remove('pop', 'unlike');
  requestAnimationFrame(() => burst.classList.add(mode === 'like' ? 'pop' : 'unlike'));
  setTimeout(() => {
    burst.classList.remove('pop', 'unlike');
    if (burst !== target) burst.remove();
  }, mode === 'like' ? 900 : 580);
}

function playLikeBurst(target, mode = 'like') {
  if (!target) return;
  const burst = target.id === 'lightboxLikeBurst'
    ? target : document.createElement('div');
  if (burst._lottieAnimation) {
    burst._lottieAnimation.destroy();
    burst._lottieAnimation = null;
  }
  burst.className = 'like-burst';
  if (burst !== target) target.appendChild(burst);
  if (mode !== 'like') {
    playCssLikeBurst(burst, target, mode);
    return;
  }
  burst.innerHTML = '<div class="like-burst-lottie" aria-hidden="true"></div>';
  const host = burst.firstElementChild;
  Promise.all([loadLikeAnimationRuntime(), loadLikeAnimationData()]).then(([lottie, data]) => {
    if (!lottie || !data || !host.isConnected) {
      if (host.isConnected) playCssLikeBurst(burst, target, mode);
      return;
    }
    const animation = lottie.loadAnimation({
      container: host,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: whiteLikeAnimationData(data),
      rendererSettings: { progressiveLoad: true },
    });
    burst._lottieAnimation = animation;
    burst.classList.add('lottie-playing');
    const finish = () => {
      if (burst._lottieAnimation !== animation) return;
      animation.destroy();
      burst._lottieAnimation = null;
      burst.classList.remove('lottie-playing');
      if (burst !== target) burst.remove();
      else burst.innerHTML = '';
    };
    animation.addEventListener('complete', finish);
    setTimeout(finish, 1200);
  });
}

function syncLightboxLikeButton(liked, label) {
  const button = $('#lbActions .like-toggle');
  if (!button) return;
  button.classList.toggle('liked', liked);
  button.innerHTML = actionIconMarkup(liked ? 'heart-fill' : 'heart');
  button.setAttribute('aria-pressed', String(liked));
  button.setAttribute('aria-label', label);
  button.title = label;
}

async function setItemLiked(item, liked, burstTarget) {
  if (!item) return;
  const targets = [item];
  if (targets.some((target) => target._likePending)) return;
  const previous = targets.map((target) => !!target.liked);
  targets.forEach((target) => {
    target.liked = liked;
    target._likePending = true;
  });
  syncLightboxLikeButton(liked, liked ? 'Unlike' : 'Like');
  playLikeBurst(burstTarget, liked ? 'like' : 'unlike');
  // Leave the original card mounted until the heart motion has painted.
  // Rendering immediately used to remove the grid burst before it was visible.
  setTimeout(renderGrid, liked ? 860 : 520);
  try {
    const updated = await Promise.all(targets.map((target) => api(`/api/item/${target.id}/like`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ liked }),
    })));
    updated.forEach((result, index) => Object.assign(targets[index], result));
  } catch (error) {
    targets.forEach((target, index) => { target.liked = previous[index]; });
    syncLightboxLikeButton(previous[0], previous[0] ? 'Unlike' : 'Like');
    toast(error.message, true);
    renderGrid();
  } finally {
    targets.forEach((target) => { target._likePending = false; });
  }
}

async function setVideoLiked(item, video, liked, burstTarget) {
  if (!item || !video || video._likePending) return;
  const previous = !!video.liked;
  video.liked = liked;
  video._likePending = true;
  syncLightboxLikeButton(liked, liked ? 'Unlike video' : 'Like video');
  playLikeBurst(burstTarget, liked ? 'like' : 'unlike');
  try {
    const updated = await api(`/api/item/${item.id}/video/${video.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ liked }),
    });
    Object.assign(item, updated);
    // Keep the focused player and its current playback position intact. The
    // action heart is already synchronized optimistically above.
  } catch (error) {
    video.liked = previous;
    syncLightboxLikeButton(previous, previous ? 'Unlike video' : 'Like video');
    toast(error.message, true);
  } finally {
    video._likePending = false;
  }
  setTimeout(renderGrid, liked ? 860 : 520);
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
        openLightbox(item.id, card.dataset.media || 'image');
      }
    }, 260),
  };
}

function handleLightboxTap() {
  if (lightboxSwipeSuppressTap) return;
  const item = state.currentItem;
  if (!item) return;
  const selectedVideo = state.currentMedia && state.currentMedia.type === 'video'
    ? (item.videos || []).find((video) => video.id === state.currentMedia.id)
    : null;
  const mediaId = selectedVideo ? selectedVideo.id : 'image';
  const now = Date.now();
  if (lightboxTap && lightboxTap.itemId === item.id && lightboxTap.mediaId === mediaId && now - lightboxTap.time < 300) {
    lightboxTap = null;
    if (selectedVideo) setVideoLiked(item, selectedVideo, !selectedVideo.liked, $('#lightboxLikeBurst'));
    else toggleItemLike(item, $('#lightboxLikeBurst'));
    return;
  }
  lightboxTap = { itemId: item.id, mediaId, time: now };
  setTimeout(() => {
    if (lightboxTap && lightboxTap.itemId === item.id && lightboxTap.mediaId === mediaId) lightboxTap = null;
  }, 320);
}

function lightboxVideoTapUsesControls(event) {
  const rect = $('#lbVideo').getBoundingClientRect();
  return event.clientY >= rect.bottom - 76;
}

function handleLightboxVideoPointerDown(event) {
  if (!event.isPrimary || lightboxVideoTapUsesControls(event)) {
    lightboxVideoPointer = null;
    return;
  }
  lightboxVideoPointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    time: performance.now(),
  };
}

function handleLightboxVideoPointerUp(event) {
  const start = lightboxVideoPointer;
  lightboxVideoPointer = null;
  if (!start || start.id !== event.pointerId || lightboxSwipeSuppressTap || lightboxVideoTapUsesControls(event)) return;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18
    || performance.now() - start.time > 420) return;
  const item = state.currentItem;
  const video = item && state.currentMedia && state.currentMedia.type === 'video'
    ? (item.videos || []).find((entry) => entry.id === state.currentMedia.id)
    : null;
  if (!video) return;
  const now = performance.now();
  const repeated = lightboxVideoTap
    && lightboxVideoTap.itemId === item.id
    && lightboxVideoTap.videoId === video.id
    && now - lightboxVideoTap.time < 330
    && Math.hypot(event.clientX - lightboxVideoTap.x, event.clientY - lightboxVideoTap.y) < 42;
  if (repeated) {
    lightboxVideoTap = null;
    suppressLightboxVideoClick = true;
    event.preventDefault();
    setVideoLiked(item, video, !video.liked, $('#lightboxLikeBurst'));
    return;
  }
  lightboxVideoTap = { itemId: item.id, videoId: video.id, time: now, x: event.clientX, y: event.clientY };
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
$('#gallerySearchSelectAll').addEventListener('click', () => {
  toggleBulkSelection(visibleItems().map((item) => item.id));
});

/* ------------------------------------------------------------------ */
/* Multi-select                                                        */
/* ------------------------------------------------------------------ */

function enterSelectWith(id) {
  state.selectMode = true;
  state.selected = new Set([id]);
  updateSelectBar();
}

function selectedGalleryItems() {
  return state.items.filter((item) => state.selected.has(item.id));
}

function selectedUngroupableGenerationGroupIds() {
  const selectedGroupIds = new Set(selectedGalleryItems()
    .map((item) => item.generationGroupId)
    .filter(Boolean));
  if (!selectedGroupIds.size) return selectedGroupIds;
  const groupSizes = new Map();
  state.items.forEach((item) => {
    if (!selectedGroupIds.has(item.generationGroupId)) return;
    groupSizes.set(item.generationGroupId, (groupSizes.get(item.generationGroupId) || 0) + 1);
  });
  return new Set([...selectedGroupIds].filter((groupId) => (groupSizes.get(groupId) || 0) > 1));
}

function expandedGallerySelection(ids = [...state.selected]) {
  const selectedIds = new Set(ids);
  const selectedItems = state.items.filter((item) => selectedIds.has(item.id));
  const generationGroups = new Set(selectedItems.map((item) => item.generationGroupId).filter(Boolean));
  const angleGroups = new Set(selectedItems.map((item) => item.angleGroupId).filter(Boolean));
  return state.items.filter((item) => selectedIds.has(item.id)
    || (item.generationGroupId && generationGroups.has(item.generationGroupId))
    || (item.angleGroupId && angleGroups.has(item.angleGroupId)));
}

function syncSelectionVisuals() {
  $$('#galleryGrid .card').forEach((card) => card.classList.toggle('selected', state.selected.has(card.dataset.id)));
  $$('#galleryGrid .gallery-date-divider').forEach((divider) => {
    const ids = String(divider.dataset.itemIds || '').split(',').filter(Boolean);
    divider.setAttribute('aria-pressed', String(ids.length > 0 && ids.every((id) => state.selected.has(id))));
  });
  const searchButton = $('#gallerySearchSelectAll');
  if (searchButton && !searchButton.hidden) {
    const ids = visibleItems().map((item) => item.id);
    const allSelected = ids.length > 0 && ids.every((id) => state.selected.has(id));
    searchButton.setAttribute('aria-pressed', String(allSelected));
    searchButton.setAttribute('aria-label', allSelected ? 'Clear selected search results' : 'Select all search results');
    searchButton.textContent = allSelected ? 'Selected' : 'Select all';
  }
}

function toggleBulkSelection(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return;
  const allSelected = unique.every((id) => state.selected.has(id));
  unique.forEach((id) => {
    if (allSelected) state.selected.delete(id);
    else state.selected.add(id);
  });
  if (!state.selected.size) return exitSelect();
  state.selectMode = true;
  updateSelectBar();
}

function toggleSelect(id) {
  if (state.selected.has(id)) {
    state.selected.delete(id);
  } else {
    state.selected.add(id);
  }
  if (!state.selected.size) exitSelect();
  else updateSelectBar();
}
function exitSelect() {
  cancelContextualGuide('gallery-selection-details');
  if (!state.selectMode && !state.selected.size) { $('#selectBar').hidden = true; return; }
  state.selectMode = false;
  state.selected = new Set();
  dockSelectionConsole();
  $('#selectBar').hidden = true;
  syncSelectionVisuals();
}
function updateSelectBar() {
  $('#selectBar').hidden = false;
  const included = expandedGallerySelection();
  $('#selCount').textContent = included.length > state.selected.size
    ? `${state.selected.size} selected · ${included.length} generations included`
    : `${state.selected.size} selected`;
  $('#selGroup').disabled = state.selected.size < 2;
  $('#selUngroup').hidden = selectedUngroupableGenerationGroupIds().size === 0;
  $('#selComposite').disabled = state.selected.size < 2;
  syncSelectionVisuals();
  if ($('#selectBar').classList.contains('is-expanded')) scheduleSelectionInsightsRefresh();
  else scheduleContextualGuide('gallery-selection-details');
}
$('#selCancel').addEventListener('click', exitSelect);
$('#selSave').addEventListener('click', () => {
  const items = selectedGalleryItems();
  if (!items.length) return;
  if (items.length === 1) {
    downloadItem(items[0], 'current');
    toast('Saving photo…');
    return;
  }
  mirrorGalleryExport({ ids: items.map((item) => item.id) });
  const a = document.createElement('a');
  a.href = `/api/items/download?ids=${encodeURIComponent(items.map((item) => item.id).join(','))}`;
  a.download = 'mix-studio-selection.zip';
  a.click();
  toast(`Saving ${items.length} photos as a ZIP…`);
});
$('#selGroup').addEventListener('click', async () => {
  const ids = [...state.selected];
  if (ids.length < 2) return;
  try {
    await api('/api/items/group', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    });
    exitSelect();
    await refreshGallery();
    toast(`Grouped ${ids.length} generations`);
  } catch (error) { toast(error.message, true); }
});
$('#selUngroup').addEventListener('click', async () => {
  const ids = [...state.selected];
  const groupCount = selectedUngroupableGenerationGroupIds().size;
  if (!ids.length || !groupCount) return;
  try {
    const result = await api('/api/items/ungroup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    });
    exitSelect();
    await refreshGallery();
    toast(`Ungrouped ${result.items} generation${result.items === 1 ? '' : 's'}`);
  } catch (error) { toast(error.message, true); }
});
$('#selComposite').addEventListener('click', async () => {
  const ids = [...state.selected];
  if (ids.length < 2) return;
  try {
    toast('Building contact sheet…');
    const result = await api('/api/image-composite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'selection', ids }),
    });
    state.activeJobs.add(result.jobId);
    state.compositeJobs.set(result.jobId, { type: 'selection' });
    queueRefreshSoon();
    exitSelect();
  } catch (error) { toast(error.message, true); }
});
$('#selMove').addEventListener('click', () => {
  if (state.selected.size) openMoveSheet([...state.selected]);
});
$('#selDelete').addEventListener('click', async () => {
  const ids = [...state.selected];
  if (!ids.length) return;
  if (!await askConfirm({
    title: `Delete ${ids.length} generation${ids.length > 1 ? 's' : ''}?`,
    message: 'This cannot be undone.',
    confirmLabel: 'Delete selection',
    danger: true,
  })) return;
  try {
    await Promise.all(ids.map((id) => api('/api/item/' + id, { method: 'DELETE' })));
    exitSelect();
    await refreshGallery();
    toast(`Deleted ${ids.length} image${ids.length > 1 ? 's' : ''}`);
  } catch (e) { toast(e.message, true); refreshGallery(); }
});

function formatSelectionBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${unit}`;
}

function selectionDateRange(earliest, latest) {
  if (!earliest || !latest) return 'Unknown';
  const format = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const first = format.format(new Date(earliest));
  const last = format.format(new Date(latest));
  return first === last ? first : `${first} – ${last}`;
}

let selectionInsightsRequest = 0;
let selectionInsightsTimer = null;
async function refreshSelectionInsights() {
  const ids = [...state.selected];
  if (!ids.length) return;
  const request = ++selectionInsightsRequest;
  $('#selectionInsightsStatus').textContent = `Calculating ${ids.length} selected generation${ids.length === 1 ? '' : 's'}…`;
  ['selectionDiskSpace', 'selectionGenerationTime', 'selectionDateRange', 'selectionMediaCount']
    .forEach((id) => { $('#' + id).textContent = '—'; });
  try {
    const stats = await api('/api/items/selection-stats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    });
    if (request !== selectionInsightsRequest) return;
    $('#selectionInsightsStatus').textContent = `${stats.items} selected generation${stats.items === 1 ? '' : 's'} · ${stats.files} stored file${stats.files === 1 ? '' : 's'}`;
    $('#selectionDiskSpace').textContent = formatSelectionBytes(stats.bytes);
    $('#selectionGenerationTime').textContent = stats.generationMs
      ? `${stats.generationTimingComplete === false ? '~' : ''}${formatDuration(stats.generationMs)}`
      : 'Not recorded';
    $('#selectionDateRange').textContent = selectionDateRange(stats.earliest, stats.latest);
    $('#selectionMediaCount').textContent = `${stats.images} image${stats.images === 1 ? '' : 's'} · ${stats.videos} video${stats.videos === 1 ? '' : 's'}`;
  } catch (error) {
    if (request === selectionInsightsRequest) $('#selectionInsightsStatus').textContent = error.message;
  }
}

function scheduleSelectionInsightsRefresh(delay = 120) {
  clearTimeout(selectionInsightsTimer);
  selectionInsightsRequest += 1;
  selectionInsightsTimer = setTimeout(() => {
    selectionInsightsTimer = null;
    refreshSelectionInsights();
  }, delay);
}

const selectionActionIds = ['selSave', 'selGroup', 'selComposite', 'selMove', 'selUngroup', 'selDelete'];

function restoreSelectionActions() {
  const row = $('.select-actions');
  const more = $('#selectionConsoleMoreActions');
  if (!row || !more) return;
  selectionActionIds.forEach((id) => {
    const button = $('#' + id);
    if (button) row.appendChild(button);
  });
  row.scrollLeft = 0;
  more.hidden = true;
}

function populateSelectionExpandedActions() {
  const row = $('.select-actions');
  const more = $('#selectionConsoleMoreActions');
  if (!row || !more) return;
  restoreSelectionActions();
  const buttons = selectionActionIds.map((id) => $('#' + id)).filter((button) => button && !button.hidden);
  const gap = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap) || 0;
  let used = 0;
  let visible = 0;
  buttons.forEach((button) => {
    const width = button.getBoundingClientRect().width;
    const next = used + (visible ? gap : 0) + width;
    if (!visible || next <= row.clientWidth + 0.5) {
      used = next;
      visible += 1;
    }
  });
  buttons.slice(visible).forEach((button) => more.appendChild(button));
  more.hidden = more.childElementCount === 0;
}

function openSelectionInsights() {
  if (!state.selected.size) return;
  completeContextualGuide('gallery-selection-details');
  const consoleBar = $('#selectBar');
  consoleBar.classList.add('is-expanded');
  consoleBar.classList.remove('is-dragging');
  consoleBar.style.removeProperty('--selection-detail-height');
  document.body.classList.add('selection-console-expanded');
  $('#selectionConsoleDetails').setAttribute('aria-hidden', 'false');
  $('#selInsightsHandle').setAttribute('aria-expanded', 'true');
  $('#selInsightsHandle').setAttribute('aria-label', 'Dock selection console');
  populateSelectionExpandedActions();
  scheduleSelectionInsightsRefresh(0);
}

function dockSelectionConsole() {
  const consoleBar = $('#selectBar');
  restoreSelectionActions();
  consoleBar.classList.remove('is-expanded', 'is-dragging');
  consoleBar.style.removeProperty('--selection-detail-height');
  document.body.classList.remove('selection-console-expanded');
  clearTimeout(selectionInsightsTimer);
  selectionInsightsTimer = null;
  selectionInsightsRequest += 1;
  const details = $('#selectionConsoleDetails');
  if (details) details.setAttribute('aria-hidden', 'true');
  const handle = $('#selInsightsHandle');
  if (handle) {
    handle.setAttribute('aria-expanded', 'false');
    handle.setAttribute('aria-label', 'Expand selection console');
  }
}

window.addEventListener('resize', () => {
  if ($('#selectBar').classList.contains('is-expanded')) populateSelectionExpandedActions();
});

function selectionConsoleHeight() {
  return Math.min(360, window.innerHeight * 0.5);
}

let suppressSelectionConsoleClick = false;
$('#selInsightsHandle').addEventListener('click', () => {
  if (suppressSelectionConsoleClick) {
    suppressSelectionConsoleClick = false;
    return;
  }
  if ($('#selectBar').classList.contains('is-expanded')) dockSelectionConsole();
  else openSelectionInsights();
});
$('#selDock').addEventListener('click', dockSelectionConsole);
let selectBarSwipe = null;
$('#selectBar').addEventListener('pointerdown', (event) => {
  if (event.target.closest('.select-actions, #selCancel, #selDock')) return;
  const expanded = $('#selectBar').classList.contains('is-expanded');
  selectBarSwipe = {
    pointerId: event.pointerId,
    startY: event.clientY,
    lastY: event.clientY,
    startTime: performance.now(),
    expanded,
    height: expanded ? selectionConsoleHeight() : 0,
  };
  try { $('#selectBar').setPointerCapture(event.pointerId); } catch { /* noop */ }
});
$('#selectBar').addEventListener('pointermove', (event) => {
  if (!selectBarSwipe || event.pointerId !== selectBarSwipe.pointerId) return;
  const target = selectionConsoleHeight();
  const delta = event.clientY - selectBarSwipe.startY;
  selectBarSwipe.lastY = event.clientY;
  selectBarSwipe.height = Math.max(0, Math.min(target, (selectBarSwipe.expanded ? target : 0) - delta));
  const consoleBar = $('#selectBar');
  consoleBar.classList.add('is-dragging');
  consoleBar.style.setProperty('--selection-detail-height', `${selectBarSwipe.height}px`);
  suppressSelectionConsoleClick = Math.abs(delta) > 8;
});
function finishSelectBarSwipe(event) {
  if (!selectBarSwipe || (event && event.pointerId !== selectBarSwipe.pointerId)) return;
  const target = selectionConsoleHeight();
  const delta = selectBarSwipe.lastY - selectBarSwipe.startY;
  const elapsed = Math.max(1, performance.now() - selectBarSwipe.startTime);
  const velocity = delta / elapsed;
  const open = velocity < -0.35 || (velocity <= 0.35 && selectBarSwipe.height > target * 0.46);
  selectBarSwipe = null;
  if (open) openSelectionInsights();
  else dockSelectionConsole();
}
$('#selectBar').addEventListener('pointerup', finishSelectBarSwipe);
$('#selectBar').addEventListener('pointercancel', finishSelectBarSwipe);

/* ------------------------------------------------------------------ */
/* Lightbox                                                            */
/* ------------------------------------------------------------------ */

/* Background scroll lock: the viewer behaves like its own page */
let savedScrollY = 0;
function lockScroll() {
  if (document.body.classList.contains('modal-open')) return;
  savedScrollY = desktopWorkspaceActive() ? 0 : window.scrollY;
  document.body.classList.add('modal-open');
  document.body.style.position = 'fixed';
  document.body.style.top = desktopWorkspaceActive() ? '0px' : `-${savedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
}
function unlockScroll() {
  if (!document.body.classList.contains('modal-open')) return;
  document.body.classList.remove('modal-open');
  document.body.style.position = '';
  document.body.style.left = '';
  document.body.style.right = '';
  if (document.body.classList.contains('sheet-open')) {
    document.body.style.top = desktopWorkspaceActive() ? '0px' : `-${sheetScrollY}px`;
  } else {
    document.body.style.top = '';
    window.scrollTo(0, desktopWorkspaceActive() ? 0 : savedScrollY);
  }
}
window.addEventListener('popstate', () => {
  if ($('#compare').classList.contains('show')) { $('#compare').classList.remove('show'); return; }
  if ($('#lightbox').classList.contains('show')) closeLightbox(true);
});

function existingImageComposite(item, type) {
  if (!item || !['before-after', 'reference-generation', 'depth-map'].includes(type) || !item.sourceFile) return null;
  const currentSources = [item.sourceFile, item.upscaled || item.file];
  return (Array.isArray(item.composites) ? item.composites : []).find((composite) => {
    if (!composite || composite.type !== type) return false;
    if (Array.isArray(composite.sourceFiles)) {
      return composite.sourceFiles.length === currentSources.length
        && composite.sourceFiles.every((file, index) => file === currentSources[index]);
    }
    // Older composites did not record their source pair. They are safe to
    // reuse while the parent has no newer upscale output.
    return !item.upscaled;
  }) || null;
}

async function saveImageComposite(item, type) {
  try {
    const label = type === 'before-after' ? 'before + after'
      : (type === 'reference-generation' ? 'reference + generation'
        : (type === 'depth-map' ? 'source + depth + generation' : 'camera-angle'));
    const existing = existingImageComposite(item, type);
    if (existing) {
      downloadComposite(item, existing);
      toast(`Downloaded existing ${label} composite`);
      return;
    }
    toast(`Building ${label} composite…`);
    const result = await api('/api/image-composite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, type }),
    });
    if (result.existing && result.composite) {
      Object.assign(item, result.item || {});
      downloadComposite(item, result.composite);
      toast(`Downloaded existing ${label} composite`);
      return;
    }
    state.activeJobs.add(result.jobId);
    state.compositeJobs.set(result.jobId, { parentId: item.id, type });
    $('#genLbl').textContent = genLabel();
    queueRefreshSoon();
    closeLightbox();
  } catch (error) {
    toast(error.message, true);
  }
}

let resetLightboxSwipeVisuals = () => {};

function preloadLightboxNeighbors(item) {
  [-1, 1].forEach((direction) => {
    const neighbor = galleryNavigationTarget(item, direction);
    if (!neighbor || !neighbor.file) return;
    const image = new Image();
    image.src = '/images/' + (neighbor.upscaled || neighbor.file);
  });
}

function openLightbox(id, mediaSel) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  resetLightboxSwipeVisuals();
  const freshOpen = !$('#lightbox').classList.contains('show');
  if (freshOpen) {
    lockScroll();
    try { history.pushState({ lb: 1 }, ''); } catch { /* noop */ }
  }
  state.currentItem = it;
  preloadLightboxNeighbors(it);
  const angleItems = angleGroupItems(it);
  const angleIndex = angleItems.findIndex((item) => item.id === it.id);
  const generationItems = generationGroupItems(it);
  const generationIndex = generationItems.findIndex((item) => item.id === it.id);
  const videos = Array.isArray(it.videos) ? it.videos : [];
  const composites = Array.isArray(it.composites) ? it.composites : [];
  let sel = mediaSel;
  if (sel !== 'image' && !videos.some((v) => v.id === sel) && !composites.some((composite) => 'composite:' + composite.id === sel)) sel = 'image';
  const selVideo = videos.find((v) => v.id === sel) || null;
  const selComposite = composites.find((composite) => 'composite:' + composite.id === sel) || null;
  state.currentMedia = selVideo ? { type: 'video', id: selVideo.id }
    : (selComposite ? { type: 'composite', id: selComposite.id } : { type: 'image', id: 'image' });
  $('#lightbox').classList.add('show');

  const vid = $('#lbVideo');
  const referencePreview = $('#lbReferenceImg');
  const referenceWrap = referencePreview.parentElement;
  referenceWrap.classList.remove('reference-preview-active');
  referencePreview.classList.remove('active');
  referencePreview.hidden = true;
  referencePreview.removeAttribute('src');
  if (selVideo) {
    $('#lbImg').hidden = true;
    vid.hidden = false;
    vid.controls = true;
    vid.preload = 'metadata';
    vid.src = '/videos/' + selVideo.file;
    vid.poster = '/images/' + it.file;
    vid.load();
  } else {
    try { vid.pause(); } catch { /* noop */ }
    vid.hidden = true;
    vid.removeAttribute('src');
    $('#lbImg').hidden = false;
    $('#lbImg').src = '/images/' + (selComposite ? selComposite.file : (it.upscaled || it.file));
  }
  setGenerationNameInput(it, selVideo || selComposite || null);
  const focusedPosition = angleItems.length > 1
    ? `${angleViewLabel(it)} · Variation ${angleIndex + 1} of ${angleItems.length}`
    : (generationItems.length > 1
      ? `Generation ${generationIndex + 1} of ${generationItems.length}`
      : 'Rename generation');
  $('#lbTitle').title = focusedPosition;
  $('#lbCompareBtn').hidden = !(!selVideo && !selComposite && it.upscaled);

  // media switcher keeps attached composites with the image they describe.
  const mrow = $('#lbMedia');
  mrow.innerHTML = '';
  const makeMediaTier = (className, label, ariaLabel = label) => {
    const tier = document.createElement('div');
    tier.className = `lb-media-tier ${className}`;
    tier.setAttribute('role', 'group');
    tier.setAttribute('aria-label', ariaLabel);
    const tierLabel = document.createElement('span');
    tierLabel.className = 'lb-media-tier-label';
    tierLabel.textContent = label;
    const options = document.createElement('div');
    options.className = 'lb-media-options';
    tier.append(tierLabel, options);
    mrow.appendChild(tier);
    return options;
  };
  if (angleItems.length > 1) {
    const angleOptions = makeMediaTier('lb-media-generations', 'Camera variations');
    angleItems.forEach((angleItem, index) => {
      const button = document.createElement('button');
      button.className = 'chip angle-group-chip' + (angleItem.id === it.id ? ' active' : '');
      button.innerHTML = `<span class="angle-group-glyph" aria-hidden="true">${angleViewGlyph(angleItem)}</span><span>${escapeHtml(angleViewLabel(angleItem))}</span>`;
      button.title = `Variation ${index + 1} of ${angleItems.length}: ${angleViewLabel(angleItem)}`;
      button.addEventListener('click', () => openLightbox(angleItem.id, 'image'));
      angleOptions.appendChild(button);
    });
  }
  if (generationItems.length > 1) {
    const generationOptions = makeMediaTier('lb-media-generations', 'Generations');
    generationItems.forEach((groupItem, index) => {
      const button = document.createElement('button');
      button.className = 'chip generation-group-chip' + (groupItem.id === it.id ? ' active' : '');
      button.innerHTML = `<span class="lb-generation-label">Generation</span><span class="lb-generation-index">${index + 1}</span>`;
      button.title = `Generation ${index + 1} of ${generationItems.length}`;
      button.setAttribute('aria-label', button.title);
      button.addEventListener('click', () => openLightbox(groupItem.id, 'image'));
      generationOptions.appendChild(button);
    });
  }
  if (generationItems.length > 1 || videos.length || composites.length) {
    const groupedGeneration = generationItems.length > 1;
    const mediaLabel = groupedGeneration ? `Generation ${generationIndex + 1} media` : 'Media';
    const mediaOptions = makeMediaTier(`lb-media-assets${groupedGeneration ? ' nested' : ''}`, mediaLabel);
    const mediaGlyph = (kind) => kind === 'video'
      ? '<svg viewBox="0 0 20 20"><path d="m7 5 7 5-7 5Z"/></svg>'
      : (kind === 'composite'
        ? '<svg viewBox="0 0 20 20"><rect x="3.5" y="5.5" width="10" height="10" rx="2"/><path d="M7 5.5V4a1.5 1.5 0 0 1 1.5-1.5H15A1.5 1.5 0 0 1 16.5 4v7a1.5 1.5 0 0 1-1.5 1.5h-1.5"/></svg>'
        : '<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7" cy="8" r="1.5"/><path d="m5 14 4-4 2.5 2 1.5-1.5 2 3.5"/></svg>');
    const mkChip = (label, key, liked = false, kind = 'image') => {
      const b = document.createElement('button');
      b.className = 'chip' + ((key === 'image' ? (!selVideo && !selComposite) : (selVideo && selVideo.id === key) || (selComposite && 'composite:' + selComposite.id === key)) ? ' active' : '');
      b.innerHTML = `<span class="lb-media-kind-icon" aria-hidden="true">${mediaGlyph(kind)}</span><span>${escapeHtml(label)}</span>${liked ? '<span class="lb-media-like" aria-label="Liked">♥</span>' : ''}`;
      b.addEventListener('click', () => openLightbox(id, key));
      mediaOptions.appendChild(b);
    };
    mkChip('Image', 'image', !!it.liked);
    composites.forEach((composite) => mkChip(composite.label || 'Before + after', 'composite:' + composite.id, false, 'composite'));
    videos.forEach((v, i) => mkChip(`Video ${i + 1}`, v.id, !!v.liked, 'video'));
  }

  const meta = [];
  const metaCopyValues = [];
  const copyableMeta = (label, value) => {
    const text = value == null ? '' : String(value);
    if (!text) return `<b>${escapeHtml(label)}:</b> —`;
    const index = metaCopyValues.push({ label, text }) - 1;
    return `<button class="lightbox-meta-copy" type="button" data-copy-meta="${index}" aria-label="Copy ${escapeHtml(label.toLowerCase())}"><b>${escapeHtml(label)}:</b><span>${escapeHtml(text)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button>`;
  };
  if (selVideo) {
    const info = selVideo.info || {};
    const model = videoEngineLabel(info.engine);
    meta.push(`<b>Model:</b> ${escapeHtml(model)}`);
    const recordedVideoWidth = Math.round(Number(info.width));
    const recordedVideoHeight = Math.round(Number(info.height));
    const fallbackVideoWidth = Math.round(Number(it.width));
    const fallbackVideoHeight = Math.round(Number(it.height));
    const videoWidth = recordedVideoWidth > 0 && recordedVideoHeight > 0 ? recordedVideoWidth : fallbackVideoWidth;
    const videoHeight = recordedVideoWidth > 0 && recordedVideoHeight > 0 ? recordedVideoHeight : fallbackVideoHeight;
    if (videoWidth > 0 && videoHeight > 0) meta.push(`<b>Size:</b> ${videoWidth}×${videoHeight}`);
    meta.push(copyableMeta('Motion', info.motionPrompt || ''));
    if (info.refinedMotionPrompt) meta.push(copyableMeta('Enhanced motion', info.refinedMotionPrompt));
    if (info.durationMs) meta.push(`<b>Generated in:</b> ${formatDuration(info.durationMs)}`);
    if (info.frames && info.fps) {
      const scailFlags = [info.scailMode && `SCAIL ${info.scailMode}`, info.scailMode === 'chunked' && info.scailStableTracking && 'stable', info.scailMode === 'chunked' && info.scailChunkFrames && `${info.scailChunkFrames}f chunks`, info.scailMode === 'chunked' && info.scailChunkOverlap && `${info.scailChunkOverlap}f overlap`].filter(Boolean).join(', ');
      const flags = [info.composite && 'side-by-side', info.faceId && 'Face ID', info.processed === 'upscale' && 'RTX upscale', info.processed === 'interpolate' && 'RIFE pass', info.smooth && `RIFE ${info.smooth}×`, info.fourK && 'RTX 4K', info.engine === 'wan' && info.fast && '4-step', info.sigmaPreset && `sigmas: ${info.sigmaPreset}`, scailFlags, info.drivenAudio && 'audio-driven', info.preservedAudio && 'audio kept', info.endFrame && 'end frame', info.motionVideo && !info.composite && 'motion transfer'].filter(Boolean).join(' · ');
      meta.push(`<b>Playback:</b> ${(info.frames / info.fps).toFixed(1)}s @ ${info.fps}fps${flags ? ' · ' + flags : ''} &nbsp; ${copyableMeta('Seed', info.seed)}`);
      if (info.loras && info.loras.length) meta.push('<b>Video LoRAs:</b> ' + info.loras.map((l) => `${prettyLora(l.name)} (${Number(l.strength).toFixed(2)})`).join(', '));
    } else if (info.seed != null) meta.push(copyableMeta('Seed', info.seed));
  } else {
    const model = galleryImageModelLabel(it);
    if (model) meta.push(`<b>Model:</b> ${escapeHtml(model)}`);
    if (it.editEngine === 'qwen') meta.push(`<b>Sampling:</b> ${it.qwenQuality === 'fast' || (it.qwenQuality == null && Number(it.steps) <= 4) ? 'Fast' : 'Quality'}`);
    meta.push(copyableMeta('Prompt', it.prompt || ''));
    if (selComposite) meta.push(`<b>Composite:</b> ${escapeHtml(selComposite.label || 'Before + after')}`);
    else if (it.mode === 'composite' && it.compositeInfo) meta.push(`<b>Composite:</b> ${escapeHtml(it.compositeInfo.label || 'Saved composite')}`);
    if (angleItems.length > 1) meta.push(`<b>Camera variation set:</b> ${angleViewLabel(it)} · ${angleItems.length} exports`);
    if (it.refinedPrompt) meta.push(copyableMeta('Enhanced', it.refinedPrompt));
    meta.push(`<b>Size:</b> ${it.width}×${it.height} &nbsp; ${copyableMeta('Seed', it.seed)} &nbsp; <b>Steps:</b> ${it.steps} &nbsp; <b>CFG:</b> ${it.cfg}`);
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
  $$('#lbMeta [data-copy-meta]').forEach((button) => button.addEventListener('click', async () => {
    const copy = metaCopyValues[Number(button.dataset.copyMeta)];
    if (!copy) return;
    try {
      await copyTextToClipboard(copy.text);
      button.classList.remove('copied');
      void button.offsetWidth;
      button.classList.add('copied');
      toast(`${copy.label} copied`);
      setTimeout(() => button.classList.remove('copied'), 900);
    } catch {
      toast(`Could not copy ${copy.label.toLowerCase()}`, true);
    }
  }));

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
    b = options.icon
      ? mk(`${actionIconMarkup(options.icon)}<span>${escapeHtml(label)}</span>`, `menu-trigger ${cls || ''}`.trim(), onOpen, { ariaLabel: options.ariaLabel || label, title: options.ariaLabel || label })
      : mk(label, cls, onOpen);
    if (options.icon) b.setAttribute('aria-haspopup', 'menu');
    return b;
  };

  const sourceReference = !selVideo && !selComposite && it.sourceFile
    && (it.mode === 'edit' || it.mode === 't2i');
  const isEditSource = sourceReference && it.mode === 'edit';
  const canContinueCompletedEdit = lightboxContinueEditId === it.id
    && it.mode === 'edit' && !selVideo && !selComposite;
  const imageSaveItems = [];
  if (!selVideo && !selComposite) {
    if (it.upscaled) {
      imageSaveItems.push(
        { label: 'Save upscaled', detail: 'Current image', icon: 'save', action: () => downloadItem(it, 'upscaled') },
        { label: 'Save original', detail: 'Before upscale', icon: 'save', action: () => downloadItem(it, 'original') },
      );
    } else {
      imageSaveItems.push({ label: 'Save image', icon: 'save', action: () => downloadItem(it, 'current') });
    }
    if (it.mode !== 'composite') {
      imageSaveItems.push({
        label: 'Documentation image',
        detail: 'Image + generation details',
        icon: 'documentation',
        action: () => openDocumentationBuilder(it),
      });
    }
    if (Array.isArray(it.regions) && it.regions.length) {
      imageSaveItems.push({
        label: 'Save region map',
        detail: 'Regions + prompts',
        icon: 'documentation',
        action: () => downloadRegionMap(it),
      });
    }
    if (angleItems.length > 1) {
      imageSaveItems.push({ label: 'Save angle composite', detail: 'All camera views', icon: 'composite', action: () => saveImageComposite(it, 'angles') });
    }
    if (sourceReference) {
      imageSaveItems.push({
        label: isEditSource ? 'Save before + after' : 'Save reference + generation',
        detail: isEditSource ? 'Original and edited image' : 'Reference and generated image',
        icon: 'composite',
        action: () => saveImageComposite(it, isEditSource ? 'before-after' : 'reference-generation'),
      });
    }
    if (!selVideo && !selComposite && it.mode === 't2i' && it.imageGuideMode === 'depth' && it.sourceFile) {
      imageSaveItems.push({
        label: 'Save depth composite',
        detail: 'Source, depth map, and generation',
        icon: 'composite',
        action: () => saveImageComposite(it, 'depth-map'),
      });
    }
  }

  if (canContinueCompletedEdit) {
    mk(`${actionIconMarkup('edit')}<span>Continue editing</span>`, 'primary continue-edit-action', () => continueEditingResult(it), {
      ariaLabel: 'Continue editing with this result',
      title: 'Replace the current Edit source with this result',
    });
  }
  if (state.animating.has(it.id)) {
    mk('<span class="spin"></span> Animating…', selVideo ? 'primary' : '', () => {});
  } else if (it.mode !== 'composite') {
    mk(`${actionIconMarkup('video')}<span>${videos.length ? 'Animate again' : 'Animate'}</span>`, canContinueCompletedEdit ? '' : 'primary', () => openAnimateRouteSheet(it));
  }
  if (!selComposite) {
    const liked = selVideo ? !!selVideo.liked : !!it.liked;
    const label = selVideo ? (liked ? 'Unlike video' : 'Like video') : (liked ? 'Unlike' : 'Like');
    const like = mkIcon(liked ? 'heart-fill' : 'heart', label, `like-toggle${liked ? ' liked' : ''}`, () => {
      if (selVideo) setVideoLiked(it, selVideo, !selVideo.liked, $('#lightboxLikeBurst'));
      else toggleItemLike(it, $('#lightboxLikeBurst'));
    });
    like.setAttribute('aria-pressed', String(liked));
  }
  // Reference-backed generations: hold to flash the retained source image.
  if (sourceReference) {
    referencePreview.src = '/images/' + it.sourceFile;
    referencePreview.hidden = false;
    referencePreview.decode?.().catch(() => { /* decoding continues when held */ });
    const holdLabel = isEditSource ? 'Hold: original' : 'Hold: reference';
    const hb = mk(`${actionIconMarkup('original')}<span>${holdLabel}</span>`, 'hold-preview-action', () => {}, {
      ariaLabel: holdLabel,
      title: holdLabel,
    });
    hb.setAttribute('aria-pressed', 'false');
    hb.style.userSelect = 'none';
    hb.style.webkitUserSelect = 'none';
    let referenceFadeToken = 0;
    let referenceSuppressTimer = null;
    const show = async (event) => {
      event.preventDefault();
      const token = ++referenceFadeToken;
      clearTimeout(referenceSuppressTimer);
      hb.classList.add('pressed');
      hb.setAttribute('aria-pressed', 'true');
      // Keep the result underneath during the crossfade. Once the reference
      // is fully opaque, suppress it to prevent a preserved-outpaint edge seam.
      referenceWrap.classList.remove('reference-preview-active');
      try { await referencePreview.decode?.(); } catch { /* use the loaded frame when available */ }
      if (token !== referenceFadeToken || !hb.classList.contains('pressed')) return;
      referencePreview.classList.add('active');
      referenceSuppressTimer = setTimeout(() => {
        if (token === referenceFadeToken && referencePreview.classList.contains('active')) {
          referenceWrap.classList.add('reference-preview-active');
        }
      }, 145);
      try { hb.setPointerCapture(event.pointerId); } catch { /* noop */ }
    };
    const hide = () => {
      const token = ++referenceFadeToken;
      clearTimeout(referenceSuppressTimer);
      hb.classList.remove('pressed');
      hb.setAttribute('aria-pressed', 'false');
      // Restore the result first so the reference fades directly back to it,
      // never through the black viewer background.
      referenceWrap.classList.remove('reference-preview-active');
      requestAnimationFrame(() => {
        if (token === referenceFadeToken) referencePreview.classList.remove('active');
      });
    };
    hb.addEventListener('pointerdown', show);
    hb.addEventListener('pointerup', hide);
    hb.addEventListener('pointercancel', hide);
    hb.addEventListener('pointerleave', hide);
    hb.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Region-prompted images: hold to overlay the color-coded boxes.
  // The annotated export lives in the Save menu with the other files.
  if (!selVideo && !selComposite && Array.isArray(it.regions) && it.regions.length) {
    const rb = mk(`${actionIconMarkup('composite')}<span>Hold: regions</span>`, '', () => {});
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
  }
  if (selVideo) {
    const vinfo = selVideo.info || {};
    const videoUseItems = [];
    if (!vinfo.composite) videoUseItems.push({ label: 'Reuse', detail: 'Settings', icon: 'reuse', tone: 'reuse', action: () => reuseVideo(it, selVideo) });
    // Toggle between the result and the motion video that drove it
    if (vinfo.driveVideoName && !vinfo.composite) {
      let showingInput = false;
      let inputUrl = null;
      const motionButtonMarkup = (result) => `${actionIconMarkup(result ? 'video' : 'motion')}<span>${result ? 'Result video' : 'Motion input'}</span>`;
      const btn = mk(motionButtonMarkup(false), '', async () => {
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
            btn.innerHTML = motionButtonMarkup(true);
          } else {
            lv.src = '/videos/' + selVideo.file;
            lv.play().catch(() => {});
            showingInput = false;
            btn.innerHTML = motionButtonMarkup(false);
          }
        } catch (e) {
          btn.innerHTML = motionButtonMarkup(false);
          toast(e.message, true);
        }
      });
    }
    if (!vinfo.composite) videoUseItems.push({ label: 'Motion input', detail: 'Video tab', icon: 'motion', tone: 'video', action: () => sendVideoAsDrive(it, selVideo) });
    if (videoUseItems.length) mkMenu('Use', '', videoUseItems, { icon: 'use', ariaLabel: 'Use video', menuTitle: 'Use video', tone: 'video' });
    const processItems = [];
    if (!vinfo.composite) {
      processItems.push({ label: 'Upscale video', detail: 'SeedVR2 finish', icon: 'process', action: () => processVideo(it, selVideo, 'upscale') });
      processItems.push({ label: 'Increase FPS', detail: 'RIFE interpolation', icon: 'process', action: () => processVideo(it, selVideo, 'interpolate') });
    }
    if (vinfo.engine === 'scail' && vinfo.driveVideoName && !vinfo.composite) {
      processItems.push({ label: 'Side-by-side', detail: 'Reference and result', icon: 'composite', action: async () => {
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
    if (processItems.length) mkMenu('Process', '', processItems, { icon: 'process', ariaLabel: 'Process video', menuTitle: 'Process video', tone: 'video' });
    const videoSaveItems = [
      { label: 'Save video', detail: 'Original result', icon: 'save', action: () => {
        mirrorGalleryExport({ id: it.id, asset: 'video', videoId: selVideo.id });
        const a = document.createElement('a');
        a.href = '/videos/' + selVideo.file;
        a.download = generationDownloadStem(it, 'kreastudio') + '_v' + (videos.indexOf(selVideo) + 1) + '.mp4';
        a.click();
      } },
      { label: 'Documentation video', detail: 'Source + settings + result together', icon: 'documentation', action: () => saveDocumentationVideo(it, selVideo) },
    ];
    mkMenu('Save', '', videoSaveItems, { icon: 'save', ariaLabel: 'Save video', menuTitle: 'Save video', tone: 'video' });
    mk(`${actionIconMarkup('delete')}<span>Delete video</span>`, 'danger', async () => {
      const lastOfStandalone = it.mode === 'video' && videos.length === 1;
      const msg = lastOfStandalone
        ? 'Delete this video? It\'s the only one on this entry, so the whole gallery item goes with it.'
        : 'Delete this video? The image stays.';
      if (!await askConfirm({ title: 'Delete video?', message: msg.replace(/^Delete this video\?\s*/, ''), confirmLabel: 'Delete video', danger: true })) return;
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
    const imageUseItems = galleryImageDestinationActions(it);
    if (it.sourceItemId && state.items.some((x) => x.id === it.sourceItemId)) {
      imageUseItems.push({ label: 'Original', detail: 'Source image', icon: 'original', action: () => openLightbox(it.sourceItemId) });
    }
    mkMenu('Use', '', imageUseItems, { icon: 'use', ariaLabel: 'Use image', menuTitle: 'Use image', tone: 'image' });
    mk('▤ Move', '', () => openMoveSheet(it));
    if (imageSaveItems.length > 1) {
      mkMenu('Save', '', imageSaveItems, { icon: 'save', ariaLabel: 'Save image', menuTitle: 'Save image', tone: 'image' });
    } else if (imageSaveItems.length === 1) {
      mk('↓ Save', '', imageSaveItems[0].action);
    }
    mk(`${actionIconMarkup('delete')}<span>Delete</span>`, 'danger', async () => {
      const n = videos.length;
      if (!await askConfirm({
        title: 'Delete image?',
        message: n ? `Its ${n} attached video${n > 1 ? 's' : ''} will also be deleted.` : 'This cannot be undone.',
        confirmLabel: 'Delete image',
        danger: true,
      })) return;
      await api('/api/item/' + it.id, { method: 'DELETE' });
      closeLightbox();
      refreshGallery();
    });
  }
}
function closeLightbox(fromPop) {
  closeActionMenu();
  resetLightboxSwipeVisuals();
  $('#lightbox').classList.remove('show');
  const vid = $('#lbVideo');
  try { vid.pause(); } catch { /* noop */ }
  vid.removeAttribute('src');
  vid.load();
  $('#lbReferenceImg').classList.remove('active');
  $('.lightbox-img-wrap').classList.remove('reference-preview-active');
  $('#lbReferenceImg').hidden = true;
  $('#lbReferenceImg').removeAttribute('src');
  state.currentItem = null;
  state.currentMedia = null;
  lightboxContinueEditId = null;
  unlockScroll();
  if (!fromPop && window.history.state && window.history.state.lb) {
    try { history.back(); } catch { /* noop */ }
  }
}

async function processVideo(it, video, kind) {
  if (!it || !video) return;
  const route = kind === 'upscale' ? '/api/video/upscale' : '/api/video/interpolate';
  const label = kind === 'upscale' ? 'Video upscale queued' : 'Frame interpolation queued';
  const requestKey = `animate:${it.id}`;
  try {
    setGenerating(true, 'Queued…');
    state.animating.add(it.id);
    state.pendingGalleryRequests.add(requestKey);
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
  } finally {
    state.pendingGalleryRequests.delete(requestKey);
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
  setAudioChipVisual($('#animAudioChip'), false);
  $('#animAudioTrim').hidden = true;
  syncAnimateDurationLimit();
  $('#animateSheet').classList.add('show');
}
$('#animDur').addEventListener('input', syncAnimateDurationLimit);
$('#animFree').addEventListener('input', () => { $('#animFreeVal').textContent = $('#animFree').value; });
$('#vidFree').addEventListener('input', updateVideoTuningSummary);
$('#animEnhance').addEventListener('click', () => $('#animEnhance').classList.toggle('active'));
$$('#mediaFilter button').forEach((b) => b.addEventListener('click', () => {
  state.mediaFilter = b.dataset.f;
  const buttons = $$('#mediaFilter button');
  buttons.forEach((x) => {
    const active = x === b;
    x.classList.toggle('active', active);
    x.setAttribute('aria-pressed', String(active));
  });
  $('#mediaFilter').style.setProperty('--filter-index', String(buttons.indexOf(b)));
  renderGrid();
}));
$('#likesFilter').addEventListener('click', () => {
  state.likesOnly = !state.likesOnly;
  $('#likesFilter').setAttribute('aria-pressed', String(state.likesOnly));
  renderGrid();
});
$('#lbImg').addEventListener('click', handleLightboxTap);
$('#lbVideo').addEventListener('pointerdown', handleLightboxVideoPointerDown);
$('#lbVideo').addEventListener('pointerup', handleLightboxVideoPointerUp);
$('#lbVideo').addEventListener('pointercancel', () => { lightboxVideoPointer = null; });
$('#lbVideo').addEventListener('click', (event) => {
  if (!suppressLightboxVideoClick) return;
  suppressLightboxVideoClick = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
function closeGallerySort() {
  $('#gallerySort').classList.remove('open');
  $('#gallerySortTrigger').setAttribute('aria-expanded', 'false');
  $('#sortSeg').setAttribute('aria-hidden', 'true');
  $('#sortSeg').inert = true;
}
function syncGallerySortControl() {
  const mode = ['new', 'active', 'old', 'az'].includes(state.sortMode) ? state.sortMode : 'new';
  state.sortMode = mode;
  const buttons = $$('#sortSeg button');
  const selected = buttons.find((button) => button.dataset.sort === mode) || buttons[0];
  buttons.forEach((button) => {
    const active = button === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-selected', String(active));
  });
  $('#gallerySortLabel').textContent = selected?.querySelector('span')?.textContent.trim() || 'Newest';
}
$('#gallerySortTrigger').addEventListener('click', () => {
  const open = !$('#gallerySort').classList.contains('open');
  closeGallerySort();
  if (open) {
    $('#gallerySort').classList.add('open');
    $('#gallerySortTrigger').setAttribute('aria-expanded', 'true');
    $('#sortSeg').setAttribute('aria-hidden', 'false');
    $('#sortSeg').inert = false;
  }
});
$$('#sortSeg button').forEach((b) => b.addEventListener('click', () => {
  state.sortMode = b.dataset.sort;
  syncGallerySortControl();
  saveForm();
  closeGallerySort();
  renderGrid();
}));
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('#gallerySort')) closeGallerySort();
});
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
  btn.innerHTML = `${actionIconMarkup('eye')}<span>Auto from image</span>`;
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
  const requestKey = `animate:${it.id}`;
  try {
    state.animating.add(it.id);
    state.pendingGalleryRequests.add(requestKey);
    renderGrid();
    if (state.currentItem && state.currentItem.id === it.id) openLightbox(it.id);
    await api('/api/animate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    toast('Video queued — LTX 2.3');
  } catch (e) {
    state.animating.delete(it.id);
    renderGrid();
    toast(e.message, true);
  } finally {
    state.pendingGalleryRequests.delete(requestKey);
  }
});
$('#lbClose').addEventListener('click', closeLightbox);
$('#lbCompareBtn').addEventListener('click', () => {
  if (state.currentItem && state.currentItem.upscaled) openCompare(state.currentItem);
});

/* Swipe left/right in the lightbox to move between generations */
(() => {
  const wrap = document.querySelector('.lightbox-img-wrap');
  const preview = $('#lbSwipePreview');
  let swipe = null;
  let animationToken = 0;
  let pendingNavigationItem = null;

  const currentMedia = () => ($('#lbVideo').hidden ? $('#lbImg') : $('#lbVideo'));

  function clearSwipeVisuals() {
    animationToken += 1;
    [$('#lbImg'), $('#lbVideo'), preview].forEach((element) => {
      element.getAnimations().forEach((animation) => animation.cancel());
      element.style.transform = '';
      element.style.opacity = '';
    });
    preview.hidden = true;
    preview.removeAttribute('src');
    wrap.classList.remove('is-swiping', 'is-settling');
    swipe = null;
    pendingNavigationItem = null;
  }
  resetLightboxSwipeVisuals = clearSwipeVisuals;

  function setSwipeNeighbor(direction) {
    if (!swipe || swipe.direction === direction) return;
    swipe.direction = direction;
    swipe.neighbor = state.currentItem ? galleryNavigationTarget(state.currentItem, direction) : null;
    if (!swipe.neighbor) {
      preview.hidden = true;
      preview.removeAttribute('src');
      return;
    }
    preview.src = '/images/' + (swipe.neighbor.upscaled || swipe.neighbor.file);
    preview.hidden = false;
  }

  function renderLightboxSwipe(rawDx) {
    if (!swipe) return;
    const width = Math.max(1, wrap.clientWidth);
    const direction = rawDx < 0 ? 1 : -1;
    setSwipeNeighbor(direction);
    const dx = swipe.neighbor ? rawDx : rawDx * 0.22;
    const progress = Math.min(1, Math.abs(dx) / width);
    const side = direction > 0 ? width : -width;
    swipe.dx = dx;
    swipe.current.style.transform = `translate3d(${dx}px, 0, 0) scale(${1 - progress * 0.018})`;
    swipe.current.style.opacity = String(1 - progress * 0.22);
    if (swipe.neighbor) {
      preview.style.transform = `translate3d(${side + dx}px, 0, 0) scale(${0.985 + progress * 0.015})`;
      preview.style.opacity = String(0.46 + progress * 0.54);
    }
    wrap.classList.add('is-swiping');
  }

  function finishLightboxSwipe(commit) {
    if (!swipe) return;
    const currentSwipe = swipe;
    const width = Math.max(1, wrap.clientWidth);
    const side = currentSwipe.direction > 0 ? width : -width;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 1 : (commit ? 210 : 260);
    const easing = commit ? 'cubic-bezier(.2,.78,.22,1)' : 'cubic-bezier(.18,.82,.22,1)';
    const token = ++animationToken;
    if (commit && currentSwipe.neighbor) pendingNavigationItem = currentSwipe.neighbor;
    wrap.classList.add('is-settling');
    const animations = [currentSwipe.current.animate([
      { transform: currentSwipe.current.style.transform || 'translate3d(0,0,0)', opacity: currentSwipe.current.style.opacity || 1 },
      { transform: `translate3d(${commit ? -side : 0}px,0,0) scale(${commit ? 0.98 : 1})`, opacity: commit ? 0.18 : 1 },
    ], { duration, easing, fill: 'forwards' })];
    if (currentSwipe.neighbor) {
      animations.push(preview.animate([
        { transform: preview.style.transform, opacity: preview.style.opacity || 0.46 },
        { transform: `translate3d(${commit ? 0 : side}px,0,0) scale(${commit ? 1 : 0.985})`, opacity: commit ? 1 : 0.46 },
      ], { duration, easing, fill: 'forwards' }));
    }
    Promise.all(animations.map((animation) => animation.finished.catch(() => null))).then(() => {
      if (token !== animationToken) return;
      const next = commit ? currentSwipe.neighbor : null;
      clearSwipeVisuals();
      if (next) openLightbox(next.id);
      setTimeout(() => { lightboxSwipeSuppressTap = false; }, commit ? 280 : 80);
    });
  }

  wrap.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (e.target.tagName === 'VIDEO') {
      // allow swiping on the video body, but not over the control bar
      const r = e.target.getBoundingClientRect();
      if (e.touches[0].clientY > r.bottom - 72) return;
    }
    // A committed swipe owns its destination immediately, before the settle
    // animation or image decode completes. Sync to that destination before a
    // rapid follow-up gesture so it advances again instead of starting over.
    const pending = pendingNavigationItem;
    if (pending) openLightbox(pending.id);
    else clearSwipeVisuals();
    const t = e.touches[0];
    const now = performance.now();
    swipe = {
      x0: t.clientX,
      y0: t.clientY,
      t0: now,
      lastX: t.clientX,
      lastTime: now,
      velocityX: 0,
      dx: 0,
      direction: 0,
      neighbor: null,
      current: currentMedia(),
      locked: false,
    };
  }, { passive: true });

  wrap.addEventListener('touchmove', (e) => {
    if (!swipe || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - swipe.x0;
    const dy = t.clientY - swipe.y0;
    if (!swipe.locked) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.82) {
        clearSwipeVisuals();
        return;
      }
      swipe.locked = true;
      lightboxSwipeSuppressTap = true;
    }
    e.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(1, now - swipe.lastTime);
    swipe.velocityX = (t.clientX - swipe.lastX) / elapsed;
    swipe.lastX = t.clientX;
    swipe.lastTime = now;
    renderLightboxSwipe(dx);
  }, { passive: false });

  wrap.addEventListener('touchend', (e) => {
    if (!swipe) return;
    const t = e.changedTouches[0];
    const rawDx = t.clientX - swipe.x0;
    if (!swipe.locked) {
      clearSwipeVisuals();
      return;
    }
    renderLightboxSwipe(rawDx);
    const velocity = Math.abs(swipe.velocityX) > 0.05
      ? swipe.velocityX
      : rawDx / Math.max(1, performance.now() - swipe.t0);
    const commit = !!swipe.neighbor
      && (Math.abs(rawDx) >= wrap.clientWidth * 0.2 || Math.abs(velocity) >= 0.48);
    if (!swipe.neighbor) toast(rawDx < 0 ? 'Last item' : 'Newest item');
    finishLightboxSwipe(commit);
  }, { passive: true });
  wrap.addEventListener('touchcancel', () => finishLightboxSwipe(false), { passive: true });
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
  const isCurrent = typeof arguments[1] === 'function' ? arguments[1] : () => true;
  const names = Array.isArray(item.refImages) ? item.refImages.filter(Boolean).slice(0, 3) : [];
  const refs = [null, null, null];
  const missing = [];
  for (let index = 0; index < names.length; index += 1) {
    try {
      refs[index] = await restoreEditReference(names[index], item, index);
      if (!isCurrent()) return [];
    } catch {
      missing.push(`reference image ${index + 1}`);
    }
  }
  // Very early edits did not retain refImages, but do have a source copy.
  if (!refs[0] && item.sourceFile) {
    try {
      refs[0] = await restoreEditReference('', item, 0);
      if (!isCurrent()) return [];
    } catch {
      missing.push('reference image 1');
    }
  }
  if (isCurrent()) state.refs = refs;
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
  const isCurrent = typeof arguments[1] === 'function' ? arguments[1] : () => true;
  clearKreaMask(true);
  if (!item.maskImageName || (!state.editOutpaint && !EDIT_MASK_ENGINES.has(state.editEngine))) return false;
  try {
    const response = await fetch('/api/input?name=' + encodeURIComponent(item.maskImageName));
    if (!response.ok) throw new Error('missing mask');
    const url = URL.createObjectURL(await response.blob());
    if (!isCurrent()) {
      URL.revokeObjectURL(url);
      return false;
    }
    state.kreaMask = { name: item.maskImageName, url };
    state.kreaMaskPreview = url;
    state.kreaMaskDirty = false;
    state.kreaMaskKind = ['smart', 'box', 'brush'].includes(item.editMaskMode) ? item.editMaskMode : 'brush';
    state.kreaMaskTool = state.kreaMaskKind;
    if (state.editOutpaint) {
      state.editOutpaintFeather = Number.isFinite(Number(item.editOutpaint?.feather))
        ? Math.max(0, Math.min(25, Math.round(Number(item.editOutpaint.feather)))) : 12;
      state.editOutpaintMaskOffset = Number.isFinite(Number(item.editOutpaint?.maskOffset))
        ? Math.max(-15, Math.min(15, Math.round(Number(item.editOutpaint.maskOffset)))) : 0;
    } else {
      state.kreaMaskFeather = Math.max(0, Math.min(64, Number(item.editMaskFeather) || 0));
    }
    state.editMaskInfluence = Math.max(25, Math.min(100, Math.round(Number(item.editMaskInfluence) || 78)));
    state.editMaskExpand = Math.max(6, Math.min(32, Math.round(Number(item.editMaskExpand) || 14)));
    // Saved mask files already contain their final (possibly inverted) pixels.
    state.kreaMaskInvert = false;
    return true;
  } catch {
    return false;
  }
}

function reuseRequestCurrent(options = {}) {
  return !options.desktopToken || state.desktopReuseToken === options.desktopToken;
}

async function reuseItem(it, useEnhanced) {
  const options = arguments[2] || {};
  // Enhanced generations: ask whether to reuse the enhanced text directly
  // (skips re-running the LLM) or the original prompt with enhance on.
  const hasEnhancedRegions = Array.isArray(it.regions)
    && it.regions.some((region) => region && region.refinedDescription);
  if (useEnhanced === undefined && (it.refinedPrompt || hasEnhancedRegions)) {
    state.reuseTarget = it;
    $('#reuseSheet').classList.add('show');
    return;
  }
  const targetView = it.mode === 'edit' ? 'edit' : 'create';
  const restoringEdit = targetView === 'edit';
  const restoredPrompt = useEnhanced ? (it.refinedPrompt || it.prompt || '') : (it.prompt || '');
  const restoredRegions = Array.isArray(it.regions) ? it.regions.map((region) => Object.assign({}, region, {
    description: useEnhanced
      ? (region.refinedDescription || region.description || '')
      : (region.description || ''),
    refinedDescription: undefined,
    enhance: useEnhanced ? false : region.enhance !== false,
    refUrl: region.refImageName ? `/api/input?name=${encodeURIComponent(region.refImageName)}` : '',
  })) : [];

  state.prompts[targetView] = restoredPrompt;
  state.enhance = useEnhanced ? false : !!it.enhance;
  state.customDims = true;
  state.width = it.width || 1024;
  state.height = it.height || 1024;
  state.loras = restoringEdit ? state.loras : restoredLoraList(it.loras);
  state.regions = restoringEdit ? state.regions : restoredRegions;
  if (!restoringEdit) {
    state.createRef = null;
    state.createMatchSource = false;
    state.createMatchNative = false;
    state.createGuideMode = it.imageGuideMode === 'depth' ? 'depth' : 'image';
    state.createInfluence = createInfluenceFromDenoise(it.denoise);
    state.createDepthStrength = Math.max(5, Math.min(200, Math.round((Number(it.depthStrength) || 1) * 100)));
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
    state.editOutpaint = OUTPAINT_EDIT_ENGINES.has(state.editEngine) && !!it.editOutpaint;
    state.editOutpaintPosition = ['start', 'center', 'end'].includes(it.editOutpaint?.position)
      ? it.editOutpaint.position
      : 'center';
    state.editOutpaintOffsetX = optionalUnitOffset(it.editOutpaint?.offsetX);
    state.editOutpaintOffsetY = optionalUnitOffset(it.editOutpaint?.offsetY);
    state.editOutpaintScale = Math.max(45, Math.min(100, Math.round(Number(it.editOutpaint?.scale) || 100)));
    state.editOutpaintFeather = Number.isFinite(Number(it.editOutpaint?.feather))
      ? Math.max(0, Math.min(25, Math.round(Number(it.editOutpaint.feather)))) : 12;
    state.editOutpaintMaskOffset = Number.isFinite(Number(it.editOutpaint?.maskOffset))
      ? Math.max(-15, Math.min(15, Math.round(Number(it.editOutpaint.maskOffset)))) : 0;
    state.editRefSlots = Math.max(1, Math.min(3, (Array.isArray(it.refImages) ? it.refImages.filter(Boolean).length : 0) || 1));
    if (state.editEngine === 'qwen') {
      state.qwenQuality = it.qwenQuality === 'fast' || (it.qwenQuality == null && Number(it.steps) <= 4)
        ? 'fast' : 'quality';
    }
    state.editLoras = restoredLoraList(it.loras);
    state.editLorasByEngine[state.editEngine] = state.editLoras;
    state.editAspectOverride = it.editAspectOverride === true;
    state.editWidth = it.width || 1024;
    state.editHeight = it.height || 1024;
    state.editMp = state.editAspectOverride
      ? nearestResolutionMegapixels(state.editWidth, state.editHeight)
      : 1;
    state.editAspect = restoredEditAspect(state.editWidth, state.editHeight);
    state.editUpscaleEnabled = !!it.postUpscale;
    state.editUpscaleResolution = [1440, 2160, 3840].includes(Number(it.postUpscale?.resolution)) ? Number(it.postUpscale.resolution) : 2160;
    state.editUpscaleProfile = it.postUpscale?.profile === 'balanced' ? 'balanced' : 'sharp';
    state.editUpscaleNoise = ['off', 'low', 'medium'].includes(it.postUpscale?.noise) ? it.postUpscale.noise : 'low';
    const angle = it.angleView && typeof it.angleView === 'object' ? it.angleView : null;
    state.qwenAngles = angle && QWEN_ANGLE_IDS.has(angle.view) ? [angle.view] : [];
    state.qwenAngleElevations = angle && QWEN_ANGLE_ELEVATIONS.some((option) => option.id === angle.elevation)
      ? [angle.elevation] : [];
    state.qwenAngleDistances = angle && QWEN_ANGLE_DISTANCES.some((option) => option.id === angle.distance)
      ? [angle.distance] : [];
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
  const restoredMode = restoringEdit ? 'edit' : 'create';
  state.generationTuning[restoredMode] = normalizeGenerationTuning(restoredMode, {
    seed: $('#seedInput').value,
    steps: $('#stepsInput').value,
    cfg: $('#cfgInput').value,
    batch: $('#batchInput').value,
    denoise: restoringEdit ? $('#denoiseInput').value : undefined,
  });

  closeLightbox();
  setView(restoringEdit ? 'edit' : 'create', restoringEdit ? {} : { createMode: restoredRegions.length ? 'region' : 'image' });
  // setView preserves the outgoing draft. When reusing within the same mode,
  // re-apply the saved prompt after that preservation step so it cannot be
  // overwritten by the prior text in the composer.
  state.prompts[targetView] = restoredPrompt;
  setPromptDraft(restoredPrompt);
  updatePromptClear();
  let missing = [];
  if (restoringEdit) {
    if (!options.silent) toast('Restoring settings and reference images…');
    missing = await restoreEditReferences(it, () => reuseRequestCurrent(options));
    if (!reuseRequestCurrent(options)) return;
    if (it.maskImageName && !(await restoreKreaMask(it, () => reuseRequestCurrent(options)))) missing.push('fill mask');
    if (!reuseRequestCurrent(options)) return;
    renderRefs();
  } else if (restoredRegions.length) {
    renderRegionEditor();
  } else if ((Array.isArray(it.refImages) && it.refImages.some(Boolean)) || it.sourceFile) {
    if (!options.silent) toast('Restoring settings and image guide…');
    try {
      const restoredGuide = await restoreCreateImageGuide(it);
      if (!reuseRequestCurrent(options)) return;
      state.createRef = restoredGuide;
    }
    catch { missing.push('image guide'); }
  }
  if (!reuseRequestCurrent(options)) return;
  renderEnhance();
  renderAspects();
  renderDims();
  renderLoras();
  renderEditUpscale();
  renderQwenAngleTool();
  renderCreateImageGuide();
  saveForm();

  if (options.silent) return;
  if (missing.length) {
    toast(`Settings loaded — couldn't restore: ${[...new Set(missing)].join(', ')} (re-add manually)`);
  } else if (useEnhanced) {
    toast('Enhanced prompt loaded — prompt enhance turned off');
  } else {
    toast('Settings, inputs, prompt, and LoRAs loaded');
  }
}

/* Reuse a video generation: restore engine, prompt, settings and every
   input asset (source image, audio, end frame, motion video) in the
   Video tab. Assets are pulled back from ComfyUI's input dir. */
async function reuseVideo(it, v) {
  const options = arguments[2] || {};
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
  $('#seedInput').value = info.seed !== undefined && info.seed !== null ? String(info.seed) : '';
  $('#batchInput').value = 1;
  state.generationTuning.video = normalizeGenerationTuning('video', {
    seed: $('#seedInput').value,
    batch: 1,
    steps: 1,
    cfg: 1,
  });
  state.enhance = !!info.enhance;
  renderEnhance();
  $('#vid4k').classList.toggle('active', !!info.fourK);
  $('#vidQuality').classList.toggle('active', engine === 'wan' && info.fast === false);
  if (info.motionFreedom !== undefined && info.motionFreedom !== null) {
    $('#vidFree').value = info.motionFreedom;
  }
  const dur = $('#vidDur');
  const secs = Number(info.seconds) || (info.frames && info.fps ? Math.round(info.frames / info.fps) : 5);
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
        if (!reuseRequestCurrent(options)) return;
        const buf = await blob.arrayBuffer();
        const res = await api('/api/upload', {
          method: 'POST',
          headers: { 'x-filename': encodeURIComponent(it.file) },
          body: buf,
        });
        if (!reuseRequestCurrent(options)) return;
        state.vidRef = { name: res.name, url: '/images/' + it.file, w: info.srcWidth || it.width || 1024, h: info.srcHeight || it.height || 1024, srcItemId: it.id };
      } else if (info.imageName) {
        // standalone item: the true source still sits in ComfyUI's input dir
        const blob = await inputBlob(info.imageName);
        if (!reuseRequestCurrent(options)) return;
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
      if (!reuseRequestCurrent(options)) return;
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await audioCtx.decodeAudioData(raw.slice(0));
      if (!reuseRequestCurrent(options)) return;
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
      if (!reuseRequestCurrent(options)) return;
      state.vidEnd = { name: info.endImageName, url: URL.createObjectURL(blob) };
    } catch { missing.push('end frame'); }
  }
  if (endFrameRefresh.vidEnd) endFrameRefresh.vidEnd();

  // Face ID reference (LTX reference-to-video)
  if (engine === 'ltx' && info.faceImageName) {
    try {
      const blob = await inputBlob(info.faceImageName);
      if (!reuseRequestCurrent(options)) return;
      state.vidFace = { name: info.faceImageName, url: URL.createObjectURL(blob) };
    } catch { missing.push('face reference'); }
  }

  // Motion video (SCAIL) + its trim window
  if (engine === 'scail' && info.driveVideoName) {
    try {
      const blob = await inputBlob(info.driveVideoName);
      if (!reuseRequestCurrent(options)) return;
      const urlObj = URL.createObjectURL(blob);
      const d = { name: info.driveVideoName, url: urlObj, label: 'reused motion video', hasAudio: info.driveHasAudio === true };
      state.vidDrive = d;
      $('#vidDriveLabel').textContent = d.label;
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.src = urlObj;
      probe.onloadedmetadata = () => {
        if (!reuseRequestCurrent(options)) {
          URL.revokeObjectURL(urlObj);
          return;
        }
        d.dur = probe.duration || 0;
        const s = Math.min(info.driveStartSeconds || 0, d.dur);
        d.trimStart = s;
        d.trimEnd = info.driveDurSeconds ? Math.min(d.dur, s + info.driveDurSeconds) : d.dur;
        renderVidDrive();
      };
    } catch { missing.push('motion video'); }
  }

  if (!reuseRequestCurrent(options)) return;
  renderLoras();
  renderVidAttach();
  updateVideoPanels();
  saveForm();
  if (!options.silent) {
    toast(missing.length
      ? `Settings loaded — couldn't restore: ${missing.join(', ')} (re-add manually)`
      : 'Video settings + inputs loaded in the Video tab');
  }
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

async function downloadRegionMap(it) {
  try {
    const canvas = await buildRegionOverlay(it);
    canvas.toBlob((blob) => {
      if (!blob) return toast('Export failed', true);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = generationDownloadStem(it, 'kreastudio') + '_regions.png';
      mirrorExportFile(blob, link.download);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
  } catch (error) {
    toast(error.message, true);
  }
}

const documentationBuilderState = {
  item: null,
  image: null,
  sources: { original: null, region: null },
  metadata: [],
  selected: new Set(),
  layout: 'contact',
  theme: 'dark',
  regionMap: true,
  sourceRequest: 0,
  textScale: 100,
  shade: 72,
};

function hasDocumentationValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function documentationAnglePrompt(item) {
  if (hasDocumentationValue(item && item.anglePrompt)) return String(item.anglePrompt);
  const angle = item && item.angleView;
  if (!angle || typeof angle !== 'object') return '';
  const viewLabels = {
    front: 'front view',
    'front-right': 'front-right quarter view',
    right: 'right side view',
    'back-right': 'back-right quarter view',
    back: 'back view',
    'back-left': 'back-left quarter view',
    left: 'left side view',
    'front-left': 'front-left quarter view',
  };
  let instruction = '';
  if (item.editEngine === 'qwen') {
    instruction = [
      '<sks>',
      angle.view ? viewLabels[angle.view] : '',
      angle.elevation ? `${angle.elevation} shot` : '',
      angle.distance || '',
    ].filter(Boolean).join(' ');
  } else {
    const camera = [
      angle.view && viewLabels[angle.view] ? `from a ${viewLabels[angle.view]}` : '',
      angle.elevation ? `using a ${angle.elevation} shot` : '',
      angle.distance ? `with ${angle.distance} framing` : '',
    ].filter(Boolean).join(', ');
    instruction = [
      `Re-render the same subject ${camera}`,
      'Preserve the subject identity, clothing, proportions, materials, lighting, environment, and visual style',
      'Infer unseen surfaces as a coherent continuation of the same subject',
      'Show one image from only this new viewpoint; do not make a collage, split screen, turntable, or duplicate subject',
    ].join('. ');
  }
  return [instruction, String(item.prompt || '').trim()].filter(Boolean).join('. ');
}

function documentationMetadata(item) {
  const metadata = [];
  const add = (key, label, value) => {
    if (hasDocumentationValue(value)) metadata.push({ key, label, value: String(value) });
  };
  add('model', 'Model', galleryImageModelLabel(item));
  const prompt = documentationAnglePrompt(item) || item.refinedPrompt || item.prompt;
  add('prompt', 'Prompt', prompt);
  if (item.prompt && prompt && prompt !== item.prompt) add('originalPrompt', 'Original prompt', item.prompt);
  if (hasDocumentationValue(item.width) && hasDocumentationValue(item.height)) add('size', 'Size', `${item.width} × ${item.height}`);
  add('seed', 'Seed', item.seed);
  add('steps', 'Steps', item.steps);
  add('cfg', 'CFG', item.cfg);
  if (Array.isArray(item.loras) && item.loras.length) {
    const loras = item.loras.map((lora) => {
      const rawName = typeof lora === 'string' ? lora : lora && lora.name;
      if (!hasDocumentationValue(rawName)) return '';
      const name = prettyLora(String(rawName));
      const strength = lora && typeof lora === 'object' && hasDocumentationValue(lora.strength) && Number.isFinite(Number(lora.strength))
        ? ` (${Number(lora.strength).toFixed(2)})` : '';
      return name ? name + strength : '';
    }).filter(Boolean);
    if (loras.length) add('loras', 'LoRAs', loras.join(', '));
  }
  if (item.editEngine === 'qwen') {
    add('sampling', 'Sampling', item.qwenQuality === 'fast' || (item.qwenQuality == null && Number(item.steps) <= 4) ? 'Fast' : 'Quality');
  }
  if (item.durationMs) add('duration', 'Generated in', formatDuration(item.durationMs));
  if (item.upscaleInfo) {
    const info = item.upscaleInfo;
    if (info.engine === 'ultimate') {
      const parts = ['Ultimate SD'];
      if (hasDocumentationValue(info.scaleFactor)) parts.push(`${info.scaleFactor}×`);
      parts.push('Prompt-guided');
      add('upscale', 'Upscale', parts.join(' · '));
    } else {
      const parts = ['SeedVR2'];
      if (hasDocumentationValue(info.profile)) parts.push(info.profile === 'sharp' ? 'Sharp' : 'Balanced');
      if (info.upscaleMode === 'scale' && hasDocumentationValue(info.scaleFactor)) parts.push(`${info.scaleFactor}×`);
      if (hasDocumentationValue(info.resolution)) parts.push(`${info.resolution}p${info.upscaleMode === 'scale' ? ' short edge' : ' target'}`);
      add('upscale', 'Upscale', parts.join(' · '));
    }
  }
  return metadata;
}

function selectedDocumentationMetadata() {
  return documentationBuilderState.metadata.filter((entry) => documentationBuilderState.selected.has(entry.key));
}

function setDocumentationFont(ctx, weight, size) {
  ctx.font = `${weight} ${Math.max(9, Math.round(size))}px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

function setDocumentationMonoFont(ctx, weight, size) {
  ctx.font = `${weight} ${Math.max(9, Math.round(size))}px ui-monospace, "SFMono-Regular", Consolas, monospace`;
}

function truncateCanvasText(ctx, text, maxWidth) {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  let output = value;
  while (output.length > 1 && ctx.measureText(output + '…').width > maxWidth) output = output.slice(0, -1);
  return output.trimEnd() + '…';
}

function wrapCanvasText(ctx, text, maxWidth, maxLines = Infinity) {
  const paragraphs = String(text || '').split(/\n+/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      } else {
        line = candidate;
      }
    }
    if (lines.length >= maxLines) break;
    if (line) lines.push(line);
  }
  if (!lines.length) lines.push('');
  if (lines.length >= maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = truncateCanvasText(ctx, lines[maxLines - 1], maxWidth);
    const sourceWords = String(text || '').trim().split(/\s+/).length;
    const visibleWords = lines.join(' ').trim().split(/\s+/).filter(Boolean).length;
    if (visibleWords < sourceWords && !lines[maxLines - 1].endsWith('…')) {
      lines[maxLines - 1] = truncateCanvasText(ctx, lines[maxLines - 1] + '…', maxWidth);
    }
  }
  return lines;
}

function drawDocumentationLines(ctx, lines, x, y, lineHeight) {
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function renderDocumentationContactCard(canvas, ctx, image, metadata) {
  const width = image.naturalWidth || image.width || 1024;
  const imageHeight = image.naturalHeight || image.height || 1024;
  const density = Math.max(.55, width / 1000) * (documentationBuilderState.textScale / 100);
  const pad = Math.max(22, Math.round(width * .042));
  const labelSize = Math.max(9, 12 * density);
  const bodySize = Math.max(14, 22 * density);
  const bodyLine = Math.round(bodySize * 1.38);
  const labelLine = Math.round(labelSize * 1.55);
  const maxWidth = width - pad * 2;
  const byKey = new Map(metadata.map((entry) => [entry.key, entry]));
  const promptEntries = ['prompt', 'originalPrompt'].map((key) => byKey.get(key)).filter(Boolean);
  const loras = byKey.get('loras');
  const facts = metadata.filter((entry) => !['prompt', 'originalPrompt', 'loras'].includes(entry.key));
  const promptLayouts = promptEntries.map((entry) => {
    setDocumentationFont(ctx, 500, bodySize);
    return { entry, lines: wrapCanvasText(ctx, entry.value, maxWidth) };
  });
  setDocumentationFont(ctx, 500, bodySize * .9);
  const loraLines = loras ? wrapCanvasText(ctx, loras.value, maxWidth) : [];
  const columns = width < 700 ? 2 : 3;
  const factRows = Math.ceil(facts.length / columns);
  const factCellHeight = labelLine + bodyLine + Math.round(pad * .18);
  let cardHeight = metadata.length ? pad : 0;
  promptLayouts.forEach((layout, index) => {
    if (index) cardHeight += Math.round(pad * .38);
    cardHeight += labelLine + layout.lines.length * bodyLine;
  });
  if (factRows) cardHeight += (promptLayouts.length ? Math.round(pad * .55) : 0) + Math.max(1, Math.round(width / 1200)) + Math.round(pad * .42) + factRows * factCellHeight;
  if (loraLines.length) cardHeight += ((promptLayouts.length || factRows) ? Math.round(pad * .4) : 0) + labelLine + loraLines.length * Math.round(bodyLine * .92);
  if (metadata.length) cardHeight += pad;
  cardHeight = Math.ceil(cardHeight);

  canvas.width = width;
  canvas.height = imageHeight + cardHeight;
  const dark = documentationBuilderState.theme === 'dark';
  const background = dark ? '#050506' : '#ffffff';
  const ink = dark ? '#f7f7f8' : '#0a0a0b';
  const muted = dark ? 'rgba(247,247,248,.56)' : 'rgba(10,10,11,.56)';
  const line = dark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.14)';
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.drawImage(image, 0, 0, width, imageHeight);
  if (!metadata.length) return;
  ctx.fillStyle = line;
  ctx.fillRect(0, imageHeight, width, Math.max(1, Math.round(width / 1200)));

  let y = imageHeight + pad;
  ctx.textBaseline = 'top';
  promptLayouts.forEach(({ entry, lines }, index) => {
    if (index) y += Math.round(pad * .38);
    ctx.fillStyle = muted;
    setDocumentationMonoFont(ctx, 600, labelSize);
    ctx.fillText(entry.label, pad, y);
    y += labelLine;
    ctx.fillStyle = ink;
    setDocumentationFont(ctx, 500, bodySize);
    y = drawDocumentationLines(ctx, lines, pad, y, bodyLine);
  });

  if (factRows) {
    if (promptLayouts.length) y += Math.round(pad * .55);
    ctx.fillStyle = line;
    ctx.fillRect(pad, y, maxWidth, Math.max(1, Math.round(width / 1100)));
    y += Math.round(pad * .4);
    const gap = Math.round(pad * .55);
    const cellWidth = (maxWidth - gap * (columns - 1)) / columns;
    facts.forEach((entry, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = pad + col * (cellWidth + gap);
      const cellY = y + row * factCellHeight;
      ctx.fillStyle = muted;
      setDocumentationMonoFont(ctx, 600, labelSize);
      ctx.fillText(entry.label, x, cellY);
      ctx.fillStyle = ink;
      setDocumentationFont(ctx, 500, bodySize);
      ctx.fillText(truncateCanvasText(ctx, entry.value, cellWidth), x, cellY + labelLine);
    });
    y += factRows * factCellHeight;
  }
  if (loraLines.length) {
    if (promptLayouts.length || factRows) y += Math.round(pad * .4);
    ctx.fillStyle = muted;
    setDocumentationMonoFont(ctx, 600, labelSize);
    ctx.fillText(loras.label, pad, y);
    y += labelLine;
    ctx.fillStyle = ink;
    setDocumentationFont(ctx, 500, bodySize * .9);
    drawDocumentationLines(ctx, loraLines, pad, y, Math.round(bodyLine * .92));
  }
}

function renderDocumentationOverlay(canvas, ctx, image, metadata) {
  const width = image.naturalWidth || image.width || 1024;
  const height = image.naturalHeight || image.height || 1024;
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);
  if (!metadata.length) return;
  const density = Math.max(.55, Math.min(width / 1000, height / 850)) * (documentationBuilderState.textScale / 100);
  const pad = Math.max(20, Math.round(width * .04));
  const labelSize = Math.max(9, 12 * density);
  const bodySize = Math.max(13, 21 * density);
  const bodyLine = Math.round(bodySize * 1.35);
  const labelLine = Math.round(labelSize * 1.5);
  const maxWidth = width - pad * 2;
  const byKey = new Map(metadata.map((entry) => [entry.key, entry]));
  const promptLayouts = ['prompt', 'originalPrompt'].map((key) => byKey.get(key)).filter(Boolean).map((entry) => {
    setDocumentationFont(ctx, 500, bodySize);
    return { entry, lines: wrapCanvasText(ctx, entry.value, maxWidth, entry.key === 'prompt' ? 4 : 2) };
  });
  const facts = metadata.filter((entry) => !['prompt', 'originalPrompt', 'loras'].includes(entry.key));
  const factText = facts.map((entry) => `${entry.label}: ${entry.value}`).join('   |   ');
  setDocumentationMonoFont(ctx, 500, labelSize);
  const factLines = factText ? wrapCanvasText(ctx, factText, maxWidth, 3) : [];
  const loras = byKey.get('loras');
  setDocumentationMonoFont(ctx, 500, labelSize);
  const loraLines = loras ? wrapCanvasText(ctx, `LoRAs: ${loras.value}`, maxWidth, 2) : [];
  let contentHeight = 0;
  promptLayouts.forEach(({ lines }, index) => { contentHeight += (index ? Math.round(pad * .28) : 0) + labelLine + lines.length * bodyLine; });
  if (factLines.length) contentHeight += (promptLayouts.length ? Math.round(pad * .38) : 0) + factLines.length * labelLine;
  if (loraLines.length) contentHeight += ((promptLayouts.length || factLines.length) ? Math.round(pad * .25) : 0) + loraLines.length * labelLine;
  const panelHeight = Math.min(height, contentHeight + pad * 2);
  let y = height - panelHeight + pad;
  const shade = documentationBuilderState.shade / 100;
  ctx.fillStyle = `rgba(0,0,0,${shade})`;
  ctx.fillRect(0, height - panelHeight, width, panelHeight);
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.fillRect(0, height - panelHeight, width, Math.max(1, Math.round(width / 1400)));
  ctx.textBaseline = 'top';
  promptLayouts.forEach(({ entry, lines }, index) => {
    if (index) y += Math.round(pad * .28);
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    setDocumentationMonoFont(ctx, 600, labelSize);
    ctx.fillText(entry.label, pad, y);
    y += labelLine;
    ctx.fillStyle = '#fff';
    setDocumentationFont(ctx, 500, bodySize);
    y = drawDocumentationLines(ctx, lines, pad, y, bodyLine);
  });
  if (factLines.length) {
    if (promptLayouts.length) y += Math.round(pad * .38);
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    setDocumentationMonoFont(ctx, 500, labelSize);
    y = drawDocumentationLines(ctx, factLines, pad, y, labelLine);
  }
  if (loraLines.length) {
    if (promptLayouts.length || factLines.length) y += Math.round(pad * .25);
    ctx.fillStyle = 'rgba(255,255,255,.68)';
    setDocumentationMonoFont(ctx, 500, labelSize);
    drawDocumentationLines(ctx, loraLines, pad, y, labelLine);
  }
}

function renderDocumentationCanvas() {
  const { image } = documentationBuilderState;
  if (!image) return;
  const canvas = $('#documentationCanvas');
  const ctx = canvas.getContext('2d');
  const metadata = selectedDocumentationMetadata();
  if (documentationBuilderState.layout === 'overlay') renderDocumentationOverlay(canvas, ctx, image, metadata);
  else renderDocumentationContactCard(canvas, ctx, image, metadata);
  $('#documentationPreviewStatus').hidden = true;
}

function syncDocumentationControls() {
  $$('[data-doc-layout]').forEach((button) => {
    const active = button.dataset.docLayout === documentationBuilderState.layout;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $$('[data-doc-theme]').forEach((button) => {
    const active = button.dataset.docTheme === documentationBuilderState.theme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $$('[data-doc-region-map]').forEach((button) => {
    const active = (button.dataset.docRegionMap === 'true') === documentationBuilderState.regionMap;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#documentationRegionGroup').hidden = !(documentationBuilderState.item
    && Array.isArray(documentationBuilderState.item.regions)
    && documentationBuilderState.item.regions.length);
  $('#documentationThemeGroup').hidden = documentationBuilderState.layout !== 'contact';
  $('#documentationShadeGroup').hidden = documentationBuilderState.layout !== 'overlay';
  $('#documentationTextScale').value = documentationBuilderState.textScale;
  $('#documentationTextScaleValue').textContent = `${documentationBuilderState.textScale}%`;
  $('#documentationShade').value = documentationBuilderState.shade;
  $('#documentationShadeValue').textContent = `${documentationBuilderState.shade}%`;
}

async function loadDocumentationOriginal(item) {
  const image = new Image();
  image.decoding = 'async';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Could not load this image'));
    image.src = '/images/' + (item.upscaled || item.file);
  });
  return image;
}

async function setDocumentationFigure(useRegionMap) {
  const item = documentationBuilderState.item;
  if (!item) return;
  const hasRegions = Array.isArray(item.regions) && item.regions.length;
  documentationBuilderState.regionMap = !!(useRegionMap && hasRegions);
  const sourceKey = documentationBuilderState.regionMap ? 'region' : 'original';
  const request = ++documentationBuilderState.sourceRequest;
  syncDocumentationControls();
  const status = $('#documentationPreviewStatus');
  status.textContent = documentationBuilderState.regionMap ? 'Preparing region map…' : 'Preparing preview…';
  status.hidden = false;
  try {
    let image = documentationBuilderState.sources[sourceKey];
    if (!image) {
      image = documentationBuilderState.regionMap
        ? await buildRegionOverlay(item)
        : await loadDocumentationOriginal(item);
      documentationBuilderState.sources[sourceKey] = image;
    }
    if (request !== documentationBuilderState.sourceRequest || documentationBuilderState.item !== item) return;
    documentationBuilderState.image = image;
    renderDocumentationCanvas();
  } catch {
    if (request !== documentationBuilderState.sourceRequest) return;
    status.textContent = 'Could not load this image';
    toast('Could not build the documentation image', true);
  }
}

function renderDocumentationFieldControls() {
  const container = $('#documentationFields');
  container.innerHTML = '';
  documentationBuilderState.metadata.forEach((entry) => {
    const label = document.createElement('label');
    label.className = 'documentation-field-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = documentationBuilderState.selected.has(entry.key);
    input.dataset.docField = entry.key;
    const text = document.createElement('span');
    text.textContent = entry.label;
    label.append(input, text);
    container.appendChild(label);
  });
}

function openDocumentationBuilder(item) {
  documentationBuilderState.item = item;
  documentationBuilderState.image = null;
  documentationBuilderState.sources = { original: null, region: null };
  documentationBuilderState.metadata = documentationMetadata(item);
  documentationBuilderState.selected = new Set(documentationBuilderState.metadata.filter((entry) => entry.key !== 'originalPrompt').map((entry) => entry.key));
  documentationBuilderState.layout = 'contact';
  documentationBuilderState.theme = 'dark';
  documentationBuilderState.regionMap = Array.isArray(item.regions) && item.regions.length > 0;
  documentationBuilderState.textScale = 100;
  documentationBuilderState.shade = 72;
  renderDocumentationFieldControls();
  syncDocumentationControls();
  const status = $('#documentationPreviewStatus');
  status.textContent = 'Preparing preview…';
  status.hidden = false;
  $('#documentationSheet').classList.add('show');
  syncSheetScrollLock();
  setDocumentationFigure(documentationBuilderState.regionMap);
}

function saveDocumentationImage() {
  const { item, image, layout, theme } = documentationBuilderState;
  if (!item || !image) return toast('The preview is still loading', true);
  renderDocumentationCanvas();
  const canvas = $('#documentationCanvas');
  canvas.toBlob((blob) => {
    if (!blob) return toast('Documentation export failed', true);
    const link = document.createElement('a');
    const stem = generationDownloadStem(item, 'mix_studio');
    link.href = URL.createObjectURL(blob);
    link.download = `${stem || 'mix_studio'}_documentation_${layout}${layout === 'contact' ? '_' + theme : ''}.png`;
    mirrorExportFile(blob, link.download);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('Documentation image saved');
  }, 'image/png');
}

let documentationVideoRun = null;

function documentationVideoMimeType() {
  if (!window.MediaRecorder) return '';
  return [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E',
  ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function documentationVideoDimensions(width, height) {
  const ratio = Math.max(.25, Math.min(4, (Number(width) || 16) / (Number(height) || 9)));
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  const portrait = ratio < (1 / 1.08);
  const boardRatio = portrait ? ratio / 1.32 : ratio + .52;
  return boardRatio >= 1
    ? { width: 1280, height: even(1280 / boardRatio) }
    : { width: even(1280 * boardRatio), height: 1280 };
}

function drawContainedMedia(ctx, media, x, y, width, height) {
  const sourceWidth = media.videoWidth || media.naturalWidth || media.width || width;
  const sourceHeight = media.videoHeight || media.naturalHeight || media.height || height;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(media, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function documentationVideoInputSpecs(item, video) {
  const info = video.info || {};
  const engine = info.engine || 'ltx';
  if (info.composite) return [];

  const inputUrl = (name) => `/api/input?name=${encodeURIComponent(String(name))}`;
  const gallerySource = item && item.mode !== 'video' && item.file
    ? `/images/${encodeURIComponent(item.file)}` : '';
  const specs = [];
  const addImage = (label, name, accent, fallbackSrc = '') => {
    if (!name && !fallbackSrc) return;
    specs.push({ type: 'image', label, accent, src: name ? inputUrl(name) : fallbackSrc, fallbackSrc: name ? fallbackSrc : '' });
  };
  const addVideo = (label, name, accent, startAt = 0, duration = 0, src = '') => {
    if (!name && !src) return;
    specs.push({
      type: 'video', label, accent, src: name ? inputUrl(name) : src,
      startAt: Math.max(0, Number(startAt) || 0),
      duration: Math.max(0, Number(duration) || 0),
    });
  };

  if (info.processed && info.parentVideoId) {
    const parent = (item.videos || []).find((entry) => entry.id === info.parentVideoId);
    if (parent && parent.file) addVideo('Source Video', '', '#00bcd4', 0, 0, `/videos/${encodeURIComponent(parent.file)}`);
    return specs;
  }

  if (engine === 'ltx-edit') {
    addVideo('Source Video', info.driveVideoName, '#00bcd4', info.driveStartSeconds, info.driveDurSeconds);
    return specs;
  }

  if (info.faceImageName) {
    addImage('Face Reference', info.faceImageName, '#a970ff');
  } else if (!info.t2v) {
    addImage(engine === 'scail' ? 'Reference Image' : 'Start Frame', info.imageName, engine === 'scail' ? '#34a853' : '#4285f4', gallerySource);
  }

  if (info.endImageName) addImage('Last Frame', info.endImageName, '#fbbc04');
  if (info.driveVideoName) {
    addVideo(engine === 'scail' ? 'Motion Video' : 'Source Video', info.driveVideoName, '#00bcd4', info.driveStartSeconds, info.driveDurSeconds);
  }
  return specs;
}

function loadDocumentationMedia(spec, src = spec.src) {
  if (spec.type === 'video') {
    const media = document.createElement('video');
    media.preload = 'auto';
    media.muted = true;
    media.playsInline = true;
    media.src = src;
    return new Promise((resolve, reject) => {
      media.onloadeddata = () => resolve(media);
      media.onerror = () => reject(new Error(`Could not load ${spec.label.toLowerCase()}`));
      media.load();
    });
  }
  const media = new Image();
  media.decoding = 'async';
  return new Promise((resolve, reject) => {
    media.onload = () => resolve(media);
    media.onerror = () => reject(new Error(`Could not load ${spec.label.toLowerCase()}`));
    media.src = src;
  });
}

async function loadDocumentationVideoInputs(item, video) {
  const specs = documentationVideoInputSpecs(item, video);
  const loaded = await Promise.all(specs.map(async (spec) => {
    try {
      return Object.assign({}, spec, { media: await loadDocumentationMedia(spec) });
    } catch {
      if (!spec.fallbackSrc) return null;
      try { return Object.assign({}, spec, { media: await loadDocumentationMedia(spec, spec.fallbackSrc), src: spec.fallbackSrc }); }
      catch { return null; }
    }
  }));
  return loaded.filter(Boolean);
}

function documentationVideoDetails(item, video, inputMedia = [], resultMedia = null) {
  const info = video.info || {};
  const prompt = info.refinedMotionPrompt || info.motionPrompt || item.refinedPrompt || item.prompt || 'Untitled generation';
  const width = info.width || info.srcWidth || item.width;
  const height = info.height || info.srcHeight || item.height;
  const measuredSeconds = resultMedia && Number(resultMedia.duration);
  const seconds = Number.isFinite(measuredSeconds) && measuredSeconds > 0
    ? measuredSeconds : (info.frames && info.fps ? info.frames / info.fps : null);
  const inputSummary = inputMedia.length
    ? inputMedia.map((input) => input.label).join(', ')
    : (info.t2v ? 'Text only' : (info.composite ? 'Side-by-side comparison' : ''));
  const options = [
    info.faceId && 'Face ID',
    info.audioName && 'Audio input',
    info.driveHasAudio && 'Source audio',
    info.endFrame && 'Last-frame guidance',
    info.motionVideo && 'Motion transfer',
    info.smooth > 1 && `RIFE ${info.smooth}×`,
    info.fourK && 'RTX 4K',
    info.engine === 'wan' && info.fast && '4-step',
    info.sigmaPreset && `Sigmas: ${info.sigmaPreset}`,
    info.engine === 'scail' && info.scailMode && `SCAIL ${info.scailMode}`,
    info.processed === 'upscale' && 'Video upscale',
    info.processed === 'interpolate' && 'Frame interpolation',
  ].filter(Boolean).join(', ');
  const facts = [
    ['Model', videoEngineLabel(info.engine)],
    ['Size', width && height ? `${width} × ${height}` : ''],
    ['Playback', seconds ? `${seconds.toFixed(1)}s${info.fps ? ` · ${info.fps} fps` : ''}` : ''],
    ['Inputs', inputSummary],
    ['Options', options],
    ['Seed', hasDocumentationValue(info.seed) ? info.seed : ''],
    ['Generated in', info.durationMs ? formatDuration(info.durationMs) : ''],
  ].filter(([, value]) => hasDocumentationValue(value));
  if (Array.isArray(info.loras) && info.loras.length) {
    facts.push(['LoRAs', info.loras.map((lora) => `${prettyLora(lora.name)}${hasDocumentationValue(lora.strength) ? ` ${Number(lora.strength).toFixed(2)}` : ''}`).join(', ')]);
  }
  return { prompt, facts };
}

function documentationVideoInputBoxes(area, count, gap) {
  if (!count || !area.width || !area.height) return [];
  const itemGap = count > 1 ? Math.max(6, Math.round(gap * .58)) : 0;
  const itemHeight = (area.height - itemGap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: area.x,
    y: area.y + index * (itemHeight + itemGap),
    width: area.width,
    height: itemHeight,
  }));
}

function documentationVideoLayout(width, height, mediaRatio = width / height, inputCount = 1) {
  const safeMediaRatio = Math.max(.25, Math.min(4, Number(mediaRatio) || width / height));
  const portrait = safeMediaRatio < (1 / 1.08);
  const pad = Math.max(18, Math.round(Math.min(width, height) * .04));
  const gap = Math.max(12, Math.round(pad * .62));
  const sourceCount = Math.max(0, Math.round(Number(inputCount) || 0));
  if (portrait) {
    const lowerWidth = width - pad * 2;
    const resultHeight = Math.min(
      lowerWidth / safeMediaRatio,
      height - pad * 2 - gap - Math.round(height * .24),
    );
    const lowerY = pad + resultHeight + gap;
    const lowerHeight = height - pad - lowerY;
    const sourceWidth = sourceCount ? Math.round((lowerWidth - gap) * .34) : 0;
    const sourceArea = { x: pad, y: lowerY, width: sourceWidth, height: lowerHeight };
    return {
      result: { x: pad, y: pad, width: lowerWidth, height: resultHeight },
      inputs: documentationVideoInputBoxes(sourceArea, sourceCount, gap),
      details: sourceCount
        ? { x: pad + sourceWidth + gap, y: lowerY, width: lowerWidth - sourceWidth - gap, height: lowerHeight }
        : { x: pad, y: lowerY, width: lowerWidth, height: lowerHeight },
    };
  }
  const innerHeight = height - pad * 2;
  const resultWidth = Math.min(
    innerHeight * safeMediaRatio,
    width - pad * 2 - gap - Math.round(width * .23),
  );
  const railWidth = width - pad * 2 - gap - resultWidth;
  const sourceHeight = sourceCount ? Math.round(innerHeight * (sourceCount > 1 ? .48 : .36)) : 0;
  const sourceArea = { x: pad + resultWidth + gap, y: pad, width: railWidth, height: sourceHeight };
  return {
    result: { x: pad, y: pad, width: resultWidth, height: innerHeight },
    inputs: documentationVideoInputBoxes(sourceArea, sourceCount, gap),
    details: {
      x: pad + resultWidth + gap,
      y: sourceCount ? pad + sourceHeight + gap : pad,
      width: railWidth,
      height: sourceCount ? innerHeight - sourceHeight - gap : innerHeight,
    },
  };
}

function drawDocumentationVideoMedia(ctx, media, box, label, accent, { quiet = false } = {}) {
  ctx.fillStyle = '#08090c';
  ctx.fillRect(box.x, box.y, box.width, box.height);
  drawContainedMedia(ctx, media, box.x, box.y, box.width, box.height);
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = Math.max(1, Math.min(box.width, box.height) / 420);
  ctx.strokeRect(box.x + .5, box.y + .5, box.width - 1, box.height - 1);

  const scaledFontSize = Math.round(Math.min(box.width, box.height) * .045);
  const fontSize = quiet
    ? Math.max(9, Math.min(12, Math.round(scaledFontSize * .78)))
    : Math.max(9, Math.min(14, scaledFontSize));
  setDocumentationFont(ctx, quiet ? 650 : 700, fontSize);
  const labelWidth = ctx.measureText(label).width;
  const inset = Math.max(quiet ? 6 : 8, Math.round(fontSize * (quiet ? .58 : .72)));
  const badgeHeight = Math.round(fontSize * (quiet ? 1.72 : 1.9));
  const badgeWidth = labelWidth + inset * (quiet ? 2.05 : 2.35);
  ctx.fillStyle = quiet ? 'rgba(0,0,0,.62)' : 'rgba(0,0,0,.74)';
  ctx.fillRect(box.x + inset, box.y + inset, badgeWidth, badgeHeight);
  ctx.fillStyle = accent;
  ctx.fillRect(box.x + inset * 1.45, box.y + inset + badgeHeight * .29, Math.max(2, fontSize * .15), badgeHeight * .42);
  ctx.fillStyle = quiet ? 'rgba(255,255,255,.86)' : '#fff';
  ctx.textBaseline = 'top';
  ctx.fillText(label, box.x + inset * 2.05, box.y + inset + (badgeHeight - fontSize) * .42);
}

function drawDocumentationVideoDetails(ctx, box, item, video, inputMedia, resultMedia) {
  const details = documentationVideoDetails(item, video, inputMedia, resultMedia);
  const density = Math.max(.62, Math.min(1.35, box.width / 390, box.height / 340));
  const labelSize = Math.max(8, Math.round(11 * density));
  const promptSize = Math.max(11, Math.round(17 * density));
  const factSize = Math.max(9, Math.round(12 * density));
  const inset = Math.max(4, Math.round(4 * density));
  const contentWidth = box.width - inset * 2;
  let copyY = box.y + inset;

  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,.48)';
  setDocumentationMonoFont(ctx, 650, labelSize);
  ctx.fillText('PROMPT', box.x + inset, copyY);
  copyY += Math.round(labelSize * 1.65);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  setDocumentationFont(ctx, 500, promptSize);
  const availablePromptHeight = Math.max(promptSize * 1.4, box.y + box.height - copyY - details.facts.length * factSize * 1.9);
  const promptLines = wrapCanvasText(ctx, details.prompt, contentWidth, Math.max(2, Math.min(5, Math.floor(availablePromptHeight / (promptSize * 1.35)))));
  copyY = drawDocumentationLines(ctx, promptLines, box.x + inset, copyY, Math.round(promptSize * 1.35));
  copyY += Math.round(13 * density);
  const factGap = Math.round(7 * density);
  details.facts.forEach(([label, value]) => {
    if (copyY > box.y + box.height - factSize * 1.45) return;
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    setDocumentationMonoFont(ctx, 650, factSize * .8);
    ctx.fillText(String(label).toUpperCase(), box.x + inset, copyY);
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    setDocumentationFont(ctx, 600, factSize);
    const valueX = box.x + inset + Math.min(contentWidth * .31, Math.round(94 * density));
    ctx.fillText(truncateCanvasText(ctx, value, box.x + box.width - inset - valueX), valueX, copyY - 1);
    copyY += Math.round(factSize * 1.35) + factGap;
  });
}

function syncDocumentationVideoInputs(inputMedia, resultTime) {
  inputMedia.forEach((input) => {
    if (input.type !== 'video' || !input.media || !Number.isFinite(input.media.duration)) return;
    const endAt = input.duration > 0 ? input.startAt + input.duration : input.media.duration;
    const desired = Math.max(0, Math.min(input.startAt + Math.max(0, resultTime || 0), Math.max(0, endAt - .04)));
    if (Math.abs(input.media.currentTime - desired) > .28) {
      try { input.media.currentTime = desired; } catch { /* keep the nearest decoded frame */ }
    }
  });
}

function drawDocumentationVideoFrame(ctx, canvas, inputMedia, item, video, resultMedia) {
  ctx.fillStyle = '#050506';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const mediaWidth = resultMedia.videoWidth || resultMedia.naturalWidth || resultMedia.width || canvas.width;
  const mediaHeight = resultMedia.videoHeight || resultMedia.naturalHeight || resultMedia.height || canvas.height;
  const layout = documentationVideoLayout(canvas.width, canvas.height, mediaWidth / mediaHeight, inputMedia.length);
  drawDocumentationVideoMedia(ctx, resultMedia, layout.result, 'Final Result', '#ea4335', { quiet: true });
  inputMedia.forEach((input, index) => {
    const box = layout.inputs[index];
    if (box) drawDocumentationVideoMedia(ctx, input.media, box, input.label, input.accent);
  });
  drawDocumentationVideoDetails(ctx, layout.details, item, video, inputMedia, resultMedia);
}

function updateDocumentationVideoProgress(progress, label) {
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  $('#documentationVideoProgress').style.width = `${percent}%`;
  $('#documentationVideoPercent').textContent = `${percent}%`;
  if (label) $('#documentationVideoStatus').textContent = label;
}

async function prepareDocumentationVideoInputs(inputMedia) {
  await Promise.all(inputMedia.filter((input) => input.type === 'video').map(async (input) => {
    const media = input.media;
    const target = Math.max(0, Math.min(input.startAt || 0, Math.max(0, (Number(media.duration) || 0) - .04)));
    if (target <= .01) return;
    await new Promise((resolve) => {
      const done = () => { media.removeEventListener('seeked', done); resolve(); };
      media.addEventListener('seeked', done, { once: true });
      try { media.currentTime = target; } catch { done(); return; }
      setTimeout(done, 1200);
    });
  }));
}

function documentationResultAudioStream(result) {
  const capture = result.captureStream || result.mozCaptureStream;
  if (typeof capture !== 'function') return null;
  try {
    const stream = capture.call(result);
    return stream && stream.getAudioTracks().length ? stream : null;
  } catch { return null; }
}

function cleanupDocumentationVideoRun(run) {
  if (!run) return;
  try { run.video && run.video.pause(); } catch { /* noop */ }
  (run.inputs || []).forEach((input) => {
    if (input.type !== 'video' || !input.media) return;
    try { input.media.pause(); } catch { /* noop */ }
    input.media.removeAttribute('src');
  });
  (run.stream && run.stream.getTracks ? run.stream.getTracks() : []).forEach((track) => track.stop());
  (run.resultStream && run.resultStream.getTracks ? run.resultStream.getTracks() : []).forEach((track) => track.stop());
  if (run.video) run.video.removeAttribute('src');
}

function closeDocumentationVideoExport() {
  const run = documentationVideoRun;
  if (run) {
    run.cancelled = true;
    if (run.recorder && run.recorder.state !== 'inactive') run.recorder.stop();
    cleanupDocumentationVideoRun(run);
  }
  documentationVideoRun = null;
  $('#documentationVideoSheet').classList.remove('show');
  syncSheetScrollLock();
}

async function saveDocumentationVideo(item, video) {
  const mimeType = documentationVideoMimeType();
  const canvas = $('#documentationVideoCanvas');
  if (!mimeType || !canvas.captureStream) {
    toast('Documentation video export is not supported by this browser', true);
    return;
  }
  closeActionMenu();
  closeDocumentationVideoExport();
  const run = { cancelled: false, recorder: null, stream: null, resultStream: null, video: null, inputs: [] };
  documentationVideoRun = run;
  $('#documentationVideoCancel').textContent = 'Cancel';
  $('#documentationVideoSheet').classList.add('show');
  syncSheetScrollLock();
  updateDocumentationVideoProgress(0, 'Preparing combined documentation view…');

  try {
    const inputMedia = await loadDocumentationVideoInputs(item, video);
    run.inputs = inputMedia;
    if (run.cancelled || documentationVideoRun !== run) return;
    const result = document.createElement('video');
    result.preload = 'auto';
    result.muted = true;
    result.playsInline = true;
    result.src = '/videos/' + video.file;
    await new Promise((resolve, reject) => {
      result.onloadeddata = resolve;
      result.onerror = () => reject(new Error('Could not load the result video'));
      result.load();
    });
    if (run.cancelled || documentationVideoRun !== run) return;
    run.video = result;
    const dimensions = documentationVideoDimensions(result.videoWidth, result.videoHeight);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d');
    await prepareDocumentationVideoInputs(inputMedia);
    syncDocumentationVideoInputs(inputMedia, 0);
    drawDocumentationVideoFrame(ctx, canvas, inputMedia, item, video, result);

    const savedInfo = video.info || {};
    const savedSeconds = savedInfo.frames && savedInfo.fps ? savedInfo.frames / savedInfo.fps : 0;
    const resultSeconds = Number.isFinite(result.duration) && result.duration > 0 ? result.duration : savedSeconds;
    const durationMs = Math.max(500, Math.min(300_000, resultSeconds * 1000 || 5000));
    result.currentTime = 0;
    await Promise.all([
      result.play(),
      ...inputMedia.filter((input) => input.type === 'video').map((input) => input.media.play().catch(() => {})),
    ]);
    const captureFps = Math.max(16, Math.min(60, Math.round(Number(savedInfo.fps) || 30)));
    const stream = canvas.captureStream(captureFps);
    const resultStream = documentationResultAudioStream(result);
    run.resultStream = resultStream;
    (resultStream ? resultStream.getAudioTracks() : []).forEach((track) => stream.addTrack(track));
    run.stream = stream;
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    run.recorder = recorder;
    const recorded = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error('The browser could not record the documentation video'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
    });
    recorder.start(500);
    while (!run.cancelled && documentationVideoRun === run) {
      syncDocumentationVideoInputs(inputMedia, result.currentTime);
      drawDocumentationVideoFrame(ctx, canvas, inputMedia, item, video, result);
      updateDocumentationVideoProgress(Math.min(1, result.currentTime * 1000 / durationMs), 'Recording combined documentation view…');
      if (result.ended || result.currentTime >= result.duration - .04) break;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await recorded;
    cleanupDocumentationVideoRun(run);
    if (run.cancelled || documentationVideoRun !== run) return;
    documentationVideoRun = null;
    const extension = blob.type === 'video/mp4' ? 'mp4' : 'webm';
    const stem = generationDownloadStem(item, 'mix_studio');
    const filename = `${stem}_documentation.${extension}`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    mirrorExportFile(blob, filename);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 3000);
    updateDocumentationVideoProgress(1, 'Documentation video saved');
    $('#documentationVideoCancel').textContent = 'Close';
    toast('Documentation video saved');
  } catch (error) {
    cleanupDocumentationVideoRun(run);
    if (documentationVideoRun === run) documentationVideoRun = null;
    updateDocumentationVideoProgress(0, 'Could not build the documentation video');
    $('#documentationVideoCancel').textContent = 'Close';
    toast(error.message, true);
  }
}

$('#documentationVideoClose').addEventListener('click', closeDocumentationVideoExport);
$('#documentationVideoCancel').addEventListener('click', closeDocumentationVideoExport);

$('#documentationLayout').addEventListener('click', (event) => {
  const button = event.target.closest('[data-doc-layout]');
  if (!button) return;
  documentationBuilderState.layout = button.dataset.docLayout;
  syncDocumentationControls();
  renderDocumentationCanvas();
});
$('#documentationTheme').addEventListener('click', (event) => {
  const button = event.target.closest('[data-doc-theme]');
  if (!button) return;
  documentationBuilderState.theme = button.dataset.docTheme;
  syncDocumentationControls();
  renderDocumentationCanvas();
});
$('#documentationRegionMode').addEventListener('click', (event) => {
  const button = event.target.closest('[data-doc-region-map]');
  if (!button) return;
  setDocumentationFigure(button.dataset.docRegionMap === 'true');
});
$('#documentationTextScale').addEventListener('input', (event) => {
  documentationBuilderState.textScale = Number(event.target.value) || 100;
  syncDocumentationControls();
  renderDocumentationCanvas();
});
$('#documentationShade').addEventListener('input', (event) => {
  documentationBuilderState.shade = Number(event.target.value) || 72;
  syncDocumentationControls();
  renderDocumentationCanvas();
});
$('#documentationFields').addEventListener('change', (event) => {
  const input = event.target.closest('[data-doc-field]');
  if (!input) return;
  if (input.checked) documentationBuilderState.selected.add(input.dataset.docField);
  else documentationBuilderState.selected.delete(input.dataset.docField);
  renderDocumentationCanvas();
});
$('#documentationSave').addEventListener('click', saveDocumentationImage);

function downloadItem(it, variant) {
  const a = document.createElement('a');
  const useUpscaled = variant === 'upscaled' || (variant !== 'original' && it.upscaled);
  const suffix = useUpscaled ? '_upscaled' : '_original';
  a.href = '/images/' + (useUpscaled ? it.upscaled : it.file);
  a.download = generationDownloadStem(it, 'kreastudio') + suffix + '.png';
  mirrorGalleryExport({ id: it.id, asset: 'image', variant });
  a.click();
}
function downloadComposite(it, composite) {
  const a = document.createElement('a');
  a.href = '/images/' + composite.file;
  const suffix = composite.type === 'reference-generation' ? '_reference_generation'
    : (composite.type === 'depth-map' ? '_depth_composite' : '_before_after');
  a.download = generationDownloadStem(it, 'kreastudio') + suffix + '.png';
  mirrorGalleryExport({ id: it.id, asset: 'composite', compositeId: composite.id });
  a.click();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function copyTextToClipboard(text) {
  const value = String(text == null ? '' : text);
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch { /* local HTTP and embedded browsers may require the fallback */ }
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

/* ------------------------------------------------------------------ */
/* Compare                                                             */
/* ------------------------------------------------------------------ */

const compareState = {
  split: 50,
  zoom: 1,
  x: 0,
  y: 0,
  mode: 'reveal',
};

function compareFitSize() {
  const stage = $('#cmpStage');
  const image = $('#cmpB');
  const rect = stage.getBoundingClientRect();
  const naturalWidth = image.naturalWidth || rect.width || 1;
  const naturalHeight = image.naturalHeight || rect.height || 1;
  const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
  return {
    stageWidth: rect.width,
    stageHeight: rect.height,
    width: naturalWidth * scale,
    height: naturalHeight * scale,
    naturalWidth,
    naturalHeight,
  };
}

function clampComparePan() {
  const fit = compareFitSize();
  const maxX = Math.max(0, (fit.width * compareState.zoom - fit.stageWidth) / 2);
  const maxY = Math.max(0, (fit.height * compareState.zoom - fit.stageHeight) / 2);
  compareState.x = Math.max(-maxX, Math.min(maxX, compareState.x));
  compareState.y = Math.max(-maxY, Math.min(maxY, compareState.y));
}

function renderCompareTransform() {
  clampComparePan();
  const transform = `translate3d(${compareState.x}px, ${compareState.y}px, 0) scale(${compareState.zoom})`;
  $('#cmpA').style.transform = transform;
  $('#cmpB').style.transform = transform;
  $('#cmpZoomValue').textContent = `${Math.round(compareState.zoom * 100)}%`;
  $('#cmpZoomOut').disabled = compareState.zoom <= 1.001;
  $('#cmpZoomIn').disabled = compareState.zoom >= 5.999;
  $('#cmpStage').classList.toggle('is-zoomed', compareState.zoom > 1.001);
}

function setCompare(pct) {
  compareState.split = Math.max(0, Math.min(100, pct));
  $('#cmpBMask').style.clipPath = `inset(0 0 0 ${compareState.split}%)`;
  $('#cmpDivider').style.left = compareState.split + '%';
  $('#cmpRevealValue').textContent = `${Math.round(compareState.split)}% reveal`;
}

function setCompareMode(mode) {
  compareState.mode = mode === 'pan' ? 'pan' : 'reveal';
  const reveal = compareState.mode === 'reveal';
  $('#cmpRevealMode').classList.toggle('active', reveal);
  $('#cmpMoveMode').classList.toggle('active', !reveal);
  $('#cmpRevealMode').setAttribute('aria-pressed', String(reveal));
  $('#cmpMoveMode').setAttribute('aria-pressed', String(!reveal));
  $('#cmpStage').classList.toggle('mode-pan', !reveal);
  $('#cmpHint').textContent = reveal
    ? 'Drag the divider · pinch or scroll to zoom'
    : (compareState.zoom > 1 ? 'Drag to inspect · pinch or scroll to zoom' : 'Zoom in, then drag to inspect details');
}

function setCompareZoom(value, clientX, clientY) {
  const next = Math.max(1, Math.min(6, Number(value) || 1));
  const previous = compareState.zoom;
  if (Math.abs(next - previous) < 0.001) return;
  const rect = $('#cmpStage').getBoundingClientRect();
  const anchorX = Number.isFinite(clientX) ? clientX - rect.left - rect.width / 2 : 0;
  const anchorY = Number.isFinite(clientY) ? clientY - rect.top - rect.height / 2 : 0;
  const ratio = next / previous;
  compareState.x = anchorX - (anchorX - compareState.x) * ratio;
  compareState.y = anchorY - (anchorY - compareState.y) * ratio;
  compareState.zoom = next;
  renderCompareTransform();
  setCompareMode(compareState.mode);
}

function fitCompare() {
  compareState.zoom = 1;
  compareState.x = 0;
  compareState.y = 0;
  renderCompareTransform();
  setCompareMode(compareState.mode);
}

function actualSizeCompare() {
  const fit = compareFitSize();
  const pixelZoom = fit.width ? fit.naturalWidth / fit.width : 1;
  setCompareZoom(Math.max(1, Math.min(6, pixelZoom)));
  if (compareState.zoom > 1) setCompareMode('pan');
}

function updateCompareDimensions() {
  const original = $('#cmpA');
  const upscaled = $('#cmpB');
  const left = original.naturalWidth ? `${original.naturalWidth} × ${original.naturalHeight}` : 'Original';
  const right = upscaled.naturalWidth ? `${upscaled.naturalWidth} × ${upscaled.naturalHeight}` : 'Upscaled';
  $('#cmpDimensions').textContent = `${left} → ${right}`;
  renderCompareTransform();
}

function openCompare(it) {
  compareState.split = 50;
  compareState.zoom = 1;
  compareState.x = 0;
  compareState.y = 0;
  $('#cmpA').src = '/images/' + it.file;
  $('#cmpB').src = '/images/' + it.upscaled;
  $('#compare').classList.add('show');
  setCompare(50);
  setCompareMode('reveal');
  renderCompareTransform();
  try { history.pushState({ cmp: 1 }, ''); } catch { /* noop */ }
}

(() => {
  const stage = $('#cmpStage');
  const pointers = new Map();
  let gesture = null;
  let lastTouchTap = null;
  let ignoreDoubleClickUntil = 0;

  const pointerCenter = (values) => ({
    x: values.reduce((sum, point) => sum + point.x, 0) / values.length,
    y: values.reduce((sum, point) => sum + point.y, 0) / values.length,
  });
  const pointerDistance = (values) => Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);

  function beginSingle(point) {
    gesture = {
      kind: compareState.mode,
      startX: point.x,
      startY: point.y,
      panX: compareState.x,
      panY: compareState.y,
    };
  }

  function beginPinch() {
    const values = [...pointers.values()].slice(0, 2);
    const rect = stage.getBoundingClientRect();
    const center = pointerCenter(values);
    gesture = {
      kind: 'pinch',
      distance: Math.max(1, pointerDistance(values)),
      zoom: compareState.zoom,
      panX: compareState.x,
      panY: compareState.y,
      anchorX: center.x - rect.left - rect.width / 2,
      anchorY: center.y - rect.top - rect.height / 2,
    };
  }

  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, downX: event.clientX, downY: event.clientY, at: performance.now(), type: event.pointerType });
    stage.classList.add('interacting');
    if (pointers.size === 1) {
      beginSingle([...pointers.values()][0]);
      if (compareState.mode === 'reveal') {
        const rect = stage.getBoundingClientRect();
        setCompare(((event.clientX - rect.left) / rect.width) * 100);
      }
    } else if (pointers.size === 2) beginPinch();
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, Object.assign({}, previous, { x: event.clientX, y: event.clientY }));
    if (pointers.size >= 2 && gesture?.kind === 'pinch') {
      const values = [...pointers.values()].slice(0, 2);
      const center = pointerCenter(values);
      const rect = stage.getBoundingClientRect();
      const nextZoom = Math.max(1, Math.min(6, gesture.zoom * (pointerDistance(values) / gesture.distance)));
      const currentX = center.x - rect.left - rect.width / 2;
      const currentY = center.y - rect.top - rect.height / 2;
      const localX = (gesture.anchorX - gesture.panX) / gesture.zoom;
      const localY = (gesture.anchorY - gesture.panY) / gesture.zoom;
      compareState.zoom = nextZoom;
      compareState.x = currentX - localX * nextZoom;
      compareState.y = currentY - localY * nextZoom;
      renderCompareTransform();
      return;
    }
    if (pointers.size !== 1 || !gesture) return;
    if (gesture.kind === 'pan') {
      compareState.x = gesture.panX + event.clientX - gesture.startX;
      compareState.y = gesture.panY + event.clientY - gesture.startY;
      renderCompareTransform();
    } else {
      const rect = stage.getBoundingClientRect();
      setCompare(((event.clientX - rect.left) / rect.width) * 100);
    }
  });

  function endPointer(event) {
    const point = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (point && point.type === 'touch' && performance.now() - point.at < 280
      && Math.hypot(event.clientX - point.downX, event.clientY - point.downY) < 10) {
      const now = performance.now();
      if (lastTouchTap && now - lastTouchTap.at < 330 && Math.hypot(event.clientX - lastTouchTap.x, event.clientY - lastTouchTap.y) < 28) {
        setCompareZoom(compareState.zoom > 1.15 ? 1 : 2, event.clientX, event.clientY);
        ignoreDoubleClickUntil = now + 500;
        lastTouchTap = null;
      } else lastTouchTap = { at: now, x: event.clientX, y: event.clientY };
    }
    if (pointers.size === 1) beginSingle([...pointers.values()][0]);
    else if (!pointers.size) {
      gesture = null;
      stage.classList.remove('interacting');
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    setCompareZoom(compareState.zoom * (event.deltaY < 0 ? 1.16 : 0.86), event.clientX, event.clientY);
  }, { passive: false });
  stage.addEventListener('dblclick', (event) => {
    event.preventDefault();
    if (performance.now() < ignoreDoubleClickUntil) return;
    setCompareZoom(compareState.zoom > 1.15 ? 1 : 2, event.clientX, event.clientY);
  });
  stage.addEventListener('keydown', (event) => {
    const key = event.key;
    if (['+', '=', '-', '_', '0', '1', 'f', 'F', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) event.preventDefault();
    if (key === '+' || key === '=') setCompareZoom(compareState.zoom * 1.25);
    else if (key === '-' || key === '_') setCompareZoom(compareState.zoom / 1.25);
    else if (key === '0' || key === 'f' || key === 'F') fitCompare();
    else if (key === '1') actualSizeCompare();
    else if (compareState.mode === 'reveal' && key === 'ArrowLeft') setCompare(compareState.split - 2);
    else if (compareState.mode === 'reveal' && key === 'ArrowRight') setCompare(compareState.split + 2);
    else if (compareState.mode === 'pan' && key.startsWith('Arrow')) {
      if (key === 'ArrowLeft') compareState.x -= 28;
      if (key === 'ArrowRight') compareState.x += 28;
      if (key === 'ArrowUp') compareState.y -= 28;
      if (key === 'ArrowDown') compareState.y += 28;
      renderCompareTransform();
    }
  });
})();

$('#cmpA').addEventListener('load', updateCompareDimensions);
$('#cmpB').addEventListener('load', updateCompareDimensions);
$('#cmpRevealMode').addEventListener('click', () => setCompareMode('reveal'));
$('#cmpMoveMode').addEventListener('click', () => setCompareMode('pan'));
$('#cmpZoomOut').addEventListener('click', () => setCompareZoom(compareState.zoom / 1.35));
$('#cmpZoomIn').addEventListener('click', () => setCompareZoom(compareState.zoom * 1.35));
$('#cmpFit').addEventListener('click', fitCompare);
$('#cmpActual').addEventListener('click', actualSizeCompare);
window.addEventListener('resize', () => {
  if ($('#compare').classList.contains('show')) renderCompareTransform();
});
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
  const requestKey = `upscale:${it.id}`;
  try {
    state.upscaling.add(it.id);
    state.pendingGalleryRequests.add(requestKey);
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
  } finally {
    state.pendingGalleryRequests.delete(requestKey);
  }
});

/* ------------------------------------------------------------------ */
/* Move sheet                                                          */
/* ------------------------------------------------------------------ */

function openMoveSheet(target) {
  // target: a single item object (from the lightbox) or an array of ids (multi-select)
  const multi = Array.isArray(target);
  const ids = multi ? target : [target.id];
  const includedItems = multi ? expandedGallerySelection(ids) : [target];
  const currentFolder = multi ? undefined : (target.folder || null);
  state.moveTarget = target;
  $('#moveSheetTitle').textContent = includedItems.length > 1
    ? `Move ${includedItems.length} generations`
    : 'Move to folder';
  const chips = $('#moveChips');
  chips.innerHTML = '';
  const all = [{ id: null, name: 'No folder' }, ...state.folders];
  for (const f of all) {
    const b = document.createElement('button');
    b.className = 'chip' + (currentFolder !== undefined && currentFolder === f.id ? ' active' : '');
    b.innerHTML = `${f.locked ? '<svg viewBox="0 0 24 24" width="14" height="14" aria-label="Locked"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' : ''}<span>${escapeHtml(f.name)}</span>`;
    b.addEventListener('click', async () => {
      try {
        const result = multi
          ? await api('/api/items/move', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, folder: f.id, includeGroups: true }),
          })
          : await api(`/api/item/${ids[0]}/move`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: f.id }),
          });
        $('#moveSheet').classList.remove('show');
        if (multi) exitSelect();
        await refreshGallery();
        const moved = multi ? Number(result.moved || includedItems.length) : 1;
        const what = moved > 1 ? `${moved} generations` : 'Generation';
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

function setMediaPreferenceControl(id, enabled) {
  const button = $('#' + id);
  if (button) button.setAttribute('aria-checked', String(enabled === true));
}

function mediaPreferenceControlValue(id) {
  return $('#' + id)?.getAttribute('aria-checked') === 'true';
}

['setVideoPreviews', 'setPreviewCache'].forEach((id) => {
  $('#' + id).addEventListener('click', () => {
    const button = $('#' + id);
    button.setAttribute('aria-checked', String(!mediaPreferenceControlValue(id)));
  });
});
$('#previewCacheClear').addEventListener('click', clearPreviewCache);

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

let hardwareInfoCache = null;
let hardwareInfoPromise = null;
let defaultExportDirectory = '';

function renderExportLocation(directory = defaultExportDirectory) {
  defaultExportDirectory = String(directory || '');
  const input = $('#exportDirectory');
  input.value = defaultExportDirectory;
  input.disabled = !state.profileIsOwner;
  $('#exportDirectoryApply').hidden = !state.profileIsOwner;
  $('#exportDirectoryClear').hidden = !state.profileIsOwner || !defaultExportDirectory;
  $('#exportDirectoryStatus').textContent = defaultExportDirectory
    ? `${state.profileIsOwner ? 'Copies are saved to' : 'Owner save folder'} · ${defaultExportDirectory}`
    : (state.profileIsOwner ? 'Browser downloads only' : 'No computer-side save folder configured');
  $('#exportLocationControl').classList.toggle('configured', Boolean(defaultExportDirectory));
}

async function mirrorGalleryExport(payload) {
  if (!defaultExportDirectory) return null;
  try {
    const result = await api('/api/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    toast(result.count > 1 ? `${result.count} copies saved to the default folder` : 'Copy saved to the default folder');
    return result;
  } catch (error) {
    toast(`Device download started, but the folder copy failed: ${error.message}`, true);
    return null;
  }
}

async function mirrorExportFile(blob, filename) {
  if (!defaultExportDirectory || !blob) return null;
  try {
    const result = await api('/api/export-file', {
      method: 'POST', headers: { 'x-filename': encodeURIComponent(filename) }, body: blob,
    });
    toast('Copy saved to the default folder');
    return result;
  } catch (error) {
    toast(`Device download started, but the folder copy failed: ${error.message}`, true);
    return null;
  }
}

$('#exportDirectoryApply').addEventListener('click', async () => {
  const button = $('#exportDirectoryApply');
  button.disabled = true;
  try {
    const result = await api('/api/export-location', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: $('#exportDirectory').value }),
    });
    renderExportLocation(result.directory);
    hardwareInfoCache = null;
    await loadHardwareInfo(true);
    toast('Default save folder updated');
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

$('#exportDirectoryClear').addEventListener('click', async () => {
  try {
    await api('/api/export-location', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directory: '' }),
    });
    renderExportLocation('');
    hardwareInfoCache = null;
    await loadHardwareInfo(true);
    toast('Using browser downloads only');
  } catch (error) { toast(error.message, true); }
});

$('#exportDirectory').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('#exportDirectoryApply').click();
  }
});

function formatHardwareBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const amount = bytes / (1024 ** power);
  const display = Number.isInteger(amount) ? String(amount)
    : (amount >= 100 || power === 0 ? String(Math.round(amount)) : amount.toFixed(amount >= 10 ? 1 : 2));
  return `${display} ${units[power]}`;
}

function setHardwareRow(valueId, detailId, value, detail = '') {
  $(`#${valueId}`).textContent = value || 'Unavailable';
  $(`#${detailId}`).textContent = detail;
}

function renderHardwareInfo(info) {
  const gpuDevices = Array.isArray(info?.gpu?.devices) ? info.gpu.devices : [];
  const gpu = gpuDevices[0];
  const gpuDetail = gpu ? [
    gpu.memoryBytes ? `${formatHardwareBytes(gpu.memoryBytes)} ${gpu.memoryKind === 'unified' ? 'unified memory' : 'VRAM'}` : '',
    gpu.driver ? `driver ${gpu.driver}` : '',
    gpuDevices.length > 1 ? `+${gpuDevices.length - 1} more` : '',
  ].filter(Boolean).join(' · ') : 'No NVIDIA GPU reported by the system';
  setHardwareRow('hardwareGpu', 'hardwareGpuDetail', gpu?.name || 'Unavailable', gpuDetail);

  const cores = Number(info?.cpu?.logicalCores) || 0;
  setHardwareRow('hardwareCpu', 'hardwareCpuDetail', info?.cpu?.name, cores ? `${cores} logical cores` : '');

  const totalMemory = formatHardwareBytes(info?.memory?.totalBytes);
  const freeMemory = formatHardwareBytes(info?.memory?.freeBytes);
  setHardwareRow('hardwareMemory', 'hardwareMemoryDetail', totalMemory || 'Unavailable', freeMemory ? `${freeMemory} currently available` : '');

  const osDetails = [info?.os?.version, info?.os?.arch].filter(Boolean).join(' · ');
  setHardwareRow('hardwareOs', 'hardwareOsDetail', info?.os?.name, osDetails);

  const diskFree = Number(info?.disk?.freeBytes);
  const diskTotal = Number(info?.disk?.totalBytes);
  const freeLabel = formatHardwareBytes(diskFree);
  const totalLabel = formatHardwareBytes(diskTotal);
  const freePercent = diskTotal > 0 && diskFree >= 0 ? Math.max(0, Math.min(100, (diskFree / diskTotal) * 100)) : 0;
  setHardwareRow(
    'hardwareDisk',
    'hardwareDiskDetail',
    freeLabel ? `${freeLabel} free` : 'Unavailable',
    [totalLabel ? `of ${totalLabel}` : '', info?.disk?.root ? `${info.disk.root} · Mix Studio export drive` : ''].filter(Boolean).join(' · '),
  );
  $('#hardwareDiskFill').style.width = `${freePercent}%`;
  $('#hardwareList').setAttribute('aria-busy', 'false');
}

async function loadHardwareInfo(force = false) {
  if (hardwareInfoCache && !force) {
    renderHardwareInfo(hardwareInfoCache);
    return hardwareInfoCache;
  }
  if (hardwareInfoPromise && !force) return hardwareInfoPromise;
  const list = $('#hardwareList');
  const refresh = $('#hardwareRefresh');
  list.classList.add('loading');
  list.setAttribute('aria-busy', 'true');
  refresh.classList.add('loading');
  refresh.disabled = true;
  hardwareInfoPromise = api('/api/hardware').then((info) => {
    hardwareInfoCache = info;
    renderHardwareInfo(info);
    return info;
  }).catch((error) => {
    for (const [valueId, detailId] of [
      ['hardwareGpu', 'hardwareGpuDetail'],
      ['hardwareCpu', 'hardwareCpuDetail'],
      ['hardwareMemory', 'hardwareMemoryDetail'],
      ['hardwareOs', 'hardwareOsDetail'],
      ['hardwareDisk', 'hardwareDiskDetail'],
    ]) setHardwareRow(valueId, detailId, 'Unavailable', 'Could not read system information');
    list.setAttribute('aria-busy', 'false');
    throw error;
  }).finally(() => {
    hardwareInfoPromise = null;
    list.classList.remove('loading');
    refresh.classList.remove('loading');
    refresh.disabled = false;
  });
  return hardwareInfoPromise;
}

$('#hardwareRefresh').addEventListener('click', () => loadHardwareInfo(true).catch(() => toast('Hardware information is unavailable', true)));

/* ------------------------------------------------------------------ */
/* Guided UI tutorial                                                  */
/* ------------------------------------------------------------------ */

const GUIDED_TOUR_STEPS = [
  {
    target: '#primaryTabs',
    title: 'Choose a workspace',
    copy: 'Create starts new image or video work. Edit changes an existing image. Library keeps every completed generation.',
    motion: 'tap',
    demo: 'Tap a workspace to switch tools',
    scroll: false,
  },
  {
    target: '#createTabs',
    title: 'Pick a creation method',
    copy: 'Image builds a full frame, Region gives different parts of the frame their own prompts, and Video creates motion.',
    motion: 'tap',
    demo: 'Tap Image, Region, or Video',
    scroll: false,
  },
  {
    target: '#promptPanel',
    title: 'Describe the result',
    copy: 'Write the scene in plain language. Prompt Enhance can turn a short idea into a more detailed generation prompt.',
    motion: 'type',
    demo: 'Type a prompt or start with a short idea',
  },
  {
    target: '#createPromptTools',
    title: 'Add visual direction',
    copy: 'Use these tools for image-to-prompt, camera choices, regional prompting, or an image guide. They are optional.',
    motion: 'tap',
    demo: 'Tap a tool to add more control',
  },
  {
    target: '#resPanel',
    title: 'Set the output shape',
    copy: 'Choose the aspect ratio and S, M, or L output size. The dimensions shown here are the dimensions sent to generation.',
    motion: 'tap',
    demo: 'Tap Resolution to open the picker',
  },
  {
    target: '#generateBtn',
    title: 'Generate or add to the queue',
    copy: 'Tap Generate to start. If another job is active, the same button adds this setup to the queue so you can keep working.',
    motion: 'press',
    demo: 'Press once to generate or queue',
    scroll: false,
  },
  {
    target: '[data-primary-mode="gallery"]',
    title: 'Return to your Library',
    copy: 'Library contains every result. Open an item to compare, reuse its settings, move it, group it, or send it into another workflow.',
    motion: 'tap',
    demo: 'Tap Library whenever you want your results',
  },
];

const CONTEXTUAL_GUIDES = {
  'gallery-selection-details': {
    id: 'gallery-selection-details',
    target: '#selectBar',
    title: 'Reveal selection actions',
    copy: 'Drag the selection bar upward to reveal details and the full set of actions.',
    motion: 'swipe-up',
    demo: 'Swipe up on the handle',
  },
};

let guidedTourIndex = -1;
let guidedTourTimer = null;
let guidedTourPositionFrame = null;
let contextualGuide = null;
let contextualGuideTimer = null;
let pendingContextualGuideId = '';

function guidedTourStorageKey() {
  return profileStorageKey('ks-guided-tour') || 'ks-guided-tour-anonymous';
}

function guidedTipsStorageKey() {
  return profileStorageKey('ks-contextual-guides') || 'ks-contextual-guides-anonymous';
}

function contextualGuideSeenKey(id) {
  return `${profileStorageKey('ks-context-guide') || 'ks-context-guide-anonymous'}-${id}`;
}

function contextualGuidesEnabled() {
  return localStorage.getItem(guidedTipsStorageKey()) !== 'off';
}

function renderGuidedTourSetting() {
  const completed = localStorage.getItem(guidedTourStorageKey()) === 'complete';
  const tipsEnabled = contextualGuidesEnabled();
  $('#guidedTourStart').textContent = completed ? 'Replay tutorial' : 'Start tutorial';
  $('#guidedTourSettingStatus').textContent = completed
    ? 'Completed · replay the animated walkthrough anytime.'
    : 'Optional walkthrough · start it whenever you want.';
  $('#guidedTipsToggle').setAttribute('aria-checked', String(tipsEnabled));
}

function guidedTourTarget() {
  const guide = contextualGuide || (guidedTourIndex >= 0 ? GUIDED_TOUR_STEPS[guidedTourIndex] : null);
  return guide ? $(guide.target) : null;
}

function positionGuidedTour() {
  const root = $('#guidedTour');
  const target = guidedTourTarget();
  if (root.hidden || !target) return;
  const rect = target.getBoundingClientRect();
  const pad = 7;
  const left = Math.max(4, rect.left - pad);
  const top = Math.max(4, rect.top - pad);
  const right = Math.min(window.innerWidth - 4, rect.right + pad);
  const bottom = Math.min(window.innerHeight - 4, rect.bottom + pad);
  const spotlight = $('#guidedTourSpotlight');
  spotlight.style.left = `${left}px`;
  spotlight.style.top = `${top}px`;
  spotlight.style.width = `${Math.max(12, right - left)}px`;
  spotlight.style.height = `${Math.max(12, bottom - top)}px`;
  const radius = parseFloat(getComputedStyle(target).borderRadius) || 14;
  spotlight.style.borderRadius = `${Math.min(28, Math.max(10, radius + 5))}px`;

  const card = $('#guidedTourCard');
  const cardRect = card.getBoundingClientRect();
  const margin = 12;
  const gap = 16;
  const cardLeft = Math.max(margin, Math.min(
    window.innerWidth - cardRect.width - margin,
    rect.left + rect.width / 2 - cardRect.width / 2,
  ));
  const roomBelow = window.innerHeight - rect.bottom - gap - margin;
  const roomAbove = rect.top - gap - margin;
  let cardTop;
  if (roomBelow >= cardRect.height) cardTop = rect.bottom + gap;
  else if (roomAbove >= cardRect.height) cardTop = rect.top - cardRect.height - gap;
  else cardTop = rect.top > window.innerHeight / 2 ? margin : window.innerHeight - cardRect.height - margin;
  card.style.left = `${cardLeft}px`;
  card.style.top = `${Math.max(margin, Math.min(cardTop, window.innerHeight - cardRect.height - margin))}px`;
  root.classList.remove('is-positioning');
}

function scheduleContextualGuide(id, delay = 560) {
  const guide = CONTEXTUAL_GUIDES[id];
  if (!guide || !contextualGuidesEnabled() || localStorage.getItem(contextualGuideSeenKey(id)) === 'seen') return;
  if (contextualGuide || guidedTourIndex >= 0 || !$('#guidedTour').hidden || pendingContextualGuideId === id) return;
  clearTimeout(contextualGuideTimer);
  pendingContextualGuideId = id;
  contextualGuideTimer = setTimeout(() => {
    pendingContextualGuideId = '';
    contextualGuideTimer = null;
    showContextualGuide(id);
  }, delay);
}

function showContextualGuide(id) {
  const guide = CONTEXTUAL_GUIDES[id];
  const root = $('#guidedTour');
  const target = guide ? $(guide.target) : null;
  if (!guide || !contextualGuidesEnabled() || localStorage.getItem(contextualGuideSeenKey(id)) === 'seen') return;
  if (contextualGuide || guidedTourIndex >= 0 || !root.hidden) return;
  if (id === 'gallery-selection-details' && (document.hidden || gallerySelectionDrag.active)) {
    if (state.selected.size) scheduleContextualGuide(id, 280);
    return;
  }
  if (!target || target.hidden || !target.getClientRects().length) return;
  if (id === 'gallery-selection-details' && (!state.selected.size || target.classList.contains('is-expanded'))) return;

  contextualGuide = guide;
  localStorage.setItem(contextualGuideSeenKey(id), 'seen');
  clearTimeout(guidedTourTimer);
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  root.classList.add('is-contextual', 'is-positioning');
  $('#guidedTourCard').setAttribute('aria-modal', 'false');
  $('#guidedTourStep').textContent = 'Gesture tip';
  $('#guidedTourTitle').textContent = guide.title;
  $('#guidedTourCopy').textContent = guide.copy;
  $('#guidedTourDemo').dataset.motion = guide.motion;
  $('#guidedTourDemoLabel').textContent = guide.demo;
  $('#guidedTourDots').replaceChildren();
  $('#guidedTourDots').hidden = true;
  $('#guidedTourBack').hidden = true;
  $('#guidedTourNext').textContent = 'Got it';
  $('#guidedTourAnnouncement').textContent = `${guide.title}. ${guide.copy}`;
  guidedTourTimer = setTimeout(positionGuidedTour, 30);
}

function hideContextualGuide() {
  if (!contextualGuide) return;
  clearTimeout(guidedTourTimer);
  contextualGuide = null;
  const root = $('#guidedTour');
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.classList.remove('is-contextual', 'is-positioning');
  $('#guidedTourCard').setAttribute('aria-modal', 'true');
  $('#guidedTourDots').hidden = false;
  $('#guidedTourBack').hidden = false;
  $('#guidedTourAnnouncement').textContent = '';
}

function cancelContextualGuide(id) {
  if (!id || pendingContextualGuideId === id) {
    clearTimeout(contextualGuideTimer);
    contextualGuideTimer = null;
    pendingContextualGuideId = '';
  }
  if (contextualGuide && (!id || contextualGuide.id === id)) hideContextualGuide();
}

function completeContextualGuide(id) {
  if (!CONTEXTUAL_GUIDES[id]) return;
  localStorage.setItem(contextualGuideSeenKey(id), 'seen');
  cancelContextualGuide(id);
}

function setContextualGuidesEnabled(enabled) {
  localStorage.setItem(guidedTipsStorageKey(), enabled ? 'on' : 'off');
  if (!enabled) cancelContextualGuide();
  renderGuidedTourSetting();
}

function renderGuidedTourStep({ focus = true } = {}) {
  const root = $('#guidedTour');
  const step = GUIDED_TOUR_STEPS[guidedTourIndex];
  const target = guidedTourTarget();
  if (!step || !target) return finishGuidedTour(false);
  clearTimeout(guidedTourTimer);
  root.classList.add('is-positioning');
  $('#guidedTourStep').textContent = `${guidedTourIndex + 1} of ${GUIDED_TOUR_STEPS.length}`;
  $('#guidedTourTitle').textContent = step.title;
  $('#guidedTourCopy').textContent = step.copy;
  $('#guidedTourDemo').dataset.motion = step.motion;
  $('#guidedTourDemoLabel').textContent = step.demo;
  $('#guidedTourBack').disabled = guidedTourIndex === 0;
  $('#guidedTourNext').textContent = guidedTourIndex === GUIDED_TOUR_STEPS.length - 1 ? 'Finish' : 'Next';
  const dots = $('#guidedTourDots');
  dots.replaceChildren(...GUIDED_TOUR_STEPS.map((_, index) => {
    const dot = document.createElement('i');
    dot.classList.toggle('active', index === guidedTourIndex);
    return dot;
  }));
  if (step.scroll !== false) {
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  }
  const delay = step.scroll === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : 320;
  guidedTourTimer = setTimeout(() => {
    positionGuidedTour();
    if (focus) $('#guidedTourCard').focus({ preventScroll: true });
  }, delay);
}

function startGuidedTour() {
  cancelContextualGuide();
  closeActionMenu();
  closeAppDrawer();
  $$('.sheet.show').forEach((sheet) => sheet.classList.remove('show'));
  syncSheetScrollLock();
  setCreateMode('image');
  collapseRes(false);
  window.scrollTo(0, 0);
  guidedTourIndex = 0;
  const root = $('#guidedTour');
  root.classList.remove('is-contextual');
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  $('#guidedTourCard').setAttribute('aria-modal', 'true');
  $('#guidedTourDots').hidden = false;
  $('#guidedTourBack').hidden = false;
  $('#guidedTourAnnouncement').textContent = '';
  document.body.classList.add('guided-tour-open');
  renderGuidedTourStep();
}

function finishGuidedTour(completed = false) {
  if (contextualGuide) return hideContextualGuide();
  clearTimeout(guidedTourTimer);
  if (completed) localStorage.setItem(guidedTourStorageKey(), 'complete');
  guidedTourIndex = -1;
  const root = $('#guidedTour');
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.classList.remove('is-contextual', 'is-positioning');
  document.body.classList.remove('guided-tour-open');
  renderGuidedTourSetting();
  $('#appMenuBtn').focus({ preventScroll: true });
}

function advanceGuidedTour(direction) {
  if (contextualGuide) return hideContextualGuide();
  const next = guidedTourIndex + direction;
  if (next >= GUIDED_TOUR_STEPS.length) return finishGuidedTour(true);
  if (next < 0) return;
  guidedTourIndex = next;
  renderGuidedTourStep({ focus: false });
}

$('#guidedTourStart').addEventListener('click', startGuidedTour);
$('#guidedTipsToggle').addEventListener('click', () => {
  setContextualGuidesEnabled(!contextualGuidesEnabled());
});
$('#guidedTourClose').addEventListener('click', () => finishGuidedTour(false));
$('#guidedTourBack').addEventListener('click', () => advanceGuidedTour(-1));
$('#guidedTourNext').addEventListener('click', () => advanceGuidedTour(1));
$('#guidedTour').addEventListener('wheel', (event) => {
  if (contextualGuide) return;
  if (!event.target.closest('.guided-tour-card')) event.preventDefault();
}, { passive: false });
$('#guidedTour').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    finishGuidedTour(false);
    return;
  }
  if (contextualGuide) return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    advanceGuidedTour(1);
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    advanceGuidedTour(-1);
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = $$('#guidedTour button:not(:disabled)');
  if (!focusable.length) return;
  const current = focusable.indexOf(document.activeElement);
  const next = event.shiftKey
    ? (current <= 0 ? focusable.length - 1 : current - 1)
    : (current >= focusable.length - 1 ? 0 : current + 1);
  event.preventDefault();
  focusable[next].focus();
});
window.addEventListener('resize', () => {
  if (!$('#guidedTour').hidden) positionGuidedTour();
});
document.addEventListener('scroll', () => {
  if ($('#guidedTour').hidden || guidedTourPositionFrame) return;
  guidedTourPositionFrame = requestAnimationFrame(() => {
    guidedTourPositionFrame = null;
    positionGuidedTour();
  });
}, true);
renderGuidedTourSetting();

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
  if (name === 'system') loadHardwareInfo().catch(() => { /* rendered inline */ });
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
  renderGuidedTourSetting();
  loadMediaPreferences();
  await loadUserPreferences();
  await refreshLoraContext();
  try {
    const s = await api('/api/settings');
    $('#setComfy').value = s.comfyUrl;
    $('#galleryPasswordInput').value = s.galleryPassword || '1234';
    $('#setUnet').value = s.unet;
    $('#setKrea2RawUnet').value = s.krea2RawUnet || '';
    $('#setKrea2TurboLora').value = s.krea2TurboLora || '';
    $('#setKrea2DepthLora').value = s.krea2DepthLora || '';
    $('#setKrea2OutpaintLora').value = s.krea2OutpaintLora || '';
    $('#setDepthAnythingV3Model').value = s.depthAnythingV3Model || '';
    $('#setClip').value = s.clip;
    $('#setVae').value = s.vae;
    $('#setKlein4Unet').value = s.klein4Unet || s.kleinUnet || '';
    $('#setKlein4Clip').value = s.klein4Clip || s.kleinClip || '';
    $('#setKlein4ConsistencyLora').value = s.klein4ConsistencyLora || '';
    $('#setKlein4ConsistencyTrigger').value = s.klein4ConsistencyTrigger || '';
    $('#setKlein9Unet').value = s.klein9Unet || '';
    $('#setKlein9Clip').value = s.klein9Clip || '';
    $('#setKlein9ConsistencyLora').value = s.klein9ConsistencyLora || '';
    $('#setKlein9ConsistencyTrigger').value = s.klein9ConsistencyTrigger || '';
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
    renderExportLocation(s.exportDir || '');
  } catch { /* noop */ }
  setMediaPreferenceControl('setVideoPreviews', state.mediaPreferences.videoPreviews);
  setMediaPreferenceControl('setPreviewCache', state.mediaPreferences.previewCache);
  refreshPreviewCacheStatus();
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
        krea2DepthLora: $('#setKrea2DepthLora').value,
        krea2OutpaintLora: $('#setKrea2OutpaintLora').value,
        depthAnythingV3Model: $('#setDepthAnythingV3Model').value,
        clip: $('#setClip').value,
        vae: $('#setVae').value,
        kleinUnet: $('#setKlein4Unet').value,
        kleinClip: $('#setKlein4Clip').value,
        klein4Unet: $('#setKlein4Unet').value,
        klein4Clip: $('#setKlein4Clip').value,
        klein4ConsistencyLora: $('#setKlein4ConsistencyLora').value,
        klein4ConsistencyTrigger: $('#setKlein4ConsistencyTrigger').value,
        klein9Unet: $('#setKlein9Unet').value,
        klein9Clip: $('#setKlein9Clip').value,
        klein9ConsistencyLora: $('#setKlein9ConsistencyLora').value,
        klein9ConsistencyTrigger: $('#setKlein9ConsistencyTrigger').value,
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
    saveMediaPreferences({
      videoPreviews: mediaPreferenceControlValue('setVideoPreviews'),
      previewCache: mediaPreferenceControlValue('setPreviewCache'),
    });
    toast('Settings saved');
    await loadMeta(true);
    renderHealth();
  } catch (e) { toast(e.message, true); }
});

let lastMeta = null;
let sam3InstallBusy = false;
let sam3InstallResult = null;
let dependencyPollTimer = null;
let dependencySelectionKey = '';
let dependencySelectedComponents = new Set();

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

function syncDependencySelection(missing) {
  const ids = missing.map((entry) => entry.id);
  const key = [...ids].sort().join('|');
  if (key !== dependencySelectionKey) {
    dependencySelectionKey = key;
    dependencySelectedComponents = new Set(ids);
  } else {
    dependencySelectedComponents = new Set([...dependencySelectedComponents].filter((id) => ids.includes(id)));
  }
  return dependencySelectedComponents;
}

function selectedDependencyIds() {
  const missingIds = new Set(dependencyMissingLabels().map((entry) => entry.id));
  return [...dependencySelectedComponents].filter((id) => missingIds.has(id));
}

let setupViewStatus = null;
let setupDependencyState = null;
let setupContextComponents = [];
let setupPendingComponents = [];
let setupPollTimer = null;
let setupAutoRestart = false;
const setupConfirmedDifficultComponents = new Set();

function generationSetupComponents() {
  const components = new Set();
  if (state.view === 'video') {
    const byEngine = { ltx: 'video', 'ltx-edit': 'videoedit', eros: 'eros', wan: 'wan', scail: 'scail' };
    components.add(byEngine[state.vidEngine] || 'video');
    if (state.vidEngine === 'ltx-edit') components.add('video');
    if (state.vidEngine === 'ltx' && state.vidFace && !state.vidRef) components.add('faceid');
    if (state.vidEngine === 'scail' && state.vidScailMode === 'infinity') components.add('scailinfinity');
    if ($('#vid4k').classList.contains('active')) components.add('video4k');
    return [...components];
  }
  if (state.view === 'edit') {
    components.add({ klein4: 'klein4', klein9: 'klein9', qwen: 'qwen', krea2: 'image', krea2ref: 'krea2ref' }[state.editEngine] || 'image');
    if (state.editOutpaint) components.add(state.editEngine === 'krea2'
      ? 'krea2outpaint'
      : (state.editEngine === 'krea2ref' ? 'krea2outpaint' : 'editoutpaint'));
    if (state.editEngine === 'krea2' && hasEditMask()
      && (state.kreaMaskKind === 'smart' || state.kreaMaskTool === 'smart')) components.add('smartmask');
    if (state.editUpscaleEnabled) components.add('upscale');
    return [...components];
  }
  components.add(state.createMode === 'region' ? 'regional' : 'image');
  if (state.createMode === 'image' && state.createRef && state.createGuideMode === 'depth') components.add('krea2depth');
  if (state.createUpscaleEnabled) components.add('upscale');
  return [...components];
}

function missingSetupComponents(required) {
  const unique = [...new Set((required || []).filter(Boolean))];
  if (!lastMeta?.ok) return unique;
  const missing = new Set(lastMeta?.dependencies?.missingComponents || []);
  return unique.filter((id) => missing.has(id));
}

async function ensureGenerationSetup() {
  const required = generationSetupComponents();
  if (!lastMeta?.ok) await loadMeta(true);
  const missing = missingSetupComponents(required);
  if (lastMeta?.ok && !missing.length) return true;
  saveForm();
  await openInitialSetup({
    components: missing.length ? missing : required,
    message: lastMeta?.ok
      ? 'Your prompt is ready. This workflow needs a few models or nodes before it can enter the queue.'
      : 'Your prompt is ready. Connect ComfyUI, then install only this workflow or use the recommended starter setup.',
  });
  return false;
}

function setSetupGuideExpanded(expanded) {
  $('#setupGuideToggle').setAttribute('aria-expanded', String(expanded));
  $('#setupFullGuide').hidden = !expanded;
}

async function openInitialSetup(options = {}) {
  setupContextComponents = [...new Set((options.components || []).filter(Boolean))];
  $('#setupIntro').textContent = options.message
    || 'Your prompt and settings stay in place. Mix Studio can prepare the missing desktop tools now, or you can choose exactly what to install.';
  $('#initialSetupSheet').classList.add('show');
  syncSheetScrollLock();
  await refreshSetupStatus();
}

function setupComponentLabelMap() {
  return new Map(((setupViewStatus && setupViewStatus.components) || []).map((entry) => [entry.id, entry.label]));
}

function setupComponentFitMap() {
  return new Map(((setupViewStatus && setupViewStatus.components) || []).map((entry) => [entry.id, entry.fit]));
}

function setupFitForComponents(components) {
  const priority = { unknown: 0, difficult: 1, limited: 2, recommended: 3 };
  return [...new Set(components || [])]
    .map((id) => setupComponentFitMap().get(id))
    .filter(Boolean)
    .reduce((worst, fit) => (!worst || priority[fit.level] < priority[worst.level] ? fit : worst), null);
}

function renderInitialSetup() {
  if (!setupViewStatus) return;
  const comfy = setupViewStatus.comfy || {};
  const install = comfy.install || {};
  const dependency = setupDependencyState || lastMeta?.dependencies?.install || { state: 'idle' };
  const busy = install.state === 'running' || ['running', 'cancelling', 'restarting'].includes(dependency.state);
  const comfyCard = $('#setupComfyStatus');
  comfyCard.classList.toggle('ready', !!comfy.connected);
  comfyCard.classList.toggle('attention', !comfy.connected);
  $('#setupComfyStatusCopy').textContent = comfy.connected
    ? 'Connected and responding'
    : ((comfy.configuredPath || comfy.detectedPath) ? 'Found, waiting for ComfyUI to run' : 'Not connected yet');

  const contextMissing = missingSetupComponents(setupContextComponents);
  const allMissing = dependencyMissingLabels();
  const workflowCard = $('#setupWorkflowStatus');
  const workflowReady = !!comfy.connected && (setupContextComponents.length ? !contextMissing.length : !allMissing.length);
  workflowCard.classList.toggle('ready', workflowReady);
  workflowCard.classList.toggle('attention', !workflowReady);
  $('#setupWorkflowStatusCopy').textContent = setupContextComponents.length
    ? (workflowReady ? 'Ready to generate' : `${contextMissing.length || setupContextComponents.length} required group${(contextMissing.length || setupContextComponents.length) === 1 ? '' : 's'} need attention`)
    : (comfy.connected ? (allMissing.length ? `${allMissing.length} optional groups available to install` : 'All enabled workflows ready') : 'Scan begins after ComfyUI connects');

  const hardware = setupViewStatus.hardware || {};
  const quickFit = setupViewStatus.quickFit || {};
  $('#setupHardwareCopy').textContent = hardware.gpuAvailable
    ? `${hardware.gpuName || 'NVIDIA GPU'}${hardware.vramGb ? ` · ${hardware.vramGb} GB VRAM` : ' · VRAM unavailable'}${hardware.memoryGb ? ` · ${hardware.memoryGb} GB RAM` : ''}`
    : 'No NVIDIA GPU detected';
  $('#setupHardwareFit').textContent = quickFit.label
    ? `${quickFit.label}. ${quickFit.detail || ''}`
    : 'Model recommendations will match this PC.';
  $('#setupHardwareSummary').dataset.fit = quickFit.level || 'unknown';

  const pathValue = comfy.configuredPath || comfy.detectedPath || '';
  const modelsValue = comfy.modelsPath || (pathValue ? `${pathValue.replace(/[\\/]+$/, '')}\\models` : '');
  if (document.activeElement !== $('#setupComfyUrl')) $('#setupComfyUrl').value = comfy.url || 'http://127.0.0.1:8188';
  if (document.activeElement !== $('#setupComfyPath') && !$('#setupComfyPath').value) $('#setupComfyPath').value = pathValue;
  if (document.activeElement !== $('#setupModelsPath') && !$('#setupModelsPath').value) $('#setupModelsPath').value = modelsValue;
  $('#setupDetectedPath').textContent = comfy.detectedPath
    ? `Detected on this PC: ${comfy.detectedPath}`
    : (comfy.configuredPath ? `Configured folder: ${comfy.configuredPath}` : 'No initialized ComfyUI installation was detected yet.');
  $('#setupUseDetected').disabled = busy || !comfy.detectedPath;
  $('#setupInstallComfy').disabled = busy || !comfy.canInstallOfficial;
  $('#setupInstallComfy').title = comfy.canInstallOfficial ? 'Downloads the signed official ComfyUI Desktop installer' : 'Available when Mix Studio is running on Windows';
  $('#setupSaveConnection').disabled = busy;

  const missing = dependencyMissingLabels();
  const selected = syncDependencySelection(missing);
  const fitByComponent = setupComponentFitMap();
  const list = $('#setupComponentList');
  list.innerHTML = missing.map((entry) => {
    const fit = fitByComponent.get(entry.id);
    return `<button class="setup-component-option${selected.has(entry.id) ? ' selected' : ''}" type="button" data-component="${escapeHtml(entry.id)}" data-fit="${escapeHtml(fit?.level || 'unknown')}" aria-pressed="${selected.has(entry.id) ? 'true' : 'false'}" title="${escapeHtml(fit?.detail || entry.label)}"><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(fit?.label || 'Check requirements')}</small></button>`;
  }).join('');
  $('#setupComponentEmpty').hidden = !!missing.length;
  $('#setupInstallSelected').disabled = busy || !selected.size || !comfy.canInstallDependencies;

  const quick = $('#setupQuickStart');
  const current = $('#setupCurrentWorkflow');
  const requiredNow = contextMissing.length ? contextMissing : setupContextComponents;
  const currentFit = setupFitForComponents(requiredNow);
  quick.querySelector('span').textContent = quickFit.label
    ? `Install the recommended image starter. ${quickFit.label}.`
    : 'Install ComfyUI if needed, then the recommended image starter.';
  if (currentFit) current.querySelector('span').textContent = `Download only what this generation needs. ${currentFit.label}.`;
  quick.disabled = busy || !state.profileIsOwner;
  current.hidden = !setupContextComponents.length || workflowReady;
  current.disabled = busy || !state.profileIsOwner;

  const operation = $('#setupOperation');
  let operationState = null;
  if (install.state === 'running' || install.state === 'error') operationState = install;
  else if (dependency.state && dependency.state !== 'idle') operationState = dependency;
  operation.hidden = !operationState;
  if (operationState) {
    $('#setupOperationTitle').textContent = operationState.state === 'error' ? 'Setup needs attention' : (operationState.state === 'complete' ? 'Install finished' : 'Setting up your desktop');
    $('#setupOperationCopy').textContent = operationState.error || operationState.message || 'Working…';
    const total = Number(operationState.total || 0);
    const completed = Number(operationState.completed || 0);
    $('#setupOperationFill').style.width = total > 0 ? `${Math.max(3, Math.min(100, (completed / total) * 100))}%` : (operationState.state === 'complete' ? '100%' : '34%');
  }
  const restartInfo = setupViewStatus.restart || lastMeta?.dependencies?.restart || {};
  $('#setupRestartComfy').hidden = !dependency.restartRequired;
  $('#setupRestartComfy').disabled = busy || !restartInfo.canRestart;
  $('#setupCheckAgain').disabled = busy;
}

function scheduleSetupPoll() {
  clearTimeout(setupPollTimer);
  if (!$('#initialSetupSheet').classList.contains('show')) return;
  const comfyBusy = setupViewStatus?.comfy?.install?.state === 'running';
  const dependencyBusy = ['running', 'cancelling', 'restarting'].includes(setupDependencyState?.state);
  if (!comfyBusy && !dependencyBusy && !setupPendingComponents.length) return;
  setupPollTimer = setTimeout(() => refreshSetupStatus(), 1000);
}

async function refreshSetupStatus() {
  try {
    setupViewStatus = await api('/api/setup/status');
    if (setupViewStatus.comfy?.install?.state === 'error') setupPendingComponents = [];
    setupDependencyState = await api('/api/dependencies/status').catch(() => setupDependencyState);
    if (['error', 'cancelled'].includes(setupDependencyState?.state)) setupAutoRestart = false;
    if (setupViewStatus.comfy?.connected) await loadMeta(true);
    renderInitialSetup();
    if (setupPendingComponents.length && setupViewStatus.comfy?.canInstallDependencies
      && setupViewStatus.comfy?.install?.state !== 'running') {
      const pending = setupPendingComponents;
      setupPendingComponents = [];
      await startSetupDependencies(pending);
      return;
    }
    if (setupAutoRestart && setupDependencyState?.state === 'complete') {
      if (!setupDependencyState.restartRequired) setupAutoRestart = false;
      else if ((setupViewStatus.restart || lastMeta?.dependencies?.restart)?.canRestart) {
        setupAutoRestart = false;
        const result = await api('/api/comfy/restart', { method: 'POST' });
        setupDependencyState = result.install;
        renderInitialSetup();
        scheduleSetupPoll();
        return;
      }
    }
  } catch (error) {
    toast(error.message, true);
  }
  scheduleSetupPoll();
}

async function saveSetupConnection(pathOverride) {
  const pathValue = String(pathOverride || $('#setupComfyPath').value || '').trim();
  const result = await api('/api/setup/connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: $('#setupComfyUrl').value.trim(),
      path: pathValue,
      modelsPath: $('#setupModelsPath').value.trim() || (pathValue ? `${pathValue.replace(/[\\/]+$/, '')}\\models` : ''),
    }),
  });
  setupViewStatus = result;
  await loadMeta(true);
  setupDependencyState = await api('/api/dependencies/status').catch(() => setupDependencyState);
  renderInitialSetup();
  return result;
}

async function startOfficialComfyFromSetup() {
  const result = await api('/api/setup/comfy/install', { method: 'POST' });
  if (setupViewStatus?.comfy) setupViewStatus.comfy.install = result.install;
  renderInitialSetup();
  scheduleSetupPoll();
}

async function startSetupDependencies(components) {
  const requested = [...new Set((components || []).filter(Boolean))];
  if (!requested.length) return false;
  if (!setupViewStatus) setupViewStatus = await api('/api/setup/status');
  const labels = setupComponentLabelMap();
  const difficult = requested.filter((id) => setupComponentFitMap().get(id)?.level === 'difficult'
    && !setupConfirmedDifficultComponents.has(id));
  if (difficult.length) {
    const names = difficult.map((id) => labels.get(id) || id).join(', ');
    const confirmed = await askConfirm({
      title: 'This setup may exceed the PC',
      message: `${names} ${difficult.length === 1 ? 'is' : 'are'} rated difficult on this PC and may run very slowly or fail with an out-of-memory error.`,
      confirmLabel: 'Install anyway',
      danger: true,
    });
    if (!confirmed) return false;
    difficult.forEach((id) => setupConfirmedDifficultComponents.add(id));
  }
  if (!setupViewStatus.comfy?.canInstallDependencies && setupViewStatus.comfy?.detectedPath) {
    await saveSetupConnection(setupViewStatus.comfy.detectedPath);
    setupViewStatus = await api('/api/setup/status');
  }
  if (!setupViewStatus.comfy?.canInstallDependencies) {
    if (setupViewStatus.comfy?.canInstallOfficial) {
      setupPendingComponents = requested;
      await startOfficialComfyFromSetup();
      return true;
    }
    setSetupGuideExpanded(true);
    toast(setupViewStatus.comfy?.dependencyReason || 'Connect an initialized ComfyUI folder first.', true);
    return false;
  }
  const available = new Set((setupViewStatus.components || []).map((entry) => entry.id));
  const filtered = requested.filter((id) => available.has(id));
  if (!filtered.length) {
    toast('No installable components were selected.', true);
    return false;
  }
  const result = await api('/api/dependencies/install', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ components: filtered }),
  });
  setupDependencyState = result.install;
  if (lastMeta?.dependencies) lastMeta.dependencies.install = result.install;
  renderInitialSetup();
  scheduleSetupPoll();
  return true;
}

$('#setupGuideToggle').addEventListener('click', () => {
  setSetupGuideExpanded($('#setupGuideToggle').getAttribute('aria-expanded') !== 'true');
});
$('#setupQuickStart').addEventListener('click', async () => {
  try {
    setupAutoRestart = true;
    const started = await startSetupDependencies(setupViewStatus?.quickComponents || []);
    if (!started) setupAutoRestart = false;
  }
  catch (error) { setupAutoRestart = false; toast(error.message, true); }
});
$('#setupCurrentWorkflow').addEventListener('click', async () => {
  try {
    setupAutoRestart = false;
    await startSetupDependencies(missingSetupComponents(setupContextComponents).length ? missingSetupComponents(setupContextComponents) : setupContextComponents);
  }
  catch (error) { toast(error.message, true); }
});
$('#setupUseDetected').addEventListener('click', async () => {
  try {
    const detected = setupViewStatus?.comfy?.detectedPath;
    if (!detected) return;
    $('#setupComfyPath').value = detected;
    $('#setupModelsPath').value = `${detected.replace(/[\\/]+$/, '')}\\models`;
    await saveSetupConnection(detected);
  } catch (error) { toast(error.message, true); }
});
$('#setupInstallComfy').addEventListener('click', async () => {
  try { await startOfficialComfyFromSetup(); }
  catch (error) { toast(error.message, true); }
});
$('#setupSaveConnection').addEventListener('click', async () => {
  try { await saveSetupConnection(); toast('ComfyUI connection saved'); }
  catch (error) { toast(error.message, true); }
});
$('#setupComponentList').addEventListener('click', (event) => {
  const option = event.target.closest('[data-component]');
  if (!option || option.disabled) return;
  const id = option.dataset.component;
  if (dependencySelectedComponents.has(id)) dependencySelectedComponents.delete(id);
  else dependencySelectedComponents.add(id);
  renderInitialSetup();
});
$('#setupInstallSelected').addEventListener('click', async () => {
  try {
    setupAutoRestart = false;
    await startSetupDependencies(selectedDependencyIds());
  }
  catch (error) { toast(error.message, true); }
});
$('#setupRestartComfy').addEventListener('click', async () => {
  try {
    const result = await api('/api/comfy/restart', { method: 'POST' });
    setupDependencyState = result.install;
    renderInitialSetup();
    scheduleSetupPoll();
  } catch (error) { toast(error.message, true); }
});
$('#setupCheckAgain').addEventListener('click', refreshSetupStatus);
$('#setupEditProfile').addEventListener('click', () => {
  $('#initialSetupSheet').classList.remove('show');
  syncSheetScrollLock();
  openProfileEdit();
});
$('#dependencyOpenSetup').addEventListener('click', () => {
  $('#settingsSheet').classList.remove('show');
  openInitialSetup();
});

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
  const selectionHead = $('#dependencySelectionHead');
  const toggleAll = $('#dependencyToggleAll');
  const install = $('#dependencyInstallMissing');
  const cancel = $('#dependencyCancelInstall');
  const repair = $('#dependencyRepairMissing');
  const restart = $('#dependencyRestartComfy');
  const check = $('#dependencyCheckAll');
  const selected = syncDependencySelection(missing);
  const selectedCount = selected.size;
  const busy = ['running', 'cancelling', 'restarting'].includes(installState.state);
  const cancellable = installState.state === 'running' || installState.state === 'cancelling';
  const ready = !!lastMeta?.ok && !missing.length && !busy;
  card.classList.toggle('ready', ready);
  card.classList.toggle('installing', busy);
  list.innerHTML = missing.map((entry) => `<button class="dependency-option${selected.has(entry.id) ? ' selected' : ''}" type="button" data-component="${escapeHtml(entry.id)}" aria-pressed="${selected.has(entry.id) ? 'true' : 'false'}" title="${escapeHtml(entry.label)}"${busy || !state.profileIsOwner ? ' disabled' : ''}>${escapeHtml(entry.label)}</button>`).join('');
  selectionHead.hidden = !missing.length || busy || !state.profileIsOwner;
  toggleAll.textContent = selectedCount === missing.length ? 'Clear' : 'Select all';
  install.disabled = busy;
  cancel.disabled = installState.state === 'cancelling';
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

  if (busy) {
    badge.textContent = installState.state === 'restarting' ? 'Restarting' : (installState.state === 'cancelling' ? 'Cancelling' : 'Installing');
    const transfer = installState.phase === 'downloading-model' && installState.downloaded
      ? ` ${formatDependencyBytes(installState.downloaded)}${installState.downloadTotal ? ` / ${formatDependencyBytes(installState.downloadTotal)}` : ''}`
      : '';
    status.textContent = `${installState.message || 'Working…'}${transfer}`;
  } else if (installState.state === 'cancelled') {
    badge.textContent = 'Cancelled';
    status.textContent = installState.message || 'The dependency operation was cancelled safely.';
  } else if (!lastMeta?.ok) {
    badge.textContent = 'Offline';
    status.textContent = 'Start ComfyUI to scan models and nodes. You can still install trusted missing packs once its folder is configured.';
  } else if (installState.state === 'error') {
    badge.textContent = 'Needs attention';
    status.textContent = installState.error || installState.message || 'The last dependency operation did not finish.';
  } else if (ready) {
    badge.textContent = 'Green';
    status.textContent = 'Every enabled Mix Studio model and node group is ready.';
  } else if (installState.restartRequired) {
    badge.textContent = 'Restart needed';
    const restartInfo = dependency.restart || {};
    status.textContent = restartInfo.canRestart
      ? 'The downloads are finished. Restart ComfyUI to load the new nodes and models.'
      : `The downloads are finished. ${restartInfo.reason || 'Restart ComfyUI on the generation desktop, then Check again.'}`;
  } else if (!state.profileIsOwner) {
    badge.textContent = 'Owner only';
    status.textContent = `${missing.length} missing component${missing.length === 1 ? '' : 's'} can be installed by the owner profile.`;
  } else if (!dependency.canInstall) {
    badge.textContent = 'Setup needed';
    status.textContent = dependency.reason || 'Open the setup guide to connect or install ComfyUI.';
  } else {
    badge.textContent = 'Missing';
    status.textContent = `${missing.length} component${missing.length === 1 ? '' : 's'} need${missing.length === 1 ? 's' : ''} attention. Choose the workflows you want to add.`;
  }

  cancel.hidden = !cancellable || !state.profileIsOwner;
  cancel.textContent = installState.state === 'cancelling' ? 'Cancelling…' : 'Cancel download';
  install.hidden = ready || !state.profileIsOwner || busy;
  repair.hidden = ready || !state.profileIsOwner || busy;
  install.textContent = `Install selected${selectedCount ? ` (${selectedCount})` : ''}`;
  install.disabled = busy || !selectedCount || !dependency.canInstall || !state.profileIsOwner;
  repair.textContent = 'Repair selected';
  repair.disabled = busy || !selectedCount || !dependency.canInstall || !state.profileIsOwner;
  const restartInfo = dependency.restart || {};
  restart.hidden = !state.profileIsOwner;
  restart.disabled = busy || !restartInfo.canRestart;
  restart.classList.toggle('needed', !!installState.restartRequired && !busy);
  restart.textContent = installState.state === 'restarting' ? 'Restarting ComfyUI…' : 'Restart ComfyUI';
  restart.title = restartInfo.canRestart ? 'Stops and starts the configured Windows ComfyUI instance when queues are idle' : (restartInfo.reason || 'Restart unavailable');
}

function scheduleDependencyPoll() {
  clearTimeout(dependencyPollTimer);
  const install = lastMeta && lastMeta.dependencies && lastMeta.dependencies.install;
  if (!install || !['running', 'cancelling', 'restarting'].includes(install.state)) return;
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
    status.textContent = dependency.reason || 'Open the setup guide so Mix Studio can find the ComfyUI Python environment.';
  } else {
    status.textContent = `${missing.length || 'Some'} SAM3 components are missing. Mix Studio can install the official node pack without changing gallery data.`;
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

$('#dependencyMissingList').addEventListener('click', (event) => {
  const option = event.target.closest('[data-component]');
  if (!option || option.disabled) return;
  const id = option.dataset.component;
  if (dependencySelectedComponents.has(id)) dependencySelectedComponents.delete(id);
  else dependencySelectedComponents.add(id);
  renderDependencyManager();
});

$('#dependencyToggleAll').addEventListener('click', () => {
  const missing = dependencyMissingLabels();
  dependencySelectedComponents = dependencySelectedComponents.size === missing.length
    ? new Set()
    : new Set(missing.map((entry) => entry.id));
  renderDependencyManager();
});

$('#dependencyInstallMissing').addEventListener('click', async () => {
  const components = selectedDependencyIds();
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
  const components = selectedDependencyIds();
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

$('#dependencyCancelInstall').addEventListener('click', async () => {
  try {
    const result = await api('/api/dependencies/cancel', { method: 'POST' });
    if (lastMeta && lastMeta.dependencies) lastMeta.dependencies.install = result.install;
    renderDependencyManager();
    renderSam3Dependency();
    scheduleDependencyPoll();
  } catch (error) { toast(error.message, true); }
});

$('#dependencyRestartComfy').addEventListener('click', async () => {
  if (!await askConfirm({
    title: 'Restart ComfyUI?',
    message: 'Mix Studio will wait for an idle queue, restart ComfyUI, and reconnect automatically.',
    confirmLabel: 'Restart ComfyUI',
  })) return;
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
  const labels = { core: 'Core nodes', enhance: 'Prompt enhance (TextGenerate)', klein: 'Edit (Flux 2 Klein) nodes', qwenedit: 'Edit (Qwen Image Edit) nodes', regional: 'Krea2 regional prompting nodes', krea2inpaint: 'Krea2 Fill nodes', krea2ref: 'Krea 2 Edit (Rebalance) nodes', krea2outpaint: 'Krea 2 Expand nodes', editoutpaint: 'Klein / Qwen Expand nodes', smartmask: 'Smart Mask (SAM3) nodes', upscale: 'SeedVR2 nodes', ultimateupscale: 'Ultimate SD Upscale nodes', video: 'LTX 2.3 video nodes', videoedit: 'LTX Edit guide-video nodes', video4k: 'RTX 4K pass (optional)', wan: 'Wan 2.2 nodes', eros: '10Eros DMD nodes', scail: 'SCAIL 2 motion transfer nodes', scailinfinity: 'SCAIL 2 Infinity node', faceid: 'LTX Face ID (BFS) nodes' };
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

desktopWorkspaceQuery.addEventListener('change', (event) => {
  syncNavigation();
  renderDesktopStage();
});

loadForm();
syncGallerySortControl();
setPromptDraft(state.prompts[state.view] || '');
applySavedEngineOrders();
loadMediaPreferences();
restoreGenerationTuning(generationTuningMode(state.view));
// First launch goes straight to the workspace. The complete tutorial remains
// available from Advanced Settings and never starts automatically.
markEngineRow('editEngineRow', state.editEngine);
markEngineRow('vidEngineRow', state.vidEngine);
updatePromptClear();
computeDims();
renderEnhance();
renderAspects();
renderDims();
renderLoras();
renderRefs();
setView(state.view, state.view === 'create' ? { createMode: state.createMode } : {});
restorePersistedWorkspaceControls();
restorePersistedWorkspaceMedia();
connectEvents();
loadMeta();
refreshGallery(true);
setInterval(() => loadMeta(), 30000);
refreshQueue().catch(() => { /* noop */ });
setInterval(() => { refreshQueue().catch(() => { /* noop */ }); }, 15000);
