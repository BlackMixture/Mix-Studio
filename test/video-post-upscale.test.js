'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('generated videos can be post-upscaled with SeedVR2 or RTX', () => {
  assert.match(server, /body\.engine === 'seedvr2' \? 'seedvr2' : 'rtx'/);
  assert.match(server, /seedVr2UpscaleNodes\(\['src', 0\]/);
  assert.match(server, /rtxVideoSuperResolutionNode\(\['src', 0\]/);
  assert.match(server, /videoProcessInfo\(baseInfo, \{[\s\S]*kind: 'upscale', scale, engine: upscaleEngine/);
  assert.match(app, /label: 'SeedVR2 upscale'/);
  assert.match(app, /label: 'RTX upscale'/);
  assert.match(app, /engine: kind === 'upscale' \? normalizedUpscaleEngine : undefined/);
});
