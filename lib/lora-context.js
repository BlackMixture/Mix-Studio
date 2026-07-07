'use strict';

const DEFAULT_OPTIONS = {
  minPhraseChars: 4,
  maxPhraseChars: 140,
  minSuggestionCount: 2,
  minSuggestionShare: 0.5,
};

function roundStrength(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(2, Math.round(n * 20) / 20));
}

function cleanPhrase(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
    .trim();
}

function promptPhrases(prompt, opts = {}) {
  const options = Object.assign({}, DEFAULT_OPTIONS, opts);
  const seen = new Set();
  const phrases = [];
  for (const raw of String(prompt || '').split(/[.;,\n]+/)) {
    const text = cleanPhrase(raw);
    const key = text.toLowerCase();
    if (
      text.length < options.minPhraseChars ||
      text.length > options.maxPhraseChars ||
      seen.has(key)
    ) continue;
    seen.add(key);
    phrases.push(text);
  }
  return phrases;
}

function observationRecords(item) {
  const records = [];
  if (item && Array.isArray(item.loras) && item.loras.length) {
    records.push({ prompt: item.prompt || '', loras: item.loras, createdAt: item.createdAt || 0 });
  }
  for (const video of (item && item.videos) || []) {
    const info = video && video.info;
    if (!info || !Array.isArray(info.loras) || !info.loras.length) continue;
    records.push({
      prompt: info.motionPrompt || item.prompt || '',
      loras: info.loras,
      createdAt: video.createdAt || item.createdAt || 0,
    });
  }
  return records;
}

function sortedEntries(map) {
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.latestAt - a.latestAt;
  });
}

function buildLoraContext(items, opts = {}) {
  const options = Object.assign({}, DEFAULT_OPTIONS, opts);
  const profiles = new Map();

  for (const item of items || []) {
    for (const record of observationRecords(item)) {
      const phrases = promptPhrases(record.prompt, options);
      for (const lora of record.loras || []) {
        if (!lora || !lora.name) continue;
        let profile = profiles.get(lora.name);
        if (!profile) {
          profile = {
            name: lora.name,
            uses: 0,
            strengths: new Map(),
            phrases: new Map(),
            latestAt: 0,
          };
          profiles.set(lora.name, profile);
        }

        const latestAt = Number(record.createdAt) || 0;
        profile.uses += 1;
        profile.latestAt = Math.max(profile.latestAt, latestAt);

        const strength = roundStrength(lora.strength);
        const strengthKey = strength.toFixed(2);
        const strengthEntry = profile.strengths.get(strengthKey) || { strength, count: 0, latestAt: 0 };
        strengthEntry.count += 1;
        strengthEntry.latestAt = Math.max(strengthEntry.latestAt, latestAt);
        profile.strengths.set(strengthKey, strengthEntry);

        for (const phrase of phrases) {
          const key = phrase.toLowerCase();
          const phraseEntry = profile.phrases.get(key) || { text: phrase, count: 0, latestAt: 0 };
          phraseEntry.count += 1;
          phraseEntry.latestAt = Math.max(phraseEntry.latestAt, latestAt);
          profile.phrases.set(key, phraseEntry);
        }
      }
    }
  }

  const out = {};
  for (const [name, profile] of profiles.entries()) {
    const strengths = sortedEntries(profile.strengths);
    const phrases = sortedEntries(profile.phrases).slice(0, 5);
    const suggestionEntry = phrases.find((p) => (
      p.count >= options.minSuggestionCount &&
      p.count / Math.max(1, profile.uses) >= options.minSuggestionShare
    ));
    out[name] = {
      uses: profile.uses,
      defaultStrength: strengths.length ? strengths[0].strength : 1,
      strengths: strengths.map((s) => ({ strength: s.strength, count: s.count })),
      phrases: phrases.map((p) => ({ text: p.text, count: p.count })),
      suggestion: suggestionEntry ? suggestionEntry.text : null,
    };
  }
  return out;
}

module.exports = {
  buildLoraContext,
  promptPhrases,
  roundStrength,
};
