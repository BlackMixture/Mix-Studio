'use strict';

const crypto = require('crypto');

const SMART_ASPECTS = Object.freeze(['1:1', '16:9', '9:16', '4:3', '3:4']);
const SMART_PLAN_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion', 'title', 'summary', 'output', 'subject', 'visualStyle',
    'imagePrompt', 'videoPrompt', 'scenes', 'reviewReference',
  ],
  properties: {
    schemaVersion: { type: 'integer', enum: [1] },
    title: { type: 'string', minLength: 1, maxLength: 100 },
    summary: { type: 'string', minLength: 1, maxLength: 500 },
    output: {
      type: 'object', additionalProperties: false,
      required: ['kind', 'durationSeconds', 'aspectRatio', 'quality'],
      properties: {
        kind: { type: 'string', enum: ['image', 'video'] },
        durationSeconds: { type: 'number', minimum: 0, maximum: 120 },
        aspectRatio: { type: 'string', enum: SMART_ASPECTS },
        quality: { type: 'string', enum: ['fast', 'balanced', 'quality'] },
      },
    },
    subject: {
      type: 'object', additionalProperties: false,
      required: ['needsReference', 'description'],
      properties: {
        needsReference: { type: 'boolean' },
        description: { type: 'string', maxLength: 1200 },
      },
    },
    visualStyle: { type: 'string', minLength: 1, maxLength: 1200 },
    imagePrompt: { type: 'string', minLength: 1, maxLength: 5000 },
    videoPrompt: { type: 'string', maxLength: 12000 },
    scenes: {
      type: 'array', maxItems: 12,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'durationSeconds', 'description', 'camera', 'audio'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 100 },
          durationSeconds: { type: 'number', minimum: 0.5, maximum: 120 },
          description: { type: 'string', minLength: 1, maxLength: 1600 },
          camera: { type: 'string', maxLength: 600 },
          audio: { type: 'string', maxLength: 600 },
        },
      },
    },
    reviewReference: { type: 'boolean' },
  },
});

function clean(value, fallback = '', max = 1000) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, max);
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeSmartReferences(rawReferences) {
  const seen = new Set();
  return (Array.isArray(rawReferences) ? rawReferences : []).slice(0, 2).flatMap((reference, index) => {
    const name = clean(reference?.name, '', 512);
    if (!name || seen.has(name)) return [];
    seen.add(name);
    return [{
      name,
      label: clean(reference?.label, `Reference ${index + 1}`, 160),
      w: Math.max(0, Math.min(16384, Math.round(Number(reference?.w) || 0))),
      h: Math.max(0, Math.min(16384, Math.round(Number(reference?.h) || 0))),
    }];
  });
}

function smartPlanningPrompt(brief, options = {}) {
  const referenceCount = Math.max(0, Math.min(2, Math.round(Number(options.referenceCount) || 0)));
  return {
    instruction: [
      'You are the production planner inside Mix Studio, a local image and video generation application.',
      'Convert the creator brief into a practical production plan. Prefer MiniMax H3 for video and Krea 2 for a canonical subject reference.',
      referenceCount
        ? `The creator attached ${referenceCount} image reference${referenceCount === 1 ? '' : 's'}. Inspect them and infer whether each defines subject identity, visual style, wardrobe, product appearance, or composition. Preserve the relevant visible traits in the image prompt and describe them explicitly. For video, set subject.needsReference true so Krea 2 can synthesize one canonical H3 reference from the attachments.`
        : 'The creator did not attach image references.',
      'A persistent named character, creature, product, or object that must remain recognizable across scenes needs one canonical reference image.',
      'Do not request a contact sheet, multi-view grid, or multiple poses: H3 performs best with one clean canonical identity image.',
      'For video, divide the requested running time into at most 12 clear scenes whose durations add up to the requested duration (maximum 120 seconds).',
      'Write prompts as direct visual instructions. Preserve the creator intent; fill in production details without inventing a different story.',
      'Set reviewReference false unless identity is unusually sensitive or the creator explicitly asks to approve assets before video generation.',
    ].join(' '),
    userInput: clean(brief, '', 8000),
  };
}

