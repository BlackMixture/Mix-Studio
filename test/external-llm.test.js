'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  externalLlmEnabled,
  externalLlmProviderConfig,
  externalLlmRequest,
  externalLlmStructuredRequest,
  geminiResponseJsonSchema,
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

test('prompt AI settings normalize providers and always route every prompt tool', () => {
  const settings = normalizeExternalLlmSettings({
    externalLlmProvider: 'ollama',
    externalLlmExternalProvider: 'gemini',
    externalLlmOllamaUrl: 'http://127.0.0.1:11434/',
    externalLlmOllamaModel: 'qwen3-vl',
    externalLlmImageRevise: false,
    externalLlmVideoEnhance: false,
  });
  assert.equal(settings.externalLlmProvider, 'ollama');
  assert.equal(settings.externalLlmLocalProvider, 'ollama');
  assert.equal(settings.externalLlmExternalProvider, 'gemini');
  assert.equal(settings.externalLlmOllamaUrl, 'http://127.0.0.1:11434');
  assert.equal(settings.externalLlmOllamaModel, 'qwen3-vl');
  assert.equal(externalLlmEnabled(settings, 'image', 'revise'), true);
  assert.equal(externalLlmEnabled(settings, 'image', 'enhance'), true);
  assert.equal(externalLlmEnabled(settings, 'video', 'enhance'), true);
  assert.equal(settings.externalLlmImageRevise, true);
  assert.equal(settings.externalLlmVideoEnhance, true);
});

