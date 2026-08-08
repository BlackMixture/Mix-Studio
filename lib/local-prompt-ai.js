'use strict';

const { objectInfoComboChoices } = require('./comfy-compatibility');

const DEFAULT_LOCAL_PROMPT_AI_TYPE = 'krea2';

function boundedText(value, fallback = '', maxLength = 512) {
  const text = String(value == null ? '' : value).trim();
  return (text || fallback).slice(0, maxLength);
}

function normalizeLocalPromptAiSettings(source = {}) {
  return {
    localPromptAiClip: boundedText(source.localPromptAiClip, '', 512),
    localPromptAiClipType: boundedText(
      source.localPromptAiClipType,
      DEFAULT_LOCAL_PROMPT_AI_TYPE,
      80,
    ),
  };
}

function localPromptAiConfig(settings = {}) {
  const normalized = normalizeLocalPromptAiSettings(settings);
  const inherited = !normalized.localPromptAiClip;
  return {
    model: inherited
      ? boundedText(settings.clip, '', 512)
      : normalized.localPromptAiClip,
    type: inherited
      ? boundedText(settings.clipType, DEFAULT_LOCAL_PROMPT_AI_TYPE, 80)
      : normalized.localPromptAiClipType,
    inherited,
  };
}

function uniqueChoices(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => boundedText(value, '', 512))
    .filter(Boolean))];
}

function localPromptAiCatalog(info = {}, settings = {}) {
  const config = localPromptAiConfig(settings);
  const models = uniqueChoices(objectInfoComboChoices(info, 'CLIPLoader', 'clip_name'));
  const types = uniqueChoices(objectInfoComboChoices(info, 'CLIPLoader', 'type'));
  return {
    models,
    types: types.length ? types : [DEFAULT_LOCAL_PROMPT_AI_TYPE],
    configuredModel: normalizeLocalPromptAiSettings(settings).localPromptAiClip,
    configuredType: normalizeLocalPromptAiSettings(settings).localPromptAiClipType,
    activeModel: config.model,
    activeType: config.type,
    inherited: config.inherited,
    available: !config.model || models.includes(config.model),
  };
}

module.exports = {
  DEFAULT_LOCAL_PROMPT_AI_TYPE,
  localPromptAiCatalog,
  localPromptAiConfig,
  normalizeLocalPromptAiSettings,
};
