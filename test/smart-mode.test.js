'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SMART_PLAN_SCHEMA,
  buildH3ClipPrompt,
  buildH3Prompt,
  compileSmartSteps,
  normalizeSmartPlan,
  normalizeSmartReferences,
  smartReferenceSpec,
  smartPlanHash,
  smartPlanningPrompt,
} = require('../lib/smart-mode');

function lionPlan() {
  return {
    schemaVersion: 1,
    title: 'Lion across worlds',
    summary: 'A continuous cinematic journey with one recognizable lion.',
    output: { kind: 'video', durationSeconds: 120, aspectRatio: '16:9', quality: 'balanced' },
    subject: {
      needsReference: true,
      referenceType: 'character',
      description: 'A regal male lion with a dark amber mane and a small scar above the left eye',
      referenceStates: [{ id: 'default', label: 'Default', description: 'The lion is healthy with an intact dark amber mane' }],
    },
    visualStyle: 'Cinematic magical realism, warm highlights, deep blue shadows',
    directorialApproach: 'Progress from low heroic wides into intimate close-ups, then release into a final crane shot with motivated hard cuts.',
    imagePrompt: 'A regal male lion with a dark amber mane and a small scar above the left eye, full body, centered',
    videoPrompt: 'The lion crosses a changing world while remaining calm, curious, and visually consistent',
    scenes: [
      { title: 'Arrival', durationSeconds: 30, description: 'The lion enters an empty city at dawn', shot: 'Low wide angle', camera: 'Low tracking shot', transition: 'Open on a hard cut from black', continuity: 'Lion moves screen-left to screen-right', audio: 'Wind and distant traffic', usesSubjectReference: true },
      { title: 'Storm', durationSeconds: 30, description: 'Rain sweeps around the lion on a neon avenue', shot: 'Side-profile medium', camera: 'Side profile dolly', transition: 'Cut on the lion crossing frame', continuity: 'Preserve lion identity and travel direction', audio: 'Rain and measured footsteps', usesSubjectReference: true },
      { title: 'Desert', durationSeconds: 30, description: 'The lion crosses a red desert', shot: 'Extreme wide', camera: 'Wide crane shot', transition: 'Match cut the avenue line to the dune', continuity: 'Preserve lion identity and warm key light', audio: 'Dry wind', usesSubjectReference: true },
      { title: 'Home', durationSeconds: 30, description: 'The lion reaches a sunlit grassland', shot: 'Eye-level close medium', camera: 'Slow push in', transition: 'Cut on the lion lifting its gaze', continuity: 'Preserve lion identity and screen direction', audio: 'Birds and grass', usesSubjectReference: true },
    ],
    reviewReference: false,
  };
}

test('Smart plan schema is strict and suitable for structured provider output', () => {
  assert.equal(SMART_PLAN_SCHEMA.additionalProperties, false);
  assert.deepEqual(SMART_PLAN_SCHEMA.required, [
    'schemaVersion', 'title', 'summary', 'output', 'subject', 'visualStyle',
    'directorialApproach', 'imagePrompt', 'videoPrompt', 'scenes', 'reviewReference',
  ]);
  assert.equal(SMART_PLAN_SCHEMA.properties.scenes.maxItems, 12);
  assert.equal(SMART_PLAN_SCHEMA.properties.scenes.items.properties.durationSeconds.maximum, 10);
  assert.ok(SMART_PLAN_SCHEMA.properties.scenes.items.required.includes('usesSubjectReference'));
  assert.ok(SMART_PLAN_SCHEMA.properties.scenes.items.required.includes('referenceStateId'));
  assert.deepEqual(SMART_PLAN_SCHEMA.properties.subject.properties.referenceType.enum, ['character', 'object', 'place']);
  assert.equal(SMART_PLAN_SCHEMA.properties.subject.properties.referenceStates.maxItems, 6);
});

test('Smart planner expands a 120-second treatment into bounded clips and preserves exact running time', () => {
  const plan = normalizeSmartPlan(lionPlan(), 'Make a two-minute lion film');
  assert.equal(plan.output.durationSeconds, 120);
  assert.equal(plan.subject.needsReference, true);
  assert.equal(plan.scenes.length, 12);
  assert.ok(plan.scenes.every((scene) => scene.durationSeconds <= 10));
  assert.equal(plan.scenes[0].startSeconds, 0);
  assert.equal(plan.scenes.at(-1).endSeconds, 120);
  assert.equal(plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0), 120);
  assert.ok(new Set(plan.scenes.map((scene) => scene.shot)).size > 1);
});

