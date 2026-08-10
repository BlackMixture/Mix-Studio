'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const H3PromptGuide = require('../public/h3-prompt-guide');
const { h3EffectiveDurationSeconds } = require('../lib/video-workflows');

function baseH3Prompt(description = '[Shot 1] A baker opens the shop.') {
  return [
    `integrated_multimodal_description: ${description}`,
    '',
    'overall_soundscape: Soft room tone and synchronized footsteps.',
    '',
    'non_diegetic_music: N/A',
  ].join('\n');
}

function referenceH3Prompt(description = 'A grounded cinematic style. [Shot 1] <Subject 1> waves to camera.') {
  return [
    'subject_definitions:',
    '<Picture 1> defines <Subject 1>. <Audio 1> defines the same subject\'s voice.',
    '',
    'summary: [reference generation + audio reference] A concise portrait.',
    '',
    'retention_analysis:',
    '<Subject 1>: fully_preserved throughout. <Audio 1>: reference for the voice.',
    '',
    `detailed_description: ${description}`,
    '',
    'overall_soundscape: Quiet room ambience and natural movement.',
    '',
    'non_diegetic_music: N/A',
  ].join('\n');
}

test('H3 prompt guide exposes the same formatter API to Node and browsers', () => {
  assert.equal(typeof H3PromptGuide.analyzePrompt, 'function');
  assert.equal(typeof H3PromptGuide.auditStructure, 'function');
  assert.equal(typeof H3PromptGuide.buildReplacementPrompt, 'function');
  assert.equal(typeof H3PromptGuide.buildStyleTransferPrompt, 'function');
  assert.equal(Array.isArray(H3PromptGuide.styleTransferPresets), true);
  assert.equal(typeof H3PromptGuide.formatDialogue, 'function');
  assert.equal(typeof H3PromptGuide.h3EffectiveDurationSeconds, 'function');
  assert.equal(typeof H3PromptGuide.structurePrompt, 'function');

  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'h3-prompt-guide.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.equal(typeof context.H3PromptGuide.analyzePrompt, 'function');
  assert.equal(typeof context.H3PromptGuide.auditStructure, 'function');
  assert.equal(typeof context.H3PromptGuide.buildReplacementPrompt, 'function');
  assert.equal(typeof context.H3PromptGuide.buildStyleTransferPrompt, 'function');
  assert.equal(Array.isArray(context.H3PromptGuide.styleTransferPresets), true);
  assert.equal(typeof context.H3PromptGuide.formatDialogue, 'function');
  assert.equal(typeof context.H3PromptGuide.h3EffectiveDurationSeconds, 'function');
  assert.equal(typeof context.H3PromptGuide.structurePrompt, 'function');
});

test('local H3 replacement preset targets one object with native reference tags', () => {
  const prompt = H3PromptGuide.buildReplacementPrompt({
    kind: 'object',
    target: 'the red backpack held by the cyclist',
  });

  assert.match(prompt, /^SCENE CONTEXT\n/);
  assert.match(prompt, /the object identified as "the red backpack held by the cyclist"/);
  assert.match(prompt, /<Video 1>: the master plate/);
  assert.match(prompt, /<Picture 1>: identity of the replacement object only/);
  assert.match(prompt, /NO MASK/);
  assert.match(prompt, /Only the object identified as/);
  assert.doesNotMatch(prompt, /<Image[_ ]1>|<Video_1>/);
});

test('local H3 replacement preset adapts identity and motion locks for characters', () => {
  const prompt = H3PromptGuide.buildReplacementPrompt({
    kind: 'character',
    target: 'the woman in the blue coat',
  });

  assert.match(prompt, /identity of the replacement character only/);
  assert.match(prompt, /face, body proportions, hair, wardrobe/);
  assert.match(prompt, /inherits the full performance of the original character/);
  assert.match(prompt, /face, anatomy, wardrobe or colour/);
  assert.doesNotMatch(prompt, /replacement object inherits/);
});

test('local H3 style-transfer preset preserves the source timeline and optional synchronized audio', () => {
  const prompt = H3PromptGuide.buildStyleTransferPrompt({ hasAudio: true });
  assert.match(prompt, /^subject_definitions:\n<Video 1> is the source video/);
  assert.match(prompt, /<Audio 1> is the synchronized audio track of <Video 1>/);
  assert.match(prompt, /\[video editing \+ audio reuse\]/);
  assert.match(prompt, /partially_preserved - every subject, action, expression/);
  assert.match(prompt, /<Audio 1>: fully_copy/);
  assert.match(prompt, /polished hand-drawn 2D anime/);
  assert.match(prompt, /Follow <Video 1> frame by frame/);
  assert.match(prompt, /Do not add, remove, replace, or redesign people, objects, actions, backgrounds, or cuts/);
  const audit = H3PromptGuide.auditStructure(prompt, {
    mode: 'reference',
    seconds: 15,
    allowedReferenceTokens: ['<Video 1>', '<Audio 1>'],
  });
  assert.equal(audit.ready, true);
});

