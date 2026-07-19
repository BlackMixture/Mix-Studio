'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('focused gallery swipe directly moves current and neighboring media', () => {
  assert.match(html, /id="lbSwipePreview"/);
  assert.match(app, /function preloadLightboxNeighbors\(item\)/);
  assert.match(app, /function renderLightboxSwipe\(rawDx\)/);
  assert.match(app, /preview\.style\.transform = `translate3d\(\$\{side \+ dx\}px/);
  assert.match(app, /currentSwipe\.current\.animate/);
  assert.match(app, /Math\.abs\(rawDx\) >= wrap\.clientWidth \* 0\.2/);
  assert.match(app, /Math\.abs\(velocity\) >= 0\.48/);
  assert.match(app, /finishLightboxSwipe\(commit\)/);
  assert.match(app, /pendingNavigationItem = currentSwipe\.neighbor/);
  assert.match(app, /if \(pending\) openFocusedGalleryItem\(pending\)/);
  assert.match(app, /if \(next\) openFocusedGalleryItem\(next\)/);
  assert.match(css, /\.lightbox-swipe-preview \{[\s\S]*will-change|#lbImg,[\s\S]*will-change: transform, opacity/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.lightbox-swipe-preview/);
});

test('focused gallery arrow keys traverse every visible generation without closing', () => {
  assert.match(html, /id="lightbox"[^>]*aria-keyshortcuts="Escape ArrowLeft ArrowRight"/);
  assert.match(app, /function focusedGalleryItemMedia\(item, media\)/);
  assert.match(app, /function openFocusedGalleryItem\(item, media, options = \{\}\)/);
  assert.match(app, /function navigateFocusedGallery\(direction\)/);
  assert.match(app, /galleryEntries\(visibleItems\(\)\)\.flatMap\(galleryEntryNavigationItems\)/);
  assert.match(app, /entry\.generationGroupId[\s\S]*generationGroupItems\(entry\.item\)[\s\S]*entry\.angleGroupId[\s\S]*angleGroupItems\(entry\.item\)/);
  assert.match(app, /desktopWorkspaceActive\(\) && \$\('#lightbox'\)\.classList\.contains\('show'\)\) selectDesktopLibraryItem\(item, selectedMedia\)/);
  assert.match(app, /openFocusedGalleryItem\(target\);/);
  assert.match(app, /\['Escape', 'ArrowLeft', 'ArrowRight'\]\.includes\(event\.key\)[\s\S]*!\$\('#lightbox'\)\.classList\.contains\('show'\)/);
  assert.match(app, /target\?\.closest\('input, textarea, select, option, \[contenteditable="true"\], \[role="slider"\]'\)/);
  assert.match(app, /navigateFocusedGallery\(event\.key === 'ArrowRight' \? 1 : -1\)/);

  const start = app.indexOf('function galleryEntryNavigationItems(entry)');
  const end = app.indexOf('function focusedGalleryItemMedia', start);
  const source = app.slice(start, end);
  const one = { id: 'one' };
  const two = { id: 'two' };
  const three = { id: 'three' };
  const entries = [
    { item: two, items: [two, one], generationGroupId: 'group' },
    { item: three, items: [three] },
  ];
  const target = new Function(
    'galleryEntries',
    'visibleItems',
    'generationGroupItems',
    'angleGroupItems',
    `${source}\nreturn galleryNavigationTarget;`,
  )(() => entries, () => [], () => [one, two], () => []);
  assert.equal(target(one, 1).id, 'two');
  assert.equal(target(two, -1).id, 'one');
  assert.equal(target(two, 1).id, 'three');
  assert.equal(target(three, 1), null);

  const mediaStart = app.indexOf('function focusedGalleryItemMedia(item, media)');
  const mediaEnd = app.indexOf('function openFocusedGalleryItem', mediaStart);
  const mediaSource = app.slice(mediaStart, mediaEnd);
  const resolveMedia = new Function('latestGalleryVideo', `${mediaSource}\nreturn focusedGalleryItemMedia;`)(
    (item) => item.videos?.[0] || null,
  );
  const videoItem = { videos: [{ id: 'director-video' }] };
  assert.equal(resolveMedia(videoItem), 'director-video');
  assert.equal(resolveMedia(videoItem, 'image'), 'image');
  assert.equal(resolveMedia({}, undefined), 'image');
});

test('focused gallery images wheel zoom, click back to Create, and reset across navigation', () => {
  assert.match(html, /id="lbImg"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-label="Return to Create view\. Image zoom 100 percent"[^>]*aria-keyshortcuts="Enter Space \+ - 0 Shift\+ArrowLeft Shift\+ArrowRight Shift\+ArrowUp Shift\+ArrowDown"[^>]*title="Scroll or pinch to zoom · drag or two-finger scroll to pan · click to return to Create"[^>]*draggable="false"/);
  assert.doesNotMatch(html, /id="lbImg"[^>]*aria-pressed/);
  assert.match(app, /const lightboxZoomState = \{ active: false, scale: 1, x: 50, y: 50, panX: 0, panY: 0 \}/);
  assert.match(app, /const LIGHTBOX_ZOOM_MIN = 1;[\s\S]*const LIGHTBOX_ZOOM_MAX = 4;/);
  assert.match(app, /function lightboxContainedContent\(image\)/);
  assert.match(app, /function lightboxZoomOrigin\(image, clientX, clientY\)/);
  assert.match(app, /function lightboxPanBounds\(image = \$\('#lbImg'\)\)/);
  assert.match(app, /function setLightboxPan\(x, y\)/);
  assert.match(app, /function panLightboxBy\(deltaX, deltaY\)/);
  assert.match(app, /function setLightboxZoom\(scale, clientX, clientY\)/);
  assert.match(app, /function adjustLightboxZoom\(deltaY, clientX, clientY, deltaMode = 0\)/);
  assert.match(app, /function lightboxWheelMode\(event\)[\s\S]*trackpadLike[\s\S]*'pan' : 'zoom'/);
  assert.match(app, /function handleLightboxZoomWheel\(event\)[\s\S]*event\.preventDefault\(\)[\s\S]*panLightboxBy\(-horizontal, -vertical\)[\s\S]*adjustLightboxZoom\(event\.deltaY, event\.clientX, event\.clientY, event\.deltaMode\)/);
  assert.match(app, /\$\('#lbImg'\)\.addEventListener\('wheel', handleLightboxZoomWheel, \{ passive: false \}\)/);
  assert.match(app, /function handleLightboxPanPointerDown\(event\)[\s\S]*setPointerCapture\(event\.pointerId\)/);
  assert.match(app, /function handleLightboxPanPointerMove\(event\)[\s\S]*Math\.hypot\(deltaX, deltaY\) < 5[\s\S]*setLightboxPan\(pan\.panX \+ deltaX, pan\.panY \+ deltaY\)/);
  assert.match(app, /function finishLightboxPan\(event, cancelled = false\)/);
  assert.match(app, /if \(lightboxPanSuppressClick\)[\s\S]*event\?\.preventDefault\(\)[\s\S]*return;/);
  assert.match(app, /\$\('#lbImg'\)\.addEventListener\('pointerdown', handleLightboxPanPointerDown\)/);
  assert.match(app, /\$\('#lbImg'\)\.addEventListener\('auxclick',[\s\S]*event\.button !== 1[\s\S]*event\.preventDefault\(\)/);
  assert.match(app, /tap\.timer = setTimeout\([\s\S]*closeLightbox\(\);[\s\S]*310\)/);
  assert.match(app, /if \(lightboxTap\?\.timer\) clearTimeout\(lightboxTap\.timer\)/);
  assert.ok((app.match(/clearLightboxTap\(\);\r?\n  resetLightboxZoom\(\);/g) || []).length >= 2);
  assert.match(app, /if \(lightboxZoomState\.active && e\.target === \$\('#lbImg'\)\) return/);
  assert.match(app, /\$\('#lbImg'\)\.addEventListener\('keydown',[\s\S]*\['Enter', ' '\]\.includes\(event\.key\)[\s\S]*closeLightbox\(\)[\s\S]*\['\+', '=', '-', '_', '0'\]\.includes\(event\.key\)[\s\S]*adjustLightboxZoom/);
  assert.match(css, /#lbImg \{[\s\S]*cursor: pointer;[\s\S]*transform-origin: var\(--lightbox-zoom-x, 50%\) var\(--lightbox-zoom-y, 50%\)/);
  assert.match(css, /#lbImg\.lightbox-zoomed \{[\s\S]*cursor: grab;[\s\S]*translate3d\(var\(--lightbox-pan-x, 0px\), var\(--lightbox-pan-y, 0px\), 0\) scale\(var\(--lightbox-zoom-scale, 1\)\)/);
  assert.match(css, /\.lightbox-img-wrap\.is-image-panning #lbImg \{ cursor: grabbing; \}/);
  assert.match(css, /\.lightbox-img-wrap\.is-wheel-panning #lbImg \{ transition: none; \}/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*lightbox-img-wrap:not\(\.is-swiping\):not\(\.is-settling\) #lbImg/);

  const start = app.indexOf('function lightboxContainedContent(image)');
  const end = app.indexOf('function renderLightboxZoom()', start);
  const originSource = app.slice(start, end);
  const resolveOrigin = new Function(`${originSource}\nreturn lightboxZoomOrigin;`)();
  const image = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 }) };
  assert.deepEqual(resolveOrigin(image, 200, 150), { x: 25, y: 50 });
  assert.deepEqual(resolveOrigin(image, -100, 500), { x: 0, y: 100 });
  assert.deepEqual(resolveOrigin(image), { x: 50, y: 50 });

  const zoomStart = app.indexOf('const lightboxZoomState =');
  const zoomEnd = app.indexOf('function clearLightboxTap()', zoomStart);
  const zoomSource = app.slice(zoomStart, zoomEnd);
  const classList = { toggle() {}, contains() { return false; } };
  const wrap = { classList };
  const style = { setProperty() {} };
  const zoomImage = {
    hidden: false,
    clientWidth: 400,
    clientHeight: 600,
    naturalWidth: 400,
    naturalHeight: 600,
    classList,
    style,
    closest: () => wrap,
    setAttribute() {},
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 600 }),
  };
  const zoomApi = new Function('$', `${zoomSource}\nreturn { lightboxZoomState, setLightboxZoom, adjustLightboxZoom, setLightboxPan, lightboxPanBounds, lightboxWheelMode };`)(() => zoomImage);
  zoomApi.adjustLightboxZoom(-100, 200, 350);
  assert.ok(zoomApi.lightboxZoomState.scale > 1);
  assert.deepEqual({ x: zoomApi.lightboxZoomState.x, y: zoomApi.lightboxZoomState.y }, { x: 25, y: 50 });
  zoomApi.setLightboxZoom(20);
  assert.equal(zoomApi.lightboxZoomState.scale, 4);
  zoomApi.setLightboxZoom(2);
  zoomApi.setLightboxPan(1000, -1000);
  assert.deepEqual(
    { panX: zoomApi.lightboxZoomState.panX, panY: zoomApi.lightboxZoomState.panY },
    { panX: 100, panY: -300 },
  );
  zoomImage.naturalWidth = 100;
  zoomImage.naturalHeight = 600;
  zoomApi.setLightboxZoom(1);
  zoomApi.setLightboxZoom(2, 300, 350);
  zoomApi.setLightboxPan(1000, 1000);
  assert.equal(zoomApi.lightboxZoomState.panX, 0);
  assert.equal(zoomApi.lightboxWheelMode({ ctrlKey: false, shiftKey: false, deltaMode: 0, deltaX: 3, deltaY: 4 }), 'pan');
  assert.equal(zoomApi.lightboxWheelMode({ ctrlKey: true, shiftKey: false, deltaMode: 0, deltaX: 0, deltaY: -4 }), 'zoom');
  zoomApi.setLightboxZoom(-20);
  assert.deepEqual(
    { scale: zoomApi.lightboxZoomState.scale, panX: zoomApi.lightboxZoomState.panX, panY: zoomApi.lightboxZoomState.panY },
    { scale: 1, panX: 0, panY: 0 },
  );
});

test('Escape closes only the focused gallery layer and the close button unwinds history', () => {
  assert.match(app, /if \(event\.key === 'Escape'\) \{\r?\n    closeLightbox\(\);\r?\n    return;/);
  assert.match(app, /\|\| \$\('#compare'\)\.classList\.contains\('show'\)[\s\S]*\|\| \$\('\.sheet\.show'\)[\s\S]*\|\| \$\('#appDrawer'\)\.classList\.contains\('show'\)[\s\S]*\|\| actionMenuEl/);
  assert.match(app, /event\.key === 'Escape' && \$\('#appDrawer'\)\.classList\.contains\('show'\)[\s\S]*event\.preventDefault\(\)[\s\S]*closeAppDrawer\(\)/);
  assert.match(app, /\$\('#lbClose'\)\.addEventListener\('click', \(\) => closeLightbox\(\)\)/);
});
