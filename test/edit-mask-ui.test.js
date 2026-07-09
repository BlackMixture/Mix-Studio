'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('Edit exposes SAM3, brush, and bounding-box area selection for supported engines', () => {
  assert.match(app, /const EDIT_MASK_ENGINES = new Set\(\['klein9', 'qwen', 'krea2'\]\)/);
  assert.match(html, /id="kreaMaskSmartMode"/);
  assert.match(html, /id="kreaMaskBrushMode"/);
  assert.match(html, /id="kreaMaskBoxMode"/);
  assert.match(html, /id="kreaMaskPrompt"/);
  assert.match(html, /id="kreaMaskPointAdd"/);
  assert.match(html, /id="kreaMaskPointRemove"/);
  assert.match(app, /state\.kreaMaskTool === 'box'/);
  assert.match(app, /ctx\.fillRect\(Math\.min\(start\.x, p\.x\)/);
  assert.match(app, /api\('\/api\/edit-mask\/sam3'/);
  assert.match(app, /Array\.isArray\(result\.dataUrls\)/);
  assert.match(app, /globalCompositeOperation = index \? 'lighten' : 'source-over'/);
  assert.match(css, /\.edit-area-mode/);
});

test('localized edit requests upload their mask and preserve source-matched output', () => {
  assert.match(app, /supportsCurrentEditMask\(\) && hasEditMask\(\)/);
  assert.match(app, /editAspectOverride: mode === 'edit' && state\.editAspectOverride && !localizedEdit/);
  assert.match(app, /editMaskMode: localizedEdit \? \(state\.kreaMaskKind \|\| state\.kreaMaskTool\)/);
  assert.match(app, /changes stay inside this area/);
});

test('mask refinements include feather, invert, and a true transparent cutout preview', () => {
  assert.match(html, /id="kreaMaskFeather"/);
  assert.match(html, /id="kreaMaskInvert"/);
  assert.match(html, /id="kreaMaskPreviewToggle"/);
  assert.match(html, /id="kreaMaskCutoutCanvas"/);
  assert.match(app, /ctx\.filter = `blur\(\$\{feather\}px\)`/);
  assert.match(app, /ctx\.globalCompositeOperation = 'destination-out'/);
  assert.match(app, /ref\.displayUrl = cutout\.toDataURL\('image\/png'\)/);
  assert.doesNotMatch(app, /red tint/);
});
