'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

const prompt = 'A dog with a colorful cape and black mask flies through the sky at high speed.';

function functionBody(name, nextName) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} should be declared`);
  const end = nextName ? app.indexOf(`function ${nextName}(`, start + 1) : -1;
  return app.slice(start, end > start ? end : start + 5000);
}

test('first launch offers an accessible Make your first image card with the supplied example', () => {
  assert.match(html, /id="firstRunTutorial"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(html, /id="firstRunTutorialCard"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="firstRunTutorialTitle"/);
  assert.match(html, /id="firstRunTutorialTitle"[^>]*>Make your first image</);
  assert.match(html, /id="firstRunTutorialImage"[^>]*src="\/guides\/first-image-superdog\.png"[^>]*alt="[^"]*(?:dog|cape)[^"]*"/i);
  assert.match(html, /id="firstRunTutorialShow"[^>]*>Show me how</);
  assert.match(html, /id="firstRunTutorialSkip"[^>]*>Skip</);

  const image = path.join(root, 'public', 'guides', 'first-image-superdog.png');
  assert.ok(fs.existsSync(image), 'the supplied tutorial thumbnail should ship as a local public asset');
  assert.ok(fs.statSync(image).size > 1000, 'the tutorial image should not be an empty placeholder');
});

test('the first-image tutorial is profile scoped and both terminal choices prevent a repeat', () => {
  assert.match(app, /function firstRunTutorialStorageKey\(\)[\s\S]{0,180}profileStorageKey\('ks-first-image-tutorial'\)/);
  assert.match(app, /function maybeShowFirstRunTutorial\(\)/);
  assert.match(app, /localStorage\.getItem\(firstRunTutorialStorageKey\(\)\)/);
  assert.match(app, /localStorage\.setItem\(firstRunTutorialStorageKey\(\),\s*'skipped'\)/);
  assert.match(app, /localStorage\.setItem\(firstRunTutorialStorageKey\(\),\s*'complete'\)/);
  assert.match(app, /firstRunTutorialSkip'\)\.addEventListener\('click'/);
  assert.match(app, /firstRunTutorialShow'\)\.addEventListener\('click'/);
});

test('the first-run offer waits for both identity and readiness regardless of boot request order', () => {
  const maybe = functionBody('maybeShowFirstRunTutorial');
  assert.match(maybe, /state\.profile/);
  assert.match(maybe, /lastMeta/);
  assert.match(maybe, /profileGateOpen/);
  assert.match(maybe, /state\.profileIsOwner/);
  assert.match(maybe, /state\.profile\.id\s*!==?\s*workspaceSessionProfileId|state\.profile\.id\s*===\s*workspaceSessionProfileId/);
  assert.match(maybe, /(?:firstRunTutorialGalleryLoaded|firstRunGalleryLoaded|firstImageTutorialGalleryLoaded)/);
  assert.match(maybe, /localStorage\.getItem\(formKey\(\)\)/,
    'an upgraded workspace must not be mistaken for a fresh installation');
  assert.match(maybe, /state\.items\.length/,
    'an existing Library must suppress the fresh-install offer');
  assert.match(functionBody('checkAuth'), /maybeShowFirstRunTutorial\(\)/);
  assert.match(functionBody('loadMeta'), /maybeShowFirstRunTutorial\(\)/);
  assert.match(functionBody('refreshGallery'), /maybeShowFirstRunTutorial\(\)/);
});

test('a fresh workspace completes generation setup before offering the first-image tutorial', () => {
  const maybe = functionBody('maybeShowFirstRunTutorial');
  assert.match(maybe, /firstImageTutorialReady\(\)/);
  assert.match(maybe, /openInitialSetup\(\{[\s\S]{0,360}components:\s*\[['"]image['"]\][\s\S]{0,180}firstRun:\s*true/);
  assert.ok(maybe.indexOf('firstImageTutorialReady()') < maybe.indexOf("localStorage.setItem(key, 'offered')"),
    'the tutorial must not be recorded or shown before setup readiness is known');
  assert.match(app, /firstRunTutorialAfterSetupProfile\s*===\s*state\.profile\?\.id/);
  assert.match(app, /queueMicrotask\(maybeShowFirstRunTutorial\)/,
    'finishing auto-opened setup should immediately advance to the tutorial offer');
});

test('first-run setup takes priority over contextual tips', () => {
  const blocker = functionBody('freshFirstRunWorkspacePending', 'firstImageTutorialBlocksContextualGuides');
  assert.match(blocker, /state\.profileIsOwner/);
  assert.match(blocker, /localStorage\.getItem\(formKey\(\)\)/);
  assert.match(blocker, /state\.items\.length/);
  assert.match(functionBody('firstImageTutorialBlocksContextualGuides', 'hideFirstRunTutorial'), /freshFirstRunWorkspacePending\(\)/);
  assert.match(functionBody('maybeShowFirstRunTutorial', 'firstImageTutorialReady'), /cancelContextualGuide\(\)/);
  assert.match(functionBody('openInitialSetup', 'setupComponentLabelMap'), /cancelContextualGuide\(\)/);
});

test('closing setup returns an interrupted tutorial to a resumable offer', () => {
  const close = functionBody('closeGenerationSetup', 'setupGenerationReady');
  assert.match(close, /firstImageTutorialAwaitingSetup\s*=\s*false/);
  assert.match(close, /firstImageTutorialPhase\s*=\s*['"]/);
  assert.match(close, /localStorage\.setItem\(key,\s*['"]offered['"]\)/);
  assert.doesNotMatch(close, /firstImageTutorialPhase\s*=\s*['"]paused['"]/);
});

test('Show me how conditionally visits the existing image-workflow setup before teaching generation', () => {
  const start = functionBody('startFirstImageTutorial', 'finishFirstImageTutorial');
  assert.match(start, /lastMeta/);
  assert.match(start, /missingSetupComponents\(\[['"]image['"]\]\)/);
  assert.match(start, /openInitialSetup\(\{[\s\S]{0,280}components:\s*\[['"]image['"]\]/);
  assert.match(app, /function resumeFirstImageTutorialAfterSetup\(\)/);
  assert.match(app, /(?:refreshSetupStatus|setupNext)[\s\S]{0,1800}resumeFirstImageTutorialAfterSetup\(\)/,
    'setup completion should resume the walkthrough instead of making the user restart it');
});

test('the tutorial applies the exact reference prompt and Krea 2 Turbo settings', () => {
  assert.ok(app.includes(prompt), 'the supplied generation prompt should be used literally');
  const preset = functionBody('applyFirstImageTutorialPreset', 'startFirstImageTutorial');
  assert.match(preset, /setView\('create',[\s\S]{0,100}createMode:\s*'image'/);
  assert.match(preset, /setPromptDraft\([^)]*(?:FIRST_IMAGE_TUTORIAL_PROMPT|A dog with a colorful cape)/);
  assert.match(preset, /state\.prompts\.create\s*=/);
  assert.match(preset, /state\.aspect\s*=\s*['"]1:1['"]/);
  assert.match(preset, /state\.mp\s*=\s*1/);
  assert.match(preset, /state\.width\s*=\s*992/);
  assert.match(preset, /state\.height\s*=\s*992/);
  assert.match(preset, /state\.customDims\s*=\s*false/);
  assert.match(preset, /state\.krea2Turbo\s*=\s*true/);
  assert.match(preset, /tutorialTuning\s*=\s*\{[\s\S]{0,180}seed:\s*FIRST_IMAGE_TUTORIAL_SEED[\s\S]{0,80}steps:\s*8[\s\S]{0,80}cfg:\s*1[\s\S]{0,80}batch:\s*1/);
  assert.match(preset, /seedInput['"]?\)?\.value\s*=\s*tutorialTuning\.seed/);
  assert.match(preset, /stepsInput['"]?\)?\.value\s*=\s*tutorialTuning\.steps/);
  assert.match(preset, /cfgInput['"]?\)?\.value\s*=\s*tutorialTuning\.cfg/);
  assert.match(preset, /batchInput['"]?\)?\.value\s*=\s*tutorialTuning\.batch/);
  assert.match(preset, /saveForm\(\)/, 'the demonstrated settings should remain visible if the page reloads');
});

test('prompt, resolution, and Generate are real user actions rather than synthetic clicks', () => {
  assert.match(app, /(?:FIRST_IMAGE_TUTORIAL_STEPS|firstImageTutorialSteps)\s*=\s*\[[\s\S]{0,1800}(?:#promptComposer|#promptPanel)[\s\S]{0,900}#res(?:Header|Panel)[\s\S]{0,900}#generateBtn/);
  assert.match(app, /advanceOn:\s*['"]#generateBtn['"]/);
  assert.match(app, /advanceFirstImageTutorialFromAction\(/);
  assert.match(app, /event\.composedPath\(\)\.includes\(target\)/,
    'a choice that re-renders itself should still advance the active guide');
  assert.match(app, /targetWasInEventPath[\s\S]{0,300}\}, true\);/,
    'the guide should capture the click before a selected chip replaces itself');

  const tutorialStart = app.indexOf('const FIRST_IMAGE_TUTORIAL');
  const tutorialEnd = app.indexOf('/* ------------------------------------------------------------------ */', tutorialStart + 1);
  assert.ok(tutorialStart >= 0, 'the tutorial implementation should have a focused module section');
  const tutorial = app.slice(tutorialStart, tutorialEnd > tutorialStart ? tutorialEnd : tutorialStart + 12000);
  assert.doesNotMatch(tutorial, /\$\(['"]#generateBtn['"]\)\.click\(\)/,
    'the walkthrough must never spend GPU time without the user pressing Generate');
});

test('the walkthrough follows its queued job to the completed Library item', () => {
  assert.match(app, /firstImageTutorialJobId\s*=\s*(?:res|result)\.jobId/);
  assert.match(app, /d\.jobId\s*===\s*firstImageTutorialJobId/,
    'an unrelated generation must not complete the first-image walkthrough');
  assert.match(app, /es\.addEventListener\('jobDone',[\s\S]{0,1800}(?:complete|finish)FirstImageTutorial\(d\.items\[0\]/);
  const finish = functionBody('completeFirstImageTutorial');
  assert.match(finish, /setView\('gallery',\s*\{\s*focusedResult:\s*true\s*\}\)/);
  assert.match(finish, /(?:focusCompletedDesktopOutput|openLightbox)\([^)]*(?:item\.id|completedItem\.id)/);
  assert.match(finish, /localStorage\.setItem\(firstRunTutorialStorageKey\(\),\s*'complete'\)/);
});

test('the onboarding card and animated walkthrough fit phones and honor reduced motion', () => {
  assert.match(css, /\.first-run-tutorial\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*display:\s*(?:grid|flex)/s);
  assert.match(css, /\.first-run-tutorial-card\s*\{[^}]*max-width:/s);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*\.first-run-tutorial-card/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*(?:first-run-tutorial|first-image-tutorial)/);
});
