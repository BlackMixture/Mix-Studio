'use strict';

const { h3EffectiveDurationSeconds, h3LongContextSegments, H3_FPS } = require('./video-workflows');

const CREATIVE_RESOLUTION_INSTRUCTION = `
Creative-brief handling (this instruction takes priority over any general rule against adding details):
- Interpret the user's intent, not just their exact wording. The input may be a direct scene description, or it may be a conversational request, command, question, theme, emotion, metaphor, or story idea.
- If the input already describes a concrete visual scene, preserve its subjects, actions, relationships, medium, and important details. Expand or polish it without changing the idea.
- If the input is abstract or asks you to invent an image, act as the creative director. Choose one specific, visually compelling scenario that communicates the idea immediately. Invent the subjects, setting, action, expressions, atmosphere, and symbolic details needed to make the concept visible. Make decisive choices instead of asking questions or listing alternatives.
- Never merely repeat or lightly paraphrase an abstract brief. The result must show your visual answer to the idea as a fully imagined scene.
- Translate emotions and abstract concepts into observable visual evidence: body language, interactions, environment, light, weather, color, scale, and meaningful objects. Prefer a coherent moment that could actually be photographed, illustrated, painted, or rendered.
- The final text is sent directly to Krea 2. Remove conversational command language such as "make an image of", "create", "show me", "I want", or "what would ... look like". Do not mention the user, the request, prompt-writing, or your creative choices.
- Write only the final image prompt: one cohesive paragraph with concrete visual language, a clear subject and moment, composition, camera or viewpoint where useful, lighting, atmosphere, palette, texture, and medium. Do not include analysis, alternatives, headings, or instructions to the image model.

Examples of the transformation:
- "cinematic shot of a man running in a gym" remains that same scene and is enriched with grounded cinematic detail.
- "make an image of the happiest day on earth" becomes one original, specific scene whose people, actions, expressions, setting, light, and atmosphere visibly embody overwhelming joy; the words "make an image" do not appear in the result.
- "what would loneliness look like in a crowded city?" becomes one concrete city scene with a clearly isolated subject and visual contrast; it does not answer the question conversationally.`;

const REGIONAL_PROMPT_INSTRUCTION = `
Regional-prompt handling (this instruction takes priority over whole-scene prompt rules):
- Rewrite only the selected region description into a concise, concrete visual caption for that box.
- Preserve the user's subject, count, identity, action, pose, clothing, materials, colors, and relationships. Add useful visible detail without changing the idea.
- Use the global scene only as context for compatible lighting, atmosphere, palette, and medium. Do not repeat the whole composition, camera framing, background, or unrelated subjects.
- Do not invent placement or directional wording; the region box controls position.
- Write one compact phrase or sentence, under 60 words, containing only details that belong inside this region.
- Output only the finished region prompt, without headings, analysis, alternatives, or instructions to the image model.`;

// This sentinel is also shared by motion- and image-recreation helpers, so
// keep its wording neutral even though the creative instructions above are
// specifically for the Krea 2 text-to-image enhancer.
const ENHANCE_TAIL = '\n\nReturn exactly one <final_prompt> XML element containing the finished prompt. The element must contain the actual prompt, never instructions or placeholder wording. Output nothing after the closing tag.';

const VIDEO_MOTION_INSTRUCTION = `Look at the provided image. Write a motion prompt for an image-to-video model: one short paragraph (under 70 words) describing how this exact scene should come alive - subject movement, secondary motion, camera movement (only if it helps the shot), and ambient sound. Use present-progressive verbs. Do not re-describe static appearance; focus on plausible motion that fits the scene.`;

