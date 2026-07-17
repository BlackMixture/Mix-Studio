'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MAX_ANNOUNCEMENTS,
  MAX_MESSAGE_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeAnnouncementInput,
  normalizeAnnouncementList,
} = require('../lib/update-announcements');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('update announcement input is compact, bounded, and requires useful copy', () => {
  assert.deepEqual(normalizeAnnouncementInput({
    title: '  Faster   video tools  ',
    message: 'New controls.\r\n\r\n\r\nTry them today.   ',
    version: '  v1.2.0  ',
  }), {
    title: 'Faster video tools',
    message: 'New controls.\n\nTry them today.',
    version: 'v1.2.0',
  });
  assert.equal(normalizeAnnouncementInput({ title: 'x'.repeat(200), message: 'y' }).title.length, MAX_TITLE_LENGTH);
  assert.equal(normalizeAnnouncementInput({ title: 'x', message: 'y'.repeat(1000) }).message.length, MAX_MESSAGE_LENGTH);
  assert.throws(() => normalizeAnnouncementInput({ title: '', message: 'Message' }), /title/i);
  assert.throws(() => normalizeAnnouncementInput({ title: 'Title', message: '' }), /message/i);
});

test('stored update announcements are newest-first, unique, and bounded', () => {
  const entries = Array.from({ length: MAX_ANNOUNCEMENTS + 5 }, (_, index) => ({
    id: `id-${index}`,
    title: `Update ${index}`,
    message: 'Details',
    version: `v${index}`,
    createdAt: index + 1,
  }));
  entries.push({ ...entries[4], createdAt: 999 });
  entries.push({ id: '', title: 'Bad', message: 'Missing ID', createdAt: 1000 });
  const normalized = normalizeAnnouncementList(entries);
  assert.equal(normalized.length, MAX_ANNOUNCEMENTS);
  assert.equal(normalized[0].id, `id-${MAX_ANNOUNCEMENTS + 4}`);
  assert.equal(new Set(normalized.map((entry) => entry.id)).size, normalized.length);
});

test('the server persists owner announcements and broadcasts them live', () => {
  assert.match(server, /db\.updateAnnouncements = normalizeAnnouncementList\(db\.updateAnnouncements\)/);
  assert.match(server, /route === '\/api\/update-announcements' && req\.method === 'GET'/);
  assert.match(server, /route === '\/api\/update-announcements' && req\.method === 'POST'/);
  assert.match(server, /if \(!isAdmin\(\)\).*Only the owner profile can publish update announcements/);
  assert.match(server, /broadcast\('updateAnnouncement', \{ announcement \}\)/);
  assert.match(server, /db\.updateAnnouncements = db\.updateAnnouncements\.slice\(0, MAX_ANNOUNCEMENTS\)/);
});

test('users have a durable update inbox, live notice, and opt-in browser alerts', () => {
  assert.match(html, /id="updatesBtn"[\s\S]*id="updatesUnreadDot"/);
  assert.match(html, /id="updatesSheet"[\s\S]*id="updatesAlertToggle"[^>]+role="switch"/);
  assert.match(html, /id="updateNotice"[^>]+aria-live="polite"/);
  assert.match(app, /api\('\/api\/update-announcements'\)/);
  assert.match(app, /es\.addEventListener\('updateAnnouncement'/);
  assert.match(app, /localStorage\.setItem\(key, latest\.id\)/);
  assert.match(app, /window\.isSecureContext && 'Notification' in window/);
  assert.match(app, /new Notification\(announcement\.title/);
  assert.match(css, /\.update-notice \{[\s\S]*position: fixed/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*\.update-notice/);
});

test('only the owner sees the settings publisher and publishing requires confirmation', () => {
  const systemPane = html.match(/id="settingsPaneSystem"([\s\S]*?)<\/section>/)?.[1] || '';
  assert.match(systemPane, /id="updatePublisher" hidden/);
  assert.match(systemPane, /id="updatePublishVersion"[\s\S]*id="updatePublishTitle"[\s\S]*id="updatePublishMessage"[\s\S]*id="updatePublishBtn"/);
  assert.match(app, /publisher\.hidden = !state\.profileIsOwner/);
  assert.match(app, /title: 'Push this update\?'/);
  assert.match(app, /message: 'It will appear for every Mix Studio profile and cannot be edited after publishing\.'/);
});
