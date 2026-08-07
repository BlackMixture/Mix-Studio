'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  appendH3ValidationFeedback,
  h3AuthoredTextSegments,
  h3PromptReferenceTokens,
  h3PromptValidationFeedback,
  inspectH3PromptOutput,
  validatedH3Prompt,
} = require('../lib/h3-prompt-validation');

function basePrompt(description = '[Shot 1] A baker opens the shop.') {
  return [
    `integrated_multimodal_description: ${description}`,
    '',
    'overall_soundscape: Quiet room tone and soft footsteps.',
    '',
    'non_diegetic_music: N/A',
  ].join('\n');
}

function referencePrompt() {
  return [
    'subject_definitions:',
    '<Subject 1> is the baker in <Picture 1>.',
    '',
    'summary:',
    '[reference generation] <Subject 1> opens the shop.',
    '',
    'retention_analysis:',
    '<Subject 1> (appears in [Shot 1]): fully_preserved - identity and wardrobe remain recognizable.',
    '',
    'detailed_description:',
    'A grounded cinematic style. [Shot 1] <Subject 1> opens the shop.',
    '',
    'overall_soundscape:',
    'Quiet room tone and soft footsteps.',
    '',
    'non_diegetic_music:',
    'N/A',
  ].join('\n');
}

test('H3 validation helpers extract exact reference and authored-text contracts', () => {
  assert.deepEqual(
    h3PromptReferenceTokens('Use <Picture 1> and <Audio 1>.', '<Picture 1> again.'),
    ['<Picture 1>', '<Audio 1>'],
  );
  assert.deepEqual(
    h3AuthoredTextSegments('Maya says "Keep rolling..." and the sign reads “OPEN”. <d>[Spanish] Hola.</d>'),
    ['Hola.', 'Keep rolling...', 'OPEN'],
  );
});

test('validated H3 prompt retries malformed output with deterministic feedback', async () => {
  const calls = [];
  const prompt = await validatedH3Prompt(async (attempt, feedback) => {
    calls.push({ attempt, feedback });
    return attempt ? basePrompt() : 'A plain paragraph without official fields.';
  }, 'A baker opens the shop.', { mode: 'frames', seconds: 5 });

  assert.equal(prompt, basePrompt());
  assert.equal(calls.length, 2);
  assert.equal(calls[0].feedback, '');
  assert.match(calls[1].feedback, /Missing required field: integrated_multimodal_description/);
});

test('validated H3 prompt rejects a second malformed response with a clear code', async () => {
  await assert.rejects(
    validatedH3Prompt(async () => 'Still unstructured.', 'A baker opens the shop.', {
      mode: 'frames', seconds: 5,
    }),
    (error) => error.code === 'h3_prompt_format'
      && /failed after a retry/i.test(error.message)
      && Array.isArray(error.issues),
  );
});

test('speaker formatting can remain an optional validation warning', async () => {
  let calls = 0;
  const raw = basePrompt('[Shot 1] (S1) Maya says: <d>[English] Hi.</d>');
  const prompt = await validatedH3Prompt(async () => {
    calls += 1;
    return raw;
  }, 'Maya says "Hi."', {
    mode: 'frames', seconds: 5, preserveAuthoredText: true, allowDialogueFormatFallback: true,
  });

  assert.equal(prompt, raw);
  assert.equal(calls, 1);
});

test('generation enhancement can fall back to the authored prompt after structural retries', async () => {
  let calls = 0;
  const fallback = 'A baker opens the shop.';
  const prompt = await validatedH3Prompt(async () => {
    calls += 1;
    return 'Still unstructured.';
  }, fallback, { mode: 'frames', seconds: 5, fallbackOnFailure: true });

  assert.equal(prompt, fallback);
  assert.equal(calls, 2);
});

test('automatic enhancement preserves exact authored dialogue and visible text', () => {
  const source = 'Maya says "Keep rolling..." while a sign reads “OPEN”.';
  const changed = inspectH3PromptOutput(basePrompt('[Shot 1] Maya speaks beside the sign.'), source, {
    mode: 'frames', seconds: 5, preserveAuthoredText: true,
  });
  assert.equal(changed.audit.ready, false);
  assert.deepEqual(changed.audit.missingAuthoredText, ['Keep rolling...', 'OPEN']);
  assert.ok(changed.audit.issueCodes.includes('missing-authored-text'));

  const untagged = inspectH3PromptOutput(basePrompt(
    '[Shot 1] Maya says "Keep rolling..." beside a sign reading "OPEN".',
  ), source, { mode: 'frames', seconds: 5, preserveAuthoredText: true });
  assert.equal(untagged.audit.ready, false);
  assert.deepEqual(untagged.audit.missingAuthoredText, []);
  assert.deepEqual(untagged.audit.missingDialogueFormat, ['Keep rolling...']);
  assert.ok(untagged.audit.issueCodes.includes('missing-dialogue-format'));

  const missingSpeakerId = inspectH3PromptOutput(basePrompt(
    '[Shot 1] Maya says: <d>[English] Keep rolling...</d> beside a sign reading "OPEN".',
  ), source, { mode: 'frames', seconds: 5, preserveAuthoredText: true });
  assert.equal(missingSpeakerId.audit.ready, false);
  assert.deepEqual(missingSpeakerId.audit.missingDialogueFormat, ['Keep rolling...']);

  const placeholderLanguage = inspectH3PromptOutput(basePrompt(
    '[Shot 1] Maya (S1) says: <d>[Language] Keep rolling...</d> beside a sign reading "OPEN".',
  ), source, { mode: 'frames', seconds: 5, preserveAuthoredText: true });
  assert.equal(placeholderLanguage.audit.ready, false);
  assert.deepEqual(placeholderLanguage.audit.missingDialogueFormat, ['Keep rolling...']);

  const preserved = inspectH3PromptOutput(basePrompt(
    '[Shot 1] Maya (S1) says: <d>[English] Keep rolling...</d> beside a sign reading "OPEN".',
  ), source, { mode: 'frames', seconds: 5, preserveAuthoredText: true });
  assert.equal(preserved.audit.ready, true);
});

