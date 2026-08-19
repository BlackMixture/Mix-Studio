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
  assert.match(app, /data-smart-subject-field="referenceTarget"/);
  assert.match(app, /referenceUseSource: previousScene\.usesSubjectReference === usesSubjectReference/);
  assert.match(app, /\['failed', 'attention'\]/);
  assert.match(app, /\['running', 'queueing'\]\.includes\(run\.status\) \? \['cancel', 'Cancel remaining'\]/);
});

test('Smart can auto approve plans while keeping reference review as a separate checkpoint', () => {
  assert.match(html, /id="smartAutoApprove"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(html, /id="smartPauseReferences"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(app, /return smartExecutionOption\('smartAutoApprove'\)/);
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
  assert.match(html, /A capable Qwen3-VL model is recommended for complete shot planning/);
  assert.match(html, /Smart voice transcription uses OpenAI/);
  assert.match(html, /Routing coverage[\s\S]*Smart planner or its local override/);
  assert.match(html, /Dedicated Smart planner model/);
  assert.match(app, /openAssetPicker\('image\/\*', addSmartReferences, 'Add Smart references'/);
  assert.match(app, /references: smartReferencePayload\(\)/);
  assert.match(app, /Reference pipeline/);
  assert.match(app, /guide the canonical/);
  assert.match(app, /Auto matched/);
  assert.match(app, /setSettingsTab\('suggestions'\)[\s\S]*prompting-external/);
  assert.match(server, /function requestSmartPlan\([\s\S]*provider\.provider === 'local'[\s\S]*queueTextEnhancement\([\s\S]*SMART_PLAN_SCHEMA/);
  assert.match(server, /requestSmartPlan\(provider, prompt, references, request\.profileId, progress\)/);
  assert.match(server, /compileSmartSteps\(plan, \{\}, references\)/);
  assert.match(server, /requireVision: references\.length > 0/);
  assert.match(server, /local Prompt AI workflow cannot inspect images/);
  assert.match(server, /route === '\/api\/smart\/plan\/review'/);
  assert.match(server, /body\.approved !== true/);
});

test('Smart planning survives slow local models and transient browser connections', () => {
  assert.match(server, /const smartPlanRequests = new Map\(\)/);
  assert.match(server, /route === '\/api\/smart\/plan\/status' && req\.method === 'GET'/);
  assert.match(server, /executeSmartPlanRequest\(request, provider, prompt, references\)/);
  assert.match(server, /return json\(res, 202, smartPlanRequestStatus\(request\)\)/);
  assert.match(server, /Completing missing shots in the local draft/);
  assert.match(app, /function rememberSmartPlanRequest\(/);
  assert.match(app, /async function waitForSmartPlanRequest\(/);
  assert.match(app, /Connection interrupted while Smart continues on the generation computer/);
  assert.match(app, /async function resumeSmartPlanRequest\(/);
  assert.match(app, /loadSmartRuns\(\)[\s\S]{0,120}resumeSmartPlanRequest\(\)/);
});

test('Smart typography and reference controls use the native Mix Studio design language', () => {
  assert.doesNotMatch(smartCss, /ui-monospace|SFMono|--font/);
  assert.match(smartCss, /\.smart-workspace \{[\s\S]{0,160}font-family: inherit/);
  assert.match(smartCss, /\.smart-plan-editor \.smart-select-trigger \{[^}]*font-family: inherit/);
  assert.match(smartCss, /\.smart-reference-inputs-head button \{[^}]*width: 30px[^}]*height: 30px[^}]*border: 1px solid var\(--line\)[^}]*background: rgba\(255,255,255,\.025\)/);
  assert.match(html, /id="smartAddReference"[^>]*aria-label="Add reference images"[^>]*title="Add reference images"/);
});

test('Smart uses app listboxes instead of native selectors throughout plan editing', () => {
  assert.doesNotMatch(app, /<select data-smart-(?:output|subject|scene)-field=/);
  assert.match(app, /function smartSelectMarkup\(/);
  assert.match(app, /class="smart-select-trigger"[\s\S]*aria-haspopup="listbox"/);
  assert.match(app, /class="smart-select-menu"[\s\S]*role="listbox"/);
  assert.match(app, /chooseSmartSelectOption\(selectOption\)/);
  assert.match(app, /\['ArrowDown', 'ArrowUp'\]/);
  assert.match(smartCss, /\.smart-select-menu \{/);
  assert.match(smartCss, /\.smart-select-menu button\[aria-selected="true"\]/);
});

test('Smart brief is unnumbered and recent productions occupy the desktop left column', () => {
  assert.doesNotMatch(html, /<div class="smart-section-label"><span>01<\/span> Creative brief<\/div>/);
  assert.match(html, /class="smart-layout"[\s\S]*class="smart-brief-card"[\s\S]*id="smartBoard"[\s\S]*id="smartRecent"[\s\S]*<\/div>\s*<\/section>/);
  assert.match(smartCss, /\.smart-brief-card \{[^}]*position: static;/);
  assert.doesNotMatch(smartCss, /\.smart-brief-card \{[^}]*position: sticky;/);
  assert.match(smartCss, /\.smart-production-card \{ grid-column: 2; grid-row: 1 \/ span 2; \}/);
  assert.match(smartCss, /\.smart-recent \{ grid-column: 1; grid-row: 2;/);
  assert.match(smartCss, /\.smart-recent-list \{[^}]*grid-template-columns: 1fr/);
  assert.match(smartCss, /\.smart-brief-actions \{[^}]*grid-template-columns: 1fr/);
  assert.match(smartCss, /\.smart-brief-actions > button \{[^}]*max-width: 100%/);
  assert.match(html, /class="smart-brief-input-wrap"[\s\S]*id="smartBriefInput"[\s\S]*class="smart-voice-icon" id="smartVoiceBtn"/);
  assert.doesNotMatch(html, /id="smartVoiceLabel"/);
  assert.match(smartCss, /\.smart-voice-icon \{[^}]*position: absolute;[^}]*right: 10px;[^}]*bottom: 10px;/);
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
