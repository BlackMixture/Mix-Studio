'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

function sourceSection(startNeedle, endNeedle) {
  const start = server.indexOf(startNeedle);
  const end = server.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0, `missing server source marker: ${startNeedle}`);
  assert.ok(end > start, `missing server source marker after ${startNeedle}: ${endNeedle}`);
  return server.slice(start, end);
}

test('an open Owner workspace is local-only until a PIN is set', () => {
  const currentProfile = sourceSection('function currentProfile(', 'function profileCookie(');
  assert.match(currentProfile, /fallback\s*&&\s*isLoopbackRequest\(req\)/);
  assert.match(
    currentProfile,
    /if\s*\(id\)\s*\{[\s\S]*db\.profiles\.find[\s\S]*!isLoopbackRequest\(req\)[\s\S]*!\w+\.pinHash[\s\S]*return null/,
    'a valid old cookie must not make a remote PIN-less profile accessible',
  );
  assert.match(server, /Remote access is locked until the Owner adds a PIN/);
  assert.match(server, /Create profiles from the generation computer or while signed in as the Owner/);
  assert.match(server, /createLoginThrottle\(\)/);
});

test('live events require authentication and are delivered only to their profile', () => {
  const authGate = sourceSection('// Everything else needs a signed-in profile.', "if (route === '/api/releases/latest'");
  assert.match(authGate, /if \(!profile && route !== '\/api\/meta'\)/);
  assert.doesNotMatch(authGate, /route !== '\/api\/events'/);
  assert.match(authGate, /sseClients\.set\(res, profile\.id\)/);

  const broadcast = sourceSection('function eventProfileId(', '/* ------------------------------------------------------------------ */\n/* ComfyUI bridge');
  assert.match(broadcast, /const profileId = eventProfileId\(data\)/);
  assert.match(broadcast, /if \(profileId && profileId !== clientProfileId\) continue/);

  const statusCalls = [...server.matchAll(/broadcast\('status',\s*\{([\s\S]*?)\}\);/g)];
  assert.ok(statusCalls.length >= 5, 'expected the tracked job status broadcasts to be testable');
  for (const call of statusCalls) {
    assert.match(call[1], /\bprofileId\s*(?::|,|$)/, `unscoped status event: ${call[0]}`);
  }
  assert.match(server, /broadcast\('queueReset',\s*\{[^}]*profileId:\s*req\.profile\.id/);

  const preview = sourceSection('function handleWsBinary(', '/* --------------------------- Job lifecycle');
  assert.match(preview, /const job = jobs\.get\(jobId\)/);
  assert.match(preview, /if \(!job\) return/);
  assert.match(preview, /profileId:\s*job\.profileId/);
});

test('generated media is restricted to visible records owned by the signed-in profile', () => {
  const access = sourceSection('function canAccessProfileMedia(', '/* ------------------------------------------------------------------ */\n/* API routes');
  assert.match(access, /galleryView\(db, isPrivateUnlocked\(req\)\)\.items/);
  assert.match(access, /item\.profileId === profile\.id/);
  assert.match(access, /kind === 'image'/);
  assert.match(access, /kind === 'video'/);
  assert.match(access, /kind === 'face'/);
  assert.match(access, /db\.faces/);
  assert.match(access, /face\.profileId === profile\.id/);

  const imageRoute = sourceSection("if (url.pathname.startsWith('/images/'))", "if (url.pathname.startsWith('/videos/'))");
  const videoRoute = sourceSection("if (url.pathname.startsWith('/videos/'))", "if (url.pathname.startsWith('/faces/'))");
  const faceRoute = sourceSection("if (url.pathname.startsWith('/faces/'))", "if (url.pathname.startsWith('/avatars/'))");
  for (const [kind, route] of [['image', imageRoute], ['video', videoRoute], ['face', faceRoute]]) {
    assert.match(route, /const profile = currentProfile\(req\)/);
    assert.match(route, new RegExp(`canAccessProfileMedia\\(req,\\s*profile,\\s*'${kind}',\\s*[\\w.]+\\)`));
    assert.match(route, /res\.writeHead\(404\)/, 'unowned and locked media should not reveal whether a file exists');
  }
});

test('phone access requires an Owner PIN before addresses can be copied', () => {
  assert.match(html, /id="phoneAccessSecure"[^>]*hidden[^>]*>Add Owner PIN/);
  assert.match(server, /requiresOwnerPin:\s*!ownerHasPin/);
  assert.match(server, /tailscaleUrl:\s*ownerHasPin\s*\?/);
  assert.match(app, /const requiresOwnerPin = access\.requiresOwnerPin === true/);
  assert.match(app, /phoneAccessSecure[\s\S]{0,240}openProfileEdit\(\)/);
});

test('changing a profile PIN revokes older signed cookies', () => {
  assert.match(server, /function rotateAuthSecret\(\)/);
  const rotateSecret = sourceSection('function rotateAuthSecret()', 'if (!db.loraThumbs');
  assert.match(rotateSecret, /sseClients\.keys\(\)/);
  assert.match(rotateSecret, /\w+\.end\(\)/);
  assert.match(rotateSecret, /sseClients\.clear\(\)/);

  const profileEdit = sourceSection("if (profMan && req.method === 'POST')", "if (profMan && req.method === 'DELETE')");
  assert.match(profileEdit, /rotateAuthSecret\(\)/);
  assert.match(profileEdit, /Set-Cookie/);
  assert.match(profileEdit, /signProfileId\(profile\.id, AUTH_SECRET\)/);
  assert.doesNotMatch(profileEdit, /signProfileId\(target\.id, AUTH_SECRET\)/);
});

test('profile authentication cookies are unavailable to client-side scripts', () => {
  const cookie = sourceSection('function profileCookie(', '// One-time repair');
  assert.match(cookie, /HttpOnly/);
});
