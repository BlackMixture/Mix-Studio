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
  const angle = {};
  if (value.view != null && value.view !== '') {
    const view = String(value.view);
    if (!EDIT_ANGLE_AZIMUTHS[view]) return null;
    angle.view = view;
  }
  if (value.elevation != null && value.elevation !== '') {
    const elevation = String(value.elevation);
    if (!EDIT_ANGLE_ELEVATIONS.has(elevation)) return null;
    angle.elevation = elevation;
  }
  if (value.distance != null && value.distance !== '') {
    const distance = String(value.distance);
    if (!EDIT_ANGLE_DISTANCES.has(distance)) return null;
    angle.distance = distance;
  }
  return Object.keys(angle).length ? angle : null;
}

function qwenEditAnglePrompt(angle) {
  return [
    '<sks>',
    angle.view ? EDIT_ANGLE_AZIMUTHS[angle.view] : '',
    angle.elevation ? `${angle.elevation} shot` : '',
    angle.distance || '',
  ].filter(Boolean).join(' ');
}

function kleinEditAnglePrompt(angle) {
  const camera = [
    angle.view ? `from a ${EDIT_ANGLE_AZIMUTHS[angle.view]}` : '',
    angle.elevation ? `using a ${angle.elevation} shot` : '',
    angle.distance ? `with ${angle.distance} framing` : '',
  ].filter(Boolean).join(', ');
  return [
    `Re-render the same subject ${camera}`,
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
