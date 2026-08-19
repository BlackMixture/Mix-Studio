'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const smartCss = css.slice(
  css.indexOf('/* ---------------- Smart production (experimental) ---------------- */'),
  css.indexOf('/* ---------------- desktop studio workspace ---------------- */'),
);

test('Smart mode is a dedicated disabled-by-default child experiment', () => {
  assert.match(html, /id="experimentalFeaturesToggle"[\s\S]*id="smartModeExperimentalRow" hidden[\s\S]*id="smartModeToggle"/);
  assert.match(app, /experimentalFeatures: false,[\s\S]{0,80}smartMode: false/);
  assert.match(app, /function smartModeEnabled\(\)[\s\S]{0,120}experimentalFeaturesEnabled\(\)[\s\S]{0,120}smartMode === true/);
  assert.match(app, /if \(!enabled\) state\.mediaPreferences\.smartMode = false/);
});

test('Smart replaces only the middle Region navigation entry when enabled', () => {
  assert.match(html, /id="drawerMiddleCreate"[^>]*data-drawer-create-mode="region"/);
  assert.match(html, /id="createMiddleTab"[^>]*data-create-mode="region"/);
  assert.match(app, /tab\.dataset\.createMode = enabled \? 'smart' : 'region'/);
  assert.match(app, /drawer\.dataset\.drawerCreateMode = enabled \? 'smart' : 'region'/);
  assert.match(app, /setCreateMode\(enabled \? 'smart' : 'region'\)/);
});

