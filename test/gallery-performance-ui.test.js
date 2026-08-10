'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('offscreen gallery cards retain square layout without permanent GPU promotion', () => {
  assert.match(css, /\.card \{[\s\S]*?aspect-ratio: 1;/);
  assert.match(css, /@supports \(content-visibility: auto\) \{[\s\S]*?#galleryGrid \.card \{[\s\S]*?content-visibility: auto;[\s\S]*?contain-intrinsic-size: auto 240px;/);
  const transitionRule = css.match(/\.card \{\s*transform: scale\(1\);[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(transitionRule, 'gallery transition rule should exist');
  assert.doesNotMatch(transitionRule, /will-change/);
  assert.match(css, /\.card\.selected,[\s\S]*?\.card\.is-dragging \{ will-change: transform; \}/);
});

test('gallery rebuilds batch DOM insertion and decode thumbnails asynchronously', () => {
  const renderStart = app.indexOf('function renderGrid()');
  const renderEnd = app.indexOf('function setDesktopLibraryStageSelection', renderStart);
  const renderGrid = app.slice(renderStart, renderEnd);
  assert.match(renderGrid, /const fragment = document\.createDocumentFragment\(\)/);
  assert.match(renderGrid, /fragment\.appendChild\(divider\)/);
  assert.match(renderGrid, /fragment\.appendChild\(card\)/);
  assert.match(renderGrid, /grid\.appendChild\(fragment\)/);
  assert.match(renderGrid, /img\.loading = 'lazy';\s*img\.decoding = 'async';/);
});

test('temporary media URLs and hidden gallery videos are explicitly released', () => {
  assert.match(app, /function releaseAssetObjectUrl\(asset, replacement = null\)/);
  assert.match(app, /function releaseCurrentVideoAssetUrls\(\)/);
  assert.match(app, /function setVideoFirstFrame[\s\S]*?releaseAssetObjectUrls\(\[state\.vidRef\], \[asset, state\.vidEnd\]\)/);
  assert.match(app, /function setH3ReplacementAsset[\s\S]*?releaseAssetObjectUrl\(state\.vidH3ReplaceVideo, asset\)/);
  assert.match(app, /function unloadGalleryPreview\(video\)[\s\S]*?video\.removeAttribute\('src'\)[\s\S]*?video\.load\(\)/);
  assert.match(app, /function suspendGalleryPreviewPlayback\(\)[\s\S]*?unloadGalleryPreview\(video\)/);
  assert.match(app, /if \(!isGallery\) \{[\s\S]{0,160}suspendGalleryPreviewPlayback\(\);[\s\S]{0,40}\}/);
  assert.match(app, /document\.hidden \|\| !galleryPreviewMotionAllowed\(\)[\s\S]*?suspendGalleryPreviewPlayback\(\)/);
});

test('desktop side library previews play on hover without restoring background autoplay', () => {
  assert.match(app, /function desktopSideLibraryHoverPreviewAllowed\(\)[\s\S]*?desktopWorkspaceActive\(\)[\s\S]*?desktopResolutionPickerQuery\.matches[\s\S]*?state\.view !== 'gallery'/);
  assert.match(app, /function startDesktopSideLibraryPreview\(video\)[\s\S]*?galleryPreviewActive = new Set\(\[video\]\);[\s\S]*?playGalleryPreview\(video\)/);
  assert.match(app, /function stopDesktopSideLibraryPreview\(video\)[\s\S]*?galleryPreviewActive\.delete\(video\)[\s\S]*?unloadGalleryPreview\(video\)/);
  assert.match(app, /card\.addEventListener\('pointerenter', \(\) => startDesktopSideLibraryPreview\(preview\)/);
  assert.match(app, /card\.addEventListener\('pointerleave', \(\) => stopDesktopSideLibraryPreview\(preview\)/);
  assert.match(app, /function resetGalleryPreviewObservation\(\)[\s\S]*?if \(state\.view !== 'gallery' \|\| galleryPreviewWakePending\) return;[\s\S]*?galleryPreviewObserver\.observe\(video\)/);
});

test('background polling pauses while the app is hidden', () => {
  assert.match(app, /if \(!document\.hidden\) loadMeta\(\)/);
  assert.match(app, /if \(!document\.hidden\) refreshQueue\(\)/);
  assert.match(app, /state\.profile && !document\.hidden/);
});
