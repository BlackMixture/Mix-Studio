'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { findComfyBase, findComfyPython } = require('./sam3-installer');

const AUDIO_RATE = 48000;
const DEFAULT_VIDEO_PREVIEW_SIZE = 640;
const DEFAULT_VIDEO_PREVIEW_FPS = 24;
const VIDEO_PREVIEW_SIZE_OPTIONS = Object.freeze([480, 640, 720]);
const VIDEO_PREVIEW_FPS_OPTIONS = Object.freeze([12, 18, 24, 30]);

function finitePositive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`Video extension ${name} must be a positive number`);
  }
  return number;
}

function evenDimension(value, name) {
  const number = finitePositive(value, name);
  if (!Number.isInteger(number) || number % 2 !== 0) {
    throw new Error(`Video extension ${name} must be a positive even integer`);
  }
  return number;
}

function requiredPath(value, name) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`Video extension ${name} is required`);
  return result;
}

function filterNumber(value) {
  return Number(value.toFixed(6)).toString();
}

function normalizedAudioFilter(input, duration, output) {
  return `[${input}:a:0]aresample=${AUDIO_RATE}:async=1:first_pts=0,`
    + `aformat=sample_fmts=fltp:sample_rates=${AUDIO_RATE}:channel_layouts=stereo,`
    + `atrim=duration=${duration},apad=pad_dur=${duration},atrim=duration=${duration},`
    + `asetpts=PTS-STARTPTS[${output}]`;
}

function silentAudioFilter(duration, output) {
  return `anullsrc=r=${AUDIO_RATE}:cl=stereo,`
    + `aformat=sample_fmts=fltp:sample_rates=${AUDIO_RATE}:channel_layouts=stereo,`
    + `atrim=duration=${duration},asetpts=PTS-STARTPTS[${output}]`;
}

/**
 * Build an execFile-compatible FFmpeg argument array. Paths remain individual
 * arguments; only validated numeric values are interpolated into the filter.
 */
function extensionJoinArgs({ sourcePath, tailPath, outputPath, plan, sourceHasAudio } = {}) {
  const source = requiredPath(sourcePath, 'source path');
  const tail = requiredPath(tailPath, 'tail path');
  const output = requiredPath(outputPath, 'output path');
  const resolvedPlan = plan && typeof plan === 'object' ? plan : {};
  const fps = filterNumber(finitePositive(resolvedPlan.outputFps, 'output fps'));
  const width = evenDimension(resolvedPlan.outputWidth, 'output width');
  const height = evenDimension(resolvedPlan.outputHeight, 'output height');
  const sourceSeconds = filterNumber(finitePositive(resolvedPlan.sourceSeconds, 'source duration'));
  const tailSeconds = filterNumber(finitePositive(resolvedPlan.normalizedSeconds, 'tail duration'));
  const continueAudio = resolvedPlan.continueAudio !== false;
  const sourceAudio = sourceHasAudio === true;
  const includeAudio = continueAudio || sourceAudio;
  const videoShape = `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease,`
    + `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p`;
  const filters = [
    `[0:v:0]trim=duration=${sourceSeconds},setpts=PTS-STARTPTS,${videoShape}[source_v]`,
    `[1:v:0]trim=duration=${tailSeconds},setpts=PTS-STARTPTS,${videoShape}[tail_v]`,
    '[source_v][tail_v]concat=n=2:v=1:a=0[video]',
  ];

  if (includeAudio) {
    filters.push(sourceAudio
      ? normalizedAudioFilter(0, sourceSeconds, 'source_a')
      : silentAudioFilter(sourceSeconds, 'source_a'));
    filters.push(continueAudio
      ? normalizedAudioFilter(1, tailSeconds, 'tail_a')
      : silentAudioFilter(tailSeconds, 'tail_a'));
    filters.push('[source_a][tail_a]concat=n=2:v=0:a=1[audio]');
  }

  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', source,
    '-i', tail,
    '-filter_complex', filters.join(';'),
    '-map', '[video]',
  ];
  if (includeAudio) {
    args.push(
      '-map', '[audio]',
      '-c:a', 'aac',
      '-ar', String(AUDIO_RATE),
      '-ac', '2',
      '-b:a', '192k',
    );
  } else {
    args.push('-an');
  }
  args.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-r', fps,
    '-movflags', '+faststart',
    '-f', 'mp4',
    output,
  );
  return args;
}

