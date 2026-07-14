(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KreaCameraMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_CAMERA_MOTIONS = 3;

  const CAMERA_MOTIONS = Object.freeze([
    { id: 'pan-left', label: 'Pan left', family: 'Pan', glyph: '←', clause: 'pan smoothly to the left', step: 'a smooth pan to the left', detail: 'Rotate across the scene to the left' },
    { id: 'pan-right', label: 'Pan right', family: 'Pan', glyph: '→', clause: 'pan smoothly to the right', step: 'a smooth pan to the right', detail: 'Rotate across the scene to the right' },
    { id: 'tilt-up', label: 'Tilt up', family: 'Tilt', glyph: '↑', clause: 'tilt upward', step: 'an upward tilt', detail: 'Raise the camera view' },
    { id: 'tilt-down', label: 'Tilt down', family: 'Tilt', glyph: '↓', clause: 'tilt downward', step: 'a downward tilt', detail: 'Lower the camera view' },
    { id: 'dolly-in', label: 'Dolly in', family: 'Dolly', glyph: '↗', clause: 'dolly forward toward the subject', step: 'a forward dolly toward the subject', detail: 'Move the camera closer in space' },
    { id: 'dolly-out', label: 'Dolly out', family: 'Dolly', glyph: '↙', clause: 'dolly backward away from the subject', step: 'a backward dolly away from the subject', detail: 'Move the camera farther away' },
    { id: 'truck-left', label: 'Truck left', family: 'Truck', glyph: '⇠', clause: 'truck laterally to the left', step: 'a lateral truck to the left', detail: 'Slide left with visible parallax' },
    { id: 'truck-right', label: 'Truck right', family: 'Truck', glyph: '⇢', clause: 'truck laterally to the right', step: 'a lateral truck to the right', detail: 'Slide right with visible parallax' },
    { id: 'pedestal-up', label: 'Pedestal up', family: 'Pedestal', glyph: '⇡', clause: 'pedestal upward', step: 'an upward pedestal move', detail: 'Lift the camera vertically' },
    { id: 'pedestal-down', label: 'Pedestal down', family: 'Pedestal', glyph: '⇣', clause: 'pedestal downward', step: 'a downward pedestal move', detail: 'Lower the camera vertically' },
    { id: 'roll-cw', label: 'Roll clockwise', family: 'Roll', glyph: '↻', clause: 'roll clockwise', step: 'a clockwise roll', detail: 'Rotate around the lens axis' },
    { id: 'roll-ccw', label: 'Roll counterclockwise', family: 'Roll', glyph: '↺', clause: 'roll counterclockwise', step: 'a counterclockwise roll', detail: 'Rotate around the lens axis' },
    { id: 'zoom-in', label: 'Zoom in', family: 'Zoom', glyph: '+', clause: 'zoom in optically', step: 'an optical zoom in', detail: 'Narrow the field of view' },
    { id: 'zoom-out', label: 'Zoom out', family: 'Zoom', glyph: '−', clause: 'zoom out optically', step: 'an optical zoom out', detail: 'Widen the field of view' },
    {
      id: 'handheld-zoom-in', label: 'Handheld push in', family: 'Handheld', glyph: '+',
      clause: 'push in with subtle handheld camera movement', step: 'a subtle handheld push in',
      detail: 'Move closer with natural operator movement', collection: 'Handheld & FPV', previewRate: 1.15,
    },
    {
      id: 'handheld-zoom-out', label: 'Handheld pull out', family: 'Handheld', glyph: '−',
      clause: 'pull back with subtle handheld camera movement', step: 'a subtle handheld pull back',
      detail: 'Move away with natural operator movement', collection: 'Handheld & FPV', previewRate: 1.15,
    },
    {
      id: 'handheld-orbit-ccw', label: 'Handheld orbit CCW', family: 'Handheld', glyph: '↺',
      clause: 'orbit counterclockwise with subtle handheld movement', step: 'a handheld counterclockwise orbit',
      detail: 'Circle the subject counterclockwise', collection: 'Handheld & FPV', previewRate: 1.15,
    },
    {
      id: 'handheld-orbit-cw', label: 'Handheld orbit CW', family: 'Handheld', glyph: '↻',
      clause: 'orbit clockwise with subtle handheld movement', step: 'a handheld clockwise orbit',
      detail: 'Circle the subject clockwise', collection: 'Handheld & FPV', previewRate: 1.15,
    },
    {
      id: 'handheld-zoom-orbit-ccw', label: 'Push + orbit CCW', family: 'Handheld', glyph: '↺',
      clause: 'push in while subtly orbiting counterclockwise with handheld movement', step: 'a handheld push in with a counterclockwise orbit',
      detail: 'Compound close move with a subtle arc', collection: 'Handheld & FPV', previewRate: 1.15,
    },
    {
      id: 'handheld-zoom-orbit-cw', label: 'Push + orbit CW', family: 'Handheld', glyph: '↻',
      clause: 'push in while subtly orbiting clockwise with handheld movement', step: 'a handheld push in with a clockwise orbit',
      detail: 'Mirrored compound close move', collection: 'Handheld & FPV', previewRate: 1.15,
    },
    {
      id: 'fpv-zoom-track-left', label: 'FPV push + track left', family: 'FPV', glyph: '↙',
      clause: 'push in with an FPV camera, then track left', step: 'an FPV push in followed by a track left',
      detail: 'Fast compound move with lateral tracking', collection: 'Handheld & FPV', previewRate: 1,
    },
    {
      id: 'fpv-zoom-track-right', label: 'FPV push + track right', family: 'FPV', glyph: '↘',
      clause: 'push in with an FPV camera, then track right', step: 'an FPV push in followed by a track right',
      detail: 'Mirrored compound move with lateral tracking', collection: 'Handheld & FPV', previewRate: 1,
    },
    {
      id: 'fpv-orbit-ccw', label: 'FPV orbit CCW', family: 'FPV', glyph: '↺',
      clause: 'perform a fast FPV drone orbit counterclockwise', step: 'a fast counterclockwise FPV drone orbit',
      detail: 'Aggressive cinematic orbit', collection: 'Handheld & FPV', previewRate: 1,
    },
    {
      id: 'fpv-orbit-cw', label: 'FPV orbit CW', family: 'FPV', glyph: '↻',
      clause: 'perform a fast FPV drone orbit clockwise', step: 'a fast clockwise FPV drone orbit',
      detail: 'Mirrored aggressive cinematic orbit', collection: 'Handheld & FPV', previewRate: 1,
    },
  ].map((motion) => Object.freeze(Object.assign({}, motion, {
    asset: motion.asset || `${motion.id}.mp4`,
    collection: motion.collection || 'Core moves',
    previewRate: motion.previewRate || 2.25,
  }))));

  const MOTION_BY_ID = new Map(CAMERA_MOTIONS.map((motion) => [motion.id, motion]));

  function normalizeCameraMotions(value, limit = MAX_CAMERA_MOTIONS) {
    const ids = Array.isArray(value) ? value : [];
    const normalized = [];
    const seen = new Set();
    const cap = Math.max(0, Math.min(MAX_CAMERA_MOTIONS, Number(limit) || MAX_CAMERA_MOTIONS));
    for (const entry of ids) {
      const id = String(entry && typeof entry === 'object' ? entry.id : entry || '').trim();
      if (!MOTION_BY_ID.has(id) || seen.has(id)) continue;
      seen.add(id);
      normalized.push(id);
      if (normalized.length >= cap) break;
    }
    return normalized;
  }

  function cameraMotionPhrase(value) {
    const motions = normalizeCameraMotions(value).map((id) => MOTION_BY_ID.get(id));
    if (!motions.length) return '';
    if (motions.length === 1) return `Camera motion: ${motions[0].clause}.`;
    if (motions.length === 2) {
      return `Camera motion: begin with ${motions[0].step}, then use ${motions[1].step}.`;
    }
    return `Camera motion: begin with ${motions[0].step}, continue with ${motions[1].step}, and finish with ${motions[2].step}.`;
  }

  function stripCameraMotionPhrase(prompt, phrase) {
    const source = String(prompt || '');
    const target = String(phrase || '').trim();
    if (!target) return source.trim();
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return source
      .replace(new RegExp(`(?:\\s*[;,.]?\\s*)${escaped}`, 'gi'), ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim()
      .replace(/[;,]\s*$/, '');
  }

  function applyCameraMotionPrompt(prompt, previousPhrase, value) {
    const phrase = cameraMotionPhrase(value);
    const base = stripCameraMotionPhrase(prompt, previousPhrase);
    if (!phrase) return { prompt: base, phrase: '' };
    if (!base) return { prompt: phrase, phrase };
    const separator = /[.!?]$/.test(base) ? ' ' : '. ';
    return { prompt: `${base}${separator}${phrase}`, phrase };
  }

  function ensureCameraMotionPrompt(prompt, value) {
    const phrase = cameraMotionPhrase(value);
    const source = String(prompt || '').trim();
    if (!phrase || source.toLowerCase().includes(phrase.toLowerCase())) return source;
    if (!source) return phrase;
    return `${source}${/[.!?]$/.test(source) ? ' ' : '. '}${phrase}`;
  }

  function cameraMotionById(id) {
    return MOTION_BY_ID.get(String(id || '')) || null;
  }

  return {
    CAMERA_MOTIONS,
    MAX_CAMERA_MOTIONS,
    applyCameraMotionPrompt,
    cameraMotionById,
    cameraMotionPhrase,
    ensureCameraMotionPrompt,
    normalizeCameraMotions,
    stripCameraMotionPhrase,
  };
});
