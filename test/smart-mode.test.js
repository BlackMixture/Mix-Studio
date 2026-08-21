'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H3PromptGuide = require('../public/h3-prompt-guide');

const {
  SMART_LOCAL_PLAN_SCHEMA,
  SMART_PLAN_SCHEMA,
  buildH3ClipPrompt,
  buildH3Prompt,
  compileSmartSteps,
  normalizeSmartPlan,
  normalizeSmartReferences,
  reconcileSmartPlanReferences,
  smartReferenceSpec,
  smartReferenceRerollPrompt,
  smartPlanAudit,
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
      referenceTarget: 'lion',
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
  assert.equal(SMART_PLAN_SCHEMA.properties.scenes.items.properties.durationSeconds.minimum, 5);
  assert.equal(SMART_PLAN_SCHEMA.properties.scenes.items.properties.durationSeconds.maximum, 10);
  assert.ok(SMART_PLAN_SCHEMA.properties.scenes.items.required.includes('usesSubjectReference'));
  assert.ok(SMART_PLAN_SCHEMA.properties.scenes.items.required.includes('referenceStateIds'));
  assert.ok(SMART_PLAN_SCHEMA.properties.scenes.items.required.includes('spatialComposition'));
  assert.ok(SMART_PLAN_SCHEMA.properties.scenes.items.required.includes('dialogue'));
  assert.ok(SMART_PLAN_SCHEMA.properties.scenes.items.required.includes('timelineBeats'));
  assert.ok(SMART_PLAN_SCHEMA.properties.scenes.items.required.includes('music'));
  assert.equal(SMART_PLAN_SCHEMA.properties.scenes.items.properties.dialogue.maxItems, 6);
  assert.ok(SMART_PLAN_SCHEMA.properties.scenes.items.properties.dialogue.items.required.includes('timeSeconds'));
  assert.equal(SMART_PLAN_SCHEMA.properties.scenes.items.properties.timelineBeats.maxItems, 6);
  assert.deepEqual(SMART_PLAN_SCHEMA.properties.scenes.items.properties.timelineBeats.items.properties.kind.enum, ['action', 'camera', 'cut']);
  assert.deepEqual(SMART_PLAN_SCHEMA.properties.subject.properties.referenceType.enum, ['character', 'object', 'place']);
  assert.ok(SMART_PLAN_SCHEMA.properties.subject.required.includes('referenceTarget'));
  assert.equal(SMART_PLAN_SCHEMA.properties.subject.properties.referenceStates.maxItems, 6);
  assert.ok(SMART_PLAN_SCHEMA.properties.subject.properties.referenceStates.items.required.includes('referenceTarget'));
  assert.ok(SMART_PLAN_SCHEMA.properties.subject.properties.referenceStates.items.required.includes('referenceType'));
});

test('reference rerolls preserve the base specification and apply bounded review feedback', () => {
  const prompt = smartReferenceRerollPrompt('Three-panel character sheet.', 'Keep the face; change the jacket to dark red.');
  assert.match(prompt, /^Three-panel character sheet\./);
  assert.match(prompt, /distinctly new alternative reference image/i);
  assert.match(prompt, /change the jacket to dark red/i);
  assert.ok(smartReferenceRerollPrompt('Base.', 'x'.repeat(2000)).length < 15000);
});

test('local Smart planning establishes story before compact reference metadata', () => {
  const prompt = smartPlanningPrompt('A lion loses its way in a flooded city and must find its pride before nightfall', {
    references: [{ name: 'lion.png', label: 'Lion identity', w: 1200, h: 900 }],
  });
  const propertyOrder = Object.keys(SMART_LOCAL_PLAN_SCHEMA.properties);
  assert.ok(propertyOrder.indexOf('videoPrompt') < propertyOrder.indexOf('subject'));
  assert.ok(propertyOrder.indexOf('subject') < propertyOrder.indexOf('scenes'));
  assert.match(prompt.localInstruction, /PRIORITY 1 — STORY AND ACTION/);
  assert.match(prompt.localInstruction, /setup, a goal or pressure, escalating actions, a meaningful turn, and a payoff or resolution/);
  assert.match(prompt.localInstruction, /majority of scene detail must describe action, obstacle, reaction, environment, cause-and-effect, and progression/i);
  assert.match(prompt.localInstruction, /REFERENCE CONTINUITY IS SUPPORTING METADATA, NOT THE STORY/);
  assert.match(prompt.localInstruction, /subject\.description must be a compact continuity-roster summary of at most 60 words/);
  assert.match(prompt.localInstruction, /description must be a complete identity\/state specification of at most 45 words/);
  assert.match(prompt.localInstruction, /Multiple recurring characters require separate entries/);
  assert.match(prompt.localInstruction, /Do not repeat the full subject description in scene descriptions/);
});

