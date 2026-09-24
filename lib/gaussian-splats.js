'use strict';

// Optional native reconstruction tools; the web/server runtime stays dependency-free.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');

const ORBIT_SECONDS = 12;
const ORBIT_PROMPT = 'A single continuous twelve-second photogrammetry capture of the subject and setting in the reference image. The subject is completely motionless. The camera travels slowly on a level circular rail around the stationary subject, exactly one full 360-degree orbit spread evenly over the entire shot. At three seconds it reaches the first side, at six seconds the back, at nine seconds the opposite side, and only at the end returns to the starting view. Smooth constant angular speed from the first frame to the last: no sudden acceleration, whip pan, rapid spin, reversal, or pause followed by a rush. The camera stays the same distance and height, aimed at the subject center, with fixed focal length and framing. The subject, ground, background, shadows and lighting remain unchanged in world space; only the camera moves, revealing consistent parallax and occlusion. Crisp individual short-exposure frames, high shutter speed, deep depth of field, sharp ground and background textures. No motion blur, defocus, zoom, cuts, morphing, subject rotation or pose changes. Keep the whole subject inside the frame.';

const RELEASES = {
  brush: { version: '0.3.0', url: 'https://github.com/ArthurBrussee/brush/releases/download/v0.3.0/brush-app-x86_64-pc-windows-msvc.zip', sha256: 'b68e3e9cf052d51bf3ee30776fa5a364de7f2ba13b58443128ff797bb7bcfcd6' },
  colmap: { version: '4.2.0', url: 'https://github.com/colmap/colmap/releases/download/4.2.0/colmap-x64-windows-nocuda.zip', sha256: '7dd1e72f9632199b7f6d80ab6f545fa8d2a2ea023e4802cab3a4624e309f18a1' },
};

function fail(message, status = 400) { return Object.assign(new Error(message), { status }); }
function optionsFor(input = {}) {
  const quality = input.quality === 'quality';
  return { quality: quality ? 'quality' : 'preview', steps: quality ? 15000 : 5000, frames: quality ? 100 : 60, resolution: quality ? 1280 : 768, maxSplats: quality ? 1500000 : 500000 };
}

function orbitOptions({ imageName, width, height, quality, seed, frames }) {
  const scale = (quality === 'quality' ? 1024 : 768) / Math.max(width, height);
  return { mode: 'frames', firstImageName: imageName, lastImageName: imageName, prompt: ORBIT_PROMPT,
    W: Math.max(256, Math.round(width * scale / 32) * 32), H: Math.max(256, Math.round(height * scale / 32) * 32),
    frames, seed, smooth: 2, steps: 20, makePoster: true, turbo: false, fourK: false, loras: [], attentionBackend: 'standard' };
}

async function buildSplatOrbitGraph(options, settings, deps) {
  if (typeof deps.rifeSmooth !== 'function') throw new Error('Create 3D requires RIFE frame interpolation.');
  const graph = await deps.buildMiniMaxH3Graph(options, settings, deps);
  // Interpolate decoded H3 frames, then encode at the matching frame rate.
  // Increasing only the output FPS would speed up the orbit rather than smooth it.
  graph.video.inputs.images = await deps.rifeSmooth(graph, graph.video.inputs.images, options.smooth);
  graph.video.inputs.fps = 24 * options.smooth;
  return deps.filterInputs ? deps.filterInputs(graph) : graph;
}

function refinementOptions(record, extraSteps) {
  const config = optionsFor(record);
  const start = Number(record.trainingSteps) || config.steps;
  const extra = Number(extraSteps);
  if (![5000, 10000].includes(extra) || start + extra > 50000) throw fail('Choose 5,000 or 10,000 more steps, up to 50,000 total.');
  return { ...config, start, steps: start + extra };
}

