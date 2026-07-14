'use strict';

const IMAGE_RECREATION_INSTRUCTION = `Look at the provided image and write one concise, reusable text-to-image prompt that would help recreate it faithfully.

Describe the visible subject, composition, pose, camera angle, lens feel, lighting, color palette, background, materials, textures, mood, and artistic medium. Preserve what is actually visible; do not invent new main objects or change the scene. If there is readable text, quote it exactly. Prioritize defining details over exhaustive inventories and repeated adjectives. Keep it about 100-160 words, using concrete visual language rather than analysis. Return a single paragraph only.`;

const IMAGE_PROMPT_REVISION_INSTRUCTION = `You are revising a text-to-image prompt from a plain-language creative direction.

- Treat the change request as authoritative. Rewrite the complete prompt so it describes one coherent final image; never append the request or leave old and new versions side by side.
- Preserve every useful detail the user did not ask to change: subject count, action, composition, pose, camera, setting, lighting, atmosphere, medium, and style.
- Reconcile dependent details when necessary. If the requested subject, identity, presentation, era, material, or palette conflicts with existing face, hair, pronoun, wardrobe, accessory, anatomy, lighting, or color details, update or remove only the conflicting details.
- Do not infer unrelated changes from gender, race, age, or identity. Preserve wardrobe and presentation unless the request changes them or they are explicitly incompatible with the requested result.
- If the request asks for an image that is merely inspired by the original, retain its high-level visual language and composition while creating distinct subject details.
- If a source image is attached, use it to understand the original visual language. The written change request and revised prompt override conflicting details in that image.
- Prefer 80-160 words. Remove redundant inventories and repeated adjectives. Use one cohesive paragraph of concrete visual language.
- Return only the finished generation prompt. Do not explain the edit, address the user, include headings, or mention prompt writing.`;

function imagePromptRevisionParts(currentPrompt, changeRequest, options = {}) {
  const prompt = String(currentPrompt || '').trim();
  const request = String(changeRequest || '').trim();
  const sourceNote = options.hasImage
    ? '\nA source image is attached as visual context; the change request takes priority over it.'
    : '';
  return {
    instruction: `${IMAGE_PROMPT_REVISION_INSTRUCTION}${sourceNote}\n\nThe current prompt and change request follow between tags:`,
    userInput: `<current_prompt>\n${prompt || '(none — create the prompt from the change request)'}\n</current_prompt>\n<change_request>\n${request}\n</change_request>`,
  };
}

module.exports = {
  IMAGE_RECREATION_INSTRUCTION,
  IMAGE_PROMPT_REVISION_INSTRUCTION,
  imagePromptRevisionParts,
};
