'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const start = app.indexOf('function wireHorizontalScroller(scroller)');
const end = app.indexOf('function renderDesktopStagePicker', start);
assert.ok(start >= 0 && end > start, 'wireHorizontalScroller source is available');
const source = app.slice(start, end);
const wireHorizontalScroller = new Function('setTimeout', `${source}\nreturn wireHorizontalScroller;`)(() => 1);

function makeScroller() {
  const listeners = new Map();
  const classes = new Set();
  const captured = new Set();
  const scroller = {
    dataset: {},
    scrollLeft: 50,
    scrollWidth: 500,
    clientWidth: 200,
    captureCalls: [],
    releaseCalls: [],
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    setPointerCapture(pointerId) {
      scroller.captureCalls.push(pointerId);
      captured.add(pointerId);
    },
    hasPointerCapture(pointerId) {
      return captured.has(pointerId);
    },
    releasePointerCapture(pointerId) {
      scroller.releaseCalls.push(pointerId);
      captured.delete(pointerId);
    },
    emit(type, overrides = {}) {
      const event = {
        button: 0,
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 100,
        deltaX: 0,
        deltaY: 0,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        ...overrides,
      };
      listeners.get(type)?.(event);
      return event;
    },
  };
  return scroller;
}

test('horizontal picker leaves ordinary pointer clicks with the child target', () => {
  const scroller = makeScroller();
  wireHorizontalScroller(scroller);

  scroller.emit('pointerdown');
  scroller.emit('pointerup');
  const click = scroller.emit('click');

  assert.deepEqual(scroller.captureCalls, []);
  assert.equal(click.defaultPrevented, false);
  assert.equal(click.propagationStopped, false);
  assert.equal(scroller.scrollLeft, 50);
});

test('horizontal picker captures only after a drag and suppresses its trailing click', () => {
  const scroller = makeScroller();
  wireHorizontalScroller(scroller);

  scroller.emit('pointerdown');
  const move = scroller.emit('pointermove', { clientX: 89 });
  scroller.emit('pointerup');
  const trailingClick = scroller.emit('click');
  const nextClick = scroller.emit('click');

  assert.deepEqual(scroller.captureCalls, [1]);
  assert.deepEqual(scroller.releaseCalls, [1]);
  assert.equal(move.defaultPrevented, true);
  assert.equal(scroller.scrollLeft, 61);
  assert.equal(trailingClick.defaultPrevented, true);
  assert.equal(trailingClick.propagationStopped, true);
  assert.equal(nextClick.defaultPrevented, false);
});

test('horizontal picker leaves touch gestures to native horizontal scrolling', () => {
  const scroller = makeScroller();
  wireHorizontalScroller(scroller);

  scroller.emit('pointerdown', { pointerType: 'touch' });
  const move = scroller.emit('pointermove', { pointerType: 'touch', clientX: 70 });
  scroller.emit('pointerup', { pointerType: 'touch' });

  assert.deepEqual(scroller.captureCalls, []);
  assert.equal(move.defaultPrevented, false);
  assert.equal(scroller.scrollLeft, 50);
});
