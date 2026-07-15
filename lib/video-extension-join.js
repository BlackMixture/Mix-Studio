'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { findComfyBase, findComfyPython } = require('./sam3-installer');

const AUDIO_RATE = 48000;

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
      resolve(String(stdout || '').trim());
    });
  });
}

function outputText(value) {
  if (value && typeof value === 'object' && 'stdout' in value) return String(value.stdout || '');
  return String(value || '');
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

module.exports = {
  extensionJoinArgs,
  joinVideoExtension,
  resolveFfmpegExecutable,
};
