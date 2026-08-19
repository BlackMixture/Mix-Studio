'use strict';

const { localPromptAiConfig } = require('./local-prompt-ai');

const PROVIDERS = Object.freeze(['openai', 'gemini', 'ollama', 'local']);
const PROVIDER_LABELS = Object.freeze({
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama',
  local: 'Local ComfyUI',
});
const DEFAULTS = Object.freeze({
  externalLlmProvider: 'local',
  externalLlmLocalProvider: 'local',
  externalLlmExternalProvider: 'openai',
  externalLlmOpenAiModel: 'gpt-5.6-luna',
  externalLlmGeminiModel: 'gemini-3.6-flash',
  externalLlmOllamaModel: 'gemma3',
  externalLlmOllamaUrl: 'http://127.0.0.1:11434',
  externalLlmImageRevise: true,
  externalLlmImageEnhance: true,
  externalLlmVideoRevise: true,
  externalLlmVideoEnhance: true,
});
const GEMINI_JSON_SCHEMA_KEYS = Object.freeze(new Set([
  '$id', '$defs', '$ref', '$anchor',
  'type', 'format', 'title', 'description', 'enum',
  'items', 'prefixItems', 'minItems', 'maxItems',
  'minimum', 'maximum', 'anyOf', 'oneOf',
  'properties', 'additionalProperties', 'required', 'propertyOrdering',
]));

function cleanText(value, fallback = '', max = 300) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, max);
}

function normalizeOllamaUrl(value) {
  const raw = cleanText(value, DEFAULTS.externalLlmOllamaUrl, 1000);
  let url;
  try { url = new URL(raw); } catch {
    throw new Error('Ollama URL must be a valid HTTP or HTTPS address');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Ollama URL must use HTTP or HTTPS');
  }
  if (url.username || url.password) throw new Error('Ollama URL cannot contain credentials');
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

function ollamaChatUrl(value) {
  const base = normalizeOllamaUrl(value);
  if (/\/api\/chat$/i.test(base)) return base;
  if (/\/api$/i.test(base)) return `${base}/chat`;
  return `${base}/api/chat`;
}

function normalizeExternalLlmSettings(source = {}) {
  const provider = PROVIDERS.includes(source.externalLlmProvider)
    ? source.externalLlmProvider
    : DEFAULTS.externalLlmProvider;
  const localProvider = ['local', 'ollama'].includes(provider)
    ? provider
    : (['local', 'ollama'].includes(source.externalLlmLocalProvider)
      ? source.externalLlmLocalProvider
      : DEFAULTS.externalLlmLocalProvider);
  const externalProvider = ['openai', 'gemini'].includes(provider)
    ? provider
    : (['openai', 'gemini'].includes(source.externalLlmExternalProvider)
      ? source.externalLlmExternalProvider
      : DEFAULTS.externalLlmExternalProvider);
  let ollamaUrl;
  try { ollamaUrl = normalizeOllamaUrl(source.externalLlmOllamaUrl); }
  catch { ollamaUrl = DEFAULTS.externalLlmOllamaUrl; }
  return {
    externalLlmProvider: provider,
    externalLlmLocalProvider: localProvider,
    externalLlmExternalProvider: externalProvider,
    externalLlmOpenAiModel: cleanText(source.externalLlmOpenAiModel, DEFAULTS.externalLlmOpenAiModel),
    externalLlmGeminiModel: cleanText(source.externalLlmGeminiModel, DEFAULTS.externalLlmGeminiModel),
    externalLlmOllamaModel: cleanText(source.externalLlmOllamaModel, DEFAULTS.externalLlmOllamaModel),
    externalLlmOllamaUrl: ollamaUrl,
    externalLlmImageRevise: true,
    externalLlmImageEnhance: true,
    externalLlmVideoRevise: true,
    externalLlmVideoEnhance: true,
  };
}

function externalLlmEnabled(settings) {
  return PROVIDERS.includes(normalizeExternalLlmSettings(settings).externalLlmProvider);
}

function externalLlmProviderConfig(settings = {}) {
  const normalized = normalizeExternalLlmSettings(settings);
  const provider = normalized.externalLlmProvider;
  if (provider === 'local') {
    const local = localPromptAiConfig(settings);
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      model: local.model,
      type: local.type,
      apiKey: '',
    };
  }
  if (provider === 'gemini') return {
    provider,
    label: PROVIDER_LABELS[provider],
    model: normalized.externalLlmGeminiModel,
    apiKey: cleanText(settings.externalLlmGeminiApiKey, '', 1000),
  };
  if (provider === 'ollama') return {
    provider,
    label: PROVIDER_LABELS[provider],
    model: normalized.externalLlmOllamaModel,
    baseUrl: normalized.externalLlmOllamaUrl,
    apiKey: '',
  };
  return {
    provider,
    label: PROVIDER_LABELS[provider],
    model: normalized.externalLlmOpenAiModel,
    apiKey: cleanText(settings.externalLlmOpenAiApiKey, '', 1000),
  };
}