test('Smart compiles identity video into a Krea reference followed by individual H3 clips', () => {
  const plan = normalizeSmartPlan(lionPlan());
  const videoIds = Array.from({ length: 12 }, (_, index) => `video-${index + 1}`);
  const steps = compileSmartSteps(plan, { imageId: 'reference-step', videoIds });
  assert.equal(steps.length, 13);
  assert.equal(steps[0].kind, 'reference');
  assert.equal(steps[0].request.route, '/api/generate');
  assert.match(steps[0].request.body.prompt, /three-panel character reference sheet/i);
  assert.match(steps[0].request.body.prompt, /front-facing full-body/i);
  assert.match(steps[0].request.body.prompt, /back-facing full-body/i);
  assert.match(steps[0].request.body.prompt, /close-up front-facing face/i);
  assert.match(steps[0].request.body.prompt, /neutral mid-grey/i);
  assert.deepEqual([steps[0].request.body.width, steps[0].request.body.height], [1344, 768]);
  assert.deepEqual(steps[1].dependsOn, ['reference-step']);
  assert.equal(steps[1].id, 'video-1');
  assert.equal(steps[1].request.route, '/api/animate');
  assert.equal(steps[1].request.body.engine, 'h3');
  assert.equal(steps[1].request.body.h3Mode, 'reference');
  assert.equal(steps[1].request.body.h3LongContext, false);
  assert.equal(steps[1].request.body.seconds, 10);
  assert.equal(steps[1].request.body.h3ResolutionSize, 1);
  assert.match(steps[1].request.body.prompt, /one continuous editorial shot/i);
  assert.match(steps[1].request.body.prompt, /do not perform an internal editorial cut/i);
});

test('attached references are bounded, hashed, and synthesized through Krea 2 Edit', () => {
  const references = normalizeSmartReferences([
    { name: 'lion.png', label: 'Lion identity', w: 1200, h: 900 },
    { name: 'style.jpg', label: 'Lighting style', w: 800, h: 1200 },
    { name: 'ignored.png', label: 'Third image' },
  ]);
  assert.deepEqual(references.map((reference) => reference.name), ['lion.png', 'style.jpg']);
  const steps = compileSmartSteps(lionPlan(), { imageId: 'reference-step', videoId: 'video-step' }, references);
  assert.equal(steps[0].request.body.mode, 'edit');
  assert.equal(steps[0].request.body.editEngine, 'krea2ref');
  assert.deepEqual(steps[0].request.body.refImages, ['lion.png', 'style.jpg']);
  assert.deepEqual(steps[1].dependsOn, ['reference-step']);
  assert.notEqual(smartPlanHash(lionPlan()), smartPlanHash(lionPlan(), references));
});

test('H3 prompt refers to the canonical image and includes timed scene transitions', () => {
  const prompt = buildH3Prompt(normalizeSmartPlan(lionPlan()));
  assert.match(prompt, /<Picture 1>/);
  assert.match(prompt, /0\.0-10\.0 seconds/);
  assert.match(prompt, /<scenetrans>/);
  assert.match(prompt, /110\.0-120\.0 seconds/);
});

