'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('Edit and Video model selectors explain that the first reordered model is the default', () => {
  assert.match(html, /id="editModelOrderHint">Hold and drag to reorder · first is default</);
  assert.match(html, /id="videoModelOrderHint">Hold models to reorder · first is default</);
  assert.match(html, /id="editEngineRow"[^>]*aria-describedby="editModelOrderHint"/);
  assert.match(html, /id="vidEngineRow"[^>]*aria-describedby="videoModelOrderHint"/);
  assert.match(css, /\.video-choice-grid \.chip\[data-engine\]\.model-default::after \{[\s\S]*top: 50%;[\s\S]*transform: translateY\(-50%\)/);
});

test('LTX Director stays pinned beside LTX without becoming a reorderable engine', () => {
  const director = html.match(/<button\b[^>]*id="directorModelOption"[^>]*>/)?.[0] || '';
  assert.match(director, /\bdata-director-entry\b/);
  assert.doesNotMatch(director, /\bdata-engine=/);
  assert.match(app, /function modelOrderButtons\(rowId, visibleOnly = false\)[\s\S]{0,180}\.chip\[data-engine\]/);
  assert.match(app, /if \(rowId === 'vidEngineRow'\)[\s\S]{0,260}ltxOption\.after\(directorOption\)/);
});

test('Model orders and defaults persist in profile-scoped form state', () => {
  assert.match(app, /const EDIT_MODEL_ORDER_VERSION = 2;/);
  assert.match(app, /const DEFAULT_EDIT_ENGINE_ORDER = Object\.freeze\(\['klein9', 'klein4', 'qwen', 'krea2ref', 'krea2'\]\)/);
  assert.match(app, /editModelOrderVersion: EDIT_MODEL_ORDER_VERSION/);
  assert.match(app, /editEngineOrder: state\.editEngineOrder, editEngineDefault: state\.editEngineDefault/);
  assert.match(app, /videoEngineOrder: state\.videoEngineOrder, videoEngineDefault: state\.videoEngineDefault/);
  assert.match(app, /const savedEditOrder = currentEditOrder \? f\.editEngineOrder : DEFAULT_EDIT_ENGINE_ORDER/);
  assert.match(app, /state\.editEngineOrder = promoteEngineDefault\(savedEditOrder, editDefault, EDIT_ENGINES\)/);
  assert.match(app, /state\.videoEngineOrder = promoteEngineDefault\(f\.videoEngineOrder, videoDefault, VIDEO_ENGINES\)/);
  assert.match(app, /state\.editEngine = EDIT_ENGINES\.includes\(f\.editEngine\) \? f\.editEngine : state\.editEngineDefault/);
  assert.match(app, /state\.vidEngine = VIDEO_ENGINES\.includes\(f\.vidEngine\) \? f\.vidEngine : state\.videoEngineDefault/);
});

test('Hold-and-drag model ordering reflows smoothly and locks touch scrolling only after activation', () => {
  assert.match(app, /wireModelOrder\('vidEngineRow'\)/);
  assert.match(app, /wireModelOrder\('editEngineRow'\)/);
  assert.match(app, /gesture\.timer = setTimeout\(\(\) => beginModelOrderDrag\(gesture\), 260\)/);
  assert.match(app, /document\.addEventListener\('touchmove', preventModelOrderTouchScroll, \{ passive: false, capture: true \}\)/);
  assert.match(app, /function modelOrderSlotIndex\(slots, clientX, clientY, currentIndex, hysteresis = 14\)/);
  assert.match(app, /distances\[candidate\] \+ hysteresis < distances\[currentIndex\]/);
  assert.match(app, /gesture\.slots = buttons\.map/);
  assert.doesNotMatch(app, /elementFromPoint\(event\.clientX, event\.clientY\).*chip\[data-engine\]/);
  assert.match(app, /button\.animate\(\[/);
  assert.match(app, /ghost\.classList\.add\('model-order-ghost'\)/);
  assert.match(app, /dataset\.modelDragSuppress === 'true'/);
  assert.match(app, /event\.shiftKey/);
  assert.match(css, /\.model-order-ghost \{/);
  assert.match(css, /body\.model-order-dragging \{/);
});
