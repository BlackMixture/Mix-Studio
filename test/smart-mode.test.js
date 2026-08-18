'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SMART_PLAN_SCHEMA,
  buildH3Prompt,
  compileSmartSteps,
  normalizeSmartPlan,
  smartPlanHash,
  smartPlanningPrompt,
} = require('../lib/smart-mode');

function lionPlan() {
  return {
    schemaVersion: 1,
    title: 'Lion across worlds',
    summary: 'A continuous cinematic journey with one recognizable lion.',
    output: { kind: 'video', durationSeconds: 120, aspectRatio: '16:9', quality: 'balanced' },
    subject: { needsReference: true, description: 'A regal male lion with a dark amber mane and a small scar above the left eye' },
    visualStyle: 'Cinematic magical realism, warm highlights, deep blue shadows',
    imagePrompt: 'A regal male lion with a dark amber mane and a small scar above the left eye, full body, centered',
    videoPrompt: 'The lion crosses a changing world while remaining calm, curious, and visually consistent',
    scenes: [
      { title: 'Arrival', durationSeconds: 30, description: 'The lion enters an empty city at dawn', camera: 'Low tracking shot', audio: 'Wind and distant traffic' },
      { title: 'Storm', durationSeconds: 30, description: 'Rain sweeps across a neon avenue', camera: 'Side profile dolly', audio: 'Rain and measured footsteps' },
      { title: 'Desert', durationSeconds: 30, description: 'The avenue becomes a red desert', camera: 'Wide crane shot', audio: 'Dry wind' },
      { title: 'Home', durationSeconds: 30, description: 'The lion reaches a sunlit grassland', camera: 'Slow push in', audio: 'Birds and grass' },
    ],
    reviewReference: false,
  };
}

test('Smart plan schema is strict and suitable for structured provider output', () => {
  assert.equal(SMART_PLAN_SCHEMA.additionalProperties, false);
  assert.deepEqual(SMART_PLAN_SCHEMA.required, [
    'schemaVersion', 'title', 'summary', 'output', 'subject', 'visualStyle',
    'imagePrompt', 'videoPrompt', 'scenes', 'reviewReference',
  ]);
  assert.equal(SMART_PLAN_SCHEMA.properties.scenes.maxItems, 12);
});

test('Smart planner normalizes a 120-second character production and preserves exact running time', () => {
  const plan = normalizeSmartPlan(lionPlan(), 'Make a two-minute lion film');
  assert.equal(plan.output.durationSeconds, 120);
  assert.equal(plan.subject.needsReference, true);
  assert.equal(plan.scenes.length, 4);
  assert.equal(plan.scenes[0].startSeconds, 0);
  assert.equal(plan.scenes.at(-1).endSeconds, 120);
  assert.equal(plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0), 120);
});

test('Smart compiles identity video into a Krea reference followed by H3 long context', () => {
  const plan = normalizeSmartPlan(lionPlan());
  const steps = compileSmartSteps(plan, { imageId: 'reference-step', videoId: 'video-step' });
  assert.equal(steps.length, 2);
  assert.equal(steps[0].kind, 'reference');
  assert.equal(steps[0].request.route, '/api/generate');
  assert.match(steps[0].request.body.prompt, /one subject only/i);
  assert.match(steps[0].request.body.prompt, /no contact sheet/i);
  assert.deepEqual(steps[1].dependsOn, ['reference-step']);
  assert.equal(steps[1].request.route, '/api/animate');
  assert.equal(steps[1].request.body.engine, 'h3');
  assert.equal(steps[1].request.body.h3Mode, 'reference');
  assert.equal(steps[1].request.body.h3LongContext, true);
  assert.equal(steps[1].request.body.seconds, 120);
  assert.equal(steps[1].request.body.h3ResolutionSize, 1);
});

test('H3 prompt refers to the canonical image and includes timed scene transitions', () => {
  const prompt = buildH3Prompt(normalizeSmartPlan(lionPlan()));
  assert.match(prompt, /<Picture 1>/);
  assert.match(prompt, /0\.0-30\.0s/);
  assert.match(prompt, /<scenetrans>/);
  assert.match(prompt, /90\.0-120\.0s/);
});

test('image-only Smart requests stay a single Krea generation', () => {
  const raw = lionPlan();
  raw.output = { kind: 'image', durationSeconds: 120, aspectRatio: '3:4', quality: 'quality' };
  raw.subject.needsReference = true;
  const plan = normalizeSmartPlan(raw);
  const steps = compileSmartSteps(plan, { imageId: 'image-step' });
  assert.equal(plan.output.durationSeconds, 0);
  assert.equal(plan.subject.needsReference, false);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].kind, 'image');
  assert.deepEqual([steps[0].request.body.width, steps[0].request.body.height], [912, 1216]);
});

test('plan hash is stable across normalized equivalents and changes with production intent', () => {
  const source = lionPlan();
  assert.equal(smartPlanHash(source), smartPlanHash(normalizeSmartPlan(source)));
  const changed = lionPlan();
  changed.output.aspectRatio = '9:16';
  assert.notEqual(smartPlanHash(source), smartPlanHash(changed));
});

test('planner instruction explicitly routes persistent subjects through one canonical reference', () => {
  const prompt = smartPlanningPrompt('A lion crosses several scenes');
  assert.match(prompt.instruction, /persistent named character/i);
  assert.match(prompt.instruction, /one clean canonical identity image/i);
  assert.equal(prompt.userInput, 'A lion crosses several scenes');
});
