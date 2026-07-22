'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('profile gate keeps creation behind Add profile and shows PIN entry above the gate', () => {
  assert.match(html, /id="profileList"[\s\S]*id="profileNewForm" hidden[\s\S]*id="profileCreateForm"/);
  assert.match(css, /\.profile-new\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.profile-new \{[\s\S]*position: absolute;[\s\S]*background: rgba\(0,0,0,\.78\)/);
  assert.match(css, /\.sheet\.over-profile-gate \{ z-index: 210; \}/);
  assert.match(app, /add\.addEventListener\('click', openProfileCreate\)/);
  assert.match(app, /\$\('#appDialogSheet'\)\.classList\.toggle\('over-profile-gate', profileGateOpen\)/);
  assert.match(app, /if \(sheet\.contains\(document\.activeElement\)\) document\.activeElement\.blur\(\)/);
  assert.match(app, /async function loginProfile\(p\) \{\s*closeProfileCreate\(\)/);
});

test('remote profile selection allows a PIN-less Owner with a clear privacy notice', () => {
  assert.match(html, /id="profileRemoteNotice"[\s\S]*PIN protection is optional[\s\S]*You can continue without one/);
  assert.match(css, /\.profile-remote-notice\[hidden\] \{ display: none; \}/);
  assert.match(app, /profileGateAccess = \{ remote: false, ownerHasPin: false, hasOpenProfiles: false \}/);
  assert.match(app, /profileGateAccess\.remote && profileGateAccess\.hasOpenProfiles/);
  assert.doesNotMatch(app, /remote-locked/);
  assert.doesNotMatch(app, /remote_pin_required/);
  assert.match(app, /if \(profileGateAccess\.remote\) return;[\s\S]*profile-tile add/);
});
