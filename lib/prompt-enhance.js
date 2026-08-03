'use strict';

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

const H3_PROMPT_CRAFT_INSTRUCTION = `Write a production-ready prompt block for MiniMax H3 video generation.

- Make the sequence chronological and physically achievable within the requested duration. Preserve subject identity, wardrobe, setting, screen direction, and object continuity across every beat.
- Open with one concise intent sentence, then use timestamped storyboard beats when the action benefits from more than one beat. Each beat should name the shot or camera angle, the subject action, important secondary motion, and the transition when there is a cut.
- Use camera language deliberately: framing, angle, lens feel, and movement must support the action instead of competing with it. Do not stack incompatible camera moves in one beat.
- Finish with an Audio line covering native stereo audio: ambience, synchronized sound effects, music, and any supplied dialogue. Preserve quoted dialogue exactly. When the scene clearly involves speaking, conversation, performance, or narration and would feel incomplete without words, add one or two brief, natural quoted lines with an identified speaker and lip-sync direction; otherwise do not force dialogue.
- Prefer a coherent continuous shot when cuts add no value. When cuts do help, make each shot visually distinct and use clean, motivated transitions.
- Avoid vague hype, repeated appearance inventories, impossible action density, subtitles, logos, watermarks, or explanatory prompt-writing commentary. Return only the finished H3 prompt block.`;

const H3_MOTION_INSTRUCTION = `Look at the provided first-frame image and write a MiniMax H3 image-to-video prompt. Keep the visible subject, identity, setting, composition, and opening pose faithful to the frame. Use the image as the exact first moment, then describe only plausible motion and sound that can grow from it.

${H3_PROMPT_CRAFT_INSTRUCTION}`;

const VIDEO_PROMPT_REVISION_INSTRUCTION = `Revise the current video-generation prompt from the user's plain-language direction.

- Treat the change request as authoritative. Rewrite the complete prompt into one coherent final sequence; never append the request or leave old and new versions side by side.
- Preserve every useful detail the user did not ask to change, including subject identity, action, continuity, setting, timing, camera direction, lighting, atmosphere, audio, and exact quoted dialogue.
- Reconcile dependent details when a requested change conflicts with an existing action, shot, sound, or continuity note.
- If visual context is attached, use it to ground the opening frame while the written request and current prompt remain authoritative.
- Return only the finished generation prompt, without analysis, headings about the revision, alternatives, or instructions to the user.`;

const H3_PROMPT_ENHANCE_INSTRUCTION = `Expand the user's idea into the strongest practical MiniMax H3 prompt for the requested clip.

- Preserve the user's subjects, identity, setting, story intent, important actions, visual style, reference tags, and quoted dialogue. Do not replace their concept with a different one.
- Fill in missing motion, shot progression, camera direction, environmental response, and synchronized sound with decisive, concrete choices.
- Build a readable beginning, development, and ending within the available seconds. Use timestamped shots and cuts when they improve the idea; keep a continuous shot when it is stronger.
- Dialogue is optional. Add it only when the scene clearly calls for someone to speak, converse, perform, present, or narrate. Keep invented dialogue brief, natural, and achievable within the shot, and identify who says each quoted line. Never add speech to a scene that works better silently.
- Do not pad the prompt with generic cinematic adjectives or explain what you changed.`;

function h3TimelineGuidance(seconds) {
  const duration = Math.max(5, Math.min(15, Number(seconds) || 5));
  if (duration < 8) {
    return `Duration plan for ${duration} seconds: favor one continuous shot with 2-3 chronological motion beats for a single action. If the concept is a montage, trailer, or clearly contains several distinct actions, instead use 3-4 very short timestamped shots with decisive angles and clean cuts landing on action or musical beats.`;
  }
  if (duration < 12) {
    return `Duration plan for ${duration} seconds: use 2-4 timestamped storyboard beats. You may use up to three distinct camera angles and two motivated cuts; leave enough time for each action to read clearly.`;
  }
  return `Duration plan for ${duration} seconds: use 3-5 timestamped storyboard beats. You may use up to four distinct camera angles and three motivated cuts, with continuity and audio transitions across the full sequence.`;
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
    const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    if (paragraphs.length > 1) {
      const last = paragraphs[paragraphs.length - 1];
      if (last.length >= 40) text = last;
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
  const duration = Math.max(5, Math.min(15, Number(options.seconds) || 5));
  const initialIdea = String(userPrompt || '').trim();
  const instruction = engine === 'h3'
    ? `${H3_MOTION_INSTRUCTION}\n\n${h3TimelineGuidance(duration)}`
    : VIDEO_MOTION_INSTRUCTION;
  const userInput = initialIdea
    ? `\n\nThe user already provided this motion idea. Preserve its intent and use the image to make it more specific and visually grounded:\n<user_motion_idea>\n${initialIdea}\n</user_motion_idea>${ENHANCE_TAIL}`
    : ENHANCE_TAIL;
  return { instruction, userInput };
}

function h3PromptEnhanceParts(userPrompt, options = {}) {
  const prompt = String(userPrompt || '').trim();
  const sourceNote = options.hasImage
    ? '\nA visual reference is attached. Keep its visible identity, opening composition, and setting grounded while following the written prompt.'
    : '';
  const referenceNote = options.mode === 'reference'
    ? '\nPreserve every <Picture n>, <Video n>, and <Audio n> reference token exactly. Never renumber, omit, or invent reference tokens.'
    : '';
  return {
    instruction: `${H3_PROMPT_ENHANCE_INSTRUCTION}${sourceNote}\n\n${H3_PROMPT_CRAFT_INSTRUCTION}\n\n${h3TimelineGuidance(options.seconds)}${referenceNote}\n\nThe user prompt follows between tags:`,
    userInput: `<user_video_prompt>\n${prompt}\n</user_video_prompt>${ENHANCE_TAIL}`,
  };
}

function videoPromptRevisionParts(currentPrompt, changeRequest, options = {}) {
  const prompt = String(currentPrompt || '').trim();
  const request = String(changeRequest || '').trim();
  const engine = String(options.engine || '').trim().toLowerCase();
  const sourceNote = options.hasImage
    ? '\nA source image is attached as visual context for the opening frame; the written change request takes priority.'
    : '';
  let instruction = `${VIDEO_PROMPT_REVISION_INSTRUCTION}${sourceNote}`;
  if (engine === 'h3') {
    const referenceNote = options.mode === 'reference'
      ? '\nPreserve every <Picture n>, <Video n>, and <Audio n> reference token exactly unless the change request explicitly removes that reference. Never renumber or invent reference tokens.'
      : '';
    instruction += `\n\n${H3_PROMPT_CRAFT_INSTRUCTION}\n\n${h3TimelineGuidance(options.seconds)}${referenceNote}`;
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
  H3_MOTION_INSTRUCTION,
  H3_PROMPT_ENHANCE_INSTRUCTION,
  VIDEO_PROMPT_REVISION_INSTRUCTION,
  cleanGeneratedPrompt,
  h3TimelineGuidance,
  h3PromptEnhanceParts,
  promptPlaceholder,
  promptEnhanceParts,
  regionPromptEnhanceParts,
  motionPromptEnhanceParts,
  videoPromptRevisionParts,
};