function validatePly(buffer) {
  const end = buffer.indexOf(Buffer.from('end_header\n'));
  const crEnd = buffer.indexOf(Buffer.from('end_header\r\n'));
  const offset = end >= 0 ? end + 11 : crEnd >= 0 ? crEnd + 12 : -1;
  if (offset < 0 || offset > 65536) throw fail('Choose an uncompressed Gaussian splat PLY file.');
  const header = buffer.subarray(0, offset).toString('ascii');
  if (!/^ply\r?\nformat binary_little_endian 1\.0\r?\n/.test(header)) throw fail('Use binary little-endian PLY exported by Brush or SuperSplat.');
  const count = Number(header.match(/^element vertex (\d+)\r?$/m)?.[1]);
  if (!count || count > 3000000) throw fail('The viewer supports up to 3 million splats. Export a smaller PLY.');
  const props = [...header.matchAll(/^property float (\w+)\r?$/gm)].map((m) => m[1]);
  for (const name of ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']) {
    if (!props.includes(name)) throw fail('This PLY contains points or a mesh, not Gaussian splats.');
  }
  if (header.match(/^element /gm)?.length !== 1 || header.match(/^property /gm)?.length !== props.length || buffer.length < offset + count * props.length * 4) throw fail('Unsupported or incomplete splat PLY.');
  // A robust center/extent keeps distant reconstruction floaters from ruining framing.
  const points = [];
  const stride = props.length * 4;
  for (let i = 0; i < count; i += Math.max(1, Math.floor(count / 3000))) {
    const p = ['x', 'y', 'z'].map((name) => buffer.readFloatLE(offset + i * stride + props.indexOf(name) * 4));
    if (p.every(Number.isFinite)) points.push(p);
  }
  if (!points.length) throw fail('The PLY has no finite positions.');
  const bounds = [0, 1, 2].map((axis) => {
    const values = points.map((p) => p[axis]).sort((a, b) => a - b);
    return [values[Math.floor(values.length * 0.05)], values[Math.min(values.length - 1, Math.floor(values.length * 0.95))]];
  });
  return { count, center: bounds.map(([lo, hi]) => (lo + hi) / 2), radius: Math.max(0.1, ...bounds.map(([lo, hi]) => hi - lo)) };
}

function run(executable, args, { cwd, signal, log = () => {}, timeout = 2 * 60 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, signal, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' } });
    let tail = '';
    const collect = (chunk) => { const value = String(chunk); tail = (tail + value).slice(-4000); log(value); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timer = setTimeout(() => child.kill(), timeout);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolve(tail) : reject(new Error(`${path.basename(executable)} exited ${code}: ${tail.slice(-1500)}`)); });
  });
}

async function findExecutable(root, names, depth = 0) {
  if (depth > 5) return '';
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) if (entry.isFile() && names.includes(entry.name.toLowerCase())) return path.join(root, entry.name);
  for (const entry of entries) if (entry.isDirectory()) { const found = await findExecutable(path.join(root, entry.name), names, depth + 1); if (found) return found; }
  return '';
}