test('prompt AI remembers one provider for each Local and External mode', () => {
  const local = normalizeExternalLlmSettings({
    externalLlmProvider: 'local',
    externalLlmLocalProvider: 'ollama',
    externalLlmExternalProvider: 'gemini',
  });
  assert.equal(local.externalLlmLocalProvider, 'local');
  assert.equal(local.externalLlmExternalProvider, 'gemini');

  const external = normalizeExternalLlmSettings({
    externalLlmProvider: 'gemini',
    externalLlmLocalProvider: 'ollama',
    externalLlmExternalProvider: 'openai',
  });
  assert.equal(external.externalLlmLocalProvider, 'ollama');
  assert.equal(external.externalLlmExternalProvider, 'gemini');
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

test('provider config can route Smart planning through the configured local ComfyUI model', () => {
  const config = externalLlmProviderConfig({
    externalLlmProvider: 'local',
    localPromptAiClip: 'prompt\\qwen3-vl-8b.safetensors',
    localPromptAiClipType: 'qwen_image',
    clip: 'generation-model.safetensors',
    clipType: 'krea2',
  });
  assert.deepEqual(config, {
    provider: 'local', label: 'Local ComfyUI',
    model: 'prompt\\qwen3-vl-8b.safetensors', type: 'qwen_image', apiKey: '',
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

test('external adapters preserve ordered multiple vision images for every provider', async () => {
  const first = { data: Buffer.from('first-image'), mimeType: 'image/jpeg' };
  const second = { data: Buffer.from('second-image'), mimeType: 'image/webp' };
  const firstBase64 = Buffer.from('first-image').toString('base64');
  const secondBase64 = Buffer.from('second-image').toString('base64');

  async function requestBody(provider) {
    let body;
    await externalLlmRequest({
      provider,
      model: `${provider}-test`,
      apiKey: provider === 'ollama' ? '' : 'test-key',
      baseUrl: 'http://127.0.0.1:11434',
      instruction: 'Return one prompt.',
      userInput: 'Compare both references.',
      images: [first, second],
      fetchImpl: async (_url, init) => {
        body = JSON.parse(init.body);
        if (provider === 'openai') return jsonResponse({ output_text: 'Done.' });
        if (provider === 'gemini') {
          return jsonResponse({ candidates: [{ content: { parts: [{ text: 'Done.' }] } }] });
        }
        return jsonResponse({ message: { content: 'Done.' } });
      },
    });
    return body;
  }

  const openAi = await requestBody('openai');
  assert.deepEqual(openAi.input[0].content.slice(1).map((part) => part.image_url), [
    `data:image/jpeg;base64,${firstBase64}`,
    `data:image/webp;base64,${secondBase64}`,
  ]);

  const gemini = await requestBody('gemini');
  assert.deepEqual(gemini.contents[0].parts.slice(1).map((part) => part.inlineData), [
    { mimeType: 'image/jpeg', data: firstBase64 },
    { mimeType: 'image/webp', data: secondBase64 },
  ]);

  const ollama = await requestBody('ollama');
  assert.deepEqual(ollama.messages[1].images, [firstBase64, secondBase64]);
});

test('multiple vision images ignore invalid entries and cap payloads at eight', async () => {
  let body;
  const validImages = Array.from({ length: 10 }, (_unused, index) => ({
    data: Buffer.from(`image-${index}`),
    mimeType: 'image/png',
  }));
  await externalLlmRequest({
    provider: 'ollama',
    model: 'gemma3',
    baseUrl: 'http://127.0.0.1:11434',
    instruction: 'Return one prompt.',
    userInput: 'Use these references.',
    images: [{}, { data: Buffer.alloc(0) }, ...validImages],
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse({ message: { content: 'Done.' } });
    },
  });

  assert.deepEqual(body.messages[1].images, validImages.slice(0, 8).map((image) => image.data.toString('base64')));
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

test('structured parsing recovers one JSON object from local-model commentary', async () => {
  const result = await externalLlmStructuredRequest({
    provider: 'ollama', model: 'local-test', baseUrl: 'http://127.0.0.1:11434',
    instruction: 'Plan.', userInput: 'A film.',
    schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    fetchImpl: async () => jsonResponse({
      message: { content: 'Here is the plan:\n{"title":"Recovered local plan"}\nDone.' },
    }),
  });
  assert.deepEqual(result, { title: 'Recovered local plan' });
});

test('structured requests use each provider native JSON schema mode and parse the result', async () => {
  const schema = {
    type: 'object', additionalProperties: false, required: ['title'],
    properties: { title: { type: 'string' } },
  };
  const bodies = {};
  for (const provider of ['openai', 'gemini', 'ollama']) {
    const result = await externalLlmStructuredRequest({
      provider, model: `${provider}-test`, apiKey: provider === 'ollama' ? '' : 'test-key',
      baseUrl: 'http://127.0.0.1:11434', instruction: 'Plan.', userInput: 'A film.',
      schema, schemaName: 'production_plan',
      fetchImpl: async (_url, init) => {
        bodies[provider] = JSON.parse(init.body);
        if (provider === 'openai') return jsonResponse({ output_text: '{"title":"OpenAI plan"}' });
        if (provider === 'gemini') return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"title":"Gemini plan"}' }] } }] });
        return jsonResponse({ message: { content: '```json\n{"title":"Ollama plan"}\n```' } });
      },
    });
    assert.match(result.title, /plan$/);
  }
  assert.deepEqual(bodies.openai.text.format, {
    type: 'json_schema', name: 'production_plan', strict: true, schema,
  });
  assert.equal(bodies.gemini.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(bodies.gemini.generationConfig.responseJsonSchema, schema);
  assert.deepEqual(bodies.ollama.format, schema);
});

test('Gemini structured output removes unsupported JSON Schema keywords recursively', async () => {
  const schema = {
    type: 'object', additionalProperties: false, required: ['title', 'clips'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 100 },
      clips: {
        type: 'array', minItems: 1, maxItems: 12,
        items: {
          type: 'object', additionalProperties: false, required: ['duration', 'description'],
          properties: {
            duration: { type: 'number', minimum: 0.1, maximum: 10 },
            description: { type: 'string', minLength: 1, maxLength: 600, pattern: '.+' },
          },
        },
      },
    },
  };
  const compatible = geminiResponseJsonSchema(schema);
  assert.deepEqual(compatible, {
    type: 'object', additionalProperties: false, required: ['title', 'clips'],
    properties: {
      title: { type: 'string' },
      clips: {
        type: 'array', minItems: 1, maxItems: 12,
        items: {
          type: 'object', additionalProperties: false, required: ['duration', 'description'],
          properties: {
            duration: { type: 'number', minimum: 0.1, maximum: 10 },
            description: { type: 'string' },
          },
        },
      },
    },
  });
  assert.doesNotMatch(JSON.stringify(compatible), /minLength|maxLength|pattern/);
  assert.match(JSON.stringify(compatible), /minItems|maxItems|minimum|maximum/);
});

test('Gemini retries schema-complexity rejections in JSON mode with the schema in its instruction', async () => {
  const schema = {
    type: 'object', additionalProperties: false, required: ['scenes'],
    properties: {
      scenes: {
        type: 'array', maxItems: 12,
        items: {
          type: 'object', required: ['timeline'],
          properties: {
            timeline: {
              type: 'array', maxItems: 6,
              items: {
                type: 'object', required: ['time', 'kind'],
                properties: {
                  time: { type: 'number', minimum: 0.1, maximum: 10 },
                  kind: { type: 'string', enum: ['action', 'camera', 'cut'] },
                },
              },
            },
          },
        },
      },
    },
  };
  const bodies = [];
  const result = await externalLlmStructuredRequest({
    provider: 'gemini', model: 'gemini-test', apiKey: 'test-key',
    instruction: 'Build a plan.', userInput: 'A timed film.', schema,
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) {
        return jsonResponse({
          error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' },
        }, 400);
      }
      return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"scenes":[]}' }] } }] });
    },
  });
  assert.deepEqual(result, { scenes: [] });
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].generationConfig.responseJsonSchema, schema);
  assert.equal(bodies[1].generationConfig.responseJsonSchema, undefined);
  assert.equal(bodies[1].generationConfig.responseMimeType, 'application/json');
  assert.match(bodies[1].systemInstruction.parts[0].text, /Return only one valid JSON object/);
  assert.match(bodies[1].systemInstruction.parts[0].text, /"timeline"/);
});

test('Gemini does not retry credential failures as schema fallbacks', async () => {
  let calls = 0;
  await assert.rejects(externalLlmStructuredRequest({
    provider: 'gemini', model: 'gemini-test', apiKey: 'bad-key',
    instruction: 'Build a plan.', userInput: 'A film.',
    schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ error: { message: 'API key rejected', status: 'PERMISSION_DENIED' } }, 400);
    },
  }), /API key rejected/);
  assert.equal(calls, 1);
});

