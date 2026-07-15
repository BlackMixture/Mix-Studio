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

function openingTagById(source, id) {
  const match = source.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`));
  assert.ok(match, `expected #${id} to be mounted`);
  return match[0];
}

test('Director is a pinned LTX model workflow and not a navigation destination', () => {
  const directorOption = openingTagById(html, 'directorModelOption');
  assert.match(directorOption, /\bdata-director-entry\b/);
  assert.match(directorOption, /data-feature-engine="video\.ltx"/);
  assert.doesNotMatch(directorOption, /\bdata-engine=/, 'Director must not leak into normal video engine state');
  assert.doesNotMatch(html, /id="directorModeBtn"/);
  assert.match(html, /id="directorWorkspace"[^>]*hidden/);
  assert.doesNotMatch(html, /id="directorBack"/);
  assert.match(openingTagById(html, 'directorModelHeader'), /aria-controls="directorModelBody"/);
  assert.match(openingTagById(html, 'directorModelHeader'), /aria-expanded="false"/);
  assert.match(html, /id="directorModelHeader"[\s\S]{0,400}>LTX Director<[\s\S]{0,180}>Directed Sequences</);
  assert.match(html, /id="directorEngineRow"[^>]*aria-label="Video model"/);
  assert.doesNotMatch(html, /data-(?:primary-mode|create-mode)="director"/);
  assert.match(app, /function openDirectorMode\(project, options = \{\}\)/);
  assert.match(app, /function closeDirectorMode\(\)/);
  assert.match(app, /function renderDirectorModelChoices\(\)/);
  assert.match(app, /closeDirectorMode\(\);[\s\S]{0,100}source\.click\(\)/);
  assert.match(app, /if \(rowId === 'vidEngineRow'\)[\s\S]{0,260}ltxOption\.after\(directorOption\)/);
  assert.match(app, /\$\('#directorModelOption'\)\.addEventListener\('click'[\s\S]{0,260}openDirectorWorkflowChooser\(\)/);
});

test('Director timeline exposes accessible drag and exact-value editing at 24 fps', () => {
  assert.match(app, /const DIRECTOR_FPS = 24/);
  assert.match(app, /const DIRECTOR_MAX_FRAMES = 24000/);
  assert.match(app, /const DIRECTOR_MAX_WINDOW = 480/);
  for (const id of ['directorMainTrack', 'directorAudioTrack', 'directorMotionTrack', 'directorSegmentStart', 'directorSegmentLength', 'directorRangeStart', 'directorRangeLength']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /function startDirectorDrag\(event\)/);
  assert.match(app, /\['ArrowLeft', 'ArrowRight'\]/);
  assert.match(app, /event\.shiftKey \? DIRECTOR_FPS : 1/);
  assert.match(css, /\.director-segment-handle[\s\S]*touch-action: none/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.director-segment-handle \{ width: 18px/);
});

test('Director defaults to a focused Story timeline with progressive disclosure', () => {
  assert.match(html, /<label[^>]*for="directorGlobalPrompt"[^>]*>\s*Overall direction\s*<\/label>/);
  assert.doesNotMatch(html, />\s*Global prompt\s*</);
  assert.doesNotMatch(html, />\s*Main\s*</);
  assert.doesNotMatch(html, />\s*IC guide\s*</);
  assert.doesNotMatch(html, />\s*Marked generation\s*</);

  const addActions = html.match(/<button\b[^>]*id="directorAddBtn"[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.equal(addActions.length, 1, 'Director should expose one primary Add action');
  assert.match(addActions[0], />\s*(?:\+\s*)?Add\s*</);
  assert.match(openingTagById(html, 'directorStoryTrackRow'), /data-director-track="main"/);
  assert.doesNotMatch(openingTagById(html, 'directorStoryTrackRow'), /\bhidden\b/);
  assert.match(html, /id="directorStoryTrackRow"[\s\S]{0,320}id="directorMainTrack"[^>]*aria-label="Story timeline"[\s\S]{0,320}id="directorAddBtn"/);
  assert.doesNotMatch(html, /class="director-track-name"/);

  for (const [id, label] of [['directorAudioTrackRow', 'Audio'], ['directorMotionTrackRow', 'Motion guide']]) {
    assert.match(openingTagById(html, id), /\bhidden\b/, `${label} should be hidden until it contains media`);
    assert.match(html, new RegExp(`id="${id}"[\\s\\S]{0,240}aria-label="${label} timeline"`));
  }
  assert.match(app, /directorAudioTrackRow'\)\.hidden\s*=\s*(?:!project\.audioSegments\.length|project\.audioSegments\.length === 0)/);
  assert.match(app, /directorMotionTrackRow'\)\.hidden\s*=\s*(?:!project\.motionSegments\.length|project\.motionSegments\.length === 0)/);
  assert.match(app, /directorStoryTrackRow'\)\.classList\.toggle\('is-empty', project\.segments\.length === 0\)/);
  assert.match(app, /const timelineEmpty = project\.segments\.length === 0 && project\.audioSegments\.length === 0 && project\.motionSegments\.length === 0/);
  assert.match(app, /directorTimelineViewport'\)\.classList\.toggle\('is-empty', timelineEmpty\)/);
  assert.match(css, /\.director-timeline\.is-empty \.director-timeline-add\s*\{[\s\S]{0,260}position:\s*absolute;\s*inset:\s*0;\s*width:\s*auto/);
  assert.match(html, /id="directorValidationInline"[^>]*role="alert"/);
});

test('Director offers streamlined Extend and Keyframe presets beside the full timeline', () => {
  for (const id of ['directorWorkflowChooser', 'directorChooseExtend', 'directorChooseKeyframes', 'directorChooseTimeline', 'directorModeSwitch', 'directorExtendPreset', 'directorKeyframePreset']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="directorStartSheet"/, 'workflow choice belongs in the Director workspace, not a popup');
  assert.ok(html.indexOf('id="directorWorkflowChooser"') > html.indexOf('id="directorWorkspace"'));
  assert.match(openingTagById(html, 'directorModeSwitch'), /data-active-mode="timeline"/);
  assert.match(html, /class="director-mode-indicator"/);
  assert.match(html, /id="directorChooseExtend"[\s\S]{0,300}<svg/);
  assert.match(html, /id="directorChooseKeyframes"[\s\S]{0,300}<svg/);
  assert.match(html, /id="directorChooseTimeline"[\s\S]{0,300}<svg/);
  for (const label of ['Extend video', 'Keyframe video', 'Timeline']) assert.match(html, new RegExp(`>\\s*${label}\\s*<`));
  assert.match(app, /directorComposerMode: state\.directorComposerMode/);
  assert.match(app, /function openDirectorWorkflowChooser\(\)[\s\S]{0,180}chooseWorkflow: true/);
  assert.match(app, /directorWorkflowChooser'\)\.hidden = !directorChoosingWorkflow/);
  assert.match(app, /function startDirectorWorkflow\(mode\)/);
  assert.match(app, /function switchDirectorWorkflow\(mode\)/);
  assert.match(app, /timeline\.hidden = streamlined/);
  assert.match(app, /segment\.start = ordered\.length === 1 \? 0 : Math\.round\(index \* lastFrame \/ \(ordered\.length - 1\)\)/);
  assert.match(app, /segment\.isEndFrame = ordered\.length > 1 && index === ordered\.length - 1/);
  assert.match(app, /directorComposerMode === 'extend' && !project\.extensionSource\) return 'Choose a video to extend\.'/);
  assert.match(app, /directorComposerMode === 'keyframes'[\s\S]{0,160}return 'Add at least one keyframe\.'/);
});

test('Director media additions reuse the upload-or-gallery source picker', () => {
  assert.match(app, /function directorOpenMediaPicker\(kind\)/);
  assert.match(app, /pickUpload\([\s\S]{0,260}\(asset\) => directorHandlePickedMedia\(asset, kind\)[\s\S]{0,160}\{ multiple \}/);
  assert.match(app, /function directorChooseExtensionSource\(\)[\s\S]{0,900}'Choose a video to extend', \{ galleryReference: true \}\)/);
  assert.match(app, /if \(picker\.galleryReference\)[\s\S]{0,360}srcItemId: asset\.itemId[\s\S]{0,120}srcVideoId: asset\.videoId/);
  assert.match(app, /\$\('#directorAddImage'\)\.addEventListener\('click'[\s\S]{0,180}directorOpenMediaPicker\('image'\)/);
  assert.match(app, /\$\('#directorAddIcVideo'\)\.addEventListener\('click'[\s\S]{0,180}directorOpenMediaPicker\('video'\)/);
});

test('Keyframe preset accepts multi-image picks and supports direct drag reordering', () => {
  for (const id of ['assetPickerMultiBar', 'assetPickerMultiCount', 'assetPickerMultiUse']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /multiple: options\.multiple === true && assetPickerKind\(accept\) === 'image'/);
  assert.match(app, /input\.multiple = options\.multiple === true/);
  assert.match(app, /usePreviousGenerations\(\[\.\.\.assetPickerState\.selected\.values\(\)\]\)/);
  assert.match(app, /state\.directorProject\.segments\.push\(\.\.\.segments\)/);
  assert.match(app, /function wireDirectorKeyframeDrag\(card, list\)/);
  assert.match(app, /directorCommitKeyframeDomOrder\(list\)/);
  assert.match(app, /event\.pointerType === 'touch'[\s\S]{0,100}director-keyframe-grip/);
  assert.match(css, /\.director-keyframe-card\.dragging/);
  assert.match(css, /\.director-keyframe-grip[^}]*touch-action:\s*none/);
});

test('Director has a project-scoped LoRA picker and editable LoRA stack', () => {
  for (const id of ['directorLoraSummary', 'directorAddLora', 'directorLoraList']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /function directorLoras\(\)/);
  assert.match(app, /function renderDirectorLoras\(\)/);
  assert.match(app, /function openDirectorLoraPicker\(\)/);
  assert.match(app, /openLoraPicker\([\s\S]{0,700}title: 'Add Director LoRA'/);
  assert.match(app, /exclude: loras\.map\(\(lora\) => lora\.name\)/);
  assert.match(app, /loras: project\.output\.loras \|\| state\.videoLoras/);
  assert.match(app, /toggle\.setAttribute\('aria-checked', String\(lora\.on\)\)/);
  assert.match(app, /toggle\.innerHTML = '<span class="settings-media-switch"/);
  assert.match(app, /row\.addEventListener\('click', \(event\) => \{[\s\S]{0,100}event\.stopPropagation\(\)[\s\S]{0,100}pick\(name\)/);
  assert.match(css, /\.director-lora-item\.on/);
  assert.match(css, /\.lora-picker-panel\s*\{[^}]*height:\s*min\(620px,calc\(100dvh - 40px\)\)/);
});

test('Selected timeline segments expose contextual add and delete controls outside the segment button', () => {
  for (const id of ['directorSelectionControls', 'directorAddBefore', 'directorSelectionDelete', 'directorAddAfter']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const selectionControlsIndex = html.indexOf('id="directorSelectionControls"');
  const storyLaneIndex = html.indexOf('id="directorMainTrack"');
  assert.ok(selectionControlsIndex > storyLaneIndex, 'selection actions should be a stable canvas overlay');
  assert.match(app, /function directorFindPlacementBefore\(track, beforeFrame, length, excludeId\)/);
  assert.match(app, /function directorOpenAddRelative\(side\)/);
  assert.match(app, /context\.side === 'before'[\s\S]{0,120}directorFindPlacementBefore/);
  assert.match(app, /context\.side === 'after'[\s\S]{0,120}directorFindPlacement/);
  assert.match(app, /directorSelectionDelete'\)\.addEventListener\('click'[\s\S]{0,140}directorDeleteSelected\(\)/);
  assert.match(css, /\.director-selection-controls \.delete\s*\{[\s\S]{0,180}top:\s*-16px;\s*right:\s*-11px/);
  assert.match(css, /\.director-selection-controls \.before\s*\{\s*right:\s*calc\(100% \+ var\(--director-selection-action-gap\)\)/);
  assert.match(css, /\.director-selection-controls \.after\s*\{\s*left:\s*calc\(100% \+ var\(--director-selection-action-gap\)\)/);
  assert.doesNotMatch(css, /\.director-selection-controls\.at-(?:start|end)/);
  assert.match(app, /directorAddBefore'\)\.hidden = atStart/);
  assert.match(app, /directorAddAfter'\)\.hidden = atEnd/);
  assert.match(app, /querySelectorAll\('button:not\(\[hidden\]\)'\)/);
  assert.match(css, /\.director-segment\.compact \.director-segment-handle\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /\.director-track-name/);
  assert.match(css, /\.director-track-lane\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1/);
  assert.match(app, /const segmentRect = segmentNode\.getBoundingClientRect\(\)[\s\S]{0,260}segmentRect\.left - canvasRect\.left/);
});

test('Director groups project, add, timeline, and output controls into focused sheets', () => {
  for (const id of ['directorProjectMenuSheet', 'directorAddSheet', 'directorSettingsSheet']) {
    assert.match(openingTagById(html, id), /class="[^"]*\bsheet\b/);
  }
  for (const [button, sheet] of [
    ['directorProjectMenuBtn', 'directorProjectMenuSheet'],
    ['directorAddBtn', 'directorAddSheet'],
    ['directorSettingsBtn', 'directorSettingsSheet'],
  ]) {
    assert.match(openingTagById(html, button), new RegExp(`aria-controls="${sheet}"`));
  }

  for (const label of ['Timed direction', 'Keyframe', 'Audio', 'Motion guide image', 'Motion guide video']) {
    assert.match(html, new RegExp(`>\\s*(?:\\+\\s*)?${label}\\s*<`));
  }
  for (const label of ['Import', 'Export', 'New', 'About']) assert.match(html, new RegExp(`>\\s*${label}(?: project| Director)?\\s*<`));

  assert.match(html, /id="directorTimelineSettingsBtn"[^>]*aria-controls="directorTimelineSettings"/);
  assert.match(html, /id="directorTimelineSettings"/);
  for (const id of ['directorPlay', 'directorPlayhead', 'directorZoom', 'directorSnap']) assert.match(html, new RegExp(`id="${id}"`));
  assert.ok(html.indexOf('class="director-transport"') > html.indexOf('id="directorTimelineSettings"'), 'transport belongs inside Timeline settings');
});

test('Director uses friendly seconds while retaining exact frame controls under Advanced', () => {
  for (const id of ['directorSegmentStartSeconds', 'directorSegmentDurationSeconds']) {
    const input = openingTagById(html, id);
    assert.match(input, /type="number"/);
    assert.match(input, /step="0\.01"/);
  }
  assert.match(html, /id="directorInspectorAdvancedBtn"[^>]*aria-controls="directorInspectorAdvanced"/);
  assert.match(openingTagById(html, 'directorInspectorAdvanced'), /\bhidden\b/);
  for (const id of ['directorSegmentStart', 'directorSegmentLength', 'directorTrimStart', 'directorAttentionStrength', 'directorEndFrame']) {
    assert.match(html, new RegExp(`id="${id}"`), `Advanced editing should retain #${id}`);
  }

  assert.match(app, /function directorSecondsToFrames\([^)]*\)[\s\S]{0,260}Math\.round\([\s\S]{0,100}\* DIRECTOR_FPS\)/);
  assert.match(app, /function directorFramesToSeconds\([^)]*\)[\s\S]{0,220}DIRECTOR_FPS[\s\S]{0,120}toFixed\(2\)/);
  assert.match(app, /directorSegmentStartSeconds/);
  assert.match(app, /directorSegmentDurationSeconds/);
});

test('Director auto-fit, partial ranges, contextual inspector, and drag gating are explicit behaviors', () => {
  assert.match(app, /function directorUsesPartialRange\(project/);
  assert.match(app, /const partialRange = directorUsesPartialRange\(project\)/);
  assert.match(app, /range\.hidden = !partialRange/);
  assert.match(app, /directorRangeTools'\)\.hidden = !partialRange/);
  assert.match(app, /function directorAutoFitTimeline\(project/);
  assert.match(app, /function directorAutoFitTimeline\(project[\s\S]{0,220}DIRECTOR_MAX_WINDOW/);
  assert.match(app, /directorPixelsPerSecond = directorAutoFitTimeline\(project\)/);
  assert.match(html, /id="directorRangeTools"[^>]*hidden/);
  assert.match(html, /id="directorAutoFit"/);

  assert.match(openingTagById(html, 'directorInspector'), /\bhidden\b/);
  assert.match(openingTagById(html, 'directorEmptyInspector'), /\bhidden\b/);
  assert.match(app, /function directorOpenInspector\(/);
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*#directorInspector|@media \(min-width: 900px\)[\s\S]*\.director-inspector/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*#directorInspector|@media \(max-width: 720px\)[\s\S]*\.director-inspector/);

  assert.match(app, /directorDragMoved/);
  assert.match(app, /directorSuppressClickUntil/);
  assert.match(app, /const dragThreshold = event\.pointerType === 'touch' \? 10 : 6/);
  assert.match(app, /const cancel = \(\) => \{[\s\S]{0,420}segment\.start = original\.start[\s\S]{0,180}renderDirector\(\)/);
  assert.doesNotMatch(app.match(/const cancel = \(\) => \{[\s\S]*?\n\s*\};\n\s*window\.addEventListener\('pointermove'/)?.[0] || '', /directorOpenInspector\(\)/);
  assert.match(app, /directorTimelineCanvas'\)\.addEventListener\('click'[\s\S]{0,240}directorSuppressClickUntil[\s\S]{0,100}return/);
  assert.match(app, /directorTimelineCanvas'\)\.addEventListener\('click'[\s\S]{0,700}directorDeselect\(\)/);
  assert.match(app, /function directorDeselect\(\)[\s\S]{0,180}state\.directorSelection = null;[\s\S]{0,100}directorCloseInspector\(\)/);
  assert.match(openingTagById(html, 'directorInspectorBackdrop'), /aria-label="Deselect segment"/);
  assert.match(app, /directorInspectorBackdrop'\)\.addEventListener\('click', directorDeselect\)/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.director-inspector-backdrop\s*\{[\s\S]{0,220}position:\s*fixed/);
});

test('Director starts populated timelines at a comfortable scrollable scale', () => {
  assert.match(app, /let directorPixelsPerSecond = 320/);
  assert.match(app, /let directorAutoFit = false/);
  assert.match(app, /function directorComfortableTimelineScale\(\)/);
  assert.match(app, /visibleSeconds = window\.innerWidth <= 720 \? 1\.5 : 3\.25/);
  assert.match(app, /function directorUseComfortableTimelineScale\(\)[\s\S]{0,220}directorAutoFit = false[\s\S]{0,220}directorComfortableTimelineScale\(\)/);
  assert.match(app, /openDirectorMode\(project, options = \{\}\)[\s\S]{0,1200}directorWorkspace'\)\.hidden = false;[\s\S]{0,120}directorUseComfortableTimelineScale\(\)/);
  assert.match(css, /\.director-timeline\s*\{[^}]*overflow-x:\s*auto[^}]*scrollbar-gutter:\s*stable/);
  assert.doesNotMatch(css, /\.director-workspace\.auto-fit \.director-timeline-canvas\s*\{[^}]*width:\s*100%\s*!important/);
  const autoFit = openingTagById(html, 'directorAutoFit');
  assert.match(autoFit, /role="switch"/);
  assert.match(autoFit, /aria-checked="false"/);
  assert.doesNotMatch(autoFit, /\schecked(?:\s|=|>)/);
  const zoom = openingTagById(html, 'directorZoom');
  assert.match(zoom, /min="80"/);
  assert.match(zoom, /max="960"/);
  assert.match(zoom, /value="320"/);
});

test('Director settings use centered app-native animated switches', () => {
  assert.match(openingTagById(html, 'directorSettingsSheet'), /\bdirector-modal-sheet\b/);
  for (const id of ['directorFourK', 'directorContinueAudio', 'directorInpaintAudio', 'directorOverrideAudio', 'directorAutoFit', 'directorSnap', 'directorEndFrame']) {
    const control = openingTagById(html, id);
    assert.match(control, /<button\b/);
    assert.match(control, /role="switch"/);
    assert.match(control, /aria-checked="(?:true|false)"/);
  }
  assert.doesNotMatch(html.match(/<div class="sheet director-sheet director-modal-sheet" id="directorSettingsSheet">[\s\S]*?<\/div>\s*<\/div>\s*<div class="sheet/s)?.[0] || '', /type="checkbox"/);
  assert.match(app, /function wireDirectorToggle\(id, onChange\)/);
  assert.match(css, /\.director-modal-sheet\s*\{[^}]*align-items:\s*center/);
  assert.match(css, /\.director-setting-toggle\[aria-checked="true"\]/);
  assert.match(css, /\.director-settings-advanced\[open\][\s\S]{0,260}rotate\(45deg\)/);
});

test('Director gives instant keyframes usable controls without changing frame precision', () => {
  assert.match(app, /const DIRECTOR_TIMELINE_ACTION_GUTTER = 96/);
  assert.match(app, /function directorSegmentVisualWidth\(segment, ppf\)/);
  assert.match(app, /instantWidth = window\.innerWidth <= 720 \? 72 : 80/);
  assert.match(app, /segment\.type === 'image' && segment\.length <= 1 \? instantWidth : 12/);
  assert.match(app, /button\.style\.width = `\$\{directorSegmentVisualWidth\(segment, ppf\)\}px`/);
  assert.match(app, /button\.classList\.toggle\('compact', segment\.length \* ppf < 40\)/);
  assert.match(app, /project\.durationFrames \* ppf \+ DIRECTOR_TIMELINE_ACTION_GUTTER/);
  assert.match(css, /\.director-segment\.instant::after/);
  assert.match(app, /thumbnail\.className = 'director-segment-thumbnail'/);
  assert.match(app, /thumbnail\.src = `\/api\/input\?name=\$\{encodeURIComponent\(segment\.imageFile\)\}`/);
  assert.match(app, /if \(segment\.type === 'image'\)[\s\S]{0,900}button\.append\(thumbnail, fallback\)/);
  assert.match(css, /\.director-segment-thumbnail\s*\{[^}]*object-fit:\s*cover/);
  assert.match(app, /function directorRevealSelection\(\)/);
  assert.match(app, /const visibleLeft = viewportRect\.left \+ 8/);
  assert.match(app, /directorSelect\(track, segment\.id, \{ openInspector: false, reveal: false \}\)/);
  assert.match(app, /requestAnimationFrame\(directorRevealSelection\)/);
});

test('Director has a compact full-sequence or selected-range generation footer', () => {
  assert.match(html, /<footer[^>]*class="[^"]*director-summary[^"]*"/);
  assert.match(html, /id="directorSummaryLabel"/);
  assert.match(html, /id="directorGenerate"[^>]*>\s*Generate Video\s*<\/button>/);
  assert.match(app, /directorSummaryLabel/);
  assert.match(app, /(?:Full sequence|Selected range)/);
  assert.match(app, /button\.textContent = project\.extensionSource \? 'Generate Extension' : 'Generate Video'/);
  assert.match(css, /\.director-summary\s*\{[^}]*position:\s*sticky;[^}]*bottom:/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.director-summary\s*\{\s*position:\s*static;\s*bottom:\s*auto/);
});

test('Director projects autosave, import, export, preflight media, and restore from gallery metadata', () => {
  assert.match(app, /profileStorageKey\('ks-director'\)/);
  assert.match(app, /directorProject: directorSerializableProject\(\)/);
  assert.match(app, /directorNormalizeClientProject\(JSON\.parse\(await file\.text\(\)\)\)/);
  assert.match(app, /new Blob\(\[.*JSON\.stringify\(directorSerializableProject\(\)/s);
  assert.match(app, /api\('\/api\/director\/assets'/);
  assert.match(app, /directorMissingAssets\.has\(assetName\)/);
  assert.match(app, /info\.workflow === 'director' && info\.directorProject/);
  assert.match(app, /if \(info\?\.workflow === 'director'\) return 'LTX 2\.3 Director'/);
  assert.match(server, /route === '\/api\/director\/assets'/);
  assert.match(server, /route === '\/api\/director\/generate'/);
  assert.match(server, /workflow: 'director',/);
  assert.match(server, /const directorProject = Object\.assign/);
});

test('Director generation remains a separate dependency and uses literal prompts', () => {
  assert.match(app, /if \(state\.directorOpen\) components\.add\('ltxdirector'\)/);
  assert.match(app, /api\('\/api\/director\/generate'/);
  assert.match(server, /ltxdirector: \['LTXDirector', 'LTXDirectorGuide', 'LTXDirectorCropGuides'\]/);
  assert.match(server, /enhance: false/);
  assert.match(html, /WhatDreamsCost \(GPL-3\.0\)/);
  assert.match(html, /LTX-2\.3-22b-IC-LoRA-Ingredients/);
});