test('local H3 style transfer can use Picture 1 only as a visual-style reference', () => {
  const prompt = H3PromptGuide.buildStyleTransferPrompt({ hasStyleImage: true });
  assert.match(prompt, /<Subject 1> is the visual treatment shown in <Picture 1>/);
  assert.match(prompt, /not its depicted subject, composition, text, or pose/);
  assert.match(prompt, /<Subject 1> \(appears throughout\): attribute_transfer/);
  assert.match(prompt, /\[video editing \+ reference generation\]/);
  assert.match(prompt, /Picture 1 guides only the visual treatment|<Picture 1>/);
  assert.doesNotMatch(prompt, /<Audio 1>/);
});

test('H3 restyle exposes varied visual presets and accepts a custom destination style', () => {
  assert.deepEqual(
    H3PromptGuide.styleTransferPresets.map((preset) => preset.id),
    ['anime-2d', 'live-action', 'feature-3d', 'cel-3d', 'stop-motion', 'graphic-novel'],
  );
  const prompt = H3PromptGuide.buildStyleTransferPrompt({
    style: 'luminous watercolor storybook animation with visible paper grain',
  });
  assert.match(prompt, /luminous watercolor storybook animation with visible paper grain/);
  assert.match(prompt, /complete source performance and shot structure are preserved/);
  assert.match(prompt, /only the source rendering is changed/);
  assert.doesNotMatch(prompt, /complete live-action performance|same anime production style/);
});

test('browser H3 duration helper stays aligned with the generation frame grid', () => {
  for (const seconds of [5, 6, 7.5, 10, 14.9, 15]) {
    assert.equal(
      H3PromptGuide.h3EffectiveDurationSeconds(seconds),
      h3EffectiveDurationSeconds(seconds),
    );
  }
  assert.equal(H3PromptGuide.h3EffectiveDurationSeconds(5), 124 / 24);
  assert.equal(H3PromptGuide.h3EffectiveDurationSeconds(10), 243 / 24);
  assert.equal(H3PromptGuide.h3EffectiveDurationSeconds(15), 362 / 24);
  assert.equal(H3PromptGuide.h3EffectiveDurationSeconds(30, 120), 736 / 24);
});

test('H3 prompt audit accepts later shots across a long-context timeline', () => {
  const prompt = baseH3Prompt(
    '[Shot 1] A rider moves forward. [Shot 2] At 00:20.000, the camera cuts to the rider stopping.',
  );
  const standard = H3PromptGuide.auditStructure(prompt, { mode: 'frames', seconds: 30 });
  const longContext = H3PromptGuide.auditStructure(prompt, {
    mode: 'frames',
    seconds: 30,
    longContext: true,
  });

  assert.equal(standard.ready, false);
  assert.ok(standard.issueCodes.includes('shot-time-range'));
  assert.equal(longContext.ready, true);
  assert.equal(longContext.duration, 736 / 24);
});

test('local H3 structure wraps a plain prompt without inventing creative content', () => {
  const source = 'Maya says "Keep rolling..." beside a sign reading "OPEN".';
  const result = H3PromptGuide.structurePrompt(source, { mode: 'frames', seconds: 5 });

  assert.equal(result.wrapped, true);
  assert.equal(result.changed, true);
  assert.ok(result.prompt.includes(`[Shot 1] ${source}`));
  assert.match(result.prompt, /^integrated_multimodal_description:\n/);
  assert.match(result.prompt, /\noverall_soundscape:\n\nnon_diegetic_music:$/);
  assert.doesNotMatch(result.prompt, /<d>|\[English\]|\bN\/A\b/);
  assert.equal((result.prompt.match(/Keep rolling\.\.\./g) || []).length, 1);
  assert.equal((result.prompt.match(/"OPEN"/g) || []).length, 1);
  assert.equal(result.audit.ready, false);
  assert.ok(result.audit.issueCodes.includes('empty-field'));
});

test('local H3 structure creates a conservative reference skeleton and preserves tokens', () => {
  const source = 'Use <Picture 1> for the baker and <Audio 1> for her voice. She waves.';
  const result = H3PromptGuide.structurePrompt(source, {
    mode: 'reference',
    seconds: 10,
    expectedReferenceTokens: ['<Picture 1>', '<Audio 1>'],
    allowedReferenceTokens: ['<Picture 1>', '<Audio 1>'],
  });

  assert.equal(result.wrapped, true);
  assert.match(result.prompt, /^subject_definitions:\n\nsummary:\n\nretention_analysis:\n\ndetailed_description:\n/);
  assert.ok(result.prompt.includes(`[Shot 1] ${source}`));
  assert.doesNotMatch(result.prompt, /^How the reference pictures align/m);
  assert.equal((result.prompt.match(/<Picture 1>/g) || []).length, 1);
  assert.equal((result.prompt.match(/<Audio 1>/g) || []).length, 1);
  assert.doesNotMatch(result.prompt, /fully_preserved|reference generation|\bN\/A\b/);
});

