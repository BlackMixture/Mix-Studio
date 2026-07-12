'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('gallery save menu offers a documentation image builder', () => {
  assert.match(app, /label: 'Documentation image'/);
  assert.match(app, /action: \(\) => openDocumentationBuilder\(it\)/);
  assert.match(html, /id="documentationSheet"/);
  assert.match(html, /id="documentationCanvas"/);
});

test('documentation builder supports overlay and contact-card exports', () => {
  assert.match(html, /data-doc-layout="contact"/);
  assert.match(html, /data-doc-layout="overlay"/);
  assert.match(html, /data-doc-theme="dark"/);
  assert.match(html, /data-doc-theme="light"/);
  assert.match(app, /function renderDocumentationContactCard/);
  assert.match(app, /function renderDocumentationOverlay/);
  assert.match(app, /canvas\.toBlob/);
});

test('documentation metadata omits unavailable values and exposes saved generation details', () => {
  assert.match(app, /function hasDocumentationValue\(value\)/);
  assert.match(app, /if \(hasDocumentationValue\(value\)\) metadata\.push/);
  for (const key of ['model', 'prompt', 'size', 'seed', 'steps', 'cfg', 'loras']) {
    assert.match(app, new RegExp(`add\\('${key}'`));
  }
  assert.match(app, /documentationBuilderState\.metadata\.forEach/);
  assert.match(app, /documentationBuilderState\.selected/);
});

test('prompt control represents the prompt used for generation', () => {
  assert.match(app, /const prompt = documentationAnglePrompt\(item\) \|\| item\.refinedPrompt \|\| item\.prompt/);
  assert.match(app, /add\('prompt', 'Prompt', prompt\)/);
  assert.match(app, /add\('originalPrompt', 'Original prompt', item\.prompt\)/);
});

test('camera variation documentation uses its angle-specific graph prompt', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /anglePrompt: job\.params\.anglePrompt \|\| undefined/);
  assert.match(app, /function documentationAnglePrompt\(item\)/);
  assert.match(app, /item && item\.anglePrompt/);
  assert.match(app, /front-right quarter view/);
  assert.match(app, /item\.editEngine === 'qwen'/);
});

test('region documentation uses the annotated region map as its figure', () => {
  assert.match(html, /id="documentationRegionGroup" hidden/);
  assert.match(html, /data-doc-region-map="false">Original/);
  assert.match(html, /data-doc-region-map="true"[^>]*>Region map/);
  assert.match(app, /function setDocumentationFigure\(useRegionMap\)/);
  assert.match(app, /await buildRegionOverlay\(item\)/);
  assert.match(app, /await loadDocumentationOriginal\(item\)/);
  assert.match(app, /image\.naturalWidth \|\| image\.width \|\| 1024/);
  assert.match(app, /image\.naturalHeight \|\| image\.height \|\| 1024/);
});

test('export uses a restrained research-record treatment without branding', () => {
  assert.doesNotMatch(app, /GENERATION DOCUMENTATION|GENERATION RECORD|MIX STUDIO/);
  assert.match(app, /setDocumentationMonoFont/);
  assert.doesNotMatch(app, /accent\.addColorStop|createLinearGradient\(0, imageHeight/);
  assert.match(css, /\.documentation-preview \{[\s\S]*background: #111216/);
});

test('documentation builder has responsive preview and adjustment controls', () => {
  assert.match(html, /id="documentationTextScale"/);
  assert.match(html, /id="documentationShade"/);
  assert.match(html, /id="documentationFields"/);
  assert.match(css, /\.documentation-builder/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.documentation-preview/);
});

test('focused videos can export source, generation details, and result in one persistent view', () => {
  assert.match(app, /label: 'Documentation video'/);
  assert.match(app, /action: \(\) => saveDocumentationVideo\(it, selVideo\)/);
  assert.match(html, /id="documentationVideoSheet"/);
  assert.match(html, /id="documentationVideoCanvas"/);
  assert.match(app, /function documentationVideoDetails\(item, video\)/);
  assert.match(html, /Start frame, generation details, and the complete result stay together in one view/);
  assert.match(app, /const boardRatio = portrait \? ratio \/ 1\.32 : ratio \+ \.52/);
  assert.match(app, /function documentationVideoLayout\(width, height, mediaRatio = width \/ height\)/);
  assert.match(app, /function drawDocumentationVideoFrame\(ctx, canvas, startFrame, item, video, resultMedia\)/);
  assert.match(app, /drawDocumentationVideoMedia\(ctx, resultMedia, layout\.result, 'Final Result', '#ea4335', \{ quiet: true \}\)/);
  assert.match(app, /drawDocumentationVideoMedia\(ctx, startFrame, layout\.source, 'Start Frame'/);
  assert.match(app, /function drawDocumentationVideoMedia[\s\S]*setDocumentationFont\(ctx, quiet \? 650 : 700, fontSize\)/);
  assert.match(app, /quiet[\s\S]*Math\.min\(12, Math\.round\(scaledFontSize \* \.78\)\)/);
  assert.match(app, /quiet \? 'rgba\(0,0,0,\.62\)'/);
  assert.doesNotMatch(app, /'FINAL RESULT'|'START FRAME'/);
  assert.doesNotMatch(app, /const introMs =/);
  assert.match(app, /canvas\.captureStream\(30\)/);
  assert.match(app, /new MediaRecorder\(stream/);
  assert.match(app, /mirrorExportFile\(blob, filename\)/);
  assert.match(css, /\.documentation-video-preview/);
});
