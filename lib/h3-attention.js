'use strict';

const H3_ATTENTION_BACKENDS = Object.freeze(['standard', 'sageattention', 'sla', 'kitchen']);

function normalizeH3AttentionBackend(value, legacySageAttention) {
  const requested = String(value || '').trim().toLowerCase();
  if (requested === 'sage') return 'sageattention';
  if (H3_ATTENTION_BACKENDS.includes(requested)) return requested;
  if (legacySageAttention === false) return 'standard';
  return 'sageattention';
}

function kitchenAttentionCapability(info) {
  const input = info?.ModelAttentionBackend?.input?.required?.attention;
  const options = Array.isArray(input?.[0]) ? input[0] : input?.[1]?.options;
  const ready = Array.isArray(options) && options.includes('comfy kitchen attention');
  return { ready, reason: ready ? '' : 'Update ComfyUI to a version with the native Comfy Kitchen attention backend.' };
}

function h3AttentionOptions(value, legacySageAttention) {
  const attentionBackend = normalizeH3AttentionBackend(value, legacySageAttention);
  return {
    attentionBackend,
    sageAttention: attentionBackend === 'sageattention',
    slaAttention: attentionBackend === 'sla',
  };
}

module.exports = {
  H3_ATTENTION_BACKENDS,
  kitchenAttentionCapability,
  h3AttentionOptions,
  normalizeH3AttentionBackend,
};