test('local H3 structure synchronizes frame alignment without rewriting existing fields', () => {
  const structured = baseH3Prompt('[Shot 1] A baker opens the shop.');
  const first = H3PromptGuide.structurePrompt(structured, {
    mode: 'frames', seconds: 10, hasFirstFrame: true, hasLastFrame: true,
  });
  const expected = 'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 10.13-second mark of the target video.';

  assert.equal(first.wrapped, false);
  assert.equal(first.prompt, `${expected}\n\n${structured}`);
  assert.equal(first.audit.ready, true);
  const repeated = H3PromptGuide.structurePrompt(first.prompt, {
    mode: 'frames', seconds: 10, hasFirstFrame: true, hasLastFrame: true,
  });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.prompt, first.prompt);
});

test('local H3 structure removes only exact generated alignment lines', () => {
  const authored = `How the reference pictures align with the target video is explained by an on-screen tutorial.\n${baseH3Prompt('[Shot 1] The tutorial begins.')}`;
  const preserved = H3PromptGuide.structurePrompt(authored, { mode: 'frames', seconds: 5 });
  assert.equal(preserved.prompt, authored);

  const official = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
  const duplicate = H3PromptGuide.structurePrompt(`${official}\n\n${official}\n\n${baseH3Prompt('[Shot 1] A baker opens the shop.')}`, {
    mode: 'frames', seconds: 5, hasFirstFrame: true,
  });
  assert.equal((duplicate.prompt.match(/For the target video, at 0\.00 seconds/g) || []).length, 1);
  assert.equal(H3PromptGuide.structurePrompt(duplicate.prompt, {
    mode: 'frames', seconds: 5, hasFirstFrame: true,
  }).changed, false);
});

test('local H3 structure strips a stale alignment before wrapping plain prose', () => {
  const official = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
  const source = `${official}\n\n[Shot 1] A baker opens the shop.`;
  const result = H3PromptGuide.structurePrompt(source, { mode: 'frames', seconds: 5 });

  assert.doesNotMatch(result.prompt, /For the target video/);
  assert.match(result.prompt, /^integrated_multimodal_description:\n\[Shot 1\] A baker opens the shop\./);
  assert.equal((result.prompt.match(/\[Shot 1\]/g) || []).length, 1);
});

test('formats clearly attributed dialogue with stable speaker IDs', () => {
  const input = 'Alice says: "We\'re live." Bob asks, "Now?" Alice whispers "Keep rolling..."';
  const result = H3PromptGuide.formatDialogue(input);

  assert.equal(
    result.prompt,
    'Alice (S1) says: <d>[English] We\'re live.</d> Bob (S2) asks: <d>[English] Now?</d> Alice (S1) whispers: <d>[English] Keep rolling...</d>',
  );
  assert.equal(result.changed, true);
  assert.equal(result.replacements, 3);
  assert.deepEqual(
    result.entries.map(({ speaker, speakerId, text }) => ({ speaker, speakerId, text })),
    [
      { speaker: 'Alice', speakerId: 'S1', text: "We're live." },
      { speaker: 'Bob', speakerId: 'S2', text: 'Now?' },
      { speaker: 'Alice', speakerId: 'S1', text: 'Keep rolling...' },
    ],
  );
  assert.equal(result.after.unformattedDialogueCount, 0);
  assert.equal(result.after.formattedDialogueCount, 3);
});

test('keeps accented speaker names intact and reuses their normalized identities', () => {
  const input = 'Mar\u00eda says "Hola." Jos\u00e9 replies "Bien." Mar\u00eda whispers "Vamos." Ren\u00e9e asks "Ready?"';
  const result = H3PromptGuide.formatDialogue(input);

  assert.equal(
    result.prompt,
    'Mar\u00eda (S1) says: <d>[English] Hola.</d> Jos\u00e9 (S2) replies: <d>[English] Bien.</d> Mar\u00eda (S1) whispers: <d>[English] Vamos.</d> Ren\u00e9e (S3) asks: <d>[English] Ready?</d>',
  );
  assert.deepEqual(result.entries.map((entry) => entry.speaker), ['Mar\u00eda', 'Jos\u00e9', 'Mar\u00eda', 'Ren\u00e9e']);
  assert.deepEqual(result.entries.map((entry) => entry.speakerId), ['S1', 'S2', 'S1', 'S3']);
  assert.doesNotMatch(result.prompt, /Mar \(S\d\)\u00eda|Jos \(S\d\)\u00e9|Ren \(S\d\)\u00e9e/);
});

test('separates scene context from a named speaker and reuses the speaker ID', () => {
  const input = 'In the kitchen, Maya says "Hello." Outside by the garden, Maya whispers "Come here."';
  const result = H3PromptGuide.formatDialogue(input);

  assert.equal(
    result.prompt,
    'In the kitchen, Maya (S1) says: <d>[English] Hello.</d> Outside by the garden, Maya (S1) whispers: <d>[English] Come here.</d>',
  );
  assert.deepEqual(result.entries.map((entry) => entry.speaker), ['Maya', 'Maya']);
  assert.deepEqual(result.entries.map((entry) => entry.speakerId), ['S1', 'S1']);
  assert.equal(result.after.speakerCount, 1);
});

