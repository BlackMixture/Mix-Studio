'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return source.slice(from, to);
}

test('motion-video first frame replaces the primary Edit source', () => {
  const handoff = between(app, 'async function useDriveFirstFrame(destination)', "$('#vidDriveFrameChip').addEventListener");
  const editBranch = between(handoff, "if (destination === 'edit') {", 'await setCreateImageGuideAsset');

  assert.match(editBranch, /clearKreaMask\(true\)/);
  assert.match(editBranch, /checkpointDesktopInputSetup\(\)/);
  assert.match(editBranch, /state\.refs\[0\] = Object\.assign\(\{\}, frame\)/);
  assert.match(editBranch, /state\.editRefSlots = Math\.max\(1,/);
  assert.doesNotMatch(editBranch, /state\.refs\.findIndex/);
  assert.ok(editBranch.indexOf("setView('edit')") < editBranch.indexOf('renderRefs()'));
  assert.match(editBranch, /saveForm\(\)/);
  assert.match(editBranch, /appendDesktopInputSetup\(\)/);
});

test('first-frame handoff ignores stale extraction and uses source-oriented copy', () => {
  const handoff = between(app, 'async function useDriveFirstFrame(destination)', "$('#vidDriveFrameChip').addEventListener");

  assert.match(handoff, /transferToken = \+\+state\.desktopReuseToken/);
  assert.match(handoff, /state\.vidDrive !== sourceDrive/);
  assert.match(handoff, /state\.desktopReuseToken !== transferToken \|\| sourceChanged/);
  assert.match(app, /label: 'Edit first frame', detail: 'Use as the Edit source'/);
  assert.match(app, /First frame set as the Edit source/);
});
