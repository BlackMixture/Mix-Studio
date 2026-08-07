'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CREATIVE_RESOLUTION_INSTRUCTION,
  REGIONAL_PROMPT_INSTRUCTION,
  ENHANCE_TAIL,
  H3_PROMPT_CRAFT_INSTRUCTION,
  H3_PROMPT_ENHANCE_INSTRUCTION,
  H3_MOTION_INSTRUCTION,
  H3_FIRST_LAST_MOTION_INSTRUCTION,
  H3_REFERENCE_PROMPT_CRAFT_INSTRUCTION,
  cleanGeneratedPrompt,
  h3PromptEnhanceParts,
  h3PromptModeGuidance,
  h3TimelineGuidance,
  motionPromptEnhanceParts,
  promptEnhanceParts,
  regionPromptEnhanceParts,
  videoPromptEnhanceParts,
  videoPromptRevisionParts,
} = require('../lib/prompt-enhance');

test('creative enhancement resolves abstract requests into visible scenes', () => {
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /abstract/i);
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /one specific, visually compelling scenario/i);
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /body language/i);
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /make an image of/i);
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /Krea 2/i);
});

test('creative enhancement preserves concrete scene prompts', () => {
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /already describes a concrete visual scene/i);
  assert.match(CREATIVE_RESOLUTION_INSTRUCTION, /preserve its subjects, actions, relationships, medium/i);
});