test('server routes every image and video prompt tool through the selected Prompt AI', () => {
  assert.match(serverSource, /function enhancePrompt\([\s\S]*shouldUseConfiguredPromptAi\('image', 'enhance'\)/);
  assert.match(serverSource, /function reviseImagePrompt\([\s\S]*shouldUseConfiguredPromptAi\('image', 'revise'\)/);
  assert.match(serverSource, /function reviseVideoPrompt\([\s\S]*shouldUseConfiguredPromptAi\('video', 'revise'\)/);
  assert.match(serverSource, /function enhanceRegionPrompt\([\s\S]*shouldUseConfiguredPromptAi\('image', 'enhance'\)/);
  assert.match(serverSource, /function suggestMotionPrompt\([\s\S]*shouldUseConfiguredPromptAi\('video', 'enhance'\)/);
  assert.match(serverSource, /shouldUseConfiguredPromptAi\('video', 'enhance'\) && enhance && suppliedMotionPrompt/);
  assert.match(serverSource, /videoPromptEnhanceParts\(motionPrompt/);
  assert.match(serverSource, /route === '\/api\/prompt\/provider\/test'/);
});

test('external generation enhancement is visible while Ollama runs before ComfyUI queueing', () => {
  const configuredBlock = serverSource.slice(
    serverSource.indexOf('async function runConfiguredPromptAi'),
    serverSource.indexOf('function shouldUseConfiguredPromptAi'),
  );
  const queueBlock = serverSource.slice(
    serverSource.indexOf("if (route === '/api/queue')"),
    serverSource.indexOf("if (route === '/api/queue/history/clear'"),
  );
  assert.match(serverSource, /const externalPromptPreflights = new Map\(\)/);
  assert.match(serverSource, /function startExternalPromptPreflight[\s\S]*options\.action !== 'enhance'/);
  assert.match(configuredBlock, /const preflight = startExternalPromptPreflight\(provider, options\)/);
  assert.match(configuredBlock, /jobId: preflight \? 'pre' : 'external-prompt'/);
  assert.match(configuredBlock, /scope: preflight \? 'generation-preflight' : undefined/);
  assert.match(configuredBlock, /finally \{[\s\S]*finishExternalPromptPreflight\(preflight\)/);
  assert.match(queueBlock, /const preparing = \[\.\.\.externalPromptPreflights\.values\(\)\]/);
  assert.match(queueBlock, /cancellable: false/);
  assert.match(queueBlock, /ok: true,[\s\S]*preparing,[\s\S]*running,/);
});

test('server preserves ordered H3 first and last frames for external and local prompt vision', () => {
  assert.match(serverSource, /function h3ReferenceInputTokens\([\s\S]{0,500}<Picture \$\{index \+ 1\}>[\s\S]{0,500}<Audio \$\{audioIndex\}>/);
  assert.match(serverSource, /function h3PromptPartsWithAllowedReferences\(/);
  assert.match(serverSource, /Available reference tokens: \$\{allowed\.join\(', '\)\}/);
  assert.match(serverSource, /function h3PromptPartsWithVisionOrder\(/);
  assert.match(serverSource, /Attachment 1 is Picture 1, the first frame at 0\.00 seconds/);
  assert.match(serverSource, /left panel is Picture 1, the first frame at 0\.00 seconds/);
  assert.match(serverSource, /right panel is Picture 2, the last frame at the effective duration/);
  const externalBlock = serverSource.slice(
    serverSource.indexOf('async function runConfiguredPromptAi'),
    serverSource.indexOf('function shouldUseConfiguredPromptAi'),
  );
  assert.match(externalBlock, /const imageNames = orderedPromptImageNames\(options\)/);
  assert.match(externalBlock, /h3PromptPartsWithVisionOrder\(parts, options, 'attachments'\)/);
  assert.match(externalBlock, /Promise\.all\(imageNames\.map\(\(name\) => externalPromptImage\(name, options\.profileId\)\)\)/);
  assert.match(externalBlock, /externalLlmRequest\(\{[\s\S]*images,/);

  const localVisionBlock = serverSource.slice(
    serverSource.indexOf('async function appendPromptVisionImages'),
    serverSource.indexOf('/** Vision pass: Qwen3-VL looks at the image'),
  );
  assert.match(localVisionBlock, /imageNames\.forEach[\s\S]*class_type: 'LoadImage'/);
  assert.match(localVisionBlock, /nodeFromOrdered\([\s\S]*'ImageStitch'[\s\S]*image1: image, image2: \[`img_\$\{index \+ 1\}`, 0\]/);
  assert.match(serverSource, /function queueTextEnhancement[\s\S]{0,500}appendPromptVisionImages\(graph, options\)[\s\S]{0,500}refineInputs\.image = promptImage/);
  assert.match(serverSource, /function queueTextEnhancement[\s\S]{0,260}h3PromptPartsWithVisionOrder\(parts, options, 'stitched'\)/);

  assert.match(serverSource, /const h3PromptImageNames = engine !== 'h3'[\s\S]{0,260}!bypass \? comfyName : null,[\s\S]{0,100}body\.endImageName/);
  assert.match(serverSource, /sharedMotionPrompt\(comfyName, seed,[\s\S]{0,260}imageNames: engine === 'h3' \? h3PromptImageNames : undefined/);
  assert.match(serverSource, /sharedH3PromptEnhancement\(motionPrompt, seed,[\s\S]{0,220}imageNames: h3PromptImageNames/);

  const revisionBlock = serverSource.slice(
    serverSource.indexOf("if (route === '/api/prompt/revise'"),
    serverSource.indexOf("if (route === '/api/prompt/provider/test'"),
  );
  assert.match(revisionBlock, /const endImageName = String\(body\.endImageName/);
  assert.match(revisionBlock, /\[hasFirstFrame \? imageName : null, hasLastFrame \? \(endImageName/);
  assert.match(revisionBlock, /imageNames: revisionImageNames/);
});
