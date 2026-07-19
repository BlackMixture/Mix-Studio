'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function namedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is defined`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
    if (depth === 0) return vm.runInNewContext(`(${source.slice(start, index + 1)})`);
  }
  throw new Error(`${name} has no closing brace`);
}

test('saved edit prompts recover visual reference tokens for every available input', () => {
  const rehydrate = namedFunction(app, 'rehydratePromptReferences');
  const refs = [{ name: 'character.png' }, { name: 'jacket.png' }, { name: 'forest.png' }];
  assert.equal(
    rehydrate('Use image 1 with Image 2 in IMAGE-3', refs),
    'Use @image-1 with @image-2 in @image-3',
  );
  assert.equal(rehydrate('Keep @image-1 and image 2', refs), 'Keep @image-1 and @image-2');
  assert.equal(rehydrate('Use image 1 with image 2', [refs[0], null, null]), 'Use @image-1 with image 2');
  assert.equal(rehydrate('Use image 1', []), 'Use image 1');
});

test('generation results retain the tokenized editor prompt separately from the graph prompt', () => {
  assert.match(app, /promptTemplate: mode === 'edit' \? promptDraft\(\)\.trim\(\) : undefined/);
  assert.match(app, /const restoredPrompt = reusableItemPrompt\(it, useEnhanced\)/);
  assert.match(app, /state\.prompts\.edit = rehydratePromptReferences\(state\.prompts\.edit, state\.refs\)/);
  assert.match(server, /p\.promptTemplate = p\.mode === 'edit'[\s\S]*slice\(0, 8000\)/);
  assert.ok((server.match(/promptTemplate: job\.params\.promptTemplate/g) || []).length >= 3);
});
