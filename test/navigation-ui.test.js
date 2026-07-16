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

test('desktop Library navigation expands the gallery into the full workspace', () => {
  assert.doesNotMatch(app, /view === 'gallery' && desktopWorkspaceActive\(\)[\s\S]*refreshGallery\(true\)[\s\S]*return;/);
  assert.match(app, /classList\.toggle\('desktop-library-expanded', desktopWorkspaceActive\(\) && state\.view === 'gallery' && !focusedResult\)/);
  assert.match(css, /body\.desktop-library-expanded \.studio-workspace \{[\s\S]*grid-template-columns: 0px minmax\(420px, 1fr\) 0px/);
  assert.match(css, /body\.desktop-library-expanded #view-create,[\s\S]*body\.desktop-library-expanded \.desktop-stage \{[\s\S]*display: none;/);
  assert.match(css, /body\.desktop-library-expanded #view-gallery \.grid \{[\s\S]*repeat\(auto-fill, minmax\(220px, 1fr\)\)/);
});

test('focused results temporarily present Library navigation without changing the underlying mode', () => {
  assert.match(app, /const focusedResult = desktopWorkspaceActive\(\) && document\.body\.classList\.contains\('desktop-focused-result'\)/);
  assert.match(app, /const primaryMode = focusedResult \? 'gallery' : \(createActive \? 'create' : state\.view\)/);
  assert.match(app, /primaryTabButtons\.forEach\(\(button\) => button\.addEventListener\('click', \(\) => \{[\s\S]{0,140}if \(\$\('#lightbox'\)\.classList\.contains\('show'\)\) closeLightbox\(\)/);
  assert.match(app, /document\.body\.classList\.remove\('desktop-focused-result'\);[\s\S]{0,100}if \(restoreDesktopNavigation\) syncNavigation\(\)/);
});

test('desktop inputs provide reversible setup history and completed outputs take focus', () => {
  assert.match(html, /id="desktopInputsBack"[^>]*aria-label="Restore previous generation settings"/);
  assert.match(html, /id="desktopInputsForward"[^>]*aria-label="Restore next generation settings"/);
  assert.match(app, /function captureDesktopInputSetup\(\)/);
  assert.match(app, /function restoreDesktopInputSetup\(snapshot\)/);
  assert.match(app, /checkpointDesktopInputSetup\(\);[\s\S]*selectDesktopLibraryItem/);
  assert.match(app, /function focusCompletedDesktopOutput\(itemId, media = 'image'\)/);
  assert.match(app, /focusCompletedDesktopOutput\(d\.items\[0\]\.id, 'image'\)/);
  assert.match(app, /focusCompletedDesktopOutput\(d\.item\.id, newest\)/);
  assert.match(css, /\.desktop-input-history button/);
});

test('regional prompts only submit from the Region create mode', () => {
  assert.match(app, /if \(state\.createMode !== 'region'\) return \[\]/);
  assert.match(app, /setCreateMode\(button\.dataset\.createMode, button\.dataset\.createMode === 'region'\)/);
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

test('mobile profile control uses a compact vector icon', () => {
  assert.match(html, /id="profileBtn"[\s\S]*class="profile-chip-icon"[\s\S]*id="profileBtnName"/);
  assert.match(app, /\$\('#profileBtnName'\)\.textContent = state\.profile\.name/);
  assert.doesNotMatch(app, /btn\.textContent = `👤/);
  assert.match(css, /@media \(max-width: 420px\) \{[\s\S]*\.profile-chip-icon \{ width: 16px; height: 16px; \}/);
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
  assert.match(html, /data-engine="krea2ref"[^>]*data-task-label="Reference Remix"[^>]*data-model-label="Krea 2 Edit"[^>]*><b>Krea 2 Edit<\/b><small>Reference Remix<\/small>/);
  assert.match(html, /data-engine="krea2"[^>]*data-task-label="Inpaint \+ Outpaint"[^>]*data-model-label="Krea 2"[^>]*><b>Krea 2<\/b><small>Inpaint \+ Outpaint<\/small>/);
});

test('Edit keeps source-matched dimensions by default and exposes a custom output-ratio override', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="editAspectToggle"[^>]*aria-controls="editAspectBody"/);
  assert.match(html, /id="editAspectSummary">Match first image/);
  assert.match(html, /id="editWInput"/);
  assert.match(html, /id="editSizeSeg"[\s\S]*data-edit-mp="0\.75"[\s\S]*data-edit-mp="1"[\s\S]*data-edit-mp="1\.75"/);
  assert.match(app, /editAspectOverride: false/);
  assert.match(app, /editMp: 1/);
  assert.match(app, /function dimensionsForMegapixels\(ratio, megapixels\)/);
  assert.match(app, /#editSizeSeg button[\s\S]*state\.editMp = megapixels;[\s\S]*state\.editAspectOverride = true/);
  assert.match(css, /\.edit-res-meta \{ margin-top: 10px; \}/);
  assert.match(app, /editAspectOverride: mode === 'edit' && state\.editAspectOverride/);
  assert.match(server, /if \(!p\.editAspectOverride\) try/);
  assert.match(server, /if \(p\.editAspectOverride && !p\.editOutpaint\) p\.composite = false/);
});

test('Matching an edit image reports its medium output dimensions', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  assert.doesNotMatch(html, /id="refCount"/);
  assert.match(app, /function matchedEditOutputDimensions\(ref, megapixels = 1\)/);
  assert.match(app, /Match image · M · \$\{matched\.w\} × \$\{matched\.h\}/);
  assert.match(app, /dimensionsForMegapixels\(ratio, megapixels\)/);
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
  assert.match(app, /state\.qwenAngles = angle && QWEN_ANGLE_IDS\.has\(angle\.view\) \? \[angle\.view\] : \[\]/);
  assert.match(app, /restoreKreaMask\(it(?:,\s*\(\) => reuseRequestCurrent\(options\))?\)/);
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
  assert.match(html, /id="lbReferenceImg"/);
  assert.match(app, /referenceWrap\.classList\.add\('reference-preview-active'\)/);
  assert.match(app, /referenceWrap\.classList\.remove\('reference-preview-active'\)/);
  assert.match(app, /await referencePreview\.decode/);
  assert.match(app, /setTimeout\(\(\) => \{[\s\S]*referenceWrap\.classList\.add\('reference-preview-active'\)[\s\S]*\}, 145\)/);
  assert.match(app, /requestAnimationFrame\(\(\) => \{[\s\S]*referencePreview\.classList\.remove\('active'\)/);
  assert.match(css, /\.lightbox-img-wrap\.reference-preview-active #lbImg \{ visibility: hidden; \}/);
  assert.match(app, /referencePreview\.decode\?\.\(\)/);
  assert.match(app, /hb\.classList\.add\('pressed'\)/);
  assert.match(app, /hb\.setAttribute\('aria-pressed', 'true'\)/);
  assert.match(css, /\.lightbox-reference-preview\.active \{ opacity: 1; \}/);
  assert.match(css, /\.action-btn\.hold-preview-action\.pressed/);
  assert.match(app, /Save reference \+ generation/);
  assert.match(app, /saveImageComposite\(it, isEditSource \? 'before-after' : 'reference-generation'\)/);
  assert.match(app, /function existingImageComposite\(item, type\)/);
  assert.match(app, /Downloaded existing \$\{label\} composite/);
  assert.match(server, /type === 'reference-generation'/);
  assert.match(server, /Reference \+ generation/);
  assert.match(server, /sourceFiles: Array\.isArray\(info\.sourceFiles\)/);
  assert.match(server, /existing: true, item: root, composite: existing/);
  assert.match(server, /\['before-after', 'reference-generation', 'depth-map'\]\.includes\(info\.type\)/);
});

test('gallery saves directly when only one image is available and is grouped by date', () => {
  assert.match(app, /function galleryDateLabel\(timestamp\)/);
  assert.match(app, /gallery-date-divider/);
  assert.match(app, /imageSaveItems\.push\(\{ label: 'Save image', icon: 'save', action: \(\) => downloadItem\(it, 'current'\) \}\)/);
  assert.match(app, /if \(imageSaveItems\.length > 1\)/);
  assert.match(app, /mkIcon\('result-save', 'Save image', '', imageSaveItems\[0\]\.action\)/);
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
  assert.match(app, /function previewGalleryDateScroll\(ratio\)/);
  assert.match(app, /function galleryDateRatioForScroll\(scrollY = window\.scrollY\)/);
  assert.match(app, /galleryDateScrub\.dragOffsetY = galleryDateScrub\.startY - thumbY/);
  assert.match(app, /galleryDateScrub\.active && galleryDateScrub\.dragMoved/);
  assert.match(app, /Math\.abs\(event\.clientY - galleryDateScrub\.startY\) < 4/);
  assert.match(app, /function settleGalleryToDate\(index\)/);
  assert.match(app, /settleGalleryToDate\(selectedIndex\)/);
  assert.match(app, /setTimeout\(beginGalleryDateScrub, 180\)/);
  assert.match(app, /setPointerCapture\(event\.pointerId\)/);
  assert.match(app, /event\.key === 'ArrowDown'/);
  assert.match(app, /event\.key === 'Home'/);
  assert.match(app, /window\.addEventListener\('scroll'/);
  assert.match(css, /\.gallery-date-scrubber \{[\s\S]*position: fixed;[\s\S]*touch-action: none;/);
  assert.match(css, /\.gallery-date-scrubber\.is-active,[\s\S]*height: var\(--gallery-scrub-expanded-height/);
  assert.match(css, /\.gallery-date-scrubber\.is-active \.gallery-date-scrubber-label/);
  assert.match(css, /\.gallery-date-scrubber-label \{[\s\S]*font-size: 17px/);
  assert.match(css, /body\.gallery-date-scrubbing #galleryGrid \{[\s\S]*translateX\(-12px\) scale\(0\.94\)/);
});

test('gallery media supports profile-scoped likes by double tap and a likes-only filter', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="likesFilter"[^>]*aria-pressed="false"/);
  assert.match(html, /id="lightboxLikeBurst"/);
  assert.doesNotMatch(html, /<script src="\/lottie_light\.min\.js"><\/script>/);
  assert.match(app, /function handleGalleryTap\(item, card\)/);
  assert.match(app, /function handleLightboxTap\(\)/);
  assert.match(app, /function handleLightboxVideoPointerUp\(event\)/);
  assert.match(app, /lightboxVideoTapUsesControls\(event\)/);
  assert.match(app, /setVideoLiked\(item, video, !video\.liked, \$\('#lightboxLikeBurst'\)\)/);
  assert.match(app, /script\.src = '\/lottie_light\.min\.js'/);
  assert.match(app, /window\.requestIdleCallback\(warmLikeAnimation/);
  assert.match(app, /const animation = lottie\.loadAnimation/);
  assert.match(app, /animationData: whiteLikeAnimationData\(data\)/);
  assert.match(app, /return recolorStaticLottie\(data, \[1, 1, 1, 1\], \[1, 1, 1, 1\]\)/);
  assert.match(app, /function setItemLiked\(item, liked, burstTarget\)/);
  assert.match(app, /playLikeBurst\(burstTarget, liked \? 'like' : 'unlike'\)/);
  assert.match(app, /setTimeout\(renderGrid, liked \? 860 : 520\)/);
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
  assert.match(css, /\.like-burst\.unlike > svg/);
  assert.match(css, /\.like-burst-lottie/);
  assert.match(css, /@keyframes likeBurstParticle/);
  assert.match(css, /\.like-burst\.pop \.like-burst-ring/);
});
