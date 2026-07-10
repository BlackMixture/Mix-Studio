'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEditAngle,
  supportsEditAngles,
  qwenEditAnglePrompt,
  kleinEditAnglePrompt,
  editAnglePrompt,
} = require('../lib/edit-angle');

const angle = { view: 'back-right', elevation: 'elevated', distance: 'medium shot' };

test('camera angle support is limited to Qwen and both Klein editors', () => {
  assert.equal(supportsEditAngles('qwen'), true);
  assert.equal(supportsEditAngles('klein4'), true);
  assert.equal(supportsEditAngles('klein9'), true);
  assert.equal(supportsEditAngles('krea2'), false);
});

test('camera angles normalize only documented view, elevation, and distance values', () => {
  assert.deepEqual(normalizeEditAngle(angle), angle);
  assert.deepEqual(normalizeEditAngle({ elevation: 'low-angle' }), { elevation: 'low-angle' });
  assert.deepEqual(normalizeEditAngle({ distance: 'close-up' }), { distance: 'close-up' });
  assert.deepEqual(normalizeEditAngle({ view: 'front' }), { view: 'front' });
  assert.equal(normalizeEditAngle({}), null);
  assert.equal(normalizeEditAngle({ view: 'overhead', elevation: 'elevated', distance: 'medium shot' }), null);
  assert.equal(normalizeEditAngle({ view: 'front', elevation: 'extreme', distance: 'medium shot' }), null);
});

test('Qwen keeps its trigger syntax while Klein receives a natural-language reconstruction prompt', () => {
  assert.equal(qwenEditAnglePrompt(angle), '<sks> back-right quarter view elevated shot medium shot');
  const klein = kleinEditAnglePrompt(angle);
  assert.match(klein, /Re-render the same subject from a back-right quarter view/);
  assert.match(klein, /Preserve the subject identity/);
  assert.match(klein, /do not make a collage, split screen, turntable, or duplicate subject/);
  assert.doesNotMatch(klein, /<sks>/);
  assert.match(editAnglePrompt('klein4', angle, 'make the jacket blue'), /make the jacket blue$/);
  assert.match(editAnglePrompt('qwen', angle), /^<sks>/);
  assert.equal(qwenEditAnglePrompt({ elevation: 'high-angle' }), '<sks> high-angle shot');
  assert.match(kleinEditAnglePrompt({ distance: 'wide shot' }), /with wide shot framing/);
});
