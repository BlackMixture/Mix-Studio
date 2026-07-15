'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

function sourceAround(source, needle, padding = 5000) {
  const first = source.indexOf(needle);
  const last = source.lastIndexOf(needle);
  assert.ok(first >= 0, `expected ${needle} in source`);
  return source.slice(Math.max(0, first - padding), Math.min(source.length, last + needle.length + padding));
}

test('icon help uses one accessible tooltip portal', () => {
  const portals = [...html.matchAll(/<[^>]*\bid="iconTooltip"[^>]*>/g)].map((match) => match[0]);
  assert.equal(portals.length, 1, 'the document should contain exactly one shared icon tooltip');
  assert.match(portals[0], /\brole="tooltip"/);
  assert.match(portals[0], /\bhidden\b/);
});

test('icon-only buttons are marked and lose native titles only after opting into custom help', () => {
  const tooltipJs = sourceAround(app, 'data-icon-tooltip');

  assert.match(tooltipJs, /(?:querySelectorAll|matches)\([^)]*button/);
  assert.match(tooltipJs, /getAttribute\(\s*['"]aria-label['"]\s*\)/);
  assert.match(tooltipJs, /getAttribute\(\s*['"]title['"]\s*\)/);
  assert.match(tooltipJs, /(?:dataset\.iconTooltip\s*=|setAttribute\(\s*['"]data-icon-tooltip['"])/);

  const titleRemovals = [...tooltipJs.matchAll(/([A-Za-z_$][\w$]*)\.removeAttribute\(\s*['"]title['"]\s*\)/g)];
  assert.ok(titleRemovals.length > 0, 'marked icon controls should not retain slow native tooltips');
  assert.ok(titleRemovals.some((match) => {
    const before = tooltipJs.slice(Math.max(0, match.index - 1200), match.index);
    return before.includes('data-icon-tooltip') || before.includes('dataset.iconTooltip');
  }), 'title removal should be scoped to the custom-tooltip opt-in path');
  assert.doesNotMatch(tooltipJs, /querySelectorAll\(\s*['"](?:button)?\[title\]['"]\s*\)/,
    'native titles on ordinary, visibly labelled controls must remain untouched');
});

test('icon tooltip behavior is delegated, keyboard accessible, and supports dynamic buttons', () => {
  const tooltipJs = sourceAround(app, 'iconTooltip');

  assert.match(tooltipJs, /\.closest\(\s*['"]button\[data-icon-tooltip\][^'"]*['"]\s*\)/);
  assert.match(tooltipJs, /addEventListener\(\s*['"](?:pointerover|pointerenter)['"]/);
  assert.match(tooltipJs, /addEventListener\(\s*['"](?:pointerout|pointerleave)['"]/);
  assert.match(tooltipJs, /addEventListener\(\s*['"](?:focusin|focus)['"]/);
  assert.match(tooltipJs, /addEventListener\(\s*['"](?:focusout|blur)['"]/);
  assert.match(tooltipJs, /setAttribute\(\s*['"]aria-describedby['"]\s*,/);
  assert.match(tooltipJs, /removeAttribute\(\s*['"]aria-describedby['"]\s*\)/);

  assert.match(tooltipJs, /getBoundingClientRect\(\)/);
  assert.match(tooltipJs, /window\.innerWidth/);
  assert.match(tooltipJs, /window\.innerHeight/);
  assert.match(tooltipJs, /Math\.(?:min|max)\(/);

  assert.match(tooltipJs, /new MutationObserver\(/);
  assert.match(tooltipJs, /childList:\s*true/);
  assert.match(tooltipJs, /subtree:\s*true/);
  assert.match(tooltipJs, /mutation\.addedNodes\.forEach/);
  assert.match(tooltipJs, /mutation\.target instanceof Element \? mutation\.target\.closest\('button'\)/);
  assert.doesNotMatch(tooltipJs, /scanIconTooltips\(mutation\.target\)/,
    'adding one gallery card must not rescan the entire containing grid');
  assert.match(tooltipJs, /iconTooltipButton && !iconTooltipButton\.isConnected[\s\S]{0,100}hideIconTooltip\(\)/,
    'removing a hovered dynamic button should also dismiss its portal tooltip');
});

test('disabled icon controls retain concise native help until they become interactive', () => {
  const tooltipJs = sourceAround(app, 'function markIconTooltip', 2600);
  assert.match(tooltipJs, /if \(button\.disabled\)[\s\S]{0,180}setAttribute\('title', label\)/);
  assert.match(app, /attributeFilter: \[[^\]]*'disabled'/);
  assert.match(tooltipJs, /if \(legacyTitle\) button\.removeAttribute\('title'\)/);
});

test('responsive icon controls use their rendered labels and concise overrides', () => {
  const tooltipJs = sourceAround(app, 'ICON_TOOLTIP_OVERRIDES', 7000);
  assert.match(tooltipJs, /gallerySortTrigger:\s*'Sort'/);
  assert.match(tooltipJs, /likesFilter:\s*'Liked only'/);
  assert.match(tooltipJs, /createImageGuideToggle:[\s\S]{0,120}'Add image'/);
  assert.match(tooltipJs, /getComputedStyle\(parent\)/);
  assert.match(tooltipJs, /style\.display === 'none'/);
  assert.match(app, /function syncNavigation\(\)[\s\S]{0,1000}requestIconTooltipScan\(\)/);
});

test('tooltip hover polish is subtle, input-aware, and motion-safe', () => {
  assert.match(css, /#iconTooltip|\.icon-tooltip/);
  const tooltipCss = sourceAround(css, 'data-icon-tooltip', 3500);

  assert.match(tooltipCss, /position:\s*fixed/);
  assert.match(tooltipCss, /pointer-events:\s*none/);
  assert.match(tooltipCss, /@media\s*\(hover:\s*hover\)/);
  assert.match(tooltipCss, /\[data-icon-tooltip\][^,{]*:(?:not\(:disabled\)[^,{]*:hover|enabled:hover)/);
  assert.match(tooltipCss, /:focus-visible/);
  assert.match(tooltipCss, /transform:\s*translateY\(\s*-\d+(?:\.\d+)?px\s*\)/);
  assert.match(tooltipCss, /box-shadow:/);
  assert.match(tooltipCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]{0,1600}\[data-icon-tooltip\]/);
});

test('legacy sheet closes and dynamic cancel icons have accessible names', () => {
  const closeButtons = [...html.matchAll(/<button\b(?=[^>]*\bdata-close\b)([^>]*)>([\s\S]*?)<\/button>/g)]
    .filter((match) => /^[✕×]$/.test(match[2].replace(/<[^>]+>/g, '').trim()))
    .map((match) => `<button${match[1]}>`);
  assert.ok(closeButtons.length > 0, 'expected legacy data-close buttons in the document');
  const unnamed = closeButtons.filter((tag) => !/\baria-label="[^"]+"/.test(tag));
  assert.deepEqual(unnamed, [], `every data-close icon needs a concise aria-label: ${unnamed.join(', ')}`);

  const cancelCreations = [...app.matchAll(/\.className\s*=\s*['"]q-cancel['"]/g)];
  assert.ok(cancelCreations.length >= 2, 'preset deletion and queue cancellation should both create icon buttons');
  for (const creation of cancelCreations) {
    const block = app.slice(creation.index, creation.index + 700);
    assert.match(block, /(?:\.ariaLabel\s*=|\.setAttribute\(\s*['"]aria-label['"]\s*,)/,
      'each dynamic q-cancel button needs an action-specific accessible name');
  }
});
