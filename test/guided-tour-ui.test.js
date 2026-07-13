'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('Advanced Settings can replay an accessible guided UI tutorial', () => {
  assert.match(html, /id="settingsPaneGeneral"[\s\S]*class="guided-tour-setting"[\s\S]*id="guidedTourStart"/);
  assert.match(html, /id="guidedTour" hidden aria-hidden="true"/);
  assert.match(html, /id="guidedTourCard"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*tabindex="-1"/);
  for (const id of ['guidedTourClose', 'guidedTourBack', 'guidedTourNext', 'guidedTourDots', 'guidedTourSpotlight']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /function startGuidedTour\(\)/);
  assert.match(app, /function finishGuidedTour\(completed = false\)/);
  assert.match(app, /localStorage\.setItem\(guidedTourStorageKey\(\), 'complete'\)/);
  assert.match(app, /completed \? 'Replay tutorial' : 'Start tutorial'/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /event\.key !== 'Tab'/);
  assert.match(html, /Optional walkthrough for the complete workflow/);
  assert.equal((app.match(/startGuidedTour\(\)/g) || []).length, 1, 'the tutorial is declared but never started automatically');
});

test('guided steps cover the main workflow with animated gesture demonstrations', () => {
  for (const selector of ['#primaryTabs', '#createTabs', '#promptPanel', '#createPromptTools', '#resPanel', '#generateBtn', '[data-primary-mode="gallery"]']) {
    assert.match(app, new RegExp(`target: '${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(app, /setCreateMode\('image'\)/);
  assert.match(app, /target\.scrollIntoView\(\{/);
  assert.match(app, /positionGuidedTour\(\)/);
  assert.match(css, /\.guided-tour-spotlight \{[\s\S]*box-shadow: 0 0 0 9999px/);
  assert.match(css, /@keyframes guidedTourSpotlight/);
  assert.match(css, /@keyframes guidedTourTap/);
  assert.match(css, /@keyframes guidedTourPress/);
  assert.match(css, /@keyframes guidedTourType/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.guided-tour-demo-cursor/);
});

test('Advanced Settings controls profile-scoped contextual gesture tips', () => {
  assert.match(html, /id="guidedTipsToggle"[^>]*role="switch"[^>]*aria-checked="true"/);
  assert.match(app, /function guidedTipsStorageKey\(\)[\s\S]{0,180}ks-contextual-guides-/);
  assert.match(app, /function contextualGuidesEnabled\(\)[\s\S]{0,180}!== 'off'/);
  assert.match(app, /guidedTipsToggle'\)\.setAttribute\('aria-checked', String\(tipsEnabled\)\)/);
  assert.match(app, /guidedTipsToggle'\)\.addEventListener\('click'/);
  assert.match(app, /localStorage\.setItem\(guidedTipsStorageKey\(\), enabled \? 'on' : 'off'\)/);
});

test('gallery selection offers a one-time nonblocking swipe-up guide', () => {
  assert.match(app, /id: 'gallery-selection-details'[\s\S]{0,180}target: '#selectBar'[\s\S]{0,180}motion: 'swipe-up'/);
  assert.match(app, /function contextualGuideSeenKey\(id\)[\s\S]{0,180}ks-context-guide-/);
  assert.match(app, /function scheduleContextualGuide\(/);
  assert.match(app, /function showContextualGuide\(/);
  assert.match(app, /function updateSelectBar\(\)[\s\S]{0,700}scheduleContextualGuide\('gallery-selection-details'\)/);
  assert.match(app, /function openSelectionInsights\(\)[\s\S]{0,180}completeContextualGuide\('gallery-selection-details'\)/);
  assert.match(css, /\.guided-tour\.is-contextual \{[^}]*pointer-events: none/);
  assert.match(css, /\.guided-tour\.is-contextual \.guided-tour-card \{[^}]*pointer-events: auto/);
  assert.match(css, /\.guided-tour-demo\[data-motion="swipe-up"\][\s\S]*guidedTourSwipeUp/);
  assert.match(css, /@keyframes guidedTourSwipeUp/);
});
