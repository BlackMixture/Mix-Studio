'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ZoomMatch = require('../public/zoom-match.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

// The lightbox transform as CSS applies it: scale about the origin, then pan.
function lightboxProject(point, view, box) {
  const originX = (view.originX / 100) * box.boxWidth;
  const originY = (view.originY / 100) * box.boxHeight;
  return {
    x: originX + (point.x - originX) * view.scale + view.panX,
    y: originY + (point.y - originY) * view.scale + view.panY,
  };
}

test('aspect matching tolerates rounding but not a different canvas shape', () => {
  assert.equal(ZoomMatch.sameAspect(1024, 1024, 2048, 2048), true);
  assert.equal(ZoomMatch.sameAspect(1216, 832, 1220, 832), true, 'bucket rounding');
  assert.equal(ZoomMatch.sameAspect(1024, 1024, 1536, 1024), false, 'an expanded canvas');
  assert.equal(ZoomMatch.sameAspect(0, 1024, 1024, 1024), false);
  assert.equal(ZoomMatch.sameAspect(undefined, undefined, 1024, 1024), false);
});

test('contained content letterboxes like object-fit: contain', () => {
  assert.deepEqual(ZoomMatch.containedContent(400, 600, 400, 200), { left: 0, top: 200, width: 400, height: 200 });
  assert.deepEqual(ZoomMatch.containedContent(800, 400, 1000, 1000), { left: 200, top: 0, width: 400, height: 400 });
});

test('the lightbox focus is the image point under the viewport center', () => {
  const box = { boxWidth: 800, boxHeight: 600, naturalWidth: 1600, naturalHeight: 1200 };
  assert.deepEqual(ZoomMatch.lightboxFocus(Object.assign({ scale: 1 }, box)), { u: 0.5, v: 0.5, zoom: 1 });
  // Zoomed 2x about the left-quarter point with no pan: that point stays put,
  // so the center shows the point halfway between it and the old center.
  const focus = ZoomMatch.lightboxFocus(Object.assign({ scale: 2, originX: 25, originY: 50, panX: 0, panY: 0 }, box));
  near(focus.u, 0.375);
  near(focus.v, 0.5);
  assert.equal(focus.zoom, 2);
});

test('lightboxView and lightboxFocus are inverses, including letterboxed images', () => {
  const box = { boxWidth: 900, boxHeight: 500, naturalWidth: 1024, naturalHeight: 1536 };
  for (const target of [{ u: 0.5, v: 0.5, zoom: 2 }, { u: 0.2, v: 0.7, zoom: 3.5 }, { u: 0.9, v: 0.1, zoom: 1.6 }]) {
    const view = ZoomMatch.lightboxView(target, box);
    const focus = ZoomMatch.lightboxFocus(Object.assign({}, box, {
      scale: view.scale, originX: view.originX, originY: view.originY, panX: view.panX, panY: view.panY,
    }));
    near(focus.u, target.u);
    near(focus.v, target.v);
    // The CSS transform really puts that point at the viewport center.
    const content = ZoomMatch.containedContent(box.boxWidth, box.boxHeight, box.naturalWidth, box.naturalHeight);
    const projected = lightboxProject({
      x: content.left + target.u * content.width,
      y: content.top + target.v * content.height,
    }, view, box);
    near(projected.x, box.boxWidth / 2);
    near(projected.y, box.boxHeight / 2);
  }
});

test('the comparison opens on the same normalized detail, clamped to the image edges', () => {
  const stage = { width: 1000, height: 700, naturalWidth: 2048, naturalHeight: 2048 };
  assert.deepEqual(ZoomMatch.compareView({ u: 0.3, v: 0.3, zoom: 1 }, stage), { zoom: 1, x: 0, y: 0 });
  const centered = ZoomMatch.compareView({ u: 0.5, v: 0.5, zoom: 3 }, stage);
  assert.deepEqual(centered, { zoom: 3, x: 0, y: 0 });
  // Fitted image is 700 x 700 centered in the stage. At 3x, (0.4, 0.6) sits
  // 70 px left and 70 px below center before zoom, so the pan is (+210, -210).
  assert.deepEqual(ZoomMatch.compareView({ u: 0.4, v: 0.6, zoom: 3 }, stage), { zoom: 3, x: 210, y: -210 });
  // A corner focus cannot pull the image past its own edge.
  const corner = ZoomMatch.compareView({ u: 0, v: 0, zoom: 2 }, stage);
  assert.deepEqual(corner, { zoom: 2, x: 200, y: 350 });
  assert.equal(ZoomMatch.compareView({ u: 0.5, v: 0.5, zoom: 9 }, stage).zoom, 6);
});

test('a lightbox detail survives the trip into the comparison at matching sizes', () => {
  // The result shown in the lightbox is the upscaled 2x image; the comparison
  // fits the same image into a different stage. The same image point lands at
  // the stage center at the same zoom relative to fit.
  const lightbox = { boxWidth: 1200, boxHeight: 800, naturalWidth: 2432, naturalHeight: 1664 };
  const view = ZoomMatch.lightboxView({ u: 0.62, v: 0.41, zoom: 2.5 }, lightbox);
  const focus = ZoomMatch.lightboxFocus(Object.assign({}, lightbox, { scale: view.scale, originX: view.originX, originY: view.originY, panX: view.panX, panY: view.panY }));
  const stage = { width: 1400, height: 900, naturalWidth: 2432, naturalHeight: 1664 };
  const compare = ZoomMatch.compareView(focus, stage);
  const content = ZoomMatch.containedContent(stage.width, stage.height, stage.naturalWidth, stage.naturalHeight);
  const centerOffsetX = (0.62 - 0.5) * content.width * compare.zoom + compare.x;
  const centerOffsetY = (0.41 - 0.5) * content.height * compare.zoom + compare.y;
  near(centerOffsetX, 0, 0.01);
  near(centerOffsetY, 0, 0.01);
  assert.equal(compare.zoom, 2.5);
});

