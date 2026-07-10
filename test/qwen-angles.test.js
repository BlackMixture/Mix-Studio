'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('supported Edit models expose a visual multi-angle picker without surfacing control prompts', () => {
  assert.match(html, /id="qwenAnglesBtn"[^>]*aria-label="Camera angles"/);
  assert.match(html, /id="qwenAnglesInline"/);
  assert.match(html, /id="qwenAnglesModeBtn"[^>]*aria-label="Camera angles"/);
  assert.match(html, /id="qwenAnglesTextBtn"[^>]*aria-label="Show text prompt"[^>]*>[\s\S]*>T</);
  assert.match(html, /id="qwenAngleGrid"/);
  assert.match(html, /id="qwenElevationRow"/);
  assert.match(html, /id="qwenDistanceRow"/);
  assert.match(html, /id="qwenAnglesToggleAll"/);
  assert.doesNotMatch(html, /Each selected view becomes its own Qwen Edit export/);
  assert.match(app, /function selectedQwenAngleViews\(\)/);
  assert.match(app, /return \[\.\.\.views, \.\.\.elevations, \.\.\.distances\]/);
  assert.match(app, /const ANGLE_EDIT_ENGINES = new Set\(\['klein4', 'klein9', 'qwen'\]\)/);
  assert.match(app, /#qwenAngleTool'\)\.hidden = !supportsCurrentEditAngles\(\)/);
  assert.match(app, /qwenAnglesMode: false/);
  assert.match(app, /function renderQwenAngleMode\(\)/);
  assert.match(app, /inline\.classList\.toggle\('is-active', active\)/);
  assert.match(app, /textPane\.classList\.toggle\('is-collapsed', active\)/);
  assert.match(app, /state\.qwenAnglesMode = true;/);
  assert.match(app, /state\.qwenAnglesMode = false;/);
  assert.match(css, /\.qwen-angle-grid/);
  assert.match(css, /\.qwen-angle-inline/);
  assert.match(css, /\.qwen-prompt-text\.is-collapsed \{[\s\S]*grid-template-rows: 0fr/);
  assert.match(css, /\.qwen-angle-inline\.is-active \{[\s\S]*grid-template-rows: 1fr/);
  assert.match(css, /\.qwen-angle-mode-toggle/);
  assert.match(css, /@media \(max-width: 420px\) \{[\s\S]*\.qwen-angle-options \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.qwen-angle-card\.active/);
  assert.match(app, /const framingIcon = \(id\) =>/);
  assert.match(css, /\.qwen-framing-icon/);
  assert.match(app, /state\.qwenAngles = allSelected \? \[\] : QWEN_ANGLE_VIEWS\.map/);
  assert.match(app, /qwenAngleElevations: \[\]/);
  assert.match(app, /qwenAngleDistances: \[\]/);
  assert.match(app, /setValues\(values\.includes\(option\.id\)/);
});

test('Each selected camera angle queues its own edit request for supported models', () => {
  assert.match(app, /const qwenAngleExports = supportsCurrentEditAngles\(\)/);
  assert.match(app, /qwenAngle: angle/);
  assert.match(app, /for \(const request of requests\)/);
  assert.match(app, /camera variations queued/);
  assert.match(app, /const angleGroupId = qwenAngleExports\.length > 1 \? createAngleGroupId\(\) : null/);
  assert.match(app, /angleGroupId,/);
});

test('Multi-angle exports appear as one gallery set with an angle icon', () => {
  assert.match(app, /function galleryEntries\(items\)/);
  assert.match(app, /function angleGroupItems\(item\)/);
  assert.match(app, /angle-group-badge/);
  assert.match(app, /Variation \$\{angleIndex \+ 1\} of \$\{angleItems\.length\}/);
  assert.match(css, /\.card \.badge\.angle-group-badge/);
  assert.match(app, /function galleryNavigationTarget\(item, direction\)/);
  assert.match(app, /galleryNavigationTarget\(state\.currentItem, direction\)/);
  assert.match(app, /angle-group-glyph/);
  assert.match(css, /\.angle-group-chip\.active/);
  assert.match(server, /angleGroupId: job\.params\.angleGroupId/);
  assert.match(server, /p\.angleGroupId = p\.qwenAngle/);
});

test('a multi-angle gallery set can be saved as one composite image', () => {
  assert.match(app, /Save angle composite/);
  assert.match(app, /saveImageComposite\(it, 'angles'\)/);
  assert.match(server, /route === '\/api\/image-composite'/);
  assert.match(server, /This image is not part of a multi-angle set/);
  assert.match(server, /function buildImageComposite\(imageNames\)/);
});

test('Qwen angle jobs retain the installed LoRA and documented control-token format', () => {
  assert.match(server, /qwenEditAnglesLora: 'qwen_image_edit_2511_multiple-angles-lora\.safetensors'/);
  assert.match(server, /graph\.angle_lora/);
  assert.match(server, /strength_model: 0\.9/);
  assert.match(server, /const qwenPrompt = p\.anglePrompt \|\| p\.qwenAnglePrompt \|\| p\.prompt/);
  assert.match(server, /if \(p\.editEngine === 'qwen'\) p\.qwenAnglePrompt = p\.anglePrompt/);
});

test('Klein camera angles use prompt conditioning without loading the Qwen angle LoRA', () => {
  assert.match(server, /const editPrompt = p\.anglePrompt \|\| p\.prompt/);
  assert.match(server, /!supportsEditAngles\(p\.editEngine\)/);
  assert.match(server, /p\.anglePrompt = editAnglePrompt\(p\.editEngine, p\.qwenAngle, p\.prompt\)/);
  assert.match(server, /Camera variations need a source image in reference slot 1/);
  assert.match(app, /qwenAngleExports\.length && !state\.refs\[0\]/);
});
