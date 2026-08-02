'use strict';

const SCALAR_WIDGET_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO']);

function isWidgetType(value) {
  const members = String(value || '').split(',').map((member) => member.trim().toUpperCase()).filter(Boolean);
  return members.length > 0 && members.every((member) => SCALAR_WIDGET_TYPES.has(member));
}

function isWidgetSpec(spec) {
  if (!Array.isArray(spec)) return false;
  const type = spec[0];
  if (Array.isArray(type)) return true;
  if (typeof type !== 'string') return false;
  if (type.startsWith('COMFY_') && type.includes('COMBO')) return true;

  const members = type.split(',').map((value) => value.trim()).filter(Boolean);
  if (members.length && members.every(isWidgetType)) return true;

  // Newer ComfyUI schemas can retain a connection-compatible union in the
  // main type while identifying the serialized widget through this hint.
  return isWidgetType(spec[1]?.widgetType);
}

module.exports = {
  SCALAR_WIDGET_TYPES,
  isWidgetSpec,
  isWidgetType,
};
