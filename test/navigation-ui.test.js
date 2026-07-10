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

test('navigation has primary modes and nested Create modes', () => {
  assert.match(html, /id="primaryTabs"[\s\S]*data-primary-mode="create"[^>]*>Create[\s\S]*data-primary-mode="edit"[^>]*>Edit[\s\S]*data-primary-mode="gallery"[^>]*>Library/);
  assert.match(html, /id="createTabs"[\s\S]*data-create-mode="image"[^>]*>[\s\S]*<span>Image<\/span>[\s\S]*data-create-mode="region"[^>]*>[\s\S]*<span>Region<\/span>[\s\S]*data-create-mode="video"[^>]*>[\s\S]*<span>Video<\/span>/);
  assert.match(app, /function setCreateMode\(mode, openEditor\)/);
  assert.match(app, /const createActive = state\.view === 'create' \|\| state\.view === 'video'/);
});

test('regional prompts only submit from the Region create mode', () => {
  assert.match(app, /if \(state\.createMode !== 'region'\) return \[\]/);
  assert.match(app, /setCreateMode\('region', true\)/);
});

test('nested Create modes use icons instead of color dots', () => {
  assert.match(html, /data-create-mode="image"[^>]*>[\s\S]*<svg/);
  assert.match(html, /data-create-mode="region"[^>]*>[\s\S]*<svg/);
  assert.match(html, /data-create-mode="video"[^>]*>[\s\S]*<svg/);
  assert.match(css, /\.create-tabs \.tab::before \{ display: none; \}/);
});

test('modes drive color tokens and prompt input lighting', () => {
  for (const mode of ['image', 'region', 'video', 'edit', 'library']) {
    assert.match(css, new RegExp(`body\\[data-ui-mode="${mode}"\\]`));
  }
  assert.match(css, /linear-gradient\(135deg, rgba\(var\(--mode-rgb\), 0\.075\), transparent 54%\)/);
  assert.match(app, /document\.body\.dataset\.uiMode/);
});

