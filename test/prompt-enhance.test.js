'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CREATIVE_RESOLUTION_INSTRUCTION,
  REGIONAL_PROMPT_INSTRUCTION,
  ENHANCE_TAIL,
  H3_PROMPT_CRAFT_INSTRUCTION,
  H3_PROMPT_ENHANCE_INSTRUCTION,
  H3_MOTION_INSTRUCTION,
  cleanGeneratedPrompt,
  h3PromptEnhanceParts,
  h3TimelineGuidance,
  motionPromptEnhanceParts,
  promptEnhanceParts,
  regionPromptEnhanceParts,
  videoPromptRevisionParts,
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

test('regional enhancement stays inside the selected box and keeps scene context separate', () => {
  const parts = regionPromptEnhanceParts(
    "Custom system prompt\n\nUser's Input:",
    'cinematic fashion editorial in a marble lobby',
    'woman in a red velvet jacket',
    { hasReference: true },
  );

  assert.match(REGIONAL_PROMPT_INSTRUCTION, /only the selected region/i);
  assert.match(REGIONAL_PROMPT_INSTRUCTION, /Do not repeat the whole composition/i);
  assert.match(REGIONAL_PROMPT_INSTRUCTION, /Do not invent placement/i);
  assert.match(parts.instruction, /reference image is attached/i);
  assert.match(parts.userInput, /<global_scene_context>\ncinematic fashion editorial in a marble lobby\n<\/global_scene_context>/);
  assert.match(parts.userInput, /<region_input>\nwoman in a red velvet jacket\n<\/region_input>/);
  assert.ok(parts.userInput.endsWith(ENHANCE_TAIL));
});

test('generated prompt cleanup rejects copied placeholder text', () => {
  assert.equal(cleanGeneratedPrompt('<final_prompt>the final prompt paragraph</final_prompt>', ''), '');
  assert.equal(cleanGeneratedPrompt('<final_prompt>Write the actual prompt here</final_prompt>', ''), '');
  assert.equal(
    cleanGeneratedPrompt('<think>planning</think><final_prompt>The camera slowly pushes toward the subject while fabric moves in the breeze.</final_prompt>', ''),
    'The camera slowly pushes toward the subject while fabric moves in the breeze.'
  );
});

test('H3 first-frame motion enhancement requests chronological motion and native audio', () => {
  const parts = motionPromptEnhanceParts('The character waves, then turns toward the window.', {
    engine: 'h3',
    seconds: 12,
  });

  assert.match(H3_MOTION_INSTRUCTION, /chronological/i);
  assert.match(H3_MOTION_INSTRUCTION, /native stereo audio/i);
  assert.match(H3_MOTION_INSTRUCTION, /otherwise do not force dialogue/i);
  assert.match(H3_MOTION_INSTRUCTION, /identified speaker and lip-sync direction/i);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /timestamped storyboard beats/i);
  assert.match(parts.instruction, /Duration plan for 12 seconds/);
  assert.match(parts.instruction, /up to four distinct camera angles and three motivated cuts/i);
  assert.match(parts.userInput, /<user_motion_idea>\nThe character waves, then turns toward the window\.\n<\/user_motion_idea>/);
  assert.ok(parts.userInput.endsWith(ENHANCE_TAIL));
});

test('H3 prompt planning scales cuts to duration instead of overstuffing short clips', () => {
  assert.match(h3TimelineGuidance(5), /one continuous shot/i);
  assert.match(h3TimelineGuidance(5), /3-4 very short timestamped shots/i);
  assert.match(h3TimelineGuidance(10), /2-4 timestamped storyboard beats/i);
  assert.match(h3TimelineGuidance(15), /3-5 timestamped storyboard beats/i);
});

test('H3 prompt enhancement is duration-aware and preserves reference-mode inputs', () => {
  const parts = h3PromptEnhanceParts(
    'Use <Picture 1> for the host and <Audio 1> for the performance.',
    { seconds: 10, mode: 'reference', hasImage: true },
  );

  assert.match(H3_PROMPT_ENHANCE_INSTRUCTION, /beginning, development, and ending/i);
  assert.match(H3_PROMPT_ENHANCE_INSTRUCTION, /timestamped shots and cuts/i);
  assert.match(H3_PROMPT_ENHANCE_INSTRUCTION, /dialogue is optional/i);
  assert.match(H3_PROMPT_ENHANCE_INSTRUCTION, /identify who says each quoted line/i);
  assert.match(parts.instruction, /visual reference is attached/i);
  assert.match(parts.instruction, /2-4 timestamped storyboard beats/i);
  assert.match(parts.instruction, /up to three distinct camera angles and two motivated cuts/i);
  assert.match(parts.instruction, /Preserve every <Picture n>, <Video n>, and <Audio n>/);
  assert.match(parts.userInput, /<user_video_prompt>\nUse <Picture 1> for the host and <Audio 1> for the performance\.\n<\/user_video_prompt>/);
  assert.ok(parts.userInput.endsWith(ENHANCE_TAIL));
});

test('video prompt revision preserves H3 reference tags and adds duration-aware shot craft', () => {
  const parts = videoPromptRevisionParts(
    'Use <Picture 1> as the hero and <Audio 1> as the soundtrack.',
    'Add a low-angle reveal after the close-up.',
    { engine: 'h3', seconds: 10, mode: 'reference', hasImage: true },
  );

  assert.match(parts.instruction, /source image is attached/i);
  assert.match(parts.instruction, /Preserve every <Picture n>, <Video n>, and <Audio n>/);
  assert.match(parts.instruction, /up to three distinct camera angles and two motivated cuts/i);
  assert.match(parts.userInput, /<current_prompt>[\s\S]*<Picture 1>[\s\S]*<Audio 1>[\s\S]*<\/current_prompt>/);
  assert.match(parts.userInput, /<change_request>[\s\S]*low-angle reveal[\s\S]*<\/change_request>/);
});
