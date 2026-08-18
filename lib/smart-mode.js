'use strict';

const crypto = require('crypto');

const SMART_ASPECTS = Object.freeze(['1:1', '16:9', '9:16', '4:3', '3:4']);
const SMART_REFERENCE_TYPES = Object.freeze(['character', 'object', 'place']);
const SMART_MAX_REFERENCE_STATES = 6;
const SMART_MAX_DIALOGUE_LINES = 6;
const SMART_MAX_TIMELINE_BEATS = 6;
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
      required: ['needsReference', 'referenceType', 'description', 'referenceStates'],
      properties: {
        needsReference: { type: 'boolean' },
        referenceType: { type: 'string', enum: SMART_REFERENCE_TYPES },
        description: { type: 'string', maxLength: 1200 },
        referenceStates: {
          type: 'array', maxItems: SMART_MAX_REFERENCE_STATES,
          items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'label', 'description'],
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 64 },
              label: { type: 'string', minLength: 1, maxLength: 100 },
              description: { type: 'string', minLength: 1, maxLength: 1200 },
            },
          },
        },
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
          'spatialComposition', 'continuity', 'audio', 'music', 'dialogue', 'timelineBeats',
          'usesSubjectReference', 'referenceStateId',
        ],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 100 },
          durationSeconds: { type: 'number', minimum: 1, maximum: SMART_MAX_CLIP_SECONDS },
          description: { type: 'string', minLength: 1, maxLength: 1600 },
          shot: { type: 'string', minLength: 1, maxLength: 600 },
          camera: { type: 'string', maxLength: 600 },
          transition: { type: 'string', maxLength: 400 },
          spatialComposition: { type: 'string', maxLength: 800 },
          continuity: { type: 'string', maxLength: 800 },
          audio: { type: 'string', maxLength: 600 },
          music: { type: 'string', maxLength: 600 },
          dialogue: {
            type: 'array', maxItems: SMART_MAX_DIALOGUE_LINES,
            items: {
              type: 'object', additionalProperties: false,
              required: ['speaker', 'line', 'language', 'delivery', 'isReferenceSubject', 'timeSeconds'],
              properties: {
                speaker: { type: 'string', minLength: 1, maxLength: 120 },
                line: { type: 'string', minLength: 1, maxLength: 500 },
                language: { type: 'string', minLength: 1, maxLength: 40 },
                delivery: { type: 'string', minLength: 1, maxLength: 120 },
                isReferenceSubject: { type: 'boolean' },
                timeSeconds: { type: 'number', minimum: 0, maximum: SMART_MAX_CLIP_SECONDS },
              },
            },
          },
          timelineBeats: {
            type: 'array', maxItems: SMART_MAX_TIMELINE_BEATS,
            items: {
              type: 'object', additionalProperties: false,
              required: ['timeSeconds', 'kind', 'description'],
              properties: {
                timeSeconds: { type: 'number', minimum: 0.1, maximum: SMART_MAX_CLIP_SECONDS },
                kind: { type: 'string', enum: ['action', 'camera', 'cut'] },
                description: { type: 'string', minLength: 1, maxLength: 600 },
              },
            },
          },
          usesSubjectReference: { type: 'boolean' },
          referenceStateId: { type: 'string', maxLength: 64 },
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
        ? `The creator attached ${referenceCount} image reference${referenceCount === 1 ? '' : 's'}. Inspect them and infer whether each defines subject identity, visual style, wardrobe, product appearance, or composition. Preserve the relevant visible traits in the image prompt and describe them explicitly. For video, set subject.needsReference true so Krea 2 can synthesize the required canonical H3 reference states from the attachments.`
        : 'The creator did not attach image references.',
      'A persistent named character, creature, product, object, or place that must remain recognizable across scenes needs a canonical reference, with a separate reference for each materially changed state.',
      'Classify the canonical reference as subject.referenceType character, object, or place. Use character for people, animals, creatures, and other identity-led subjects; object for products, vehicles, props, and other designed things; and place for a recurring location or environment whose spatial design must remain recognizable.',
      'Mix Studio applies the standardized reference layout after planning: characters use front full-body, back full-body, and face close-up panels; objects use front three-quarter, rear three-quarter, and side panels; places use one coherent wide master view. Do not write a conflicting reference layout into imagePrompt.',
      `Create subject.referenceStates for every materially distinct visual state that needs continuity, up to ${SMART_MAX_REFERENCE_STATES}: character wardrobe changes, injuries, dirt, damage, age, or transformations; object damage, configuration, or assembly changes; and place destruction, construction, seasonal, or other major state changes. Use one default state when nothing changes. Do not make a new state for a camera angle or a momentary lighting change. Give every state a short stable id, label, and complete visible description.`,
      `Treat every scenes entry as one independently generated editorial clip, never as a chapter inside one long generation. Use at most ${SMART_MAX_CLIPS} clips and never make a clip longer than ${SMART_MAX_CLIP_SECONDS} seconds. Clip durations must add up to the requested running time (maximum 120 seconds).`,
      `For videos longer than ${SMART_MAX_CLIP_SECONDS} seconds, always plan multiple clips. Favor purposeful 4-10 second shots, hard cuts, match cuts, cutaways, inserts, reaction shots, and a deliberate progression of wide, medium, close, low, high, tracking, static, and detail angles. Do not repeat the same framing mechanically.`,
      'Think like a director and editor: establish geography, vary shot size and angle, preserve eye-lines and screen direction, stage one readable visual beat per clip, and use motivated transitions. Describe the overall directing strategy in directorialApproach.',
      'Set usesSubjectReference true only when the canonical recurring character or object is visibly present in that clip, or when the canonical place is the visible setting. Set it false for unrelated establishing shots, environment plates, inserts, B-roll, or clips where the reference target is absent. For every true clip, set referenceStateId to the exact state depicted; for every false clip, set it to an empty string. A false clip must not mention or depend on the canonical reference.',
      'Every clip must be self-contained because H3 receives no information about any other clip. In description, shot, camera, continuity, and audio, include only concrete information H3 can render in that one generation: visible subjects, appearance, action, environment, composition, lighting, camera behavior, and audible sound. Never mention a clip number, its position in the finished film, previous or next shots, adjacent clips, the wider plan, an absent recurring subject, or any instruction to preserve information that is not restated locally. Keep transition as editor-only metadata; do not place transition instructions in description or continuity.',
      'Every continuity value must restate the exact visible anchors needed inside that clip, such as wardrobe state, object condition, location geometry, screen direction, and lighting direction. Do not use shorthand such as same as before, remains consistent, preserve from adjacent clips, or continues from the previous scene.',
      'Use spatialComposition to state only useful view-relative staging: foreground, midground, background, screen-left or screen-right, depth, occlusion, subject distance, and entry or exit path. Keep it concise and do not use world coordinates or details that the shot cannot show.',
      'Dialogue must contain only words explicitly supplied by the creator. Never invent dialogue, narration, lyrics, or voiceover. Put each exact authored line in dialogue.line without quotation marks or formatting tags, identify its speaker, language, and a concise vocal delivery such as says, whispers, shouts, or says in an off-screen voiceover, and set isReferenceSubject only when that speaker is the clip reference subject. If the brief merely implies conversation, use an empty dialogue array.',
      'Use audio only for ambience, physical action sounds, and nonverbal human sounds that are audible in this clip. Do not repeat dialogue or audience-only score there. Default music to an empty string so the H3 prompt becomes non_diegetic_music: N/A. Supply music only when the creator explicitly asks for a non-diegetic score.',
      'Favor compact prompts. Each scene description should express one visible beat in one or two sentences; spatialComposition, continuity, audio, and music should each be one concise phrase or sentence. Do not pad prompts with analysis, rationale, exhaustive adjectives, or redundant restatements.',
      'Write visualStyle as a concise reusable look, because the final H3 visual-description field ends with an exact Style: visualStyle tag for consistency.',
      `Use timelineBeats when precise local timing improves the generation. Every timeSeconds value is measured from 0.00 at the start of that individual clip, never from the finished film, must be greater than 0 and strictly less than the clip duration, and must increase chronologically. Use kind action for a visible event, kind camera for a camera move or framing change without a cut, and kind cut only for a true edit to a new view. H3 handles motivated timestamped cuts well and a small internal cut can improve continuity, but prefer a timed action or camera move when a cut adds no useful visual information. Use at most ${SMART_MAX_TIMELINE_BEATS} concise beats and avoid over-directing every second.`,
      'Set dialogue.timeSeconds to a local clip time when the creator specifies or the line needs precise synchronization; otherwise use 0. Timed dialogue must remain strictly inside the clip duration.',
      'Write prompts as direct visual instructions. Preserve the creator intent; fill in production details without inventing a different story.',
      'Set reviewReference false unless identity is unusually sensitive or the creator explicitly asks to approve assets before video generation.',
    ].join(' '),
    userInput: clean(brief, '', 8000),
  };
}

