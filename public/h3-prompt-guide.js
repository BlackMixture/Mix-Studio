'use strict';

(function exposeH3PromptGuide(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.H3PromptGuide = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function h3PromptGuideFactory() {
  // Raw quoted prose is formatted only for verbs that unambiguously introduce
  // speech. Broader vocal verbs remain valid when an already-formatted H3
  // dialogue block uses them, but must not turn phrases such as “delivers a
  // package” or “the app responds” into spoken lines.
  const SPOKEN_VERB_SOURCE = [
    'says\\s+in\\s+(?:(?:an?\\s+)?off-screen\\s+)?voiceover',
    'calls\\s+out',
    'cries\\s+out',
    'narrates',
    'chants',
    'sings',
    'says',
    'asks',
    'replies',
    'answers',
    'whispers',
    'shouts',
    'yells',
    'murmurs',
    'mutters',
    'exclaims',
    'announces',
    'call\\s+out',
    'cry\\s+out',
    'narrate',
    'chant',
    'sing',
    'say',
    'ask',
    'reply',
    'answer',
    'whisper',
    'shout',
    'yell',
    'murmur',
    'mutter',
    'exclaim',
    'announce',
  ].join('|');
  const FORMATTED_SPOKEN_VERB_SOURCE = [
    SPOKEN_VERB_SOURCE,
    'continues?',
    'delivers?',
    'responds?',
    'speaks?',
    'utters?',
    'voices?',
  ].join('|');

  // These nouns describe surfaces that can contain exact visible copy. A line
  // such as `The sign says "OPEN"` must remain on-screen text, not dialogue.
  const DISPLAY_NOUNS = new Set([
    'banner', 'billboard', 'book', 'caption', 'card', 'computer', 'display',
    'document', 'door', 'label', 'letter', 'logo', 'lower third', 'marquee',
    'menu', 'monitor', 'mug', 'name tag', 'newspaper', 'note', 'page', 'phone',
    'placard', 'poster', 'screen', 'shirt', 'sign', 'storefront', 'subtitle',
    'terminal', 'text', 'title', 'title card', 'tv', 'wall', 'watch', 'word',
  ]);

  const FIELD_LABELS = new Set([
    'audio', 'dialogue', 'integrated multimodal description', 'music',
    'non diegetic music', 'overall soundscape', 'prompt', 'shot', 'sound',
    'soundscape', 'text', 'video', 'voice',
  ]);
  const BASE_PROMPT_FIELDS = Object.freeze([
    'integrated_multimodal_description',
    'overall_soundscape',
    'non_diegetic_music',
  ]);
  const REFERENCE_PROMPT_FIELDS = Object.freeze([
    'subject_definitions',
    'summary',
    'retention_analysis',
    'detailed_description',
    'overall_soundscape',
    'non_diegetic_music',
  ]);
  const H3_FPS = 24;
  const STYLE_TRANSFER_PRESETS = Object.freeze([
    Object.freeze({
      id: 'anime-2d',
      label: 'Anime 2D',
      hint: 'Drawn lines and cel shading',
      prompt: 'polished hand-drawn 2D anime with clean confident line art, stable cel shading, expressive but proportionally consistent faces, controlled highlights, and a cohesive cinematic color script',
    }),
    Object.freeze({
      id: 'live-action',
      label: 'Live action',
      hint: 'Cinematic and photoreal',
      prompt: 'cinematic photoreal live action with natural skin and material detail, physically plausible lighting, realistic depth, restrained film grain, and consistent production design',
    }),
    Object.freeze({
      id: 'feature-3d',
      label: 'Pixar-style 3D',
      hint: 'Polished feature animation',
      prompt: 'polished stylized 3D feature animation with appealing rounded character design, expressive readable faces, detailed materials, soft global illumination, cinematic depth, and high-end animated-film rendering',
    }),
    Object.freeze({
      id: 'cel-3d',
      label: 'Cel-shaded 3D',
      hint: 'Graphic 3D with inked edges',
      prompt: 'stylized cel-shaded 3D animation with stable inked contours, deliberate two-tone shadow shapes, crisp graphic highlights, dimensional camera movement, and cohesive game-cinematic rendering',
    }),
    Object.freeze({
      id: 'stop-motion',
      label: 'Stop motion',
      hint: 'Handmade miniature look',
      prompt: 'premium handcrafted stop-motion animation with tactile miniature sets, sculpted characters, visible material texture, practical lighting, subtle frame-by-frame motion character, and consistent scale',
    }),
    Object.freeze({
      id: 'graphic-novel',
      label: 'Graphic novel',
      hint: 'Bold ink and printed color',
      prompt: 'cinematic graphic-novel illustration with bold stable inks, dramatic shape-based shadows, controlled halftone texture, selective printed color, and consistent illustrated anatomy',
    }),
  ]);
  const H3_MIN_SECONDS = 5;
  const H3_MAX_SECONDS = 15;

  function h3EffectiveDurationSeconds(value) {
    const requested = Number(value);
    const bounded = Math.max(H3_MIN_SECONDS, Math.min(
      H3_MAX_SECONDS,
      Number.isFinite(requested) ? requested : H3_MIN_SECONDS,
    ));
    const rawFrames = Math.max(5, Math.round(bounded * H3_FPS));
    const snappedFrames = rawFrames + ((5 - (rawFrames % 17) + 17) % 17);
    return snappedFrames / H3_FPS;
  }

  function replacementTarget(value, kind) {
    const target = sourceText(value).replace(/[\r\n\t]+/g, ' ').replace(/"/g, "'").replace(/\s{2,}/g, ' ').trim().slice(0, 240);
    return target ? `the ${kind} identified as "${target}"` : `the target ${kind}`;
  }

  function buildReplacementPrompt(options = {}) {
    const kind = options.kind === 'character' ? 'character' : 'object';
    const target = replacementTarget(options.target, kind);
    const identity = kind === 'character'
      ? 'Their face, body proportions, hair, wardrobe, colours and distinguishing features 100% match <Picture 1>, kept stable and recognizable throughout.'
      : 'Its shape, proportion, material, colour, logos and surface markings 100% match <Picture 1>, kept legible and correctly oriented throughout.';
    const motion = kind === 'character'
      ? 'The replacement character inherits the full performance of the original character, frame by frame: same screen position, scale, pose, gaze, expression timing, gestures, movement path, speed, entry and exit timing. Whatever the original character did, the new character does identically. No new movement is introduced and none is removed.'
      : 'The replacement object inherits the full behaviour of the object it replaces, frame by frame: same screen position, same scale, same rotation, same motion path, same speed, same entry and exit timing. Whatever the original object did, the new object does identically. No new movement is introduced and none is removed.';
    const integration = kind === 'character'
      ? [
        'Body contact reads physically: hands, feet, clothing and supporting surfaces meet the replacement character\'s actual anatomy and silhouette; contact shadows land directly beneath them.',
        'Occlusion order is preserved: whatever passed in front of the original character passes in front of the new character, and whatever the original character covered stays covered.',
        'Hair, clothing, reflections and cast shadows are rebuilt for the replacement identity while keeping the same direction, softness and timing as the plate.',
      ].join('\n')
      : [
        'Contact reads physically: hands wrap the new silhouette, supporting surfaces meet its actual base, contact shadows land directly beneath it, and any grip conforms to its real geometry.',
        'Occlusion order is preserved: whatever passed in front of the original object passes in front of the new one, and whatever it covered stays covered.',
        'Reflections, refractions and cast shadows on nearby surfaces are rebuilt for the new geometry while keeping the same direction and softness as the plate.',
      ].join('\n');
    const physics = kind === 'character'
      ? 'Weight, balance, inertia, foot planting, hair movement and cloth response remain consistent with the character shown in <Picture 1>, while preserving the original performance and timing.'
      : 'Mass, inertia, swing and settle behaviour remain consistent with the material shown in <Picture 1>. Any fluid, spill, dust or particle interaction updates to the new geometry while obeying the same gravity and timing as the plate.';
    const lighting = kind === 'character'
      ? 'Key direction, intensity, falloff and white balance come from <Video 1>. Skin, hair and wardrobe catch the same key from the same side, sit at the same ambient level, and cast shadows matching the plate in length, direction and softness. Highlights appear only where the plate\'s light would place them.'
      : 'Key direction, intensity, falloff and white balance come from <Video 1>. The object catches the same key from the same side, sits at the same ambient level, and throws a shadow matching the existing shadows in length, direction and softness. Specular highlights appear only where the plate\'s key light would place them, reading the true surface finish from <Picture 1>.';
    const entity = kind === 'character' ? 'character' : 'object';

    return [
      'SCENE CONTEXT',
      `Replacement pass. In <Video 1>, ${target} is replaced by the ${entity} shown in <Picture 1>. Everything else in <Video 1> remains exactly as it is.`,
      '',
      'ACTIVE REFERENCES',
      '<Video 1>: the master plate. Camera path, framing, timing, cast, environment, lighting and every other element 100% match <Video 1>.',
      `<Picture 1>: identity of the replacement ${entity} only. ${identity} NO MASK.`,
      '',
      'MOTION INHERITANCE',
      motion,
      '',
      'INTEGRATION',
      integration,
      '',
      'OPTICS',
      `Shot size, FOV, depth of field, focus falloff and motion blur carry over from <Video 1> with no drift. The ${entity} sits at the same focal plane as the original.`,
      '',
      'CAMERA',
      'Camera behaviour, height, distance, movement and handheld character remain identical to <Video 1>.',
      '',
      'PHYSICS',
      physics,
      '',
      'LIGHTING',
      lighting,
      '',
      'STYLE',
      'Photoreal, fully integrated into the original plate: same grain structure, black level, tonal contrast and colour grade as <Video 1>.',
      '',
      'POSITIVE LOCKS',
      `- Only ${target} changes; every other element of <Video 1> stays untouched.`,
      `- The replacement ${entity} stays present, complete and correctly scaled in every frame the original appeared in.`,
      `- Identity from <Picture 1> holds steady across the whole clip, with no drift in ${kind === 'character' ? 'face, anatomy, wardrobe or colour' : 'shape, colour or markings'}.`,
      '- Edges blend seamlessly: matching noise, matching edge softness, no halo, no outline.',
      '- One continuous plate, cuts only where <Video 1> already cuts.',
    ].join('\n');
  }

  function buildStyleTransferPrompt(options = {}) {
    const requestedStyle = sourceText(options.style || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 500);
    const style = requestedStyle || STYLE_TRANSFER_PRESETS[0].prompt;
    const hasAudio = options.hasAudio === true;
    const hasStyleImage = options.hasStyleImage === true;
    const taskTypes = [
      'video editing',
      hasStyleImage ? 'reference generation' : '',
      hasAudio ? 'audio reuse' : '',
    ].filter(Boolean).join(' + ');
    const definitions = [
      '<Video 1> is the source video for the target video edit and defines the complete action, subject placement, camera path, cuts, framing, timing, lighting direction, and environment.',
    ];
    if (hasStyleImage) {
      definitions.push('<Subject 1> is the visual treatment shown in <Picture 1>; only its rendering language, shape design, surface treatment, color treatment, and highlight design are referenced, not its depicted subject, composition, text, or pose.');
    }
    if (hasAudio) definitions.push('<Audio 1> is the synchronized audio track of <Video 1> and is reused in the target video.');
    const retention = [
      '<Video 1> (complete visual timeline): partially_preserved - every subject, action, expression, object interaction, camera move, cut, composition, occlusion, and lighting cue is retained frame by frame, while only the source rendering is changed to the requested visual treatment.',
    ];
    if (hasStyleImage) retention.push('<Subject 1> (appears throughout): attribute_transfer - the rendering characteristics from <Picture 1> are transferred consistently to every visible element in <Video 1> without transferring the picture\'s subject identity or composition.');
    if (hasAudio) retention.push('<Audio 1>: fully_copy - <Audio 1> is reused 1:1 as the target video\'s complete synchronized audio track.');
    const audioSentence = hasAudio
      ? 'The synchronized dialogue, ambience, physical sounds, and music in <Audio 1> remain aligned to the same actions and cuts without replacement or retiming.'
      : 'Recreate synchronized ambience and physical sounds that follow the original actions and cuts in <Video 1>.';
    return [
      'subject_definitions:',
      ...definitions,
      '',
      'summary:',
      `[${taskTypes}] The target video is an edited version of <Video 1>. The complete source performance and shot structure are preserved while the visible image is re-rendered as ${hasStyleImage ? 'the visual treatment defined by <Subject 1> from <Picture 1>, supported by ' : ''}${style}.`,
      '',
      'retention_analysis:',
      ...retention,
      '',
      'detailed_description:',
      `The target video uses ${hasStyleImage ? 'the visual treatment defined by <Subject 1> from <Picture 1>, supported by ' : ''}${style}. The treatment fully re-renders each frame rather than applying a superficial filter. Identities, wardrobe, props, environments, spatial relationships, and readable object details remain recognizable while materials, edges, shading, and color are rebuilt in the requested style.`,
      `[Shot 1] Follow <Video 1> frame by frame from its first frame through its final frame. Preserve the exact performance, body mechanics, facial expressions, lip movement, object interactions, camera behavior, lens perspective, framing, focus changes, shot order, cut timing, motion direction, speed, and composition. Re-render every visible element consistently in the same production style across the entire clip. Do not add, remove, replace, or redesign people, objects, actions, backgrounds, or cuts. Keep silhouettes stable, prevent identity drift, preserve contact and occlusion order, and translate the source lighting into treatment-appropriate shadows and highlights without changing where the light comes from. ${audioSentence}`,
      '',
      'overall_soundscape:',
      hasAudio
        ? 'The copied ambience, dialogue, non-verbal voices, and physical action sounds from <Audio 1> continue unchanged and remain synchronized to the edited visuals.'
        : 'Recreated ambience and physical action sounds remain synchronized to the visible actions throughout the target video.',
      '',
      'non_diegetic_music:',
      hasAudio
        ? 'Any audience-only music present in <Audio 1> is directly reused without changes or retiming.'
        : 'N/A',
    ].join('\n');
  }
  const KNOWN_PROMPT_FIELDS = new Set([...BASE_PROMPT_FIELDS, ...REFERENCE_PROMPT_FIELDS]);
  const ALIGNMENT_LINE_RE = /^(?:For the target video, at 0\.00 seconds into the target video,\s*<Picture 1>|How the reference pictures align with the target video\s+—\s+(?:Picture 1|<Picture 1>))/;
  const OFFICIAL_ALIGNMENT_LINE_RE = /^(?:For the target video, at 0\.00 seconds into the target video, <Picture 1> \(from \[Shot 1\]\) is fully referenced\.|How the reference pictures align with the target video — (?:Picture 1 \(from Shot 1\) aligns with the 0\.00-second mark of the target video; Picture 2 \(from Shot \d+\) aligns with the \d+\.\d{2}-second mark of the target video\.|<Picture 1> \(from \[Shot \d+\]\) aligns with the \d+\.\d{2}-second mark of the target video\.))$/;

  const CONTEXT_PROPER_WORDS = new Set([
    'a', 'after', 'an', 'as', 'at', 'before', 'by', 'during', 'finally',
    'from', 'in', 'inside', 'meanwhile', 'near', 'next', 'on', 'outside',
    'the', 'then', 'under', 'when', 'while', 'with', 'without',
  ]);
  const ROLE_ACTION_SOURCE = [
    'enters?', 'faces?', 'glances?', 'grins?', 'holds?', 'laughs?', 'leans?',
    'leaves?', 'looks?', 'lowers?', 'moves?', 'nods?', 'pauses?', 'raises?',
    'floats?', 'runs?', 'sits?', 'smiles?', 'stands?', 'steps?', 'takes?', 'turns?',
    'walks?', 'waves?',
  ].join('|');

  function sourceText(value) {
    return value == null ? '' : String(value);
  }

  function normalizeLanguage(value) {
    const language = sourceText(value || 'English').trim();
    if (!language || !/^[A-Za-z][A-Za-z -]{0,31}$/.test(language)) return 'English';
    return language;
  }

  function canonicalSpokenVerb(value) {
    const verb = sourceText(value).replace(/\s+/g, ' ').trim().toLowerCase();
    if (/^says in (?:(?:an? )?off-screen )?voiceover$/.test(verb)) {
      return 'says in an off-screen voiceover';
    }
    return verb;
  }

  function isVoiceoverVerb(value) {
    return canonicalSpokenVerb(value) === 'says in an off-screen voiceover';
  }

  function normalizeSpeakerKey(value) {
    return sourceText(value)
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[^\p{L}\p{N}' -]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function wordCount(value) {
    const words = sourceText(value).trim().match(/[A-Za-z0-9][A-Za-z0-9'\u2019-]*/g);
    return words ? words.length : 0;
  }

  function containsDisplayNoun(value) {
    const normalized = normalizeSpeakerKey(value);
    if (!normalized) return false;
    for (const noun of DISPLAY_NOUNS) {
      if (new RegExp(`(?:^|\\s)${noun.replace(/ /g, '\\s+')}s?(?:$|\\s)`, 'i').test(normalized)) return true;
    }
    return false;
  }

  function trimSpan(text, start, end) {
    let nextStart = start;
    let nextEnd = end;
    while (nextStart < nextEnd && /\s/.test(text[nextStart])) nextStart += 1;
    while (nextEnd > nextStart && /[\s,]/.test(text[nextEnd - 1])) nextEnd -= 1;
    return { start: nextStart, end: nextEnd, text: text.slice(nextStart, nextEnd) };
  }

  function identityCandidates(text, span) {
    const clause = span.text;
    const candidates = [];
    const tokenRanges = [];
    const quoteRanges = [];
    const tokenRe = /<(?:Picture|Subject)\s+\d+>/gi;
    let match;

    while ((match = tokenRe.exec(clause))) {
      const candidate = {
        start: span.start + match.index,
        end: span.start + match.index + match[0].length,
        text: match[0],
        type: 'reference-token',
      };
      candidates.push(candidate);
      tokenRanges.push({ start: match.index, end: match.index + match[0].length });
    }

    const quoteRe = /"[^"\r\n]*"|\u201c[^\u201d\r\n]*\u201d/g;
    while ((match = quoteRe.exec(clause))) {
      quoteRanges.push({ start: match.index, end: match.index + match[0].length });
    }

    // JavaScript's \b boundary is ASCII-only, which can split names such as
    // Jos\u00e9 or Ren\u00e9e before their final letter. Capture a Unicode-aware
    // leading boundary separately so the candidate range still begins at the
    // speaker's first character.
    const properRe = /(?:^|[^\p{L}\p{N}_])(\p{Lu}[\p{L}\p{M}\p{N}'\u2019-]*(?:\s+\p{Lu}[\p{L}\p{M}\p{N}'\u2019-]*){0,3})(?![\p{L}\p{N}_])/gu;
    while ((match = properRe.exec(clause))) {
      const properOffset = match.index + match[0].length - match[1].length;
      const properEnd = properOffset + match[1].length;
      if (tokenRanges.some((range) => properOffset < range.end && properEnd > range.start)) continue;
      if (quoteRanges.some((range) => properOffset < range.end && properEnd > range.start)) continue;
      let nameText = match[1];
      let nameOffset = properOffset;
      const nameWords = nameText.split(/\s+/);
      while (nameWords.length && CONTEXT_PROPER_WORDS.has(nameWords[0].toLowerCase())) {
        nameOffset += nameWords[0].length + 1;
        nameWords.shift();
      }
      nameText = nameWords.join(' ');
      if (!nameText) continue;
      candidates.push({
        start: span.start + nameOffset,
        end: span.start + nameOffset + nameText.length,
        text: nameText,
        type: 'named-speaker',
      });
    }

    // Role phrases are accepted only at the start of the attribution clause or
    // after a clear comma/temporal boundary. This avoids mistaking an article
    // inside a visual description ("with a quiet voice") for a new speaker.
    const roleStartRe = /(?:^|,\s*|\b(?:then|next|meanwhile|finally|afterward|afterwards|subsequently)\s+)((?:the|a|an)\s+)/gi;
    while ((match = roleStartRe.exec(clause))) {
      const roleOffset = match.index + match[0].length - match[1].length;
      const tail = clause.slice(roleOffset);
      const action = tail.match(new RegExp(`\\s+(?:${ROLE_ACTION_SOURCE})\\b`, 'i'));
      let roleText = tail.slice(0, action && action.index != null ? action.index : tail.length)
        .replace(/,\s*(?:then|next)\s*$/i, '')
        .replace(/[\s,]+$/g, '');
      if (/["\u201c\u201d]/.test(roleText) || /\b(?:while|because|before|as soon as)\b/i.test(roleText)) continue;
      if (wordCount(roleText) < 2 || wordCount(roleText) > 12) continue;
      const roleStart = span.start + roleOffset;
      candidates.push({
        start: roleStart,
        end: roleStart + roleText.length,
        text: roleText,
        type: 'role-speaker',
      });
    }

    return candidates.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function lastSpeakerBoundary(text, beforeIndex) {
    const windowStart = Math.max(0, beforeIndex - 240);
    const windowText = text.slice(windowStart, beforeIndex);
    // A shot tag and a completed <d> block are strong boundaries in an
    // already-structured H3 prompt. Sentence punctuation is only a boundary
    // when followed by whitespace, so the decimal point in a timestamp is safe.
    const boundaryRe = /(?:^|[.!?](?:["\u201d']?)\s+|\n+|;\s+|\]\s*|<\/d>\s*)/gi;
    let boundaryEnd = 0;
    let match;
    while ((match = boundaryRe.exec(windowText))) {
      boundaryEnd = match.index + match[0].length;
      if (match[0].length === 0) boundaryRe.lastIndex += 1;
    }
    return windowStart + boundaryEnd;
  }

  const NON_SPEAKER_CORES = new Set([
    'app', 'application', 'audio', 'camera', 'display', 'frame', 'image',
    'line', 'music', 'package', 'scene', 'screen', 'shot', 'sign', 'sound',
    'text', 'video', 'voice',
  ]);

  function roleSpeakerCore(value) {
    const normalized = normalizeSpeakerKey(value)
      .replace(/^(?:the|a|an)\s+/, '')
      .split(/\b(?:with|who|wearing|holding|carrying)\b/, 1)[0]
      .trim();
    const words = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
    const core = words[words.length - 1] || '';
    return NON_SPEAKER_CORES.has(core) ? '' : core;
  }

  // Rich official prompts can place camera/action prose before the identity,
  // which is too long for the compact raw-dialogue parser. When that happens,
  // accept only a conservative role phrase that still appears before the ID;
  // an ID at the start of the clause or before the name remains invalid.
  function fallbackSpeakerBeforeId(text, idStart) {
    const raw = text.slice(lastSpeakerBoundary(text, idStart), idStart).trim();
    if (!raw) return { valid: false, core: '' };
    const reference = raw.match(/<(?:Picture|Subject)\s+\d+>\s*$/i);
    if (reference) return { valid: true, core: normalizeSpeakerKey(reference[0]) };

    const withRoles = [...raw.matchAll(/\b(?:the|a|an)\s+[\p{L}\p{N}'’\-]+(?:\s+[\p{L}\p{N}'’\-]+){0,8}\s+with\b/giu)];
    const withRole = withRoles[withRoles.length - 1];
    const trailingRole = raw.match(/\b(?:the|a|an)\s+[\p{L}\p{N}'’\-]+(?:\s+[\p{L}\p{N}'’\-]+){0,8}\s*$/iu);
    const role = withRole ? withRole[0].replace(/\s+with$/i, '') : trailingRole?.[0];
    const core = roleSpeakerCore(role || '');
    return { valid: !!core, core };
  }

  function speakerFromRange(text, rawStart, rawEnd) {
    const span = trimSpan(text, rawStart, rawEnd);
    if (!span.text) return { valid: false, reason: 'missing-speaker' };
    if (/\b[A-Z][A-Za-z0-9'\u2019-]*(?:\s+[A-Z][A-Za-z0-9'\u2019-]*)*\s+and\s+[A-Z][A-Za-z0-9'\u2019-]*\b/.test(span.text)) {
      return { valid: false, reason: 'compound-speaker' };
    }
    if (/<(?:Picture|Subject)\s+\d+>\s+and\s+<(?:Picture|Subject)\s+\d+>/i.test(span.text)) {
      return { valid: false, reason: 'compound-speaker' };
    }

    const candidates = identityCandidates(text, span);
    const identity = candidates[candidates.length - 1];
    if (!identity) return { valid: false, reason: 'unstable-speaker' };
    const label = identity.text;
    const key = normalizeSpeakerKey(label);
    const isReferenceToken = identity.type === 'reference-token';

    if (containsDisplayNoun(label)) return { valid: false, reason: 'display-text' };
    // A display object after the identity is usually the grammatical subject of
    // "says/reads" (Alice's shirt, <Picture 1> holds a sign that). Context that
    // occurs before the identity is safe and remains untouched.
    const trailingClause = text.slice(identity.end, span.end);
    if (containsDisplayNoun(trailingClause) && !/\b(?:and|then)\s*$/i.test(trailingClause)) {
      return { valid: false, reason: 'display-text' };
    }
    if (FIELD_LABELS.has(key)) return { valid: false, reason: 'field-label' };
    if (/^(?:audio|beat|camera|dialogue|scene|shot|sound|text|video)\s*\d*$/i.test(label) || /^S\d+$/i.test(label)) {
      return { valid: false, reason: 'field-label' };
    }
    if (!isReferenceToken && (label.length > 140 || wordCount(label) > 16 || /[:<>\[\]()]/.test(label))) {
      return { valid: false, reason: 'ambiguous-speaker' };
    }

    return {
      valid: true,
      start: identity.start,
      end: identity.end,
      clauseStart: span.start,
      clauseEnd: span.end,
      label,
      identity: label,
      key,
      type: identity.type,
    };
  }

  function extractSpeakerBefore(text, beforeIndex) {
    return speakerFromRange(text, lastSpeakerBoundary(text, beforeIndex), beforeIndex);
  }

  function protectedDialogueRanges(text) {
    const ranges = [];
    const re = /<d(?:\s[^>]*)?>[\s\S]*?<\/d>/gi;
    let match;
    while ((match = re.exec(text))) ranges.push({ start: match.index, end: match.index + match[0].length });
    return ranges;
  }

  function intersectsRange(start, end, ranges) {
    return ranges.some((range) => start < range.end && end > range.start);
  }

  function quotedSections(text) {
    const sections = [];
    const re = /"([^"\r\n]+)"|\u201c([^\u201d\r\n]+)\u201d/g;
    let match;
    while ((match = re.exec(text))) {
      sections.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[1] !== undefined ? match[1] : match[2],
      });
    }
    return sections;
  }

  function spokenVerbBefore(text, quoteStart) {
    const beforeStart = Math.max(0, quoteStart - 100);
    const before = text.slice(beforeStart, quoteStart);
    const re = new RegExp(`\\b(${SPOKEN_VERB_SOURCE})\\b\\s*(?:[:,]\\s*)?$`, 'i');
    const match = before.match(re);
    if (!match || match.index == null) return null;
    return {
      verb: canonicalSpokenVerb(match[1]),
      start: beforeStart + match.index,
      end: quoteStart,
    };
  }

  function spokenAttributionAfter(text, quoteEnd) {
    const after = text.slice(quoteEnd, Math.min(text.length, quoteEnd + 180));
    const re = new RegExp(`^\\s*,?\\s+([^.!?\\n"\\u201c\\u201d]{1,120}?)\\s+(${SPOKEN_VERB_SOURCE})\\b`, 'i');
    const match = after.match(re);
    if (!match || match.index == null) return null;
    const speakerOffset = match[0].indexOf(match[1]);
    const speakerStart = quoteEnd + speakerOffset;
    const verbOffset = match[0].lastIndexOf(match[2]);
    const verbStart = quoteEnd + verbOffset;
    const speaker = speakerFromRange(text, speakerStart, speakerStart + match[1].length);
    if (!speaker.valid) return {
      speaker,
      verb: match[2],
      verbStart,
      end: quoteEnd + match[0].length,
    };
    return {
      speaker,
      verb: canonicalSpokenVerb(match[2]),
      verbStart,
      end: quoteEnd + match[0].length,
    };
  }

  function colonSpeakerBefore(text, quoteStart) {
    const before = text.slice(Math.max(0, quoteStart - 180), quoteStart);
    const colon = before.match(/:\s*$/);
    if (!colon || colon.index == null) return null;
    const colonIndex = Math.max(0, quoteStart - 180) + colon.index;
    return { ...extractSpeakerBefore(text, colonIndex), colonIndex };
  }

  function isLikelyDisplayQuote(text, quote) {
    const beforeStart = Math.max(0, quote.start - 140);
    const before = text.slice(beforeStart, quote.start);
    const displayVerb = before.match(/\b(?:says|reads|displays|shows)\b\s*(?::\s*)?$/i);
    if (displayVerb && displayVerb.index != null) {
      const subject = extractSpeakerBefore(text, beforeStart + displayVerb.index);
      if (subject.reason === 'display-text' || (subject.valid && containsDisplayNoun(subject.label))) return true;
    }
    const colon = colonSpeakerBefore(text, quote.start);
    return Boolean(colon && colon.reason === 'display-text');
  }

  function collectUnformattedCandidates(text) {
    const protectedRanges = protectedDialogueRanges(text);
    const candidates = [];
    const displayQuotes = new Set();

    for (const quote of quotedSections(text)) {
      if (!quote.text.trim() || intersectsRange(quote.start, quote.end, protectedRanges)) continue;
      if (isLikelyDisplayQuote(text, quote)) displayQuotes.add(quote.start);

      const prefix = spokenVerbBefore(text, quote.start);
      if (prefix) {
        const speaker = extractSpeakerBefore(text, prefix.start);
        if (speaker.valid) {
          candidates.push({
            start: speaker.start,
            end: quote.end,
            quoteStart: quote.start,
            speaker: speaker.identity,
            speakerLabel: speaker.label,
            speakerEnd: speaker.end,
            speakerClauseStart: speaker.clauseStart,
            verbStart: prefix.start,
            speakerKey: speaker.key,
            verb: prefix.verb,
            text: quote.text,
            pattern: 'leading-attribution',
          });
          continue;
        }
        if (speaker.reason === 'display-text') displayQuotes.add(quote.start);
      }

      const suffix = spokenAttributionAfter(text, quote.end);
      if (suffix && suffix.speaker.valid) {
        candidates.push({
          start: quote.start,
          end: suffix.end,
          quoteStart: quote.start,
          speaker: suffix.speaker.identity,
          speakerLabel: suffix.speaker.label,
          speakerEnd: suffix.speaker.end,
          speakerClauseStart: suffix.speaker.clauseStart,
          verbStart: suffix.verbStart,
          speakerKey: suffix.speaker.key,
          verb: suffix.verb,
          text: quote.text,
          pattern: 'trailing-attribution',
        });
        continue;
      }
      if (suffix && suffix.speaker.reason === 'display-text') displayQuotes.add(quote.start);

      const colonSpeaker = colonSpeakerBefore(text, quote.start);
      if (colonSpeaker && colonSpeaker.valid) {
        candidates.push({
          start: colonSpeaker.start,
          end: quote.end,
          quoteStart: quote.start,
          speaker: colonSpeaker.identity,
          speakerLabel: colonSpeaker.label,
          speakerEnd: colonSpeaker.end,
          speakerClauseStart: colonSpeaker.clauseStart,
          verbStart: colonSpeaker.colonIndex,
          speakerKey: colonSpeaker.key,
          verb: 'says',
          text: quote.text,
          pattern: 'speaker-label',
        });
      } else if (colonSpeaker && colonSpeaker.reason === 'display-text') {
        displayQuotes.add(quote.start);
      }
    }

    candidates.sort((a, b) => a.start - b.start || a.end - b.end);
    const nonOverlapping = [];
    for (const candidate of candidates) {
      const previous = nonOverlapping[nonOverlapping.length - 1];
      if (!previous || candidate.start >= previous.end) nonOverlapping.push(candidate);
    }
    return { candidates: nonOverlapping, skippedDisplayTextCount: displayQuotes.size };
  }

  function existingDialogueEntries(text) {
    const entries = [];
    const re = /<d(?:\s[^>]*)?>\s*\[([^\]\r\n]+)\]([\s\S]*?)<\/d>/gi;
    let match;
    while ((match = re.exec(text))) {
      // H3's official examples often put rich camera, action, and delivery
      // prose between a speaker ID and the dialogue block. Keep the scan inside
      // the current sentence/line, but do not reject a valid line merely
      // because that prose is longer than a compact caption.
      const beforeStart = Math.max(0, match.index - 900);
      const before = text.slice(beforeStart, match.index);
      const attribution = before.match(new RegExp(
        `\\((S\\d+(?:\\s*,\\s*S\\d+)*)\\)([^.!?\\n<>]{0,640}?)\\b(${FORMATTED_SPOKEN_VERB_SOURCE})\\b([^.!?\\n<>]{0,240}?)\\s*[:,]\\s*$`,
        'i',
      ));
      let speaker = '';
      let speakerKey = '';
      let speakerType = '';
      let speakerCore = '';
      let hasSpeakerBeforeId = false;
      let speakerId = '';
      let verb = '';
      if (attribution && attribution.index != null) {
        const idStart = beforeStart + attribution.index;
        const extracted = extractSpeakerBefore(text, idStart);
        if (extracted.valid) {
          speaker = extracted.identity;
          speakerKey = extracted.key;
          speakerType = extracted.type;
          speakerCore = extracted.type === 'role-speaker' ? roleSpeakerCore(extracted.identity) : '';
          hasSpeakerBeforeId = true;
        } else {
          const fallback = fallbackSpeakerBeforeId(text, idStart);
          speakerCore = fallback.core;
          hasSpeakerBeforeId = fallback.valid;
        }
        speakerId = attribution[1].toUpperCase().replace(/\s+/g, '');
        verb = canonicalSpokenVerb(attribution[3]);
      }
      entries.push({
        speaker,
        speakerId,
        text: match[2].replace(/^\s/, ''),
        language: match[1].trim(),
        verb,
        formatted: true,
        start: match.index,
        end: match.index + match[0].length,
        speakerKey,
        speakerType,
        speakerCore,
        hasSpeakerBeforeId,
      });
    }
    return entries;
  }

  function assignedCandidates(text, candidates, existingEntries) {
    const speakerIds = new Map();
    let highestId = 0;
    const idRe = /\bS(\d+)\b/gi;
    let idMatch;
    while ((idMatch = idRe.exec(text))) highestId = Math.max(highestId, Number(idMatch[1]) || 0);

    for (const entry of existingEntries) {
      if (entry.speakerKey && entry.speakerId) speakerIds.set(entry.speakerKey, entry.speakerId);
    }

    return candidates.map((candidate) => {
      let speakerId = speakerIds.get(candidate.speakerKey);
      if (!speakerId) {
        highestId += 1;
        speakerId = `S${highestId}`;
        speakerIds.set(candidate.speakerKey, speakerId);
      }
      return { ...candidate, speakerId };
    });
  }

  function analyzePrompt(value) {
    const prompt = sourceText(value);
    const existingEntries = existingDialogueEntries(prompt);
    const collected = collectUnformattedCandidates(prompt);
    const candidates = assignedCandidates(prompt, collected.candidates, existingEntries);
    const referenceMatches = prompt.match(/<(?:Picture|Video|Audio)\s+\d+>/gi) || [];
    const speakerIds = new Set();
    for (const entry of existingEntries) {
      if (entry.speakerId) entry.speakerId.split(',').forEach((speakerId) => speakerIds.add(speakerId));
    }
    for (const entry of candidates) speakerIds.add(entry.speakerId);

    return {
      dialogueCount: existingEntries.length + candidates.length,
      formattedDialogueCount: existingEntries.length,
      unformattedDialogueCount: candidates.length,
      speakerCount: speakerIds.size,
      referenceCount: referenceMatches.length,
      skippedDisplayTextCount: collected.skippedDisplayTextCount,
      hasOfficialStructure: /(?:^|\n)\s*integrated_multimodal_description\s*:/i.test(prompt)
        && /(?:^|\n)\s*overall_soundscape\s*:/i.test(prompt)
        && /(?:^|\n)\s*non_diegetic_music\s*:/i.test(prompt),
      entries: [
        ...existingEntries.map(({ speakerKey, start, end, ...entry }) => entry),
        ...candidates.map(({
          speakerKey,
          speakerLabel,
          speakerEnd,
          speakerClauseStart,
          verbStart,
          quoteStart,
          start,
          end,
          pattern,
          ...entry
        }) => ({
          ...entry,
          formatted: false,
          pattern,
        })),
      ],
    };
  }

  function expectedTokenList(value) {
    let values;
    if (Array.isArray(value)) values = value;
    else if (value && typeof value !== 'string' && typeof value[Symbol.iterator] === 'function') values = [...value];
    else if (typeof value === 'string') values = value.match(/<[^<>]+>/g) || [value];
    else values = [];
    return [...new Set(values.map((token) => sourceText(token).trim()).filter(Boolean))];
  }

  function fieldSections(prompt, requiredFields) {
    const lines = prompt.replace(/\r\n?/g, '\n').split('\n');
    const markers = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const match = lines[lineIndex].match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
      if (!match) continue;
      const canonical = match[1].toLowerCase();
      if (!KNOWN_PROMPT_FIELDS.has(canonical)) continue;
      markers.push({
        lineIndex,
        label: match[1],
        canonical,
        inlineBody: match[2],
      });
    }

    const bodies = new Map();
    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index];
      const nextLine = index + 1 < markers.length ? markers[index + 1].lineIndex : lines.length;
      const body = [marker.inlineBody, ...lines.slice(marker.lineIndex + 1, nextLine)].join('\n').trim();
      if (!bodies.has(marker.canonical)) bodies.set(marker.canonical, body);
    }

    const required = new Set(requiredFields);
    const presentFields = [];
    for (const marker of markers) {
      if (required.has(marker.canonical) && !presentFields.includes(marker.canonical)) {
        presentFields.push(marker.canonical);
      }
    }
    return { lines, markers, bodies, presentFields };
  }

  function withoutLeadingAlignment(value) {
    const lines = sourceText(value).replace(/\r\n?/g, '\n').split('\n');
    let firstContent = lines.findIndex((line) => line.trim());
    while (firstContent >= 0 && OFFICIAL_ALIGNMENT_LINE_RE.test(lines[firstContent].trim())) {
      lines.splice(firstContent, 1);
      while (firstContent < lines.length && !lines[firstContent].trim()) lines.splice(firstContent, 1);
      firstContent = lines.findIndex((line) => line.trim());
    }
    return lines.join('\n').trim();
  }

  // Add only the parts of the official H3 contract that can be determined
  // without a language model. This intentionally does not invent sound,
  // music, reference relationships, retention labels, or dialogue language.
  // Users can fill those fields themselves or use Prompt Enhance for an AI
  // rewrite; the separate Format dialogue action remains deterministic too.
  function structurePrompt(value, context = {}) {
    const before = sourceText(value).trim();
    const mode = String(context.mode || 'frames').toLowerCase() === 'reference' ? 'reference' : 'frames';
    const referenceMode = mode === 'reference';
    const requiredFields = [...(referenceMode ? REFERENCE_PROMPT_FIELDS : BASE_PROMPT_FIELDS)];
    const descriptionField = referenceMode ? 'detailed_description' : 'integrated_multimodal_description';
    if (!before) {
      return {
        prompt: before,
        changed: false,
        wrapped: false,
        alignmentChanged: false,
        before: auditStructure(before, { ...context, mode }),
        audit: auditStructure(before, { ...context, mode }),
      };
    }

    const beforeAudit = auditStructure(before, { ...context, mode });
    const beforeWithoutAlignment = withoutLeadingAlignment(before);
    const knownSections = fieldSections(beforeWithoutAlignment, requiredFields);
    let prompt = beforeWithoutAlignment;
    let wrapped = false;
    if (!knownSections.markers.length) {
      const description = /\[Shot 1\]/.test(beforeWithoutAlignment)
        ? beforeWithoutAlignment
        : `[Shot 1] ${beforeWithoutAlignment}`;
      prompt = requiredFields.map((field) => (
        field === descriptionField ? `${field}:\n${description}` : `${field}:`
      )).join('\n\n');
      wrapped = true;
    }

    const withoutAlignment = withoutLeadingAlignment(prompt);
    const alignmentAudit = auditStructure(withoutAlignment, { ...context, mode });
    const expectedAlignment = alignmentAudit.alignment.expected;
    prompt = expectedAlignment ? `${expectedAlignment}\n\n${withoutAlignment}` : withoutAlignment;
    const alignedBefore = expectedAlignment
      ? `${expectedAlignment}\n\n${beforeWithoutAlignment}`
      : beforeWithoutAlignment;
    const alignmentChanged = alignedBefore !== before;
    const audit = auditStructure(prompt, { ...context, mode });
    return {
      prompt,
      changed: prompt !== before,
      wrapped,
      alignmentChanged,
      before: beforeAudit,
      audit,
    };
  }

  function auditStructure(value, context = {}) {
    const prompt = sourceText(value).trim();
    const mode = String(context.mode || 'frames').toLowerCase() === 'reference' ? 'reference' : 'frames';
    const referenceMode = mode === 'reference';
    const requiredFields = [...(referenceMode ? REFERENCE_PROMPT_FIELDS : BASE_PROMPT_FIELDS)];
    const descriptionField = referenceMode ? 'detailed_description' : 'integrated_multimodal_description';
    const duration = h3EffectiveDurationSeconds(context.seconds);
    const hasFirstFrame = !!context.hasFirstFrame;
    const hasLastFrame = !!context.hasLastFrame;
    const expectedReferenceTokens = expectedTokenList(context.expectedReferenceTokens);
    const allowedReferenceTokens = expectedTokenList(context.allowedReferenceTokens);
    const issues = [];
    const issueKeys = new Set();
    const addIssue = (code, message, details = {}) => {
      const key = `${code}:${details.field || ''}:${details.shot || ''}:${details.token || ''}`;
      if (issueKeys.has(key)) return;
      issueKeys.add(key);
      issues.push({ code, message, ...details });
    };

    const sections = fieldSections(prompt, requiredFields);
    const { lines, markers, bodies, presentFields } = sections;
    if (!prompt) addIssue('empty-prompt', 'The prompt is empty.');

    const missingFields = requiredFields.filter((field) => !presentFields.includes(field));
    for (const field of missingFields) {
      addIssue('missing-field', `Missing required field: ${field}.`, { field });
    }

    const emptyFields = [];
    const unexpectedFields = [];
    for (const marker of markers) {
      if (marker.label !== marker.canonical) {
        addIssue('field-spelling', `Use the exact field label: ${marker.canonical}.`, { field: marker.canonical });
      }
      if (!requiredFields.includes(marker.canonical)) {
        if (!unexpectedFields.includes(marker.canonical)) unexpectedFields.push(marker.canonical);
        addIssue('unexpected-field', `Remove the ${marker.canonical} field for this mode.`, { field: marker.canonical });
      }
      const duplicates = markers.filter((other) => other.canonical === marker.canonical);
      if (duplicates.length > 1) {
        addIssue('duplicate-field', `Keep only one ${marker.canonical} field.`, { field: marker.canonical });
      }
    }
    for (const field of requiredFields) {
      if (!presentFields.includes(field)) continue;
      if (!bodies.get(field)) {
        emptyFields.push(field);
        addIssue('empty-field', `${field} needs content.`, { field });
      }
    }

    if (!missingFields.length) {
      const firstLineByField = new Map();
      for (const marker of markers) {
        if (!firstLineByField.has(marker.canonical)) firstLineByField.set(marker.canonical, marker.lineIndex);
      }
      const ordered = requiredFields.every((field, index) => (
        index === 0 || firstLineByField.get(requiredFields[index - 1]) < firstLineByField.get(field)
      ));
      if (!ordered) {
        addIssue('field-order', `Use this field order: ${requiredFields.join(', ')}.`);
      }
    }

    const description = bodies.get(descriptionField) || '';
    const shots = [];
    const shotRe = /\[Shot (\d+)\]/g;
    let shotMatch;
    while ((shotMatch = shotRe.exec(description))) {
      shots.push({
        number: Number(shotMatch[1]),
        marker: shotMatch[0],
        start: shotMatch.index,
        end: shotMatch.index + shotMatch[0].length,
        timestamp: null,
        timeSeconds: null,
      });
    }

    if (description && !shots.some((shot) => shot.number === 1)) {
      addIssue('missing-shot-1', `${descriptionField} must include [Shot 1].`, { field: descriptionField, shot: 1 });
    }
    if (description && !referenceMode && !/^\[Shot 1\]/.test(description.trimStart())) {
      addIssue(
        'shot-1-position',
        'integrated_multimodal_description must begin with [Shot 1].',
        { field: descriptionField, shot: 1 },
      );
    }

    let previousTimestamp = 0;
    for (let index = 0; index < shots.length; index += 1) {
      const shot = shots[index];
      const expectedNumber = index + 1;
      if (shot.number !== expectedNumber) {
        addIssue(
          'shot-sequence',
          `Expected [Shot ${expectedNumber}], found [Shot ${shot.number}].`,
          { shot: shot.number, expectedShot: expectedNumber },
        );
      }
      const nextStart = index + 1 < shots.length ? shots[index + 1].start : description.length;
      const afterMarker = description.slice(shot.end, nextStart).trimStart();
      if (shot.number === 1) {
        if (/^At\b/i.test(afterMarker)) {
          addIssue('shot-1-timestamp', '[Shot 1] must not have a timestamp.', { shot: 1 });
        }
        continue;
      }

      const timestamp = afterMarker.match(/^At (\d{2}):([0-5]\d)\.(\d{3})(?=[,\s]|$)/);
      if (!timestamp) {
        addIssue(
          'shot-timestamp-format',
          `[Shot ${shot.number}] must begin with At MM:SS.mmm.`,
          { shot: shot.number },
        );
        continue;
      }
      shot.timestamp = timestamp[0].slice(3);
      shot.timeSeconds = (Number(timestamp[1]) * 60) + Number(timestamp[2]) + (Number(timestamp[3]) / 1000);
      if (shot.timeSeconds <= previousTimestamp) {
        addIssue(
          'shot-time-order',
          `[Shot ${shot.number}] must be later than the previous shot.`,
          { shot: shot.number, timestamp: shot.timestamp },
        );
      }
      if (shot.timeSeconds <= 0 || shot.timeSeconds >= duration) {
        addIssue(
          'shot-time-range',
          `[Shot ${shot.number}] must start after 0.000 and before ${duration.toFixed(2)} seconds.`,
          { shot: shot.number, timestamp: shot.timestamp },
        );
      }
      previousTimestamp = Math.max(previousTimestamp, shot.timeSeconds);
    }

    const finalShot = shots.length ? shots[shots.length - 1].number : null;
    const finalShotForAlignment = finalShot || 1;
    const formattedDuration = duration.toFixed(2);
    let expectedAlignment = null;
    if (!referenceMode && hasFirstFrame && hasLastFrame) {
      expectedAlignment = `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot ${finalShotForAlignment}) aligns with the ${formattedDuration}-second mark of the target video.`;
    } else if (!referenceMode && hasFirstFrame) {
      expectedAlignment = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
    } else if (!referenceMode && hasLastFrame) {
      expectedAlignment = `How the reference pictures align with the target video — <Picture 1> (from [Shot ${finalShotForAlignment}]) aligns with the ${formattedDuration}-second mark of the target video.`;
    }

    const nonemptyLines = lines.map((line) => line.trim()).filter(Boolean);
    const firstLine = nonemptyLines[0] || '';
    const alignmentLines = nonemptyLines.filter((line) => ALIGNMENT_LINE_RE.test(line));
    if (expectedAlignment) {
      if (firstLine !== expectedAlignment) {
        addIssue('alignment-line', 'Use the exact frame-alignment line for this mode.', { expected: expectedAlignment });
      }
    } else if (alignmentLines.length) {
      addIssue('unexpected-alignment', 'Remove the frame-alignment line for this mode.');
    }

    const firstFieldPattern = new RegExp(`^${requiredFields[0]}\\s*:`, 'i');
    const firstContentAfterAlignment = ALIGNMENT_LINE_RE.test(firstLine)
      ? nonemptyLines[1] || ''
      : firstLine;
    if (firstContentAfterAlignment && !firstFieldPattern.test(firstContentAfterAlignment)) {
      addIssue('leading-content', `Begin the structured prompt with ${requiredFields[0]}.`, { field: requiredFields[0] });
    }

    const actualReferenceTokens = [...new Set(prompt.match(/<(?:Picture|Video|Audio)\s+\d+>/g) || [])];
    const missingReferenceTokens = referenceMode
      ? expectedReferenceTokens.filter((token) => !prompt.includes(token))
      : [];
    const referenceTokenAllowlist = allowedReferenceTokens.length
      ? allowedReferenceTokens
      : expectedReferenceTokens;
    const unexpectedReferenceTokens = referenceMode && referenceTokenAllowlist.length
      ? actualReferenceTokens.filter((token) => !referenceTokenAllowlist.includes(token))
      : [];
    for (const token of missingReferenceTokens) {
      addIssue('missing-reference-token', `Preserve reference token ${token}.`, { token });
    }
    for (const token of unexpectedReferenceTokens) {
      addIssue('unexpected-reference-token', `Remove invented reference token ${token}.`, { token });
    }

    const dialogueAudit = analyzePrompt(description);
    if (dialogueAudit.unformattedDialogueCount > 0) {
      addIssue(
        'missing-dialogue-format',
        'Format every clearly attributed spoken line with a stable speaker ID and <d>[Language] ...</d>.',
      );
    }
    const identityToSpeakerId = new Map();
    const speakerIdToStrongIdentity = new Map();
    const roleCoreToSpeakerId = new Map();
    const speakerIdToRoleCore = new Map();
    const establishedSpeakerIds = new Set();
    for (const entry of dialogueAudit.entries.filter((candidate) => candidate.formatted === true)) {
      const speakerId = String(entry.speakerId || '').replace(/\s+/g, '').toUpperCase();
      const validSpeakerId = /^S\d+(?:,S\d+)*$/.test(speakerId);
      if (!validSpeakerId || entry.hasSpeakerBeforeId !== true) {
        addIssue(
          'dialogue-speaker-id',
          'Write each vocal line as Speaker identity (S1) says: <d>[Language] exact words</d>.',
        );
      }
      const language = String(entry.language || '').trim();
      if (!language || /^(?:language|lang(?:uage)?\s*(?:name|code)?|unknown|n\/?a|none)$/i.test(language)) {
        addIssue('dialogue-language', 'Replace the placeholder dialogue language with the actual language name.');
      }
      if (!validSpeakerId) continue;
      const ids = speakerId.split(',');
      if (ids.length > 1) {
        if (ids.some((id) => !establishedSpeakerIds.has(id))) {
          addIssue('compound-speaker-id', 'Use a compound speaker ID only after each individual speaker ID is established.');
        }
        continue;
      }
      const identity = normalizeSpeakerKey(entry.speaker);
      const roleCore = normalizeSpeakerKey(entry.speakerCore
        || (entry.speakerType === 'role-speaker' ? roleSpeakerCore(entry.speaker) : ''));
      if (identity) {
        const previousId = identityToSpeakerId.get(identity);
        const strongIdentity = entry.speakerType === 'named-speaker'
          || entry.speakerType === 'reference-token';
        const previousStrongIdentity = strongIdentity
          ? speakerIdToStrongIdentity.get(ids[0])
          : '';
        if ((previousId && previousId !== ids[0])
          || (previousStrongIdentity && previousStrongIdentity !== identity)) {
          addIssue('speaker-id-instability', 'Keep one stable speaker ID for each vocal identity throughout the prompt.');
        } else {
          identityToSpeakerId.set(identity, ids[0]);
          if (strongIdentity) speakerIdToStrongIdentity.set(ids[0], identity);
        }
      }
      if (roleCore) {
        const previousRoleId = roleCoreToSpeakerId.get(roleCore);
        const previousRoleCore = speakerIdToRoleCore.get(ids[0]);
        if ((previousRoleId && previousRoleId !== ids[0])
          || (previousRoleCore && previousRoleCore !== roleCore)) {
          addIssue('speaker-id-instability', 'Keep one stable speaker ID for each vocal identity throughout the prompt.');
        } else {
          roleCoreToSpeakerId.set(roleCore, ids[0]);
          speakerIdToRoleCore.set(ids[0], roleCore);
        }
      }
      // Natural prompts often shorten a description in later shots (for
      // example, "the quiet young woman" becomes "the woman"). Exact phrase
      // comparison cannot prove that two labels are different characters, so
      // only enforce identity -> ID conflicts that we can establish safely.
      establishedSpeakerIds.add(ids[0]);
    }

    const alignment = {
      required: !!expectedAlignment,
      expected: expectedAlignment,
      actual: alignmentLines[0] || null,
      valid: expectedAlignment ? firstLine === expectedAlignment : alignmentLines.length === 0,
    };

    return {
      ready: issues.length === 0,
      mode,
      referenceMode,
      duration,
      issues,
      issueCodes: issues.map((issue) => issue.code),
      requiredFields,
      presentFields,
      missingFields,
      emptyFields,
      unexpectedFields,
      descriptionField,
      shots: shots.map(({ start, end, ...shot }) => shot),
      finalShot,
      alignment,
      expectedReferenceTokens,
      allowedReferenceTokens,
      presentReferenceTokens: actualReferenceTokens,
      missingReferenceTokens,
      unexpectedReferenceTokens,
    };
  }

  function formatDialogue(value, options = {}) {
    const prompt = sourceText(value);
    const language = normalizeLanguage(options && options.language);
    const existingEntries = existingDialogueEntries(prompt);
    const collected = collectUnformattedCandidates(prompt);
    const candidates = assignedCandidates(prompt, collected.candidates, existingEntries);
    let formatted = prompt;

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const entry = candidates[index];
      const voiceover = isVoiceoverVerb(entry.verb);
      let replacementEnd = entry.end;
      if (voiceover && /[.!?]/.test(formatted[replacementEnd] || '')) replacementEnd += 1;
      const lipSyncGuard = voiceover
        ? ' If this speaker also appears on screen, their lips remain completely closed.'
        : '';
      let attributedSpeaker;
      if (entry.pattern === 'trailing-attribution') {
        const clauseStart = entry.speakerClauseStart;
        attributedSpeaker = `${formatted.slice(clauseStart, entry.speakerEnd)} (${entry.speakerId})${formatted.slice(entry.speakerEnd, entry.verbStart)}`;
      } else {
        const bridge = formatted.slice(entry.speakerEnd, entry.verbStart);
        attributedSpeaker = `${formatted.slice(entry.start, entry.speakerEnd)} (${entry.speakerId})${bridge || ' '}`;
      }
      const replacement = `${attributedSpeaker}${entry.verb}: <d>[${language}] ${entry.text}</d>${lipSyncGuard}`;
      formatted = `${formatted.slice(0, entry.start)}${replacement}${formatted.slice(replacementEnd)}`;
    }

    return {
      prompt: formatted,
      changed: formatted !== prompt,
      replacements: candidates.length,
      entries: candidates.map((entry) => ({
        speaker: entry.speaker,
        speakerId: entry.speakerId,
        text: entry.text,
        verb: entry.verb,
        pattern: entry.pattern,
      })),
      before: analyzePrompt(prompt),
      after: analyzePrompt(formatted),
    };
  }

  return Object.freeze({
    analyzePrompt,
    auditStructure,
    buildReplacementPrompt,
    buildStyleTransferPrompt,
    styleTransferPresets: STYLE_TRANSFER_PRESETS,
    formatDialogue,
    h3EffectiveDurationSeconds,
    structurePrompt,
  });
});