const H3_PROMPT_CRAFT_INSTRUCTION = `Follow the official MiniMax H3 audiovisual prompt format exactly.

Output structure:
- Apart from a required image-alignment line for a keyframe mode, begin directly with exactly these three fields in this order and spelling: integrated_multimodal_description, overall_soundscape, non_diegetic_music. Put one blank line between fields. Do not add an intent sentence, title, Markdown fence, notes, or any other field.
- integrated_multimodal_description must begin with [Shot 1]. Describe the visual style and initial composition, then all visible action, reactions, camera behavior, speakers, dialogue, singing, and synchronized diegetic sound chronologically.
- Do not timestamp [Shot 1]. If a real cut adds new information, number later shots sequentially and begin each with a strictly increasing in-duration cut time in this form: [Shot 2] At 00:03.500, the camera cuts to... Prefer camera motion over a cut for only a small distance or angle change.
- Write camera motion as natural English action. Use the correct motion type (Zoom In/Out, Push In/Pull Out, Pan Left/Right, Truck Left/Right, Tilt Up/Down, Pedestal Up/Down, Arc Shot, Tracking Shot, Static Shot, Shake Slightly/Strongly, POV, or Roll Clockwise/Counterclockwise). Add amplitude or speed only when meaningful.

Speech and visible text:
- Assign stable IDs (S1), (S2), and so on only to people who speak, sing, or make an off-screen human voice. Keep each ID stable across shots; use a compound ID such as (S1,S2) when established speakers vocalize together. Establish enough visual and vocal identity at a speaker's first appearance.
- Format user-provided spoken words as <d>[Language] exact spoken content</d>. Keep the speaker identity, ID, action, and delivery outside <d>. Inside <d>, include only the language tag and the user's exact words and punctuation. Never translate, paraphrase, correct, extend, or invent dialogue, lyrics, narration, or voiceover. A scene that implies conversation but supplies no words remains nonverbal.
- Treat quoted text as speech only when the user's context identifies a speaker or vocal action such as says, asks, replies, whispers, shouts, sings, narrates, or voiceover. Keep text on a sign, label, banner, subtitle, screen, or other visible surface in English double quotation marks, preserving it verbatim. If a quote is ambiguous, do not guess that it is speech.
- For voiceover use the exact phrase says in an off-screen voiceover, and immediately after its <d> block state that the corresponding on-screen character's lips remain completely closed.
- If the same supplied line crosses a cut, put <scenetrans> at both connecting points and explicitly state that its audio continues across the cut. Use <cutoff> only when supplied speech is truncated by the end of the clip.

Audio fields:
- overall_soundscape is one continuous English paragraph of 1-4 sentences containing only ambience, physical action sounds, and nonverbal human sounds across the video. Do not repeat dialogue, singing, or diegetic music there. Use N/A only when the user explicitly requests complete silence throughout.
- non_diegetic_music is 1-3 English sentences describing only audience-only background music through instrumentation, speed, rhythm, and dynamic changes. Do not use abstract mood labels or explain the score's purpose. Put music audible to characters in integrated_multimodal_description instead. Use N/A when there is no non-diegetic score.

Keep the sequence physically achievable within the requested duration and preserve subject identity, wardrobe, setting, screen direction, object state, reference tokens, and exact user-authored text throughout.`;

