'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isWidgetSpec, isWidgetType } = require('../lib/comfy-widget-spec');

test('Comfy widget detection accepts numeric unions and widget hints', () => {
  assert.equal(isWidgetType('FLOAT,INT'), true);
  assert.equal(isWidgetSpec(['FLOAT,INT', { default: 1 }]), true);
  assert.equal(isWidgetSpec(['LATENT,IMAGE']), false);
  assert.equal(isWidgetSpec(['LATENT,IMAGE', { widgetType: 'FLOAT' }]), true);
  assert.equal(isWidgetSpec(['COMFY_DYNAMICCOMBO', { options: [] }]), true);
  assert.equal(isWidgetSpec([['one', 'two']]), true);
});
