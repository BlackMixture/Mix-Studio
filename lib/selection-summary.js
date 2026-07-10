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
  let videos = 0;
  let composites = 0;
  items.forEach((item) => {
    if (!item) return;
    if (finitePositive(item.createdAt)) dates.push(Number(item.createdAt));
    generationMs += finitePositive(item.durationMs);
    generationMs += finitePositive(item.upscaleDurationMs);
    (item.composites || []).forEach((composite) => {
      composites += 1;
      generationMs += finitePositive(composite && composite.durationMs);
      if (finitePositive(composite && composite.createdAt)) dates.push(Number(composite.createdAt));
    });
    (item.videos || []).forEach((video) => {
      videos += 1;
      generationMs += finitePositive(video && video.info && video.info.durationMs);
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
    earliest: dates.length ? Math.min(...dates) : null,
    latest: dates.length ? Math.max(...dates) : null,
  };
}

module.exports = { selectionAssetRefs, selectionSummary };