test('inserts the speaker ID beside the identity while preserving pre-speech action', () => {
  const input = 'Alice smiles, then says "Hello." Later, Alice turns and says "Goodbye."';
  const result = H3PromptGuide.formatDialogue(input);

  assert.equal(
    result.prompt,
    'Alice (S1) smiles, then says: <d>[English] Hello.</d> Later, Alice (S1) turns and says: <d>[English] Goodbye.</d>',
  );
  assert.doesNotMatch(result.prompt, /Alice smiles, then \(S1\)/);

  const appended = H3PromptGuide.formatDialogue(`${result.prompt} Alice says "Again."`);
  assert.match(appended.prompt, /Alice \(S1\) says: <d>\[English\] Again\.<\/d>$/);
  assert.equal(appended.after.speakerCount, 1);
});

test('uses intact H3 reference-card tokens as stable speaker identities', () => {
  const input = '<Picture 1> says "Welcome." <Picture 1> whispers "Stay close." <Subject 2> asks "Ready?"';
  const result = H3PromptGuide.formatDialogue(input);

  assert.equal(
    result.prompt,
    '<Picture 1> (S1) says: <d>[English] Welcome.</d> <Picture 1> (S1) whispers: <d>[English] Stay close.</d> <Subject 2> (S2) asks: <d>[English] Ready?</d>',
  );
  assert.deepEqual(result.entries.map((entry) => entry.speaker), ['<Picture 1>', '<Picture 1>', '<Subject 2>']);
  assert.deepEqual(result.entries.map((entry) => entry.speakerId), ['S1', 'S1', 'S2']);
  assert.equal(result.after.speakerCount, 2);
});

test('reference-card speakers do not weaken visible-text safeguards', () => {
  const input = '<Picture 1> holds a sign that says "OPEN". In front of the screen, Maya says "Hello."';
  const result = H3PromptGuide.formatDialogue(input);

  assert.match(result.prompt, /^<Picture 1> holds a sign that says "OPEN"\./);
  assert.match(result.prompt, /In front of the screen, Maya \(S1\) says: <d>\[English\] Hello\.<\/d>$/);
  assert.equal(result.replacements, 1);
  assert.equal(result.before.skippedDisplayTextCount, 1);
});