test('primary navigation uses the neutral Modatory glow treatment', () => {
  assert.match(css, /\.primary-tabs \{ background: #000; \}/);
  assert.match(css, /\.primary-tabs \.tab::before \{ display: none; \}/);
  assert.match(css, /\.primary-tabs \.tab-pill \{[\s\S]*background: rgba\(255,255,255,0\.06\)/);
  assert.match(css, /\.primary-tabs \.tab-pill::after/);
});

test('only the Resolution section keeps an outer panel surface', () => {
  assert.match(css, /--page-bg: #000/);
  assert.match(css, /\.panel \{[\s\S]*border: 0;/);
  assert.match(css, /#view-create > \.panel:not\(\.res-panel\) \{[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
  assert.match(css, /\.prompt-composer \{[\s\S]*border: 1px solid var\(--line\)/);
});

test('Resolution expands with an accessible motion transition', () => {
  assert.match(html, /id="resBody" aria-hidden="true" inert>[\s\S]*class="res-body-inner"/);
  assert.match(css, /\.res-body \{[\s\S]*grid-template-rows: 0fr;[\s\S]*transition:/);
  assert.match(css, /\.res-panel\.expanded \.res-body \{[\s\S]*grid-template-rows: 1fr;/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(app, /body\.inert = !expand/);
  assert.match(app, /body\.setAttribute\('aria-hidden', String\(!expand\)\)/);
});

test('Advanced uses the same animated accessible disclosure pattern', () => {
  assert.doesNotMatch(html, /<details class="adv">/);
  assert.match(html, /id="advHeader"[^>]*aria-expanded="false"[^>]*aria-controls="advBody"/);
  assert.match(html, /id="advBody" aria-hidden="true" inert/);
  assert.match(css, /\.adv-body \{[\s\S]*grid-template-rows: 0fr;[\s\S]*transition:/);
  assert.match(css, /\.adv\.expanded \.adv-body \{[\s\S]*grid-template-rows: 1fr;/);
  assert.match(app, /function setAdvancedExpanded\(open\)/);
});

test('LoRAs use the same animated accessible disclosure pattern', () => {
  assert.match(html, /id="loraHeader"[^>]*aria-expanded="false"[^>]*aria-controls="loraBody"/);
  assert.match(html, /id="loraBody" aria-hidden="true" inert/);
  assert.match(html, /id="loraSummary">None selected/);
  assert.match(css, /\.lora-body \{[\s\S]*grid-template-rows: 0fr;[\s\S]*transition:/);
  assert.match(css, /\.lora-disclosure\.expanded \.lora-body \{[\s\S]*grid-template-rows: 1fr;/);
  assert.match(app, /function setLorasExpanded\(open\)/);
  assert.match(app, /summary\.textContent = active \? `\$\{active\} active`/);
});

test('edit prompts can insert uploaded references as visual @-mention tokens', () => {
  assert.match(html, /id="promptComposer"[^>]*contenteditable="true"/);
  assert.match(html, /id="promptMentionSheet"/);
  assert.doesNotMatch(html, /Tip: reference them in your prompt by number/);
  assert.match(app, /function openPromptMentionPicker\(\)/);
  assert.match(app, /event\.data === '@'/);
  assert.match(app, /function promptForGeneration\(\)[\s\S]*@image-\(\\d\+\)/);
  assert.match(css, /\.prompt-ref-token \{/);
});

test('edit model choices settle into place and Preserve unchanged has its own toggle treatment', () => {
  assert.match(css, /@keyframes editEngineSettle/);
  assert.match(css, /\.edit-engine-row \.chip\.active \{[\s\S]*animation: editEngineSettle/);
  assert.match(html, /class="icon-btn preserve-icon" id="editComposite"[^>]*aria-pressed="false"/);
  assert.match(html, /title="Preserve unchanged areas"/);
  assert.match(css, /\.preserve-icon\[aria-pressed="true"\]/);
  assert.match(app, /#editComposite'\)\.addEventListener\('click'/);
  assert.match(html, /data-engine="krea2ref"[^>]*>Krea 2 Edit/);
});

test('Edit keeps source-matched dimensions by default and exposes a custom output-ratio override', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="editAspectToggle"[^>]*aria-controls="editAspectBody"/);
  assert.match(html, /id="editAspectSummary">Match first image/);
  assert.match(html, /id="editWInput"/);
  assert.match(app, /editAspectOverride: false/);
  assert.match(app, /editAspectOverride: mode === 'edit' && state\.editAspectOverride/);
  assert.match(server, /if \(!p\.editAspectOverride\) try/);
  assert.match(server, /if \(p\.editAspectOverride\) p\.composite = false/);
});

test('Matching an edit image reports its derived one-megapixel output dimensions', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  assert.doesNotMatch(html, /id="refCount"/);
  assert.match(app, /function matchedEditOutputDimensions\(ref\)/);
  assert.match(app, /Match image · \$\{matched\.w\} × \$\{matched\.h\}/);
  assert.match(app, /Math\.sqrt\(1e6 \* ratio\)/);
});

test('Use settings rehydrates every saved edit input instead of asking for manual re-upload', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(app, /async function reuseItem\(it, useEnhanced\)/);
  assert.match(app, /async function restoreEditReferences\(item\)/);
  assert.match(app, /fetch\('\/api\/input\?name=' \+ encodeURIComponent\(name\)\)/);
  assert.match(app, /state\.refs = refs/);
  assert.match(app, /state\.editLoras = restoredLoraList\(it\.loras\)/);
  assert.match(app, /state\.regions = restoringEdit \? state\.regions : restoredRegions/);
  assert.match(app, /state\.editAspectOverride = it\.editAspectOverride === true/);
  assert.match(app, /state\.qwenAngles = angle \? \[angle\.view\] : \[\]/);
  assert.match(app, /restoreKreaMask\(it\)/);
  assert.match(server, /editAspectOverride: job\.params\.mode === 'edit'/);
  assert.match(server, /maskImageName: job\.params\.mode === 'edit'/);
  assert.match(server, /batch: job\.params\.batch/);
});

test('create and edit image workflows can queue an optional SeedVR2 finish pass', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="editUpscaleToggle"[^>]*aria-pressed="false"/);
  assert.match(html, /id="editUpscaleDetails"[^>]*aria-controls="editUpscaleBody"/);
  assert.match(html, /class="edit-upscale-title"[^>]*>[\s\S]*?Upscale<\/span>/);
  assert.doesNotMatch(html, />SeedVR2 finish<\/span>/i);
  assert.match(html, /id="editUpscaleResolution"/);
  assert.match(html, /class="edit-upscale-icon"/);
  assert.match(app, /function renderEditUpscale\(\)/);
  assert.match(app, /const expanded = enabled && state\[`\$\{settings\.prefix\}UpscaleExpanded`\] === true/);
  assert.match(app, /#editUpscaleDetails'\)\.addEventListener\('click'/);
  assert.match(app, /if \(enabled\) state\[`\$\{prefix\}UpscaleExpanded`\] = false;/);
  assert.match(app, /createUpscaleEnabled: false/);
  assert.match(app, /postUpscale: upscaleFinish\.enabled/);
  assert.match(app, /state\.createUpscaleEnabled = !!it\.postUpscale/);
  assert.match(app, /state\.editUpscaleEnabled = !!it\.postUpscale/);
  assert.match(server, /function normalizePostUpscale\(value\)/);
  assert.match(server, /async function queuePostUpscale\(item, options, profileId\)/);
  assert.match(server, /p\.mode === 'edit' \|\| p\.mode === 't2i' \? normalizePostUpscale/);
  assert.match(server, /await queuePostUpscale\(item, job\.params\.postUpscale, job\.profileId\)/);
});

test('each edit model remembers its own selected LoRAs', () => {
  assert.match(app, /editLorasByEngine: \{\}/);
  assert.match(app, /function switchEditEngine\(engine\)/);
  assert.match(app, /state\.editLorasByEngine\[editEngineId\(state\.editEngine\)\] = state\.editLoras/);
  assert.match(app, /editLorasByEngine: state\.editLorasByEngine/);
  assert.match(app, /switchEditEngine\(engine\);/);
});

test('installer-selected engines are hidden from the corresponding app controls', () => {
  assert.match(html, /data-feature-engine="edit\.qwen"/);
  assert.match(html, /data-feature-engine="video\.eros"/);
  assert.match(html, /data-feature-view="edit"/);
  assert.match(html, /data-feature-view="video"/);
  assert.match(app, /function renderFeatureVisibility\(\)/);
  assert.match(app, /state\.features = lastMeta\.features \|\| \{\}/);
  assert.match(server, /This edit model was not installed on this machine/);
  assert.match(server, /This video model was not installed on this machine/);
});

test('an edit can save its original and result as a gallery side-by-side', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(app, /Save before \+ after/);
  assert.match(app, /const imageSaveItems = \[\]/);
  assert.match(app, /mkMenu\('Save', '', imageSaveItems/);
  assert.match(app, /saveImageComposite\(it, isEditSource \? 'before-after' : 'reference-generation'\)/);
  assert.match(server, /type === 'before-after'/);
  assert.match(server, /sources = \[root\.sourceFile, root\.upscaled \|\| root\.file\]/);
  assert.match(server, /kind: 'imageComposite'/);
  assert.match(server, /mode: 'composite'/);
  assert.match(server, /parent\.composites = \(Array\.isArray\(parent\.composites\)/);
  assert.match(server, /broadcast\('imageCompositeDone'/);
  assert.match(app, /es\.addEventListener\('imageCompositeDone'/);
  assert.match(app, /'composite:' \+ d\.composite\.id/);
});

test('image-to-image generations retain their reference for hold-preview and a grouped composite', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(app, /it\.mode === 'edit' \|\| it\.mode === 't2i'/);
  assert.match(app, /Hold: reference/);
  assert.match(app, /Save reference \+ generation/);
  assert.match(app, /saveImageComposite\(it, isEditSource \? 'before-after' : 'reference-generation'\)/);
  assert.match(app, /function existingImageComposite\(item, type\)/);
  assert.match(app, /Downloaded existing \$\{label\} composite/);
  assert.match(server, /type === 'reference-generation'/);
  assert.match(server, /Reference \+ generation/);
  assert.match(server, /sourceFiles: Array\.isArray\(info\.sourceFiles\)/);
  assert.match(server, /existing: true, item: root, composite: existing/);
  assert.match(server, /\['before-after', 'reference-generation'\]\.includes\(info\.type\)/);
});

test('gallery saves directly when only one image is available and is grouped by date', () => {
  assert.match(app, /function galleryDateLabel\(timestamp\)/);
  assert.match(app, /gallery-date-divider/);
  assert.match(app, /imageSaveItems\.push\(\{ label: 'Save image', icon: 'save', action: \(\) => downloadItem\(it, 'current'\) \}\)/);
  assert.match(app, /if \(imageSaveItems\.length > 1\)/);
  assert.match(app, /mk\('↓ Save', '', imageSaveItems\[0\]\.action\)/);
  assert.match(app, /if \(it\.upscaled\) \{/);
  assert.match(app, /function downloadComposite\(it, composite\)/);
  assert.match(app, /attached-composite-badge/);
  assert.match(css, /\.gallery-date-divider/);
  assert.match(css, /\.card \.badge\.attached-composite-badge/);
});

test('gallery exposes a draggable date scrubber with keyboard navigation', () => {
  assert.match(html, /id="galleryDateScrubber"[^>]*role="slider"[^>]*aria-orientation="vertical"/);
  assert.match(html, /id="galleryDateScrubberLabel"/);
  assert.match(app, /function syncGalleryDateScrubber\(\)/);
  assert.match(app, /function scrubGalleryDateAt\(clientY, haptic = true\)/);
  assert.match(app, /function setGalleryDateScrubberRatio\(ratio, haptic = false\)/);
  assert.match(app, /scrollGalleryToDate\(selectedIndex, 'smooth'\)/);
  assert.match(app, /setTimeout\(beginGalleryDateScrub, 180\)/);
  assert.match(app, /setPointerCapture\(event\.pointerId\)/);
  assert.match(app, /event\.key === 'ArrowDown'/);
  assert.match(app, /event\.key === 'Home'/);
  assert.match(app, /window\.addEventListener\('scroll'/);
  assert.match(css, /\.gallery-date-scrubber \{[\s\S]*position: fixed;[\s\S]*touch-action: none;/);
  assert.match(css, /\.gallery-date-scrubber\.is-active,[\s\S]*height: var\(--gallery-scrub-expanded-height/);
  assert.match(css, /\.gallery-date-scrubber\.is-active \.gallery-date-scrubber-label/);
  assert.match(css, /body\.gallery-date-scrubbing #galleryGrid \{[\s\S]*translateX\(-12px\) scale\(0\.94\)/);
});

test('gallery media supports profile-scoped likes by double tap and a likes-only filter', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="likesFilter"[^>]*aria-pressed="false"/);
  assert.match(html, /id="lightboxLikeBurst"/);
  assert.match(app, /function handleGalleryTap\(item, card\)/);
  assert.match(app, /function handleLightboxTap\(\)/);
  assert.match(app, /function setItemLiked\(item, liked, burstTarget\)/);
  assert.match(app, /playLikeBurst\(burstTarget, liked \? 'like' : 'unlike'\)/);
  assert.match(app, /setTimeout\(renderGrid, liked \? 720 : 520\)/);
  assert.match(app, /if \(state\.likesOnly && !it\.liked\)/);
  assert.match(app, /videoLiked = \(it\.videos \|\| \[\]\)\.some/);
  assert.match(app, /const likedIds = new Set\(arr\.map\(\(it\) => it\.id\)\)/);
  assert.match(app, /likedIds\.has\(it\.id\)[\s\S]*likedAngleGroups\.has\(it\.angleGroupId\)/);
  assert.match(app, /function setVideoLiked\(item, video, liked, burstTarget\)/);
  assert.match(app, /heart: '<path fill="none" stroke="currentColor"/);
  assert.match(app, /function syncLightboxLikeButton\(liked, label\)/);
  assert.match(server, /video\.liked = body\.liked === true/);
  assert.match(app, /like-toggle/);
  assert.match(app, /heart-fill/);
  assert.match(app, /Save angle composite/);
  assert.match(server, /const likeRoute = route\.match\(/);
  assert.match(server, /likeRoute && req\.method === 'POST'/);
  assert.match(server, /item\.liked = body\.liked === true/);
  assert.match(css, /@keyframes unlikeBurst/);
  assert.match(css, /\.like-burst\.unlike svg/);
});
