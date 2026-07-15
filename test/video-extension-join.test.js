'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  extensionJoinArgs,
  joinVideoExtension,
  resolveFfmpegExecutable,
} = require('../lib/video-extension-join');

const basePlan = {
  outputFps: 24,
  outputWidth: 1280,
  outputHeight: 704,
  sourceSeconds: 10.041667,
  normalizedSeconds: 5,
  continueAudio: true,
};

function argsFor(continueAudio, sourceHasAudio) {
  return extensionJoinArgs({
    sourcePath: '/media/source clip.mp4',
    tailPath: '/temp/generated;tail.mp4',
    outputPath: '/temp/joined output.mp4',
    plan: Object.assign({}, basePlan, { continueAudio }),
    sourceHasAudio,
  });
}

function filterFrom(args) {
  return args[args.indexOf('-filter_complex') + 1];
}

test('extension join arguments normalize and concatenate source then tail video', () => {
  const args = argsFor(true, true);
  const filter = filterFrom(args);
  assert.ok(Array.isArray(args));
  assert.deepEqual(args.slice(args.indexOf('-i'), args.indexOf('-filter_complex')), [
    '-i', '/media/source clip.mp4',
    '-i', '/temp/generated;tail.mp4',
  ]);
  assert.ok(filter.indexOf('[0:v:0]') < filter.indexOf('[1:v:0]'));
  assert.match(filter, /\[source_v\]\[tail_v\]concat=n=2:v=1:a=0\[video\]/);
  assert.match(filter, /fps=24,scale=1280:704:force_original_aspect_ratio=decrease/);
  assert.match(filter, /pad=1280:704:\(ow-iw\)\/2:\(oh-ih\)\/2:color=black/);
  assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
  assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
  assert.equal(args[args.indexOf('-movflags') + 1], '+faststart');
  assert.equal(args[args.indexOf('-f') + 1], 'mp4');
  assert.equal(args.at(-1), '/temp/joined output.mp4');
});

test('extension audio continues source audio into generated tail audio', () => {
  const args = argsFor(true, true);
  const filter = filterFrom(args);
  assert.match(filter, /\[0:a:0\].*atrim=duration=10\.041667,apad=pad_dur=10\.041667/s);
  assert.match(filter, /\[1:a:0\].*atrim=duration=5,apad=pad_dur=5/s);
  assert.match(filter, /\[source_a\]\[tail_a\]concat=n=2:v=0:a=1\[audio\]/);
  assert.doesNotMatch(filter, /anullsrc/);
  assert.ok(args.includes('[audio]'));
  assert.equal(args[args.indexOf('-ar') + 1], '48000');
  assert.equal(args[args.indexOf('-ac') + 1], '2');
});

test('extension audio adds exact source silence when the source is silent', () => {
  const args = argsFor(true, false);
  const filter = filterFrom(args);
  assert.match(filter, /anullsrc=r=48000:cl=stereo.*atrim=duration=10\.041667.*\[source_a\]/s);
  assert.doesNotMatch(filter, /\[0:a:0\]/);
  assert.match(filter, /\[1:a:0\].*atrim=duration=5.*\[tail_a\]/s);
  assert.ok(args.includes('[audio]'));
});

test('disabled continuation audio preserves source audio and pads the tail with silence', () => {
  const args = argsFor(false, true);
  const filter = filterFrom(args);
  assert.match(filter, /\[0:a:0\].*\[source_a\]/s);
  assert.doesNotMatch(filter, /\[1:a:0\]/);
  assert.match(filter, /anullsrc=r=48000:cl=stereo.*atrim=duration=5.*\[tail_a\]/s);
  assert.ok(args.includes('[audio]'));
});

test('disabled continuation audio emits video only when the source is silent', () => {
  const args = argsFor(false, false);
  const filter = filterFrom(args);
  assert.doesNotMatch(filter, /:a:0|anullsrc|\[audio\]/);
  assert.ok(args.includes('-an'));
  assert.equal(args.includes('-c:a'), false);
  assert.equal(args.includes('[audio]'), false);
});

test('extension join arguments reject unsafe filter dimensions and durations', () => {
  assert.throws(() => extensionJoinArgs({
    sourcePath: '/source.mp4', tailPath: '/tail.mp4', outputPath: '/out.mp4',
    plan: Object.assign({}, basePlan, { outputWidth: 1279 }), sourceHasAudio: false,
  }), /positive even integer/);
  assert.throws(() => extensionJoinArgs({
    sourcePath: '/source.mp4', tailPath: '/tail.mp4', outputPath: '/out.mp4',
    plan: Object.assign({}, basePlan, { normalizedSeconds: '5;movie=bad' }), sourceHasAudio: false,
  }), /positive number/);
});

test('FFmpeg resolver prefers an existing configured path', async () => {
  let ran = false;
  const result = await resolveFfmpegExecutable({}, {
    env: { FFMPEG_PATH: '/tools/ffmpeg' },
    existsSync: (file) => file === '/tools/ffmpeg',
    run: async () => { ran = true; },
  });
  assert.equal(result, '/tools/ffmpeg');
  assert.equal(ran, false);
});

