'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('gallery videos expose a focused Director extension action but composites do not', () => {
  assert.match(app, /if \(!vinfo\.composite\) videoUseItems\.push\(\{ label: 'Extend video', detail: 'Continue from its last frame'/);
  assert.match(app, /action: \(\) => openDirectorExtension\(it, selVideo\)/);
  assert.match(app, /function openDirectorExtension\(item, video\)[\s\S]*video\.info\?\.composite/);
  assert.match(app, /project\.extensionSource = \{[\s\S]*itemId: item\.id,[\s\S]*videoId: video\.id/);
  assert.match(app, /openDirectorMode\(project\)/);
});

test('Director identifies, summarizes, persists, and can remove its continuation source', () => {
  for (const id of ['directorExtensionSource', 'directorExtensionSourceName', 'directorExtensionSourceMeta', 'directorExtensionSourceRemove', 'directorContinueAudio']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(css, /\.director-extension-source\s*\{/);
  assert.match(css, /#directorExtensionSourceRemove\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/);
  assert.match(app, /extensionSource,/);
  assert.match(app, /Generate Extension/);
  assert.match(app, /s new · .*s total/);
  assert.match(app, /directorExtensionSourceRemove'\)\.addEventListener\('click'/);
  assert.match(app, /state\.directorProject\.extensionSource = null/);
  assert.match(app, /project\.extensionSource\.continueAudio = \$\('#directorContinueAudio'\)\.checked/);
});

test('Director extension generation resolves the source through the signed-in profile and creates one joined gallery version', () => {
  assert.match(server, /galleryView\(db, isPrivateUnlocked\(req\)\)\.items[\s\S]*filter\(\(item\) => item\.profileId === req\.profile\.id\)/);
  assert.match(server, /visibleItems\.find\(\(item\) => item\.id === project\.extensionSource\.itemId\)/);
  assert.match(server, /itemId: extensionItem \? extensionItem\.id : null/);
  assert.match(server, /parentVideoId: extensionVideo \? extensionVideo\.id : undefined/);
  assert.match(server, /sourcePath\.startsWith\(videosRoot\)/);
  assert.match(server, /detectAudioStream\(sourceBuffer, extensionVideo\.file\) === true/);
  assert.match(server, /resolveFfmpegExecutable\(RUNTIME\)/);
  assert.match(server, /joinVideoExtension\(Object\.assign\(\{\}, job\.extensionJoin, \{ tailBuffer: buf \}\)\)/);
  assert.match(server, /it\.id === job\.itemId && it\.profileId === job\.profileId/);
  assert.match(server, /workflow: extension \? 'extend' : 'director'/);
  assert.match(server, /processed === 'extend'\) return 'Video extension \(LTX 2\.3\)'/);
});
