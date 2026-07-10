'use strict';

const EDIT_ANGLE_ENGINES = new Set(['qwen', 'klein4', 'klein9']);
const EDIT_ANGLE_AZIMUTHS = {
  front: 'front view',
  'front-right': 'front-right quarter view',
  right: 'right side view',
  'back-right': 'back-right quarter view',
  back: 'back view',
  'back-left': 'back-left quarter view',
  left: 'left side view',
  'front-left': 'front-left quarter view',
};
const EDIT_ANGLE_ELEVATIONS = new Set(['low-angle', 'eye-level', 'elevated', 'high-angle']);
const EDIT_ANGLE_DISTANCES = new Set(['close-up', 'medium shot', 'wide shot']);

function supportsEditAngles(engine) {
  return EDIT_ANGLE_ENGINES.has(String(engine || ''));
}

function normalizeEditAngle(value) {
  if (!value || typeof value !== 'object') return null;
  const view = String(value.view || '');
  const elevation = String(value.elevation || 'eye-level');
  const distance = String(value.distance || 'medium shot');
  if (!EDIT_ANGLE_AZIMUTHS[view] || !EDIT_ANGLE_ELEVATIONS.has(elevation) || !EDIT_ANGLE_DISTANCES.has(distance)) return null;
  return { view, elevation, distance };
}

function qwenEditAnglePrompt(angle) {
  return `<sks> ${EDIT_ANGLE_AZIMUTHS[angle.view]} ${angle.elevation} shot ${angle.distance}`;
}

function kleinEditAnglePrompt(angle) {
  return [
    `Re-render the same subject from a ${EDIT_ANGLE_AZIMUTHS[angle.view]}, using a ${angle.elevation} shot with ${angle.distance} framing`,
    'Preserve the subject identity, clothing, proportions, materials, lighting, environment, and visual style',
    'Infer unseen surfaces as a coherent continuation of the same subject',
    'Show one image from only this new viewpoint; do not make a collage, split screen, turntable, or duplicate subject',
  ].join('. ');
}

function editAnglePrompt(engine, angle, userPrompt = '') {
  const instruction = engine === 'qwen' ? qwenEditAnglePrompt(angle) : kleinEditAnglePrompt(angle);
  return [instruction, String(userPrompt || '').trim()].filter(Boolean).join('. ');
}

module.exports = {
  EDIT_ANGLE_ENGINES,
  normalizeEditAngle,
  supportsEditAngles,
  qwenEditAnglePrompt,
  kleinEditAnglePrompt,
  editAnglePrompt,
};
