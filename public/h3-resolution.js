'use strict';

(function exposeH3Resolution(root) {
  const BASE_SHORT_EDGE = 768;
  const MAX_PIXELS = 768 * 1344;
  const MULTIPLE = 32;
  // Keep the existing shared S/M/L control values while giving H3 useful
  // lower-memory canvases. L is the model's native canvas; M and S reduce
  // each edge so their latent memory use falls substantially.
  const SIZE_SCALES = Object.freeze({
    0.75: 0.5,
    1: 0.75,
    1.75: 1,
  });

  function sizeScale(size = 1.75) {
    const requested = Number(size);
    if (requested <= 0.75) return SIZE_SCALES[0.75];
    if (requested >= 1.75) return SIZE_SCALES[1.75];
    return SIZE_SCALES[1];
  }

  function dimensions(width, height, size = 1.75) {
    const sourceWidth = Math.max(1, Number(width) || 1344);
    const sourceHeight = Math.max(1, Number(height) || 768);
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

  const api = Object.freeze({ BASE_SHORT_EDGE, MAX_PIXELS, MULTIPLE, SIZE_SCALES, sizeScale, dimensions });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.H3Resolution = api;
})(typeof window !== 'undefined' ? window : globalThis);
