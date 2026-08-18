'use strict';

const crypto = require('crypto');

const SMART_ASPECTS = Object.freeze(['1:1', '16:9', '9:16', '4:3', '3:4']);
const SMART_MAX_CLIPS = 12;
const SMART_MAX_CLIP_SECONDS = 10;
const SMART_DIRECTOR_SHOTS = Object.freeze([
  { shot: 'Wide establishing shot', camera: 'Slow controlled push-in with a clear horizon and readable geography' },
  { shot: 'Low-angle medium tracking shot', camera: 'Track with the action while preserving screen direction' },
  { shot: 'Tight character close-up', camera: 'Subtle handheld drift with restrained parallax and precise eye-line' },
  { shot: 'High-angle environmental shot', camera: 'Measured crane movement that reveals spatial relationships' },
  { shot: 'Side-profile medium shot', camera: 'Lateral dolly movement paced to the subject or environmental action' },
  { shot: 'Detail insert', camera: 'Macro-style controlled move that isolates one meaningful visual detail' },
]);
const SMART_PLAN_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion', 'title', 'summary', 'output', 'subject', 'visualStyle', 'directorialApproach',
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
    directorialApproach: { type: 'string', minLength: 1, maxLength: 1600 },
    imagePrompt: { type: 'string', minLength: 1, maxLength: 5000 },
    videoPrompt: { type: 'string', maxLength: 12000 },
    scenes: {
      type: 'array', maxItems: SMART_MAX_CLIPS,
      items: {
        type: 'object', additionalProperties: false,
        required: [
          'title', 'durationSeconds', 'description', 'shot', 'camera', 'transition',
          'continuity', 'audio', 'usesSubjectReference',
        ],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 100 },
          durationSeconds: { type: 'number', minimum: 1, maximum: SMART_MAX_CLIP_SECONDS },
          description: { type: 'string', minLength: 1, maxLength: 1600 },
          shot: { type: 'string', minLength: 1, maxLength: 600 },
          camera: { type: 'string', maxLength: 600 },
          transition: { type: 'string', maxLength: 400 },
          continuity: { type: 'string', maxLength: 800 },
          audio: { type: 'string', maxLength: 600 },
          usesSubjectReference: { type: 'boolean' },
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
      `Treat every scenes entry as one independently generated editorial clip, never as a chapter inside one long generation. Use at most ${SMART_MAX_CLIPS} clips and never make a clip longer than ${SMART_MAX_CLIP_SECONDS} seconds. Clip durations must add up to the requested running time (maximum 120 seconds).`,
      `For videos longer than ${SMART_MAX_CLIP_SECONDS} seconds, always plan multiple clips. Favor purposeful 4-10 second shots, hard cuts, match cuts, cutaways, inserts, reaction shots, and a deliberate progression of wide, medium, close, low, high, tracking, static, and detail angles. Do not repeat the same framing mechanically.`,
      'Think like a director and editor: establish geography, vary shot size and angle, preserve eye-lines and screen direction, stage one readable visual beat per clip, and use motivated transitions. Describe the overall directing strategy in directorialApproach.',
      'Set usesSubjectReference true only when the canonical recurring subject is visibly present in that specific clip description. Set it false for establishing shots, environment plates, inserts, B-roll, or any clip where that subject is absent. A false clip must not mention or depend on the canonical reference.',
      'Every clip must be a self-contained H3 prompt: describe visible action, shot size and angle, camera movement, entry/exit composition, continuity requirements, transition intent, and audio. Do not ask H3 to perform multiple editorial cuts inside one clip.',
      'Write prompts as direct visual instructions. Preserve the creator intent; fill in production details without inventing a different story.',
      'Set reviewReference false unless identity is unusually sensitive or the creator explicitly asks to approve assets before video generation.',
    ].join(' '),
    userInput: clean(brief, '', 8000),
  };
}

function allocateClipTenths(scenes, totalTenths) {
  const allocations = scenes.map(() => 10);
  const capacities = scenes.map(() => (SMART_MAX_CLIP_SECONDS * 10) - 10);
  let remaining = totalTenths - (scenes.length * 10);
  while (remaining > 0) {
    const active = capacities.map((capacity, index) => ({ capacity, index }))
      .filter((entry) => entry.capacity > 0);
    if (!active.length) break;
    const totalWeight = active.reduce((sum, entry) => sum + Math.max(1, scenes[entry.index].weight), 0);
    const budget = remaining;
    let distributed = 0;
    for (const entry of active) {
      const weight = Math.max(1, scenes[entry.index].weight);
      const share = Math.max(1, Math.floor((budget * weight) / totalWeight));
      const amount = Math.min(entry.capacity, remaining, share);
      allocations[entry.index] += amount;
      capacities[entry.index] -= amount;
      remaining -= amount;
      distributed += amount;
      if (!remaining) break;
    }
    if (!distributed) break;
  }
  return allocations;
}