test('prompt enhancement clearly separates instructions from user input', () => {
  const parts = promptEnhanceParts("Custom system prompt\n\nUser's Input:", 'make an image of the happiest day on earth');

  assert.match(parts.instruction, /^Custom system prompt/);
  assert.match(parts.instruction, /Creative-brief handling/);
  assert.doesNotMatch(parts.instruction, /Custom system prompt\s+User's Input:/);
  assert.equal(
    parts.userInput,
    `<user_input>\nmake an image of the happiest day on earth\n</user_input>${ENHANCE_TAIL}`
  );
  assert.match(parts.userInput, /<final_prompt> XML element containing the finished prompt/);
  assert.doesNotMatch(parts.userInput, /the final prompt paragraph/i);
});

test('regional enhancement stays inside the selected box and keeps scene context separate', () => {
  const parts = regionPromptEnhanceParts(
    "Custom system prompt\n\nUser's Input:",
    'cinematic fashion editorial in a marble lobby',
    'woman in a red velvet jacket',
    { hasReference: true },
  );

  assert.match(REGIONAL_PROMPT_INSTRUCTION, /only the selected region/i);
  assert.match(REGIONAL_PROMPT_INSTRUCTION, /Do not repeat the whole composition/i);
  assert.match(REGIONAL_PROMPT_INSTRUCTION, /Do not invent placement/i);
  assert.match(parts.instruction, /reference image is attached/i);
  assert.match(parts.userInput, /<global_scene_context>\ncinematic fashion editorial in a marble lobby\n<\/global_scene_context>/);
  assert.match(parts.userInput, /<region_input>\nwoman in a red velvet jacket\n<\/region_input>/);
  assert.ok(parts.userInput.endsWith(ENHANCE_TAIL));
});

test('generated prompt cleanup rejects copied placeholder text', () => {
  assert.equal(cleanGeneratedPrompt('<final_prompt>the final prompt paragraph</final_prompt>', ''), '');
  assert.equal(cleanGeneratedPrompt('<final_prompt>Write the actual prompt here</final_prompt>', ''), '');
  assert.equal(
    cleanGeneratedPrompt('<think>planning</think><final_prompt>The camera slowly pushes toward the subject while fabric moves in the breeze.</final_prompt>', ''),
    'The camera slowly pushes toward the subject while fabric moves in the breeze.'
  );
});

test('generated prompt cleanup preserves every unwrapped official H3 section', () => {
  const base = [
    'integrated_multimodal_description: [Shot 1] A baker opens the shop and waves.',
    '',
    'overall_soundscape: Quiet street ambience, a latch click, and soft footsteps.',
    '',
    'non_diegetic_music: A brushed-snare pulse with muted upright bass continues at a steady tempo.',
  ].join('\n');
  assert.equal(cleanGeneratedPrompt(base, ''), base);

  const reference = [
    'subject_definitions:',
    '<Subject 1> is the host in <Picture 1>.',
    '',
    'summary:',
    '[reference generation] The host greets the audience.',
    '',
    'retention_analysis:',
    '<Subject 1> (appears in [Shot 1]): fully_preserved - the host remains recognizable.',
    '',
    'detailed_description:',
    '[Shot 1] The host turns toward the camera and smiles.',
    '',
    'overall_soundscape:',
    'Soft room tone and clothing movement.',
    '',
    'non_diegetic_music:',
    'N/A',
  ].join('\n');
  assert.equal(cleanGeneratedPrompt(reference, ''), reference);
});

test('H3 first-frame motion enhancement uses the official I2VA structure', () => {
  const parts = motionPromptEnhanceParts('The character waves, then turns toward the window.', {
    engine: 'h3',
    seconds: 12,
  });

  assert.match(H3_MOTION_INSTRUCTION, /exact first frame at 0\.00 seconds/i);
  assert.match(parts.instruction, /exactly these three fields in this order and spelling: integrated_multimodal_description, overall_soundscape, non_diegetic_music/i);
  assert.match(parts.instruction, /For the target video, at 0\.00 seconds into the target video, <Picture 1> \(from \[Shot 1\]\) is fully referenced\./);
  assert.match(parts.instruction, /Effective video duration: 12\.25 seconds/);
  assert.match(parts.instruction, /\[Shot 1\] has no timestamp/);
  assert.match(parts.instruction, /strictly increasing cut timestamp/);
  assert.match(parts.instruction, /never invent spoken words, lyrics, narration, or voiceover/i);
  assert.match(parts.userInput, /<user_motion_idea>\nThe character waves, then turns toward the window\.\n<\/user_motion_idea>/);
  assert.ok(parts.userInput.endsWith(ENHANCE_TAIL));
});

test('H3 first-and-last motion enhancement treats both anchors as ordered boundary frames', () => {
  const parts = motionPromptEnhanceParts('She closes the umbrella.', {
    engine: 'h3',
    seconds: 10,
    hasEndImage: true,
  });

  assert.match(H3_FIRST_LAST_MOTION_INSTRUCTION, /Picture 1 is the first frame at 0\.00 seconds/i);
  assert.match(H3_FIRST_LAST_MOTION_INSTRUCTION, /Picture 2 is the last frame at the effective duration/i);
  assert.match(parts.instruction, /two exact boundary frames/i);
  assert.match(parts.instruction, /Picture 2 \(from Shot N\) aligns with the 10\.13-second mark/);
  assert.doesNotMatch(parts.instruction, /provided image as MiniMax H3's exact first frame/i);
});

test('H3 timeline guidance uses snapped frame duration and official shot timestamp rules', () => {
  assert.match(h3TimelineGuidance(5), /Effective video duration: 5\.17 seconds/);
  assert.match(h3TimelineGuidance(10), /official MM:SS\.mmm form/);
  assert.match(h3TimelineGuidance(10), /\[Shot 2\] At 00:03\.500/);
  assert.match(h3TimelineGuidance(10), /greater than 0\.000 and less than 10\.13 seconds/);
  assert.match(h3TimelineGuidance(15), /prefer a continuous shot when cuts add no new information/i);
});

test('H3 base prompt craft enforces official fields, dialogue fidelity, and visible-text separation', () => {
  const parts = h3PromptEnhanceParts(
    'A sign reads "OPEN". The baker says, "First batch!"',
    { seconds: 10, mode: 'frames', hasImage: false },
  );

  assert.match(parts.instruction, /Text-to-video mode: do not add an image-alignment instruction/i);
  assert.match(parts.instruction, /begin the finished prompt directly with integrated_multimodal_description/i);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /integrated_multimodal_description must begin with \[Shot 1\]/);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /<d>\[Language\] exact spoken content<\/d>/);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /Never translate, paraphrase, correct, extend, or invent dialogue/i);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /sign, label, banner, subtitle, screen/i);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /English double quotation marks, preserving it verbatim/i);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /says in an off-screen voiceover/);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /<scenetrans>/);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /<cutoff>/);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /overall_soundscape is one continuous English paragraph of 1-4 sentences/i);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /Use N\/A only when the user explicitly requests complete silence/i);
  assert.match(H3_PROMPT_CRAFT_INSTRUCTION, /non_diegetic_music is 1-3 English sentences/i);
  assert.match(parts.userInput, /A sign reads "OPEN"\./);
  assert.match(parts.userInput, /The baker says, "First batch!"/);
});

