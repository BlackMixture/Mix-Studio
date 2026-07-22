'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const quality = fs.readFileSync(path.join(root, '.github', 'workflows', 'quality.yml'), 'utf8');
const pages = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const portable = fs.readFileSync(path.join(root, 'docs', 'portable-install.md'), 'utf8');
const download = fs.readFileSync(path.join(root, 'docs', 'download', 'index.html'), 'utf8');

test('release metadata is stable semantic JSON with a real release date', () => {
  const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
  assert.match(release.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  assert.match(release.releasedAt, /^\d{4}-\d{2}-\d{2}$/);
  const parsed = new Date(`${release.releasedAt}T00:00:00.000Z`);
  assert.ok(!Number.isNaN(parsed.getTime()));
  assert.equal(parsed.toISOString().slice(0, 10), release.releasedAt);
});

test('quality runs the complete Node 22 checks on Linux and Windows', () => {
  assert.match(quality, /workflow_call:/);
  assert.match(quality, /pull_request:/);
  assert.match(quality, /os: \[ubuntu-latest, windows-latest\]/);
  assert.match(quality, /node-version: 22/);
  assert.match(quality, /node --check server\.js/);
  assert.match(quality, /node --check public\/app\.js/);
  assert.match(quality, /Check PowerShell installer syntax/);
  assert.match(quality, /Language\.Parser]::ParseFile/);
  assert.match(quality, /Smoke test installer checkout validation/);
  assert.match(quality, /install_MixStudio\.bat --verify-checkout/);
  assert.match(quality, /node --test/);
  assert.match(quality, /RELEASE_TAG/);
  assert.match(quality, /release\.json/);
  assert.match(quality, /normalizeAppRelease/);
  assert.match(quality, /release\.releasedAt !== String\(raw\.releasedAt/);
});

test('the download deployment cannot run before repository quality passes', () => {
  assert.match(pages, /quality:\s*\n\s+uses: \.\/\.github\/workflows\/quality\.yml/);
  assert.match(pages, /deploy:\s*\n\s+needs: quality/);
});

test('the retired pre-web setup scripts are not shipped beside the active installer', () => {
  assert.equal(fs.existsSync(path.join(root, 'installer', 'install-ui.ps1')), false);
  assert.equal(fs.existsSync(path.join(root, 'installer', 'install.ps1')), false);
});

test('install documentation follows the automatic setup and in-app phone flow', () => {
  for (const copy of [readme, portable, download]) {
    assert.match(copy, /setup/i);
    assert.match(copy, /Tailscale/);
  }
  assert.match(readme, /unconfigured installation[\s\S]{0,160}opens automatically/i);
  assert.match(readme, /Phone access card/);
  assert.match(portable, /opens automatically/i);
  assert.match(portable, /Copy or share/);
  assert.match(download, /opens setup automatically/i);
  assert.match(download, /copy or share the private URL/i);
});
