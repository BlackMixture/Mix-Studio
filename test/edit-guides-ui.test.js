'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('the replayable tutorial includes the complete Edit workflow', () => {
  const stepsStart = app.indexOf('const GUIDED_TOUR_STEPS = [');
  const stepsEnd = app.indexOf('\n];', stepsStart);
  const steps = app.slice(stepsStart, stepsEnd);
  for (const id of ['edit-workspace', 'edit-inputs', 'edit-mentions', 'edit-preserve', 'edit-expand', 'edit-area']) {
    assert.match(steps, new RegExp(`id: '${id}'`));
  }
  assert.match(steps, /Input 1 is the image to change/);
  assert.match(steps, /Type @ in the prompt/);
  assert.match(steps, /Preserve keeps untouched parts of Input 1 exact/);
  assert.match(steps, /Expand is outpainting/);
  assert.match(steps, /Edit one area with inpainting/);
  assert.match(steps, /Smart, Brush, or Box/);
});

test('first Edit entry schedules five concise contextual basics', () => {
  assert.match(app, /view === 'edit' && prev !== view[\s\S]{0,100}scheduleContextualGuide\('edit-inputs', 760\)/);
  const ids = ['edit-inputs', 'edit-mentions', 'edit-preserve', 'edit-expand', 'edit-area'];
  ids.forEach((id) => assert.match(app, new RegExp(`id: '${id}'`)));
  assert.match(app, /kicker: 'Edit basics · 1 of 5'/);
  assert.match(app, /kicker: 'Edit basics · 5 of 5'/);
  assert.match(app, /'edit-inputs'[\s\S]{0,700}next: 'edit-mentions'/);
  assert.match(app, /'edit-mentions'[\s\S]{0,700}next: 'edit-preserve'/);
  assert.match(app, /'edit-preserve'[\s\S]{0,700}next: 'edit-expand'/);
  assert.match(app, /'edit-expand'[\s\S]{0,1000}next: 'edit-area'/);
});

test('informational contextual tips continue only from Got it, not close', () => {
  assert.match(app, /function acknowledgeContextualGuide\(\)[\s\S]{0,900}contextualGuideValue\(guide\.next\)/);
  assert.match(app, /function acknowledgeContextualGuide\(\)[\s\S]{0,900}showNextContextualGuide\(next, intentKey\)/);
  assert.match(app, /function advanceGuidedTour\(direction\)[\s\S]{0,180}acknowledgeContextualGuide\(\)/);
  assert.match(app, /guidedTourClose'\)\.addEventListener\('click', \(\) => finishGuidedTour\(false\)\)/);
});

test('Edit guide targets adapt to model capabilities and full completion retires them', () => {
  assert.match(app, /target: \(\) => \$\('#editComposite'\)\.hidden \? '#refPanel' : '#editComposite'/);
  assert.match(app, /target: \(\) => \$\('#kreaMaskTools'\)\.hidden \? '#editModelPanel' : '#kreaMaskTools'/);
  assert.match(app, /const EDIT_CONTEXTUAL_GUIDE_IDS = Object\.freeze/);
  assert.match(app, /\.\.\.EDIT_CONTEXTUAL_GUIDE_IDS/);
  assert.match(app, /guidedTourRestoreState = \{[\s\S]{0,500}editOutpaint: state\.editOutpaint/);
  assert.match(app, /state\.editOutpaint = restore\.editOutpaint/);
});
