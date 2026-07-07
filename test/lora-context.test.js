'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLoraContext,
  promptPhrases,
} = require('../lib/lora-context');

test('promptPhrases extracts reusable prompt fragments', () => {
  assert.deepEqual(promptPhrases('portrait, movie still from a 1970s technicolor Sci-Fi movie. soft light'), [
    'portrait',
    'movie still from a 1970s technicolor Sci-Fi movie',
    'soft light',
  ]);
});

test('buildLoraContext learns default strength and repeated prompt phrase per LoRA', () => {
  const items = [
    {
      prompt: 'cinematic portrait, movie still from a 1970s technicolor Sci-Fi movie, practical set lighting',
      loras: [{ name: 'Style/Seventies.safetensors', strength: 0.75 }],
    },
    {
      prompt: 'wide shot, movie still from a 1970s technicolor Sci-Fi movie, smoky atmosphere',
      loras: [{ name: 'Style/Seventies.safetensors', strength: 0.8 }],
    },
    {
      prompt: 'close portrait, movie still from a 1970s technicolor Sci-Fi movie',
      loras: [{ name: 'Style/Seventies.safetensors', strength: 0.8 }],
    },
    {
      prompt: 'unrelated subject, bright product photo',
      loras: [{ name: 'Other.safetensors', strength: 1.25 }],
    },
  ];

  const context = buildLoraContext(items);

  assert.equal(context['Style/Seventies.safetensors'].defaultStrength, 0.8);
  assert.equal(context['Style/Seventies.safetensors'].suggestion, 'movie still from a 1970s technicolor Sci-Fi movie');
  assert.equal(context['Other.safetensors'].defaultStrength, 1.25);
  assert.equal(context['Other.safetensors'].suggestion, null);
});

test('buildLoraContext includes video LoRA usage from saved video metadata', () => {
  const context = buildLoraContext([
    {
      prompt: 'poster',
      videos: [
        {
          info: {
            motionPrompt: 'slow handheld push-in, rain on neon glass',
            loras: [{ name: 'Video/Rain.safetensors', strength: 0.55 }],
          },
        },
      ],
    },
  ]);

  assert.equal(context['Video/Rain.safetensors'].defaultStrength, 0.55);
  assert.equal(context['Video/Rain.safetensors'].phrases[0].text, 'slow handheld push-in');
});
