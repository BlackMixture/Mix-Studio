'use strict';

(function exposeH3Resolution(root) {
  const BASE_SHORT_EDGE = 768;
  const MAX_PIXELS = 768 * 1344;
  const MULTIPLE = 32;
  const XL_SIZE = 3;
  const XL_SCALE = 10 / 7;
  // Keep the existing shared S/M/L control values while giving H3 useful
  // lower-memory canvases. L is the model's native canvas; M and S reduce
  // each edge so their latent memory use falls substantially.
  const SIZE_SCALES = Object.freeze({
    0.75: 0.5,
    1: 0.75,
    1.75: 1,
    [XL_SIZE]: XL_SCALE,
  });

  function sizeScale(size = 1.75) {
    const requested = Number(size);
    if (requested >= XL_SIZE) return SIZE_SCALES[XL_SIZE];
    if (requested <= 0.75) return SIZE_SCALES[0.75];
    if (requested >= 1.75) return SIZE_SCALES[1.75];
    return SIZE_SCALES[1];
  }

  function dimensions(width, height, size = 1.75) {
    const requestedWidth = Number(width);
    const requestedHeight = Number(height);
    // Callers may provide either pixel dimensions (9, 16) or a normalized
    // aspect ratio (9 / 16, 1). Preserve positive fractional values: clamping
    // each side to 1 turns every portrait ratio into a square.
    const sourceWidth = Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : 1344;
    const sourceHeight = Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : 768;
    const ratio = sourceWidth / sourceHeight;
    let nominalWidth;
    let nominalHeight;
    if (ratio >= 1) {
      nominalWidth = BASE_SHORT_EDGE * ratio;
      nominalHeight = BASE_SHORT_EDGE;
    } else {
      nominalWidth = BASE_SHORT_EDGE;
      nominalHeight = BASE_SHORT_EDGE / ratio;
    }
    if (nominalWidth * nominalHeight > MAX_PIXELS) {
      const scale = Math.sqrt(MAX_PIXELS / (nominalWidth * nominalHeight));
      nominalWidth *= scale;
      nominalHeight *= scale;
    }
    const scale = sizeScale(size);
    return {
      width: Math.max(MULTIPLE, Math.round((nominalWidth * scale) / MULTIPLE) * MULTIPLE),
      height: Math.max(MULTIPLE, Math.round((nominalHeight * scale) / MULTIPLE) * MULTIPLE),
    };
  }

  const api = Object.freeze({ BASE_SHORT_EDGE, MAX_PIXELS, MULTIPLE, XL_SIZE, XL_SCALE, SIZE_SCALES, sizeScale, dimensions });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.H3Resolution = api;
})(typeof window !== 'undefined' ? window : globalThis);