test('FFmpeg resolver accepts the system command when its version probe succeeds', async () => {
  const calls = [];
  const result = await resolveFfmpegExecutable({}, {
    env: {},
    existsSync: () => false,
    run: async (command, args) => { calls.push({ command, args }); return 'ffmpeg version 7'; },
  });
  assert.equal(result, 'ffmpeg');
  assert.deepEqual(calls, [{ command: 'ffmpeg', args: ['-version'] }]);
});

test('FFmpeg resolver falls back to imageio-ffmpeg in the ComfyUI Python environment', async () => {
  const base = path.resolve('/tmp/mixstudio-comfy');
  const python = path.join(base, '.venv', 'Scripts', 'python.exe');
  const bundled = path.join(base, '.venv', 'ffmpeg', 'ffmpeg.exe');
  const found = new Set([base, path.join(base, 'models'), python, bundled]);
  const calls = [];
  const result = await resolveFfmpegExecutable({ comfy: { path: base } }, {
    env: {},
    home: '/missing',
    existsSync: (file) => found.has(path.resolve(file)),
    run: async (command, args) => {
      calls.push({ command, args });
      if (command === 'ffmpeg') throw new Error('not found');
      return `imageio warning\n"${bundled}"\n`;
    },
  });
  assert.equal(result, bundled);
  assert.equal(calls[1].command, python);
  assert.deepEqual(calls[1].args.slice(0, 1), ['-c']);
  assert.match(calls[1].args[1], /imageio_ffmpeg\.get_ffmpeg_exe/);
});

test('FFmpeg resolver returns an empty value when no candidate works', async () => {
  const result = await resolveFfmpegExecutable({}, {
    env: {},
    home: '/missing',
    existsSync: () => false,
    run: async () => { throw new Error('not found'); },
  });
  assert.equal(result, '');
});

test('video extension join writes the tail, invokes execFile-style args, reads output, and cleans up', async () => {
  const operations = [];
  const tempDir = '/virtual/tmp/mixstudio-video-extension-abc';
  const fsp = {
    mkdtemp: async (prefix) => { operations.push(['mkdtemp', prefix]); return tempDir; },
    writeFile: async (file, data) => { operations.push(['writeFile', file, Buffer.from(data)]); },
    readFile: async (file) => { operations.push(['readFile', file]); return Buffer.from('joined'); },
    rm: async (file, options) => { operations.push(['rm', file, options]); },
  };
  let invocation;
  const joined = await joinVideoExtension({
    sourcePath: '/media/source.mp4',
    tailBuffer: Buffer.from('tail'),
    plan: basePlan,
    sourceHasAudio: true,
    ffmpegPath: '/tools/ffmpeg',
  }, {
    fsp,
    osTmpdir: '/virtual/tmp',
    run: async (command, args, options) => { invocation = { command, args, options }; },
  });
  assert.deepEqual(joined, Buffer.from('joined'));
  assert.equal(invocation.command, '/tools/ffmpeg');
  assert.ok(Array.isArray(invocation.args));
  assert.equal(invocation.args.at(-1), path.join(tempDir, 'joined.mp4'));
  assert.equal(invocation.options.cwd, tempDir);
  assert.deepEqual(operations.at(-1), ['rm', tempDir, { recursive: true, force: true }]);
});

test('video extension join reports FFmpeg failures clearly and still cleans up', async () => {
  const removed = [];
  const tempDir = '/virtual/tmp/mixstudio-video-extension-bad';
  const fsp = {
    mkdtemp: async () => tempDir,
    writeFile: async () => {},
    readFile: async () => Buffer.from('unreachable'),
    rm: async (file, options) => { removed.push([file, options]); },
  };
  const failure = new Error('exit 1');
  failure.stderr = 'concat filter could not be configured';
  await assert.rejects(joinVideoExtension({
    sourcePath: '/media/source.mp4',
    tailBuffer: Buffer.from('tail'),
    plan: basePlan,
    sourceHasAudio: false,
    ffmpegPath: '/tools/ffmpeg',
  }, {
    fsp,
    osTmpdir: '/virtual/tmp',
    run: async () => { throw failure; },
  }), (error) => {
    assert.equal(error.code, 'video_extension_join_failed');
    assert.match(error.message, /concat filter could not be configured/);
    return true;
  });
  assert.deepEqual(removed, [[tempDir, { recursive: true, force: true }]]);
});

test('video extension join gives a direct error when FFmpeg is unavailable', async () => {
  await assert.rejects(joinVideoExtension({
    sourcePath: '/media/source.mp4',
    tailBuffer: Buffer.from('tail'),
    plan: basePlan,
    sourceHasAudio: false,
    ffmpegPath: '',
  }), (error) => {
    assert.equal(error.code, 'ffmpeg_unavailable');
    assert.match(error.message, /requires FFmpeg/);
    return true;
  });
});
