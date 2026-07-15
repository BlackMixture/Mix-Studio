'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { applyProfileOutputPrefix, profileOutputFolder } = require('../lib/output-prefix');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('profileOutputFolder creates a readable safe folder with a stable profile id suffix', () => {
  assert.equal(profileOutputFolder({ id: 'abcdef123456', name: 'Nathan / Studio' }), 'Nathan_Studio_abcdef12');
  assert.equal(profileOutputFolder({ id: '12345678', name: '..\\' }), 'Profile_12345678');
});

test('applyProfileOutputPrefix separates every ComfyUI save node by profile', () => {
  const graph = {
    image: { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'KreaStudio/gen' } },
    video: { class_type: 'SaveVideo', inputs: { video: ['create', 0], filename_prefix: 'KreaStudio/video' } },
    preview: { class_type: 'PreviewImage', inputs: { images: ['decode', 0] } },
  };
  applyProfileOutputPrefix(graph, { id: 'abcdef123456', name: 'Nathan' });
  assert.equal(graph.image.inputs.filename_prefix, 'MixStudio/Nathan_abcdef12/gen');
  assert.equal(graph.video.inputs.filename_prefix, 'MixStudio/Nathan_abcdef12/video');
  assert.equal(graph.preview.inputs.filename_prefix, undefined);
});

test('applyProfileOutputPrefix is idempotent when a queued graph is rebuilt', () => {
  const graph = { save: { class_type: 'SaveImage', inputs: { filename_prefix: 'KreaStudio/edit' } } };
  const profile = { id: 'abcdef123456', name: 'Nathan' };
  applyProfileOutputPrefix(graph, profile);
  applyProfileOutputPrefix(graph, profile);
  assert.equal(graph.save.inputs.filename_prefix, 'MixStudio/Nathan_abcdef12/edit');
});

test('every server queue submission carries its profile id into centralized output routing', () => {
  assert.match(server, /if \(options\.profileId\)[\s\S]{0,240}applyProfileOutputPrefix\(graph, outputProfile\)/);
  const calls = [...server.matchAll(/queuePrompt\(([^\n]+)\)/g)]
    .map((match) => match[0])
    .filter((call) => !call.startsWith('queuePrompt(graph, options'));
  assert.ok(calls.length >= 15);
  calls.forEach((call) => assert.match(call, /profileId/, call));
});
