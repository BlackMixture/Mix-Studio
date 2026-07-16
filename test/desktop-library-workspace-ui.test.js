const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('desktop library cards load their media and saved settings into the workspace', () => {
  assert.match(app, /function selectDesktopLibraryItem\(item, media = 'image'\)/);
  assert.match(app, /reuseVideo\(item, video, \{ desktopToken: token, silent: true \}\)/);
  assert.match(app, /reuseItem\(item, false, \{ desktopToken: token, silent: true \}\)/);
  assert.match(app, /desktopWorkspaceActive\(\) && state\.view !== 'gallery'/);
  assert.match(app, /syncDesktopGallerySelection\(\)/);
  assert.match(css, /\.card\.desktop-active:not\(\.selected\)/);
});

test('desktop stage exposes an explicit focused-view information action', () => {
  assert.match(html, /id="desktopStageInfo"[^>]*aria-label="View generation details"/);
  assert.match(app, /\$\('#desktopStageInfo'\)\.addEventListener\('click'/);
  assert.match(app, /openLightbox\(info\.dataset\.itemId, info\.dataset\.media \|\| 'image'\)/);
});

test('desktop navigation and focused viewer align to the three-column workspace', () => {
  assert.match(css, /\.primary-tabs \{ grid-column: 2; grid-row: 1; \}/);
  assert.match(css, /\.create-tabs \{ grid-column: 1; grid-row: 1;/);
  assert.match(css, /#lightbox \{ inset: 122px 0 0; \}/);
  assert.match(css, /#lightbox\.show \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(250px, 286px\)/);
  assert.match(css, /#lightbox \.lightbox-img-wrap \{[\s\S]*grid-column: 1;/);
  assert.match(css, /#lightbox \.lightbox-meta \{[\s\S]*grid-column: 2;/);
  assert.match(css, /#lightbox #lbActions \{[\s\S]*grid-column: 1 \/ -1;[\s\S]*flex-wrap: nowrap;[\s\S]*overflow-x: auto;/);
  assert.match(app, /document\.body\.classList\.add\('desktop-focused-result'\)/);
  assert.match(app, /document\.body\.classList\.remove\('desktop-focused-result'\)/);
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
  assert.match(app, /function desktopStageSaveMenuItems\(item, video\)/);
  assert.match(app, /desktopStageDelete'\)\.addEventListener\('click', async/);
});

test('grouped desktop results expose a synchronized media picker', () => {
  assert.match(html, /id="desktopStagePicker"[^>]*Choose a result from this gallery group/);
  assert.match(html, /desktop-stage-head-actions[\s\S]*desktopStageStatus[\s\S]*desktopStagePicker[\s\S]*desktopStageInfo/);
  assert.match(app, /function desktopStageChoices\(item\)/);
  assert.match(app, /function renderDesktopStagePicker\(item, media = 'image'\)/);
  assert.match(app, /angleGroupItems\(item\)/);
  assert.match(app, /generationGroupItems\(item\)/);
  assert.match(app, /selectDesktopLibraryItem\(choice\.item, choice\.media\)/);
  assert.match(app, /function wireHorizontalScroller\(scroller\)/);
  assert.match(app, /revealHorizontalSelection\(picker, picker\.querySelector\('\.desktop-stage-choice\.active'\)\)/);
  assert.match(app, /scroller\.scrollLeft \+= event\.deltaY/);
  assert.match(app, /card\.dataset\.groupItemIds = entry\.items\.map/);
  assert.match(app, /groupedIds\.includes\(state\.desktopItemId\)/);
  assert.match(css, /\.desktop-stage-picker \{/);
  assert.match(css, /\.desktop-stage-picker \{[\s\S]*justify-content: flex-start;[\s\S]*overflow-x: auto;[\s\S]*cursor: grab;/);
  assert.match(css, /\.desktop-stage-head-actions \{[\s\S]*max-width: min\(62%, 430px\)/);
  assert.match(css, /\.desktop-stage-choice \{[\s\S]*width: 34px;[\s\S]*height: 34px;/);
  assert.match(css, /\.desktop-stage-choice\.active \{/);
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

test('Generate stays pinned in the left rail while result actions use the middle stage', () => {
  assert.match(css, /\.desktop-stage \.generate-dock \{[\s\S]*position: fixed;[\s\S]*left: 0;[\s\S]*width: var\(--studio-left-width\)/);
  assert.match(css, /\.desktop-stage-shell \{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto auto/);
  assert.match(app, /actions\.hidden = !item/);
  assert.match(app, /const item = open\?\.dataset\.itemId && state\.items\.find/);
  assert.match(css, /body\.director-open \.director-summary \{[\s\S]*position: fixed;[\s\S]*width: var\(--studio-left-width\)/);
});

test('focused gallery and desktop information rail use true black surfaces', () => {
  assert.match(css, /#lightbox \{ background: #000; \}/);
  assert.match(css, /#lightbox\.show \{[\s\S]*background: #000;/);
  assert.match(css, /#lightbox #lbActions \{[\s\S]*background: #000;/);
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