test('official rich dialogue remains valid when speaker-name inference is ambiguous', () => {
  const source = 'The baker says "First batch of the morning."';
  const inspected = inspectH3PromptOutput(basePrompt(
    '[Shot 1] The camera pushes in slowly from a medium shot to a close-up as the middle-aged baker with a calm, slightly raspy voice (S1) places a fresh loaf on the wooden counter and says: <d>[English] First batch of the morning.</d>',
  ), source, { mode: 'frames', seconds: 5, preserveAuthoredText: true });

  assert.equal(inspected.audit.ready, true);
  assert.deepEqual(inspected.audit.missingDialogueFormat, []);
});

test('speaker IDs before or without an identity remain invalid enhancement output', () => {
  for (const dialogue of [
    '(S1) Maya says: <d>[English] Hi.</d>',
    '(S1) says: <d>[English] Hi.</d>',
  ]) {
    const inspected = inspectH3PromptOutput(basePrompt(`[Shot 1] ${dialogue}`), 'Maya says "Hi."', {
      mode: 'frames', seconds: 5, preserveAuthoredText: true,
    });
    assert.equal(inspected.audit.ready, false);
    assert.ok(inspected.audit.issueCodes.includes('dialogue-speaker-id'));
    assert.deepEqual(inspected.audit.missingDialogueFormat, ['Hi.']);
  }
});

test('dialogue retry feedback aggregates lines and never repeats a message', () => {
  const source = 'Maya says "One." Leo replies "Two."';
  const inspected = inspectH3PromptOutput(basePrompt(
    '[Shot 1] Maya says: <d>[English] One.</d> Leo replies: <d>[English] Two.</d>',
  ), source, { mode: 'frames', seconds: 5, preserveAuthoredText: true });
  const missingFormatIssues = inspected.audit.issues.filter((issue) => issue.code === 'missing-dialogue-format');
  const feedback = h3PromptValidationFeedback({
    issues: [
      ...inspected.audit.issues,
      { code: 'duplicate', message: missingFormatIssues[0].message },
    ],
  });

  assert.equal(missingFormatIssues.length, 1);
  assert.equal(missingFormatIssues[0].count, 2);
  assert.deepEqual(missingFormatIssues[0].texts, ['One.', 'Two.']);
  assert.equal(
    feedback.match(/Format every clearly attributed spoken line/g)?.length,
    1,
  );
});

test('reference validation preserves every reference token from the authored prompt', () => {
  const inspected = inspectH3PromptOutput(referencePrompt(), 'Use <Picture 1> and <Audio 1>.', {
    mode: 'reference', seconds: 5,
  });
  assert.equal(inspected.audit.ready, false);
  assert.deepEqual(inspected.audit.missingReferenceTokens, ['<Audio 1>']);
});

test('reference validation rejects tags outside the attached-input allowlist', () => {
  const invented = referencePrompt().replace(
    '<Subject 1> opens the shop.',
    '<Subject 1> opens the shop beside <Picture 2>.',
  );
  const inspected = inspectH3PromptOutput(invented, 'Use <Picture 1>.', {
    mode: 'reference',
    seconds: 5,
    allowedReferenceTokens: ['<Picture 1>'],
  });
  assert.equal(inspected.audit.ready, false);
  assert.deepEqual(inspected.audit.unexpectedReferenceTokens, ['<Picture 2>']);
});

test('retry feedback is appended without mutating the original prompt parts', () => {
  const parts = { instruction: 'Follow the guide.', userInput: 'A baker.' };
  const next = appendH3ValidationFeedback(parts, 'Missing overall_soundscape.');
  assert.equal(parts.instruction, 'Follow the guide.');
  assert.match(next.instruction, /rejected by the format checker/);
  assert.match(next.instruction, /Missing overall_soundscape/);
  assert.equal(next.userInput, parts.userInput);
});

test('validation uses the effective duration from MiniMax H3 snapped frames', () => {
  const alignment = 'How the reference pictures align with the target video — <Picture 1> (from [Shot 1]) aligns with the 15.08-second mark of the target video.';
  const inspected = inspectH3PromptOutput(`${alignment}\n\n${basePrompt()}`, 'A baker.', {
    mode: 'frames', seconds: 15, hasLastFrame: true,
  });
  assert.equal(inspected.audit.ready, true);
  assert.equal(inspected.audit.duration, 362 / 24);
});
