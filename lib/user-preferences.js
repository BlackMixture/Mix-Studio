'use strict';

const DEFAULT_GENERATION_DEFAULTS = Object.freeze({
  create: { steps: 12, cfg: 1, batch: 1 },
  edit: { steps: 4, cfg: 1, batch: 1, denoise: 0.4 },
  video: { duration: 5, motionFreedom: 35 },
  seed: { mode: 'random', value: 0 },
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeGenerationDefaults(value) {
  const source = value && typeof value === 'object' ? value : {};
  const create = source.create || {};
  const edit = source.edit || {};
  const video = source.video || {};
  const seed = source.seed || {};
  return {
    create: { steps: Math.round(clamp(create.steps, 1, 100, 12)), cfg: clamp(create.cfg, 0, 30, 1), batch: Math.round(clamp(create.batch, 1, 8, 1)) },
    edit: { steps: Math.round(clamp(edit.steps, 1, 100, 4)), cfg: clamp(edit.cfg, 0, 30, 1), batch: Math.round(clamp(edit.batch, 1, 8, 1)), denoise: clamp(edit.denoise, 0.1, 1, 0.4) },
    video: { duration: Math.round(clamp(video.duration, 1, 60, 5) * 10) / 10, motionFreedom: Math.round(clamp(video.motionFreedom, 0, 100, 35)) },
    seed: { mode: seed.mode === 'fixed' ? 'fixed' : 'random', value: Math.max(0, Math.floor(clamp(seed.value, 0, Number.MAX_SAFE_INTEGER, 0))) },
  };
}

function normalizeContextOverrides(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const [name, raw] of Object.entries(source)) {
    if (!name || !raw || typeof raw !== 'object') continue;
    const entry = { disabled: raw.disabled === true };
    if (Number.isFinite(Number(raw.defaultStrength))) entry.defaultStrength = clamp(raw.defaultStrength, 0, 2, 1);
    if (typeof raw.suggestion === 'string') entry.suggestion = raw.suggestion.trim().slice(0, 300);
    out[String(name).slice(0, 300)] = entry;
  }
  return out;
}

function mergeContextOverrides(context, overrides) {
  const out = structuredClone(context || {});
  for (const profile of Object.values(out)) {
    profile.learnedDefaultStrength = profile.defaultStrength;
    profile.learnedSuggestion = profile.suggestion;
  }
  for (const [name, override] of Object.entries(normalizeContextOverrides(overrides))) {
    if (!out[name]) out[name] = { uses: 0, defaultStrength: 1, strengths: [], phrases: [], suggestion: null };
    if (override.defaultStrength !== undefined) out[name].defaultStrength = override.defaultStrength;
    if (override.suggestion !== undefined) out[name].suggestion = override.suggestion || null;
    if (override.disabled) out[name].suggestion = null;
    out[name].override = override;
  }
  return out;
}

module.exports = { DEFAULT_GENERATION_DEFAULTS, normalizeGenerationDefaults, normalizeContextOverrides, mergeContextOverrides };
