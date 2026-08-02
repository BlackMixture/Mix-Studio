'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

function openingTagById(source, id) {
  const match = source.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`));
  assert.ok(match, `expected #${id} to be mounted`);
  return match[0];
}

test('focused workflow pickers use the centered dialog presentation', () => {
  for (const id of ['videoCameraMotionSheet', 'faceSheet', 'engineInfoSheet', 'directorAddSheet']) {
    assert.match(openingTagById(html, id), /class="[^"]*\bcentered-dialog-sheet\b[^"]*"/);
  }

  const overlayRule = css.match(/\.sheet\.centered-dialog-sheet\s*\{([^}]*)\}/)?.[1] || '';
  const panelRule = css.match(/\.sheet\.centered-dialog-sheet\s*>\s*\.sheet-panel\s*\{([^}]*)\}/)?.[1] || '';

  assert.match(overlayRule, /align-items:\s*center/);
  assert.match(overlayRule, /safe-area-inset-top/);
  assert.match(overlayRule, /safe-area-inset-bottom/);
  assert.match(panelRule, /max-height:\s*min\(90dvh,\s*860px\)/);
  assert.match(panelRule, /border-radius:\s*var\(--radius-lg\)/);
  assert.match(panelRule, /animation:\s*centeredDialogIn/);
  assert.match(css, /@keyframes centeredDialogIn\s*\{[\s\S]*?scale\(\.985\)[\s\S]*?scale\(1\)/);
});
