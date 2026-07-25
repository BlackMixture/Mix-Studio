'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  HUGGINGFACE_HUB_TOOL,
  HUGGINGFACE_PROGRESS_INTERVAL_MS,
  acceleratedHuggingFaceDownload,
  parseHuggingFaceResolveUrl,
} = require('../lib/huggingface-download');

test('Hugging Face resolve URLs become bounded hf download arguments', () => {
  assert.deepEqual(
    parseHuggingFaceResolveUrl('https://huggingface.co/Comfy-Org/SCAIL-2/resolve/main/diffusion_models/model.safetensors'),
    {
      repoId: 'Comfy-Org/SCAIL-2',
      revision: 'main',
      filename: 'diffusion_models/model.safetensors',
    }
  );
  assert.equal(parseHuggingFaceResolveUrl('https://example.test/owner/repo/resolve/main/model.safetensors'), null);
  assert.equal(parseHuggingFaceResolveUrl('https://huggingface.co/owner/repo/blob/main/model.safetensors'), null);
  assert.equal(parseHuggingFaceResolveUrl('https://huggingface.co/owner/repo/resolve/main/../secret.safetensors'), null);
});

test('accelerated downloads use isolated hf_xet defaults without exposing the token in arguments', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-studio-hf-xet-'));
  const commands = [];
  try {
    const result = await acceleratedHuggingFaceDownload({
      url: 'https://huggingface.co/Comfy-Org/SCAIL-2/resolve/main/diffusion_models/model.safetensors',
      stagingDirectory: root,
      uvExecutable: 'uv.exe',
      hfToken: 'hf_private_read_token',
      run: async (command, args, options) => {
        commands.push({ command, args, options });
        const output = path.join(root, 'diffusion_models', 'model.safetensors');
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, Buffer.from('model'));
      },
    });
    assert.equal(result.size, 5);
    assert.equal(result.path, path.join(root, 'diffusion_models', 'model.safetensors'));
    assert.equal(commands[0].command, 'uv.exe');
    assert.deepEqual(commands[0].args.slice(0, 5), ['tool', 'run', '--from', HUGGINGFACE_HUB_TOOL, 'hf']);
    assert.ok(commands[0].args.includes('Comfy-Org/SCAIL-2'));
    assert.ok(commands[0].args.includes('diffusion_models/model.safetensors'));
    assert.equal(commands[0].args.join(' ').includes('hf_private_read_token'), false);
    assert.equal(commands[0].options.env.HF_TOKEN, 'hf_private_read_token');
    assert.equal(commands[0].options.env.HF_HUB_DOWNLOAD_TIMEOUT, '120');
    assert.equal(commands[0].options.env.HF_XET_HIGH_PERFORMANCE, undefined);
    assert.ok(commands[0].options.timeout >= 60 * 60 * 1000);
    assert.ok(HUGGINGFACE_PROGRESS_INTERVAL_MS > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accelerated downloads report staged bytes while Xet is running', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-studio-hf-progress-'));
  const progress = [];
  try {
    const result = await acceleratedHuggingFaceDownload({
      url: 'https://huggingface.co/Comfy-Org/SCAIL-2/resolve/main/diffusion_models/model.safetensors',
      stagingDirectory: root,
      uvExecutable: 'uv.exe',
      expectedBytes: 12,
      progressIntervalMs: 1,
      onProgress: (value) => progress.push(value),
      run: async () => {
        const partial = path.join(root, '.cache', 'model.incomplete');
        fs.mkdirSync(path.dirname(partial), { recursive: true });
        await new Promise((resolve) => setTimeout(resolve, 3));
        fs.writeFileSync(partial, Buffer.alloc(5));
        await new Promise((resolve) => setTimeout(resolve, 3));
        fs.writeFileSync(partial, Buffer.alloc(9));
        await new Promise((resolve) => setTimeout(resolve, 3));
        fs.rmSync(partial);
        const output = path.join(root, 'diffusion_models', 'model.safetensors');
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, Buffer.alloc(12));
      },
    });
    assert.equal(result.size, 12);
    assert.ok(progress.some((entry) => entry.downloaded > 0 && entry.downloaded < 12));
    assert.deepEqual(progress.at(-1), { downloaded: 12, downloadTotal: 12, method: 'hf-xet' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