function referenceStateId(value, fallback) {
  const normalized = clean(value, '', 64).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function normalizeReferenceStates(rawStates, subjectDescription) {
  const seen = new Set();
  const states = (Array.isArray(rawStates) ? rawStates : []).slice(0, SMART_MAX_REFERENCE_STATES)
    .map((state, index) => {
      const baseId = referenceStateId(state?.id || state?.label, `state-${index + 1}`);
      let id = baseId;
      let suffix = 2;
      while (seen.has(id)) id = `${baseId.slice(0, 59)}-${suffix++}`;
      seen.add(id);
      return {
        id,
        label: clean(state?.label, index ? `State ${index + 1}` : 'Default', 100),
        description: clean(state?.description, subjectDescription, 1200),
      };
    });
  return states.length ? states : [{
    id: 'default',
    label: 'Default',
    description: clean(subjectDescription, 'Primary subject in its default appearance', 1200),
  }];
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

function localClipTime(value, durationSeconds, allowZero = false) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return allowZero ? 0 : null;
  if (allowZero && numeric === 0) return 0;
  const duration = clamp(durationSeconds, 1, SMART_MAX_CLIP_SECONDS, SMART_MAX_CLIP_SECONDS);
  if (numeric <= 0 || numeric >= duration) return allowZero ? 0 : null;
  return Number(numeric.toFixed(3));
}

function normalizeDialogue(rawDialogue, durationSeconds = SMART_MAX_CLIP_SECONDS) {
  return (Array.isArray(rawDialogue) ? rawDialogue : []).slice(0, SMART_MAX_DIALOGUE_LINES)
    .flatMap((entry) => {
      const speaker = clean(entry?.speaker, '', 120).replace(/[<>]/g, '');
      const line = clean(entry?.line, '', 500).replace(/<\/?d>/gi, '').trim();
      if (!speaker || !line) return [];
      const language = clean(entry?.language, 'English', 40).replace(/[^A-Za-z -]/g, '').trim() || 'English';
      const delivery = clean(entry?.delivery, 'says', 120).replace(/[<>:]/g, '').trim() || 'says';
      return [{
        speaker,
        line,
        language,
        delivery,
        isReferenceSubject: entry?.isReferenceSubject === true,
        timeSeconds: localClipTime(entry?.timeSeconds, durationSeconds, true),
      }];
    });
}

function normalizeTimelineBeats(rawTimelineBeats, durationSeconds = SMART_MAX_CLIP_SECONDS) {
  return (Array.isArray(rawTimelineBeats) ? rawTimelineBeats : []).slice(0, SMART_MAX_TIMELINE_BEATS)
    .flatMap((entry, index) => {
      const timeSeconds = localClipTime(entry?.timeSeconds, durationSeconds);
      const kind = ['action', 'camera', 'cut'].includes(entry?.kind) ? entry.kind : '';
      const description = clean(entry?.description, '', 600).replace(/^At\s+\d{1,2}:\d{2}(?:\.\d{1,3})?\s*,?\s*/i, '');
      return timeSeconds != null && kind && description
        ? [{ timeSeconds, kind, description, sourceOrder: index }] : [];
    })
    .sort((left, right) => (left.timeSeconds - right.timeSeconds) || (left.sourceOrder - right.sourceOrder))
    .map(({ sourceOrder, ...entry }) => entry);
}

function normalizeScenes(rawScenes, durationSeconds, fallbackDescription, needsReference = false, referenceStates = []) {
  const stateIds = new Set(referenceStates.map((state) => state.id));
  const defaultStateId = referenceStates[0]?.id || 'default';
  let sources = Array.isArray(rawScenes) ? rawScenes.slice(0, SMART_MAX_CLIPS) : [];
  sources = sources.map((scene, index) => ({
    sourceIndex: index,
    title: clean(scene?.title, `Clip ${index + 1}`, 100),
    weight: clamp(scene?.durationSeconds, 1, 120, 1),
    description: clean(scene?.description, fallbackDescription, 1600),
    shot: clean(scene?.shot, '', 600),
    camera: clean(scene?.camera, '', 600),
    transition: clean(scene?.transition, '', 400),
    spatialComposition: clean(scene?.spatialComposition, 'Readable foreground, midground, and background separation with one uncluttered focal plane', 800),
    continuity: clean(scene?.continuity, '', 800),
    audio: clean(scene?.audio, 'Natural environmental sound', 600),
    music: clean(scene?.music, '', 600),
    dialogue: Array.isArray(scene?.dialogue) ? scene.dialogue : [],
    timelineBeats: Array.isArray(scene?.timelineBeats) ? scene.timelineBeats : [],
    usesSubjectReference: scene?.usesSubjectReference == null
      ? needsReference : scene.usesSubjectReference === true,
    referenceStateId: stateIds.has(referenceStateId(scene?.referenceStateId, ''))
      ? referenceStateId(scene?.referenceStateId, '') : defaultStateId,
  })).filter((scene) => scene.description);
  if (!sources.length) sources = [{
    sourceIndex: 0, title: 'Main action', weight: durationSeconds, description: fallbackDescription,
    shot: '', camera: '', transition: '',
    spatialComposition: 'Readable foreground, midground, and background separation with one uncluttered focal plane',
    continuity: '', audio: 'Natural environmental sound', music: '', dialogue: [], timelineBeats: [],
    usesSubjectReference: needsReference,
    referenceStateId: defaultStateId,
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
      spatialComposition: source.spatialComposition,
      continuity: clean(source.continuity,
        source.usesSubjectReference
          ? 'The depicted identity, wardrobe, proportions, colors, screen direction, key-light direction, and spatial layout remain stable for the full shot'
          : 'The location geometry, color palette, screen direction, key-light direction, and spatial layout remain stable for the full shot', 800),
      audio: source.audio,
      music: source.music,
      dialogue: !repeated || sourcePosition === 1
        ? normalizeDialogue(source.dialogue, clipTenths[index] / 10) : [],
      timelineBeats: !repeated || sourcePosition === 1
        ? normalizeTimelineBeats(source.timelineBeats, clipTenths[index] / 10) : [],
      usesSubjectReference: source.usesSubjectReference,
      referenceStateId: source.usesSubjectReference ? source.referenceStateId : '',
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
  const referenceType = SMART_REFERENCE_TYPES.includes(source.subject?.referenceType)
    ? source.subject.referenceType : 'character';
  const needsReference = outputKind === 'video' && source.subject?.needsReference === true;
  const referenceStates = normalizeReferenceStates(source.subject?.referenceStates, subjectDescription);
  const visualStyle = clean(source.visualStyle, 'Cinematic, detailed, cohesive visual storytelling', 1200);
  const directorialApproach = clean(source.directorialApproach,
    'Build a clear visual arc with motivated cuts, varied shot sizes and camera angles, readable blocking, and continuous screen direction.', 1600);
  const imagePrompt = clean(source.imagePrompt,
    `${subjectDescription}. ${visualStyle}. One canonical subject, clean neutral environment, full identity clearly visible.`, 5000);
  const videoPrompt = clean(source.videoPrompt,
    `${subjectDescription}. ${visualStyle}. Natural coherent motion and consistent identity.`, 12000);
  const scenes = outputKind === 'video'
    ? normalizeScenes(source.scenes, durationSeconds, videoPrompt, needsReference, referenceStates)
    : [];
  return {
    schemaVersion: 1,
    title: clean(source.title, outputKind === 'video' ? 'Smart video' : 'Smart image', 100),
    summary: clean(source.summary, clean(brief, 'AI-planned generation', 500), 500),
    output: { kind: outputKind, durationSeconds, aspectRatio, quality },
    subject: {
      needsReference,
      referenceType,
      description: subjectDescription,
      referenceStates,
    },
    visualStyle,
    directorialApproach,
    imagePrompt,
    videoPrompt,
    scenes,
    reviewReference: needsReference
      ? source.reviewReference === true : false,
  };
}

function smartReferenceState(plan, stateId) {
  const states = Array.isArray(plan?.subject?.referenceStates) ? plan.subject.referenceStates : [];
  return states.find((state) => state.id === stateId) || states[0] || {
    id: 'default', label: 'Default', description: plan?.subject?.description || 'Primary subject',
  };
}

function sceneReferenceState(plan, scene) {
  return smartReferenceState(plan, scene?.referenceStateId);
}

function smartReferenceSpec(rawPlan) {
  const plan = normalizeSmartPlan(rawPlan);
  const type = plan.subject.referenceType;
  if (type === 'place') return {
    type,
    label: 'Place master reference',
    width: 1344,
    height: 768,
    prompt: [
      'Create one coherent wide master environment reference, not a collage, contact sheet, or multi-panel image.',
      'Show the complete recurring place from a clear eye-level three-quarter establishing viewpoint with readable foreground, midground, background, entrances, landmarks, materials, and spatial relationships.',
      'Keep the architecture, geography, color palette, weather, and lighting direction internally consistent. Do not feature a prominent foreground character unless the place itself requires one for scale.',
    ].join(' '),
  };
  if (type === 'object') return {
    type,
    label: 'Object multi-angle reference',
    width: 1344,
    height: 768,
    prompt: [
      'Create one clean three-panel object reference sheet on a uniform neutral mid-grey studio background.',
      'Left panel: the complete object in a front three-quarter view. Middle panel: the complete object in a rear three-quarter view. Right panel: the complete object in a true side-profile view.',
      'The exact same object must appear in every panel with identical geometry, proportions, materials, colors, markings, wear, and scale. Use even soft studio lighting, minimal perspective distortion, equal panel widths, and no scenery, people, hands, props, borders, labels, or text.',
    ].join(' '),
  };
  return {
    type: 'character',
    label: 'Character three-panel reference',
    width: 1344,
    height: 768,
    prompt: [
      'Create one clean three-panel character reference sheet on a uniform neutral mid-grey studio background.',
      'Left panel: a front-facing full-body view in a neutral standing pose, with the entire figure visible from head to toe. Middle panel: a back-facing full-body view in the same neutral pose, with the entire figure visible from head to toe. Right panel: a close-up front-facing face and head-and-shoulders portrait.',
      'The exact same character must appear in every panel with identical identity, facial structure, hair, body proportions, wardrobe, accessories, colors, and markings. Use even soft studio lighting, minimal perspective distortion, equal panel widths, and no scenery, props, borders, labels, or text.',
    ].join(' '),
  };
}

function sceneUsesSubjectReference(plan, scene) {
  return plan?.subject?.needsReference === true && scene?.usesSubjectReference === true;
}

function sentencePart(value, max = 1600) {
  return clean(value, '', max).replace(/[.!?]+$/g, '');
}

function h3DialogueLines(scene, usesReference) {
  const ids = new Map();
  let nextId = 1;
  return normalizeDialogue(scene?.dialogue, scene?.durationSeconds).map((entry, index) => {
    const key = usesReference && entry.isReferenceSubject
      ? 'reference-subject' : entry.speaker.toLowerCase();
    if (!ids.has(key)) ids.set(key, `S${nextId++}`);
    const speaker = usesReference && entry.isReferenceSubject ? '<Subject 1>' : entry.speaker;
    const voiceover = /voice[ -]?over/i.test(entry.delivery);
    const delivery = voiceover
      ? 'says in an off-screen voiceover'
      : (/\b(?:says|asks|replies|whispers|shouts|yells|murmurs|sings|chants|calls|narrates)\b/i.test(entry.delivery)
        ? entry.delivery : `says ${entry.delivery}`);
    const spoken = entry.line.replace(/</g, '‹').replace(/>/g, '›');
    const lipLock = voiceover && entry.isReferenceSubject
      ? " The corresponding on-screen character's lips remain completely closed." : '';
    return {
      timeSeconds: entry.timeSeconds,
      sourceOrder: index,
      text: `${speaker} (${ids.get(key)}) ${delivery}: <d>[${entry.language}] ${spoken}</d>${lipLock}`,
    };
  });
}

function h3LocalTimestamp(seconds) {
  const totalMilliseconds = Math.round(Number(seconds) * 1000);
  const minutes = Math.floor(totalMilliseconds / 60000);
  const remaining = totalMilliseconds - (minutes * 60000);
  const wholeSeconds = Math.floor(remaining / 1000);
  const milliseconds = remaining - (wholeSeconds * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function h3TimedBeatText(beat) {
  const description = sentencePart(beat.description, 600)
    .replace(/^(?:at\s+\d+(?:\.\d+)?\s*(?:seconds?|s)?\s*,?\s*)/i, '');
  if (beat.kind === 'cut') {
    const target = description.replace(/^(?:(?:the\s+)?camera\s+)?cuts?\s+to\s+/i, '');
    return `the camera cuts to ${target}`;
  }
  if (beat.kind === 'camera') {
    return /^(?:the\s+)?camera\b/i.test(description)
      ? description.replace(/^camera\b/i, 'the camera')
      : `the camera ${description}`;
  }
  return description;
}

function h3ClipVisualDescription(plan, scene, usesReference) {
  const dialogue = h3DialogueLines(scene, usesReference);
  const untimedDialogue = dialogue.filter((entry) => !entry.timeSeconds).map((entry) => entry.text);
  const events = [
    ...normalizeTimelineBeats(scene?.timelineBeats, scene?.durationSeconds).map((beat, index) => ({
      ...beat,
      sourceOrder: index,
      priority: beat.kind === 'cut' ? 0 : (beat.kind === 'action' ? 1 : 2),
      type: 'beat',
    })),
    ...dialogue.filter((entry) => entry.timeSeconds > 0).map((entry) => ({
      ...entry, priority: 3, type: 'dialogue',
    })),
  ].sort((left, right) => (left.timeSeconds - right.timeSeconds)
    || (left.priority - right.priority) || (left.sourceOrder - right.sourceOrder));
  const initialShot = usesReference
    ? [
      sentencePart(scene.shot, 600),
      '<Subject 1> is present in the scene',
      sentencePart(scene.description),
      sentencePart(scene.spatialComposition, 800),
      scene.camera ? `Camera movement: ${sentencePart(scene.camera, 600)}` : '',
      sentencePart(scene.continuity, 800),
    ]
    : [
      sentencePart(scene.shot, 600),
      sentencePart(scene.description),
      sentencePart(scene.spatialComposition, 800),
      scene.camera ? `Camera movement: ${sentencePart(scene.camera, 600)}` : '',
      sentencePart(scene.continuity, 800),
    ];
  const parts = [`[Shot 1] ${initialShot.filter(Boolean).join('. ')}.`];
  if (untimedDialogue.length) parts.push(untimedDialogue.join(' '));
  let shotNumber = 1;
  for (const event of events) {
    const timestamp = h3LocalTimestamp(event.timeSeconds);
    if (event.type === 'dialogue') {
      parts.push(`At ${timestamp}, ${event.text}`);
    } else if (event.kind === 'cut') {
      shotNumber += 1;
      parts.push(`[Shot ${shotNumber}] At ${timestamp}, ${h3TimedBeatText(event)}.`);
    } else {
      parts.push(`At ${timestamp}, ${h3TimedBeatText(event)}.`);
    }
  }
  parts.push(`Style: ${sentencePart(plan.visualStyle, 1200)}.`);
  return clean(parts.join(' '), '', 9000);
}

function buildH3ClipPrompt(plan, scene) {
  const usesReference = sceneUsesSubjectReference(plan, scene);
  const state = sceneReferenceState(plan, scene);
  const visualDescription = h3ClipVisualDescription(plan, scene, usesReference);
  const soundscape = clean(scene.audio, 'Natural environmental sound', 1200);
  const music = clean(scene.music, 'N/A', 600);
  if (!usesReference) return [
    `integrated_multimodal_description:\n${visualDescription}`,
    `overall_soundscape:\n${soundscape}`,
    `non_diegetic_music:\n${music}`,
  ].join('\n\n');

  const referenceRole = plan.subject.referenceType === 'place'
    ? 'recurring environment and spatial layout'
    : (plan.subject.referenceType === 'object' ? 'recurring object' : 'recurring character');
  return [
    `subject_definitions:\n<Subject 1> is the ${referenceRole} shown in <Picture 1>: ${plan.subject.description}. The visible state of <Subject 1> in this shot is ${state.description}.`,
    `summary:\n[reference generation] ${clean(scene.description, 'A single continuous shot', 1600)}`,
    'retention_analysis:\n<Subject 1>: fully_preserved wherever visible; its identity, state, proportions, colors, materials, and defining details match <Picture 1>.',
    `detailed_description:\n${visualDescription}`,
    `overall_soundscape:\n${soundscape}`,
    `non_diegetic_music:\n${music}`,
  ].join('\n\n');
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
  const referenceSpec = smartReferenceSpec(plan);
  const usedStateIds = new Set(plan.scenes
    .filter((scene) => sceneUsesSubjectReference(plan, scene))
    .map((scene) => sceneReferenceState(plan, scene).id));
  const stateStepIds = new Map();
  if (referenceNeeded) plan.subject.referenceStates
    .filter((state) => usedStateIds.has(state.id))
    .forEach((state, index) => {
      const referenceId = ids.referenceIds?.[index] || (index === 0 ? imageId : crypto.randomUUID());
      stateStepIds.set(state.id, referenceId);
      steps.push({
        id: referenceId,
        kind: 'reference',
        referenceState: { id: state.id, label: state.label, description: state.description },
        label: `Create ${state.label} reference`,
        status: 'pending',
        dependsOn: [],
        request: {
          route: '/api/generate', body: {
            mode: references.length ? 'edit' : 't2i',
            editEngine: references.length ? 'krea2ref' : undefined,
            editAspectOverride: references.length ? true : undefined,
            refImages: references.length ? references.map((reference) => reference.name) : undefined,
            krea2RefBoost: references.length ? 4 : undefined,
            prompt: `${plan.imagePrompt}. Depict the "${state.label}" state: ${state.description}. ${referenceSpec.prompt}`,
            width: referenceSpec.width, height: referenceSpec.height, batch: 1, enhance: false,
            steps: 8, cfg: 1, krea2Turbo: true, loras: [], regions: [], negativePrompt: '',
          },
        },
      });
    });
  plan.scenes.forEach((scene, index) => {
    const usesReference = referenceNeeded && sceneUsesSubjectReference(plan, scene);
    const referenceState = sceneReferenceState(plan, scene);
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
        referenceStateId: usesReference ? referenceState.id : '',
        referenceStateLabel: usesReference ? referenceState.label : '',
      },
      label: `Clip ${index + 1} · ${scene.title} (${scene.durationSeconds}s)`,
      status: 'pending',
      dependsOn: usesReference ? [stateStepIds.get(referenceState.id)] : [],
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
  SMART_MAX_DIALOGUE_LINES,
  SMART_MAX_TIMELINE_BEATS,
  SMART_MAX_CLIPS,
  SMART_MAX_REFERENCE_STATES,
  SMART_PLAN_SCHEMA,
  SMART_REFERENCE_TYPES,
  buildH3ClipPrompt,
  buildH3Prompt,
  compileSmartSteps,
  normalizeSmartPlan,
  normalizeSmartReferences,
  sceneReferenceState,
  sceneUsesSubjectReference,
  smartReferenceSpec,
  smartDimensions,
  smartPlanHash,
  smartPlanningPrompt,
};
