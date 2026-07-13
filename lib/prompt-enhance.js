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

module.exports = {
  CREATIVE_RESOLUTION_INSTRUCTION,
  REGIONAL_PROMPT_INSTRUCTION,
  ENHANCE_TAIL,
  cleanGeneratedPrompt,
  promptPlaceholder,
  promptEnhanceParts,
  regionPromptEnhanceParts,
};