test('edit results compare against their original with the lightbox zoom (#64)', () => {
  assert.ok(html.indexOf('/zoom-match.js') > 0 && html.indexOf('/zoom-match.js') < html.indexOf('/app.js'));
  // Hold-to-preview mirrors the lightbox transform when the shapes match.
  assert.match(app, /function syncLightboxReferenceZoom\(\)[\s\S]*--lightbox-zoom-scale[\s\S]*classList\.toggle\('zoom-matched', matched\)/);
  assert.match(app, /function renderLightboxZoom\(\)[\s\S]*?syncLightboxReferenceZoom\(\);\r?\n\}/);
  assert.match(app, /const zoomMatched = syncLightboxReferenceZoom\(\);[\s\S]*referencePreview\.classList\.add\('active'\)/);
  assert.match(css, /\.lightbox-reference-preview \{ transform-origin: var\(--lightbox-zoom-x, 50%\) var\(--lightbox-zoom-y, 50%\); \}/);
  assert.match(css, /\.lightbox-reference-preview\.zoom-matched \{\s*transform: translate3d\(var\(--lightbox-pan-x, 0px\), var\(--lightbox-pan-y, 0px\), 0\) scale\(var\(--lightbox-zoom-scale, 1\)\);/);
  // Keyboard users can hold Space or Enter on the hold button.
  assert.match(app, /hb\.addEventListener\('keydown', \(event\) => \{\s*if \(!\[' ', 'Enter'\]\.includes\(event\.key\)[\s\S]*if \(!event\.repeat && !hb\.classList\.contains\('pressed'\)\) show\(event\);/);
  assert.match(app, /hb\.addEventListener\('keyup', \(event\) => \{[\s\S]*hide\(\);/);
  // Compare is offered for same-shape edits and opens on the current detail.
  assert.match(app, /function lightboxCompareKind\(it\)[\s\S]*if \(it\.upscaled\) return 'upscale';[\s\S]*it\.mode !== 'edit' \|\| !it\.sourceFile[\s\S]*ZoomMatch\.sameAspect\(source\.width, source\.height, it\.width, it\.height\)/);
  assert.match(app, /\$\('#lbCompareBtn'\)\.hidden = !compareKind;/);
  assert.match(app, /openCompare\(state\.currentItem, currentLightboxFocus\(\)\)/);
  assert.match(app, /\$\('#cmpA'\)\.src = '\/images\/' \+ \(edit \? it\.sourceFile : it\.file\);/);
  assert.match(app, /\$\('#cmpB'\)\.src = '\/images\/' \+ \(edit \? it\.file : it\.upscaled\);/);
  assert.match(app, /function applyComparePendingFocus\(\)[\s\S]*ZoomMatch\.compareView\(focus/);
  // Opening the original from a result keeps the same detail in view.
  assert.match(app, /openLightbox\(it\.sourceItemId, undefined, \{ zoomFocus: currentLightboxFocus\(\) \}\)/);
  assert.match(app, /lightboxPendingFocus = options\.zoomFocus && options\.zoomFocus\.zoom > 1/);
  assert.match(app, /if \(applyLightboxFocus\(pending\)\) return;/);
  // Closing the comparison returns to the same zoomed lightbox: the popstate
  // handler closes only the comparison when it is still showing.
  assert.match(app, /\$\('#cmpClose'\)\.addEventListener\('click', \(\) => \{[\s\S]*?try \{ history\.back\(\); return; \}[\s\S]*?\$\('#compare'\)\.classList\.remove\('show'\);\s*restoreCompareFocus\(\);\r?\n\}\);/);
  assert.match(app, /addEventListener\('popstate', \(\) => \{\s*if \(\$\('#compare'\)\.classList\.contains\('show'\)\) \{ \$\('#compare'\)\.classList\.remove\('show'\); restoreCompareFocus\(\); return; \}/);
  // Keyboard users land in Compare, can leave it with Escape, and return to
  // the control that opened it.
  assert.match(app, /function openCompare\(it, focus = null\)[\s\S]*?compareState\.returnFocus = document\.activeElement[\s\S]*?\$\('#cmpClose'\)\.focus\(\{ preventScroll: true \}\);\r?\n\}/);
  assert.match(app, /document\.addEventListener\('keydown', \(event\) => \{\s*if \(event\.key !== 'Escape' \|\| event\.defaultPrevented \|\| !\$\('#compare'\)\.classList\.contains\('show'\)\) return;\s*event\.preventDefault\(\);\s*\$\('#cmpClose'\)\.click\(\);/);
  assert.match(app, /function restoreCompareFocus\(\)[\s\S]*?next\.focus\(\{ preventScroll: true \}\);/);
  // Zooming or panning before the images load keeps the user's own view.
  assert.match(app, /function setCompareZoom\([\s\S]*?compareState\.pendingFocus = null;[\s\S]*?\r?\n\}/);
  assert.match(app, /function fitCompare\(\) \{\s*compareState\.pendingFocus = null;/);
  assert.equal((app.match(/compareState\.pendingFocus = null;/g) || []).length, 5);
});
