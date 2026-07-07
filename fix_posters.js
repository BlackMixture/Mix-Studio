'use strict';
/* Repair recovered video posters: extract each video's real first frame
 * with ffmpeg (the recovery script had guessed nearest-in-time images).
 * Run with the app server STOPPED. */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FFMPEG = 'C:/Apps/ffmpeg-8/bin/ffmpeg.exe';
const DATA = path.join(__dirname, 'data');
const IMAGES = path.join(DATA, 'images');
const VIDEOS = path.join(DATA, 'videos');
const DB_FILE = path.join(DATA, 'db.json');

function pngDims(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
let fixed = 0;
let failed = 0;

for (const item of db.items) {
  if (!item.recovered || item.mode !== 'video' || !item.videos || !item.videos.length) continue;
  const vid = path.join(VIDEOS, item.videos[0].file);
  if (!fs.existsSync(vid)) { failed++; continue; }
  const newName = `${item.id}p.png`;
  const out = path.join(IMAGES, newName);
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', vid, '-frames:v', '1', out], { timeout: 30000 });
  if (r.status !== 0 || !fs.existsSync(out)) { failed++; continue; }
  const dims = pngDims(fs.readFileSync(out));
  const old = item.file;
  item.file = newName;
  if (dims) { item.width = dims.w; item.height = dims.h; }
  if (old && old !== newName) {
    try { fs.unlinkSync(path.join(IMAGES, old)); } catch { /* may be shared/missing */ }
  }
  fixed++;
}

const tmp = DB_FILE + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
fs.renameSync(tmp, DB_FILE);
console.log(`posters fixed: ${fixed}, failed: ${failed}`);
