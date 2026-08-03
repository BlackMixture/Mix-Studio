'use strict';

(function exposeH3Resolution(root) {
  const BASE_SHORT_EDGE = 768;
  const MAX_PIXELS = 768 * 1344;
  const MULTIPLE = 32;

  function dimensions(width, height) {
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
    return {
      width: Math.max(MULTIPLE, Math.round(nominalWidth / MULTIPLE) * MULTIPLE),
      height: Math.max(MULTIPLE, Math.round(nominalHeight / MULTIPLE) * MULTIPLE),
    };
  }

  const api = Object.freeze({ BASE_SHORT_EDGE, MAX_PIXELS, MULTIPLE, dimensions });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.H3Resolution = api;
})(typeof window !== 'undefined' ? window : globalThis);
