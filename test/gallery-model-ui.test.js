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

test('gallery cards identify create, edit, and video generation models', () => {
  assert.match(app, /function galleryImageModelLabel\(item\)/);
  assert.match(app, /item\.krea2Turbo === false \? 'Krea 2 Raw' : 'Krea 2 Turbo'/);
  assert.match(app, /item\.mode === 'edit'.*editEngineLabel\(item\.editEngine \|\| 'klein4'\)/);
  for (const label of ['LTX 2.3', 'LTX Edit', '10Eros DMD', 'Wan 2.2', 'SCAIL 2']) {
    assert.match(app, new RegExp(label.replace('.', '\\.')));
  }
  assert.match(app, /className = 'badge model-badge'/);
  assert.match(app, /Video model: \$\{videoModel\}/);
  assert.match(css, /\.card \.badge\.model-badge/);
});

test('focused gallery metadata always exposes the selected media model', () => {
  assert.match(app, /const model = videoEngineLabel\(info\.engine\);[\s\S]*<b>Model:<\/b>/);
  assert.match(app, /const recordedVideoWidth = Math\.round\(Number\(info\.width\)\)/);
  assert.match(app, /if \(videoWidth > 0 && videoHeight > 0\) meta\.push\(`<b>Size:<\/b> \$\{videoWidth\}×\$\{videoHeight\}`\)/);
  assert.match(app, /const model = galleryImageModelLabel\(it\);[\s\S]*<b>Model:<\/b>/);
  assert.match(app, /<b>Playback:<\/b>/);
});