function videoChunkJoinArgs({ sourcePaths, outputPath, segments, fps, width, height } = {}) {
  const sources = Array.isArray(sourcePaths) ? sourcePaths.map((source, index) => (
    requiredPath(source, `chunk ${index + 1} path`)
  )) : [];
  if (sources.length < 2) throw new Error('Video chunk joining needs at least two source videos');
  const output = requiredPath(outputPath, 'chunk output path');
  const rate = finitePositive(fps, 'chunk fps');
  const outputWidth = evenDimension(width, 'chunk width');
  const outputHeight = evenDimension(height, 'chunk height');
  const planned = Array.isArray(segments) ? segments : [];
  if (planned.length !== sources.length) {
    throw new Error('Video chunk plan must match the number of source videos');
  }

  const filters = [];
  const concatInputs = [];
  planned.forEach((segment, index) => {
    const keepFrames = Math.round(Number(segment && segment.keepFrames));
    if (!Number.isInteger(keepFrames) || keepFrames < 1) {
      throw new Error(`Video chunk ${index + 1} must keep at least one frame`);
    }
    const duration = filterNumber(keepFrames / rate);
    filters.push(
      `[${index}:v:0]fps=${filterNumber(rate)},trim=end_frame=${keepFrames},setpts=PTS-STARTPTS,`
      + `scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,`
      + `pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p[v${index}]`
    );
    filters.push(normalizedAudioFilter(index, duration, `a${index}`));
    concatInputs.push(`[v${index}][a${index}]`);
  });
  filters.push(`${concatInputs.join('')}concat=n=${sources.length}:v=1:a=1[video][audio]`);

  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  for (const source of sources) args.push('-i', source);
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[video]',
    '-map', '[audio]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-r', filterNumber(rate),
    '-c:a', 'aac',
    '-ar', String(AUDIO_RATE),
    '-ac', '2',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-f', 'mp4',
    output,
  );
  return args;
}

function wanAnimate2PerformanceArgs({ sourcePath, outputPath, fps, frames, width, height } = {}) {
  const source = requiredPath(sourcePath, 'Wan Animate 2 source path');
  const output = requiredPath(outputPath, 'Wan Animate 2 prepared path');
  const rate = finitePositive(fps, 'Wan Animate 2 fps');
  const frameCount = Math.round(finitePositive(frames, 'Wan Animate 2 frame count'));
  const outputWidth = evenDimension(width, 'Wan Animate 2 width');
  const outputHeight = evenDimension(height, 'Wan Animate 2 height');
  const duration = filterNumber(frameCount / rate);
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', source,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-t', duration,
    '-vf', `fps=${filterNumber(rate)},scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,`
      + `pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p`,
    '-frames:v', String(frameCount),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-c:a', 'aac',
    '-ar', String(AUDIO_RATE),
    '-ac', '2',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-f', 'mp4',
    output,
  ];
}