function normalizeScenes(rawScenes, durationSeconds, fallbackDescription) {
  let scenes = Array.isArray(rawScenes) ? rawScenes.slice(0, 12) : [];
  scenes = scenes.map((scene, index) => ({
    title: clean(scene?.title, `Scene ${index + 1}`, 100),
    durationSeconds: clamp(scene?.durationSeconds, 0.5, durationSeconds, durationSeconds / Math.max(1, scenes.length)),
    description: clean(scene?.description, fallbackDescription, 1600),
    camera: clean(scene?.camera, 'Cinematic, clearly composed camera movement', 600),
    audio: clean(scene?.audio, 'Natural environmental sound', 600),
  })).filter((scene) => scene.description);
  if (!scenes.length) scenes = [{
    title: 'Main scene', durationSeconds, description: fallbackDescription,
    camera: 'Cinematic, clearly composed camera movement', audio: 'Natural environmental sound',
  }];
  const rawTotal = scenes.reduce((total, scene) => total + scene.durationSeconds, 0) || durationSeconds;
  let elapsed = 0;
  return scenes.map((scene, index) => {
    const isLast = index === scenes.length - 1;
    const scaled = isLast
      ? Math.max(0.5, durationSeconds - elapsed)
      : Math.max(0.5, (scene.durationSeconds / rawTotal) * durationSeconds);
    const remainingAfter = scenes.length - index - 1;
    const duration = isLast
      ? Math.max(0.5, durationSeconds - elapsed)
      : Math.min(scaled, Math.max(0.5, durationSeconds - elapsed - (remainingAfter * 0.5)));
    const startSeconds = elapsed;
    elapsed += duration;
    return Object.assign({}, scene, {
      durationSeconds: Number(duration.toFixed(2)),
      startSeconds: Number(startSeconds.toFixed(2)),
      endSeconds: Number((isLast ? durationSeconds : elapsed).toFixed(2)),
    });
  });
}

function normalizeSmartPlan(raw, brief = '') {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const outputKind = source.output?.kind === 'image' ? 'image' : 'video';
  const durationSeconds = outputKind === 'video'
    ? clamp(source.output?.durationSeconds, 1, 120, 5)
    : 0;
  const aspectRatio = SMART_ASPECTS.includes(source.output?.aspectRatio)
    ? source.output.aspectRatio : (outputKind === 'video' ? '16:9' : '1:1');
  const quality = ['fast', 'balanced', 'quality'].includes(source.output?.quality)
    ? source.output.quality : 'balanced';
  const subjectDescription = clean(source.subject?.description, clean(brief, 'Primary subject', 1200), 1200);
  const visualStyle = clean(source.visualStyle, 'Cinematic, detailed, cohesive visual storytelling', 1200);
  const imagePrompt = clean(source.imagePrompt,
    `${subjectDescription}. ${visualStyle}. One canonical subject, clean neutral environment, full identity clearly visible.`, 5000);
  const videoPrompt = clean(source.videoPrompt,
    `${subjectDescription}. ${visualStyle}. Natural coherent motion and consistent identity.`, 12000);
  const scenes = outputKind === 'video'
    ? normalizeScenes(source.scenes, durationSeconds, videoPrompt)
    : [];
  return {
    schemaVersion: 1,
    title: clean(source.title, outputKind === 'video' ? 'Smart video' : 'Smart image', 100),
    summary: clean(source.summary, clean(brief, 'AI-planned generation', 500), 500),
    output: { kind: outputKind, durationSeconds, aspectRatio, quality },
    subject: {
      needsReference: outputKind === 'video' && source.subject?.needsReference === true,
      description: subjectDescription,
    },
    visualStyle,
    imagePrompt,
    videoPrompt,
    scenes,
    reviewReference: outputKind === 'video' && source.subject?.needsReference === true
      ? source.reviewReference === true : false,
  };
}

