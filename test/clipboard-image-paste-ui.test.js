'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

function sourceBetween(start, end) {
  const startIndex = app.indexOf(start);
  const endIndex = app.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  assert.notEqual(endIndex, -1, `missing ${end}`);
  return app.slice(startIndex, endIndex);
}

test('the prompt composer advertises and politely announces clipboard image paste', () => {
  assert.match(html, /id="promptComposer"[^>]*contenteditable="true"[^>]*aria-describedby="promptPasteHint"/);
  assert.match(html, /id="promptPasteHint">Paste an image here to add it to the active workflow input\.<\/span>/);
  assert.match(html, /id="clipboardPasteStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(app, /\$\('#promptComposer'\)\.addEventListener\('paste', handlePromptClipboardImagePaste\)/);
  assert.doesNotMatch(app, /document\.addEventListener\('paste'/);
});

test('clipboard extraction accepts image files and leaves text-only paste native', () => {
  const extractorSource = sourceBetween(
    'const CLIPBOARD_IMAGE_EXTENSIONS = Object.freeze',
    'function clipboardImageFilename(file, index = 0, now = Date.now())',
  );
  const clipboardImageFiles = new Function(`${extractorSource}\nreturn clipboardImageFiles;`)();
  const png = { type: 'image/png', name: '' };
  const hintedPng = { type: '', name: '' };
  const jpeg = { type: 'image/jpeg', name: 'photo.jpg' };
  const genericPng = { type: 'application/octet-stream', name: 'clipboard.png' };
  assert.deepEqual(clipboardImageFiles({
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => png },
    ],
    files: [],
  }), [png]);
  assert.deepEqual(clipboardImageFiles({
    items: [{ kind: 'file', type: 'image/png', getAsFile: () => hintedPng }],
    files: [],
  }), [hintedPng]);
  assert.deepEqual(clipboardImageFiles({ items: [], files: [jpeg, { type: 'text/plain' }] }), [jpeg]);
  assert.deepEqual(clipboardImageFiles({ items: [], files: [genericPng] }), [genericPng]);
  assert.deepEqual(clipboardImageFiles({
    items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
    files: [],
  }), []);

  const handler = sourceBetween(
    'function handlePromptClipboardImagePaste(event)',
    'async function usePreviousGenerations(assets)',
  );
  assert.ok(handler.indexOf('if (!files.length) return;') < handler.indexOf('event.preventDefault();'));
});

test('clipboard images receive supported extensions and web-image URLs do not pollute prompts', () => {
  const filenameSource = sourceBetween(
    'const CLIPBOARD_IMAGE_EXTENSIONS = Object.freeze',
    'function clipboardPasteContext()',
  );
  const api = new Function(`${filenameSource}\nreturn { clipboardImageFilename, clipboardImageCaption };`)();
  assert.equal(api.clipboardImageFilename({ type: 'image/png', name: '' }, 0, 42), 'clipboard-image-42.png');
  assert.equal(api.clipboardImageFilename({ type: 'image/webp', name: '' }, 1, 42), 'clipboard-image-42-2.webp');
  assert.equal(api.clipboardImageFilename({ type: 'image/jpeg', name: 'portrait.jpeg' }, 0, 42), 'portrait.jpeg');
  assert.equal(api.clipboardImageFilename({ type: '', name: 'clipboard.tiff' }, 0, 42), 'clipboard.tiff');
  assert.equal(api.clipboardImageFilename({ type: 'image/svg+xml', name: '' }, 0, 42), '');
  assert.equal(api.clipboardImageCaption({
    getData: (type) => type === 'text/plain' ? 'https://example.com/image.png' : '<img src="https://example.com/image.png">',
  }), '');
  assert.equal(api.clipboardImageCaption({
    getData: (type) => type === 'text/plain' ? 'A red wool coat' : '<p>A red wool coat</p><img src="coat.png">',
  }), 'A red wool coat');
});

