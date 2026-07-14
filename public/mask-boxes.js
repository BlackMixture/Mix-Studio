'use strict';

(function initMaskBoxGeometry(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MaskBoxGeometry = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const MIN_SIZE = 0.04;
  const MAX_BOXES = 12;

  function clamp(value, min = 0, max = 1) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : min));
  }

  function normalizeBox(value = {}, index = 0) {
    const minSize = MIN_SIZE;
    let x = clamp(value.x, 0, 1 - minSize);
    let y = clamp(value.y, 0, 1 - minSize);
    const fallbackWidth = 0.34;
    const fallbackHeight = 0.4;
    const rawWidth = Number(value.w);
    const rawHeight = Number(value.h);
    const w = Math.max(minSize, Math.min(1 - x, Number.isFinite(rawWidth) ? rawWidth : fallbackWidth));
    const h = Math.max(minSize, Math.min(1 - y, Number.isFinite(rawHeight) ? rawHeight : fallbackHeight));
    x = Math.min(x, 1 - w);
    y = Math.min(y, 1 - h);
    return {
      ...value,
      id: String(value.id || `mb${Date.now()}${index}`),
      x,
      y,
      w,
      h,
    };
  }

  function rectFromPoints(start = {}, end = {}) {
    const ax = clamp(start.x);
    const ay = clamp(start.y);
    const bx = clamp(end.x);
    const by = clamp(end.y);
    return {
      x: Math.min(ax, bx),
      y: Math.min(ay, by),
      w: Math.abs(bx - ax),
      h: Math.abs(by - ay),
    };
  }

  function defaultBox(index = 0, id = '') {
    const offset = (Math.max(0, Number(index) || 0) % 7) * 0.045;
    return normalizeBox({
      id: id || `mb${Date.now()}${index}`,
      x: Math.min(0.56, 0.12 + offset),
      y: Math.min(0.5, 0.14 + offset),
      w: 0.34,
      h: 0.4,
    }, index);
  }

  function moveBox(value, dx, dy) {
    const box = normalizeBox(value);
    return {
      ...box,
      x: clamp(box.x + Number(dx || 0), 0, 1 - box.w),
      y: clamp(box.y + Number(dy || 0), 0, 1 - box.h),
    };
  }

  function resizeBox(value, handle, dx, dy) {
    const box = normalizeBox(value);
    const direction = String(handle || '').toLowerCase();
    let left = box.x;
    let top = box.y;
    let right = box.x + box.w;
    let bottom = box.y + box.h;
    const changeX = Number(dx || 0);
    const changeY = Number(dy || 0);
    if (direction.includes('w')) left = clamp(left + changeX, 0, right - MIN_SIZE);
    if (direction.includes('e')) right = clamp(right + changeX, left + MIN_SIZE, 1);
    if (direction.includes('n')) top = clamp(top + changeY, 0, bottom - MIN_SIZE);
    if (direction.includes('s')) bottom = clamp(bottom + changeY, top + MIN_SIZE, 1);
    return {
      ...box,
      x: left,
      y: top,
      w: right - left,
      h: bottom - top,
    };
  }

  function cycleBoxId(boxes, activeId, direction = 1) {
    if (!Array.isArray(boxes) || !boxes.length) return null;
    const current = boxes.findIndex((box) => box && box.id === activeId);
    const step = Number(direction) < 0 ? -1 : 1;
    const next = current < 0
      ? (step < 0 ? boxes.length - 1 : 0)
      : (current + step + boxes.length) % boxes.length;
    return boxes[next] && boxes[next].id;
  }

  function pixelRects(boxes, width, height) {
    const canvasWidth = Math.max(1, Number(width) || 1);
    const canvasHeight = Math.max(1, Number(height) || 1);
    return (Array.isArray(boxes) ? boxes : []).slice(0, MAX_BOXES).map((box, index) => {
      const normalized = normalizeBox(box, index);
      return {
        x: normalized.x * canvasWidth,
        y: normalized.y * canvasHeight,
        w: normalized.w * canvasWidth,
        h: normalized.h * canvasHeight,
      };
    });
  }

  return {
    MIN_SIZE,
    MAX_BOXES,
    normalizeBox,
    rectFromPoints,
    defaultBox,
    moveBox,
    resizeBox,
    cycleBoxId,
    pixelRects,
  };
}));
