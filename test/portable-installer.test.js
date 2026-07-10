'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('portable installer has a double-click Windows entry point', () => {
  const launcher = fs.readFileSync(path.join(root, 'install.bat'), 'utf8');
  assert.match(launcher, /installer\\install-ui\.ps1/i);
  assert.match(launcher, /ExecutionPolicy Bypass/i);
  assert.match(launcher, /-STA/);
});

test('portable installer opens a branded WPF wizard instead of a terminal questionnaire', () => {
  const ui = fs.readFileSync(path.join(root, 'installer', 'install-ui.ps1'), 'utf8');
  assert.match(ui, /PresentationFramework/);
  assert.match(ui, /Background="#000000"/);
  assert.match(ui, /MixBox Studio/);
  assert.match(ui, /PageWelcome/);
  assert.match(ui, /PageConnection/);
  assert.match(ui, /PageFeatures/);
  assert.match(ui, /PageReview/);
  assert.match(ui, /PageComplete/);
  assert.match(ui, /DoubleAnimation/);
});

test('visual wizard delegates writes to the non-interactive safe install engine', () => {
  const ui = fs.readFileSync(path.join(root, 'installer', 'install-ui.ps1'), 'utf8');
  const engine = fs.readFileSync(path.join(root, 'installer', 'install.ps1'), 'utf8');
  assert.match(ui, /install\.ps1/);
  assert.match(ui, /-NonInteractive/);
  assert.match(ui, /-FeatureConfigFile/);
  assert.match(engine, /\[string\]\$FeatureConfigFile/);
});

test('portable installer requires Git for safe in-app updates and Node 22', () => {
  const installer = fs.readFileSync(path.join(root, 'installer', 'install.ps1'), 'utf8');
  assert.match(installer, /Test-Path \(Join-Path \$Root '\.git'\)/);
  assert.match(installer, /NodeMajor -lt 22/);
  assert.match(installer, /provider = 'git'/);
});

test('portable installer preserves settings and supports existing ComfyUI paths', () => {
  const installer = fs.readFileSync(path.join(root, 'installer', 'install.ps1'), 'utf8');
  assert.match(installer, /Copy-Item \$File \$Backup/);
  assert.match(installer, /Existing ComfyUI folder/);
  assert.match(installer, /Existing models folder/);
  assert.doesNotMatch(installer, /Remove-Item[^\r\n]*(data|SettingsFile)/i);
});

test('portable installer validates direct engine input and keeps unique backups', () => {
  const installer = fs.readFileSync(path.join(root, 'installer', 'install.ps1'), 'utf8');
  assert.match(installer, /Normalize-ComfyUrl/);
  assert.match(installer, /http.*https/);
  assert.match(installer, /while \(Test-Path \$Backup\)/);
  assert.match(installer, /appId = 'mixbox-studio'/);
});

test('portable checkout has a conservative uninstaller entry point', () => {
  const launcher = fs.readFileSync(path.join(root, 'uninstall.bat'), 'utf8');
  const uninstaller = fs.readFileSync(path.join(root, 'installer', 'uninstall.ps1'), 'utf8');
  assert.match(launcher, /installer\\uninstall\.ps1/i);
  assert.match(launcher, /ExecutionPolicy Bypass/i);
  assert.match(uninstaller, /Assert-SafeInstallRoot/);
  assert.match(uninstaller, /ComfyUI.*Node\.js.*never removed/i);
  assert.match(uninstaller, /-RemoveData/);
  assert.match(uninstaller, /Type DELETE to continue/);
  assert.match(uninstaller, /Where-Object \{ `\$_.FullName -ne `\$Data \}/);
  assert.match(uninstaller, /Start-Process -FilePath \$PowerShell/);
});
