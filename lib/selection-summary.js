'use strict';

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function selectionAssetRefs(items = []) {
  const refs = [];
  const seen = new Set();
  const add = (kind, file) => {
    if (!file) return;
    const key = `${kind}:${file}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ kind, file: String(file) });
  };
  items.forEach((item) => {
    add('image', item && item.file);
    add('image', item && item.upscaled);
    add('image', item && item.sourceFile);
    (item && item.composites || []).forEach((composite) => add('image', composite && composite.file));
    (item && item.videos || []).forEach((video) => add('video', video && video.file));
  });
  return refs;
}

function selectionSummary(items = [], bytes = 0) {
  const dates = [];
  let generationMs = 0;
  let generationTimesRecorded = 0;
  let generationTimesMissing = 0;
  let videos = 0;
  let composites = 0;
  const addGenerationTime = (value) => {
    const duration = finitePositive(value);
    if (duration) {
      generationMs += duration;
      generationTimesRecorded += 1;
    } else {
      generationTimesMissing += 1;
    }
  };
  items.forEach((item) => {
    if (!item) return;
    if (finitePositive(item.createdAt)) dates.push(Number(item.createdAt));
    addGenerationTime(item.durationMs);
    if (item.upscaled || finitePositive(item.upscaleDurationMs)) addGenerationTime(item.upscaleDurationMs);
    (item.composites || []).forEach((composite) => {
      composites += 1;
      addGenerationTime(composite && composite.durationMs);
      if (finitePositive(composite && composite.createdAt)) dates.push(Number(composite.createdAt));
    });
    (item.videos || []).forEach((video) => {
      videos += 1;
      addGenerationTime(video && video.info && video.info.durationMs);
      if (finitePositive(video && video.createdAt)) dates.push(Number(video.createdAt));
    });
  });
  return {
    items: items.length,
    images: items.length + composites,
    videos,
    files: selectionAssetRefs(items).length,
    bytes: Math.max(0, Number(bytes) || 0),
    generationMs,
    generationTimesRecorded,
    generationTimesMissing,
    generationTimingComplete: generationTimesMissing === 0,
    earliest: dates.length ? Math.min(...dates) : null,
    latest: dates.length ? Math.max(...dates) : null,
  };
}

module.exports = { selectionAssetRefs, selectionSummary };