test('video reference metadata is bounded and never labels the clip as a reference generation', () => {
  const raw = lionPlan();
  raw.output.durationSeconds = 10;
  raw.scenes = [raw.scenes[0]];
  raw.subject.description = Array.from({ length: 90 }, (_, index) => `identity${index}`).join(' ');
  raw.subject.referenceStates = [{
    id: 'default', label: 'Default', description: raw.subject.description,
  }];
  raw.imagePrompt = Array.from({ length: 130 }, (_, index) => `appearance${index}`).join(' ');
  const audit = smartPlanAudit(raw);
  assert.match(audit.issues.join(' '), /60-word continuity budget/);
  assert.match(audit.issues.join(' '), /100-word video-reference budget/);
  assert.match(audit.issues.join(' '), /45-word continuity budget/);

  const plan = normalizeSmartPlan(raw);
  assert.equal(plan.subject.description.split(/\s+/).length, 60);
  assert.equal(plan.subject.referenceStates[0].description.split(/\s+/).length, 45);
  assert.equal(plan.imagePrompt.split(/\s+/).length, 100);
  const clipPrompt = buildH3ClipPrompt(plan, plan.scenes[0]);
  assert.doesNotMatch(clipPrompt, /\[reference generation\]/i);
  assert.match(clipPrompt, /summary:\nThe lion enters an empty city at dawn/);
  assert.match(clipPrompt, /retention_analysis:\n<Subject 1>: fully_preserved while visible/);
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
  assert.equal(steps[1].request.body.attentionBackend, 'standard');
  assert.equal(steps[1].request.body.sageAttention, false);
  assert.equal(steps[1].request.body.seconds, 10);
  assert.equal(steps[1].request.body.h3ResolutionSize, 1);
  assert.match(steps[1].request.body.prompt, /^subject_definitions:/);
  assert.match(steps[1].request.body.prompt, /summary:\nThe lion enters an empty city at dawn/);
  assert.doesNotMatch(steps[1].request.body.prompt, /\[reference generation\]/i);
  assert.match(steps[1].request.body.prompt, /retention_analysis:/);
  assert.match(steps[1].request.body.prompt, /detailed_description:\n[\s\S]*\[Shot 1\]/);
  assert.match(steps[1].request.body.prompt, /overall_soundscape:/);
  assert.match(steps[1].request.body.prompt, /non_diegetic_music:\nN\/A$/);
  assert.doesNotMatch(steps[1].request.body.prompt, /clip \d+ of|finished sequence|editorial transition|directorial intent/i);
});

