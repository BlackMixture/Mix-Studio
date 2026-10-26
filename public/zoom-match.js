'use strict';

// Pure geometry for keeping the same zoom and region when comparing an
// original with its generated result. Shared by the browser (window.ZoomMatch)
// and node tests. All image positions are normalized: u, v in [0, 1] across
// the displayed image content, so two images with the same aspect ratio map
// one-to-one even when their pixel sizes differ (for example after upscaling).
(function initZoomMatch(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ZoomMatch = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const ASPECT_TOLERANCE = 0.015;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // True when two images share an aspect ratio closely enough that the same
  // normalized region shows the same content in both.
  function sameAspect(aWidth, aHeight, bWidth, bHeight, tolerance = ASPECT_TOLERANCE) {
    const a = finite(aWidth) / finite(aHeight);
    const b = finite(bWidth) / finite(bHeight);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
    return Math.abs(a - b) / Math.max(a, b) <= tolerance;
  }

  // object-fit: contain placement of an image inside its element box.
  function containedContent(boxWidth, boxHeight, naturalWidth, naturalHeight) {
    const width = Math.max(0, finite(boxWidth));
    const height = Math.max(0, finite(boxHeight));
    const imageWidth = Math.max(0, finite(naturalWidth));
    const imageHeight = Math.max(0, finite(naturalHeight));
    if (!width || !height || !imageWidth || !imageHeight) {
      return { left: 0, top: 0, width, height };
    }
    const fit = Math.min(width / imageWidth, height / imageHeight);
    return {
      left: (width - imageWidth * fit) / 2,
      top: (height - imageHeight * fit) / 2,
      width: imageWidth * fit,
      height: imageHeight * fit,
    };
  }

  // The lightbox scales its image with transform-origin (originX%, originY%)
  // and then translates by (panX, panY). Return the normalized image point at
  // the center of the viewport, plus the zoom relative to the fitted image.
  function lightboxFocus(view = {}) {
    const boxWidth = Math.max(0, finite(view.boxWidth));
    const boxHeight = Math.max(0, finite(view.boxHeight));
    const scale = Math.max(1, finite(view.scale, 1));
    const content = containedContent(boxWidth, boxHeight, view.naturalWidth, view.naturalHeight);
    if (!boxWidth || !boxHeight || !content.width || !content.height) return { u: 0.5, v: 0.5, zoom: scale };
    const originX = (finite(view.originX, 50) / 100) * boxWidth;
    const originY = (finite(view.originY, 50) / 100) * boxHeight;
    const centerX = originX + (boxWidth / 2 - finite(view.panX) - originX) / scale;
    const centerY = originY + (boxHeight / 2 - finite(view.panY) - originY) / scale;
    return {
      u: clamp((centerX - content.left) / content.width, 0, 1),
      v: clamp((centerY - content.top) / content.height, 0, 1),
      zoom: scale,
    };
  }

  // Inverse of lightboxFocus: the transform-origin (percent of the box) and
  // pan that put the normalized point (u, v) at the viewport center at
  // `zoom`. The caller clamps the pan to its own bounds.
  function lightboxView(focus = {}, view = {}) {
    const boxWidth = Math.max(0, finite(view.boxWidth));
    const boxHeight = Math.max(0, finite(view.boxHeight));
    const scale = Math.max(1, finite(focus.zoom, 1));
    const content = containedContent(boxWidth, boxHeight, view.naturalWidth, view.naturalHeight);
    if (!boxWidth || !boxHeight || !content.width || !content.height) {
      return { scale, originX: 50, originY: 50, panX: 0, panY: 0 };
    }
    const pointX = content.left + clamp(finite(focus.u, 0.5), 0, 1) * content.width;
    const pointY = content.top + clamp(finite(focus.v, 0.5), 0, 1) * content.height;
    return {
      scale,
      originX: (pointX / boxWidth) * 100,
      originY: (pointY / boxHeight) * 100,
      panX: boxWidth / 2 - pointX,
      panY: boxHeight / 2 - pointY,
    };
  }

  // The comparison stage scales both images about the stage center and then
  // translates by (x, y). Return the translation that puts the normalized
  // point (u, v) at the stage center at the given zoom, clamped so the image
  // never leaves an empty edge, which is how the comparison itself clamps.
  function compareView(focus = {}, stage = {}, limits = {}) {
    const minZoom = finite(limits.minZoom, 1);
    const maxZoom = finite(limits.maxZoom, 6);
    const zoom = clamp(finite(focus.zoom, 1), minZoom, maxZoom);
    const stageWidth = Math.max(0, finite(stage.width));
    const stageHeight = Math.max(0, finite(stage.height));
    const content = containedContent(stageWidth, stageHeight, stage.naturalWidth, stage.naturalHeight);
    if (!content.width || !content.height || zoom <= 1) return { zoom, x: 0, y: 0 };
    const u = clamp(finite(focus.u, 0.5), 0, 1);
    const v = clamp(finite(focus.v, 0.5), 0, 1);
    const maxX = Math.max(0, (content.width * zoom - stageWidth) / 2);
    const maxY = Math.max(0, (content.height * zoom - stageHeight) / 2);
    const x = clamp(-(u - 0.5) * content.width * zoom, -maxX, maxX);
    const y = clamp(-(v - 0.5) * content.height * zoom, -maxY, maxY);
    return { zoom, x: Math.round(x * 100) / 100 || 0, y: Math.round(y * 100) / 100 || 0 };
  }

  return Object.freeze({
    ASPECT_TOLERANCE,
    compareView,
    containedContent,
    lightboxFocus,
    lightboxView,
    sameAspect,
  });
}));
