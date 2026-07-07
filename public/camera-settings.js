(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KreaCameraSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CAMERA_PRESETS = [
    { id: 'iphone', label: 'iPhone Camera', tag: 'phone', phrase: 'iPhone computational camera' },
    { id: 'canon80d', label: 'Canon EOS 80D DSLR', tag: 'dslr', phrase: 'Canon EOS 80D DSLR' },
    { id: 'redkomodo', label: 'RED Komodo Cinema', tag: 'digital cinema', phrase: 'RED Komodo cinema camera' },
    { id: 'arri35', label: 'ARRI Alexa 35', tag: 'digital cinema', phrase: 'ARRI Alexa 35' },
    { id: 'sonyvenice', label: 'Sony VENICE', tag: 'large format', phrase: 'Sony VENICE cinema camera' },
    { id: 'filmslr', label: 'Vintage Film SLR', tag: '35mm film', phrase: 'vintage 35mm film SLR' },
  ];

  const LENS_PRESETS = [
    { id: 'spherical-prime', label: 'Premium Modern Prime', tag: 'spherical', phrase: 'premium spherical prime lens' },
    { id: 'anamorphic', label: 'Anamorphic Cinema', tag: 'anamorphic', phrase: 'anamorphic cinema lens' },
    { id: 'photo-zoom', label: 'Canon EF Photo Zoom', tag: 'photo zoom', phrase: 'Canon EF photo zoom lens' },
    { id: 'macro', label: 'Macro Lens', tag: 'close focus', phrase: 'macro lens' },
    { id: 'phone-wide', label: 'Phone Wide Lens', tag: 'wide', phrase: 'phone wide-angle lens' },
  ];

  const FOCAL_LENGTHS = ['14', '24', '35', '50', '85', '100'];
  const APERTURES = ['1.4', '2', '2.8', '4', '5.6', '8'];
  const SHUTTERS = ['1/30', '1/60', '1/125', '1/250', '1/500'];
  const ISOS = ['100', '200', '400', '800', '1600'];

  const DEFAULT_CAMERA_SETTINGS = {
    camera: 'arri35',
    lens: 'spherical-prime',
    focalLength: '35',
    aperture: '4',
    shutter: '1/125',
    iso: '400',
  };

  const CAMERA_COMBOS = [
    {
      id: 'cinematic-arri',
      label: 'Cinematic ARRI',
      note: 'clean studio cinema',
      settings: DEFAULT_CAMERA_SETTINGS,
    },
    {
      id: 'dslr-portrait',
      label: 'DSLR Portrait',
      note: 'soft background',
      settings: {
        camera: 'canon80d',
        lens: 'photo-zoom',
        focalLength: '85',
        aperture: '2.8',
        shutter: '1/250',
        iso: '200',
      },
    },
    {
      id: 'red-product',
      label: 'RED Product',
      note: 'crisp commercial',
      settings: {
        camera: 'redkomodo',
        lens: 'spherical-prime',
        focalLength: '50',
        aperture: '5.6',
        shutter: '1/125',
        iso: '400',
      },
    },
    {
      id: 'iphone-natural',
      label: 'iPhone Natural',
      note: 'casual realism',
      settings: {
        camera: 'iphone',
        lens: 'phone-wide',
        focalLength: '24',
        aperture: '2',
        shutter: '1/60',
        iso: '100',
      },
    },
    {
      id: 'vintage-film',
      label: 'Vintage Film',
      note: '35mm texture',
      settings: {
        camera: 'filmslr',
        lens: 'spherical-prime',
        focalLength: '50',
        aperture: '2.8',
        shutter: '1/125',
        iso: '800',
      },
    },
    {
      id: 'macro-detail',
      label: 'Macro Detail',
      note: 'close focus',
      settings: {
        camera: 'sonyvenice',
        lens: 'macro',
        focalLength: '100',
        aperture: '8',
        shutter: '1/250',
        iso: '400',
      },
    },
  ];

  function byId(list, id) {
    return list.find((item) => item.id === id) || list[0];
  }

  function normalizeSettings(settings) {
    return Object.assign({}, DEFAULT_CAMERA_SETTINGS, settings || {});
  }

  function cameraPromptPhrase(settings) {
    const s = normalizeSettings(settings);
    const camera = byId(CAMERA_PRESETS, s.camera);
    const lens = byId(LENS_PRESETS, s.lens);
    return `shot on ${camera.phrase}, ${lens.phrase}, ${s.focalLength}mm, f/${s.aperture}, ${s.shutter}s shutter, ISO ${s.iso}`;
  }

  const CAMERA_PROMPT_RE = /(?:,\s*)?shot on [^,.]+,\s*[^,.]+,\s*\d+mm,\s*f\/[\d.]+,\s*1\/\d+s shutter,\s*ISO \d+/i;

  function stripCameraPrompt(prompt) {
    return String(prompt || '')
      .replace(CAMERA_PROMPT_RE, '')
      .replace(/\s+,/g, ',')
      .replace(/,\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function applyCameraPrompt(prompt, settings) {
    const base = stripCameraPrompt(prompt);
    const phrase = cameraPromptPhrase(settings);
    return base ? `${base}, ${phrase}` : phrase;
  }

  function applyCameraCombo(comboId, currentSettings) {
    const combo = CAMERA_COMBOS.find((item) => item.id === comboId);
    if (!combo) return normalizeSettings(currentSettings);
    return normalizeSettings(Object.assign({}, currentSettings || {}, combo.settings));
  }

  return {
    CAMERA_PRESETS,
    LENS_PRESETS,
    CAMERA_COMBOS,
    FOCAL_LENGTHS,
    APERTURES,
    SHUTTERS,
    ISOS,
    DEFAULT_CAMERA_SETTINGS,
    normalizeSettings,
    cameraPromptPhrase,
    applyCameraPrompt,
    applyCameraCombo,
  };
});
