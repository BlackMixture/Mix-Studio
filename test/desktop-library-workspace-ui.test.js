const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('desktop library cards load their media and saved settings into the workspace', () => {
  assert.match(app, /function setDesktopLibraryStageSelection\(item, media = 'image'\)/);
  assert.match(app, /state\.desktopItemId = item\.id;[\s\S]{0,180}renderDesktopStage\(item, state\.desktopMediaId\);[\s\S]{0,80}syncDesktopGallerySelection\(\)/);
  assert.match(app, /function selectDesktopLibraryItem\(item, media = 'image'\)/);
  assert.match(app, /const video = setDesktopLibraryStageSelection\(item, media\)/);
  assert.match(app, /const preserveFocusedResult = desktopWorkspaceActive\(\) && \$\('#lightbox'\)\.classList\.contains\('show'\)/);
  assert.match(app, /if \(preserveFocusedResult\) openLightbox\(item\.id, state\.desktopMediaId\)/);
  assert.match(app, /const reuseOptions = \{ desktopToken: token, silent: true, preserveLightbox: preserveFocusedResult \}/);
  assert.match(app, /reuseVideo\(item, video, reuseOptions\)/);
  assert.match(app, /reuseItem\(item, false, reuseOptions\)/);
  assert.ok((app.match(/if \(!options\.preserveLightbox\) closeLightbox\(\);/g) || []).length >= 2);
  assert.match(app, /desktopWorkspaceActive\(\) && \(\$\('#lightbox'\)\.classList\.contains\('show'\) \|\| state\.view !== 'gallery'\)/);
  const fullLibraryTap = app.match(/function handleGalleryTap\(item, card\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(fullLibraryTap, /openLightbox\(item\.id, media\)/);
  assert.match(fullLibraryTap, /state\.desktopReuseToken \+= 1;[\s\S]{0,80}setDesktopLibraryStageSelection\(item, media\)/);
  assert.ok(fullLibraryTap.indexOf('setDesktopLibraryStageSelection(item, media)') < fullLibraryTap.indexOf('openLightbox(item.id, media, { focusSource })'));
  assert.doesNotMatch(fullLibraryTap, /selectDesktopLibraryItem/);
  assert.match(app, /syncDesktopGallerySelection\(\)/);
  assert.match(css, /\.card\.desktop-active:not\(\.selected\)/);
});

test('full Library taps use a fast shared-origin focused transition on desktop and tablet layouts', () => {
  const fullLibraryTap = app.match(/function handleGalleryTap\(item, card\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(fullLibraryTap, /desktopWorkspaceActive\(\) && document\.body\.classList\.contains\('desktop-library-expanded'\)/);
  assert.match(fullLibraryTap, /stopDesktopGalleryLayoutTransition\(\)/);
  assert.match(fullLibraryTap, /captureDesktopSharedFocusSource\(card\)/);
  assert.match(fullLibraryTap, /openLightbox\(item\.id, media, \{ focusSource \}\);\s*return;/);
  assert.ok(fullLibraryTap.indexOf('openLightbox(item.id, media, { focusSource })') < fullLibraryTap.indexOf('const now = Date.now()'));
  assert.match(app, /function startDesktopSharedFocusTransition\(source\)/);
  assert.match(app, /duration: 135/);
  assert.match(app, /function waitForDesktopFocusedMedia\(maxWait = 120\)/);
  assert.match(app, /await waitForDesktopFocusedMedia\(\)/);
  assert.match(app, /document\.body\.classList\.remove\('desktop-shared-focus-active'\);[\s\S]{0,180}\{ opacity: 1 \},[\s\S]{0,40}\{ opacity: 0 \}/);
  assert.match(app, /duration: 50,[\s\S]{0,40}easing: 'linear'/);
  assert.match(app, /function cascadeFocusedLibraryRail\(\)/);
  assert.match(app, /duration: 85,[\s\S]{0,80}delay: index \* 7/);
  assert.match(app, /libraryWasExpanded !== libraryExpanded && !focusFromExpandedLibrary/);
  assert.match(css, /body\.desktop-focus-from-library \.studio-workspace,[\s\S]*body\.desktop-focus-from-library #view-gallery \{[\s\S]*transition: none;/);
  assert.match(css, /body\.desktop-focus-from-library #lightbox\.show \{ animation: none; \}/);
  assert.match(css, /body\.desktop-shared-focus-active #lightbox \.lightbox-img-wrap \{ opacity: 0; \}/);
  assert.match(css, /#lightbox \.lightbox-img-wrap \{[\s\S]*transition: opacity 50ms linear;/);
  assert.match(css, /will-change: transform, border-radius, opacity;/);
  assert.match(css, /focusedDetailsFastIn 90ms 38ms/);
});

test('desktop stage exposes an explicit focused-view information action', () => {
  assert.match(html, /id="desktopStageInfo"[^>]*aria-label="View generation details"/);
  assert.match(app, /\$\('#desktopStageInfo'\)\.addEventListener\('click'/);
  assert.match(app, /openLightbox\(info\.dataset\.itemId, info\.dataset\.media \|\| 'image'\)/);
});

test('desktop navigation and focused viewer align to the three-column workspace', () => {
  assert.match(css, /\.primary-tabs \{[\s\S]*position: absolute;[\s\S]*left: calc\(var\(--studio-left-width\) \+ 15px\);[\s\S]*right: calc\(var\(--studio-right-width\) \+ 15px\)/);
  assert.match(css, /\.create-tabs \{[\s\S]*grid-column: 1;[\s\S]*grid-row: 1;/);
  assert.match(css, /body\.desktop-focused-result \.tabs-wrap,[\s\S]*body\.desktop-focused-result \.studio-workspace \{[\s\S]*grid-template-columns: 0px calc\(100% - var\(--studio-right-width\) - 2px\) var\(--studio-right-width\)/);
  assert.match(css, /body\.desktop-focused-result \.create-tabs \{[\s\S]*opacity: 0;[\s\S]*translateX\(calc\(-100% - 18px\)\)/);
  assert.match(css, /#lightbox \{[\s\S]*inset: 122px var\(--studio-right-width\) 0 0;/);
  assert.match(css, /#lightbox\.show \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*grid-template-rows: auto auto minmax\(0, 1fr\) auto auto;/);
  assert.match(css, /#lightbox \.lightbox-img-wrap \{[\s\S]*grid-column: 1;[\s\S]*grid-row: 3;/);
  assert.match(css, /#lightbox \.lightbox-meta \{[\s\S]*grid-column: 1;[\s\S]*grid-row: 4;/);
  assert.match(css, /#lightbox #lbActions \{[\s\S]*grid-row: 5;[\s\S]*justify-content: flex-start;[\s\S]*flex-wrap: nowrap;[\s\S]*overflow-x: auto;/);
  assert.match(css, /#lightbox #lbActions > :first-child \{ margin-left: auto; \}/);
  assert.match(css, /#lightbox #lbActions > :last-child \{ margin-right: auto; \}/);
  assert.match(app, /document\.body\.classList\.add\('desktop-focused-result'\)/);
  assert.match(app, /document\.body\.classList\.remove\('desktop-focused-result'\)/);
  assert.match(app, /const primaryMode = focusedResult \? 'gallery' : \(createActive \? 'create' : state\.view\)/);
  assert.match(app, /for \(const element of \[\$\('#view-create'\), \$\('#createTabs'\), \$\('\.desktop-stage'\), \$\('#genDock'\)\]\)/);
  assert.match(app, /const workspaceObscured = focusedResult \|\| libraryExpanded/);
  assert.match(app, /element\.inert = workspaceObscured/);
  assert.match(app, /lightboxReturnFocus = document\.activeElement instanceof HTMLElement/);
  assert.match(app, /focusIconControlSilently\(\$\('#lbClose'\)\)/);
  assert.match(app, /focusIconControlSilently\(returnFocus\)/);
});

test('desktop gallery items drag onto compatible generation inputs', () => {
  assert.match(app, /card\.classList\.toggle\('desktop-drag-source', desktopWorkspaceActive\(\)\)/);
  assert.match(app, /preview\.draggable = false/);
  assert.match(app, /img\.draggable = false/);
  assert.match(app, /card\.addEventListener\('dragstart', \(event\) => event\.preventDefault\(\)\)/);
  assert.match(app, /function beginDesktopGalleryPointerDrag\(candidate, event\)/);
  assert.match(app, /function updateDesktopGalleryPointerDrag\(event\)/);
  assert.match(app, /function finishDesktopGalleryPointerDrag\(event, shouldDrop\)/);
  assert.match(app, /dx < -10 && Math\.abs\(dx\) > Math\.abs\(dy\) \* 0\.65/);
  assert.match(app, /movedOutAfterHold = desktopPointerCandidate\.selectionStarted && e\.clientX < galleryLeft - 6/);
  assert.match(app, /stopGallerySelectionDrag\(e\);[\s\S]*exitSelect\(\)/);
  assert.match(app, /function applyDesktopGalleryDrop\(target, drag, event\)/);
  assert.match(app, /finishDesktopGalleryPointerDrag\(event, shouldDrop\)[\s\S]{0,700}applyDesktopGalleryDrop\(target, drag, event\)/);
  assert.match(app, /#view-create'\)\.addEventListener\('drop'[\s\S]{0,700}applyDesktopGalleryDrop\(target, drag, event\)/);
  assert.match(app, /#createImageGuideAdd/);
  assert.match(app, /\.ref-slot/);
  assert.match(app, /#vidAttachBtn/);
  assert.match(app, /#vidDriveBtn/);
  assert.match(app, /sendVideoAsDrive\(item, video, \{ preserveEngine: true \}\)/);
  assert.match(css, /\.gallery-drop-ready/);
  assert.match(css, /\.gallery-drop-active/);
  assert.match(css, /\.desktop-gallery-drag-ghost/);
});

test('desktop empty stage avoids redundant layout instructions', () => {
  assert.doesNotMatch(html, /Build on the left\. Recent work stays within reach on the right\./);
});

test('desktop results expose a full icon action row and can be unloaded safely', () => {
  assert.match(html, /id="desktopStageClear"[^>]*Unload result and clear generation settings/);
  assert.match(html, /id="desktopStageActions"/);
  assert.match(html, /id="desktopStageLike"/);
  assert.match(html, /id="desktopStageSave"/);
  for (const id of ['desktopStageEdit', 'desktopStageUpscale', 'desktopStageExtend', 'desktopStageMove', 'desktopStageDelete']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /function clearDesktopStageSelection\(\)/);
  assert.match(app, /function resetActiveGenerationForm\(\)/);
  assert.match(app, /state\.desktopStageDismissed = true/);
  assert.doesNotMatch(app, /Image settings loaded/);
  assert.match(css, /\.desktop-generate-row \{ display: block;/);
  assert.ok(html.indexOf('id="desktopStageActions"') < html.indexOf('id="genDock"'));
  assert.match(css, /\.desktop-stage-actions button/);
  assert.match(css, /\.desktop-stage-actions button\[hidden\] \{ display: none; \}/);
  assert.match(app, /function desktopStageSaveMenuItems\(item, video\)/);
  assert.match(app, /extend\.hidden = item\.mode === 'composite' \|\| videoComposite/);
  assert.match(app, /else if \(!video && item\.mode !== 'composite'\) openAnimateRouteSheet\(item\)/);
  assert.match(app, /desktopStageDelete'\)\.addEventListener\('click', async/);
});

test('focused gallery reuses the center-stage result icons', () => {
  for (const icon of ['result-use', 'result-process', 'result-extend', 'result-move', 'result-save', 'result-delete']) {
    assert.match(app, new RegExp(`'${icon}': '<path`));
  }
  assert.match(app, /const mkIcon = \(icon, label, cls, fn, options = \{\}\) => mk\(/);
  assert.match(app, /class="result-action-label">\$\{escapeHtml\(options\.mobileLabel \|\| label\)\}/);
  assert.match(app, /options\.iconOnly \? `\$\{actionIconMarkup\(options\.icon\)\}<span class="result-action-label/);
  assert.match(app, /b\.setAttribute\('aria-haspopup', 'menu'\);[\s\S]{0,120}b\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(app, /mkMenu\('Use', '', imageUseItems, \{ icon: 'result-use', iconOnly: true, ariaLabel: 'Use image'/);
  assert.match(app, /mkMenu\('Process', '', processItems, \{ icon: 'result-process', iconOnly: true, ariaLabel: 'Process video'/);
  assert.match(app, /mkIcon\('result-process', upscaleLabel/);
  assert.match(app, /mkIcon\('result-move', 'Move generation'/);
  assert.match(app, /mkMenu\('Save', '', imageSaveItems, \{ icon: 'result-save', iconOnly: true, compact: true, ariaLabel: 'Save image'/);
  assert.match(app, /mkIcon\('result-delete', 'Move generation to trash'/);
  assert.match(app, /mkIcon\(liked \? 'heart-fill' : 'heart'[\s\S]{0,360}\}, \{ compact: true \}\)/);
  assert.match(app, /mkMenu\('Save', '', imageSaveItems, \{ icon: 'result-save', iconOnly: true, compact: true/);
  assert.doesNotMatch(app, /mk\(it\.upscaled \? '⇪ Re-upscale' : '⇪ Upscale'/);
  assert.doesNotMatch(app, /mk\('▤ Move'/);
  assert.doesNotMatch(app, /mk\('↓ Save'/);
  assert.match(css, /#lbActions \.action-btn\.result-action-icon \{[\s\S]*flex: 0 0 44px;[\s\S]*width: 44px;[\s\S]*height: 44px;[\s\S]*border-radius: 14px;/);
  assert.match(css, /@media \(max-width: 1179px\) \{[\s\S]*\.result-action-icon:not\(\.result-action-compact\)[\s\S]*width: auto;[\s\S]*\.result-action-label \{[\s\S]*display: inline;/);
  assert.match(css, /#lbActions \.action-btn\.result-action-icon:focus-visible/);
});

test('grouped desktop results use the mobile parent and attached-media hierarchy', () => {
  assert.match(html, /id="desktopStagePicker"[^>]*Choose a result from this gallery group/);
  assert.match(html, /desktop-stage-head-actions[\s\S]*desktopStageStatus[\s\S]*desktopStagePicker[\s\S]*desktopStageInfo/);
  assert.doesNotMatch(html, /id="lbGroupPickerSlot"/);
  assert.match(app, /function desktopStageChoices\(item\)/);
  assert.match(app, /function renderDesktopStagePicker\(item, media = 'image'\)/);
  assert.match(app, /angleGroupItems\(item\)/);
  assert.match(app, /generationGroupItems\(item\)/);
  assert.match(app, /selectDesktopLibraryItem\(choice\.item, choice\.media\)/);
  assert.match(app, /button\.addEventListener\('click', \(\) => selectDesktopLibraryItem\(choice\.item, choice\.media\)\)/);
  assert.match(app, /thumbnail\.className = 'desktop-stage-choice-thumb'/);
  assert.match(app, /button\.appendChild\(thumbnail\)/);
  assert.doesNotMatch(app, /desktop-stage-choice-copy/);
  assert.match(app, /image\.draggable = false/);
  assert.match(app, /function wireHorizontalScroller\(scroller\)/);
  assert.match(app, /revealHorizontalSelection\(picker, activeChoice\)/);
  assert.doesNotMatch(app, /function focusDesktopStagePicker/);
  assert.doesNotMatch(app, /function restoreDesktopStagePickerHome/);
  assert.match(app, /if \(generationItems\.length > 1\) \{[\s\S]*makeMediaTier\('lb-media-generations', strengthHuntGroup \? 'Strength Hunt generations' : 'Generations'\)/);
  assert.match(app, /const headerMedia = \$\('#lbHeaderMedia'\)/);
  assert.match(app, /const mediaOptions = desktopWorkspaceActive\(\)[\s\S]*\? headerMedia[\s\S]*: makeMediaTier\('lb-media-assets', mediaLabel\)/);
  assert.match(app, /headerContext\.hidden = !activeGroup && headerMedia\.hidden/);
  assert.match(app, /lightboxGroupThumbnailMarkup\(groupItem, index, groupItem\.id === it\.id\)/);
  assert.doesNotMatch(app, /lb-group-thumb-copy|lb-group-thumb-label/);
  assert.match(app, /desktopWorkspaceQuery\.addEventListener\('change',[\s\S]*openLightbox\(state\.currentItem\.id, media\)/);
  assert.match(app, /if \(!\$\('#lightbox'\)\?\.classList\.contains\('show'\)\) renderDesktopStage\(\)/);
  const pointerDown = app.match(/scroller\.addEventListener\('pointerdown',[\s\S]*?\n  \}\);/)?.[0] || '';
  const pointerMove = app.match(/scroller\.addEventListener\('pointermove',[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.doesNotMatch(pointerDown, /setPointerCapture/);
  assert.match(pointerMove, /Math\.abs\(delta\) < 5/);
  assert.match(pointerMove, /setPointerCapture\(event\.pointerId\)/);
  assert.match(app, /scroller\.scrollLeft \+= event\.deltaY/);
  assert.match(app, /card\.dataset\.groupItemIds = entry\.items\.map/);
  assert.match(app, /groupedIds\.includes\(state\.desktopItemId\)/);
  assert.match(css, /\.desktop-stage-picker \{/);
  assert.match(css, /\.desktop-stage-picker \{[\s\S]*justify-content: flex-start;[\s\S]*overflow-x: auto;[\s\S]*cursor: grab;/);
  assert.match(css, /\.desktop-stage-head-actions \{[\s\S]*max-width: min\(62%, 430px\)/);
  assert.match(css, /\.desktop-stage-choice \{[\s\S]*width: 34px;[\s\S]*height: 34px;/);
  assert.match(css, /\.desktop-stage-choice\.active \{/);
  assert.doesNotMatch(css, /desktop-stage-picker\.focused|focusedGroupChoiceExpand/);
  assert.match(css, /\.lb-media-generations \.lb-group-thumb-chip \{[\s\S]*--lb-group-chip-width: 48px;[\s\S]*height: 48px;/);
  assert.match(css, /\.lb-group-thumb-image,[\s\S]*width: 40px;[\s\S]*height: 40px;/);
  assert.match(css, /#lightbox \.lb-media \{[\s\S]*max-height: none;[\s\S]*display: grid;[\s\S]*overflow-y: visible;[\s\S]*padding: 8px 22px 9px;/);
  assert.match(css, /#lightbox \.lb-media-options \{[\s\S]*width: 100%;[\s\S]*overflow-x: auto;/);
  assert.match(css, /#lightbox \.lb-media-generations \.lb-media-options > :first-child \{ margin-left: auto; \}/);
  assert.match(css, /#lightbox \.overlay-top \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, auto\) auto;/);
  assert.match(css, /body\.desktop-focused-result \.select-bar \{[\s\S]*right: 0;[\s\S]*width: var\(--studio-right-width\);[\s\S]*transform: none;/);
  assert.match(app, /const focusFromExpandedLibrary = freshOpen[\s\S]*classList\.contains\('desktop-library-expanded'\)/);
  assert.match(app, /if \(focusFromExpandedLibrary\) document\.body\.classList\.add\('desktop-focus-from-library'\)/);
  assert.match(css, /body\.desktop-focus-from-library \.desktop-stage \{[\s\S]*left: calc\(-100vw \+ var\(--studio-right-width\) \+ 1px\);[\s\S]*transition: none;/);
});

test('desktop image action opens the full destination menu', () => {
  assert.match(html, /id="desktopStageEdit"[^>]*aria-label="Choose how to use result"[^>]*aria-haspopup="menu"/);
  assert.match(app, /function galleryImageDestinationActions\(item/);
  assert.match(app, /function useGalleryItemAsGuide\(item, mode = 'image'\)/);
  assert.match(app, /: galleryImageDestinationActions\(item\);[\s\S]{0,500}openActionMenu\(\$\('#desktopStageEdit'\), choices/);
  assert.match(app, /label: 'Image guide'[^\n]*useGalleryItemAsGuide\(item, 'image'\)/);
  assert.match(app, /label: 'Depth guide'[^\n]*useGalleryItemAsGuide\(item, 'depth'\)/);
  assert.match(app, /label: 'First frame'[^\n]*sendToVideoTab\(item, 'start'\)/);
  assert.match(app, /label: 'Last frame'[^\n]*sendToVideoTab\(item, 'end'\)/);
});

test('Generate occupies the middle stage and animates away with focused results', () => {
  assert.match(css, /\.desktop-stage \{[\s\S]*grid-template-rows: minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.desktop-stage \.generate-dock \{[\s\S]*position: relative;[\s\S]*left: auto;[\s\S]*right: auto;[\s\S]*width: auto;/);
  assert.match(css, /body\.desktop-focused-result \.desktop-stage \.generate-dock \{[\s\S]*z-index: 61;[\s\S]*opacity: 0;[\s\S]*pointer-events: none;[\s\S]*translateY\(24px\)/);
  assert.match(css, /\.desktop-stage-shell \{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto auto/);
  assert.match(app, /actions\.hidden = !item/);
  assert.match(app, /const item = open\?\.dataset\.itemId && state\.items\.find/);
  assert.match(css, /body\.director-open \.director-summary \{[\s\S]*position: fixed;[\s\S]*width: var\(--studio-left-width\)/);
});

test('focused gallery and desktop information rail use true black surfaces', () => {
  assert.match(css, /#lightbox \{ background: #000; \}/);
  assert.match(css, /#lightbox\.show \{[\s\S]*background: #000;/);
  assert.match(css, /#lightbox #lbActions \{[\s\S]*background: #000;/);
  assert.match(css, /#lightbox #lbActions \{[\s\S]*padding: 10px 22px calc\(28px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /\.action-row \{[\s\S]*padding: 10px 16px calc\(24px \+ env\(safe-area-inset-bottom\)\);/);
});

test('desktop viewport stays pinned while each workspace column owns scrolling', () => {
  assert.match(css, /@media \(min-width: 1180px\) \{[\s\S]*?body \{[\s\S]*?position: fixed !important;[\s\S]*?inset: 0 !important;[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.studio-workspace > \.view \{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/);
  assert.match(app, /function pinDesktopViewport\(\)/);
  assert.match(app, /window\.addEventListener\('scroll', pinDesktopViewport/);
  assert.match(app, /if \(desktopWorkspaceActive\(\)\) \$\('#view-gallery'\)\.scrollTop \+= speed/);
  assert.match(app, /sheetScrollY = desktopWorkspaceActive\(\) \? 0/);
  assert.match(app, /savedScrollY = desktopWorkspaceActive\(\) \? 0/);
});

test('desktop Library rail keeps Likes and Sort inside the narrow right column', () => {
  assert.match(css, /#view-gallery \.library-toolbar \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 38px 38px;/);
  assert.match(css, /#view-gallery \.gallery-sort-trigger \{[\s\S]*?width: 38px;[\s\S]*?min-width: 38px;/);
  assert.match(css, /#view-gallery \.gallery-sort-trigger > span,[\s\S]*?#view-gallery \.gallery-sort-chevron \{ display: none; \}/);
  assert.match(css, /body\.desktop-library-expanded #view-gallery \.gallery-sort-trigger \{[\s\S]*?min-width: 106px;/);
});

test('expanded desktop Library defaults to four columns and offers persistent thumbnail zoom plus date navigation', () => {
  assert.match(html, /id="galleryZoom"[^>]*type="range"[^>]*min="1"[^>]*max="5"[^>]*value="3"/);
  assert.match(app, /galleryZoom: 3/);
  assert.match(app, /function galleryColumnsForZoom\(zoom = state\.galleryZoom\)/);
  assert.match(app, /return 7 - normalizeGalleryZoom\(zoom\)/);
  assert.match(app, /profileStorageKey\('ks-gallery-layout'\)/);
  assert.match(app, /captureDesktopGalleryLayoutTransition\(\)/);
  assert.match(app, /localStorage\.setItem\(galleryLayoutStorageKey\(\)/);
  assert.match(css, /body\.desktop-library-expanded #view-gallery \.grid \{[\s\S]*repeat\(var\(--gallery-columns, 4\), minmax\(0, 1fr\)\)/);
  assert.match(css, /body\.desktop-library-expanded #view-gallery \.gallery-zoom-control \{[\s\S]*display: grid;/);
  assert.match(css, /#view-gallery \.gallery-date-scrubber \{[\s\S]*right: 2px;/);
});
