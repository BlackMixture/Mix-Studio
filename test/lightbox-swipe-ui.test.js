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
  assert.match(app, /function openFocusedGalleryItem\(item, media\)/);
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

test('focused gallery images zoom by click or keyboard and reset across navigation', () => {
  assert.match(html, /id="lbImg"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-label="Zoom in image"[^>]*aria-pressed="false"[^>]*aria-keyshortcuts="Enter Space"[^>]*draggable="false"/);
  assert.match(app, /const lightboxZoomState = \{ active: false, x: 50, y: 50 \}/);
  assert.match(app, /function lightboxZoomOrigin\(image, clientX, clientY\)/);
  assert.match(app, /function toggleLightboxZoom\(clientX, clientY\)/);
  assert.match(app, /tap\.timer = setTimeout\([\s\S]*toggleLightboxZoom\(tap\.clientX, tap\.clientY\)[\s\S]*310\)/);
  assert.match(app, /if \(lightboxTap\?\.timer\) clearTimeout\(lightboxTap\.timer\)/);
  assert.ok((app.match(/clearLightboxTap\(\);\n  resetLightboxZoom\(\);/g) || []).length >= 2);
  assert.match(app, /if \(lightboxZoomState\.active && e\.target === \$\('#lbImg'\)\) return/);
  assert.match(app, /\$\('#lbImg'\)\.addEventListener\('keydown',[\s\S]*\['Enter', ' '\]\.includes\(event\.key\)[\s\S]*toggleLightboxZoom\(\)/);
  assert.match(css, /#lbImg \{[\s\S]*cursor: zoom-in;[\s\S]*transform-origin: var\(--lightbox-zoom-x, 50%\) var\(--lightbox-zoom-y, 50%\)/);
  assert.match(css, /#lbImg\.lightbox-zoomed \{[\s\S]*cursor: zoom-out;[\s\S]*transform: scale\(2\)/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*lightbox-img-wrap:not\(\.is-swiping\):not\(\.is-settling\) #lbImg/);

  const start = app.indexOf('function lightboxZoomOrigin(image, clientX, clientY)');
  const end = app.indexOf('function renderLightboxZoom()', start);
  const originSource = app.slice(start, end);
  const resolveOrigin = new Function(`${originSource}\nreturn lightboxZoomOrigin;`)();
  const image = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 }) };
  assert.deepEqual(resolveOrigin(image, 200, 150), { x: 25, y: 50 });
  assert.deepEqual(resolveOrigin(image, -100, 500), { x: 0, y: 100 });
  assert.deepEqual(resolveOrigin(image), { x: 50, y: 50 });
});

test('Escape closes only the focused gallery layer and the close button unwinds history', () => {
  assert.match(app, /if \(event\.key === 'Escape'\) \{\n    closeLightbox\(\);\n    return;/);
  assert.match(app, /\|\| \$\('#compare'\)\.classList\.contains\('show'\)[\s\S]*\|\| \$\('\.sheet\.show'\)[\s\S]*\|\| \$\('#appDrawer'\)\.classList\.contains\('show'\)[\s\S]*\|\| actionMenuEl/);
  assert.match(app, /event\.key === 'Escape' && \$\('#appDrawer'\)\.classList\.contains\('show'\)[\s\S]*event\.preventDefault\(\)[\s\S]*closeAppDrawer\(\)/);
  assert.match(app, /\$\('#lbClose'\)\.addEventListener\('click', \(\) => closeLightbox\(\)\)/);
});