test('Smart video clips inherit an explicitly selected SLA backend', () => {
  const steps = compileSmartSteps(lionPlan(), {
    imageId: 'reference-step', videoId: 'video-step', attentionBackend: 'sla',
  });
  const videos = steps.filter((step) => step.kind === 'video');
  assert.ok(videos.length > 0);
  assert.ok(videos.every((step) => step.request.body.attentionBackend === 'sla'));
  assert.ok(videos.every((step) => step.request.body.sageAttention === false));
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

test('attached references repair an incorrect local-model scene flag only when the target is renderable', () => {
  const raw = lionPlan();
  raw.output.durationSeconds = 10;
  raw.subject.needsReference = false;
  raw.scenes = [
    {
      title: 'Empty avenue', durationSeconds: 5,
      description: 'An empty avenue at dawn before anyone arrives', shot: 'Wide establishing shot',
      camera: 'Slow push in', transition: 'Opening image', spatialComposition: 'The vacant avenue recedes into haze',
      continuity: 'Warm dawn light', audio: 'Wind', music: '', dialogue: [], timelineBeats: [],
      usesSubjectReference: false, referenceStateId: '',
    },
    {
      title: 'Arrival', durationSeconds: 5,
      description: 'The lion enters the avenue from frame left', shot: 'Low tracking shot',
      camera: 'Track beside the lion', transition: 'Hard cut', spatialComposition: 'The lion occupies the foreground',
      continuity: 'The dark amber mane stays visible', audio: 'Footsteps', music: '', dialogue: [], timelineBeats: [],
      usesSubjectReference: false, referenceStateId: '',
    },
  ];
  const references = [{ name: 'lion.png', label: 'Lion identity' }];
  const plan = reconcileSmartPlanReferences(raw, references);
  assert.equal(plan.subject.needsReference, true);
  assert.deepEqual(plan.scenes.map((scene) => scene.usesSubjectReference), [false, true]);
  assert.deepEqual(plan.scenes.map((scene) => scene.referenceUseSource), ['planner', 'detected']);
  assert.equal(reconcileSmartPlanReferences(plan, references).scenes[1].referenceUseSource, 'detected');
  assert.equal(smartPlanHash(raw, references), smartPlanHash(plan, references));
  const steps = compileSmartSteps(raw, { imageId: 'reference-step', videoIds: ['empty-step', 'lion-step'] }, references);
  assert.equal(steps[0].kind, 'reference');
  assert.equal(steps[1].request.body.h3Mode, 'frames');
  assert.equal(steps[2].request.body.h3Mode, 'reference');
  assert.deepEqual(steps[2].dependsOn, ['reference-step']);
});

test('manual reference routing remains authoritative during plan review', () => {
  const raw = lionPlan();
  raw.output.durationSeconds = 10;
  raw.scenes = [Object.assign({}, raw.scenes[0], {
    durationSeconds: 10,
    usesSubjectReference: false,
    referenceUseSource: 'manual',
    referenceStateId: '',
  })];
  const plan = reconcileSmartPlanReferences(raw, [{ name: 'lion.png', label: 'Lion identity' }]);
  assert.equal(plan.scenes[0].usesSubjectReference, false);
  assert.equal(plan.scenes[0].referenceUseSource, 'manual');
});

test('combined H3 preview keeps references and scene boundaries without leaking film timing', () => {
  const prompt = buildH3Prompt(normalizeSmartPlan(lionPlan()));
  assert.match(prompt, /<Picture 1>/);
  assert.match(prompt, /<scenetrans>/);
  assert.doesNotMatch(prompt, /clip \d+ of|finished sequence|positioned at/i);
});

test('clips without the recurring subject omit the reference dependency and Picture language', () => {
  const raw = lionPlan();
  raw.output.durationSeconds = 10;
  raw.scenes = [
    { title: 'Empty city', durationSeconds: 5, description: 'An empty avenue at dawn before anyone arrives', shot: 'Wide establishing shot', camera: 'Slow push in', transition: 'Opening image', continuity: 'Warm dawn light and left-to-right screen direction', audio: 'Wind', usesSubjectReference: false },
    { title: 'Lion arrives', durationSeconds: 5, description: 'The lion enters the avenue from frame left', shot: 'Low medium tracking shot', camera: 'Track beside the lion', transition: 'Cut on the first footfall', continuity: 'Same avenue and dawn light', audio: 'Footsteps', usesSubjectReference: true },
  ];
  const plan = normalizeSmartPlan(raw);
  const steps = compileSmartSteps(plan, { imageId: 'reference-step', videoIds: ['empty-step', 'lion-step'] });
  assert.equal(steps.length, 3);
  assert.deepEqual(steps[1].dependsOn, []);
  assert.equal(steps[1].request.body.h3Mode, 'frames');
  assert.doesNotMatch(steps[1].request.body.prompt, /<Picture 1>/);
  assert.match(steps[1].request.body.prompt, /^integrated_multimodal_description:\n\[Shot 1\]/);
  assert.match(steps[1].request.body.prompt, /overall_soundscape:\nWind/);
  assert.doesNotMatch(steps[1].request.body.prompt, /canonical|recurring|not present|do not introduce|clip \d+ of|finished sequence/i);
  assert.doesNotMatch(steps[1].request.body.prompt, /Open on a hard cut|Progress from low heroic wides|lion crosses a changing world/i);
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
  raw.output.durationSeconds = 10;
  raw.subject.referenceStates = [
    { id: 'formal', label: 'Formal outfit', description: 'The lion wears a pristine dark blue ceremonial coat' },
    { id: 'damaged', label: 'Damaged outfit', description: 'The same coat is torn and mud-streaked, with a scratch on the lion cheek' },
  ];
  raw.scenes = [
    { title: 'Arrival', durationSeconds: 5, description: 'The lion arrives in the pristine coat', shot: 'Wide', camera: 'Track', transition: 'Open', continuity: 'Pristine coat', audio: 'Wind', usesSubjectReference: true, referenceStateId: 'formal' },
    { title: 'Aftermath', durationSeconds: 5, description: 'The lion emerges with the damaged coat', shot: 'Medium', camera: 'Push in', transition: 'Cut', continuity: 'Damaged coat', audio: 'Rain', usesSubjectReference: true, referenceStateId: 'damaged' },
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
  assert.match(steps[2].request.body.prompt, /pristine dark blue ceremonial coat/i);
  assert.doesNotMatch(steps[2].request.body.prompt, /torn and mud-streaked/i);
  assert.match(steps[3].request.body.prompt, /torn and mud-streaked/i);
  assert.doesNotMatch(steps[3].request.body.prompt, /pristine dark blue ceremonial coat/i);
});

test('multiple recurring characters get separate sheets and share ordered H3 references when they interact', () => {
  const raw = lionPlan();
  raw.output.durationSeconds = 15;
  raw.subject.referenceTarget = 'Maya';
  raw.subject.description = 'Maya and Theo are recurring human characters with distinct identities';
  raw.subject.referenceStates = [
    { id: 'maya', label: 'Maya default', referenceTarget: 'Maya', referenceType: 'character', description: 'Maya has a sharp black bob, amber jacket, dark jeans, and silver boots' },
    { id: 'theo', label: 'Theo default', referenceTarget: 'Theo', referenceType: 'character', description: 'Theo has close-cropped curls, a cobalt coat, charcoal trousers, and red glasses' },
  ];
  raw.scenes = [
    { title: 'Search', durationSeconds: 7, description: 'Maya searches the rain-soaked platform', shot: 'Wide tracking shot', camera: 'Track beside Maya', transition: 'Open', spatialComposition: 'Maya crosses the foreground', continuity: 'Amber jacket and wet platform', audio: 'Rain', music: '', dialogue: [], timelineBeats: [], usesSubjectReference: true, referenceStateIds: ['maya'] },
    { title: 'Meeting', durationSeconds: 8, description: 'Maya finds Theo beneath the station clock and they exchange a relieved look', shot: 'Two-shot moving into reactions', camera: 'Slow arc around Maya and Theo', transition: 'Cut on Maya looking up', spatialComposition: 'Maya screen-left and Theo screen-right', continuity: 'Preserve both identities, eye-lines, and wardrobe', audio: 'Rain and train brakes', music: '', dialogue: [], timelineBeats: [], usesSubjectReference: true, referenceStateIds: ['maya', 'theo'] },
  ];
  const steps = compileSmartSteps(raw, {
    referenceIds: ['maya-ref', 'theo-ref'], videoIds: ['search-clip', 'meeting-clip'],
  });
  assert.deepEqual(steps.slice(0, 2).map((step) => step.referenceState.referenceTarget), ['Maya', 'Theo']);
  assert.deepEqual(steps[2].dependsOn, ['maya-ref']);
  assert.deepEqual(steps[3].dependsOn, ['maya-ref', 'theo-ref']);
  assert.match(steps[3].request.body.prompt, /<Subject 1> is Maya[\s\S]*<Picture 1>/);
  assert.match(steps[3].request.body.prompt, /<Subject 2> is Theo[\s\S]*<Picture 2>/);
  assert.match(steps[3].request.body.prompt, /\[Shot 2\] At 00:/);
});

test('Smart pacing varies 5–10 second clips by scene weight and creates real internal H3 cuts', () => {
  const raw = lionPlan();
  raw.output.durationSeconds = 30;
  raw.subject.needsReference = false;
  raw.scenes = [
    { title: 'Insert', durationSeconds: 5, description: 'A key turns once in a brass lock', shot: 'Detail insert', camera: 'Static macro view', transition: 'Open', spatialComposition: 'Lock fills the frame', continuity: 'Warm side light', audio: 'Metal click', music: '', dialogue: [], timelineBeats: [], usesSubjectReference: false, referenceStateIds: [] },
    { title: 'Reaction', durationSeconds: 6, description: 'A courier hears the lock and looks over one shoulder', shot: 'Reaction close-up', camera: 'Short push in', transition: 'Hard cut', spatialComposition: 'Courier foreground, doorway behind', continuity: 'Warm side light', audio: 'Breath and room tone', music: '', dialogue: [], timelineBeats: [], usesSubjectReference: false, referenceStateIds: [] },
    { title: 'Crossing', durationSeconds: 9, description: 'The courier sprints across the warehouse while security shutters descend', shot: 'Low wide tracking shot', camera: 'Fast lateral track', transition: 'Cut on movement', spatialComposition: 'Courier crosses left to right through layered machinery', continuity: 'Stable direction and lighting', audio: 'Footsteps and shutters', music: '', dialogue: [], timelineBeats: [], usesSubjectReference: false, referenceStateIds: [] },
    { title: 'Confrontation', durationSeconds: 10, description: 'The courier reaches the exit and confronts the waiting guard before choosing another route', shot: 'Medium two-shot', camera: 'Arc into opposing close-ups', transition: 'Match cut', spatialComposition: 'Courier left, guard right, exit centered', continuity: 'Stable eye-lines and wardrobe', audio: 'Alarm and footsteps', music: '', dialogue: [], timelineBeats: [], usesSubjectReference: false, referenceStateIds: [] },
  ];
  const plan = normalizeSmartPlan(raw);
  const durations = plan.scenes.map((scene) => scene.durationSeconds);
  assert.equal(durations.reduce((sum, seconds) => sum + seconds, 0), 30);
  assert.ok(durations.every((seconds) => seconds >= 5 && seconds <= 10));
  assert.ok(new Set(durations).size > 1);
  assert.ok(plan.scenes.filter((scene) => scene.durationSeconds >= 6)
    .every((scene) => scene.timelineBeats.some((beat) => beat.kind === 'cut')));
  const multiShot = plan.scenes.find((scene) => scene.durationSeconds >= 6);
  assert.match(buildH3ClipPrompt(plan, multiShot), /\[Shot 2\] At 00:/);
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

test('standalone H3 clips use concise spatial, dialogue, soundscape, and music controls', () => {
  const raw = lionPlan();
  raw.output.durationSeconds = 10;
  raw.scenes = [{
    title: 'Platform warning', durationSeconds: 10,
    description: 'Maya stands beneath a flickering platform sign while rain blows through the station',
    shot: 'Low medium two-shot', camera: 'Slow push in', transition: 'Cut on the warning light',
    spatialComposition: 'Maya holds the screen-left foreground; Tomas stands in the screen-right midground; the tracks recede into deep background',
    continuity: 'Maya keeps her clean blue coat and remains screen-left under the cold overhead key light',
    audio: 'Heavy rain, electrical buzzing, and water striking the platform roof',
    music: 'A sparse low cello pulse at a slow tempo',
    dialogue: [
      { speaker: 'Maya', line: 'Stay behind me.', language: 'English', delivery: 'whispers', isReferenceSubject: true },
      { speaker: 'Tomas', line: 'The lights are moving.', language: 'English', delivery: 'says quietly', isReferenceSubject: false },
      { speaker: 'Maya', line: 'Run.', language: 'English', delivery: 'shouts', isReferenceSubject: true },
    ],
    usesSubjectReference: true, referenceStateId: 'default',
  }];
  const plan = normalizeSmartPlan(raw);
  const prompt = buildH3ClipPrompt(plan, plan.scenes[0]);
  assert.match(prompt, /screen-left foreground[\s\S]*screen-right midground[\s\S]*deep background/i);
  assert.match(prompt, /<Subject 1> \(S1\) whispers: <d>\[English\] Stay behind me\.<\/d>/);
  assert.match(prompt, /Tomas \(S2\) says quietly: <d>\[English\] The lights are moving\.<\/d>/);
  assert.match(prompt, /<Subject 1> \(S1\) shouts: <d>\[English\] Run\.<\/d>/);
  assert.match(prompt, /overall_soundscape:\nHeavy rain, electrical buzzing/);
  assert.match(prompt, /non_diegetic_music:\nA sparse low cello pulse/);
  assert.doesNotMatch(prompt, /Cut on the warning light|clip \d+|finished sequence|directorial intent/i);
  assert.equal(H3PromptGuide.auditStructure(prompt, {
    mode: 'reference', seconds: 10,
    expectedReferenceTokens: ['<Picture 1>'],
    allowedReferenceTokens: ['<Picture 1>'],
  }).ready, true);
});

test('one H3 generation can use clip-local timed actions, camera moves, dialogue, and cuts', () => {
  const raw = lionPlan();
  raw.output.durationSeconds = 10;
  raw.visualStyle = '1990s anime OVA animation';
  raw.scenes = [{
    title: 'Tunnel decision', durationSeconds: 10,
    description: 'Maya watches a dark railway tunnel from an empty platform',
    shot: 'Wide profile view', camera: 'A restrained static frame', transition: 'Editor chooses the next clip later',
    spatialComposition: 'Maya stands screen-left while the tunnel mouth fills the screen-right background',
    continuity: 'Maya wears an intact blue coat under cold fluorescent light throughout the generation',
    audio: 'Rain on the roof, fluorescent hum, and distant rail vibration', music: '',
    timelineBeats: [
      { timeSeconds: 7, kind: 'camera', description: 'slowly arcs clockwise behind Maya' },
      { timeSeconds: 2, kind: 'cut', description: 'cut to a front close-up of Maya listening' },
      { timeSeconds: 4.5, kind: 'action', description: 'Maya turns toward the tunnel as its light flickers' },
      { timeSeconds: 10, kind: 'cut', description: 'an invalid end-frame view' },
    ],
    dialogue: [{
      speaker: 'Maya', line: 'Not yet.', language: 'English', delivery: 'whispers',
      isReferenceSubject: true, timeSeconds: 3,
    }],
    usesSubjectReference: true, referenceStateId: 'default',
  }];
  const plan = normalizeSmartPlan(raw);
  assert.deepEqual(plan.scenes[0].timelineBeats.map((beat) => [beat.timeSeconds, beat.kind]), [
    [2, 'cut'], [4.5, 'action'], [7, 'camera'],
  ]);
  const prompt = buildH3ClipPrompt(plan, plan.scenes[0]);
  assert.match(prompt, /\[Shot 2\] At 00:02\.000, the camera cuts to a front close-up of Maya listening\./);
  assert.match(prompt, /At 00:03\.000, <Subject 1> \(S1\) whispers: <d>\[English\] Not yet\.<\/d>/);
  assert.match(prompt, /At 00:04\.500, Maya turns toward the tunnel as its light flickers\./);
  assert.match(prompt, /At 00:07\.000, the camera slowly arcs clockwise behind Maya\./);
  assert.match(prompt, /Style: 1990s anime OVA animation\.\n\noverall_soundscape:/);
  assert.match(prompt, /non_diegetic_music:\nN\/A$/);
  assert.doesNotMatch(prompt, /00:10\.000|Editor chooses the next clip later/);
  assert.equal(H3PromptGuide.auditStructure(prompt, {
    mode: 'reference', seconds: 10,
    expectedReferenceTokens: ['<Picture 1>'],
    allowedReferenceTokens: ['<Picture 1>'],
  }).ready, true);
});

test('Smart never invents dialogue and formats supplied voiceover without lip movement', () => {
  const silent = lionPlan();
  silent.output.durationSeconds = 10;
  silent.scenes = [Object.assign({}, silent.scenes[0], { durationSeconds: 10, dialogue: [] })];
  const silentPlan = normalizeSmartPlan(silent);
  assert.doesNotMatch(buildH3ClipPrompt(silentPlan, silentPlan.scenes[0]), /<d>|\(S1\)/);

  const voiced = lionPlan();
  voiced.output.durationSeconds = 10;
  voiced.scenes = [Object.assign({}, voiced.scenes[0], {
    durationSeconds: 10,
    dialogue: [{
      speaker: 'Lion', line: 'The city remembers.', language: 'English',
      delivery: 'voiceover', isReferenceSubject: true,
    }],
  })];
  const voicedPlan = normalizeSmartPlan(voiced);
  const prompt = buildH3ClipPrompt(voicedPlan, voicedPlan.scenes[0]);
  assert.match(prompt, /<Subject 1> \(S1\) says in an off-screen voiceover: <d>\[English\] The city remembers\.<\/d>/);
  assert.match(prompt, /lips remain completely closed/i);
});

test('planner instruction explicitly builds a complete recurring-subject reference roster', () => {
  const prompt = smartPlanningPrompt('A lion crosses several scenes', { references: [
    { name: 'lion.png', label: 'Lion identity', w: 1200, h: 900 },
    { name: 'style.png', label: '1990s anime look', w: 800, h: 1200 },
  ] });
  assert.match(prompt.instruction, /persistent named character/i);
  assert.match(prompt.instruction, /front full-body, back full-body, and face close-up panels/i);
  assert.match(prompt.instruction, /materially changed state/i);
  assert.match(prompt.instruction, /story with two recurring characters must create at least two reference units/i);
  assert.match(prompt.instruction, /referenceStateIds to every exact reference-state id/i);
  assert.match(prompt.instruction, /attached 2 image references/i);
  assert.match(prompt.instruction, /Reference 1 is labelled "Lion identity"/);
  assert.match(prompt.instruction, /Reference 2 is labelled "1990s anime look"/);
  assert.match(prompt.instruction, /Reference 1 is the left panel and Reference 2 is the right panel/);
  assert.match(prompt.instruction, /subject\.referenceTarget/);
  assert.match(prompt.instruction, /repeat that identifier/i);
  assert.match(prompt.instruction, /identity, visual style, wardrobe, product appearance, or composition/i);
  assert.match(prompt.instruction, /independently generated editorial clip/i);
  assert.match(prompt.instruction, /H3 receives no information about any other clip/i);
  assert.match(prompt.instruction, /Never mention a clip number/);
  assert.match(prompt.instruction, /transition as editor-only metadata/i);
  assert.match(prompt.instruction, /Use spatialComposition/);
  assert.match(prompt.instruction, /Dialogue must contain only words explicitly supplied/);
  assert.match(prompt.instruction, /Use audio only for ambience/);
  assert.match(prompt.instruction, /non_diegetic_music: N\/A/);
  assert.match(prompt.instruction, /Use timelineBeats/);
  assert.match(prompt.instruction, /kind action/);
  assert.match(prompt.instruction, /kind camera/);
  assert.match(prompt.instruction, /kind cut/);
  assert.match(prompt.instruction, /Style: visualStyle tag/);
  assert.match(prompt.instruction, /Favor compact prompts/);
  assert.match(prompt.instruction, /usesSubjectReference true exactly/i);
  assert.match(prompt.instruction, /vary shot size and angle/i);
  assert.match(prompt.userInput, /^CREATOR BRIEF/);
  assert.match(prompt.userInput, /<creator_brief>\nA lion crosses several scenes\n<\/creator_brief>/);
  assert.match(prompt.userInput, /binding instruction/i);
  assert.match(prompt.userInput, /do not merely summarize/i);
});

test('raw Smart plan audit detects partial local plans before normalization hides the gaps', () => {
  const partial = smartPlanAudit(lionPlan());
  assert.equal(partial.complete, false);
  assert.equal(partial.expectedClipCount, 12);
  assert.match(partial.issues.join(' '), /only 4 of at least 12 required clips/i);
  assert.match(partial.issues.join(' '), /durationSeconds must be between 5 and 10/i);

  const completePlan = normalizeSmartPlan(lionPlan());
  completePlan.scenes = completePlan.scenes.map((scene, index) => Object.assign({}, scene, {
    description: `${scene.description}. Distinct production beat ${index + 1}`,
  }));
  assert.deepEqual(smartPlanAudit(completePlan), {
    complete: true, issues: [], expectedClipCount: 12, sceneCount: 12,
  });
});
