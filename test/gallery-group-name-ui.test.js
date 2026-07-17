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
  assert.match(css, /\.desktop-group-name-field:focus-within > svg \{[\s\S]*width: 17px;[\s\S]*opacity: 1;/);
  assert.doesNotMatch(css, /\.desktop-group-name-field:hover > svg/);
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
  assert.match(app, /expectedName: currentGroup\.name,[\s\S]*memberIds: currentMemberIds/);
  assert.match(app, /queueGalleryGroupNameSave\(groupType, groupId/);
  assert.match(app, /document\.activeElement === input \|\| input\.dataset\.saveToken/);
  assert.match(app, /setAttribute\('aria-label', name \? `Rename group \$\{name\}` : 'Name this gallery group'\)/);
  assert.match(app, /const navigatedWithinGroup = input\.dataset\.saveToken === saveToken/);
  assert.match(app, /response\.groupType !== groupType \|\| String\(response\.groupId\) !== String\(groupId\)/);
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
  assert.match(server, /const inheritedAngleGroupName = job\.params\.angleGroupId/);
  assert.match(server, /angleGroupName: inheritedAngleGroupName \|\| undefined/);
});

test('named groups are visible, searchable, sortable, and safely rendered in Library', () => {
  assert.match(app, /function libraryGroupNameIndex\(items = state\.items\)/);
  assert.match(app, /const groupName = groupNames \? groupNames\.get\(it\) : activeGalleryGroup\(it\)\?\.name/);
  assert.match(app, /groupNames\.get\(a\) \|\| a\.name/);
  assert.match(app, /groupName\.textContent = galleryGroupName/);
  assert.match(app, /card\.setAttribute\('aria-label', `\$\{galleryGroupName\}, \$\{galleryGroup\.items\.length\} results`\)/);
  assert.match(css, /\.gallery-group-name \{[\s\S]*text-overflow: ellipsis/);
});

test('profile-scoped group endpoint handles privacy, stale state, and lifecycle cleanup', () => {
  assert.match(server, /itemGroupRoute = route\.match\(\/\^\\\/api\\\/item\\\/\(\[\\w\]\+\)\\\/group\$\//);
  assert.match(server, /visible\.find\(\(item\) => item\.id === itemGroupRoute\[1\]\)/);
  assert.match(server, /visibleIds: new Set\(visible\.map\(\(item\) => String\(item\.id\)\)\)/);
  assert.match(server, /expectedName: body\.expectedName/);
  assert.match(server, /memberIds: body\.memberIds/);
  assert.match(server, /Unlock the gallery before renaming this group/);
  assert.match(server, /Unlock the gallery before regrouping these generations/);
  assert.match(server, /Unlock the gallery before ungrouping this group/);
  assert.match(server, /delete item\.generationGroupName/);
  assert.match(server, /updateGalleryGroupName\(db\.items/);
});
