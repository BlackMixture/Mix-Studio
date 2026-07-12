'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('every Edit model exposes one compact outpaint mode with a live placement preview', () => {
  assert.match(html, /id="editOutpaintControl"/);
  assert.match(html, /id="editOutpaintToggle"[^>]*role="switch"/);
  assert.match(html, /id="editOutpaintPreview"/);
  assert.match(html, /id="editOutpaintSource"[^>]*role="slider"/);
  assert.match(html, /id="editOutpaintScale"[^>]*type="range"/);
  assert.match(html, /id="editOutpaintOutputValue"/);
  assert.match(html, /data-outpaint-position="start"/);
  assert.match(html, /data-outpaint-position="center"/);
  assert.match(html, /data-outpaint-position="end"/);
  assert.match(css, /\.edit-outpaint-body-inner/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.edit-outpaint-body-inner/);
  assert.match(app, /function editOutpaintGeometry\(\)/);
  assert.match(app, /32_000_000/);
  assert.match(app, /It stays at native resolution/);
  assert.match(app, /100% · no added canvas/);
  assert.match(app, /function renderEditOutpaint\(\)/);
  assert.match(app, /const OUTPAINT_EDIT_ENGINES = new Set\(EDIT_ENGINES\)/);
  assert.match(app, /Generate Outpaint/);
});

test('outpaint state persists and is restored from completed gallery items', () => {
  assert.match(app, /editOutpaint: state\.editOutpaint/);
  assert.match(app, /editOutpaintPosition: state\.editOutpaintPosition/);
  assert.match(app, /editOutpaintOffsetX: state\.editOutpaintOffsetX/);
  assert.match(app, /editOutpaintOffsetY: state\.editOutpaintOffsetY/);
  assert.match(app, /editOutpaintScale: state\.editOutpaintScale/);
  assert.match(app, /state\.editOutpaint = f\.editOutpaint === true/);
  assert.match(app, /state\.editOutpaint = OUTPAINT_EDIT_ENGINES\.has\(state\.editEngine\) && !!it\.editOutpaint/);
  assert.match(app, /it\.editOutpaint\?\.position/);
  assert.match(app, /it\.editOutpaint\?\.offsetX/);
  assert.match(server, /editOutpaint: job\.params\.mode === 'edit' && job\.params\.editOutpaint/);
  assert.match(server, /editOutpaintFinalWidth/);
  assert.match(server, /editOutpaintRefine/);
});

test('outpaint requests use one source, custom output dimensions, and incompatible edit tools are disabled', () => {
  assert.match(app, /const promptOptional = [^;]*\|\| outpaintActive/);
  assert.match(app, /editOutpaint: outpaintActive \|\| undefined/);
  assert.match(app, /editOutpaintPosition: outpaintActive \? state\.editOutpaintPosition/);
  assert.match(app, /editOutpaintOffsetX: outpaintActive \? editOutpaintGeometry\(\)\.offsetX/);
  assert.match(app, /source\.addEventListener\('pointerdown'/);
  assert.match(app, /source\.setPointerCapture\(event\.pointerId\)/);
  assert.match(app, /editOutpaintScale: outpaintActive \? state\.editOutpaintScale/);
  assert.match(app, /!\$\('#editComposite'\)\.hidden && \$\('#editComposite'\)\.getAttribute\('aria-pressed'\) === 'true'/);
  assert.match(app, /preserve\.hidden = active \|\| \(!outpaint && \(kreaEdit \|\| kreaRef\)\)/);
  assert.match(app, /state\.editSequential = false;\s*\$\('#editComposite'\)\.setAttribute\('aria-pressed', 'true'\)/);
  assert.match(app, /Native preserve/);
  assert.match(css, /\.edit-outpaint-source img \{[^}]*object-fit: contain/);
  assert.match(css, /\.ref-slot img \{[^}]*object-fit: contain/);
  assert.match(server, /p\.editOutpaintRefine = plan\.needsRefine && refine\.ready && !!p\.postUpscale/);
  assert.match(app, /state\.refs\.slice\(0, state\.editEngine === 'krea2' \|\| outpaintActive \? 1 : 3\)/);
  assert.match(app, /const supported = inEdit && engineSupported && !editOutpaintActive\(\)/);
  assert.match(app, /state\.view === 'edit' && !editOutpaintActive\(\) && EDIT_MASK_ENGINES/);
  assert.match(server, /p\.editEngine === 'krea2ref' && p\.editOutpaint/);
  assert.match(server, /p\.editOutpaint && p\.editEngine === 'qwen'/);
  assert.match(server, /p\.editOutpaint && \(p\.editEngine === 'klein4' \|\| p\.editEngine === 'klein9'\)/);
  assert.match(server, /p\.editOutpaint && p\.editEngine === 'krea2'/);
  assert.match(server, /Outpaint and sequential edits must be generated separately/);
  assert.match(server, /Outpaint and localized edit areas must be generated separately/);
  assert.match(server, /if \(p\.editAspectOverride && !p\.editOutpaint\) p\.composite = false/);
});

test('sampling appears only when Edit offers a sampling choice', () => {
  assert.doesNotMatch(html, /id="editSamplingSummary"/);
  assert.match(app, /const samplingChoice = state\.view === 'edit' && state\.editEngine === 'qwen'/);
  assert.match(app, /row\.hidden = !samplingChoice && !preserveChoice/);
  assert.match(css, /\.edit-sampling-row\.preserve-only \{ justify-content: flex-end/);
  assert.match(html, /class="preserve-text">Preserve<\/span>/);
});

test('Edit follows model, expandable inputs, edit area, prompt, Resolution, and sampling order', () => {
  const refPanel = html.slice(html.indexOf('id="refPanel"'), html.indexOf('id="vidModelPanel"'));
  const positions = ['id="refRow"', 'id="kreaMaskTools"', 'id="editPromptSlot"', 'id="editAspectControl"', 'id="editSamplingRow"']
    .map((token) => refPanel.indexOf(token));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(html, /id="addEditReference"/);
  assert.match(html, /<span>Resolution<\/span>/);
  assert.match(app, /editRefSlots: 1/);
  assert.match(app, /state\.editRefSlots \+= 1/);
  assert.match(app, /state\.refs\.splice\(idx, 1\)/);
  assert.match(app, /state\.editRefSlots = Math\.max\(1, state\.editRefSlots - 1\)/);
  assert.doesNotMatch(app, /editRefSlots: state\.editRefSlots/);
  assert.match(css, /\.ref-row\[data-slots="1"\] \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.ref-row\[data-slots="1"\] \.ref-slot \{ aspect-ratio: 16 \/ 9; \}/);
  assert.match(css, /\.edit-prompt-slot #promptPanel/);
});
