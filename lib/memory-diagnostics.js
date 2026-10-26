'use strict';

// Recognize ComfyUI failures caused by system (host) memory pressure and turn
// them into an explanation the user can act on (#79). This only interprets
// error text ComfyUI already returned; it never changes ComfyUI launch flags.

const PINNED_MEMORY_PATTERNS = Object.freeze([
  /hostbuf_file_reader_read failed/i,
  /HostBuffer\.read_file_slice failed/i,
  /cuMemAllocHost\b[\s\S]{0,160}out of memory/i,
]);
const PAGING_FILE_PATTERNS = Object.freeze([
  /WinError 1455/i,
  /paging file is too small/i,
]);
const GPU_MEMORY_PATTERNS = Object.freeze([
  /CUDA out of memory/i,
  /torch\.cuda\.OutOfMemoryError/i,
  /\bOutOfMemoryError\b[\s\S]{0,80}\bCUDA\b/i,
  /Allocation on device/i,
]);

const PINNED_MEMORY_HINT = 'ComfyUI could not reserve page-locked (pinned) system memory while streaming model weights. '
  + 'This can happen when system RAM is nearly full, for example when a PC with 32 GB of RAM loads a large model. '
  + 'Start ComfyUI with --disable-pinned-memory --disable-async-offload (a workaround reported in ComfyUI issue #15337 and Mix Studio issue #79), '
  + 'close other memory-heavy apps, and keep the Windows page file system-managed on an SSD.';
const PAGING_FILE_HINT = 'Windows ran out of virtual memory (commit) while loading a model. '
  + 'Set the page file to system-managed on an SSD with enough free space, close other memory-heavy apps, and try again. '
  + 'If ComfyUI also reports pinned memory, starting it with --disable-pinned-memory --disable-async-offload reduces the memory it locks.';
const GPU_MEMORY_HINT = 'The GPU ran out of memory. Try a smaller resolution or shorter duration, the Low VRAM profile in Preferences, '
  + 'or an INT8 or FP8 model variant, and close other apps that use the GPU.';

function matchesAny(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

// Classify a ComfyUI error message. Returns null when nothing is recognized.
function classifyComfyMemoryFailure(message) {
  const text = String(message || '');
  if (!text) return null;
  if (matchesAny(PINNED_MEMORY_PATTERNS, text)) {
    return { code: 'comfy_pinned_memory_exhausted', kind: 'system-memory', hint: PINNED_MEMORY_HINT };
  }
  if (matchesAny(PAGING_FILE_PATTERNS, text)) {
    return { code: 'windows_commit_exhausted', kind: 'system-memory', hint: PAGING_FILE_HINT };
  }
  if (matchesAny(GPU_MEMORY_PATTERNS, text)) {
    return { code: 'gpu_memory_exhausted', kind: 'gpu-memory', hint: GPU_MEMORY_HINT };
  }
  return null;
}

// The message shown to the user: ComfyUI's own text first (kept intact for
// copying into bug reports), then the explanation when one applies.
function explainComfyFailure(message) {
  const text = String(message || '').trim() || 'Execution error (see ComfyUI console)';
  const diagnosis = classifyComfyMemoryFailure(text);
  if (!diagnosis || text.includes(diagnosis.hint)) return text;
  return `${text}\n\n${diagnosis.hint}`;
}

// ComfyUI's /history entry keeps the execution_error event in status.messages
// as [type, data] pairs. Recover the real exception instead of a generic
// "see the console" message when the WebSocket event was missed.
function historyExecutionError(entry) {
  const messages = Array.isArray(entry?.status?.messages) ? entry.status.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const [type, data] = Array.isArray(messages[index]) ? messages[index] : [];
    if (type !== 'execution_error' || !data || typeof data !== 'object') continue;
    const exception = String(data.exception_message || '').trim();
    if (!exception) continue;
    return data.node_type ? `${exception} (${data.node_type})` : exception;
  }
  return '';
}

module.exports = {
  GPU_MEMORY_HINT,
  PAGING_FILE_HINT,
  PINNED_MEMORY_HINT,
  classifyComfyMemoryFailure,
  explainComfyFailure,
  historyExecutionError,
};