function imagePayload(image) {
  if (!image || !image.data) return null;
  let data;
  try { data = Buffer.isBuffer(image.data) ? image.data : Buffer.from(image.data); }
  catch { return null; }
  if (!data.length) return null;
  return {
    mimeType: /^image\/[a-z0-9.+-]+$/i.test(String(image.mimeType || ''))
      ? String(image.mimeType).toLowerCase()
      : 'image/png',
    base64: data.toString('base64'),
  };
}

function imagePayloads(options = {}, limit = 8) {
  const plural = Array.isArray(options.images) ? options.images : [];
  const candidates = plural.length ? plural : [options.image];
  const images = [];
  for (const candidate of candidates) {
    const image = imagePayload(candidate);
    if (image) images.push(image);
    if (images.length >= limit) break;
  }
  // Keep the original singular option useful if a plural list was supplied but
  // contained no usable images.
  if (!images.length && plural.length) {
    const image = imagePayload(options.image);
    if (image) images.push(image);
  }
  return images;
}

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  const openAi = Array.isArray(payload?.output)
    ? payload.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .map((item) => item?.text).filter((text) => typeof text === 'string').join('\n').trim()
    : '';
  if (openAi) return openAi;
  const gemini = Array.isArray(payload?.candidates)
    ? payload.candidates.flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => part?.text).filter((text) => typeof text === 'string').join('\n').trim()
    : '';
  if (gemini) return gemini;
  if (typeof payload?.message?.content === 'string') return payload.message.content.trim();
  return '';
}

function providerErrorDetail(payload, fallback = '') {
  const detail = payload?.error?.message || payload?.error || payload?.message || fallback;
  const violations = (Array.isArray(payload?.error?.details) ? payload.error.details : [])
    .flatMap((entry) => entry?.fieldViolations || entry?.violations || [])
    .map((entry) => [entry?.field, entry?.description].filter(Boolean).join(': '))
    .filter(Boolean);
  return [String(detail || '').trim(), ...violations].filter(Boolean).join(' · ').slice(0, 600);
}

function geminiResponseJsonSchema(schema) {
  function sanitize(node) {
    if (Array.isArray(node)) return node.map(sanitize);
    if (!node || typeof node !== 'object') return node;
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      if (!GEMINI_JSON_SCHEMA_KEYS.has(key)) continue;
      if (key === 'properties' || key === '$defs') {
        result[key] = Object.fromEntries(Object.entries(value || {})
          .map(([name, propertySchema]) => [name, sanitize(propertySchema)]));
      } else {
        result[key] = sanitize(value);
      }
    }
    return result;
  }
  return sanitize(schema);
}

