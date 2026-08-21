'use strict';

const H3_ATTENTION_BACKENDS = Object.freeze(['standard', 'sageattention', 'sla']);

function normalizeH3AttentionBackend(value, legacySageAttention) {
  const requested = String(value || '').trim().toLowerCase();
  if (requested === 'sage') return 'sageattention';
  if (H3_ATTENTION_BACKENDS.includes(requested)) return requested;
  if (legacySageAttention === false) return 'standard';
  return 'sageattention';
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
  h3AttentionOptions,
  normalizeH3AttentionBackend,
};
