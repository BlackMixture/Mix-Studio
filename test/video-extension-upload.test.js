'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('Director generation resolves uploaded extension videos from durable inputs and probes authoritative metadata', () => {
  assert.match(server, /if \(project\.extensionSource\.inputName\)/);
  assert.match(server, /resolveDurableUploadedVideo\(INPUTS, project\.extensionSource\.inputName\)/);
  assert.match(server, /probeVideoFile\(durable\.file, videoExtensionFfmpeg\)/);
  assert.match(server, /detectAudioStreamFile\(sourcePath, durable\.name\) === true/);
  assert.match(server, /videoName = await uploadFileToComfy\(durableSource\.file, durableSource\.name\)/);
  assert.match(server, /sourceInfo = probe/);
});

test('uploaded extensions remain parentless so completion creates a profile-scoped gallery item', () => {
  assert.match(server, /itemId: extensionItem \? extensionItem\.id : null/);
  assert.match(server, /createItem: !extensionItem/);
  assert.match(server, /makePoster: !extension \|\| !extensionItem/);
  assert.match(server, /parentVideoId: extensionVideo \? extensionVideo\.id : undefined/);
  assert.match(server, /profileId: job\.profileId/);
});
