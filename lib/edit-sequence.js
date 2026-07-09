'use strict';

const crypto = require('crypto');

const SEQUENTIAL_EDIT_ENGINES = new Set(['klein4', 'klein9', 'qwen', 'krea2ref']);
const MAX_SEQUENCE_STEPS = 12;
const MAX_STEP_LENGTH = 800;

function supportsSequentialEdit(engine) {
  return SEQUENTIAL_EDIT_ENGINES.has(String(engine || ''));
}

function normalizeSequentialPrompts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((step) => String(step || '').trim().slice(0, MAX_STEP_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_SEQUENCE_STEPS);
}

function normalizeEditSequence(value, engine) {
  if (!value || typeof value !== 'object' || !supportsSequentialEdit(engine)) return null;
  const prompts = normalizeSequentialPrompts(value.prompts);
  if (prompts.length < 2) return null;
  const requestedIndex = Math.floor(Number(value.index));
  const index = Number.isFinite(requestedIndex)
    ? Math.max(0, Math.min(prompts.length - 1, requestedIndex))
    : 0;
  const suppliedId = String(value.id || '');
  const id = /^[a-z0-9_-]{8,96}$/i.test(suppliedId)
    ? suppliedId
    : `seq-${crypto.randomBytes(8).toString('hex')}`;
  return { id, prompts, index, total: prompts.length };
}

module.exports = {
  MAX_SEQUENCE_STEPS,
  SEQUENTIAL_EDIT_ENGINES,
  normalizeEditSequence,
  normalizeSequentialPrompts,
  supportsSequentialEdit,
};
