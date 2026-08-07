'use strict';

const { cleanGeneratedPrompt } = require('./prompt-enhance');
const { h3EffectiveDurationSeconds } = require('./video-workflows');
const { analyzePrompt, auditStructure } = require('../public/h3-prompt-guide');

function h3PromptReferenceTokens(...values) {
  return [...new Set(values.flatMap((value) => (
    String(value || '').match(/<(?:Picture|Video|Audio)\s+\d+>/g) || []
  )))];
}

function h3AuthoredTextSegments(value) {
  const text = String(value || '');
  const segments = [];
  const add = (segment) => {
    const normalized = String(segment || '').trim();
    if (normalized && !segments.includes(normalized)) segments.push(normalized);
  };
  for (const match of text.matchAll(/<d(?:\s[^>]*)?>\s*\[[^\]\r\n]+\]\s*([\s\S]*?)<\/d>/gi)) add(match[1]);
  for (const match of text.matchAll(/"([^"\r\n]+)"|“([^”\r\n]+)”/g)) add(match[1] !== undefined ? match[1] : match[2]);
  return segments;
}

function h3PromptValidationFeedback(audit) {
  const seen = new Set();
  return (Array.isArray(audit?.issues) ? audit.issues : [])
    .map((issue) => String(issue?.message || issue?.code || '').trim())
    .filter((message) => {
      if (!message || seen.has(message)) return false;
      seen.add(message);
      return true;
    })
    .slice(0, 6)
    .join(' ')
    .slice(0, 900);
}

function inspectH3PromptOutput(raw, fallback, options = {}) {
  const prompt = cleanGeneratedPrompt(raw, options.useFallbackOnEmpty === false ? '' : fallback);
  const seconds = h3EffectiveDurationSeconds(options.seconds);
  const expectedReferenceTokens = options.mode === 'reference'
    ? (Array.isArray(options.expectedReferenceTokens)
      ? options.expectedReferenceTokens
      : h3PromptReferenceTokens(options.referenceSource || fallback))
    : [];
  const audit = auditStructure(prompt, {
    mode: options.mode,
    seconds,
    hasFirstFrame: options.hasFirstFrame === true,
    hasLastFrame: options.hasLastFrame === true,
    expectedReferenceTokens,
    allowedReferenceTokens: options.allowedReferenceTokens,
  });
  if (options.preserveAuthoredText === true) {
    const authoredSource = options.authoredTextSource || options.referenceSource || fallback;
    const missingAuthoredText = h3AuthoredTextSegments(
      authoredSource,
    ).filter((segment) => !prompt.includes(segment));
    for (const text of missingAuthoredText) {
      audit.issues.push({
        code: 'missing-authored-text',
        message: 'Preserve every user-authored spoken or visible quoted word exactly.',
        text,
      });
      audit.issueCodes.push('missing-authored-text');
    }
    if (missingAuthoredText.length) audit.ready = false;
    audit.missingAuthoredText = missingAuthoredText;

    const expectedDialogue = [...new Set(
      analyzePrompt(authoredSource).entries.map((entry) => String(entry.text || '').trim()).filter(Boolean),
    )];
    const formattedDialogue = new Set(
      analyzePrompt(prompt).entries
        .filter((entry) => {
          const language = String(entry.language || '').trim();
          const placeholderLanguage = /^(?:language|lang(?:uage)?\s*(?:name|code)?|unknown|n\/?a|none)$/i.test(language);
          const speakerId = String(entry.speakerId || '').replace(/\s+/g, '').toUpperCase();
          return entry.formatted === true
            && /^S\d+(?:,S\d+)*$/.test(speakerId)
            && entry.hasSpeakerBeforeId === true
            && !!language
            && !placeholderLanguage;
        })
        .map((entry) => String(entry.text || '').trim()),
    );
    const missingDialogueFormat = expectedDialogue.filter((text) => !formattedDialogue.has(text));
    if (missingDialogueFormat.length && !audit.issueCodes.includes('missing-dialogue-format')) {
      audit.issues.push({
        code: 'missing-dialogue-format',
        message: 'Format every clearly attributed spoken line with a stable speaker ID and <d>[Language] ...</d>.',
        texts: missingDialogueFormat,
        count: missingDialogueFormat.length,
      });
      audit.issueCodes.push('missing-dialogue-format');
    }
    if (missingDialogueFormat.length) audit.ready = false;
    audit.missingDialogueFormat = missingDialogueFormat;
  }
  if (options.allowDialogueFormatFallback === true) {
    const dialogueIssueCodes = new Set([
      'compound-speaker-id',
      'dialogue-language',
      'dialogue-speaker-id',
      'missing-dialogue-format',
      'speaker-id-instability',
    ]);
    audit.dialogueWarnings = audit.issues.filter((issue) => dialogueIssueCodes.has(issue.code));
    audit.ready = audit.issues.every((issue) => dialogueIssueCodes.has(issue.code));
  }
  return { prompt, audit };
}

async function validatedH3Prompt(generate, fallback, options = {}) {
  let lastAudit = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const feedback = attempt && lastAudit ? h3PromptValidationFeedback(lastAudit) : '';
    const raw = await generate(attempt, feedback);
    const inspected = inspectH3PromptOutput(raw, fallback, options);
    if (inspected.prompt && inspected.audit.ready) return inspected.prompt;
    if (options.advisoryStructure === true && inspected.prompt) {
      const hardIssueCodes = new Set([
        'empty-prompt',
        'missing-reference-token',
        'unexpected-reference-token',
      ]);
      const hardIssues = inspected.audit.issues.filter((issue) => hardIssueCodes.has(issue.code));
      if (!hardIssues.length) {
        if (typeof options.onAdvisoryResult === 'function') {
          options.onAdvisoryResult({
            attempt: attempt + 1,
            prompt: inspected.prompt,
            audit: inspected.audit,
          });
        }
        return inspected.prompt;
      }
    }
    lastAudit = inspected.audit;
  }
  if (options.fallbackOnFailure === true) return String(fallback || '').trim();
  const detail = h3PromptValidationFeedback(lastAudit) || 'The required fields were incomplete.';
  const error = new Error(`MiniMax H3 prompt formatting failed after a retry. ${detail}`);
  error.code = 'h3_prompt_format';
  error.issues = lastAudit?.issues || [];
  throw error;
}

function appendH3ValidationFeedback(parts, feedback) {
  const correction = String(feedback || '').trim();
  if (!correction) return parts;
  return Object.assign({}, parts, {
    instruction: `${parts.instruction}\n\nYour previous answer was rejected by the format checker. Correct every issue in this retry: ${correction}`,
  });
}

module.exports = {
  appendH3ValidationFeedback,
  h3AuthoredTextSegments,
  h3PromptReferenceTokens,
  h3PromptValidationFeedback,
  inspectH3PromptOutput,
  validatedH3Prompt,
};
