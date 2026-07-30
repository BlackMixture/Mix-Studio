'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const { toHtml } = require('../public/release-notes');

test('release notes render a safe, readable subset of GitHub Markdown', () => {
  const rendered = toHtml([
    '## Workflow fixes',
    '',
    '- Added **signed LoRAs** and `frame_rate`.',
    '- Read the [release](https://github.com/BlackMixture/Mix-Studio/releases).',
    '',
    '<script>alert("no")</script>',
  ].join('\n'));

  assert.match(rendered, /<h3>Workflow fixes<\/h3>/);
  assert.match(rendered, /<ul><li>Added <strong>signed LoRAs<\/strong> and <code>frame_rate<\/code>\.<\/li>/);
  assert.match(rendered, /href="https:\/\/github\.com\/BlackMixture\/Mix-Studio\/releases"/);
  assert.match(rendered, /&lt;script&gt;alert\(&quot;no&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(rendered, /<script>/);
});

test('the updates dialog uses formatted release-note markup and matching hierarchy styles', () => {
  assert.match(html, /<script src="\/release-notes\.js"><\/script>\s*<script src="\/app\.js"><\/script>/);
  assert.match(app, /ReleaseNotes\.toHtml\(latest\.notes/);
  assert.match(app, /class="update-entry-notes"/);
  assert.match(css, /\.update-entry-notes h3,[\s\S]*border-bottom:/);
  assert.match(css, /\.update-entry-notes ul,[\s\S]*padding-left:/);
  assert.match(css, /\.update-entry-notes code \{/);
});