function createSplatService({ dataDir, resolveFfmpeg, assertIdle, getSource, visibleSourceIds, generateOrbit, releaseGpu, readBody, readJsonBody, json, serveFile, isOwner }) {
  const root = path.join(dataDir, 'splats');
  const toolsRoot = path.join(root, 'tools');
  let active = null;
  let installing = false;
  let installMessage = '';
  let cachedTools = null;
  let probing = null;
  fs.mkdirSync(root, { recursive: true });

  const directory = (id) => path.join(root, id);
  const save = (record) => {
    const file = path.join(directory(record.id), 'record.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(record, null, 2));
    fs.renameSync(file + '.tmp', file);
  };
  function records(req) {
    const visible = visibleSourceIds(req);
    return fs.readdirSync(root).filter((id) => /^[a-f0-9-]{36}$/.test(id)).flatMap((id) => {
      try {
        const record = JSON.parse(fs.readFileSync(path.join(directory(id), 'record.json'), 'utf8'));
        if (record.profileId !== req.profile.id || (record.sourceItemId && !visible.has(record.sourceItemId))) return [];
        if (record.status === 'working' && active?.id !== id) { record.status = 'interrupted'; record.stage = 'Interrupted by an app restart. Create again to retry.'; save(record); }
        return [record];
      } catch { return []; }
    }).sort((a, b) => b.createdAt - a.createdAt);
  }
  function publicRecord(record) {
    const { profileId, ...result } = record;
    return { ...result, canRefine: record.status === 'complete' && !record.imported && fs.existsSync(path.join(directory(record.id), 'images')) && fs.existsSync(path.join(directory(record.id), 'sparse', '0', 'images.bin')) };
  }
  async function tools(force = false) {
    if (cachedTools && !force) return cachedTools;
    if (probing) return probing;
    probing = (async () => {
      const brush = process.env.MIX_SPLAT_BRUSH || await findExecutable(toolsRoot, ['brush.exe', 'brush-app.exe', 'brush_app.exe']) || 'brush';
      const colmap = process.env.MIX_SPLAT_COLMAP || await findExecutable(toolsRoot, ['colmap.exe']) || 'colmap';
      const ffmpeg = await resolveFfmpeg();
      const check = async (exe, args) => { try { await run(exe, args, { timeout: 15000 }); return true; } catch { return false; } };
      const [brushReady, colmapReady] = await Promise.all([check(brush, ['--help']), check(colmap, ['-h'])]);
      cachedTools = { brush, colmap, ffmpeg, ready: !!ffmpeg && brushReady && colmapReady, brushReady, colmapReady, ffmpegReady: !!ffmpeg };
      return cachedTools;
    })();
    try { return await probing; } finally { probing = null; }
  }

  async function install() {
    installing = true;
    try {
      await assertIdle();
      for (const [name, release] of Object.entries(RELEASES)) {
        installMessage = `Downloading ${name === 'brush' ? 'Brush' : 'COLMAP'} ${release.version}…`;
        const dest = path.join(toolsRoot, name);
        await fsp.mkdir(dest, { recursive: true });
        const archive = path.join(toolsRoot, `${name}.zip`);
        const response = await fetch(release.url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
        if (!response.ok) throw new Error(`Download returned HTTP ${response.status}`);
        await pipeline(response.body, fs.createWriteStream(archive));
        const hash = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
        if (hash.digest('hex') !== release.sha256) throw new Error(`${name} download checksum did not match.`);
        installMessage = `Installing ${name}…`;
        const literal = (value) => `'${value.replace(/'/g, "''")}'`;
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${literal(archive)} -DestinationPath ${literal(dest)} -Force`], { timeout: 180000 });
        await fsp.unlink(archive);
      }
      const ready = await tools(true);
      installMessage = ready.ready ? 'Local tools are ready.' : 'Tools installed. FFmpeg or a compatible graphics driver is still required.';
    } catch (error) { installMessage = error.message; }
    finally { installing = false; }
  }

  async function reconstruct(record, source, executables, controller) {
    const work = directory(record.id);
    const images = path.join(work, 'images');
    const sparse = path.join(work, 'sparse');
    const database = path.join(work, 'database.db');
    const config = optionsFor(record);
    const logFile = fs.createWriteStream(path.join(work, 'training.log'), { flags: 'a' });
    const execute = (exe, args) => run(exe, args, { cwd: work, signal: controller.signal, log: (line) => logFile.write(line) });
    const stage = (text) => { record.stage = text; record.updatedAt = Date.now(); save(record); };
    try {
      controller.signal.throwIfAborted();
      if (releaseGpu) await releaseGpu();
      await fsp.mkdir(images); await fsp.mkdir(sparse);
      stage('Extracting orbit frames');
      const probeText = await run(executables.ffmpeg, ['-hide_banner', '-i', source, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'], { signal: controller.signal, timeout: 30000 });
      const time = probeText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const duration = time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0;
      if (duration > 120 || duration < 2) throw new Error('Choose a continuous orbit between 2 seconds and 2 minutes.');
      const rate = config.frames / duration;
      // Fixed frame budget prevents arbitrary-length uploads from exploding training cost.
      await execute(executables.ffmpeg, ['-hide_banner', '-y', '-i', source, '-an', '-vf', `fps=${rate.toFixed(5)},mpdecimate,scale=${config.resolution}:${config.resolution}:force_original_aspect_ratio=decrease`, '-fps_mode', 'vfr', '-frames:v', String(config.frames), path.join(images, 'frame_%04d.png')]);
      const frames = (await fsp.readdir(images)).filter((name) => name.endsWith('.png'));
      if (frames.length < 12) throw new Error('Not enough different views. Use a continuous orbit video with a still subject.');
      record.frames = frames.length;
      stage('Finding image features');
      await execute(executables.colmap, ['feature_extractor', '--database_path', database, '--image_path', images, '--ImageReader.camera_model', 'SIMPLE_PINHOLE', '--ImageReader.single_camera', '1', '--FeatureExtraction.use_gpu', '0']);
      stage('Matching views');
      await execute(executables.colmap, ['exhaustive_matcher', '--database_path', database, '--FeatureMatching.use_gpu', '0']);
      stage('Reconstructing cameras');
      await execute(executables.colmap, ['mapper', '--database_path', database, '--image_path', images, '--output_path', sparse]);
      const models = [];
      for (const name of await fsp.readdir(sparse)) {
        const file = path.join(sparse, name, 'images.bin');
        try { const handle = await fsp.open(file); const header = Buffer.alloc(8); await handle.read(header, 0, 8, 0); await handle.close(); models.push({ name, count: Number(header.readBigUInt64LE()) }); } catch { /* no reconstruction in this directory */ }
      }
      models.sort((a, b) => b.count - a.count);
      const best = models[0];
      if (!best || best.count < Math.max(10, frames.length * 0.5)) throw new Error('Camera reconstruction could not connect enough views. Try a slower orbit with no pose changes, cuts, or moving background.');
      record.registeredFrames = best.count;
      // Normalize the selected model to COLMAP's conventional sparse/0 layout.
      if (best.name !== '0') { await fsp.rename(path.join(sparse, '0'), path.join(work, 'unused-model-0')).catch(() => {}); await fsp.rename(path.join(sparse, best.name), path.join(sparse, '0')); }
      stage(`Training splats · ${config.steps.toLocaleString()} steps`);
      await execute(executables.brush, [work, '--total-steps', String(config.steps), '--max-splats', String(config.maxSplats), '--max-resolution', String(config.resolution), '--export-every', String(config.steps), '--export-path', work, '--export-name', 'scene.ply']);
      const info = validatePly(await fsp.readFile(path.join(work, 'scene.ply')));
      Object.assign(record, info, { status: 'complete', trainingSteps: config.steps, stage: 'Ready to explore', completedAt: Date.now(), durationSeconds: Math.round((Date.now() - record.createdAt) / 1000) });
      save(record);
    } catch (error) {
      record.status = controller.signal.aborted ? 'cancelled' : 'failed';
      record.stage = controller.signal.aborted ? 'Cancelled' : error.message;
      record.updatedAt = Date.now(); save(record);
    } finally { logFile.end(); active = null; }
  }

  async function photoPipeline(record, source, executables, controller) {
    try {
      record.stage = 'Preparing photo'; save(record);
      const image = path.join(directory(record.id), 'source.png');
      await run(executables.ffmpeg, ['-hide_banner', '-y', '-i', source, '-frames:v', '1', '-vf', 'scale=1920:1920:force_original_aspect_ratio=decrease', image], { signal: controller.signal, timeout: 30000 });
      record.fromPhoto = true; record.stage = 'Generating 360° orbit video'; save(record);
      if (!generateOrbit) throw new Error('Orbit generation is unavailable.');
      const result = await generateOrbit({ image, profileId: record.profileId, quality: record.quality, signal: controller.signal, onSubmitted: (id) => { record.promptId = id; save(record); }, onStage: (text) => { record.stage = text; save(record); } });
      record.orbitFrames = result.frames; record.orbitFps = result.fps; record.interpolation = result.interpolation;
      record.videoUrl = result.videoUrl; record.sourceItemId = result.itemId; record.videoId = result.videoId;
      record.stage = 'Orbit ready · preparing reconstruction'; save(record);
      controller.signal.throwIfAborted();
      await reconstruct(record, result.path, executables, controller);
    } catch (error) {
      record.status = controller.signal.aborted ? 'cancelled' : 'failed';
      record.stage = controller.signal.aborted ? 'Cancelled' : error.message;
      save(record); active = null;
    }
  }

  async function refine(record, parent, config, executables, controller) {
    const work = directory(record.id), original = directory(parent.id);
    const logFile = fs.createWriteStream(path.join(work, 'training.log'), { flags: 'a' });
    try {
      // Each refinement is a new scene. Keep the original PLY and dataset intact.
      for (const folder of ['images', 'sparse']) {
        controller.signal.throwIfAborted();
        await fsp.cp(path.join(original, folder), path.join(work, folder), { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
      }
      await fsp.copyFile(path.join(original, 'scene.ply'), path.join(work, 'init.ply'));
      if (parent.fromPhoto) await fsp.copyFile(path.join(original, 'source.png'), path.join(work, 'source.png'));
      if (releaseGpu) await releaseGpu();
      controller.signal.throwIfAborted();
      record.stage = `Refining splats · +${(config.steps - config.start).toLocaleString()} steps`; save(record);
      await run(executables.brush, [work, '--start-iter', String(config.start), '--total-steps', String(config.steps), '--max-splats', String(config.maxSplats), '--max-resolution', String(config.resolution), '--export-every', String(config.steps), '--export-path', work, '--export-name', 'scene.ply'], { cwd: work, signal: controller.signal, log: line => logFile.write(line) });
      Object.assign(record, validatePly(await fsp.readFile(path.join(work, 'scene.ply'))), { status: 'complete', stage: 'Ready to explore', completedAt: Date.now(), trainingSteps: config.steps, durationSeconds: Math.round((Date.now() - record.createdAt) / 1000) });
      save(record);
    } catch (error) { record.status = controller.signal.aborted ? 'cancelled' : 'failed'; record.stage = controller.signal.aborted ? 'Cancelled' : error.message; save(record); }
    finally { logFile.end(); active = null; }
  }

  async function handle(req, res, url) {
    const route = url.pathname;
    if (!route.startsWith('/api/splats')) return false;
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (route === '/api/splats' && req.method === 'GET') {
        const status = await tools();
        json(res, 200, { records: records(req).map(publicRecord), tools: { ready: status.ready, brush: status.brushReady, colmap: status.colmapReady, ffmpeg: status.ffmpegReady }, canInstall: isOwner(req) && process.platform === 'win32' && process.arch === 'x64', installing, installMessage, busy: !!active, orbitPrompt: ORBIT_PROMPT }); return true;
      }
      if (route === '/api/splats/install' && req.method === 'POST') {
        if (!isOwner(req)) throw fail('Only the owner can install local tools.', 403);
        if (process.platform !== 'win32' || process.arch !== 'x64') throw fail('Install Brush and COLMAP using the setup instructions for your operating system.');
        if (active || installing) throw fail('Wait for the current splat operation to finish.', 409);
        void install(); json(res, 202, { ok: true }); return true;
      }
      const match = route.match(/^\/api\/splats\/([a-f0-9-]{36})\/(file|photo|cancel|refine)$/);
      if (match) {
        const record = records(req).find((entry) => entry.id === match[1]);
        if (!record) throw fail('Splat not found.', 404);
        if (match[2] === 'refine' && req.method === 'POST') {
          if (active || installing) throw fail('Wait for the current splat operation to finish.', 409);
          if (!publicRecord(record).canRefine) throw fail('Further training needs the original camera reconstruction and images. Imported PLY files cannot be trained alone.', 409);
          const controller = new AbortController(), id = crypto.randomUUID();
          active = { id, controller };
          try {
            const config = refinementOptions(record, (await readJsonBody(req)).extraSteps);
            await assertIdle();
            const executables = await tools();
            if (!executables.ready) throw fail('Install the local reconstruction tools first.', 409);
            const next = { ...record, id, parentId: record.id, title: record.title.replace(/ · \d[\d,]* steps$/, '') + ` · ${config.steps.toLocaleString()} steps`, status: 'working', stage: 'Preparing further training', createdAt: Date.now() };
            delete next.completedAt; delete next.durationSeconds;
            await fsp.mkdir(directory(id)); save(next);
            void refine(next, record, config, executables, controller);
            json(res, 202, publicRecord(next)); return true;
          } catch (error) { active = null; throw error; }
        }
        if (match[2] === 'photo' && req.method === 'GET' && record.fromPhoto) { serveFile(res, path.join(directory(record.id), 'source.png')); return true; }
        if (match[2] === 'file' && req.method === 'GET' && record.status === 'complete') {
          if (url.searchParams.has('download')) res.setHeader('Content-Disposition', 'attachment; filename="mix-studio-splat.ply"');
          serveFile(res, path.join(directory(record.id), 'scene.ply'), req.headers.range); return true;
        }
        if (match[2] === 'cancel' && req.method === 'POST') { if (active?.id === record.id) active.controller.abort(); json(res, 200, { ok: true }); return true; }
      }
      if (['/api/splats/create', '/api/splats/video', '/api/splats/import', '/api/splats/photo'].includes(route) && req.method === 'POST') {
        if (active || installing) throw fail('Wait for the current splat operation to finish.', 409);
        // Reserve before any await, including the upload and idle check.
        const controller = new AbortController();
        const id = crypto.randomUUID();
        active = { id, controller };
        try {
          const record = { id, profileId: req.profile.id, title: 'Untitled splat', status: 'working', stage: 'Preparing', createdAt: Date.now(), quality: url.searchParams.get('quality') === 'quality' ? 'quality' : 'preview' };
          let source;
          let input;
          let executables;
          if (route !== '/api/splats/import') {
            executables = await tools();
            if (!executables.ready) throw fail('Install the local reconstruction tools first.', 409);
            await assertIdle();
          }
          if (route === '/api/splats/create') {
            const body = await readJsonBody(req);
            const selected = getSource(req, body);
            if (!selected) throw fail('Video not found in your unlocked Library.', 404);
            source = selected.path; record.sourceItemId = selected.itemId; record.videoUrl = selected.videoUrl; record.videoId = selected.videoId; record.title = selected.title || record.title;
          } else {
            input = await readBody(req, 256 * 1024 * 1024);
            const filename = decodeURIComponent(req.headers['x-filename'] || 'Untitled splat');
            record.title = path.basename(filename).replace(/\.[^.]+$/, '').slice(0, 100);
          }
          if (route === '/api/splats/import') {
            Object.assign(record, validatePly(input), { status: 'complete', stage: 'Imported', imported: true });
          }
          await fsp.mkdir(directory(id));
          if (input) {
            source = path.join(directory(id), route === '/api/splats/import' ? 'scene.ply' : 'source-video');
            await fsp.writeFile(source, input);
          }
          save(record);
          if (route === '/api/splats/import') active = null;
          else if (route === '/api/splats/photo') void photoPipeline(record, source, executables, controller);
          else void reconstruct(record, source, executables, controller);
          json(res, 202, publicRecord(record)); return true;
        } catch (error) { active = null; throw error; }
      }
      throw fail('Splat route not found.', 404);
    } catch (error) { json(res, error.status || 500, { error: error.message }); return true; }
  }
  return { handle, busy: () => !!active || installing, galleryScenes: (req) => records(req).filter(record => record.status === 'complete' && record.sourceItemId).map(publicRecord) };
}

module.exports = { createSplatService, optionsFor, orbitOptions, buildSplatOrbitGraph, refinementOptions, validatePly, ORBIT_PROMPT, ORBIT_SECONDS, RELEASES, run };
