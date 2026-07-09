'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('Edit exposes SAM3, brush, and bounding-box area selection for supported engines', () => {
  assert.match(app, /const EDIT_MASK_ENGINES = new Set\(\['klein4', 'klein9', 'qwen', 'krea2'\]\)/);
  assert.match(html, /id="kreaMaskSmartMode"/);
  assert.match(html, /id="kreaMaskBrushMode"/);
  assert.match(html, /id="kreaMaskBoxMode"/);
  assert.match(html, /id="kreaMaskPrompt"/);
  assert.match(html, /id="kreaMaskPointAdd"/);
  assert.match(html, /id="kreaMaskPointRemove"/);
  assert.match(html, /id="kreaMaskPointDelete"/);
  assert.match(app, /state\.kreaMaskTool === 'box'/);
  assert.match(app, /ctx\.fillRect\(Math\.min\(start\.x, p\.x\)/);
  assert.match(app, /api\('\/api\/edit-mask\/sam3'/);
  assert.match(app, /Array\.isArray\(result\.dataUrls\)/);
  assert.match(app, /globalCompositeOperation = index \? 'lighten' : 'source-over'/);
  assert.match(app, /function beginSmartMaskPointDrag\(event\)/);
  assert.match(app, /function moveSmartMaskPointDrag\(event\)/);
  assert.match(app, /function finishSmartMaskPointDrag\(event\)/);
  assert.match(app, /rerunSmartMaskFromPoints\(\)/);
  assert.match(app, /state\.kreaMaskPointDeleteMode/);
  assert.match(css, /\.edit-area-mode/);
  assert.match(css, /\.smart-mask-point\.dragging/);
});

test('localized edit requests upload their mask automatically and preserve source-matched output', () => {
  assert.match(app, /supportsCurrentEditMask\(\) && hasEditMask\(\)/);
  assert.match(app, /editAspectOverride: mode === 'edit' && state\.editAspectOverride && !localizedEdit/);
  assert.match(app, /editMaskMode: localizedEdit \? \(state\.kreaMaskKind \|\| state\.kreaMaskTool\)/);
  assert.match(app, /Edit area is active — changes stay inside the mask/);
  assert.match(html, /id="kreaMaskApply">Done/);
});

test('mask refinements visibly apply feathering and invert the current pixels', () => {
  assert.match(html, /id="kreaMaskFeather"/);
  assert.match(html, /id="kreaMaskInvert"/);
  assert.match(html, /id="kreaMaskPreviewToggle"/);
  assert.match(html, /id="kreaMaskCutoutCanvas"/);
  assert.match(html, /id="kreaMaskOverlayCanvas"/);
  assert.match(html, /id="kreaMaskGesture"/);
  assert.match(html, /id="editMaskInfluence"/);
  assert.match(html, /id="editMaskExpand"/);
  assert.match(app, /ctx\.filter = `blur\(\$\{feather\}px\)`/);
  assert.match(app, /function invertKreaMask\(\)/);
  assert.match(app, /const current = \(image\.data\[i\] \* image\.data\[i \+ 3\]\) \/ 255/);
  assert.match(app, /function renderMaskOverlay\(\)/);
  assert.match(app, /function beginMaskGesture\(event\)/);
  assert.match(app, /Brush Size \$\{state\.kreaBrush\} px · Brush Pressure/);
  assert.match(app, /function setSmartMaskLoading\(message\)/);
  assert.match(app, /Still loading SAM3 — first use can take a few minutes/);
  assert.match(app, /d\.kind === 'smartMask' && smartMaskRunning/);
  assert.match(app, /ctx\.globalCompositeOperation = 'destination-out'/);
  assert.match(app, /ref\.displayUrl = cutout\.toDataURL\('image\/png'\)/);
  assert.match(app, /function scheduleMaskedRefPreview\(\)/);
  assert.match(app, /scheduleMaskedRefPreview\(\);/);
  assert.match(app, /maskInfluence: localizedEdit \? state\.editMaskInfluence/);
  assert.match(app, /maskExpand: localizedEdit \? state\.editMaskExpand/);
  assert.doesNotMatch(app, /red tint/);
});