test('clips without the recurring subject omit the reference dependency and Picture language', () => {
  const raw = lionPlan();
  raw.output.durationSeconds = 20;
  raw.scenes = [
    { title: 'Empty city', durationSeconds: 10, description: 'An empty avenue at dawn before anyone arrives', shot: 'Wide establishing shot', camera: 'Slow push in', transition: 'Opening image', continuity: 'Warm dawn light and left-to-right screen direction', audio: 'Wind', usesSubjectReference: false },
    { title: 'Lion arrives', durationSeconds: 10, description: 'The lion enters the avenue from frame left', shot: 'Low medium tracking shot', camera: 'Track beside the lion', transition: 'Cut on the first footfall', continuity: 'Same avenue and dawn light', audio: 'Footsteps', usesSubjectReference: true },
  ];
  const plan = normalizeSmartPlan(raw);
  const steps = compileSmartSteps(plan, { imageId: 'reference-step', videoIds: ['empty-step', 'lion-step'] });
  assert.equal(steps.length, 3);
  assert.deepEqual(steps[1].dependsOn, []);
  assert.equal(steps[1].request.body.h3Mode, 'frames');
  assert.doesNotMatch(steps[1].request.body.prompt, /<Picture 1>/);
  assert.match(steps[1].request.body.prompt, /canonical reference target is not present/i);
  assert.deepEqual(steps[2].dependsOn, ['reference-step']);
  assert.equal(steps[2].request.body.h3Mode, 'reference');
  assert.match(steps[2].request.body.prompt, /<Picture 1>/);
  assert.doesNotMatch(buildH3ClipPrompt(plan, plan.scenes[0], 0), /dark amber mane/i);
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

test('image-only Smart requests use attached images as Krea references', () => {
  const raw = lionPlan();
  raw.output = { kind: 'image', durationSeconds: 0, aspectRatio: '1:1', quality: 'balanced' };
  const [step] = compileSmartSteps(raw, { imageId: 'image-step' }, [{ name: 'product.png', label: 'Product' }]);
  assert.equal(step.request.body.mode, 'edit');
  assert.equal(step.request.body.editEngine, 'krea2ref');
  assert.deepEqual(step.request.body.refImages, ['product.png']);
});

test('plan hash is stable across normalized equivalents and changes with production intent', () => {
  const source = lionPlan();
  assert.equal(smartPlanHash(source), smartPlanHash(normalizeSmartPlan(source)));
  const changed = lionPlan();
  changed.output.aspectRatio = '9:16';
  assert.notEqual(smartPlanHash(source), smartPlanHash(changed));
});

test('materially changed states create separate references and route each clip to the correct state', () => {
  const raw = lionPlan();
  raw.output.durationSeconds = 20;
  raw.subject.referenceStates = [
    { id: 'formal', label: 'Formal outfit', description: 'The lion wears a pristine dark blue ceremonial coat' },
    { id: 'damaged', label: 'Damaged outfit', description: 'The same coat is torn and mud-streaked, with a scratch on the lion cheek' },
  ];
  raw.scenes = [
    { title: 'Arrival', durationSeconds: 10, description: 'The lion arrives in the pristine coat', shot: 'Wide', camera: 'Track', transition: 'Open', continuity: 'Pristine coat', audio: 'Wind', usesSubjectReference: true, referenceStateId: 'formal' },
    { title: 'Aftermath', durationSeconds: 10, description: 'The lion emerges with the damaged coat', shot: 'Medium', camera: 'Push in', transition: 'Cut', continuity: 'Damaged coat', audio: 'Rain', usesSubjectReference: true, referenceStateId: 'damaged' },
  ];
  const steps = compileSmartSteps(raw, {
    referenceIds: ['formal-ref', 'damaged-ref'], videoIds: ['formal-clip', 'damaged-clip'],
  });
  assert.equal(steps.length, 4);
  assert.deepEqual(steps.slice(0, 2).map((step) => step.referenceState.id), ['formal', 'damaged']);
  assert.match(steps[0].request.body.prompt, /pristine dark blue ceremonial coat/i);
  assert.match(steps[1].request.body.prompt, /torn and mud-streaked/i);
  assert.deepEqual(steps[2].dependsOn, ['formal-ref']);
  assert.deepEqual(steps[3].dependsOn, ['damaged-ref']);
  assert.match(steps[2].request.body.prompt, /"Formal outfit" state/i);
  assert.match(steps[3].request.body.prompt, /"Damaged outfit" state/i);
});

test('objects use multi-angle sheets while places use one coherent master view', () => {
  const objectPlan = lionPlan();
  objectPlan.subject.referenceType = 'object';
  assert.match(smartReferenceSpec(objectPlan).prompt, /front three-quarter view/i);
  assert.match(smartReferenceSpec(objectPlan).prompt, /rear three-quarter view/i);
  assert.match(smartReferenceSpec(objectPlan).prompt, /side-profile view/i);
  const placePlan = lionPlan();
  placePlan.subject.referenceType = 'place';
  assert.match(smartReferenceSpec(placePlan).prompt, /one coherent wide master environment reference/i);
  assert.match(smartReferenceSpec(placePlan).prompt, /foreground, midground, background/i);
  assert.doesNotMatch(smartReferenceSpec(placePlan).prompt, /three-panel/i);
});

test('planner instruction explicitly routes persistent subjects through one canonical reference', () => {
  const prompt = smartPlanningPrompt('A lion crosses several scenes', { referenceCount: 2 });
  assert.match(prompt.instruction, /persistent named character/i);
  assert.match(prompt.instruction, /front full-body, back full-body, and face close-up panels/i);
  assert.match(prompt.instruction, /materially distinct visual state/i);
  assert.match(prompt.instruction, /wardrobe changes, injuries, dirt, damage/i);
  assert.match(prompt.instruction, /referenceStateId to the exact state depicted/i);
  assert.match(prompt.instruction, /attached 2 image references/i);
  assert.match(prompt.instruction, /identity, visual style, wardrobe, product appearance, or composition/i);
  assert.match(prompt.instruction, /independently generated editorial clip/i);
  assert.match(prompt.instruction, /usesSubjectReference true only/i);
  assert.match(prompt.instruction, /vary shot size and angle/i);
  assert.equal(prompt.userInput, 'A lion crosses several scenes');
});