function wanAnimate2ChunkJoinArgs({
  sourcePaths, outputPath, segments, fps, width, height, audioSourcePath, sourceHasAudio,
} = {}) {
  const sources = Array.isArray(sourcePaths) ? sourcePaths.map((source, index) => (
    requiredPath(source, `Wan Animate 2 chunk ${index + 1} path`)
  )) : [];
  if (!sources.length) throw new Error('Wan Animate 2 joining needs at least one source video');
  const output = requiredPath(outputPath, 'Wan Animate 2 output path');
  const rate = finitePositive(fps, 'Wan Animate 2 fps');
  const outputWidth = evenDimension(width, 'Wan Animate 2 width');
  const outputHeight = evenDimension(height, 'Wan Animate 2 height');
  const planned = Array.isArray(segments) ? segments : [];
  if (planned.length !== sources.length) {
    throw new Error('Wan Animate 2 chunk plan must match the number of source videos');
  }

  const filters = [];
  const concatInputs = [];
  let totalFrames = 0;
  planned.forEach((segment, index) => {
    const keepFrames = Math.round(Number(segment && segment.keepFrames));
    if (!Number.isInteger(keepFrames) || keepFrames < 1) {
      throw new Error(`Wan Animate 2 chunk ${index + 1} must keep at least one frame`);
    }
    totalFrames += keepFrames;
    filters.push(
      `[${index}:v:0]fps=${filterNumber(rate)},trim=end_frame=${keepFrames},setpts=PTS-STARTPTS,`
      + `scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,`
      + `pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p[v${index}]`
    );
    concatInputs.push(`[v${index}]`);
  });
  if (sources.length === 1) filters.push('[v0]null[video]');
  else filters.push(`${concatInputs.join('')}concat=n=${sources.length}:v=1:a=0[video]`);

  const includeAudio = sourceHasAudio === true;
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  for (const source of sources) args.push('-i', source);
  if (includeAudio) {
    args.push('-i', requiredPath(audioSourcePath, 'Wan Animate 2 audio source path'));
    filters.push(normalizedAudioFilter(sources.length, filterNumber(totalFrames / rate), 'audio'));
  }
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[video]',
  );
  if (includeAudio) {
    args.push(
      '-map', '[audio]',
      '-c:a', 'aac',
      '-ar', String(AUDIO_RATE),
      '-ac', '2',
      '-b:a', '192k',
    );
  } else {
    args.push('-an');
  }
  args.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-r', filterNumber(rate),
    '-movflags', '+faststart',
    '-f', 'mp4',
    output,
  );
  return args;
}

function mp4TranscodeArgs({ sourcePath, outputPath } = {}) {
  const source = requiredPath(sourcePath, 'transcode source path');
  const output = requiredPath(outputPath, 'transcode output path');
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', source,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-c:a', 'aac',
    '-ar', String(AUDIO_RATE),
    '-ac', '2',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-f', 'mp4',
    output,
  ];
}

function normalizeVideoPreviewOptions(options = {}) {
  const requestedSize = Math.round(Number(options.size));
  const requestedFps = Math.round(Number(options.fps));
  return {
    size: VIDEO_PREVIEW_SIZE_OPTIONS.includes(requestedSize)
      ? requestedSize
      : DEFAULT_VIDEO_PREVIEW_SIZE,
    fps: VIDEO_PREVIEW_FPS_OPTIONS.includes(requestedFps)
      ? requestedFps
      : DEFAULT_VIDEO_PREVIEW_FPS,
  };
}

function videoPreviewTranscodeArgs({ sourcePath, outputPath, size, fps } = {}) {
  const source = requiredPath(sourcePath, 'video preview source path');
  const output = requiredPath(outputPath, 'video preview output path');
  const preview = normalizeVideoPreviewOptions({ size, fps });
  const gop = preview.fps * 2;
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', source,
    '-map', '0:v:0',
    '-an',
    '-t', '5',
    '-vf', `scale=${preview.size}:${preview.size}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=${preview.fps},format=yuv420p`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',
    '-g', String(gop),
    '-keyint_min', String(gop),
    '-sc_threshold', '0',
    '-movflags', '+faststart',
    '-f', 'mp4',
    output,
  ];
}

function execFileCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: false,
      timeout: options.timeout || 5 * 60 * 1000,
      maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        return reject(error);
      }
      if (options.captureStderr) {
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
      } else {
        resolve(String(stdout || '').trim());
      }
    });
  });
}

