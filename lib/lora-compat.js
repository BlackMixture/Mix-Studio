'use strict';

function words(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function compact(value) {
  return words(value).replace(/\s+/g, '');
}

function classifyLora(info) {
  const name = words(info && info.name);
  const metadata = info && info.metadata ? info.metadata : {};
  const metaText = words(Object.values(metadata).join(' '));
  const joined = `${name} ${metaText}`;
  const compactJoined = compact(joined);
  const keys = (info && Array.isArray(info.keys) ? info.keys : []).map(String);
  const keyText = keys.slice(0, 32).join('\n').toLowerCase();

  if (/(qwen).*(edit)|(edit).*(qwen)/.test(joined) ||
      keyText.includes('transformer.transformer_blocks') ||
      keyText.includes('transformer_blocks.')) {
    return 'qwen-edit';
  }
  if (compactJoined.includes('flux2klein9b') || compactJoined.includes('klein9b')) return 'klein9';
  if (compactJoined.includes('flux2klein4b') || compactJoined.includes('klein4b')) return 'klein4';
  if (compactJoined.includes('krea2') || keyText.includes('diffusion_model.blocks.0.attn')) return 'krea2';
  if (/\b(ltx|wan|scail|video)\b/.test(joined)) return 'video';
  return 'unknown';
}

function compatibleCategoriesForContext(view, editEngine) {
  if (view === 'create') return ['krea2', 'unknown'];
  if (view === 'video') return ['video', 'unknown'];
  if (view === 'edit') {
    if (editEngine === 'qwen') return ['qwen-edit', 'unknown'];
    if (editEngine === 'klein9') return ['klein9', 'unknown'];
    return ['klein4', 'unknown'];
  }
  return ['unknown'];
}

function loraCompatibilityWarning(loras, loraInfo, view, editEngine) {
  const allowed = new Set(compatibleCategoriesForContext(view, editEngine));
  const bad = [];
  for (const lora of loras || []) {
    if (!lora || !lora.on || !lora.name) continue;
    const category = (loraInfo && loraInfo[lora.name] && loraInfo[lora.name].category) || 'unknown';
    if (!allowed.has(category)) bad.push(lora.name);
  }
  if (!bad.length) return '';
  return `These LoRAs may not affect this mode: ${bad.map((n) => n.replace(/\.safetensors$/i, '').split(/[\\/]/).pop()).join(', ')}`;
}

module.exports = {
  classifyLora,
  compatibleCategoriesForContext,
  loraCompatibilityWarning,
};
