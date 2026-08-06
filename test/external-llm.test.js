'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  externalLlmEnabled,
  externalLlmProviderConfig,
  externalLlmRequest,
  normalizeExternalLlmSettings,
  normalizeOllamaUrl,
  ollamaChatUrl,
  outputText,
} = require('../lib/external-llm');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('external LLM settings normalize providers, models, URLs, and independent routes', () => {
  const settings = normalizeExternalLlmSettings({
    externalLlmProvider: 'ollama',
    externalLlmOllamaUrl: 'http://127.0.0.1:11434/',
    externalLlmOllamaModel: 'qwen3-vl',
    externalLlmImageRevise: true,
    externalLlmVideoEnhance: true,
  });
  assert.equal(settings.externalLlmProvider, 'ollama');
  assert.equal(settings.externalLlmOllamaUrl, 'http://127.0.0.1:11434');
  assert.equal(settings.externalLlmOllamaModel, 'qwen3-vl');
  assert.equal(externalLlmEnabled(settings, 'image', 'revise'), true);
  assert.equal(externalLlmEnabled(settings, 'image', 'enhance'), false);
  assert.equal(externalLlmEnabled(settings, 'video', 'enhance'), true);
});

test('Ollama URL handling accepts HTTP endpoints without embedded credentials', () => {
  assert.equal(normalizeOllamaUrl('http://localhost:11434/'), 'http://localhost:11434');
  assert.equal(ollamaChatUrl('http://localhost:11434'), 'http://localhost:11434/api/chat');
  assert.equal(ollamaChatUrl('https://host.example/ollama/api'), 'https://host.example/ollama/api/chat');
  assert.throws(() => normalizeOllamaUrl('file:///tmp/ollama'), /HTTP or HTTPS/);
  assert.throws(() => normalizeOllamaUrl('http://user:secret@localhost:11434'), /credentials/);
});

test('provider config selects the active model and keeps keys server-side', () => {
  const config = externalLlmProviderConfig({
    externalLlmProvider: 'gemini',
    externalLlmGeminiModel: 'gemini-test',
    externalLlmGeminiApiKey: 'secret-key',
  });
  assert.deepEqual(config, {
    provider: 'gemini', label: 'Gemini', model: 'gemini-test', apiKey: 'secret-key',
  });
});

test('OpenAI adapter uses Responses API text and inline vision inputs', async () => {
  let request;
  const text = await externalLlmRequest({
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test',
    instruction: 'Write only the final prompt.',
    userInput: '<user_input>A lighthouse</user_input>',
    image: { data: Buffer.from('image-bytes'), mimeType: 'image/jpeg' },
    maxTokens: 384,
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return jsonResponse({ output_text: '<final_prompt>A lighthouse in a storm.</final_prompt>' });
    },
  });
  assert.equal(text, '<final_prompt>A lighthouse in a storm.</final_prompt>');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.init.headers.Authorization, 'Bearer sk-test');
  assert.equal(request.body.model, 'gpt-test');
  assert.equal(request.body.instructions, 'Write only the final prompt.');
  assert.equal(request.body.store, false);
  assert.equal(request.body.input[0].content[0].type, 'input_text');
  assert.match(request.body.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
});

test('Gemini adapter uses generateContent with system instructions and inline image data', async () => {
  let request;
  const text = await externalLlmRequest({
    provider: 'gemini',
    model: 'models/gemini-test',
    apiKey: 'gemini-key',
    instruction: 'Return one prompt.',
    userInput: 'A dancer turns.',
    image: { data: Buffer.from('image-bytes'), mimeType: 'image/png' },
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return jsonResponse({ candidates: [{ content: { parts: [{ text: 'The dancer turns beneath a spotlight.' }] } }] });
    },
  });
  assert.equal(text, 'The dancer turns beneath a spotlight.');
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
  assert.equal(request.init.headers['x-goog-api-key'], 'gemini-key');
  assert.equal(request.body.systemInstruction.parts[0].text, 'Return one prompt.');
  assert.equal(request.body.contents[0].parts[1].inlineData.mimeType, 'image/png');
});

test('Ollama adapter uses native non-streaming chat and optional vision input', async () => {
  let request;
  const text = await externalLlmRequest({
    provider: 'ollama',
    model: 'gemma3',
    baseUrl: 'http://127.0.0.1:11434',
    instruction: 'Return one prompt.',
    userInput: 'Camera pushes forward.',
    image: { data: Buffer.from('image-bytes'), mimeType: 'image/webp' },
    fetchImpl: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return jsonResponse({ message: { role: 'assistant', content: 'The camera pushes steadily forward.' }, done: true });
    },
  });
  assert.equal(text, 'The camera pushes steadily forward.');
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.body.stream, false);
  assert.equal(request.body.think, false);
  assert.equal(request.body.messages[0].role, 'system');
  assert.equal(request.body.messages[1].images.length, 1);
});

test('external adapters report missing credentials and provider errors clearly', async () => {
  await assert.rejects(externalLlmRequest({
    provider: 'openai', model: 'gpt-test', instruction: 'Test', userInput: 'Test', fetchImpl: async () => jsonResponse({}),
  }), /Add an OpenAI API key in Preferences/);
  await assert.rejects(externalLlmRequest({
    provider: 'gemini', model: 'gemini-test', apiKey: 'bad', instruction: 'Test', userInput: 'Test',
    fetchImpl: async () => jsonResponse({ error: { message: 'API key rejected' } }, 401),
  }), /Gemini prompt request failed: API key rejected/);
});

test('output extraction supports nested OpenAI response content', () => {
  assert.equal(outputText({ output: [{ content: [{ type: 'output_text', text: 'Finished prompt' }] }] }), 'Finished prompt');
});

test('server routes independent image and video revise/enhance paths through the shared provider', () => {
  assert.match(serverSource, /function enhancePrompt\([\s\S]*shouldUseExternalPrompt\('image', 'enhance'\)/);
  assert.match(serverSource, /function reviseImagePrompt\([\s\S]*shouldUseExternalPrompt\('image', 'revise'\)/);
  assert.match(serverSource, /function reviseVideoPrompt\([\s\S]*shouldUseExternalPrompt\('video', 'revise'\)/);
  assert.match(serverSource, /function enhanceRegionPrompt\([\s\S]*shouldUseExternalPrompt\('image', 'enhance'\)/);
  assert.match(serverSource, /function suggestMotionPrompt\([\s\S]*shouldUseExternalPrompt\('video', 'enhance'\)/);
  assert.match(serverSource, /shouldUseExternalPrompt\('video', 'enhance'\) && enhance && suppliedMotionPrompt/);
  assert.match(serverSource, /videoPromptEnhanceParts\(motionPrompt/);
  assert.match(serverSource, /route === '\/api\/prompt\/provider\/test'/);
});
