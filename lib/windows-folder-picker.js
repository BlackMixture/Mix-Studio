'use strict';

const path = require('path');
const { execFile } = require('child_process');

function folderPickerScript(description) {
  const safeDescription = String(description || 'Choose a folder').replace(/'/g, "''");
  return [
    "$ErrorActionPreference = 'Stop'",
    '$selected = $null',
    '$winFormsError = $null',
    'try {',
    '  Add-Type -AssemblyName System.Windows.Forms',
    '  $owner = New-Object System.Windows.Forms.Form',
    '  $owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen',
    '  $owner.ShowInTaskbar = $false',
    '  $owner.TopMost = $true',
    '  $owner.Size = New-Object System.Drawing.Size(1, 1)',
    '  $owner.Opacity = 0',
    '  $owner.Show()',
    '  $owner.Activate()',
    '  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    `  $dialog.Description = '${safeDescription}'`,
    '  $dialog.ShowNewFolderButton = $false',
    '  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $selected = $dialog.SelectedPath }',
    '  $owner.Close()',
    '  $owner.Dispose()',
    '} catch {',
    '  $winFormsError = $_.Exception.Message',
    '  try {',
    '    $shell = New-Object -ComObject Shell.Application',
    `    $folder = $shell.BrowseForFolder(0, '${safeDescription}', 0, 0)`,
    '    if ($folder) { $selected = $folder.Self.Path }',
    '  } catch {',
    '    [Console]::Error.Write("WinForms picker: $winFormsError; Shell picker: $($_.Exception.Message)")',
    '    exit 2',
    '  }',
    '}',
    'if ($selected) { [Console]::Out.Write($selected) }',
  ].join("\n");
}

function browseWindowsFolder(kind, options = {}) {
  const env = options.env || process.env;
  const execFileFn = options.execFileFn || execFile;
  const pathApi = options.pathApi || path;
  const systemRoot = String(env.SystemRoot || 'C:\\Windows');
  const powershell = options.powershell
    || pathApi.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const description = kind === 'models' ? 'Choose the ComfyUI models folder' : 'Choose the ComfyUI folder';
  const script = folderPickerScript(description);
  return new Promise((resolve, reject) => {
    execFileFn(powershell, ['-NoProfile', '-STA', '-Command', script], {
      windowsHide: true,
      timeout: options.timeoutMs || 10 * 60 * 1000,
      maxBuffer: 64 * 1024,
    }, (error, stdout, stderr) => {
      if (!error) return resolve(String(stdout || '').trim());
      const diagnostic = String(stderr || '').trim() || String(error.message || error);
      const wrapped = new Error(`Windows could not open the folder picker. Enter the folder path manually, or retry after signing into the generation desktop. ${diagnostic}`);
      wrapped.code = 'folder_picker_failed';
      wrapped.cause = error;
      reject(wrapped);
    });
  });
}

module.exports = {
  browseWindowsFolder,
  folderPickerScript,
};
