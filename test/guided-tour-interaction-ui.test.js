'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

const stepsStart = app.indexOf('const GUIDED_TOUR_STEPS = [');
const stepsEnd = app.indexOf('\n];', stepsStart);
const stepsSource = app.slice(stepsStart, stepsEnd);

function stepSource(id) {
  const start = stepsSource.indexOf(`    id: '${id}'`);
  assert.ok(start >= 0, `guided-tour step ${id} should exist`);
  const end = stepsSource.indexOf('\n  },', start);
  assert.ok(end > start, `guided-tour step ${id} should have a complete definition`);
  return stepsSource.slice(start, end);
}

function functionSource(name, nextName) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} should be declared`);
  const end = nextName ? app.indexOf(`function ${nextName}(`, start + 1) : -1;
  return app.slice(start, end > start ? end : start + 7000);
}

test('safe full-tour steps declare the only UI they may interact with', () => {
  for (const id of ['side-panel', 'workspaces', 'creation-method', 'prompt', 'resolution', 'turbo-raw', 'open-library']) {
    assert.match(stepSource(id), /\badvanceOn:\s*['"][^'"]+['"]/, `${id} needs a constrained action selector`);
  }

  assert.match(stepSource('side-panel'), /advanceOn:\s*'#appMenuBtn'/);
  assert.match(stepSource('prompt'), /advanceOn:\s*'#promptComposer'/);
  assert.match(stepSource('prompt'), /advanceEvent:\s*'input'/,
    'the prompt should advance from real typing, not merely from focusing the field');
  assert.match(stepSource('resolution'), /advanceOn:\s*'#resHeader'/);
  assert.match(stepSource('turbo-raw'), /advanceOn:\s*'#kreaTurboToggle'/);
  assert.match(stepSource('open-library'), /advanceOn:\s*'\[data-primary-mode="gallery"\]'/);
});

test('full and contextual guides share constrained action discovery and hit testing', () => {
  const active = functionSource('activeGuidedTourDefinition', 'guidedTourActions');
  assert.match(active, /contextualGuide/);
  assert.match(active, /GUIDED_TOUR_STEPS\[guidedTourIndex\]/);

  const actions = functionSource('guidedTourActions', 'guidedTourActionAtPoint');
  assert.match(actions, /definition\.advanceOn/);
  assert.match(actions, /target\.matches\(selector\)/);
  assert.match(actions, /target\.contains\(candidate\)/);
  assert.match(actions, /!candidate\.disabled/);

  const hitTest = functionSource('guidedTourActionAtPoint');
  assert.match(hitTest, /candidate\.getBoundingClientRect\(\)/);
  assert.match(hitTest, /clientX\s*>?=/);
  assert.match(hitTest, /clientY\s*>?=/);
});

test('the spotlight forwards only the current allowed action and real input advances the prompt', () => {
  const spotlightStart = app.indexOf("$('#guidedTourSpotlight').addEventListener('click'");
  const clickCaptureStart = app.indexOf("document.addEventListener('click'", spotlightStart);
  const inputCaptureStart = app.indexOf("document.addEventListener('input'", spotlightStart);
  assert.ok(spotlightStart >= 0 && clickCaptureStart > spotlightStart && inputCaptureStart > spotlightStart,
    'tour interaction listeners should cover spotlight clicks, real clicks, and real typing');

  const spotlight = app.slice(spotlightStart, clickCaptureStart);
  assert.match(spotlight, /activeGuidedTourDefinition\(\)/);
  assert.match(spotlight, /guidedTourActionAtPoint\(/);
  assert.match(spotlight, /event\.preventDefault\(\)/);
  assert.match(spotlight, /event\.stopPropagation\(\)/);
  assert.match(spotlight, /action\.(?:click|focus)\(/,
    'safe highlighted controls should receive the real action');

  const inputListener = app.slice(inputCaptureStart, inputCaptureStart + 2600);
  assert.match(inputListener, /activeGuidedTourDefinition\(\)/);
  assert.match(inputListener, /advanceEvent !== 'input'/);
  assert.match(inputListener, /event\.target\.closest\(selector\)/);
  assert.match(inputListener, /clearTimeout\([^)]*(?:guided|tour)[^)]*\)/i,
    'continued typing should restart the advancement delay');
  assert.match(inputListener, /setTimeout\(\(\) =>[\s\S]{0,220}advanceFullGuidedTourFromAction\(/,
    'typing should advance only after a short pause, not after the first character');
  assert.match(inputListener, /advanceFullGuidedTourFromAction\(/);
});

test('click completion survives controls that re-render themselves', () => {
  const start = app.indexOf("document.addEventListener('click'", app.indexOf("$('#guidedTourSpotlight').addEventListener('click'"));
  const clickCapture = app.slice(start, start + 2600);

  assert.match(clickCapture, /event\.composedPath\(\)\.includes\(target\)/,
    'the original event path must remain authoritative after a control replaces its DOM');
  assert.match(clickCapture, /setTimeout\(\(\) =>/,
    'advancement should run after the control has handled its click');
  assert.match(clickCapture, /advanceFullGuidedTourFromAction\(/);
});

test('advancing from the side panel closes its drawer and cancels deferred focus', () => {
  const prepare = functionSource('prepareGuidedTourImage', 'prepareGuidedTourLoras');
  assert.match(prepare, /appDrawer'\)\.classList\.contains\('show'\)[\s\S]{0,50}closeAppDrawer\(\)/,
    'the next image step must not remain hidden behind the drawer');

  const open = functionSource('openAppDrawer', 'closeAppDrawer');
  const close = functionSource('closeAppDrawer', 'setAppUpdateStatus');
  assert.match(open, /clearTimeout\(appDrawerFocusTimer\)/);
  assert.match(open, /appDrawerFocusTimer = setTimeout\(/);
  assert.match(open, /appDrawer'\)\.classList\.contains\('show'\)[\s\S]{0,90}appDrawerClose/,
    'deferred focus should only land in a drawer that is still open');
  assert.match(close, /clearTimeout\(appDrawerFocusTimer\)[\s\S]{0,80}appDrawerFocusTimer = null/,
    'closing between steps must cancel the old close-button focus');
});

test('the full overlay blocks unrelated UI while keyboard focus includes only the target and tour controls', () => {
  const tourRule = css.match(/(?:^|\n)\.guided-tour\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(tourRule, /position:\s*fixed/);
  assert.match(tourRule, /inset:\s*0/);
  assert.match(tourRule, /touch-action:\s*none/);

  const rootClickStart = app.indexOf("$('#guidedTour').addEventListener('click'");
  const rootClickEnd = app.indexOf("$('#guidedTour').addEventListener('wheel'", rootClickStart);
  const rootClick = app.slice(rootClickStart, rootClickEnd);
  assert.match(rootClick, /event\.preventDefault\(\)/);
  assert.match(rootClick, /event\.stopPropagation\(\)/);
  assert.match(rootClick, /signalContextualGuideTarget\(\)|signalGuidedTourTarget\(\)/);

  assert.match(app, /const allowed = \[\s*\.\.\.guidedTourActions\([^\n]+\),[\s\S]{0,260}guidedTourClose/,
    'Tab should be constrained to the highlighted action and tutorial navigation');
});

test('Next remains an accessibility escape hatch for informational and risky steps', () => {
  const render = functionSource('renderGuidedTourStep', 'startGuidedTour');
  assert.match(render, /guidedTourNext'\)\.disabled = false/);
  assert.match(render, /const focusIsStillConstrained = card\.contains\(active\) \|\| actions\.includes\(active\)/);
  assert.match(render, /if \(focus \|\| !focusIsStillConstrained\) card\.focus\(\{ preventScroll: true \}\)/,
    'each new step should pull focus back from a stale previous target');
  assert.doesNotMatch(css, /\.guided-tour:not\(\.is-contextual\)\.requires-action \.guided-tour-actions\s*\{[^}]*display:\s*none/s,
    'the full tour should not remove Back and Next when a real interaction is offered');
});