test('preserves the exact text and punctuation inside straight and smart quotes', () => {
  const input = 'Maya says: "Wait—don\'t go... okay?" Then Leo replies: “I won\'t.”';
  const result = H3PromptGuide.formatDialogue(input);

  assert.match(result.prompt, /<d>\[English\] Wait—don't go\.\.\. okay\?<\/d>/);
  assert.match(result.prompt, /<d>\[English\] I won't\.<\/d>/);
  assert.equal(result.entries[0].text, "Wait—don't go... okay?");
  assert.equal(result.entries[1].text, "I won't.");
});

test('leaves signs, screens, labels, and other likely on-screen copy untouched', () => {
  const input = [
    'The sign says "DO NOT ENTER."',
    'A phone screen displays "12:45".',
    'The label reads "FRAGILE".',
    'Alice says "Wait!"',
  ].join(' ');
  const result = H3PromptGuide.formatDialogue(input);

  assert.match(result.prompt, /The sign says "DO NOT ENTER\."/);
  assert.match(result.prompt, /phone screen displays "12:45"/);
  assert.match(result.prompt, /label reads "FRAGILE"/);
  assert.match(result.prompt, /Alice \(S1\) says: <d>\[English\] Wait!<\/d>/);
  assert.equal(result.replacements, 1);
  assert.equal(result.before.skippedDisplayTextCount, 3);
});

test('does not treat ambiguous action verbs as raw dialogue', () => {
  const input = [
    'The courier delivers "Package A" to the desk.',
    'The app responds "OK" on screen.',
    'Maya voices "concern" about the plan.',
  ].join(' ');
  const result = H3PromptGuide.formatDialogue(input);

  assert.equal(result.changed, false);
  assert.equal(result.replacements, 0);
  assert.equal(result.prompt, input);
});

test('does not rewrite unattributed quotes or unstable pronoun attributions', () => {
  const input = 'A neon word "OPEN" floats above them while she says "hello". Shot 2: "A close-up." Alice and Bob: "Together."';
  const result = H3PromptGuide.formatDialogue(input);

  assert.equal(result.prompt, input);
  assert.equal(result.changed, false);
  assert.equal(result.replacements, 0);
});

test('keeps existing dialogue markup intact and continues its speaker IDs', () => {
  const input = 'Alice (S3) says: <d>[English] She calls it "the big one."</d> Alice says: "Again." Bob replies: "Okay."';
  const result = H3PromptGuide.formatDialogue(input);

  assert.match(result.prompt, /^Alice \(S3\) says: <d>\[English\] She calls it "the big one\."<\/d>/);
  assert.match(result.prompt, /Alice \(S3\) says: <d>\[English\] Again\.<\/d>/);
  assert.match(result.prompt, /Bob \(S4\) replies: <d>\[English\] Okay\.<\/d>/);
  assert.equal(result.replacements, 2);
  assert.equal(result.after.formattedDialogueCount, 3);
  assert.equal(result.after.speakerCount, 2);
});

test('preserves official compound speaker IDs and counts their established voices', () => {
  const input = 'Maya (S1) whispers softly, <d>[English] Ready.</d> Leo (S2) replies: <d>[English] Ready.</d> The two children (S1,S2) shout together, <d>[English] Together!</d>';
  const result = H3PromptGuide.formatDialogue(input);

  assert.equal(result.prompt, input);
  assert.equal(result.changed, false);
  assert.equal(result.after.formattedDialogueCount, 3);
  assert.equal(result.after.speakerCount, 2);
  assert.equal(result.after.entries[2].speakerId, 'S1,S2');
});

test('supports trailing attributions and concise speaker-label notation', () => {
  const input = '"Stay down!" Alice shouts.\nNarrator: "The storm was only beginning."';
  const result = H3PromptGuide.formatDialogue(input);

  assert.match(result.prompt, /Alice \(S1\) shouts: <d>\[English\] Stay down!<\/d>\./);
  assert.match(result.prompt, /Narrator \(S2\) says: <d>\[English\] The storm was only beginning\.<\/d>/);
  assert.deepEqual(result.entries.map((entry) => entry.pattern), ['trailing-attribution', 'speaker-label']);
});

test('recognizes singing, narration, and chanting by identifiable lowercase roles', () => {
  const input = [
    '[Shot 1] the singer sings: "Hold on to me."',
    'a calm narrator narrates: "Morning reaches the valley."',
    'an excited crowd chants: "One more time!"',
  ].join(' ');
  const result = H3PromptGuide.formatDialogue(input);

  assert.match(result.prompt, /the singer \(S1\) sings: <d>\[English\] Hold on to me\.<\/d>/);
  assert.match(result.prompt, /a calm narrator \(S2\) narrates: <d>\[English\] Morning reaches the valley\.<\/d>/);
  assert.match(result.prompt, /an excited crowd \(S3\) chants: <d>\[English\] One more time!<\/d>/);
  assert.deepEqual(result.entries.map((entry) => entry.verb), ['sings', 'narrates', 'chants']);
  assert.equal(result.after.speakerCount, 3);
});

test('canonicalizes voiceover variants and immediately adds the closed-lips guard', () => {
  const input = [
    'Alice says in voiceover: "Keep moving."',
    'Bob says in off-screen voiceover: "Do not look back."',
    'the host says in an off-screen voiceover: "Welcome home."',
  ].join(' ');
  const result = H3PromptGuide.formatDialogue(input);
  const canonical = 'says in an off-screen voiceover';
  const guard = 'If this speaker also appears on screen, their lips remain completely closed.';

  assert.equal(result.replacements, 3);
  assert.equal(result.entries.every((entry) => entry.verb === canonical), true);
  assert.equal((result.prompt.match(new RegExp(canonical, 'g')) || []).length, 3);
  assert.equal((result.prompt.match(new RegExp(guard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 3);
  assert.match(result.prompt, new RegExp(`<\\/d> ${guard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('voiceover with a trailing attribution does not strand or duplicate punctuation', () => {
  const result = H3PromptGuide.formatDialogue('"Run now." Alice says in voiceover.');

  assert.equal(
    result.prompt,
    'Alice (S1) says in an off-screen voiceover: <d>[English] Run now.</d> If this speaker also appears on screen, their lips remain completely closed.',
  );
  assert.doesNotMatch(result.prompt, /\.\.$/);
});

test('lowercase role support still excludes pronouns and display surfaces', () => {
  const input = 'the sign says "OPEN". a phone screen narrates "Twelve forty-five". she sings "Hello."';
  const result = H3PromptGuide.formatDialogue(input);

  assert.equal(result.prompt, input);
  assert.equal(result.replacements, 0);
  assert.equal(result.before.skippedDisplayTextCount, 2);
});

test('analysis reports dialogue, references, display copy, and official field structure', () => {
  const prompt = [
    'integrated_multimodal_description: [Shot 1] Use <Picture 1>. The sign says "OPEN". Ava says "Go."',
    '',
    'overall_soundscape: Footsteps and room tone.',
    '',
    'non_diegetic_music: N/A',
  ].join('\n');
  const analysis = H3PromptGuide.analyzePrompt(prompt);

  assert.equal(analysis.hasOfficialStructure, true);
  assert.equal(analysis.dialogueCount, 1);
  assert.equal(analysis.unformattedDialogueCount, 1);
  assert.equal(analysis.formattedDialogueCount, 0);
  assert.equal(analysis.speakerCount, 1);
  assert.equal(analysis.referenceCount, 1);
  assert.equal(analysis.skippedDisplayTextCount, 1);
  assert.deepEqual(analysis.entries[0], {
    speaker: 'Ava',
    verb: 'says',
    text: 'Go.',
    speakerId: 'S1',
    formatted: false,
    pattern: 'leading-attribution',
  });
});

test('uses a safe language tag and never lets tag syntax escape into output', () => {
  const custom = H3PromptGuide.formatDialogue('Ava says "Bonjour !"', { language: 'French' });
  assert.equal(custom.prompt, 'Ava (S1) says: <d>[French] Bonjour !</d>');

  const invalid = H3PromptGuide.formatDialogue('Ava says "Hello."', { language: 'English]</d>' });
  assert.equal(invalid.prompt, 'Ava (S1) says: <d>[English] Hello.</d>');
});

test('structure audit accepts the exact base field contract and valid shot timeline', () => {
  const prompt = baseH3Prompt(
    '[Shot 1] A baker opens the shop. [Shot 2] At 00:03.500, the camera cuts to the first customer.',
  );
  const audit = H3PromptGuide.auditStructure(prompt, { mode: 'frames', seconds: 10 });

  assert.equal(audit.ready, true);
  assert.deepEqual(audit.issues, []);
  assert.deepEqual(audit.requiredFields, [
    'integrated_multimodal_description',
    'overall_soundscape',
    'non_diegetic_music',
  ]);
  assert.deepEqual(audit.presentFields, audit.requiredFields);
  assert.equal(audit.finalShot, 2);
  assert.deepEqual(
    audit.shots.map(({ number, timestamp, timeSeconds }) => ({ number, timestamp, timeSeconds })),
    [
      { number: 1, timestamp: null, timeSeconds: null },
      { number: 2, timestamp: '00:03.500', timeSeconds: 3.5 },
    ],
  );
  assert.deepEqual(audit.alignment, { required: false, expected: null, actual: null, valid: true });
});

test('structure audit reports field order, exact spelling, and empty bodies', () => {
  const prompt = [
    'overall_soundscape: Room tone.',
    '',
    'Integrated_multimodal_description: [Shot 1] A static portrait.',
    '',
    'non_diegetic_music:',
  ].join('\n');
  const audit = H3PromptGuide.auditStructure(prompt, { mode: 'frames', seconds: 5 });

  assert.equal(audit.ready, false);
  assert.ok(audit.issueCodes.includes('field-order'));
  assert.ok(audit.issueCodes.includes('field-spelling'));
  assert.ok(audit.issueCodes.includes('empty-field'));
  assert.ok(audit.issueCodes.includes('leading-content'));
  assert.deepEqual(audit.emptyFields, ['non_diegetic_music']);
  assert.equal(audit.issues.find((issue) => issue.code === 'field-spelling').field, 'integrated_multimodal_description');
});

test('structure audit requires real dialogue language tags and stable speaker IDs', () => {
  const missingId = H3PromptGuide.auditStructure(baseH3Prompt(
    '[Shot 1] Maya says: <d>[English] Keep rolling.</d>',
  ), { mode: 'frames', seconds: 5 });
  assert.equal(missingId.ready, false);
  assert.ok(missingId.issueCodes.includes('dialogue-speaker-id'));

  const placeholderLanguage = H3PromptGuide.auditStructure(baseH3Prompt(
    '[Shot 1] Maya (S1) says: <d>[Language] Keep rolling.</d>',
  ), { mode: 'frames', seconds: 5 });
  assert.equal(placeholderLanguage.ready, false);
  assert.ok(placeholderLanguage.issueCodes.includes('dialogue-language'));

  const compound = H3PromptGuide.auditStructure(baseH3Prompt(
    '[Shot 1] Maya (S1) whispers softly, <d>[English] Ready.</d> Leo (S2) replies: <d>[English] Ready.</d> The two children (S1,S2) shout together, <d>[English] Together!</d>',
  ), { mode: 'frames', seconds: 5 });
  assert.equal(compound.ready, true);
});

test('structure audit accepts the official rich bakery dialogue example', () => {
  const audit = H3PromptGuide.auditStructure(baseH3Prompt(
    '[Shot 1] The camera pushes in slowly from a medium shot to a close-up as the middle-aged baker with a calm, slightly raspy voice (S1) places a fresh loaf on the wooden counter and says: <d>[English] First batch of the morning.</d>',
  ), { mode: 'frames', seconds: 5 });

  assert.equal(audit.ready, true);
  assert.deepEqual(audit.issues, []);
});

test('structure audit rejects speaker IDs before or without an identity', () => {
  for (const dialogue of [
    '(S1) Maya says: <d>[English] Hi.</d>',
    '(S1) says: <d>[English] Hi.</d>',
  ]) {
    const audit = H3PromptGuide.auditStructure(baseH3Prompt(`[Shot 1] ${dialogue}`), {
      mode: 'frames', seconds: 5,
    });
    assert.equal(audit.ready, false);
    assert.ok(audit.issueCodes.includes('dialogue-speaker-id'));
  }
});

test('structure audit permits a stable ID when the same speaker description is shortened', () => {
  const audit = H3PromptGuide.auditStructure(baseH3Prompt([
    '[Shot 1] The young woman with a quiet, breathy voice (S1) says: <d>[English] I get off at the next station.</d>',
    '[Shot 2] At 00:03.000, the woman (S1) whispers: <d>[English] This is my stop.</d>',
  ].join(' ')), { mode: 'frames', seconds: 5 });

  assert.equal(audit.ready, true);
  assert.deepEqual(audit.issues, []);
});

test('structure audit catches role-ID collisions and rich-description ID changes', () => {
  const collision = H3PromptGuide.auditStructure(baseH3Prompt([
    '[Shot 1] The baker (S1) says: <d>[English] Morning.</d>',
    '[Shot 2] At 00:03.000, the pilot (S1) replies: <d>[English] Ready.</d>',
  ].join(' ')), { mode: 'frames', seconds: 5 });
  assert.ok(collision.issueCodes.includes('speaker-id-instability'));

  const changedRichId = H3PromptGuide.auditStructure(baseH3Prompt([
    '[Shot 1] The camera pushes in as the middle-aged baker with a calm, raspy voice (S1) places a loaf down and says: <d>[English] Morning.</d>',
    '[Shot 2] At 00:03.000, the baker (S2) whispers: <d>[English] Again.</d>',
  ].join(' ')), { mode: 'frames', seconds: 5 });
  assert.ok(changedRichId.issueCodes.includes('speaker-id-instability'));
});

test('structure audit enforces a stable identity-to-speaker-ID mapping', () => {
  const changedId = H3PromptGuide.auditStructure(baseH3Prompt(
    '[Shot 1] Maya (S1) says: <d>[English] Hello.</d> Maya (S2) whispers: <d>[English] Again.</d>',
  ), { mode: 'frames', seconds: 5 });
  assert.equal(changedId.ready, false);
  assert.ok(changedId.issueCodes.includes('speaker-id-instability'));

  const reusedId = H3PromptGuide.auditStructure(baseH3Prompt(
    '[Shot 1] Maya (S1) says: <d>[English] Hello.</d> Leo (S1) replies: <d>[English] Again.</d>',
  ), { mode: 'frames', seconds: 5 });
  assert.equal(reusedId.ready, false);
  assert.ok(reusedId.issueCodes.includes('speaker-id-instability'));

  const unestablishedCompound = H3PromptGuide.auditStructure(baseH3Prompt(
    '[Shot 1] The children (S1,S2) shout together, <d>[English] Run!</d>',
  ), { mode: 'frames', seconds: 5 });
  assert.equal(unestablishedCompound.ready, false);
  assert.ok(unestablishedCompound.issueCodes.includes('compound-speaker-id'));
});

test('structure audit checks shot numbering, timestamp form, order, and duration bounds', () => {
  const prompt = baseH3Prompt([
    '[Shot 1] At 00:00.000, an incorrect timestamp starts the first shot.',
    '[Shot 2] At 00:04.000, the camera cuts closer.',
    '[Shot 3] At 00:03.000, the camera cuts backward in time.',
    '[Shot 5] At 00:10.125, the camera cuts at the effective duration boundary.',
    '[Shot 6] At 0:09.500, this timestamp has the wrong form.',
  ].join(' '));
  const audit = H3PromptGuide.auditStructure(prompt, { mode: 'frames', seconds: 10 });

  assert.equal(audit.ready, false);
  for (const code of [
    'shot-1-timestamp',
    'shot-sequence',
    'shot-time-order',
    'shot-time-range',
    'shot-timestamp-format',
  ]) {
    assert.ok(audit.issueCodes.includes(code), `expected ${code}`);
  }
});

test('base structure audit requires Shot 1 at the start of the multimodal description', () => {
  const prompt = baseH3Prompt('A cinematic opening sentence. [Shot 1] The baker opens the shop.');
  const audit = H3PromptGuide.auditStructure(prompt, { mode: 'frames', seconds: 5 });

  assert.equal(audit.ready, false);
  assert.ok(audit.issueCodes.includes('shot-1-position'));
});

test('structure audit enforces the exact first-frame alignment line', () => {
  const prompt = baseH3Prompt('[Shot 1] The anchored subject looks toward camera.');
  const alignment = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
  const valid = H3PromptGuide.auditStructure(`${alignment}\n\n${prompt}`, {
    mode: 'frames', seconds: 8, hasFirstFrame: true,
  });

  assert.equal(valid.ready, true);
  assert.equal(valid.alignment.required, true);
  assert.equal(valid.alignment.expected, alignment);
  assert.equal(valid.alignment.valid, true);

  const wrong = H3PromptGuide.auditStructure(`${alignment.replace('0.00', '0.0')}\n\n${prompt}`, {
    mode: 'frames', seconds: 8, hasFirstFrame: true,
  });
  assert.ok(wrong.issueCodes.includes('alignment-line'));
  assert.equal(wrong.alignment.valid, false);
});

test('structure audit derives first-and-last alignment from duration and actual final shot', () => {
  const prompt = baseH3Prompt(
    '[Shot 1] The first frame begins moving. [Shot 2] At 00:04.250, the camera cuts to the final composition.',
  );
  const alignment = 'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 10.13-second mark of the target video.';
  const valid = H3PromptGuide.auditStructure(`${alignment}\n\n${prompt}`, {
    mode: 'frames', seconds: 10, hasFirstFrame: true, hasLastFrame: true,
  });

  assert.equal(valid.ready, true);
  assert.equal(valid.finalShot, 2);
  assert.equal(valid.alignment.expected, alignment);

  const wrongShot = H3PromptGuide.auditStructure(`${alignment.replace('Shot 2', 'Shot 1')}\n\n${prompt}`, {
    mode: 'frames', seconds: 10, hasFirstFrame: true, hasLastFrame: true,
  });
  assert.ok(wrongShot.issueCodes.includes('alignment-line'));
  assert.match(wrongShot.alignment.expected, /Picture 2 \(from Shot 2\).*10\.13-second/);
});

test('structure audit enforces last-frame alignment and rejects alignment for text-only video', () => {
  const prompt = baseH3Prompt(
    '[Shot 1] The action approaches the target. [Shot 2] At 00:02.000, the final composition settles.',
  );
  const alignment = 'How the reference pictures align with the target video — <Picture 1> (from [Shot 2]) aligns with the 6.58-second mark of the target video.';
  const lastFrame = H3PromptGuide.auditStructure(`${alignment}\n\n${prompt}`, {
    mode: 'frames', seconds: 6, hasLastFrame: true,
  });
  assert.equal(lastFrame.ready, true);

  const textOnly = H3PromptGuide.auditStructure(`${alignment}\n\n${prompt}`, {
    mode: 'frames', seconds: 6,
  });
  assert.equal(textOnly.ready, false);
  assert.ok(textOnly.issueCodes.includes('unexpected-alignment'));
});

test('structure audit accepts the six-section reference contract and preserves expected tokens', () => {
  const prompt = referenceH3Prompt(
    'A grounded cinematic style. [Shot 1] <Subject 1> listens to <Audio 1>. [Shot 2] At 00:04.000, the camera cuts closer.',
  );
  const audit = H3PromptGuide.auditStructure(prompt, {
    mode: 'reference',
    seconds: 10,
    hasFirstFrame: true,
    hasLastFrame: true,
    expectedReferenceTokens: new Set(['<Picture 1>', '<Audio 1>']),
  });

  assert.equal(audit.ready, true);
  assert.deepEqual(audit.requiredFields, [
    'subject_definitions',
    'summary',
    'retention_analysis',
    'detailed_description',
    'overall_soundscape',
    'non_diegetic_music',
  ]);
  assert.deepEqual(audit.missingReferenceTokens, []);
  assert.equal(audit.alignment.required, false);
  assert.equal(audit.alignment.valid, true);
});

test('reference audit reports missing tokens and disallows a frame-alignment line', () => {
  const prompt = referenceH3Prompt().replace(/\s*<Audio 1>[^\n]*/g, '');
  const alignment = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
  const audit = H3PromptGuide.auditStructure(`${alignment}\n\n${prompt}`, {
    mode: 'reference',
    seconds: 5,
    expectedReferenceTokens: ['<Picture 1>', '<Audio 1>'],
  });

  assert.equal(audit.ready, false);
  assert.ok(audit.issueCodes.includes('missing-reference-token'));
  assert.ok(audit.issueCodes.includes('unexpected-alignment'));
  assert.deepEqual(audit.missingReferenceTokens, ['<Audio 1>']);
  assert.equal(audit.issues.find((issue) => issue.code === 'missing-reference-token').token, '<Audio 1>');
});

test('reference audit rejects reference tags that were not supplied by the user', () => {
  const prompt = referenceH3Prompt().replace(
    '<Subject 1> waves to camera.',
    '<Subject 1> waves beside <Picture 99> while <Audio 2> plays.',
  );
  const audit = H3PromptGuide.auditStructure(prompt, {
    mode: 'reference',
    seconds: 5,
    expectedReferenceTokens: ['<Picture 1>', '<Audio 1>'],
  });

  assert.equal(audit.ready, false);
  assert.ok(audit.issueCodes.includes('unexpected-reference-token'));
  assert.deepEqual(audit.unexpectedReferenceTokens, ['<Picture 99>', '<Audio 2>']);
});

test('reference audit can distinguish allowed attached inputs from required authored tags', () => {
  const prompt = referenceH3Prompt().replace(
    '<Subject 1> waves to camera.',
    '<Subject 1> waves beside <Picture 2>.',
  );
  const audit = H3PromptGuide.auditStructure(prompt, {
    mode: 'reference',
    seconds: 5,
    expectedReferenceTokens: ['<Picture 1>', '<Audio 1>'],
    allowedReferenceTokens: ['<Picture 1>', '<Audio 1>'],
  });

  assert.equal(audit.ready, false);
  assert.deepEqual(audit.allowedReferenceTokens, ['<Picture 1>', '<Audio 1>']);
  assert.deepEqual(audit.unexpectedReferenceTokens, ['<Picture 2>']);
});

test('structure audit ignores ordinary prose details outside the required contracts', () => {
  const prompt = baseH3Prompt([
    '[Shot 1] Lighting: warm amber from camera left.',
    'The storefront remains labeled "OPEN" while the baker waves.',
  ].join('\n'));
  const audit = H3PromptGuide.auditStructure(prompt, { mode: 'frames', seconds: 5 });

  assert.equal(audit.ready, true);
  assert.deepEqual(audit.issues, []);
});
