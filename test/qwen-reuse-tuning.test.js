'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is defined`);
  const bodyStart = app.indexOf(') {', start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < app.length; index += 1) {
    if (app[index] === '{') depth += 1;
    else if (app[index] === '}') depth -= 1;
    if (depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

// Runs the real setView / captureGenerationTuning / restoreGenerationTuning against a Create
// view that last ran Krea 2 Turbo (8 steps, CFG 1) and now shows Qwen Image 2.1 (40, 2.5).
// Anything else they call is a no-op.
function createViewHarness() {
  const noop = new Proxy(function () {}, {
    get: (_, key) => (key === Symbol.toPrimitive ? () => '' : noop),
    apply: () => noop,
    set: () => true,
  });
  const controls = Object.fromEntries(['stepsInput', 'cfgInput', 'batchInput', 'seedInput', 'negativePromptInput']
    .map((id) => ['#' + id, { value: '' }]));
  const state = {
    view: 'create', createMode: 'image', imageEngine: 'qwen21', qwen21Steps: 40, qwen21Cfg: 2.5,
    regions: [{ id: 'r1' }], prompts: {}, directorOpen: false,
    generationTuning: { create: { steps: 8, cfg: 1, batch: 1, seed: '', negativePrompt: '' } },
  };
  const scope = {
    state, Object, Number, String, Math,
    $: (key) => controls[key] || noop,
    usingQwen21: () => state.view === 'create' && state.createMode === 'image' && state.imageEngine === 'qwen21',
    generationTuningMode: (view = state.view) => (['create', 'edit', 'video'].includes(view) ? view : null),
    normalizeGenerationTuning: (_, value) => ({ ...value, steps: Number(value.steps), cfg: Number(value.cfg) }),
    smartModeEnabled: () => false,
    experimentalFeaturesEnabled: () => false,
    renderQwen21Sampling() {
      if (!scope.usingQwen21()) return;
      controls['#stepsInput'].value = state.qwen21Steps;
      controls['#cfgInput'].value = state.qwen21Cfg;
    },
    updateVideoPanels: () => scope.renderQwen21Sampling(),
  };
  const sandbox = new Proxy(scope, {
    has: () => true,
    get: (target, key) => (key in target ? target[key] : (key === Symbol.unscopables ? undefined : noop)),
  });
  const run = vm.runInContext(`with (sandbox) {
    ${functionSource('captureGenerationTuning')}
    ${functionSource('restoreGenerationTuning')}
    ${functionSource('setView')}
    ({ setView, captureGenerationTuning, restoreGenerationTuning });
  }`, vm.createContext({ sandbox }));
  scope.renderQwen21Sampling();
  return { run, controls, state };
}

test('moving from Qwen 2.1 on Image to the Region tab brings back the Krea 2 steps and CFG', () => {
  const { run, controls, state } = createViewHarness();
  assert.equal(controls['#stepsInput'].value, 40);
  run.setView('create', { createMode: 'region' });
  assert.equal(controls['#stepsInput'].value, 8);
  assert.equal(controls['#cfgInput'].value, 1);
  run.captureGenerationTuning();                                  // what saveForm does next
  assert.deepEqual([state.generationTuning.create.steps, state.generationTuning.create.cfg], [8, 1]);
  run.setView('create', { createMode: 'image' });                 // and back to Qwen 2.1
  assert.equal(controls['#stepsInput'].value, 40);
  assert.equal(controls['#cfgInput'].value, 2.5);
});

test('saving while Qwen 2.1 is shown keeps its CFG and leaves the Krea 2 values alone', () => {
  const { run, controls, state } = createViewHarness();
  controls['#cfgInput'].value = 3;                                // the user nudged Qwen's CFG
  run.setView('create', { createMode: 'image' });                 // a same-tab call, e.g. reuse
  assert.equal(state.qwen21Cfg, 3);
  assert.deepEqual([state.generationTuning.create.steps, state.generationTuning.create.cfg], [8, 1]);
});

test('a caller that already saved can skip the save in setView', () => {
  const { run, controls, state } = createViewHarness();
  controls['#cfgInput'].value = 1;                                // a reused Krea item's value
  run.setView('create', { createMode: 'image', skipCapture: true });
  assert.equal(state.qwen21Cfg, 2.5);
});

test('reusing a Qwen result keeps Qwen steps and CFG out of the shared values', () => {
  const reusedSampling = vm.runInNewContext(`(${functionSource('reusedSampling')})`);
  const kreaTurbo = { steps: 8, cfg: 1 };
  assert.deepEqual({ ...reusedSampling({ steps: 40, cfg: 2.5 }, kreaTurbo, true) }, { steps: 8, cfg: 1 });
  assert.deepEqual({ ...reusedSampling({ steps: 12, cfg: 1.5 }, kreaTurbo, false) }, { steps: 12, cfg: 1.5 });
  assert.deepEqual({ ...reusedSampling({}, kreaTurbo, false) }, { steps: 8, cfg: 1 });   // an older item
  const reuse = functionSource('reuseItem');
  const save = reuse.indexOf('captureGenerationTuning();');
  assert.ok(save !== -1 && save < reuse.indexOf("$('#stepsInput').value") && save < reuse.indexOf('state.imageEngine ='),
    'reuse saves the current settings before it changes any control');
  assert.match(reuse, /reusedSampling\(it, previousTuning, restoredQwenSampling\)/);
  assert.match(reuse, /const shown = restoredQwenSampling \? it : sampling;/);
  assert.equal((reuse.match(/skipCapture: true/g) || []).length, 2);
});

test('leaving Qwen 2.1 in Edit brings back the Edit steps and CFG', () => {
  const start = app.indexOf("wireEngineRow('editEngineRow'");
  const handler = app.slice(start, app.indexOf('\n});', start));
  assert.match(handler, /const wasQwen21 = state\.editEngine === 'qwen21';\s*switchEditEngine\(engine\);/);
  assert.match(handler, /if \(wasQwen21 && state\.editEngine !== 'qwen21'\) restoreGenerationTuning\('edit'\);/);
});
