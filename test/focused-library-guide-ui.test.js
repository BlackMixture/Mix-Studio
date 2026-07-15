'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

test('opening a completed queue result suppresses the grid Library guide in focused view', () => {
  const setView = app.slice(
    app.indexOf('function setView(view, opts = {})'),
    app.indexOf('function setCreateMode(', app.indexOf('function setView(view, opts = {})')),
  );
  assert.match(
    setView,
    /if \(opts\.focusedResult\) cancelContextualGuide\('library-basics'\);\s*else scheduleContextualGuide\('library-basics', 760\);/,
    'focused-result navigation should cancel the inaccurate toolbar guide while normal Library navigation retains it',
  );

  const openFromQueue = app.slice(
    app.indexOf('function openFromQueue(itemId, videoId)'),
    app.indexOf('function queueReorderRows()', app.indexOf('function openFromQueue(itemId, videoId)')),
  );
  assert.match(openFromQueue, /setView\('gallery', \{ focusedResult: true \}\);\s*openLightbox\(itemId, videoId \|\| 'image'\);/);
});