const H3_REFERENCE_PROMPT_CRAFT_INSTRUCTION = `Follow the official MiniMax H3 full-reference rewrite format exactly.

Output structure:
- Write exactly these six sections in this order and spelling: subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music. Put each label on its own line with a colon and put one blank line between sections. Add no title, Markdown fence, image-alignment line, notes, or other section.
- Write all six sections in English. Preserve the original language only inside <d> dialogue or lyrics and in text visibly present in the scene.

Reference analysis:
- In subject_definitions, define every referenced unit that must be tracked on its own line. Preserve every supplied <Picture N>, <Video N>, and <Audio N> token exactly; never omit, renumber, duplicate, or invent one. Create stable <Subject N> labels in order for reusable visible people, animals, objects, environments, clothing, styles, actions, or effects derived from those assets. Cite a picture or video inside its subject definition when the asset only supplies that subject; define the asset separately only when it is itself a frame, shot-planning, editing, continuation, or whole-video anchor.
- Reserve <Video N> for a whole-video edit, continuation, camera/cut/rhythm structure, or temporal source. An ordinary reference video does not automatically create an <Audio N>. Number video and audio labels independently.
- Define <Audio N> by its actual copy/reference role. If it maps to a speaking subject, reuse that subject and the target video's stable speaker ID, for example <Audio 1> is the voice-timbre reference for <Subject 1> (S1).
- summary is one short English paragraph beginning with one square-bracketed combination of the applicable fixed task types: keyframe completion, reference generation, video editing, video continuation, audio reuse, audio reference. Join multiple types with +, for example [reference generation + audio reference]; do not repeat them or introduce new labels. For a source-video edit, begin the text after the prefix with: The target video is an edited version of <Video 1>.
- retention_analysis has one line per defined label. For visual labels use only fully_preserved, partially_preserved, attribute_transfer, or weak_reference. For audio labels use only fully_copy, partially_copy, reference, or weak_reference. State where each label applies and remain consistent with its definition; do not put speaker IDs in retention_analysis.

Timeline and speech:
- detailed_description begins with one or two English sentences establishing the target style, then [Shot 1] with no timestamp. Make it explicit rather than a plot summary: establish composition, subject appearance and position, environment, lighting, actions and state changes, natural camera movement, current sound, and exactly where references take effect. For ordinary reference-generation tasks, aim for 350-500 English words when the scene has enough information.
- Number later shots sequentially and begin each real cut with a strictly increasing in-duration timestamp such as [Shot 2] At 00:03.500, the camera cuts to... Insert each stable reference label naturally at first appearance and wherever its role applies.
- Assign stable (S1), (S2), and subsequent IDs in the order of actual vocal events, only to concrete vocal sources. A speaking referenced subject uses <Subject N> (Sx). Use a compound ID for established speakers vocalizing together. A verbal cue that exists only inside copied background music or a complete soundtrack uses <Audio N> and does not create a speaker.
- Put supplied spoken words and lyrics in <d>[Language] exact content</d>. Keep identity, labels, IDs, action, and delivery outside <d>. Preserve the user's exact words, punctuation, and original language; never translate, paraphrase, extend, or invent dialogue, lyrics, narration, or voiceover. If referenced speech is unintelligible, write [unclear] instead of guessing. Referencing only voice timbre or delivery never imports the reference's words.
- Treat a quote as speech only when its context identifies a vocal source or action. Keep text on a sign, label, banner, subtitle, screen, or other visible surface in English double quotation marks verbatim. If a quote is ambiguous, do not guess that it is speech.
- For voiceover use the exact phrase says in an off-screen voiceover and immediately state that the corresponding on-screen character's lips remain completely closed. Use <scenetrans> at both connecting points for supplied speech crossing a cut and <cutoff> only when it is truncated by the video ending.

Audio sections:
- overall_soundscape is a continuous English paragraph summarizing ambience, physical action sounds, and nonverbal human sounds without repeating dialogue, singing, or diegetic music. State any applicable <Audio N> copy/reference relationship here. Use N/A only for explicitly requested total silence.
- non_diegetic_music describes only audience-only music through instrumentation, tempo, rhythm, dynamics, and any applicable <Audio N> relationship. Put character-audible music and complete dialogue or lyrics in detailed_description. Use N/A when there is no audience-only score.

Keep every relationship, label, identity, authored word, and event consistent across all six sections and physically achievable within the requested duration.`;

const H3_MOTION_INSTRUCTION = `Use the provided image as MiniMax H3's exact first frame at 0.00 seconds. Anchor [Shot 1] to its visible style, subject identity, clothing, colors, composition, setting, objects, and spatial relationships, then describe a continuous, plausible path forward. Do not merely redescribe the still image and do not drift from it.`;

const H3_FIRST_LAST_MOTION_INSTRUCTION = `Use the provided visual context as MiniMax H3's two exact boundary frames. Picture 1 is the first frame at 0.00 seconds and Picture 2 is the last frame at the effective duration. Anchor [Shot 1] to Picture 1, preserve identity and scene continuity, and describe a continuous, observable path that converges exactly on Picture 2. Do not treat the combined visual context as one frame or one composition.`;

const VIDEO_PROMPT_REVISION_INSTRUCTION = `Revise the current video-generation prompt from the user's plain-language direction.

- Treat the change request as authoritative. Rewrite the complete prompt into one coherent final sequence; never append the request or leave old and new versions side by side.
- Preserve every useful detail the user did not ask to change, including subject identity, action, continuity, setting, timing, camera direction, lighting, atmosphere, audio, and exact quoted dialogue.
- Reconcile dependent details when a requested change conflicts with an existing action, shot, sound, or continuity note.
- If visual context is attached, use it to ground the opening frame while the written request and current prompt remain authoritative.
- Return only the finished generation prompt, without analysis, headings about the revision, alternatives, or instructions to the user.`;