function buildH3Prompt(plan) {
  const reference = plan.subject.needsReference
    ? `Use <Picture 1> as the exact canonical identity for ${plan.subject.description}. Preserve its defining appearance in every scene. `
    : '';
  const scenes = plan.scenes.map((scene, index) => {
    const timing = `${scene.startSeconds.toFixed(1)}-${scene.endSeconds.toFixed(1)}s`;
    const segment = `[${timing}] ${scene.title}: ${scene.description}. Camera: ${scene.camera}. Audio: ${scene.audio}.`;
    return index ? `<scenetrans> ${segment}` : segment;
  }).join(' ');
  return clean(`${reference}${plan.videoPrompt}. Overall visual style: ${plan.visualStyle}. ${scenes}`, '', 30000);
}

function smartDimensions(aspectRatio) {
  return {
    '16:9': [1344, 768], '9:16': [768, 1344], '4:3': [1216, 912],
    '3:4': [912, 1216], '1:1': [1024, 1024],
  }[aspectRatio] || [1024, 1024];
}

function compileSmartSteps(rawPlan, ids = {}, rawReferences = []) {
  const plan = normalizeSmartPlan(rawPlan);
  const references = normalizeSmartReferences(rawReferences);
  if (references.length && plan.output.kind === 'video') plan.subject.needsReference = true;
  const imageId = ids.imageId || crypto.randomUUID();
  const videoId = ids.videoId || crypto.randomUUID();
  const [width, height] = smartDimensions(plan.output.aspectRatio);
  if (plan.output.kind === 'image') return [{
    id: imageId, kind: 'image', label: 'Create final image', status: 'pending', dependsOn: [],
    request: {
      route: '/api/generate', body: {
        mode: references.length ? 'edit' : 't2i',
        editEngine: references.length ? 'krea2ref' : undefined,
        editAspectOverride: references.length ? true : undefined,
        refImages: references.length ? references.map((reference) => reference.name) : undefined,
        krea2RefBoost: references.length ? 4 : undefined,
        prompt: plan.imagePrompt, width, height, batch: 1, enhance: false,
        steps: 8, cfg: 1, krea2Turbo: true, loras: [], regions: [], negativePrompt: '',
      },
    },
  }];
  const steps = [];
  if (plan.subject.needsReference) steps.push({
    id: imageId, kind: 'reference', label: 'Create canonical reference', status: 'pending', dependsOn: [],
    request: {
      route: '/api/generate', body: {
        mode: references.length ? 'edit' : 't2i',
        editEngine: references.length ? 'krea2ref' : undefined,
        editAspectOverride: references.length ? true : undefined,
        refImages: references.length ? references.map((reference) => reference.name) : undefined,
        krea2RefBoost: references.length ? 4 : undefined,
        prompt: `${plan.imagePrompt}. Single canonical identity reference, one subject only, clean simple environment, clear defining features, no grid, no contact sheet, no multiple views, no multiple poses.`,
        width: 1024, height: 1024, batch: 1, enhance: false,
        steps: 8, cfg: 1, krea2Turbo: true, loras: [], regions: [], negativePrompt: '',
      },
    },
  });
  steps.push({
    id: videoId, kind: 'video', label: `Create ${plan.output.durationSeconds}-second H3 video`,
    status: 'pending', dependsOn: plan.subject.needsReference ? [imageId] : [],
    request: {
      route: '/api/animate', body: {
        engine: 'h3', prompt: buildH3Prompt(plan), width, height,
        seconds: plan.output.durationSeconds, enhance: false,
        h3Mode: plan.subject.needsReference ? 'reference' : 'frames',
        h3LongContext: plan.output.durationSeconds > 10,
        h3AspectRatio: width / height, h3ResolutionSize: 1,
        h3Turbo: plan.output.quality === 'fast', steps: plan.output.quality === 'fast' ? 8 : 20,
        sageAttention: false, fourK: false, loras: [],
      },
    },
  });
  return steps;
}

function smartPlanHash(rawPlan, rawReferences = []) {
  const canonical = JSON.stringify({
    plan: normalizeSmartPlan(rawPlan),
    references: normalizeSmartReferences(rawReferences),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

module.exports = {
  SMART_ASPECTS,
  SMART_PLAN_SCHEMA,
  buildH3Prompt,
  compileSmartSteps,
  normalizeSmartPlan,
  normalizeSmartReferences,
  smartDimensions,
  smartPlanHash,
  smartPlanningPrompt,
};