async function externalLlmRequest(options = {}) {
  const provider = PROVIDERS.includes(options.provider) ? options.provider : '';
  const label = PROVIDER_LABELS[provider] || 'External LLM';
  const model = cleanText(options.model, '', 300);
  const apiKey = cleanText(options.apiKey, '', 1000);
  const instruction = String(options.instruction || '').trim();
  const userInput = String(options.userInput || '').trim();
  const maxTokens = Math.max(64, Math.min(4096, Math.round(Number(options.maxTokens) || 512)));
  const images = imagePayloads(options);
  const schema = options.schema && typeof options.schema === 'object' && !Array.isArray(options.schema)
    ? options.schema : null;
  const schemaName = cleanText(options.schemaName, 'mix_studio_result', 64)
    .replace(/[^a-z0-9_-]/gi, '_') || 'mix_studio_result';
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!provider) throw new Error('Choose an external prompt provider');
  if (provider === 'local') throw new Error('Local ComfyUI prompt requests must run through the app server');
  if (!model) throw new Error(`${label} model is required`);
  if (provider !== 'ollama' && !apiKey) throw new Error(`Add ${provider === 'openai' ? 'an' : 'a'} ${label} API key in Preferences`);
  if (typeof fetchImpl !== 'function') throw new Error('This Node runtime cannot contact an external prompt provider');

  let url;
  let headers = { 'Content-Type': 'application/json' };
  let body;
  if (provider === 'openai') {
    url = 'https://api.openai.com/v1/responses';
    headers = Object.assign(headers, { Authorization: `Bearer ${apiKey}` });
    const content = [{ type: 'input_text', text: userInput }];
    content.push(...images.map((image) => ({
      type: 'input_image',
      image_url: `data:${image.mimeType};base64,${image.base64}`,
      detail: 'low',
    })));
    body = {
      model,
      instructions: instruction,
      input: [{ role: 'user', content }],
      max_output_tokens: Math.max(1024, maxTokens),
      store: false,
    };
    if (schema) body.text = {
      format: { type: 'json_schema', name: schemaName, strict: true, schema },
    };
  } else if (provider === 'gemini') {
    const modelName = model.replace(/^models\//, '');
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
    headers = Object.assign(headers, { 'x-goog-api-key': apiKey });
    const parts = [{ text: userInput }];
    parts.push(...images.map((image) => ({
      inlineData: { mimeType: image.mimeType, data: image.base64 },
    })));
    body = {
      systemInstruction: { parts: [{ text: instruction }] },
      contents: [{ role: 'user', parts }],
      generationConfig: Object.assign(
        { maxOutputTokens: maxTokens, temperature: schema ? 0.2 : 0.7 },
        schema ? {
          responseMimeType: 'application/json',
          responseJsonSchema: geminiResponseJsonSchema(schema),
        } : {},
      ),
    };
  } else {
    url = ollamaChatUrl(options.baseUrl);
    const userMessage = { role: 'user', content: userInput };
    if (images.length) userMessage.images = images.map((image) => image.base64);
    body = {
      model,
      messages: [
        { role: 'system', content: instruction },
        userMessage,
      ],
      stream: false,
      think: false,
      options: { temperature: schema ? 0.2 : 0.7, num_predict: maxTokens },
    };
    if (schema) body.format = schema;
  }

  const signal = options.signal || (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(180_000)
    : undefined);
  async function send(requestBody) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST', headers, body: JSON.stringify(requestBody), signal,
      });
    } catch (error) {
      const timedOut = ['AbortError', 'TimeoutError'].includes(error?.name);
      const message = timedOut ? 'request timed out' : String(error?.message || error || 'connection failed');
      throw new Error(`${label} prompt request failed: ${message}`);
    }
    const raw = await response.text().catch(() => '');
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
    return { response, raw, payload };
  }

  let attempt = await send(body);
  const geminiSchemaRejected = provider === 'gemini' && schema && attempt.response.status === 400
    && (/invalid[_ ]argument/i.test(String(attempt.payload?.error?.status || ''))
      || /invalid argument|too many states|response schema/i.test(providerErrorDetail(attempt.payload, attempt.raw)));
  if (geminiSchemaRejected) {
    const fallbackBody = JSON.parse(JSON.stringify(body));
    delete fallbackBody.generationConfig.responseJsonSchema;
    const schemaInstruction = [
      instruction,
      'Return only one valid JSON object. It must use the following exact property names and value types; do not wrap it in Markdown:',
      JSON.stringify(geminiResponseJsonSchema(schema)),
    ].filter(Boolean).join('\n\n');
    fallbackBody.systemInstruction = { parts: [{ text: schemaInstruction }] };
    attempt = await send(fallbackBody);
  }

  const { response, raw, payload } = attempt;
  if (!response.ok) {
    const detail = providerErrorDetail(payload, raw) || `HTTP ${response.status}`;
    throw new Error(`${label} prompt request failed: ${detail}`);
  }
  const text = outputText(payload);
  if (!text) throw new Error(`${label} returned no usable prompt text`);
  return text;
}

function parseStructuredText(text, label) {
  const cleaned = String(text || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const candidates = [cleaned];
  const start = cleaned.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < cleaned.length; index += 1) {
      const char = cleaned[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          candidates.push(cleaned.slice(start, index + 1));
          break;
        }
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch { /* try an extracted object before reporting the provider */ }
  }
  throw new Error(`${label || 'External LLM'} returned an invalid structured response`);
}

async function externalLlmStructuredRequest(options = {}) {
  if (!options.schema || typeof options.schema !== 'object') {
    throw new Error('A JSON schema is required for a structured prompt request');
  }
  const provider = PROVIDERS.includes(options.provider) ? options.provider : '';
  const text = await externalLlmRequest(options);
  return parseStructuredText(text, PROVIDER_LABELS[provider] || 'External LLM');
}

module.exports = {
  DEFAULTS,
  PROVIDERS,
  externalLlmEnabled,
  externalLlmProviderConfig,
  externalLlmRequest,
  externalLlmStructuredRequest,
  geminiResponseJsonSchema,
  normalizeExternalLlmSettings,
  normalizeOllamaUrl,
  ollamaChatUrl,
  outputText,
  parseStructuredText,
};
