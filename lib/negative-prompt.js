'use strict';

const MAX_NEGATIVE_PROMPT_LENGTH = 4000;

function normalizeNegativePrompt(value) {
  return String(value || '').trim().slice(0, MAX_NEGATIVE_PROMPT_LENGTH);
}

function combineNegativePrompts(base, custom) {
  const builtIn = normalizeNegativePrompt(base);
  const user = normalizeNegativePrompt(custom);
  if (!builtIn) return user;
  if (!user) return builtIn;
  return `${builtIn}, ${user}`.slice(0, MAX_NEGATIVE_PROMPT_LENGTH);
}

module.exports = {
  MAX_NEGATIVE_PROMPT_LENGTH,
  combineNegativePrompts,
  normalizeNegativePrompt,
};
