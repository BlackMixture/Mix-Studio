'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CREATIVE_RESOLUTION_INSTRUCTION,
  ENHANCE_TAIL,
  cleanGeneratedPrompt,
  promptEnhanceParts,
} = require('../lib/prompt-enhance');

test('creative enhancement resolves abstract requests into visible scenes', () => {
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /abstract/i);
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /one specific, visually compelling scenario/i);
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /body language/i);
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /make an image of/i);
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /Krea 2/i);
});

test('creative enhancement preserves concrete scene prompts', () => {
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /already describes a concrete visual scene/i);
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /preserve its subjects, actions, relationships, medium/i);
});

test('prompt enhancement clearly separates instructions from user input', () => {
  const parts = promptEnhanceParts("Custom system prompt\n\nUser's Input:", 'make an image of the happiest day on earth');

  assert.match(parts.instruction, /^Custom system prompt/);
  assert.match(parts.instruction, /Creative-brief handling/);
  assert.doesNotMatch(parts.instruction, /Custom system prompt\s+User's Input:/);
  assert.equal(
    parts.userInput,
    `<user_input>\nmake an image of the happiest day on earth\n</user_input>${ENHANCE_TAIL}`
  );
  assert.match(parts.userInput, /<final_prompt> XML element containing the finished prompt/);
  assert.doesNotMatch(parts.userInput, /the final prompt paragraph/i);
});

test('generated prompt cleanup rejects copied placeholder text', () => {
  assert.equal(cleanGeneratedPrompt('<final_prompt>the final prompt paragraph</final_prompt>', ''), '');
  assert.equal(cleanGeneratedPrompt('<final_prompt>Write the actual prompt here</final_prompt>', ''), '');
  assert.equal(
    cleanGeneratedPrompt('<think>planning</think><final_prompt>The camera slowly pushes toward the subject while fabric moves in the breeze.</final_prompt>', ''),
    'The camera slowly pushes toward the subject while fabric moves in the breeze.'
  );
});