function normalizeScenes(rawScenes, durationSeconds, fallbackDescription, needsReference = false) {
  let sources = Array.isArray(rawScenes) ? rawScenes.slice(0, SMART_MAX_CLIPS) : [];
  sources = sources.map((scene, index) => ({
    sourceIndex: index,
    title: clean(scene?.title, `Clip ${index + 1}`, 100),
    weight: clamp(scene?.durationSeconds, 1, 120, 1),
    description: clean(scene?.description, fallbackDescription, 1600),
    shot: clean(scene?.shot, '', 600),
    camera: clean(scene?.camera, '', 600),
    transition: clean(scene?.transition, '', 400),
    continuity: clean(scene?.continuity, '', 800),
    audio: clean(scene?.audio, 'Natural environmental sound', 600),
    usesSubjectReference: scene?.usesSubjectReference == null
      ? needsReference : scene.usesSubjectReference === true,
  })).filter((scene) => scene.description);
  if (!sources.length) sources = [{
    sourceIndex: 0, title: 'Main action', weight: durationSeconds, description: fallbackDescription,
    shot: '', camera: '', transition: '', continuity: '', audio: 'Natural environmental sound',
    usesSubjectReference: needsReference,
  }];

  const durationTenths = Math.max(10, Math.round(durationSeconds * 10));
  const maxClipCountForDuration = Math.max(1, Math.floor(durationTenths / 10));
  const clipCount = Math.min(
    SMART_MAX_CLIPS,
    maxClipCountForDuration,
    Math.max(sources.length, Math.ceil(durationSeconds / SMART_MAX_CLIP_SECONDS)),
  );
  let selected = sources;
  if (sources.length !== clipCount) {
    const rawTotal = sources.reduce((total, scene) => total + scene.weight, 0) || clipCount;
    const cumulative = [];
    sources.reduce((total, scene, index) => {
      cumulative[index] = total + scene.weight;
      return cumulative[index];
    }, 0);
    selected = Array.from({ length: clipCount }, (_, index) => {
      const midpoint = ((index + 0.5) / clipCount) * rawTotal;
      const sourceIndex = cumulative.findIndex((end) => midpoint <= end);
      return sources[sourceIndex < 0 ? sources.length - 1 : sourceIndex];
    });
  }
  const sourceCounts = selected.reduce((counts, scene) => {
    counts.set(scene.sourceIndex, (counts.get(scene.sourceIndex) || 0) + 1);
    return counts;
  }, new Map());
  const sourcePositions = new Map();
  const clipTenths = allocateClipTenths(selected, durationTenths);
  let elapsedTenths = 0;
  return selected.map((source, index) => {
    const directing = SMART_DIRECTOR_SHOTS[index % SMART_DIRECTOR_SHOTS.length];
    const sourcePosition = (sourcePositions.get(source.sourceIndex) || 0) + 1;
    sourcePositions.set(source.sourceIndex, sourcePosition);
    const repeated = sourceCounts.get(source.sourceIndex) > 1;
    const startTenths = elapsedTenths;
    elapsedTenths += clipTenths[index];
    return {
      title: clean(repeated ? `${source.title} · Beat ${sourcePosition}` : source.title, `Clip ${index + 1}`, 100),
      durationSeconds: Number((clipTenths[index] / 10).toFixed(1)),
      startSeconds: Number((startTenths / 10).toFixed(1)),
      endSeconds: Number((elapsedTenths / 10).toFixed(1)),
      description: source.description,
      shot: clean(source.shot, directing.shot, 600),
      camera: clean(source.camera, directing.camera, 600),
      transition: clean(source.transition, index ? 'Hard cut on a motivated action, look, or sound cue' : 'Opening image establishes the visual world immediately', 400),
      continuity: clean(source.continuity,
        source.usesSubjectReference
          ? 'Preserve canonical identity, wardrobe, scale, screen direction, lighting direction, and spatial logic from adjacent clips'
          : 'Preserve location, lighting direction, color palette, screen direction, and spatial logic from adjacent clips', 800),
      audio: source.audio,
      usesSubjectReference: source.usesSubjectReference,
    };
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
  const directorialApproach = clean(source.directorialApproach,
    'Build a clear visual arc with motivated cuts, varied shot sizes and camera angles, readable blocking, and continuous screen direction.', 1600);
  const imagePrompt = clean(source.imagePrompt,
    `${subjectDescription}. ${visualStyle}. One canonical subject, clean neutral environment, full identity clearly visible.`, 5000);
  const videoPrompt = clean(source.videoPrompt,
    `${subjectDescription}. ${visualStyle}. Natural coherent motion and consistent identity.`, 12000);
  const scenes = outputKind === 'video'
    ? normalizeScenes(source.scenes, durationSeconds, videoPrompt, source.subject?.needsReference === true)
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
    directorialApproach,
    imagePrompt,
    videoPrompt,
    scenes,
    reviewReference: outputKind === 'video' && source.subject?.needsReference === true
      ? source.reviewReference === true : false,
  };
}

function sceneUsesSubjectReference(plan, scene) {
  return plan?.subject?.needsReference === true && scene?.usesSubjectReference === true;
}

function buildH3ClipPrompt(plan, scene, index = 0) {
  const usesReference = sceneUsesSubjectReference(plan, scene);
  const reference = usesReference
    ? `Use <Picture 1> as the exact canonical identity for ${plan.subject.description}. Preserve its defining appearance without redesigning it. `
    : (plan.subject.needsReference
      ? 'The recurring canonical subject is not present in this clip. Do not introduce it. '
      : '');
  const story = usesReference ? `${plan.videoPrompt}. ` : '';
  return clean([
    reference,
    `Create one continuous editorial shot for clip ${index + 1} of ${plan.scenes.length}, positioned at ${scene.startSeconds.toFixed(1)}-${scene.endSeconds.toFixed(1)} seconds in the finished sequence.`,
    story,
    `Visible action: ${scene.description}.`,
    `Shot design: ${scene.shot}. Camera movement: ${scene.camera}.`,
    `Directorial intent: ${plan.directorialApproach}. Overall visual style: ${plan.visualStyle}.`,
    `Continuity: ${scene.continuity}. Editorial transition: ${scene.transition}. Audio: ${scene.audio}.`,
    'Stage one readable visual beat. Do not perform an internal editorial cut or switch to a second camera angle inside this generated clip.',
  ].join(' '), '', 12000);
}

function buildH3Prompt(plan) {
  return clean(plan.scenes.map((scene, index) => buildH3ClipPrompt(plan, scene, index))
    .join(' <scenetrans> '), '', 30000);
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
  const referenceNeeded = plan.subject.needsReference
    && plan.scenes.some((scene) => sceneUsesSubjectReference(plan, scene));
  if (referenceNeeded) steps.push({
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
  plan.scenes.forEach((scene, index) => {
    const usesReference = referenceNeeded && sceneUsesSubjectReference(plan, scene);
    const videoId = ids.videoIds?.[index]
      || (index === 0 && ids.videoId ? ids.videoId : crypto.randomUUID());
    steps.push({
      id: videoId,
      kind: 'video',
      sceneIndex: index,
      clip: {
        title: scene.title,
        durationSeconds: scene.durationSeconds,
        usesSubjectReference: usesReference,
      },
      label: `Clip ${index + 1} · ${scene.title} (${scene.durationSeconds}s)`,
      status: 'pending',
      dependsOn: usesReference ? [imageId] : [],
      request: {
        route: '/api/animate', body: {
          engine: 'h3', prompt: buildH3ClipPrompt(plan, scene, index), width, height,
          seconds: scene.durationSeconds, enhance: false,
          h3Mode: usesReference ? 'reference' : 'frames',
          h3LongContext: false,
          h3AspectRatio: width / height, h3ResolutionSize: 1,
          h3Turbo: plan.output.quality === 'fast', steps: plan.output.quality === 'fast' ? 8 : 20,
          sageAttention: false, fourK: false, loras: [],
        },
      },
    });
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
  SMART_MAX_CLIPS,
  SMART_PLAN_SCHEMA,
  buildH3ClipPrompt,
  buildH3Prompt,
  compileSmartSteps,
  normalizeSmartPlan,
  normalizeSmartReferences,
  sceneUsesSubjectReference,
  smartDimensions,
  smartPlanHash,
  smartPlanningPrompt,
};
