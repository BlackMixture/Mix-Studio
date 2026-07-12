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