test('library search includes friendly model names', () => {
  assert.match(app, /galleryImageModelLabel\(it\)/);
  assert.match(app, /\.map\(\(video\) => videoEngineLabel/);
});

test('gallery cards use compact labels, grouped counts, and middle-of-viewport video previews', () => {
  assert.match(app, /function galleryCardModelLabel\(item\)/);
  assert.match(app, /return item\.krea2Turbo === false \? 'Raw' : 'Turbo'/);
  assert.match(app, /className = 'gallery-card-video'/);
  assert.match(app, /preview\.preload = 'none'/);
  assert.match(app, /preview\.dataset\.src = galleryVideoPreviewSource\(latestVideo\)/);
  assert.match(app, /function galleryVideoPreviewSource\(video\)/);
  assert.match(app, /const MAX_NATIVE_GALLERY_PREVIEW_EDGE = 1440/);
  const previewSourceStart = app.indexOf('function galleryVideoPreviewSource(video)');
  const previewSourceEnd = app.indexOf('\nfunction desktopSideLibraryHoverPreviewAllowed()', previewSourceStart);
  const previewSource = app.slice(previewSourceStart, previewSourceEnd);
  assert.match(previewSource, /const nativeEdgeLimit = touchFirstGalleryDevice\(\) \? resolution : MAX_NATIVE_GALLERY_PREVIEW_EDGE/);
  assert.match(previewSource, /nativePreviewCompatible[\s\S]*Math\.max\(width, height\) <= nativeEdgeLimit[\s\S]*sourceFrameRate <= frameRate/);
  assert.match(previewSource, /if \(nativePreviewCompatible\) return `\/videos\/\$\{encodeURIComponent\(file\)\}`/);
  assert.match(previewSource, /`\/video-previews\/\$\{encodeURIComponent\(file\)\}\?size=\$\{resolution\}&fps=\$\{frameRate\}`/);
  assert.match(app, /video\.dataset\.loaded !== 'true'/);
  assert.match(app, /let galleryPreviewActive = new Set\(\)/);
  assert.match(app, /function centeredGalleryPreviewRow\(candidates, center\)/);
  assert.match(app, /function settleGalleryPreviewPlayback\(advanceMobile = false\)/);
  assert.match(app, /let centered = centeredGalleryPreviewRow\(candidates, center\)/);
  assert.match(app, /const next = new Set\(centered\)/);
  assert.match(app, /galleryPreviewActive\.forEach\(playGalleryPreview\)/);
  assert.match(app, /setTimeout\(\(\) => scheduleGalleryPreviewPlayback\(0\), 150\)/);
  assert.match(app, /rootMargin: '-16% 0px -16% 0px'/);
  assert.match(app, /generation-count-badge/);
  assert.match(app, /grouped/);
  assert.match(css, /\.card \.badge\.attached-composite-badge[\s\S]*bottom: 8px/);
  assert.match(css, /\.card \.gallery-card-video/);
});

test('mobile gallery videos open immediately and release card preview resources', () => {
  const tap = app.match(/function handleGalleryTap\(item, card\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(tap, /const touchFirst = window\.matchMedia\?\.\('\(hover: none\), \(pointer: coarse\)'\)\.matches/);
  assert.match(tap, /if \(touchFirst\) \{[\s\S]*openLightbox\(item\.id, card\.dataset\.media \|\| 'image'\);[\s\S]*return;/);
  assert.match(app, /function handoffGalleryPreviewsToFocusedMedia\(\)/);
  assert.match(app, /handoffGalleryPreviewsToFocusedMedia\(\);\r?\n  clearLightboxTap\(\)/);
  assert.match(app, /!\$\('#lightbox'\)\?\.classList\.contains\('show'\)/);
  assert.match(app, /if \(state\.view === 'gallery'\) resetGalleryPreviewObservation\(\)/);
  assert.match(css, /\.card \.gallery-card-video \{[\s\S]{0,100}pointer-events: none;/);
});

test('mobile Library paints its mounted grid before refreshing stale data', () => {
  const setView = app.match(/function setView\(view, opts = \{\}\) \{[\s\S]*?\n\}/)?.[0] || '';
  const refreshStart = app.indexOf('function refreshGallery(soft, options = {})');
  const refreshEnd = app.indexOf('\nfunction updatePrivacyButton()', refreshStart);
  const refreshGallery = app.slice(refreshStart, refreshEnd);
  const refreshDelay = Number(app.match(/const GALLERY_ENTRY_REFRESH_DELAY_MS = (\d+)/)?.[1]);
  const previewDelay = Number(app.match(/const MOBILE_GALLERY_PREVIEW_WAKE_DELAY_MS = (\d+)/)?.[1]);
  assert.ok(refreshDelay > 0, 'the mounted Library should refresh after a short quiet period');
  assert.ok(previewDelay >= refreshDelay + 1000,
    'mobile decoder startup must not share the stale-data refresh deadline');
  assert.match(app, /function scheduleGalleryEntryRefresh\(delay = GALLERY_ENTRY_REFRESH_DELAY_MS\)/);
  assert.match(app, /function resumeGalleryPreviewsAfterPaint\(\)/);
  assert.match(setView, /resumeGalleryPreviewsAfterPaint\(\);\s*scheduleGalleryEntryRefresh\(\);/);
  assert.doesNotMatch(setView, /if \(isGallery\) \{\s*refreshGallery\(/);
  assert.match(setView, /if \(!isGallery\) \{\s*updateVideoPanels\(\);\s*renderEnhance\(\);\s*\}/);
  assert.match(app, /document\.addEventListener\('pointerdown',[\s\S]*scheduleGalleryEntryRefresh\(\)/);
  assert.match(app, /if \(galleryRefreshPromise\) return;\s*refreshGallery\(true, \{ conditional: true \}\)/);
  assert.match(refreshGallery, /\?revision=\$\{encodeURIComponent\(conditionalRevision\)\}/);
  assert.match(refreshGallery, /if \(data\.unchanged\) \{[\s\S]*return;/);
  assert.match(refreshGallery, /void refreshLoraContext\(\);/);
  assert.doesNotMatch(refreshGallery, /await refreshLoraContext\(\);/);
  assert.match(server, /let dbRevision = 1;/);
  assert.match(server, /url\.searchParams\.get\('revision'\) === revision/);
  assert.match(server, /\{ unchanged: true, revision \}/);
});

test('mobile Library gives input priority over preview observer and decoder wake-up', () => {
  assert.match(app, /const MOBILE_GALLERY_PREVIEW_WAKE_DELAY_MS = 2600/);
  assert.match(app, /function scheduleGalleryPreviewWake\(delay = null\)/);
  assert.match(app, /function deferGalleryPreviewWakeForInteraction\(\)/);
  const deferStart = app.indexOf('function deferGalleryPreviewWakeForInteraction()');
  const deferEnd = app.indexOf('\nfunction cancelGalleryPreviewRotation()', deferStart);
  const deferWake = app.slice(deferStart, deferEnd);
  assert.match(deferWake, /noteGalleryInteraction\(\)/);
  assert.match(deferWake, /scheduleGalleryPreviewWake\(\)/);
  assert.doesNotMatch(deferWake, /\.pause\(|unloadGalleryPreview\(/,
    'document-level pointer capture must remain free of synchronous media work');
  assert.match(app, /galleryInputPending\(\) \|\| quietFor < MOBILE_GALLERY_PREVIEW_QUIET_MS/);
  assert.match(app, /if \(galleryRefreshPromise\)[\s\S]{0,500}scheduleGalleryPreviewWake\(650\)/);
  assert.match(app, /state\.view !== 'gallery' \|\| galleryPreviewWakePending/);
  assert.match(app, /document\.addEventListener\('pointerdown',[\s\S]*deferGalleryPreviewWakeForInteraction\(\)/);
  assert.match(app, /window\.addEventListener\('scroll', \(\) => \{\s*deferGalleryPreviewWakeForInteraction\(\)/);
  assert.match(app, /if \(touchFirst\) \{[\s\S]{0,220}return;\s*\}\s*galleryPreviewActive\.forEach/);
});

test('gallery cards use lightweight preview proxies and one mobile decoder', () => {
  assert.match(app, /let galleryPreviewIntersecting = new Set\(\)/);
  assert.match(app, /entries\.forEach\(\(entry\) => \{[\s\S]*galleryPreviewIntersecting\.add\(entry\.target\)/);
  assert.match(app, /function mobileGalleryPreviewCandidates\(center = window\.innerHeight \/ 2\)/);
  assert.match(app, /document\.elementFromPoint\(x, y\)\?\.closest\?\.\('#galleryGrid \.card'\)/);
  assert.match(app, /const previewPool = touchFirst \? mobileGalleryPreviewCandidates\(center\) : \[\.\.\.galleryPreviewIntersecting\]/);
  assert.match(app, /if \(touchFirstGalleryDevice\(\)\) \{\s*scheduleGalleryPreviewPlayback\(180\);\s*return;/);
  assert.match(app, /if \(!galleryPreviewObserver\) return;\s*\$\$\('\.gallery-card-video'\)\.forEach/);
  assert.match(app, /const mobileAlternates = touchFirst && centered\.length > 1/);
  assert.match(app, /const MOBILE_GALLERY_PREVIEW_ROTATE_MS = 4800/);
  assert.match(app, /settleGalleryPreviewPlayback\(true\)/);
  assert.match(app, /advanceMobile \? \(currentIndex \+ 1\) % ordered\.length : currentIndex/);
  const rotationStart = app.indexOf('function scheduleGalleryPreviewRotation()');
  const rotationEnd = app.indexOf('\nfunction galleryPreviewMotionAllowed()', rotationStart);
  const rotation = app.slice(rotationStart, rotationEnd);
  assert.match(rotation, /galleryInputPending\(\) \|\| quietFor < MOBILE_GALLERY_PREVIEW_QUIET_MS/);
  assert.match(rotation, /window\.requestIdleCallback\(rotate\)/,
    'starting the alternate mobile decoder should wait for a real idle period');
  const settleStart = app.indexOf('function settleGalleryPreviewPlayback(advanceMobile = false)');
  const settleEnd = app.indexOf('\nfunction scheduleGalleryPreviewPlayback', settleStart);
  const settle = app.slice(settleStart, settleEnd);
  assert.match(settle, /if \(touchFirst\) pauseGalleryPreview\(video, 10000\)/);
  assert.doesNotMatch(settle, /unloadGalleryPreview\(/,
    'rotating between visible mobile previews must not tear down a decoder');
  assert.match(server, /url\.pathname\.startsWith\('\/video-previews\/'\)/);
  assert.match(server, /async function cachedVideoPreview\(media, options = \{\}\)/);
  assert.match(server, /normalizeVideoPreviewOptions\(options\)/);
  assert.match(server, /preview-v2\\0\$\{media\.name\}[\s\S]*\$\{preview\.size\}\\0\$\{preview\.fps\}/);
  assert.match(server, /size: url\.searchParams\.get\('size'\),\s*fps: url\.searchParams\.get\('fps'\)/);
  assert.match(server, /videoPreviewQueue\.then\(create, create\)/);
});

test('focused videos leave playback entirely to native controls', () => {
  assert.match(html, /id="lbVideo" controls playsinline loop/);
  assert.doesNotMatch(html, /id="lbVideoPlay"/);
  assert.match(app, /vid\.controls = true/);
  assert.match(app, /vid\.preload = 'metadata'/);
  assert.doesNotMatch(app, /\$\('#lbVideo'\)\.addEventListener\('click', handleLightboxTap\)/);
  assert.doesNotMatch(css, /\.lightbox-video-play/);
});

test('gallery performance controls can disable video previews and build an idle compressed cache', () => {
  assert.match(html, /id="setVideoPreviews"[^>]*role="switch"/);
  assert.match(html, /id="setVideoPreviewResolution"[\s\S]*value="640" selected/);
  assert.match(html, /id="setVideoPreviewFrameRate"[\s\S]*value="24" selected/);
  assert.match(html, /id="setPreviewCache"[^>]*role="switch"/);
  assert.match(html, /id="previewCacheStatus"[^>]*aria-live="polite"/);
  assert.match(html, /id="previewCacheClear"/);
  assert.match(app, /const DEFAULT_GALLERY_PREVIEW_RESOLUTION = 640/);
  assert.match(app, /const DEFAULT_GALLERY_PREVIEW_FRAME_RATE = 24/);
  assert.match(app, /mediaPreferences: \{[\s\S]*videoPreviews: true,[\s\S]*previewResolution: DEFAULT_GALLERY_PREVIEW_RESOLUTION,[\s\S]*previewFrameRate: DEFAULT_GALLERY_PREVIEW_FRAME_RATE,[\s\S]*previewCache: false,[\s\S]*experimentalFeatures: false/);
  assert.match(app, /function renderVideoPreviewQualityControls\(\)/);
  assert.match(app, /\['setVideoPreviewResolution', 'setVideoPreviewFrameRate'\]/);
  assert.match(app, /function saveMediaPreferences\(next\)/);
  assert.match(app, /function compressedPreviewResponse\(response\)/);
  assert.match(app, /window\.requestIdleCallback\(work/);
  assert.match(app, /run\.cache\.put\(source, compressed\)/);
  assert.match(app, /MAX_PREVIEW_CACHE_ITEMS = 250/);
});

test('focused media switchers separate parent generations from their media', () => {
  assert.match(app, /makeMediaTier\('lb-media-generations', strengthHuntGroup \? 'Strength Hunt generations' : 'Generations', `generations:\$\{it\.generationGroupId\}`\)/);
  assert.match(app, /function lightboxGroupThumbnailMarkup\(item, index, active = false\)/);
  assert.match(app, /class="lb-group-thumb-image"/);
  assert.match(app, /class="lb-group-thumb-image"[^>]*loading="eager"[^>]*decoding="async"[^>]*fetchpriority="\$\{active \? 'high' : 'auto'\}"/);
  assert.match(app, /function preloadLightboxGroupThumbnails\(items, activeId = ''\)/);
  assert.match(app, /image\.fetchPriority = item\.id === activeId \? 'high' : 'auto'/);
  assert.match(app, /card\.addEventListener\('pointerenter', warmGroupThumbnails, \{ once: true, passive: true \}\)/);
  assert.match(app, /card\.addEventListener\('pointerdown',[\s\S]*preloadLightboxGroupThumbnails\(entry\.items, it\.id\)/);
  assert.match(app, /class="lb-group-thumb-number"[^>]*>\$\{number\}/);
  assert.match(app, /function lightboxGroupMediaCounts\(item\)/);
  assert.match(app, /function lightboxGroupMediaDescription\(item\)/);
  assert.match(app, /function lightboxGroupMediaSummaryMarkup\(item\)/);
  assert.match(app, /return 'Image only'/);
  assert.match(app, /class="lb-group-media-stat is-video"/);
  assert.match(app, /class="lb-group-media-stat is-composite"/);
  assert.match(app, /generationLabel = `[\s\S]*lightboxGroupMediaDescription\(groupItem\)/);
  assert.match(app, /if \(generationItems\.length > 1\)/);
  assert.doesNotMatch(app, /lb-group-thumb-copy|lb-group-thumb-label/);
  assert.doesNotMatch(app, /lb-media-tier-label/);
  assert.match(app, /const mediaOptions = desktopWorkspaceActive\(\)[\s\S]*\? headerMedia[\s\S]*: makeMediaTier\('lb-media-assets', mediaLabel, `assets:\$\{it\.id\}`\)/);
  assert.match(app, /if \(mediaOptions === headerMedia\)[\s\S]*headerMedia\.setAttribute\('aria-label', mediaLabel\)/);
  assert.match(app, /mediaOptions\.appendChild\(b\)/);
  assert.match(app, /videos\.forEach\(\(v, i\) => mkChip\(`Video \$\{i \+ 1\}`, v\.id, !!v\.liked, 'video'\)\)/);
  assert.match(app, /className = 'chip' \+ /);
  assert.match(app, /lb-media-kind-icon/);
  assert.match(app, /lb-media-like/);
  assert.match(app, /vid\.load\(\)/);
  assert.match(css, /\.chip-row\.lb-media \{[\s\S]*display: grid/);
  assert.doesNotMatch(css, /\.lb-media-tier-label/);
  assert.match(css, /\.lb-media \.chip\.active/);
  assert.match(css, /\.lb-media-generations \.chip/);
  assert.match(css, /\.lb-media-generations \.lb-group-thumb-chip \{[\s\S]*width: var\(--lb-group-chip-width\)/);
  assert.match(css, /\.lb-media-generations \.lb-group-thumb-chip \{[\s\S]*--lb-group-chip-width: 58px;[\s\S]*height: 66px;/);
  assert.match(css, /\.lb-group-thumb-image,[\s\S]*width: 48px;[\s\S]*height: 46px;[\s\S]*object-fit: cover/);
  assert.match(css, /\.lb-group-thumb-number \{[\s\S]*font-size: 9px/);
  assert.match(css, /\.lb-group-media-summary \{[\s\S]*bottom: 2px;[\s\S]*height: 14px;/);
  assert.match(css, /\.lb-group-media-stat\.is-video \{ color: #f4a3ad; \}/);
  assert.match(css, /\.lb-group-media-stat\.is-composite \{ color: #aabaf1; \}/);
  assert.match(css, /\.lb-header-context \{/);
  assert.match(css, /\.lb-header-media \.chip\.active/);
  assert.match(css, /\.lb-media-kind-icon/);
  assert.match(css, /\.lb-media-like/);
});

test('focused group navigation preserves the strip position while selecting later items', () => {
  assert.match(app, /function revealHorizontalSelection\(scroller, selected, previousScrollLeft = null, preservePosition = false\)/);
  assert.match(app, /if \(Number\.isFinite\(previousScrollLeft\)\) scroller\.scrollLeft = previousScrollLeft/);
  assert.match(app, /if \(preservePosition\) return/);
  assert.match(app, /function openFocusedGalleryItem\(item, media, options = \{\}\)/);
  assert.match(app, /openLightbox\(item\.id, selectedMedia, options\)/);
  assert.ok((app.match(/openFocusedGalleryItem\([^\n]*\{ preserveGroupScroll: true \}\)/g) || []).length >= 2);
  assert.match(app, /const mediaScrollPositions = new Map\(\)/);
  assert.match(app, /mediaScrollPositions\.set\(key, options\.scrollLeft\)/);
  assert.match(app, /options\.dataset\.scrollKey = scrollKey/);
  assert.match(app, /const preserveGroupPosition = options\.preserveGroupScroll === true/);
  assert.match(app, /scrollKey\?\.startsWith\('generations:'\) \|\| scrollKey\?\.startsWith\('angles:'\)/);
  assert.match(app, /mediaScrollPositions\.get\(scrollKey\),[\s\S]*preserveGroupPosition/);
});
