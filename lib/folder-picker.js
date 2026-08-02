'use strict';

const { execFile } = require('child_process');
const { browseWindowsFolder } = require('./windows-folder-picker');

function appleScriptString(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function macFolderPickerScript(description) {
  return `POSIX path of (choose folder with prompt ${appleScriptString(description || 'Choose a folder')})`;
}

function browseMacFolder(kind, options = {}) {
  const execFileFn = options.execFileFn || execFile;
  const description = kind === 'models' ? 'Choose the ComfyUI models folder' : 'Choose the ComfyUI folder';
  return new Promise((resolve, reject) => {
    execFileFn(options.osascript || '/usr/bin/osascript', ['-e', macFolderPickerScript(description)], {
      timeout: options.timeoutMs || 10 * 60 * 1000,
      maxBuffer: 64 * 1024,
    }, (error, stdout, stderr) => {
      if (!error) {
        const selected = String(stdout || '').trim();
        return resolve(selected.length > 1 ? selected.replace(/\/+$/, '') : selected);
      }
      const diagnostic = String(stderr || '').trim() || String(error.message || error);
      if (/-128\b|user canceled/i.test(diagnostic)) return resolve('');
      const wrapped = new Error(`macOS could not open the folder picker. Enter the folder path manually, or retry from the Mac running Mix Studio. ${diagnostic}`);
      wrapped.code = 'folder_picker_failed';
      wrapped.cause = error;
      reject(wrapped);
    });
  });
}

function browseGenerationFolder(kind, options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'win32') return browseWindowsFolder(kind, options);
  if (platform === 'darwin') return browseMacFolder(kind, options);
  const error = new Error('Folder browsing is not available on this generation computer. Enter the absolute path manually.');
  error.code = 'folder_picker_unavailable';
  throw error;
}

module.exports = {
  appleScriptString,
  browseGenerationFolder,
  browseMacFolder,
  macFolderPickerScript,
};
