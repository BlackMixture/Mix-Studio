'use strict';

const IMAGE_RECREATION_INSTRUCTION = `Look at the provided image and write one extremely detailed text-to-image prompt that would help recreate it faithfully.

Describe the visible subject, composition, pose, camera angle, lens feel, lighting, color palette, background, materials, textures, mood, and artistic medium. Preserve what is actually visible; do not invent new main objects or change the scene. If there is readable text, quote it exactly. Use concrete visual language, not analysis of the image. Return a single paragraph only.`;

module.exports = {
  IMAGE_RECREATION_INSTRUCTION,
};
