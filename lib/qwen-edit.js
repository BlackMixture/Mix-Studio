'use strict';

const QWEN_EDIT_PRESETS = Object.freeze({
  fast: Object.freeze({
    id: 'fast',
    steps: 4,
    cfg: 1,
    lightning: true,
  }),
  quality: Object.freeze({
    id: 'quality',
    steps: 20,
    cfg: 4,
    lightning: false,
  }),
});

function normalizeQwenEditQuality(value) {
  return value === 'fast' ? 'fast' : 'quality';
}

function qwenEditPreset(value) {
  return QWEN_EDIT_PRESETS[normalizeQwenEditQuality(value)];
}

module.exports = {
  QWEN_EDIT_PRESETS,
  normalizeQwenEditQuality,
  qwenEditPreset,
};
