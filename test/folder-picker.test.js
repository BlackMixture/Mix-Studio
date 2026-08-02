'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  browseGenerationFolder,
  browseMacFolder,
  macFolderPickerScript,
} = require('../lib/folder-picker');

test('macOS folder picker returns a normalized POSIX folder', async () => {
  const calls = [];
  const selected = await browseMacFolder('models', {
    execFileFn(command, args, options, callback) {
      calls.push({ command, args, options });
      callback(null, '/Users/test/ComfyUI/models/\n', '');
    },
  });
  assert.equal(selected, '/Users/test/ComfyUI/models');
  assert.equal(calls[0].command, '/usr/bin/osascript');
  assert.deepEqual(calls[0].args.slice(0, 1), ['-e']);
  assert.match(calls[0].args[1], /choose folder with prompt/);
  assert.match(macFolderPickerScript('Choose "ComfyUI"'), /Choose \\"ComfyUI\\"/);
});

test('macOS folder picker treats user cancellation as an empty selection', async () => {
  const selected = await browseGenerationFolder('comfy', {
    platform: 'darwin',
    execFileFn(_command, _args, _options, callback) {
      callback(Object.assign(new Error('cancelled'), { code: 1 }), '', 'execution error: User canceled. (-128)');
    },
  });
  assert.equal(selected, '');
});

test('folder picker reports unsupported platforms without invoking a desktop command', () => {
  assert.throws(() => browseGenerationFolder('comfy', { platform: 'linux' }), (error) => (
    error.code === 'folder_picker_unavailable' && /absolute path manually/i.test(error.message)
  ));
});
