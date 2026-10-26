'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  GPU_MEMORY_HINT,
  PAGING_FILE_HINT,
  PINNED_MEMORY_HINT,
  classifyComfyMemoryFailure,
  explainComfyFailure,
  historyExecutionError,
} = require('../lib/memory-diagnostics');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const operations = fs.readFileSync(path.join(root, 'docs', 'installation-and-operations.md'), 'utf8');

// Lines from the ComfyUI 0.33.1 log attached to issue #79 (RTX 5070 Ti 16 GB,
// 32 GB RAM, Windows 10): pinned host memory ran out while staging weights.
const ISSUE_79_AIMDO = 'aimdo: D:\\a\\comfy-aimdo\\comfy-aimdo\\src\\plat.h:176:ERROR:CUDA API FAILED (2): cuMemAllocHost((void **)&slot->buffer, HOSTBUF_FILE_READER_WINDOW): out of memory';
const ISSUE_79_EXCEPTION = 'hostbuf_file_reader_read failed';

test('pinned host-memory failures from issue #79 are recognized', () => {
  for (const message of [ISSUE_79_EXCEPTION, `${ISSUE_79_EXCEPTION} (KSampler)`, ISSUE_79_AIMDO, 'RuntimeError: HostBuffer.read_file_slice failed']) {
    const diagnosis = classifyComfyMemoryFailure(message);
    assert.equal(diagnosis?.code, 'comfy_pinned_memory_exhausted', message);
    assert.equal(diagnosis.kind, 'system-memory');
  }
  assert.match(PINNED_MEMORY_HINT, /--disable-pinned-memory --disable-async-offload/);
  assert.match(PINNED_MEMORY_HINT, /#15337/);
  assert.match(PINNED_MEMORY_HINT, /#79/);
});

test('Windows commit exhaustion and GPU out-of-memory get their own advice', () => {
  assert.equal(classifyComfyMemoryFailure('OSError: [WinError 1455] The paging file is too small for this operation to complete').code, 'windows_commit_exhausted');
  assert.equal(classifyComfyMemoryFailure('CUDA out of memory. Tried to allocate 2.00 GiB').code, 'gpu_memory_exhausted');
  assert.equal(classifyComfyMemoryFailure('torch.OutOfMemoryError: Allocation on device').code, 'gpu_memory_exhausted');
  assert.match(PAGING_FILE_HINT, /page file/);
  assert.match(GPU_MEMORY_HINT, /Low VRAM profile/);
});

test('unrelated errors are left exactly as ComfyUI reported them', () => {
  for (const message of ['Value not in list: unet_name', 'Prompt outputs failed validation', 'Interrupted', 'torch.OutOfMemoryError: CPU allocation failed']) {
    assert.equal(classifyComfyMemoryFailure(message), null);
    assert.equal(explainComfyFailure(message), message);
  }
  assert.equal(classifyComfyMemoryFailure(''), null);
  assert.equal(explainComfyFailure(''), 'Execution error (see ComfyUI console)');
});

test('explanations keep the original text first and are added only once', () => {
  const explained = explainComfyFailure(`${ISSUE_79_EXCEPTION} (KSampler)`);
  assert.ok(explained.startsWith(`${ISSUE_79_EXCEPTION} (KSampler)\n\n`));
  assert.ok(explained.endsWith(PINNED_MEMORY_HINT));
  assert.equal(explainComfyFailure(explained), explained);
});

test('history entries recover the real exception instead of a generic message', () => {
  const entry = {
    status: {
      status_str: 'error',
      completed: false,
      messages: [
        ['execution_start', { prompt_id: 'p1', timestamp: 1 }],
        ['execution_cached', { nodes: [], prompt_id: 'p1' }],
        ['execution_error', { prompt_id: 'p1', node_id: '12', node_type: 'KSampler', exception_message: ISSUE_79_EXCEPTION, exception_type: 'RuntimeError' }],
      ],
    },
  };
  assert.equal(historyExecutionError(entry), `${ISSUE_79_EXCEPTION} (KSampler)`);
  assert.equal(historyExecutionError({ status: { messages: [['execution_error', { exception_message: '  ' }]] } }), '');
  assert.equal(historyExecutionError({ status: { messages: 'not-a-list' } }), '');
  assert.equal(historyExecutionError(null), '');
});

test('both job-failure paths explain memory failures, and the docs say what to do', () => {
  assert.match(server, /failJob\(pid, explainComfyFailure\(\(d\.exception_message \|\| 'execution error'\)/);
  assert.match(server, /failJob\(pid, explainComfyFailure\(historyExecutionError\(hist\) \|\| 'Execution error \(see ComfyUI console\)'\)\)/);
  assert.match(operations, /### System memory \(RAM\) and Windows crashes/);
  assert.match(operations, /--disable-pinned-memory --disable-async-offload/);
  assert.match(operations, /Mix Studio does not change ComfyUI launch flags for you/);
  // Mix Studio's own start and restart of a Python install drop extra flags.
  assert.match(operations, /runs `main\.py` without these flags, so start that ComfyUI yourself/);
  assert.doesNotMatch(PINNED_MEMORY_HINT, /most often/);
  assert.match(operations, /issues\/79/);
  assert.match(operations, /Enabled pinned memory/);
});