test('Smart workspace provides typed, voice, plan, review, queue, retry, and cancel controls', () => {
  for (const id of ['smartWorkspace', 'smartBriefInput', 'smartVoiceBtn', 'smartVoiceFile', 'smartPlanBtn', 'smartBoard', 'smartRecent']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(app, /if \(!window\.isSecureContext\)[\s\S]*Chrome requires HTTPS[\s\S]*openSmartVoiceFileFallback/);
  assert.match(app, /smartVoiceFile[\s\S]*transcribeSmartAudio\(file\)/);
  assert.match(app, /api\('\/api\/smart\/transcribe'/);
  assert.match(app, /api\('\/api\/smart\/plan'/);
  assert.match(app, /api\('\/api\/smart\/plan\/review'/);
  assert.match(app, /api\('\/api\/smart\/runs'/);
  assert.match(app, /approved: true/);
  assert.match(app, /Approve &amp; queue/);
  assert.match(app, /function beginSmartPlanEdit\(\)/);
  assert.match(app, /function saveSmartPlanEdit\(\)/);
  assert.match(app, /data-smart-scene-field="usesSubjectReference"/);
  assert.match(app, /data-smart-scene-field="referenceStateId"/);
  assert.match(app, /\['failed', 'attention'\]/);
  assert.match(app, /\['running', 'queueing'\]\.includes\(run\.status\) \? \['cancel', 'Cancel remaining'\]/);
});

test('Smart can auto approve plans while keeping reference review as a separate checkpoint', () => {
  assert.match(html, /id="smartAutoApprove"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(html, /id="smartPauseReferences"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(app, /autoQueue = smartExecutionOption\('smartAutoApprove'\)/);
  assert.match(app, /await queueSmartProduction\(\{ reviewReference: smartExecutionOption\('smartPauseReferences'\) \}\)/);
  assert.match(app, /const reviewCheckbox = \$\('#smartReviewReference'\)[\s\S]*const reviewReference = options\.reviewReference[\s\S]*reviewCheckbox\.checked/);
  assert.match(server, /moreReferencesPending[\s\S]*step\.kind === 'reference'[\s\S]*!moreReferencesPending/);
});

test('Smart persists and restores the creator original prompt independently of the plan summary', () => {
  assert.match(app, /brief,[\s\S]*references: smartReferencePayload/);
  assert.match(app, /run\?\.brief[\s\S]*Original prompt/);
  assert.match(app, /if \(run\.brief\) \$\('#smartBriefInput'\)\.value = run\.brief/);
  assert.match(server, /brief: String\(run\.brief \|\| run\.plan\?\.summary/);
  assert.match(server, /brief: String\(body\.brief \|\| plan\.summary/);
});

test('Smart reference states are editable and use normalized character, object, and place templates', () => {
  assert.match(app, /Character \/ person[\s\S]*Object \/ product[\s\S]*Place \/ environment/);
  assert.match(app, /data-smart-reference-state-field="description"/);
  assert.match(app, /data-smart-action="add-reference-state"/);
  assert.match(app, /function mutateSmartReferenceStates\(/);
  assert.match(app, /smartUsedReferenceStates\(plan\)/);
});

test('Smart plan editing exposes concise H3 spatiality, timeline, dialogue, soundscape, and music controls', () => {
  assert.match(app, /data-smart-scene-field="spatialComposition"/);
  assert.match(app, /data-smart-scene-field="timelineBeats"/);
  assert.match(app, /data-smart-scene-field="dialogue"/);
  assert.match(app, /data-smart-scene-field="music"/);
  assert.match(app, /function smartTimelineEditorText\(/);
  assert.match(app, /function smartTimelineFromEditor\(/);
  assert.match(app, /function smartDialogueEditorText\(/);
  assert.match(app, /function smartDialogueFromEditor\(/);
  assert.match(app, /2 \| cut \| a front close-up of Maya/);
  assert.match(app, /2\.5 \| Maya \[reference; English; whispers\]: Exact words/);
  assert.match(app, /<dt>Spatial<\/dt>/);
  assert.match(app, /<dt>Timed beats<\/dt>/);
  assert.match(app, /<dt>Dialogue<\/dt>/);
  assert.match(app, /Defaults to N\/A; add only when requested/);
});

test('Smart exposes planner configuration and reusable image references', () => {
  for (const id of ['smartConfigureAi', 'smartAddReference', 'smartReferenceList']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<strong>Prompt AI<\/strong>/);
  assert.match(html, /id="promptAiModeSwitch"[^>]*role="switch"/);
  assert.match(html, /value="local">ComfyUI/);
  assert.match(html, /Vision-capable Qwen3-VL models are recommended/);
  assert.match(html, /Smart voice transcription uses OpenAI/);
  assert.match(html, /Applied everywhere[\s\S]*Smart planning · Image prompts · Video prompts/);
  assert.match(app, /openAssetPicker\('image\/\*', addSmartReferences, 'Add Smart references'/);
  assert.match(app, /references: smartReferencePayload\(\)/);
  assert.match(app, /setSettingsTab\('suggestions'\)[\s\S]*prompting-external/);
  assert.match(server, /function requestSmartPlan\([\s\S]*provider\.provider === 'local'[\s\S]*queueTextEnhancement\([\s\S]*SMART_PLAN_SCHEMA/);
  assert.match(server, /requestSmartPlan\(provider, prompt, references, req\.profile\.id\)/);
  assert.match(server, /compileSmartSteps\(plan, \{\}, references\)/);
  assert.match(server, /route === '\/api\/smart\/plan\/review'/);
  assert.match(server, /body\.approved !== true/);
});

test('Smart typography and reference controls use the native Mix Studio design language', () => {
  assert.doesNotMatch(smartCss, /ui-monospace|SFMono|--font/);
  assert.match(smartCss, /\.smart-workspace \{[\s\S]{0,160}font-family: inherit/);
  assert.match(smartCss, /\.smart-plan-editor select \{[^}]*font-family: inherit/);
  assert.match(smartCss, /\.smart-reference-inputs-head button \{[^}]*width: 30px[^}]*height: 30px[^}]*border: 1px solid var\(--line\)[^}]*background: rgba\(255,255,255,\.025\)/);
  assert.match(html, /id="smartAddReference"[^>]*aria-label="Add reference images"[^>]*title="Add reference images"/);
});

test('Smart mode spans the inputs and stage columns while keeping Library mounted', () => {
  assert.match(css, /body\[data-ui-mode="smart"\] #view-create \{[\s\S]*grid-column: 1 \/ 3/);
  assert.match(css, /body\[data-ui-mode="smart"\] #desktopStage,[\s\S]*#genDock \{ display: none !important; \}/);
  assert.doesNotMatch(css, /body\[data-ui-mode="smart"\][^{]*#view-gallery[^}]*display: none/);
});

test('server persists profile-scoped runs and advances them from generation completion events', () => {
  assert.match(server, /if \(!Array\.isArray\(db\.smartRuns\)\) db\.smartRuns = \[\]/);
  assert.match(server, /route === '\/api\/smart\/plan'/);
  assert.match(server, /route === '\/api\/smart\/runs'/);
  assert.match(server, /function completeSmartJob\(job, items\)/);
  assert.match(server, /completeSmartJob\(job, created\)/);
  assert.match(server, /completeSmartJob\(job, \[item\]\)/);
  assert.match(server, /broadcast\('smartRunUpdated'/);
  assert.match(app, /addEventListener\('smartRunUpdated'/);
});