test('pasted images use the existing upload path and deterministic workflow destinations', () => {
  const upload = sourceBetween(
    'async function uploadClipboardImage(file, index = 0)',
    'async function resolveClipboardImageDestination(context, fileCount)',
  );
  assert.match(upload, /URL\.createObjectURL\(file\)/);
  assert.match(upload, /await imageDimensions\(url\)/);
  assert.match(upload, /await uploadInputAsset\(file, filename, \{ quietComplete: true \}\)/);
  assert.ok(upload.indexOf('await imageDimensions(url)') < upload.indexOf('await uploadInputAsset(file, filename'));
  assert.match(upload, /URL\.revokeObjectURL\(url\)/);
  assert.match(app, /if \(options\.quietComplete\) \{[\s\S]*status\.remove\(\)/);

  const routing = sourceBetween(
    'function clipboardPasteContext()',
    'async function usePreviousGenerations(assets)',
  );
  assert.match(routing, /const regionId = selectedRegion\(\)\?\.id[\s\S]*kind: 'region'[^\n]*regionId/);
  assert.match(routing, /kind: 'create'[^\n]*guideMode: state\.createGuideMode/);
  assert.match(routing, /state\.editEngine === 'krea2' \|\| editOutpaintActive\(\) \? 1 : state\.refs\.length/);
  assert.match(routing, /const activeFace = state\.vidEngine === 'ltx' && !!state\.vidFace/);
  assert.match(routing, /state\.vidEngine === 'ltx-edit' \? 'unsupported' : \(activeFace \? 'video-face' : 'video'\)/);
  assert.match(routing, /setCreateImageGuideAsset\(assets\[0\], context\.guideMode,/);
  assert.match(routing, /state\.regions\.find\(\(entry\) => entry\.id === context\.regionId\)/);
  assert.match(routing, /setRegionReference\(assets\[0\], \{ announce: false \}\)/);
  assert.match(routing, /renderRefs\(\{ preservePromptComposer: true \}\)/);
  assert.match(routing, /insertPromptReference\(slot \+ 1, caret,/);
  assert.match(routing, /state\.vidFace = Object\.assign/);
  assert.match(routing, /state\.vidRef = null/);
  assert.match(routing, /state\.vidRef = assets\[0\]/);
  assert.match(routing, /state\.vidFace = null/);
  assert.doesNotMatch(routing, /state\.vidEnd = assets\[0\]/);
});

test('rapid image pastes are serialized and destination feedback respects reduced motion', () => {
  assert.match(app, /let clipboardImagePasteQueue = Promise\.resolve\(\)/);
  assert.match(app, /clipboardImagePasteQueue = clipboardImagePasteQueue[\s\S]*\.then\(\(\) => processClipboardImagePaste\(request\)\)/);
  assert.match(app, /currentClipboardPasteContextKey\(\) === request\.context\.key/);
  assert.match(app, /assertClipboardImageDestination\(request, destination\)/);
  assert.match(app, /clipboardImagePastePending[\s\S]*aria-busy/);
  assert.match(app, /insertClipboardPasteAnchor\(promptRange, caption\)/);
  assert.match(app, /promptComposerRange\(null, \{ preferLive: true \}\)/);
  assert.match(app, /function flashClipboardPasteDestination\(element\)/);
  assert.match(css, /\.clipboard-paste-anchor \{[\s\S]*width: 0/);
  assert.match(css, /\.clipboard-paste-received \{[\s\S]*animation: clipboardPasteReceived/);
  assert.match(css, /@keyframes clipboardPasteReceived/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.clipboard-paste-received \{ animation: none; \}/);
});

test('async paste keeps its exact destination and falls through corrupt candidates', () => {
  const routing = sourceBetween(
    'function clipboardPasteContext()',
    'function announceClipboardImagePaste(message, isError = false)',
  );
  assert.match(routing, /key: `create:region:\$\{regionId \|\| 'none'\}`/);
  assert.match(routing, /key: `create:image:\$\{state\.createGuideMode\}`/);
  assert.match(routing, /key: `video:\$\{state\.vidEngine\}:\$\{kind\}`/);

  const processing = sourceBetween(
    'async function processClipboardImagePaste(request)',
    'function handlePromptClipboardImagePaste(event)',
  );
  assert.match(processing, /request\.files\.length && assets\.length < limit/);
  assert.match(processing, /assertClipboardImageDestination\(request, destination\)/);
  assert.doesNotMatch(processing, /request\.files\.slice\(0, limit\)/);
  assert.match(processing, /if \(!committed\) assets\.forEach\(\(asset\) => releaseClipboardAssetUrl\(asset\)\)/);
});

test('Edit reference tokens stay anchored, separated, and do not steal a later selection', () => {
  const insertion = sourceBetween(
    'function promptRangeNeedsSeparator(range, composer)',
    'function renderPromptMentionPicker()',
  );
  assert.match(insertion, /options\.ensureSeparator && promptRangeNeedsSeparator/);
  assert.match(insertion, /options\.preserveSelection === true/);
  assert.match(insertion, /document\.createDocumentFragment\(\)/);

  const apply = sourceBetween(
    'async function applyClipboardImages(request, destination, assets)',
    'async function processClipboardImagePaste(request)',
  );
  assert.match(apply, /clipboardPasteAnchorRange\(request\.anchor\)/);
  assert.match(apply, /ensureSeparator: true, preserveSelection: true/);
  assert.match(apply, /releaseClipboardAssetUrl\(previous\[index\], assets\[index\]\)/);

  const anchor = sourceBetween(
    "function insertClipboardPasteAnchor(range, caption = '')",
    'function clipboardPasteAnchorRange(anchor)',
  );
  assert.match(anchor, /caret = range\.cloneRange\(\);[\s\S]*caret\.collapse\(true\)/);
  assert.doesNotMatch(anchor, /deleteContents\(\)/);
});
