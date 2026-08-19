'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_LOCAL_PROMPT_AI_TYPE,
  localPromptAiCatalog,
  localPromptAiConfig,
  normalizeLocalPromptAiSettings,
  smartPlannerPromptAiConfig,
} = require('../lib/local-prompt-ai');

test('local prompt AI inherits the Krea prompt model without changing generation settings', () => {
  const settings = {
    clip: 'qwen3-vl-4b.safetensors',
    clipType: 'krea2',
    localPromptAiClip: '',
    localPromptAiClipType: 'qwen_image',
  };
  assert.deepEqual(localPromptAiConfig(settings), {
    model: 'qwen3-vl-4b.safetensors',
    type: 'krea2',
    inherited: true,
  });
  assert.equal(settings.clip, 'qwen3-vl-4b.safetensors');
});

test('local prompt AI can select an independent installed text encoder and loader type', () => {
  const settings = normalizeLocalPromptAiSettings({
    localPromptAiClip: 'prompt\\qwen3-vl-8b.safetensors',
    localPromptAiClipType: 'qwen_image',
  });
  assert.deepEqual(localPromptAiConfig(settings), {
    model: 'prompt\\qwen3-vl-8b.safetensors',
    type: 'qwen_image',
    inherited: false,
  });
  assert.equal(DEFAULT_LOCAL_PROMPT_AI_TYPE, 'krea2');
});

test('Smart planner can override the shared prompt enhancer without changing it', () => {
  const settings = {
    clip: 'krea2-default.safetensors', clipType: 'krea2',
    localPromptAiClip: 'prompt\\quick-enhancer.safetensors', localPromptAiClipType: 'krea2',
    smartPlannerModelOverride: true,
    smartPlannerClip: 'prompt\\qwen3-vl-8b.safetensors', smartPlannerClipType: 'qwen_image',
  };
  assert.deepEqual(localPromptAiConfig(settings), {
    model: 'prompt\\quick-enhancer.safetensors', type: 'krea2', inherited: false,
  });
  assert.deepEqual(smartPlannerPromptAiConfig(settings), {
    model: 'prompt\\qwen3-vl-8b.safetensors', type: 'qwen_image', inherited: false, override: true,
  });
  assert.deepEqual(smartPlannerPromptAiConfig(Object.assign({}, settings, { smartPlannerModelOverride: false })), {
    model: 'prompt\\quick-enhancer.safetensors', type: 'krea2', inherited: true, override: false,
  });
});

test('local prompt AI catalog reads current ComfyUI combo schemas and reports missing choices', () => {
  const info = {
    CLIPLoader: { input: { required: {
      clip_name: [['default.safetensors', 'prompt\\vision.safetensors']],
      type: ['COMBO', { options: ['krea2', 'qwen_image'] }],
    } } },
  };
  const ready = localPromptAiCatalog(info, {
    clip: 'default.safetensors', clipType: 'krea2',
    localPromptAiClip: 'prompt\\vision.safetensors', localPromptAiClipType: 'qwen_image',
  });
  assert.deepEqual(ready.models, ['default.safetensors', 'prompt\\vision.safetensors']);
  assert.deepEqual(ready.types, ['krea2', 'qwen_image']);
  assert.equal(ready.available, true);
  assert.equal(ready.smartPlannerOverride, false);

  const missing = localPromptAiCatalog(info, {
    localPromptAiClip: 'removed.safetensors', localPromptAiClipType: 'krea2',
  });
  assert.equal(missing.available, false);
});
