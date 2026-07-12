'use strict';

const MAX_GENERATION_NAME = 80;

function normalizeGenerationName(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_GENERATION_NAME)
    .trim();
}

function generationFileStem(item, fallback = 'generation') {
  const preferred = normalizeGenerationName(item && item.name)
    || String((item && item.prompt) || fallback).trim();
  const withoutExtension = preferred.replace(/\.[a-z0-9]{1,8}$/i, '');
  return withoutExtension
    .slice(0, 64)
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    || String(fallback || 'generation').replace(/[^a-z0-9]+/gi, '_')
    || 'generation';
}

module.exports = {
  MAX_GENERATION_NAME,
  normalizeGenerationName,
  generationFileStem,
};