function outputText(value) {
  if (value && typeof value === 'object' && 'stdout' in value) return String(value.stdout || '');
  return String(value || '');
}

function probeOutputText(value) {
  if (value && typeof value === 'object') {
    return `${String(value.stdout || '')}\n${String(value.stderr || '')}`;
  }
  return String(value || '');
}

function parseFfmpegDuration(text) {
  const match = String(text || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** Parse the bounded stream-copy probe emitted by FFmpeg. */
function parseFfmpegVideoProbe(value) {
  const text = probeOutputText(value);
  const streamLine = text.split(/\r?\n/).find((line) => /Stream\s+#.*Video:/i.test(line)) || '';
  const dimensions = streamLine.match(/(?:^|[ ,])(\d{2,5})x(\d{2,5})(?:[ ,\[]|$)/);
  const rate = streamLine.match(/(\d+(?:\.\d+)?)\s*fps\b/i)
    || streamLine.match(/(\d+(?:\.\d+)?)\s*tbr\b/i);
  let width = dimensions ? Number(dimensions[1]) : 0;
  let height = dimensions ? Number(dimensions[2]) : 0;
  const fps = rate ? Number(rate[1]) : 0;
  const rotationMatch = text.match(/rotation of\s+(-?\d+(?:\.\d+)?)\s+degrees/i);
  if (rotationMatch && Math.abs(Math.round(Number(rotationMatch[1])) % 180) === 90) {
    [width, height] = [height, width];
  }
  const frameMatches = [...text.matchAll(/frame=\s*(\d+)/gi)];
  const durationHeader = parseFfmpegDuration(text);
  let frames = frameMatches.length ? Number(frameMatches.at(-1)[1]) : 0;
  if (!(frames > 0) && durationHeader > 0 && fps > 0) frames = Math.max(1, Math.round(durationHeader * fps));
  if (!(width >= 16 && width <= 16384 && height >= 16 && height <= 16384 && fps > 0 && fps <= 240 && frames > 0)) {
    const error = new Error('Could not read reliable video playback metadata from the uploaded file.');
    error.code = 'video_extension_probe_failed';
    throw error;
  }
  return {
    width,
    height,
    fps,
    frames,
    durationSeconds: frames / fps,
    exactFrameCount: true,
  };
}

async function probeVideoFile(sourcePath, ffmpegPath, options = {}) {
  const source = requiredPath(sourcePath, 'source path');
  const executable = String(ffmpegPath || '').trim();
  if (!executable) {
    const error = new Error('Video extension requires FFmpeg to inspect uploaded video metadata.');
    error.code = 'ffmpeg_unavailable';
    throw error;
  }
  const run = options.run || execFileCommand;
  let result;
  try {
    result = await run(executable, [
      '-hide_banner',
      '-nostdin',
      '-i', source,
      '-map', '0:v:0',
      '-c:v', 'copy',
      '-an',
      '-t', '21',
      '-f', 'null',
      '-',
    ], {
      timeout: options.timeout || 90_000,
      maxBuffer: 2 * 1024 * 1024,
      captureStderr: true,
    });
  } catch (error) {
    const wrapped = new Error(`Could not inspect the uploaded video: ${joinErrorDetail(error)}`);
    wrapped.code = 'video_extension_probe_failed';
    wrapped.cause = error;
    throw wrapped;
  }
  return parseFfmpegVideoProbe(result);
}

async function resolveFfmpegExecutable(runtime = {}, options = {}) {
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const run = options.run || execFileCommand;
  const configured = String(env.FFMPEG_PATH || '').trim();
  if (configured && existsSync(configured)) return configured;

  try {
    await run('ffmpeg', ['-version'], { timeout: 5000, env });
    return 'ffmpeg';
  } catch {
    // The bundled ComfyUI environment is the final discovery fallback.
  }

  const discoveryOptions = Object.assign({}, options, { env, existsSync });
  const basePath = findComfyBase(runtime, discoveryOptions);
  const pythonPath = findComfyPython(basePath, discoveryOptions);
  if (!pythonPath) return '';
  try {
    const result = await run(pythonPath, [
      '-c',
      'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())',
    ], { cwd: basePath, timeout: 10_000, env });
    const candidates = outputText(result).split(/\r?\n/).map((line) => line.trim().replace(/^["']|["']$/g, '')).filter(Boolean).reverse();
    return candidates.find((candidate) => existsSync(candidate)) || '';
  } catch {
    return '';
  }
}

function joinErrorDetail(error) {
  const stderr = String(error && error.stderr || '').trim();
  const message = stderr || String(error && error.message || '').trim();
  return message ? message.slice(-1200) : 'FFmpeg did not produce a joined video';
}

async function transcodeVideoFileToMp4({ sourcePath, outputPath, ffmpegPath } = {}, options = {}) {
  const executable = String(ffmpegPath || '').trim();
  if (!executable) {
    const error = new Error('MP4 conversion requires FFmpeg. Set FFMPEG_PATH, install FFmpeg, or make it available through ComfyUI.');
    error.code = 'ffmpeg_unavailable';
    throw error;
  }
  const source = requiredPath(sourcePath, 'transcode source path');
  const output = requiredPath(outputPath, 'transcode output path');
  const fsp = options.fsp || fs.promises;
  const run = options.run || execFileCommand;
  try {
    await run(executable, mp4TranscodeArgs({ sourcePath: source, outputPath: output }), {
      cwd: path.dirname(output),
      timeout: options.timeout || 20 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const result = await fsp.stat(output);
    if (!result.isFile() || result.size === 0) throw new Error('FFmpeg produced an empty MP4');
    return output;
  } catch (error) {
    if (error && error.code === 'ffmpeg_unavailable') throw error;
    const wrapped = new Error(`Could not convert the video to MP4: ${joinErrorDetail(error)}`);
    wrapped.code = 'video_transcode_failed';
    wrapped.cause = error;
    throw wrapped;
  }
}

async function transcodeVideoPreview({ sourcePath, outputPath, ffmpegPath, size, fps } = {}, options = {}) {
  const executable = String(ffmpegPath || '').trim();
  if (!executable) {
    const error = new Error('Video previews require FFmpeg.');
    error.code = 'ffmpeg_unavailable';
    throw error;
  }
  const source = requiredPath(sourcePath, 'video preview source path');
  const output = requiredPath(outputPath, 'video preview output path');
  const fsp = options.fsp || fs.promises;
  const run = options.run || execFileCommand;
  try {
    await run(executable, videoPreviewTranscodeArgs({ sourcePath: source, outputPath: output, size, fps }), {
      cwd: path.dirname(output),
      timeout: options.timeout || 10 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const result = await fsp.stat(output);
    if (!result.isFile() || result.size === 0) throw new Error('FFmpeg produced an empty preview');
    return output;
  } catch (error) {
    if (error && error.code === 'ffmpeg_unavailable') throw error;
    const wrapped = new Error(`Could not create the video preview: ${joinErrorDetail(error)}`);
    wrapped.code = 'video_preview_failed';
    wrapped.cause = error;
    throw wrapped;
  }
}

async function joinVideoExtension({ sourcePath, tailBuffer, plan, sourceHasAudio, ffmpegPath } = {}, options = {}) {
  const executable = String(ffmpegPath || '').trim();
  if (!executable) {
    const error = new Error('Video extension requires FFmpeg. Set FFMPEG_PATH, install FFmpeg, or make it available through ComfyUI.');
    error.code = 'ffmpeg_unavailable';
    throw error;
  }
  const source = requiredPath(sourcePath, 'source path');
  if (!Buffer.isBuffer(tailBuffer) && !(tailBuffer instanceof Uint8Array)) {
    throw new Error('Video extension tail must be a video buffer');
  }
  if (tailBuffer.length === 0) throw new Error('Video extension tail video is empty');

  const fsp = options.fsp || fs.promises;
  const run = options.run || execFileCommand;
  const tmpRoot = typeof options.osTmpdir === 'function'
    ? options.osTmpdir()
    : (options.osTmpdir || os.tmpdir());
  let tempDir = '';
  try {
    tempDir = await fsp.mkdtemp(path.join(tmpRoot, 'mixstudio-video-extension-'));
    const tailPath = path.join(tempDir, 'tail.mp4');
    const outputPath = path.join(tempDir, 'joined.mp4');
    await fsp.writeFile(tailPath, tailBuffer);
    const args = extensionJoinArgs({ sourcePath: source, tailPath, outputPath, plan, sourceHasAudio });
    await run(executable, args, {
      cwd: tempDir,
      timeout: options.timeout || 20 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const joined = await fsp.readFile(outputPath);
    if (!joined || joined.length === 0) throw new Error('FFmpeg produced an empty joined video');
    return Buffer.from(joined);
  } catch (error) {
    if (error && error.code === 'ffmpeg_unavailable') throw error;
    const wrapped = new Error(`Could not join the video extension: ${joinErrorDetail(error)}`);
    wrapped.code = 'video_extension_join_failed';
    wrapped.cause = error;
    throw wrapped;
  } finally {
    if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function joinVideoChunks({ chunkBuffers, segments, fps, width, height, ffmpegPath } = {}, options = {}) {
  const executable = String(ffmpegPath || '').trim();
  if (!executable) {
    const error = new Error('Video chunk joining requires FFmpeg. Set FFMPEG_PATH, install FFmpeg, or make it available through ComfyUI.');
    error.code = 'ffmpeg_unavailable';
    throw error;
  }
  const buffers = Array.isArray(chunkBuffers) ? chunkBuffers : [];
  if (buffers.length < 2 || buffers.some((buffer) => (
    (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) || buffer.length === 0
  ))) {
    throw new Error('Video chunk joining needs at least two non-empty video buffers');
  }

  const fsp = options.fsp || fs.promises;
  const run = options.run || execFileCommand;
  const tmpRoot = typeof options.osTmpdir === 'function'
    ? options.osTmpdir()
    : (options.osTmpdir || os.tmpdir());
  let tempDir = '';
  try {
    tempDir = await fsp.mkdtemp(path.join(tmpRoot, 'mixstudio-video-chunks-'));
    const sourcePaths = buffers.map((_, index) => path.join(tempDir, `chunk-${index}.mp4`));
    const outputPath = path.join(tempDir, 'joined.mp4');
    await Promise.all(sourcePaths.map((sourcePath, index) => fsp.writeFile(sourcePath, buffers[index])));
    const args = videoChunkJoinArgs({ sourcePaths, outputPath, segments, fps, width, height });
    await run(executable, args, {
      cwd: tempDir,
      timeout: options.timeout || 20 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const joined = await fsp.readFile(outputPath);
    if (!joined || joined.length === 0) throw new Error('FFmpeg produced an empty joined video');
    return Buffer.from(joined);
  } catch (error) {
    if (error && error.code === 'ffmpeg_unavailable') throw error;
    const wrapped = new Error(`Could not join the generated video chunks: ${joinErrorDetail(error)}`);
    wrapped.code = 'video_chunk_join_failed';
    wrapped.cause = error;
    throw wrapped;
  } finally {
    if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function prepareWanAnimate2Performance({
  sourcePath, outputPath, fps, frames, width, height, ffmpegPath,
} = {}, options = {}) {
  const executable = String(ffmpegPath || '').trim();
  if (!executable) {
    const error = new Error('Wan Animate 2 preparation requires FFmpeg.');
    error.code = 'ffmpeg_unavailable';
    throw error;
  }
  const output = requiredPath(outputPath, 'Wan Animate 2 prepared path');
  const fsp = options.fsp || fs.promises;
  const run = options.run || execFileCommand;
  try {
    await run(executable, wanAnimate2PerformanceArgs({
      sourcePath, outputPath: output, fps, frames, width, height,
    }), {
      cwd: path.dirname(output),
      timeout: options.timeout || 20 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const result = await fsp.stat(output);
    if (!result.isFile() || result.size === 0) throw new Error('FFmpeg produced an empty prepared video');
    return output;
  } catch (error) {
    if (error && error.code === 'ffmpeg_unavailable') throw error;
    const wrapped = new Error(`Could not prepare the Wan Animate 2 performance video: ${joinErrorDetail(error)}`);
    wrapped.code = 'wan_animate2_prepare_failed';
    wrapped.cause = error;
    throw wrapped;
  }
}

async function joinWanAnimate2Chunks({
  chunkBuffers, segments, fps, width, height, audioSourcePath, sourceHasAudio, ffmpegPath,
} = {}, options = {}) {
  const executable = String(ffmpegPath || '').trim();
  if (!executable) {
    const error = new Error('Wan Animate 2 joining requires FFmpeg.');
    error.code = 'ffmpeg_unavailable';
    throw error;
  }
  const buffers = Array.isArray(chunkBuffers) ? chunkBuffers : [];
  if (!buffers.length || buffers.some((buffer) => (
    (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) || buffer.length === 0
  ))) {
    throw new Error('Wan Animate 2 joining needs non-empty video chunks');
  }

  const fsp = options.fsp || fs.promises;
  const run = options.run || execFileCommand;
  const tmpRoot = typeof options.osTmpdir === 'function'
    ? options.osTmpdir()
    : (options.osTmpdir || os.tmpdir());
  let tempDir = '';
  try {
    tempDir = await fsp.mkdtemp(path.join(tmpRoot, 'mixstudio-wan-animate2-'));
    const sourcePaths = buffers.map((_, index) => path.join(tempDir, `chunk-${index}.mp4`));
    const outputPath = path.join(tempDir, 'joined.mp4');
    await Promise.all(sourcePaths.map((sourcePath, index) => fsp.writeFile(sourcePath, buffers[index])));
    const args = wanAnimate2ChunkJoinArgs({
      sourcePaths,
      outputPath,
      segments,
      fps,
      width,
      height,
      audioSourcePath,
      sourceHasAudio,
    });
    await run(executable, args, {
      cwd: tempDir,
      timeout: options.timeout || 20 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const joined = await fsp.readFile(outputPath);
    if (!joined || joined.length === 0) throw new Error('FFmpeg produced an empty joined video');
    return Buffer.from(joined);
  } catch (error) {
    if (error && error.code === 'ffmpeg_unavailable') throw error;
    const wrapped = new Error(`Could not join the Wan Animate 2 video: ${joinErrorDetail(error)}`);
    wrapped.code = 'wan_animate2_join_failed';
    wrapped.cause = error;
    throw wrapped;
  } finally {
    if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  DEFAULT_VIDEO_PREVIEW_FPS,
  DEFAULT_VIDEO_PREVIEW_SIZE,
  VIDEO_PREVIEW_FPS_OPTIONS,
  VIDEO_PREVIEW_SIZE_OPTIONS,
  extensionJoinArgs,
  joinVideoChunks,
  joinVideoExtension,
  joinWanAnimate2Chunks,
  mp4TranscodeArgs,
  normalizeVideoPreviewOptions,
  parseFfmpegVideoProbe,
  probeVideoFile,
  prepareWanAnimate2Performance,
  resolveFfmpegExecutable,
  transcodeVideoFileToMp4,
  transcodeVideoPreview,
  wanAnimate2ChunkJoinArgs,
  wanAnimate2PerformanceArgs,
  videoPreviewTranscodeArgs,
  videoChunkJoinArgs,
};
