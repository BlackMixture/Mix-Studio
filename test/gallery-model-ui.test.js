'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

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
  assert.match(app, /preview\.dataset\.src = '\/videos\/' \+ latestVideo\.file/);
  assert.match(app, /video\.dataset\.loaded !== 'true'/);
  assert.match(app, /function settleGalleryPreviewPlayback\(\)/);
  assert.match(app, /galleryPreviewActive = next/);
  assert.match(app, /setTimeout\(\(\) => scheduleGalleryPreviewPlayback\(0\), 150\)/);
  assert.match(app, /rootMargin: '-16% 0px -16% 0px'/);
  assert.match(app, /generation-count-badge/);
  assert.match(app, /grouped/);
  assert.match(css, /\.card \.badge\.attached-composite-badge[\s\S]*bottom: 8px/);
  assert.match(css, /\.card \.gallery-card-video/);
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
  assert.match(html, /id="setPreviewCache"[^>]*role="switch"/);
  assert.match(html, /id="previewCacheStatus"[^>]*aria-live="polite"/);
  assert.match(html, /id="previewCacheClear"/);
  assert.match(app, /mediaPreferences: \{[\s\S]*videoPreviews: true,[\s\S]*previewCache: false/);
  assert.match(app, /function saveMediaPreferences\(next\)/);
  assert.match(app, /function compressedPreviewResponse\(response\)/);
  assert.match(app, /window\.requestIdleCallback\(work/);
  assert.match(app, /run\.cache\.put\(source, compressed\)/);
  assert.match(app, /MAX_PREVIEW_CACHE_ITEMS = 250/);
});

test('focused media switchers use restrained active states and expose per-video likes', () => {
  assert.match(app, /videos\.forEach\(\(v, i\) => mkChip\(`Video \$\{i \+ 1\}`, v\.id, !!v\.liked\)\)/);
  assert.match(app, /className = 'chip' \+ /);
  assert.match(app, /lb-media-like/);
  assert.match(app, /vid\.load\(\)/);
  assert.match(css, /\.lb-media \.chip\.active/);
  assert.match(css, /\.lb-media-like/);
});
