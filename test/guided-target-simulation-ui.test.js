'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

function functionBody(name, nextName) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} should be declared`);
  const end = nextName ? app.indexOf(`function ${nextName}(`, start + 1) : -1;
  return app.slice(start, end > start ? end : start + 6000);
}

test('tutorial actions are demonstrated over the real target with a silent inert layer', () => {
  assert.match(html, /id="guidedTargetSimulation"[^>]*hidden[^>]*inert[^>]*aria-hidden="true"/);
  assert.match(html, /id="guidedTargetSimulationText"/);
  assert.match(css, /\.guided-target-simulation\s*\{[^}]*position:\s*fixed[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.guided-tour\.has-target-simulation:not\(\.requires-action\) \.guided-tour-demo\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.guided-tour\.has-target-simulation\.requires-action \.guided-tour-demo-stage\s*\{[^}]*display:\s*none/);
});

test('prompt demonstration types only into the presentation layer', () => {
  assert.match(app, /id: 'prompt'[\s\S]{0,420}motion: 'type'[\s\S]{0,160}simulateOn: '#promptComposer'[\s\S]{0,160}simulationText: FIRST_IMAGE_TUTORIAL_PROMPT/);
  assert.match(app, /id: 'prompt-entry'[\s\S]{0,420}motion: 'type'[\s\S]{0,160}simulateOn: '#promptComposer'/);

  const start = functionBody('startGuidedTargetSimulation');
  assert.match(start, /guidedTargetSimulationText/);
  assert.match(start, /text\.textContent = characters\.slice/);
  assert.match(start, /guidedTourPrefersReducedMotion\(\)/);
  assert.doesNotMatch(start, /setPromptDraft|state\.prompts|saveForm|localStorage|\.value\s*=|\.click\(|dispatchEvent|new (?:Mouse|Pointer|Input)Event/,
    'the visual typing loop must not alter the user prompt or trigger app actions');
});

test('simulated gestures use actual controls and wrapped choice geometry', () => {
  const target = functionBody('guidedTourSimulationTarget', 'guidedTourSimulationChoices');
  assert.match(target, /guide\.simulateOn/);
  assert.match(target, /contextualGuideActions\(guide, target\)\[0\]/);
  assert.doesNotMatch(target, /\.click\(|dispatchEvent/);

  const position = functionBody('positionGuidedTargetSimulation', 'pauseGuidedTargetSimulation');
  assert.match(position, /candidate\.getBoundingClientRect\(\)/);
  assert.match(position, /--guided-choice-x-/);
  assert.match(position, /--guided-choice-y-/);
  assert.match(css, /@keyframes guidedTargetChoiceCursor[\s\S]*--guided-choice-x-1[\s\S]*--guided-choice-y-3/);
  for (const animation of ['guidedTargetTap', 'guidedTargetPress', 'guidedTargetChoiceCursor', 'guidedTargetSwipeUp']) {
    assert.match(css, new RegExp(animation));
  }
});

test('simulation timers and presentation are cleaned up on every guide exit', () => {
  const stop = functionBody('stopGuidedTargetSimulation', 'startGuidedTargetSimulation');
  assert.match(stop, /pauseGuidedTargetSimulation\(\)/);
  assert.match(stop, /removeAttribute\('style'\)/);
  assert.match(stop, /classList\.remove\('has-target-simulation'\)/);

  const hide = functionBody('hideContextualGuide', 'dismissContextualGuide');
  const finish = functionBody('finishGuidedTour', 'advanceGuidedTour');
  assert.match(hide, /stopGuidedTargetSimulation\(\)/);
  assert.match(finish, /stopGuidedTargetSimulation\(\)/);
  assert.match(finish, /stopGuidedTourTargetObservation\(\)/);
  assert.match(app, /document\.addEventListener\('beforeinput'[\s\S]{0,360}pauseGuidedTargetSimulation\(\)/,
    'real typing should immediately reveal the real prompt');
});

test('reduced motion shows the completed example and freezes gesture animation', () => {
  const start = functionBody('startGuidedTargetSimulation');
  assert.match(start, /guidedTourPrefersReducedMotion\(\)[\s\S]{0,100}text\.textContent = fullText[\s\S]{0,80}return/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.guided-target-simulation-cursor[\s\S]*animation:\s*none !important/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.guided-target-simulation\s*\{[^}]*transition-duration:\s*1ms/);
});
