const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('desktop shell exposes subtle accessible panel separators', () => {
  for (const [id, controls, label] of [
    ['desktopLeftResizer', 'view-create', 'inputs'],
    ['desktopRightResizer', 'view-gallery', 'library'],
  ]) {
    const tag = html.match(new RegExp(`<div[^>]*id="${id}"[^>]*>`))?.[0] || '';
    assert.match(tag, /role="separator"/);
    assert.match(tag, /tabindex="0"/);
    assert.match(tag, /aria-orientation="vertical"/);
    assert.match(tag, new RegExp(`aria-controls="${controls}"`));
    assert.match(tag, new RegExp(`aria-label="Resize ${label} panel"`, 'i'));
  }
  assert.match(css, /\.desktop-panel-resizer \{ display: none; \}/);
  assert.match(css, /@media \(min-width: 1180px\)[\s\S]*\.desktop-panel-resizer \{[\s\S]*display: block;[\s\S]*cursor: col-resize/);
  assert.match(css, /body\.desktop-library-expanded \.desktop-panel-resizer,[\s\S]*body\.desktop-focused-result \.desktop-panel-resizer \{ display: none; \}/);
});

test('desktop panel widths drive navigation, workspace, focused expansion, and Director together', () => {
  assert.match(css, /--studio-left-width: 360px/);
  assert.match(css, /--studio-right-width: 360px/);
  assert.match(css, /--studio-center-width: calc\(100% - var\(--studio-left-width\) - var\(--studio-right-width\) - 2px\)/);
  assert.match(css, /\.tabs-wrap \{[\s\S]*grid-template-columns: var\(--studio-left-width\) var\(--studio-center-width\) var\(--studio-right-width\)/);
  assert.match(css, /\.studio-workspace \{[\s\S]*grid-template-columns: var\(--studio-left-width\) var\(--studio-center-width\) var\(--studio-right-width\)/);
  assert.match(css, /\.desktop-panel-resizer-left \{ left: var\(--studio-left-width\)/);
  assert.match(css, /\.desktop-panel-resizer-right \{ right: var\(--studio-right-width\)/);
  assert.match(css, /body\.desktop-focused-result \.studio-workspace \{[\s\S]*grid-template-columns: 0px calc\(100% - var\(--studio-right-width\) - 2px\) var\(--studio-right-width\)/);
  assert.match(css, /body\.director-open\.desktop-focused-result \.studio-workspace \{[\s\S]*grid-template-columns: 0px minmax\(420px,1fr\) var\(--studio-right-width\)/);
  assert.match(css, /\.desktop-stage \.generate-dock \{[\s\S]*position: relative;[\s\S]*width: auto/);
  assert.match(css, /body\.director-open \.director-summary \{[\s\S]*width: var\(--studio-left-width\)/);
});

test('panel resizing supports pointer capture, keyboard control, reset, persistence, and safe clamping', () => {
  assert.match(app, /profileStorageKey\('ks-desktop-layout'\)/);
  assert.match(app, /centerMin: 440/);
  assert.match(app, /function normalizedDesktopPanelLayout\(activeSide = null\)/);
  assert.match(app, /workspaceWidth - limits\.centerMin/);
  assert.match(app, /function beginDesktopPanelResize\(event, side, resizer\)/);
  assert.match(app, /resizer\.setPointerCapture\(event\.pointerId\)/);
  assert.match(app, /pointercancel/);
  assert.match(app, /lostpointercapture/);
  assert.match(app, /event\.key === 'ArrowLeft'/);
  assert.match(app, /event\.key === 'ArrowRight'/);
  assert.match(app, /event\.key === 'Home'/);
  assert.match(app, /event\.key === 'End'/);
  assert.match(app, /resizer\.addEventListener\('dblclick'/);
  assert.match(app, /localStorage\.setItem\(desktopLayoutStorageKey\(\)/);
  assert.match(app, /new ResizeObserver\(\(\) => applyDesktopPanelLayout\(\)\)/);
  assert.match(app, /restoreDesktopPanelLayout\(\);[\s\S]{0,80}wireDesktopPanelResizers\(\);/);
});
