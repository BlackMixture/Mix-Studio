'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeRegions,
  regionalRegionsJson,
  regionalPromptBuilderJson,
  regionalBboxes,
  buildRegionalT2IGraph,
  buildKrea2InpaintGraph,
} = require('../lib/regional-workflows');

const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('normalizes regional boxes for Krea2 prompting', () => {
  const regions = normalizeRegions([
    {
      id: 'hero',
      description: 'woman in a red velvet jacket',
      x: -0.2,
      y: 0.1,
      w: 1.4,
      h: 0.35,
      lora: 'Characters/Hero.safetensors',
      strength: 1.35,
      refImageName: 'hero_ref.png',
    },
    { description: 'disabled', enabled: false, lora: 'None' },
  ]);

  assert.equal(regions.length, 1);
  assert.equal(regions[0].id, 'hero');
  assert.equal(regions[0].x, 0);
  assert.equal(regions[0].y, 0.1);
  assert.equal(regions[0].w, 1);
  assert.equal(regions[0].h, 0.35);
  assert.equal(regions[0].lora, 'Characters/Hero.safetensors');
  assert.equal(regions[0].strength, 1.35);
  assert.equal(regions[0].refImageName, 'hero_ref.png');
});

test('builds Fedor v3 regions_json, Ideogram elements JSON, and bbox payloads', () => {
  const regions = normalizeRegions([
    {
      description: 'left subject wearing a blue coat',
      x: 0.05,
      y: 0.2,
      w: 0.35,
      h: 0.6,
      lora: 'People/Left.safetensors',
      strength: 0.8,
      refImageName: 'left.png',
    },
    {
      description: 'right subject in a silver dress',
      x: 0.6,
      y: 0.18,
      w: 0.3,
      h: 0.62,
    },
  ]);

  const rows = JSON.parse(regionalRegionsJson(regions));
  assert.deepEqual(rows[0], {
    name: 'region1',
    lora: 'People/Left.safetensors',
    strength: 0.8,
    enable: true,
    ref_image: 'left.png',
  });
  assert.equal(rows[1].lora, 'None');
  assert.equal(rows[1].ref_image, '');

  const elements = JSON.parse(regionalPromptBuilderJson(regions));
  assert.equal(elements[0].type, 'obj');
  // desc already contains spatial language -> passed through untouched
  assert.equal(elements[0].desc, 'left subject wearing a blue coat');
  // no spatial language -> a position phrase derived from the box is added
  const injected = JSON.parse(regionalPromptBuilderJson([
    { description: 'a giant squid', x: 0, y: 0, w: 0.5, h: 1 },
    { description: 'an alien spaceship', x: 0.18, y: 0, w: 0.63, h: 0.41 },
  ]));
  assert.match(injected[0].desc, /occupying the full left half/);
  assert.match(injected[1].desc, /top center/);
  assert.deepEqual(regionalBboxes(regions, 1024, 768)[0], {
    x: 51,
    y: 154,
    w: 358,
    h: 461,
  });
});

test('regional text-to-image graph uses Krea2 regional node and Ideogram prompt builder', () => {
  const graph = buildRegionalT2IGraph({
    prompt: 'fashion editorial in a marble lobby',
    width: 1024,
    height: 768,
    seed: 123,
    steps: 18,
    cfg: 3,
    loras: [{ name: 'Global/Look.safetensors', strength: 0.7, on: true }],
    regions: [
      {
        description: 'left model',
        x: 0.08,
        y: 0.16,
        w: 0.36,
        h: 0.7,
        lora: 'People/Left.safetensors',
        refImageName: 'left.png',
      },
    ],
    settings: {
      unet: 'krea2_turbo_fp8_scaled.safetensors',
      clip: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
      clipType: 'krea2',
      vae: 'qwen_image_vae.safetensors',
    },
  });

  assert.equal(graph.prompt_builder.class_type, 'Ideogram4PromptBuilderKJ');
  assert.deepEqual(graph.regional.inputs.bboxes, ['prompt_builder', 2]);
  assert.equal(graph.regional.class_type, 'Krea2RegionalMultiLoRAV3');
  assert.equal(graph.regional.inputs.split_mode, 'bbox');
  assert.equal(graph.regional.inputs.ref_strength, 0.3);
  assert.equal(graph.pos.inputs.text[0], 'prompt_builder');
  assert.equal(graph.sampler.inputs.model[0], 'regional');
});

test('Krea2 inpaint graph uses image mask and optional regional controls', () => {
  const graph = buildKrea2InpaintGraph({
    imageName: 'source.png',
    maskImageName: 'mask.png',
    prompt: 'replace the jacket with glossy black leather',
    width: 1024,
    height: 1024,
    seed: 77,
    steps: 16,
    cfg: 3,
    denoise: 0.74,
    regions: [
      {
        description: 'jacket area',
        x: 0.22,
        y: 0.26,
        w: 0.52,
        h: 0.42,
        lora: 'Clothes/Leather.safetensors',
      },
    ],
    settings: {
      unet: 'krea2_turbo_fp8_scaled.safetensors',
      clip: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
      clipType: 'krea2',
      vae: 'qwen_image_vae.safetensors',
    },
  });

  assert.equal(graph.source.class_type, 'LoadImage');
  assert.equal(graph.mask_load.class_type, 'LoadImage');
  assert.equal(graph.mask.class_type, 'ImageToMask');
  assert.equal(graph.grow_mask.class_type, 'GrowMask');
  assert.equal(graph.encode.class_type, 'VAEEncode');
  assert.equal(graph.inpaint_latent.class_type, 'SetLatentNoiseMask');
  assert.equal(graph.regional.class_type, 'Krea2RegionalMultiLoRAV3');
  assert.equal(graph.sampler.inputs.latent_image[0], 'inpaint_latent');
  assert.equal(graph.composite.class_type, 'ImageCompositeMasked');
  assert.deepEqual(graph.save.inputs.images, ['composite', 0]);
});

test('Krea2 inpaint can condition directly on the surrounding source image', () => {
  const graph = buildKrea2InpaintGraph({
    imageName: 'source.png',
    maskImageName: 'mask.png',
    prompt: 'replace the sign while matching the wall lighting',
    width: 1024,
    height: 1024,
    seed: 12,
    steps: 12,
    cfg: 1,
    denoise: 0.82,
    useSourceConditioning: true,
    settings: {
      unet: 'krea2.safetensors',
      clip: 'clip.safetensors',
      clipType: 'krea2',
      vae: 'vae.safetensors',
    },
  });

  assert.equal(graph.pos.class_type, 'Krea2EditRebalance');
  assert.deepEqual(graph.pos.inputs.image1, ['source', 0]);
  assert.equal(graph.pos.inputs.image1_tokens, 'high');
  assert.deepEqual(graph.composite.inputs.destination, ['source', 0]);
  assert.deepEqual(graph.composite.inputs.mask, ['grow_mask', 0]);
});

test('server advertises regional Krea2 and inpaint readiness groups', () => {
  assert.match(serverJs, /regional:\s*\[/);
  assert.match(serverJs, /Krea2RegionalMultiLoRAV3/);
  assert.match(serverJs, /Ideogram4PromptBuilderKJ/);
  assert.match(serverJs, /krea2inpaint:\s*\[/);
  assert.match(serverJs, /krea2inpaint:\s*\[[^\]]*'VAEEncode'[^\]]*'SetLatentNoiseMask'/);
});