test('H3 enhancement leaves authored dialogue raw so the LLM can assign its real language tag', () => {
  const parts = videoPromptRevisionParts(
    'Maria says "Hola, amiga!"',
    'Improve the camera only.',
    { engine: 'h3', seconds: 8, mode: 'frames' },
  );
  assert.match(parts.userInput, /Maria says "Hola, amiga!"/);
  assert.doesNotMatch(parts.userInput, /\[English\]/);
  assert.match(parts.instruction, /Preserve the user's exact words, punctuation, and original language/i);
});

test('H3 frame-mode guidance emits exact I2VA, FL2VA, and L2VA alignment contracts', () => {
  const first = h3PromptModeGuidance({ seconds: 8, hasImage: true });
  assert.match(first, /first line of the finished prompt must be exactly "For the target video, at 0\.00 seconds into the target video, <Picture 1> \(from \[Shot 1\]\) is fully referenced\."/);

  const firstLast = h3PromptModeGuidance({ seconds: 8, hasImage: true, hasEndImage: true });
  assert.match(firstLast, /Picture 1 \(from Shot 1\) aligns with the 0\.00-second mark/);
  assert.match(firstLast, /Picture 2 \(from Shot N\) aligns with the 8\.00-second mark/);
  assert.match(firstLast, /Replace N with the actual final shot number/);
  assert.match(firstLast, /Generally use one continuous shot/i);

  const last = h3PromptModeGuidance({ seconds: 6, hasEndImage: true });
  assert.match(last, /<Picture 1> \(from \[Shot N\]\) aligns with the 6\.58-second mark/);
  assert.match(last, /converge on <Picture 1> exactly at 6\.58 seconds/i);
});

test('H3 prompt enhancement describes the first-to-last path at the exact duration', () => {
  const parts = h3PromptEnhanceParts(
    'She closes the umbrella and sits on the bench.',
    { seconds: 10, mode: 'frames', hasImage: true, hasEndImage: true },
  );

  assert.match(parts.instruction, /exact first- and last-frame anchors/i);
  assert.match(parts.instruction, /visual context is attached in Picture order/i);
  assert.match(parts.instruction, /Picture 2 \(from Shot N\) aligns with the 10\.13-second mark/);
  assert.match(parts.instruction, /reach Picture 2 exactly at 10\.13 seconds/i);
  assert.match(parts.instruction, /Effective video duration: 10\.13 seconds/);
});

test('H3 full-reference enhancement uses the official six-section contract', () => {
  const parts = h3PromptEnhanceParts(
    'Use <Picture 1> for the host and <Audio 1> for the performance.',
    { seconds: 10, mode: 'reference', hasImage: true },
  );

  const sectionOrder = [
    'subject_definitions',
    'summary',
    'retention_analysis',
    'detailed_description',
    'overall_soundscape',
    'non_diegetic_music',
  ].map((label) => parts.instruction.indexOf(label));
  assert.ok(sectionOrder.every((index) => index >= 0));
  assert.deepEqual([...sectionOrder].sort((a, b) => a - b), sectionOrder);
  assert.match(H3_REFERENCE_PROMPT_CRAFT_INSTRUCTION, /Write exactly these six sections in this order and spelling/i);
  assert.match(parts.instruction, /Full-reference mode: use the six-section reference contract/i);
  assert.match(parts.instruction, /no separate keyframe-alignment instruction/i);
  assert.match(parts.instruction, /Create stable <Subject N> labels/i);
  assert.match(parts.instruction, /\[reference generation \+ audio reference\]/i);
  assert.match(parts.instruction, /fully_preserved, partially_preserved, attribute_transfer, or weak_reference/);
  assert.match(parts.instruction, /fully_copy, partially_copy, reference, or weak_reference/);
  assert.match(parts.instruction, /A speaking referenced subject uses <Subject N> \(Sx\)/);
  assert.match(parts.instruction, /never translate, paraphrase, extend, or invent dialogue/i);
  assert.match(parts.instruction, /never omit, renumber, duplicate, or invent a reference token/i);
  assert.doesNotMatch(parts.instruction, /exactly these three fields/i);
  assert.match(parts.userInput, /<user_video_prompt>\nUse <Picture 1> for the host and <Audio 1> for the performance\.\n<\/user_video_prompt>/);
  assert.ok(parts.userInput.endsWith(ENHANCE_TAIL));
});

test('generic video enhancement adapts to text-only and visual starting points', () => {
  const textOnly = videoPromptEnhanceParts('A train crosses the desert.', {
    engine: 'ltx', seconds: 8, hasImage: false,
  });
  assert.match(textOnly.instruction, /No source image is attached/);
  assert.match(textOnly.instruction, /Target duration: 8 seconds/);
  assert.match(textOnly.userInput, /<user_video_prompt>\nA train crosses the desert\.\n<\/user_video_prompt>/);

  const visual = videoPromptEnhanceParts('She turns toward camera.', {
    engine: 'wan', seconds: 5, hasImage: true,
  });
  assert.match(visual.instruction, /exact visual starting point/);
  assert.ok(visual.userInput.endsWith(ENHANCE_TAIL));
});

test('video prompt revision preserves H3 reference labels and six-section format', () => {
  const parts = videoPromptRevisionParts(
    'Use <Picture 1> as the hero and <Audio 1> as the soundtrack.',
    'Add a low-angle reveal after the close-up.',
    { engine: 'h3', seconds: 10, mode: 'reference', hasImage: true },
  );

  assert.match(parts.instruction, /Attached H3 reference assets are identified by tokens/i);
  assert.match(parts.instruction, /subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music/);
  assert.match(parts.instruction, /never omit, renumber, duplicate, or invent a reference token/i);
  assert.match(parts.instruction, /Effective video duration: 10\.13 seconds/);
  assert.match(parts.instruction, /never invent spoken words, lyrics, narration, or voiceover/i);
  assert.match(parts.userInput, /<current_prompt>[\s\S]*<Picture 1>[\s\S]*<Audio 1>[\s\S]*<\/current_prompt>/);
  assert.match(parts.userInput, /<change_request>[\s\S]*low-angle reveal[\s\S]*<\/change_request>/);
});
