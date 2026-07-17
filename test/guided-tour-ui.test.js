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
  assert.match(app, /function guidedTourCompletionValue\(\)[\s\S]{0,120}GUIDED_TOUR_VERSION/);
  assert.match(app, /localStorage\.setItem\(guidedTourStorageKey\(\), guidedTourCompletionValue\(\)\)/);
  assert.match(app, /completed \? 'Replay tutorial' : \(hasOlderTour \? 'See what’s new' : 'Start tutorial'\)/);
  assert.match(app, /See what’s new/);
  assert.match(app, /Updated · now covers side panel access/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /event\.key !== 'Tab'/);
  assert.match(html, /Optional walkthrough for Create, Edit, LoRAs, and Library/);
  assert.equal((app.match(/startGuidedTour\(\)/g) || []).length, 1, 'the tutorial is declared but never started automatically');
});

test('guided steps cover the main workflow with animated gesture demonstrations', () => {
  for (const selector of [
    '#primaryTabs', '#createTabs', '#promptPanel', '#createPromptTools', '#resPanel', '#kreaTurboToggle',
    '#loraList .lora-card.add', '#loraList', '.lora-tools', '#generateBtn',
    '[data-primary-mode="gallery"]', '.library-toolbar',
  ]) {
    assert.match(app, new RegExp(`target: '${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  for (const phrase of ['Turbo is the fast, high-quality model', 'Raw when you want more variation', 'Hold a LoRA card', 'set the card thumbnail', 'saves the current stack as a preset', 'Group related generations']) {
    assert.match(app, new RegExp(phrase));
  }
  assert.match(app, /function prepareGuidedTourImage\(expandLoras = false\)[\s\S]{0,180}setLorasExpanded\(expandLoras\)/);
  assert.match(app, /function prepareGuidedTourLoras\(\)[\s\S]{0,120}prepareGuidedTourImage\(true\)/);
  assert.match(app, /function prepareGuidedTourLibrary\(\)[\s\S]{0,140}setView\('gallery'\)/);
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

test('every guide action row leaves breathing room after its explanatory content', () => {
  const actions = css.match(/(?:^|\n)\.guided-tour-actions\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(actions, /margin-top:\s*(?:1[2-9]|[2-9]\d)px/,
    'tutorial and contextual-tip buttons should not crowd the guide copy');
});

test('the full tour starts by showing where to open the side panel', () => {
  const stepsStart = app.indexOf('const GUIDED_TOUR_STEPS = [');
  const stepsEnd = app.indexOf('\n];', stepsStart);
  const steps = app.slice(stepsStart, stepsEnd);
  const menuTarget = steps.indexOf("target: '#appMenuBtn'");
  const workspaceStep = steps.indexOf("id: 'workspaces'");

  assert.ok(menuTarget >= 0, 'the full tour should highlight the existing menu trigger');
  assert.ok(menuTarget < workspaceStep, 'side-panel access should be taught before workspace details');
  const menuStep = steps.slice(Math.max(0, menuTarget - 180), menuTarget + 700);
  assert.match(menuStep, /title: ['"][^'"]*side panel[^'"]*['"]/i);
  assert.match(menuStep, /motion: 'tap'/);
  assert.match(menuStep, /simulateOn: '\.side-menu-icon'/);
  assert.match(menuStep, /scroll: false/);
  assert.match(menuStep, /Advanced Settings/);
});

test('side-panel access is a one-time contextual guide retired when the drawer is opened', () => {
  const guideStart = app.indexOf("  'side-panel-access': {");
  const guideEnd = app.indexOf("\n  },", guideStart);
  const guide = app.slice(guideStart, guideEnd);
  assert.ok(guideStart >= 0, 'the side-panel-access contextual guide should exist');
  assert.match(guide, /id: 'side-panel-access'/);
  assert.match(guide, /target: '#appMenuBtn'/);
  assert.match(guide, /simulateOn: '\.side-menu-icon'/);
  assert.match(app, /scheduleContextualGuide\('side-panel-access',\s*\d+\)/);

  const openStart = app.indexOf('function openAppDrawer()');
  const openEnd = app.indexOf('function closeAppDrawer()', openStart);
  const openDrawer = app.slice(openStart, openEnd);
  assert.match(openDrawer, /completeContextualGuide\('side-panel-access'\)/,
    'people who find the drawer themselves should never see the access tip later');
});

test('Advanced Settings controls profile-scoped contextual gesture tips', () => {
  assert.match(html, /id="guidedTipsToggle"[^>]*role="switch"[^>]*aria-checked="true"/);
  assert.match(app, /function guidedTipsStorageKey\(\)[\s\S]{0,180}ks-contextual-guides-/);
  assert.match(app, /function contextualGuidesEnabled\(\)[\s\S]{0,180}!== 'off'/);
  assert.match(app, /guidedTipsToggle'\)\.setAttribute\('aria-checked', String\(tipsEnabled\)\)/);
  assert.match(app, /guidedTipsToggle'\)\.addEventListener\('click'/);
  assert.match(app, /localStorage\.setItem\(guidedTipsStorageKey\(\), enabled \? 'on' : 'off'\)/);
});

test('basic contextual tips appear where prompting, models, LoRAs, and Library tools become useful', () => {
  for (const guide of ['prompt-entry', 'turbo-vs-raw', 'lora-basics', 'library-basics']) {
    assert.match(app, new RegExp(`id: '${guide}'`));
  }
  assert.match(app, /setView\(view, opts = \{\}\)[\s\S]{0,1500}schedulePrimaryOrSidePanelGuide\('library-basics'/);
  assert.match(app, /setView\(view, opts = \{\}\)[\s\S]{0,1700}schedulePrimaryOrSidePanelGuide\('prompt-entry'/);
  assert.match(app, /function schedulePrimaryOrSidePanelGuide\([\s\S]{0,500}scheduleContextualGuide\(primarySeen \? 'side-panel-access' : primaryId/);
  assert.match(app, /kreaTurboToggle'\)\.addEventListener\('click'[\s\S]{0,900}scheduleContextualGuide\('turbo-vs-raw'/);
  assert.match(app, /loraHeader'\)\.addEventListener\('click'[\s\S]{0,260}scheduleContextualGuide\('lora-basics'/);
  assert.match(html, />Contextual tips<[\s\S]{0,120}Show one-time help when a control first becomes useful/);
});

test('the expanded tutorial is versioned and restores the workspace it temporarily opens', () => {
  assert.match(app, /const GUIDED_TOUR_VERSION = 4/);
  assert.match(app, /stored === 'complete'/);
  assert.match(app, /hasOlderTour \? 'See what’s new'/);
  assert.match(app, /guidedTourRestoreState = \{[\s\S]{0,220}view: state\.view[\s\S]{0,220}lorasExpanded/);
  assert.match(app, /guidedTourRestoreState = \{[\s\S]{0,420}directorOpen: state\.directorOpen[\s\S]{0,180}directorChoosingWorkflow/);
  assert.match(app, /function finishGuidedTour\(completed = false\)[\s\S]{0,1400}setLorasExpanded\(restore\.lorasExpanded\)/);
  assert.match(app, /function finishGuidedTour\(completed = false\)[\s\S]{0,1700}setView\(restore\.view\)/);
  assert.match(app, /function finishGuidedTour\(completed = false\)[\s\S]{0,2000}openDirectorMode\(restore\.directorProject,[\s\S]{0,180}chooseWorkflow: restore\.directorChoosingWorkflow/);
  assert.match(app, /function finishGuidedTour\(completed = false\)[\s\S]{0,2300}saveForm\(\)/,
    'the restored mode must replace the tutorial workspace in profile persistence');
  assert.match(app, /function finishGuidedTour\(completed = false\)[\s\S]{0,700}['"]side-panel-access['"][\s\S]{0,300}contextualGuideSeenKey\(id\)/,
    'completing the full tour should retire the equivalent one-time side-panel tip');
});

test('Escape dismisses both action-required and informational contextual tips', () => {
  assert.match(app, /document\.addEventListener\('keydown', \(event\) => \{\s*const guide = contextualGuide;\s*if \(!guide\) return;\s*if \(event\.key === 'Escape'\)/);
  assert.match(app, /if \(event\.key === 'Escape'\)[\s\S]{0,180}finishGuidedTour\(false\)[\s\S]{0,100}if \(!guide\.advanceOn\) return/);
});

test('Advanced Settings can reset every profile-scoped tip and guide', () => {
  assert.match(html, /id="guidedGuidesReset"[^>]*>[\s\S]{0,180}Reset tips &amp; guides[\s\S]{0,120}Show all one-time help again/);
  assert.match(app, /function resetTipsAndGuides\(\)[\s\S]{0,800}localStorage\.removeItem\(guidedTourStorageKey\(\)\)/);
  assert.match(app, /Object\.keys\(CONTEXTUAL_GUIDES\)\.forEach\(\(id\) => \{[\s\S]{0,120}localStorage\.removeItem\(contextualGuideSeenKey\(id\)\)/);
  assert.match(app, /dismissedIntentGuides\.clear\(\)/);
  assert.match(app, /localStorage\.setItem\(guidedTipsStorageKey\(\), 'on'\)/);
  assert.match(app, /guidedGuidesReset'\)\.addEventListener\('click', resetTipsAndGuides\)/);
  assert.match(css, /\.guided-guides-reset \{/);
});

test('gallery selection offers a one-time nonblocking action and grouping guide', () => {
  assert.match(app, /id: 'gallery-selection-actions'[\s\S]{0,180}target: '#selectBar'[\s\S]{0,260}Group stacks related generations[\s\S]{0,220}motion: 'swipe-up'/);
  assert.match(app, /function contextualGuideSeenKey\(id\)[\s\S]{0,180}ks-context-guide-/);
  assert.match(app, /function scheduleContextualGuide\(/);
  assert.match(app, /function showContextualGuide\(/);
  assert.match(app, /function updateSelectBar\(\)[\s\S]{0,700}scheduleContextualGuide\('gallery-selection-actions'\)/);
  assert.match(app, /function openSelectionInsights\(\)[\s\S]{0,180}completeContextualGuide\('gallery-selection-actions'\)/);
  assert.match(css, /\.guided-tour\.is-contextual \{[^}]*pointer-events: none/);
  assert.match(css, /\.guided-tour\.is-contextual \.guided-tour-card \{[^}]*pointer-events: auto/);
  assert.match(css, /\.guided-tour-demo\[data-motion="swipe-up"\][\s\S]*guidedTourSwipeUp/);
  assert.match(css, /@keyframes guidedTourSwipeUp/);
});

test('the prompt composer detects missing visual context before generation', () => {
  assert.match(html, /id="promptIntentHint"[^>]*role="status"[^>]*hidden/);
  assert.match(html, /id="promptIntentTitle"/);
  assert.match(html, /id="promptIntentCopy"/);
  assert.match(html, /id="promptIntentAction"[^>]*>Show me</);
  assert.match(app, /function promptUsesUnattachedVisual\(prompt\)/);
  assert.match(app, /function promptRequestsSourceEdit\(prompt\)/);
  assert.match(app, /function currentPromptIntent\(\)/);
  assert.match(app, /promptIntent && offerPromptIntentGuide\(promptIntent\)/);
  assert.match(css, /\.prompt-intent-hint \{/);
});

test('outcome guides use real examples and require the highlighted action to advance', () => {
  assert.match(html, /id="guidedTourMedia" hidden/);
  for (const guide of [
    'prompt-missing-reference', 'create-guide-choices',
    'edit-image-intent', 'edit-source-upload', 'outpaint-intent', 'inpaint-intent',
    'video-scail-intent', 'video-scail-model', 'scail-source-upload', 'scail-motion-upload',
  ]) {
    assert.match(app, new RegExp(`id: '${guide}'`));
  }
  assert.doesNotMatch(app, /id: 'create-guide-upload'/);
  assert.match(app, /advanceOn: '#createImageGuideToggle'/);
  assert.match(app, /intent\.id === 'prompt-missing-reference' && state\.createRef[\s\S]{0,220}guideId = 'create-guide-choices'/);
  assert.match(app, /function setCreateImageGuideAsset\(asset, mode = 'image'\)[\s\S]{0,1800}showNextContextualGuide\('create-guide-choices'/);
  assert.match(app, /advanceOn: '\[data-guide-mode\]'/);
  assert.match(app, /advanceOn: '#vidModelHeader'[\s\S]{0,120}next: 'video-scail-model'/);
  assert.match(app, /function advanceContextualGuideFromAction\(guide, action\)/);
  assert.match(app, /next\.disabled = !!guide\.advanceOn/);
  assert.match(css, /@keyframes contextualTargetTap/);
  assert.match(css, /@keyframes contextualChoiceTrace/);
  assert.doesNotMatch(css, /\.guided-tour-spotlight \{[^}]*transition:[^;}]*\b(?:left|top|width|height)\b/s);
});

test('action-required tips use the animated instruction row instead of button actions', () => {
  const contextualStart = app.indexOf('function showContextualGuide(');
  const contextualEnd = app.indexOf('function hideContextualGuide(', contextualStart);
  assert.ok(contextualStart >= 0 && contextualEnd > contextualStart, 'the contextual guide renderer should exist');
  const contextualRender = app.slice(contextualStart, contextualEnd);
  assert.match(contextualRender, /guidedTourDemoLabel/);
  assert.match(contextualRender, /const actionInstruction = guide\.advanceOn[\s\S]{0,180}guide\.actionLabel \|\| guide\.demo/);
  assert.match(contextualRender, /const announcement = \[[^\]]*actionInstruction[^\]]*\]/);
  assert.match(contextualRender, /guidedTourAnnouncement'\)\.textContent = announcement/);

  assert.match(css, /\.guided-tour\.is-contextual\.requires-action \.guided-tour-actions\s*\{[^}]*display:\s*none/);
  const actionDemoRule = css.match(/\.guided-tour\.is-contextual\.requires-action \.guided-tour-demo\s*\{([^}]*)\}/);
  assert.ok(actionDemoRule, 'action-required tips should explicitly style the animated instruction row');
  assert.doesNotMatch(actionDemoRule[1], /display:\s*none/);
  assert.match(actionDemoRule[1], /display:\s*(?:flex|grid)/);
});

test('guided examples are shipped as local public media', () => {
  const uiSource = `${html}\n${app}`;
  for (const file of [
    'reference-shark.jpg', 'depth-cabin.jpg', 'edit-wireframe.jpg',
    'inpaint-face.jpg', 'outpaint-source.jpg', 'outpaint-wide.jpg', 'scail-hand-fantasy.mp4',
  ]) {
    const location = path.join(root, 'public', 'guides', file);
    assert.ok(fs.existsSync(location), `${file} should be served with the app`);
    assert.ok(fs.statSync(location).size > 1000, `${file} should not be an empty placeholder`);
    assert.match(uiSource, new RegExp(`/guides/${file.replace('.', '\\.')}`));
  }
});
