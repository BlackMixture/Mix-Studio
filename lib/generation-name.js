'use strict';

const MAX_GENERATION_NAME = 80;
const SMART_NAME_WORD_LIMIT = 10;
const SMART_NAME_CHAR_LIMIT = 64;

const SMART_NAME_PREFIXES = [
  /^(?:please\s+)?(?:create|generate|make|render|show|depict|illustrate|animate)\s+(?:(?:an?|the)\s+)?(?:image|picture|photo|photograph|illustration|painting|render|scene|video|animation)\s+(?:of|showing|that shows)\s+/i,
  /^(?:please\s+)?(?:edit|change|transform|turn)\s+(?:the\s+)?(?:image|picture|photo|video)\s+(?:to|into|so(?:\s+that)?)\s+/i,
  /^(?:please\s+)?(?:create|generate|make|render|show|depict|illustrate|animate)\s+/i,
  /^(?:an?|the)\s+(?:image|picture|photo|photograph|illustration|painting|render|scene|video|animation)\s+(?:of|showing)\s+/i,
];

const TRAILING_NAME_WORDS = new Set([
  'a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
]);

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

function smartGenerationName(prompt, fallback = 'Untitled generation') {
  let phrase = normalizeGenerationName(prompt);
  for (const prefix of SMART_NAME_PREFIXES) {
    const next = phrase.replace(prefix, '');
    if (next !== phrase) {
      phrase = next;
      break;
    }
  }
  phrase = phrase
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/[.!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = [];
  for (const rawWord of phrase.split(' ')) {
    const word = rawWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’&+-]+$/gu, '');
    if (!word) continue;
    const candidate = [...words, word].join(' ');
    if (words.length >= SMART_NAME_WORD_LIMIT || candidate.length > SMART_NAME_CHAR_LIMIT) break;
    words.push(word);
  }
  while (words.length > 1 && TRAILING_NAME_WORDS.has(words[words.length - 1].toLocaleLowerCase())) words.pop();

  const defaultName = normalizeGenerationName(fallback) || 'Untitled generation';
  const name = words.join(' ') || defaultName;
  return name.charAt(0).toLocaleUpperCase() + name.slice(1);
}

function smartAssetFilename(prompt, uniqueId, extension = '.png', fallback = 'generation') {
  const name = smartGenerationName(prompt, fallback);
  const readable = generationFileStem({ name }, fallback)
    .toLocaleLowerCase()
    .replace(/_/g, '-')
    .slice(0, 48)
    .replace(/-+$/g, '');
  const suffix = String(uniqueId || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 8)
    .toLocaleLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,8}$/i.test(String(extension))
    ? String(extension).toLocaleLowerCase()
    : '.png';
  return `${readable || 'generation'}${suffix ? `-${suffix}` : ''}${safeExtension}`;
}

module.exports = {
  MAX_GENERATION_NAME,
  normalizeGenerationName,
  generationFileStem,
  smartGenerationName,
  smartAssetFilename,
};
