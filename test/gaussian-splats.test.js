'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { optionsFor, orbitOptions, validatePly, createSplatService } = require('../lib/gaussian-splats');

function ply() {
  const properties = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  const header = Buffer.from('ply\nformat binary_little_endian 1.0\nelement vertex 1\n' + properties.map((name) => `property float ${name}\n`).join('') + 'end_header\n');
  const body = Buffer.alloc(properties.length * 4); body.writeFloatLE(2, 0); body.writeFloatLE(3, 4); body.writeFloatLE(4, 8);
  return Buffer.concat([header, body]);
}
test('splat PLY validation rejects meshes, truncation and excessive allocation', () => {
  assert.deepEqual(validatePly(ply()), { count: 1, center: [2, 3, 4], radius: .1 });
  assert.throws(() => validatePly(ply().subarray(0, -1)), /incomplete/);
  assert.throws(() => validatePly(Buffer.from(ply().toString('latin1').replace('element vertex 1', 'element vertex 99999999'), 'latin1')), /3 million/);
  assert.throws(() => validatePly(Buffer.from('ply\nformat ascii 1.0\nend_header\n')), /binary/);
  assert.throws(() => validatePly(Buffer.from(ply().toString('latin1').replace('opacity', 'normals'), 'latin1')), /not Gaussian/);
});
test('training presets bound resource usage and ignore arbitrary arguments', () => {
  assert.equal(optionsFor({ quality: 'quality', steps: 9999999 }).steps, 15000);
  assert.equal(optionsFor({ quality: '--bad' }).steps, 5000);
  assert.ok(optionsFor().maxSplats < optionsFor({ quality: 'quality' }).maxSplats);
});
test('splat records and file routes enforce profile and locked source access', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-splats-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const responses = [];
  const service = createSplatService({ dataDir: root, resolveFfmpeg: async () => '', assertIdle: async () => {}, getSource: () => null, visibleSourceIds: (req) => new Set(req.visible || []), readBody: async () => ply(), readJsonBody: async () => ({}), json: (res, status, body) => responses.push({ status, body }), serveFile: (res, file) => responses.push({ status: 200, file }), isOwner: () => false });
  const res = { setHeader() {} };
  const request = (route, profile, method = 'GET', visible = []) => service.handle({ method, profile: { id: profile }, headers: {}, visible }, res, new URL(route, 'http://localhost'));
  await request('/api/splats/import', 'alice', 'POST');
  const imported = responses.at(-1).body;
  assert.equal(responses.at(-1).status, 202);
  assert.equal(imported.profileId, undefined);
  assert.equal(imported.canRefine, false);
  await request(`/api/splats/${imported.id}/refine`, 'bob', 'POST');
  assert.equal(responses.at(-1).status, 404);
  await request(`/api/splats/${imported.id}/refine`, 'alice', 'POST');
  assert.equal(responses.at(-1).status, 409);
  await request(`/api/splats/${imported.id}/file`, 'bob');
  assert.equal(responses.at(-1).status, 404);
  await request(`/api/splats/${imported.id}/file`, 'alice');
  assert.equal(responses.at(-1).status, 200);
  const metadata = path.join(root, 'splats', imported.id, 'record.json');
  const record = JSON.parse(fs.readFileSync(metadata)); record.sourceItemId = 'private-source'; fs.writeFileSync(metadata, JSON.stringify(record));
  await request(`/api/splats/${imported.id}/file`, 'alice');
  assert.equal(responses.at(-1).status, 404);
  await request(`/api/splats/${imported.id}/file`, 'alice', 'GET', ['private-source']);
  assert.equal(responses.at(-1).status, 200);
  await request('/api/splats/install', 'alice', 'POST');
  assert.equal(responses.at(-1).status, 403);
  await request('/api/splats/../../etc/passwd/file', 'alice');
  assert.notEqual(responses.at(-1).file, '/etc/passwd');
});

test('photo orbit anchors both ends and keeps the H3 canvas bounded', async () => {
  const { buildMiniMaxH3Graph } = require('../lib/video-workflows');
  const options = orbitOptions({ imageName: 'owl.png', width: 1200, height: 900, seed: 123, frames: 192 });
  const graph = await buildMiniMaxH3Graph(options, {});
  assert.equal(graph.first_image.inputs.image, 'owl.png');
  assert.equal(graph.last_image.inputs.image, 'owl.png');
  assert.deepEqual(graph.condition.inputs.last_frame, ['last_image', 0]);
  assert.equal(graph.condition.inputs.width, 768);
  assert.equal(graph.condition.inputs.height, 576);
  assert.equal(graph.noise.inputs.noise_seed, 123);
  assert.equal(graph.scheduler.inputs.steps, 20);
  assert.equal(graph.turbo_lora, undefined);
});


test('orbit interpolation doubles frame intervals and preserves real-time playback', async () => {
  const { buildSplatOrbitGraph } = require('../lib/gaussian-splats');
  const { buildMiniMaxH3Graph, h3FramesForSeconds } = require('../lib/video-workflows');
  const frames = h3FramesForSeconds(12);
  const options = orbitOptions({ imageName: 'owl.png', width: 900, height: 1200, seed: 123, frames });
  const graph = await buildSplatOrbitGraph(options, {}, {
    buildMiniMaxH3Graph,
    rifeSmooth: async (graph, source, multiplier) => {
      graph.rife = { class_type: 'RIFE VFI', inputs: { frames: source, multiplier } };
      return ['rife', 0];
    },
  });
  assert.deepEqual(graph.rife.inputs.frames, ['decode', 0]);
  assert.equal(graph.rife.inputs.multiplier, 2);
  assert.deepEqual(graph.video.inputs.images, ['rife', 0]);
  assert.equal(graph.video.inputs.fps, 48);
  assert.deepEqual(graph.video.inputs.audio, ['decode_audio', 0]);
  assert.equal(graph.condition.inputs.length, frames);
  assert.ok(Math.abs(((frames - 1) * 2 + 1) / 48 - frames / 24) < 1 / 24);
  await assert.rejects(buildSplatOrbitGraph(options, {}, { buildMiniMaxH3Graph }), /requires RIFE/);
});


test('further training preserves the starting step and rejects unbounded requests', () => {
  const { refinementOptions } = require('../lib/gaussian-splats');
  const record = { quality: 'preview', trainingSteps: 10000 };
  assert.equal(refinementOptions(record, 5000).start, 10000);
  assert.equal(refinementOptions(record, 5000).steps, 15000);
  assert.deepEqual(record, { quality: 'preview', trainingSteps: 10000 });
  assert.throws(() => refinementOptions(record, 999999), /5,000 or 10,000/);
  assert.throws(() => refinementOptions({ trainingSteps: 45000 }, 10000), /50,000/);
});
