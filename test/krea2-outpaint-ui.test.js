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

test('Krea 2 Edit exposes a compact outpaint mode with a live placement preview', () => {
  assert.match(html, /id="editOutpaintControl"/);
  assert.match(html, /id="editOutpaintToggle"[^>]*role="switch"/);
  assert.match(html, /id="editOutpaintPreview"/);
  assert.match(html, /data-outpaint-position="start"/);
  assert.match(html, /data-outpaint-position="center"/);
  assert.match(html, /data-outpaint-position="end"/);
  assert.match(css, /\.edit-outpaint-body-inner/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.edit-outpaint-body-inner/);
  assert.match(app, /function editOutpaintGeometry\(\)/);
  assert.match(app, /function renderEditOutpaint\(\)/);
  assert.match(app, /Generate Outpaint/);
});

test('outpaint state persists and is restored from completed gallery items', () => {
  assert.match(app, /editOutpaint: state\.editOutpaint/);
  assert.match(app, /editOutpaintPosition: state\.editOutpaintPosition/);
  assert.match(app, /state\.editOutpaint = f\.editOutpaint === true/);
  assert.match(app, /state\.editOutpaint = state\.editEngine === 'krea2ref' && !!it\.editOutpaint/);
  assert.match(app, /it\.editOutpaint\?\.position/);
  assert.match(server, /editOutpaint: job\.params\.mode === 'edit' && job\.params\.editOutpaint/);
});

test('outpaint requests use one source, custom output dimensions, and incompatible edit tools are disabled', () => {
  assert.match(app, /const promptOptional = [^;]*\|\| outpaintActive/);
  assert.match(app, /editOutpaint: outpaintActive \|\| undefined/);
  assert.match(app, /editOutpaintPosition: outpaintActive \? state\.editOutpaintPosition/);
  assert.match(app, /state\.refs\.slice\(0, state\.editEngine === 'krea2' \|\| outpaintActive \? 1 : 3\)/);
  assert.match(app, /const supported = inEdit && engineSupported && !editOutpaintActive\(\)/);
  assert.match(app, /state\.view === 'edit' && !editOutpaintActive\(\) && EDIT_MASK_ENGINES/);
  assert.match(server, /p\.editEngine === 'krea2ref' && p\.editOutpaint/);
  assert.match(server, /Outpaint and sequential edits must be generated separately/);
  assert.match(server, /Outpaint and localized edit areas must be generated separately/);
});

