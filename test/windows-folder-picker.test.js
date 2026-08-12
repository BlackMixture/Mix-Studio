'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { browseWindowsFolder, folderPickerScript } = require('../lib/windows-folder-picker');

test('Windows picker falls back to the Shell folder browser', () => {
  const script = folderPickerScript('Choose ComfyUI');
  assert.match(script, /System\.Windows\.Forms\.FolderBrowserDialog/);
  assert.match(script, /\$owner\.TopMost = \$true/);
  assert.match(script, /ShowDialog\(\$owner\)/);
  assert.match(script, /Shell\.Application/);
  assert.match(script, /BrowseForFolder/);
});

test('Windows picker uses STA PowerShell and reports an actionable failure', async () => {
  const calls = [];
  const systemRoot = 'C:\\Windows';
  await assert.rejects(browseWindowsFolder('models', {
    env: { SystemRoot: systemRoot },
    execFileFn: (command, args, options, callback) => {
      calls.push({ command, args, options });
      callback(Object.assign(new Error('Command failed'), { code: 1 }), '', 'both pickers failed');
    },
  }), (error) => error.code === 'folder_picker_failed' && /enter the folder path manually/i.test(error.message));
  assert.equal(calls[0].command, path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
  assert.deepEqual(calls[0].args.slice(0, 3), ['-NoProfile', '-STA', '-Command']);
});