const VIDEO_PROMPT_ENHANCE_INSTRUCTION = `Rewrite the user's idea into one production-ready prompt for a video-generation model.

- Preserve the user's subject, identity, setting, visual style, story intent, important actions, and exact quoted dialogue.
- Describe a chronological sequence that is physically achievable within the requested duration, including clear subject movement, useful secondary motion, purposeful camera behavior, atmosphere, and synchronized sound.
- If a source image is attached, keep its visible subject, opening composition, setting, and identity faithful while describing only motion that can plausibly grow from that frame.
- Prefer one coherent shot unless the idea clearly benefits from a small number of motivated cuts. Do not overstuff the available duration.
- Return only the finished video prompt without analysis, alternatives, headings, or prompt-writing commentary.`;

const H3_PROMPT_ENHANCE_INSTRUCTION = `Refactor the user's idea into a practical MiniMax H3 audiovisual timeline without changing its intent.

- Preserve the user's subjects, identities, relationships, setting, visual style, story intent, actions, reference tokens, supplied sounds, and exact authored text. You may add compatible visual, motion, ambient, and nonverbal sound detail, but never invent spoken words, lyrics, narration, or voiceover.
- Build a readable beginning, development, and ending within the effective duration. Prefer one coherent shot unless a motivated cut is needed; do not overstuff the clip.
- Convert each clearly attributed vocal line in this exact order: Maya (S1) says: <d>[English] We’re live.</d> (or <Subject 1> (S1) says: ... in reference mode). The speaker name or identity must come before its ID; never write (S1) Maya. Preserve the user's exact words, punctuation, and original language; never translate or silently correct them. Do not convert quoted on-screen text into speech.
- Return only the finished prompt in the required H3 field structure. Do not explain the rewrite or output alternatives.`;

function h3PromptDurationSeconds(seconds, options = {}) {
  if (options.longContext === true) {
    return h3LongContextSegments(seconds)
      .reduce((total, segment) => total + segment.keepFrames, 0) / H3_FPS;
  }
  return h3EffectiveDurationSeconds(seconds);
}

function h3TimelineGuidance(seconds, options = {}) {
  const duration = h3PromptDurationSeconds(seconds, options);
  const formatted = duration.toFixed(2);
  return `Effective video duration: ${formatted} seconds. Keep every described action and sound inside that time. [Shot 1] has no timestamp. Any later shot must use a sequential number and a strictly increasing cut timestamp in the official MM:SS.mmm form, for example [Shot 2] At 00:03.500, that is greater than 0.000 and less than ${formatted} seconds. Use only as many shots as the idea needs; prefer a continuous shot when cuts add no new information.`;
}

function h3PromptModeGuidance(options = {}) {
  const duration = h3PromptDurationSeconds(options.seconds, options);
  const formatted = duration.toFixed(2);
  const mode = String(options.mode || '').trim().toLowerCase();
  const hasFirstImage = options.hasFirstImage === undefined
    ? !!options.hasImage
    : !!options.hasFirstImage;
  const hasLastImage = !!(options.hasLastImage || options.hasEndImage);

  if (mode === 'reference') {
    return `Full-reference mode: use the six-section reference contract and no separate keyframe-alignment instruction. Preserve every <Picture n>, <Video n>, and <Audio n> reference token exactly, including its number and capitalization. Never omit, renumber, duplicate, or invent a reference token. Keep the meaning of every reference and generated <Subject N> label stable across all sections.`;
  }
  if (hasFirstImage && hasLastImage) {
    return `First-and-last-frame mode: the first line of the finished prompt must be exactly "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the ${formatted}-second mark of the target video." Replace N with the actual final shot number (use 1 for a single shot), then add one blank line before integrated_multimodal_description. Generally use one continuous shot and describe the observable interpolation path from Picture 1 to Picture 2; reach Picture 2 exactly at ${formatted} seconds.`;
  }
  if (hasFirstImage) {
    return `First-frame mode: the first line of the finished prompt must be exactly "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced." Then add one blank line before integrated_multimodal_description. Begin from <Picture 1> exactly and develop the action forward while preserving its visual anchors.`;
  }
  if (hasLastImage) {
    return `Last-frame mode: the first line of the finished prompt must be exactly "How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the ${formatted}-second mark of the target video." Replace N with the actual final shot number (use 1 for a single shot), then add one blank line before integrated_multimodal_description. Infer a plausible preceding state and make the action, camera, objects, and composition converge on <Picture 1> exactly at ${formatted} seconds.`;
  }
  return 'Text-to-video mode: do not add an image-alignment instruction. Begin the finished prompt directly with integrated_multimodal_description.';
}

