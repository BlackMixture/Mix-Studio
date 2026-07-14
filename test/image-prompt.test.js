'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  IMAGE_RECREATION_INSTRUCTION,
  IMAGE_PROMPT_REVISION_INSTRUCTION,
  imagePromptRevisionParts,
} = require('../lib/image-prompt');

const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('image recreation instruction asks for faithful text-to-image detail', () => {
  assert.match(IMAGE_RECREATION_INSTRUCTION, /text-to-image/i);
  assert.match(IMAGE_RECREATION_INSTRUCTION, /faithful/i);
  assert.match(IMAGE_RECREATION_INSTRUCTION, /composition/i);
  assert.match(IMAGE_RECREATION_INSTRUCTION, /100-160 words/i);
  assert.doesNotMatch(IMAGE_RECREATION_INSTRUCTION, /extremely detailed/i);
  assert.match(IMAGE_RECREATION_INSTRUCTION, /single paragraph/i);
});

test('server exposes an image-to-prompt endpoint', () => {
  assert.match(serverJs, /\/api\/imageprompt/);
  assert.match(serverJs, /suggestImagePrompt/);
  assert.match(serverJs, /textGenInputs\(seed, 384\)/);
});

test('prompt revision rewrites one coherent prompt and reconciles dependent details', () => {
  assert.match(IMAGE_PROMPT_REVISION_INSTRUCTION, /change request as authoritative/i);
  assert.match(IMAGE_PROMPT_REVISION_INSTRUCTION, /Reconcile dependent details/i);
  assert.match(IMAGE_PROMPT_REVISION_INSTRUCTION, /Preserve every useful detail/i);
  assert.match(IMAGE_PROMPT_REVISION_INSTRUCTION, /80-160 words/i);
  assert.match(IMAGE_PROMPT_REVISION_INSTRUCTION, /never append/i);
  const parts = imagePromptRevisionParts(
    'A woman in a crimson gown beneath theater lights.',
    'Change the character to a man in a navy suit.',
    { hasImage: true },
  );
  assert.match(parts.instruction, /source image is attached/i);
  assert.match(parts.userInput, /<current_prompt>[\s\S]*crimson gown[\s\S]*<\/current_prompt>/);
  assert.match(parts.userInput, /<change_request>[\s\S]*navy suit[\s\S]*<\/change_request>/);
});

test('local prompt assistant exposes iterative revision with optional source context', () => {
  assert.match(serverJs, /route === '\/api\/prompt\/revise'/);
  assert.match(serverJs, /reviseImagePrompt\(/);
  assert.match(serverJs, /imagePromptRevisionParts\(currentPrompt, changeRequest/);
  assert.match(serverJs, /parts\.userInput \+= ENHANCE_TAIL/);
  assert.match(indexHtml, /id="promptAssistantBtn"/);
  assert.match(indexHtml, /id="promptAssistantSheet"/);
  assert.match(indexHtml, /data-prompt-revision="Change the main subject to /);
  assert.match(indexHtml, /id="promptAssistantSourceToggle"/);
  assert.match(indexHtml, /id="promptAssistantUndo"/);
  assert.match(appJs, /api\('\/api\/prompt\/revise'/);
  assert.match(appJs, /currentPrompt: before,[\s\S]*changeRequest,[\s\S]*imageName:/);
  assert.match(appJs, /state\.enhance = false;[\s\S]*renderEnhance\(\)/);
  assert.match(appJs, /state\.promptRevisionUndo = \{ before, after: revised \}/);
});
