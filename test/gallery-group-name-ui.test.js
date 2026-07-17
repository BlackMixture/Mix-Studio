'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('desktop stage separates editable group identity from member position', () => {
  assert.match(html, /id="desktopStageKicker"/);
  assert.match(html, /id="desktopStageGroupNameField"[^>]*hidden/);
  assert.match(html, /id="desktopStageGroupName"[^>]*maxlength="80"[^>]*placeholder="Untitled group"/);
  assert.match(html, /id="desktopStagePosition"[^>]*hidden/);
  assert.match(app, /const galleryGroup = activeGalleryGroup\(item\)/);
  assert.match(app, /kicker\.textContent = `\$\{galleryGroup\.kindLabel\} · \$\{galleryGroup\.items\.length\} results`/);
  assert.match(app, /position\.textContent = galleryGroup\.position/);
  assert.match(css, /\.desktop-group-name-field input:focus/);
  assert.match(css, /\.desktop-stage-position \{[\s\S]*text-overflow: ellipsis/);
});

test('focused desktop and mobile keep group and generation names separate', () => {
  assert.match(html, /id="lbGroupNameField"[^>]*hidden/);
  assert.match(html, /id="lbGroupTitle"[^>]*aria-label="Gallery group name"/);
  assert.match(html, /id="lbGroupPosition"/);
  assert.match(html, /id="lbTitle"[^>]*aria-label="Generation name"/);
  assert.match(app, /setGenerationNameInput\(it, selVideo \|\| selComposite \|\| null\);[\s\S]*setLightboxGroupNameInput\(it\)/);
  assert.match(css, /\.overlay-name-stack\.has-group \.item-name-field/);
  assert.match(css, /\.generation-group-position \{[\s\S]*white-space: nowrap/);
});

test('group naming saves with stale identity protection and safe keyboard behavior', () => {
  assert.match(app, /\/api\/item\/.*encodeURIComponent\(item\.id\).*\/group/);
  assert.match(app, /JSON\.stringify\(\{ name: typed, groupType, groupId \}\)/);
  assert.match(app, /updated\.groupType !== groupType \|\| String\(updated\.groupId\) !== String\(groupId\)/);
  assert.match(app, /galleryGroupNameEditToken\(input\) === editToken/);
  assert.match(app, /if \(event\.isComposing\) return/);
  assert.match(app, /event\.key === 'Escape'[\s\S]*event\.stopPropagation\(\)[\s\S]*dataset\.initialValue/);
  assert.match(app, /wireInlineNameInput\(\$\('#desktopStageGroupName'\), saveGalleryGroupNameInput\)/);
  assert.match(app, /wireInlineNameInput\(\$\('#lbGroupTitle'\), saveGalleryGroupNameInput\)/);
});

test('manual, Strength Hunt, and camera groups resolve independently', () => {
  assert.match(app, /function activeGalleryGroup\(item\)/);
  assert.match(app, /type: 'generation'[\s\S]*nameKey: 'generationGroupName'/);
  assert.match(app, /item\.strengthHunt \? 'Strength Hunt' : 'Generation group'/);
  assert.match(app, /type: 'angle'[\s\S]*nameKey: 'angleGroupName'/);
  assert.match(app, /kindLabel: 'Camera group'/);
});

test('named groups are visible, searchable, sortable, and safely rendered in Library', () => {
  assert.match(app, /it\.generationGroupName,[\s\S]*it\.angleGroupName,[\s\S]*it\.name/);
  assert.match(app, /a\.generationGroupName \|\| a\.angleGroupName \|\| a\.name/);
  assert.match(app, /groupName\.textContent = galleryGroupName/);
  assert.match(app, /card\.setAttribute\('aria-label', `\$\{galleryGroupName\}, \$\{galleryGroup\.items\.length\} results`\)/);
  assert.match(css, /\.gallery-group-name \{[\s\S]*text-overflow: ellipsis/);
});

test('profile-scoped group endpoint handles privacy, stale state, and lifecycle cleanup', () => {
  assert.match(server, /itemGroupRoute = route\.match\(\/\^\\\/api\\\/item\\\/\(\[\\w\]\+\)\\\/group\$\//);
  assert.match(server, /visible\.find\(\(item\) => item\.id === itemGroupRoute\[1\]\)/);
  assert.match(server, /visibleIds: new Set\(visible\.map\(\(item\) => String\(item\.id\)\)\)/);
  assert.match(server, /Unlock the gallery before renaming this group/);
  assert.match(server, /delete item\.generationGroupName/);
  assert.match(server, /updateGalleryGroupName\(db\.items/);
});