function promptPlaceholder(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/[<>{}\[\]_*`'".:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return true;
  return /^(?:the )?final prompt(?: paragraph| text)?$/.test(normalized)
    || /^(?:write|insert|place|put|add)(?: the| your| a)? (?:actual |finished |completed )?prompt(?: here)?$/.test(normalized)
    || /^(?:your |the )?(?:actual |finished |completed )?prompt(?: goes)? here$/.test(normalized);
}

function cleanGeneratedPrompt(raw, fallback = '') {
  if (!raw) return fallback;
  let text = String(raw).trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, ' ').replace(/<\/?think>/gi, ' ').trim();
  const tagged = text.match(/<final_prompt>\s*([\s\S]*?)\s*(?:<\/final_prompt>|$)/i);
  if (tagged && tagged[1].trim().length >= 10) {
    text = tagged[1].trim();
  } else {
    const hasBaseH3Structure = /(?:^|\n)\s*integrated_multimodal_description\s*:/i.test(text)
      && /(?:^|\n)\s*overall_soundscape\s*:/i.test(text)
      && /(?:^|\n)\s*non_diegetic_music\s*:/i.test(text);
    const hasReferenceH3Structure = /(?:^|\n)\s*subject_definitions\s*:/i.test(text)
      && /(?:^|\n)\s*detailed_description\s*:/i.test(text)
      && /(?:^|\n)\s*overall_soundscape\s*:/i.test(text)
      && /(?:^|\n)\s*non_diegetic_music\s*:/i.test(text);
    // Official H3 prompts intentionally put blank lines between fields. The
    // generic Qwen cleanup historically selected the final paragraph from
    // unwrapped prose, which would reduce a valid H3 prompt to its music field.
    if (!hasBaseH3Structure && !hasReferenceH3Structure) {
      const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
      if (paragraphs.length > 1) {
        const last = paragraphs[paragraphs.length - 1];
        if (last.length >= 40) text = last;
      }
    }
  }
  text = text.replace(/^(?:the\s+)?(?:final|expanded|enhanced|refined)?\s*prompt(?:\s+paragraph)?\s*[:\-]\s*/i, '');
  text = text.replace(/\*\*/g, '').replace(/^["'`]+/, '').replace(/["'`]+$/, '').trim();
  return text.length >= 10 && !promptPlaceholder(text) ? text : fallback;
}

function baseEnhanceInstruction(systemPrompt) {
  return String(systemPrompt || '')
    .trim()
    .replace(/\s*User(?:'s)? Input:\s*$/i, '');
}

function promptEnhanceParts(systemPrompt, userPrompt) {
  // The legacy/default setting ended with this hand-off label. Remove it
  // before appending the newer instruction block so the model cannot mistake
  // the creative-director rules for part of the user's request.
  const baseInstruction = baseEnhanceInstruction(systemPrompt);
  return {
    instruction: `${baseInstruction}\n\n${CREATIVE_RESOLUTION_INSTRUCTION.trim()}\n\nUser input follows between tags:`.trim(),
    userInput: `<user_input>\n${String(userPrompt || '').trim()}\n</user_input>${ENHANCE_TAIL}`,
  };
}

function regionPromptEnhanceParts(systemPrompt, globalPrompt, regionPrompt, options = {}) {
  const baseInstruction = baseEnhanceInstruction(systemPrompt);
  const referenceInstruction = options.hasReference
    ? '\n- A reference image is attached. Use it only for the selected subject’s visible appearance or identity while preserving the region text intent.'
    : '';
  return {
    instruction: `${baseInstruction}\n\n${REGIONAL_PROMPT_INSTRUCTION.trim()}${referenceInstruction}\n\nScene context and selected-region input follow between tags:`.trim(),
    userInput: `<global_scene_context>\n${String(globalPrompt || '').trim()}\n</global_scene_context>\n<region_input>\n${String(regionPrompt || '').trim()}\n</region_input>${ENHANCE_TAIL}`,
  };
}

function motionPromptEnhanceParts(userPrompt, options = {}) {
  const engine = String(options.engine || '').trim().toLowerCase();
  const hasLastImage = !!(options.hasEndImage || options.hasLastFrame);
  const duration = engine === 'h3'
    ? h3PromptDurationSeconds(options.seconds, options)
    : Math.max(5, Math.min(15, Number(options.seconds) || 5));
  const initialIdea = String(userPrompt || '').trim();
  const instruction = engine === 'h3'
    ? `${hasLastImage ? H3_FIRST_LAST_MOTION_INSTRUCTION : H3_MOTION_INSTRUCTION}\n\n${H3_PROMPT_ENHANCE_INSTRUCTION}\n\n${H3_PROMPT_CRAFT_INSTRUCTION}\n\n${h3TimelineGuidance(duration, options)}\n\n${h3PromptModeGuidance({
      seconds: duration,
      hasFirstImage: true,
      hasEndImage: hasLastImage,
      longContext: options.longContext === true,
    })}`
    : VIDEO_MOTION_INSTRUCTION;
  const userInput = initialIdea
    ? `\n\nThe user already provided this motion idea. Preserve its intent and use the image to make it more specific and visually grounded:\n<user_motion_idea>\n${initialIdea}\n</user_motion_idea>${ENHANCE_TAIL}`
    : ENHANCE_TAIL;
  return { instruction, userInput };
}

function h3PromptEnhanceParts(userPrompt, options = {}) {
  const prompt = String(userPrompt || '').trim();
  const referenceMode = String(options.mode || '').trim().toLowerCase() === 'reference';
  const hasFirstImage = options.hasFirstImage === undefined
    ? !!options.hasImage
    : !!options.hasFirstImage;
  const hasLastImage = !!(options.hasLastImage || options.hasEndImage);
  const hasVisualContext = !!options.hasImage;
  const sourceNote = referenceMode
    ? '\nThe attached reference assets are identified by the tokens in the user prompt. Derive only the relationships and reusable subjects supported by those assets and the written intent.'
    : hasFirstImage && hasLastImage
      ? (hasVisualContext
        ? '\nThe generation has exact first- and last-frame anchors, and visual context is attached in Picture order. Picture 1 is the exact opening and Picture 2 is the exact ending; preserve their identities and compositions while describing the continuous path between them.'
        : '\nThe generation has exact first- and last-frame anchors. Keep the prompt compatible with both anchors while describing the continuous path between them.')
      : hasFirstImage
        ? (hasVisualContext
          ? '\nAn attached first-frame image is the exact visual opening. Preserve its identity, composition, setting, and object relationships while developing forward.'
          : '\nThe generation has an exact first-frame anchor. Keep the sequence compatible with that opening frame while developing forward.')
        : hasLastImage
          ? (hasVisualContext
            ? '\nAn attached last-frame image is the exact visual ending. Infer a compatible earlier state and converge on its identity, composition, setting, and object relationships.'
            : '\nThe generation has an exact last-frame anchor. Infer a compatible earlier state and converge on that ending frame.')
          : '';
  const craftInstruction = referenceMode
    ? H3_REFERENCE_PROMPT_CRAFT_INSTRUCTION
    : H3_PROMPT_CRAFT_INSTRUCTION;
  return {
    instruction: `${H3_PROMPT_ENHANCE_INSTRUCTION}${sourceNote}\n\n${craftInstruction}\n\n${h3TimelineGuidance(options.seconds, options)}\n\n${h3PromptModeGuidance(options)}\n\nThe user prompt follows between tags:`,
    userInput: `<user_video_prompt>\n${prompt}\n</user_video_prompt>${ENHANCE_TAIL}`,
  };
}

function videoPromptEnhanceParts(userPrompt, options = {}) {
  if (String(options.engine || '').trim().toLowerCase() === 'h3') {
    return h3PromptEnhanceParts(userPrompt, options);
  }
  const duration = Math.max(1, Math.min(60, Number(options.seconds) || 5));
  const sourceNote = options.hasImage
    ? '\nA source image is attached as the exact visual starting point.'
    : '\nNo source image is attached; make the written idea visually complete on its own.';
  return {
    instruction: `${VIDEO_PROMPT_ENHANCE_INSTRUCTION}${sourceNote}\n\nTarget duration: ${duration} seconds.\n\nThe user prompt follows between tags:`,
    userInput: `<user_video_prompt>\n${String(userPrompt || '').trim()}\n</user_video_prompt>${ENHANCE_TAIL}`,
  };
}

function videoPromptRevisionParts(currentPrompt, changeRequest, options = {}) {
  const request = String(changeRequest || '').trim();
  const engine = String(options.engine || '').trim().toLowerCase();
  const prompt = String(currentPrompt || '').trim();
  const referenceMode = String(options.mode || '').trim().toLowerCase() === 'reference';
  const hasFirstImage = options.hasFirstImage === undefined
    ? !!options.hasImage
    : !!options.hasFirstImage;
  const hasLastImage = !!(options.hasLastImage || options.hasEndImage);
  const hasVisualContext = !!options.hasImage;
  const sourceNote = referenceMode
    ? '\nAttached H3 reference assets are identified by tokens in the prompt; preserve their established meanings while applying the written change.'
    : hasFirstImage && hasLastImage
      ? `\nExact first- and last-frame anchors remain in effect${hasVisualContext ? ', with visual context attached in Picture order (Picture 1 first, Picture 2 last)' : ''}; the written change request controls the path between them.`
      : hasFirstImage
        ? `\nAn exact first-frame anchor remains in effect${hasVisualContext ? ' and is attached as visual context' : ''}; the written change request takes priority.`
        : hasLastImage
          ? `\nAn exact last-frame anchor remains in effect${hasVisualContext ? ' and is attached as visual context' : ''}; the written change request controls the path that converges on it.`
          : '';
  let instruction = `${VIDEO_PROMPT_REVISION_INSTRUCTION}${sourceNote}`;
  if (engine === 'h3') {
    const craftInstruction = referenceMode
      ? H3_REFERENCE_PROMPT_CRAFT_INSTRUCTION
      : H3_PROMPT_CRAFT_INSTRUCTION;
    instruction += `\n\n${H3_PROMPT_ENHANCE_INSTRUCTION}\n\n${craftInstruction}\n\n${h3TimelineGuidance(options.seconds, options)}\n\n${h3PromptModeGuidance(options)}`;
  } else {
    instruction += '\n\nKeep the result concise enough for one video clip. Describe chronological subject motion, useful camera behavior, secondary motion, and synchronized audio in concrete language.';
  }
  return {
    instruction: `${instruction}\n\nThe current prompt and change request follow between tags:`,
    userInput: `<current_prompt>\n${prompt || '(none - build the video prompt from the change request)'}\n</current_prompt>\n<change_request>\n${request}\n</change_request>`,
  };
}

module.exports = {
  CREATIVE_RESOLUTION_INSTRUCTION,
  REGIONAL_PROMPT_INSTRUCTION,
  ENHANCE_TAIL,
  VIDEO_MOTION_INSTRUCTION,
  H3_PROMPT_CRAFT_INSTRUCTION,
  H3_REFERENCE_PROMPT_CRAFT_INSTRUCTION,
  H3_MOTION_INSTRUCTION,
  H3_FIRST_LAST_MOTION_INSTRUCTION,
  H3_PROMPT_ENHANCE_INSTRUCTION,
  VIDEO_PROMPT_REVISION_INSTRUCTION,
  VIDEO_PROMPT_ENHANCE_INSTRUCTION,
  cleanGeneratedPrompt,
  h3TimelineGuidance,
  h3PromptDurationSeconds,
  h3PromptModeGuidance,
  h3PromptEnhanceParts,
  promptPlaceholder,
  promptEnhanceParts,
  regionPromptEnhanceParts,
  motionPromptEnhanceParts,
  videoPromptEnhanceParts,
  videoPromptRevisionParts,
};
