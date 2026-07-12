const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('desktop library cards load their media and saved settings into the workspace', () => {
  assert.match(app, /function selectDesktopLibraryItem\(item, media = 'image'\)/);
  assert.match(app, /reuseVideo\(item, video, \{ desktopToken: token, silent: true \}\)/);
  assert.match(app, /reuseItem\(item, false, \{ desktopToken: token, silent: true \}\)/);
  assert.match(app, /desktopWorkspaceActive\(\) && state\.view !== 'gallery'/);
  assert.match(app, /syncDesktopGallerySelection\(\)/);
  assert.match(css, /\.card\.desktop-active:not\(\.selected\)/);
});

test('desktop stage exposes an explicit focused-view information action', () => {
  assert.match(html, /id="desktopStageInfo"[^>]*aria-label="View generation details"/);
  assert.match(app, /\$\('#desktopStageInfo'\)\.addEventListener\('click'/);
  assert.match(app, /openLightbox\(info\.dataset\.itemId, info\.dataset\.media \|\| 'image'\)/);
});

test('desktop navigation and focused viewer align to the three-column workspace', () => {
  assert.match(css, /\.primary-tabs \{ grid-column: 2; grid-row: 1; \}/);
  assert.match(css, /\.create-tabs \{ grid-column: 1; grid-row: 1;/);
  assert.match(css, /#lightbox\.show \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(320px, 370px\)/);
  assert.match(css, /#lightbox \.lightbox-img-wrap \{[\s\S]*grid-column: 1;/);
  assert.match(css, /#lightbox \.lightbox-meta \{[\s\S]*grid-column: 2;/);
  assert.match(css, /#lightbox #lbActions \{[\s\S]*grid-column: 2;/);
});

test('desktop gallery items drag onto compatible generation inputs', () => {
  assert.match(app, /card\.draggable = desktopWorkspaceActive\(\)/);
  assert.match(app, /function beginDesktopGalleryDrag\(item, media, card, event\)/);
  assert.match(app, /function applyDesktopGalleryDrop\(target, drag\)/);
  assert.match(app, /#createImageGuideAdd/);
  assert.match(app, /\.ref-slot/);
  assert.match(app, /#vidAttachBtn/);
  assert.match(app, /#vidDriveBtn/);
  assert.match(app, /sendVideoAsDrive\(item, video, \{ preserveEngine: true \}\)/);
  assert.match(css, /\.gallery-drop-ready/);
  assert.match(css, /\.gallery-drop-active/);
});

test('desktop empty stage avoids redundant layout instructions', () => {
  assert.doesNotMatch(html, /Build on the left\. Recent work stays within reach on the right\./);
});

test('selected desktop results expose compact actions and can be unloaded safely', () => {
  assert.match(html, /id="desktopStageClear"[^>]*Unload result and clear generation settings/);
  assert.match(html, /id="desktopStageActions"/);
  assert.match(html, /id="desktopStageLike"/);
  assert.match(html, /id="desktopStageSave"/);
  assert.match(app, /function clearDesktopStageSelection\(\)/);
  assert.match(app, /function resetActiveGenerationForm\(\)/);
  assert.match(app, /state\.desktopStageDismissed = true/);
  assert.doesNotMatch(app, /Image settings loaded/);
  assert.match(css, /\.desktop-generate-row \{ display: flex;/);
  assert.match(css, /\.desktop-stage-actions button/);
});

test('desktop focused information rail uses a true black surface', () => {
  assert.match(css, /#lightbox\.show \{[\s\S]*background: #000;/);
  assert.match(css, /#lightbox #lbActions \{[\s\S]*background: #000;/);
});
