'use strict';

const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  '2026-07-28',
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
]);

function mcpToolDefinitions() {
  return [
    {
      name: 'mix_studio_status',
      title: 'Check Mix Studio status',
      description: 'Check the shared generation queue and recent activity without changing anything.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'mix_studio_recent_generations',
      title: 'List recent Mix Studio generations',
      description: 'List recent image and video generations for the connected owner profile. Returns metadata, not media bytes.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Number of recent gallery items to return.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'mix_studio_generate_image',
      title: 'Generate an image in Mix Studio',
      description: 'Queue a new Krea 2 text-to-image generation. This creates gallery media and consumes local GPU time.',
      inputSchema: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1, maxLength: 8000, description: 'The image prompt.' },
          aspect_ratio: {
            type: 'string',
            enum: ['square', 'portrait', 'landscape', 'vertical', 'wide'],
            description: 'Output framing. Defaults to square.',
          },
          batch: { type: 'integer', minimum: 1, maximum: 4, description: 'Number of images. Defaults to 1.' },
          enhance_prompt: { type: 'boolean', description: 'Use Mix Studio prompt enhancement before generation.' },
          seed: { type: 'integer', minimum: 0, description: 'Optional deterministic seed.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: 'mix_studio_generate_video',
      title: 'Generate a video in Mix Studio',
      description: 'Queue a text-to-video generation with MiniMax H3 or LTX 2.3. This creates gallery media and consumes local GPU time.',
      inputSchema: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1, maxLength: 8000, description: 'Motion, scene, and sound prompt.' },
          engine: { type: 'string', enum: ['h3', 'ltx'], description: 'Video model. Defaults to h3.' },
          aspect_ratio: {
            type: 'string',
            enum: ['square', 'portrait', 'landscape', 'vertical', 'wide'],
            description: 'Output framing. Defaults to landscape.',
          },
          seconds: { type: 'number', minimum: 1, maximum: 20, description: 'Requested duration; the model may snap it to a supported frame grid.' },
          enhance_prompt: { type: 'boolean', description: 'Use the model-aware prompt enhancer before generation.' },
          turbo: { type: 'boolean', description: 'Use H3 Turbo when engine is h3. Frames Turbo v4 defaults to six steps.' },
          seed: { type: 'integer', minimum: 0, description: 'Optional deterministic seed.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message: String(message || 'MCP request failed') };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function selectProtocolVersion(value) {
  const requested = String(value || '');
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[1];
}

function toolResult(value) {
  const structured = value && typeof value === 'object' ? value : { result: value };
  return {
    content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
    isError: false,
  };
}

function toolError(error) {
  const structured = {
    error: String(error?.message || error || 'Mix Studio tool failed'),
    code: String(error?.code || 'mix_studio_error'),
  };
  if (error?.details !== undefined) structured.details = error.details;
  return {
    content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
    isError: true,
  };
}

async function handleMcpMessage(message, options = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }
  const id = Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : undefined;
  const method = String(message.method || '');
  if (message.jsonrpc !== '2.0' || !method) return jsonRpcError(id, -32600, 'Invalid Request');

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null;
  if (method === 'initialize') {
    return jsonRpcResult(id, {
      protocolVersion: selectProtocolVersion(message.params?.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo: {
        name: 'mix-studio',
        title: 'Mix Studio',
        version: String(options.version || 'development'),
      },
      instructions: 'Use Mix Studio to inspect its queue and recent gallery, or queue non-destructive image and video generations. Generation tools create media and use the local GPU. No deletion, profile, settings, update, or trash tools are exposed.',
    });
  }
  if (method === 'ping') return jsonRpcResult(id, {});
  if (method === 'tools/list') return jsonRpcResult(id, { tools: options.tools || mcpToolDefinitions() });
  if (method === 'tools/call') {
    const name = String(message.params?.name || '');
    if (!name) return jsonRpcError(id, -32602, 'Tool name is required');
    try {
      if (typeof options.callTool !== 'function') throw new Error('Mix Studio tool execution is unavailable');
      const result = await options.callTool(name, message.params?.arguments || {});
      return jsonRpcResult(id, toolResult(result));
    } catch (error) {
      return jsonRpcResult(id, toolError(error));
    }
  }
  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}

async function handleMcpPayload(payload, options = {}) {
  if (Array.isArray(payload)) {
    if (!payload.length) return jsonRpcError(null, -32600, 'Invalid Request');
    const responses = (await Promise.all(payload.map((message) => handleMcpMessage(message, options))))
      .filter(Boolean);
    return responses.length ? responses : null;
  }
  return handleMcpMessage(payload, options);
}

module.exports = {
  SUPPORTED_PROTOCOL_VERSIONS,
  handleMcpMessage,
  handleMcpPayload,
  mcpToolDefinitions,
  selectProtocolVersion,
};
