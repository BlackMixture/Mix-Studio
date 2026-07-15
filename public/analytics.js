'use strict';

(function analyticsModule(root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  if (root && root.document) root.KreaAnalytics = exported.createAnalytics(root);
}(typeof window !== 'undefined' ? window : null, function analyticsFactory() {
  const OPT_OUT_KEY = 'ks-anonymous-analytics-opt-out';
  const NOTICE_KEY = 'ks-anonymous-analytics-notice';
  const ALLOWED_EVENTS = new Set(['App_Launched', 'Generation_Started']);

  function text(value, max = 80) {
    return String(value || '').trim().slice(0, max);
  }

  function safeEvent(eventName, properties = {}) {
    const event = text(eventName, 60);
    if (!ALLOWED_EVENTS.has(event)) return null;
    const safe = {};
    if (event === 'Generation_Started') {
      const modelName = text(properties.model_name);
      if (!modelName) return null;
      safe.model_name = modelName;
    }
    return { event, properties: safe };
  }

  function beforeSend(event) {
    if (!event || typeof event !== 'object') return null;
    const original = event.properties && typeof event.properties === 'object' ? event.properties : {};
    const approved = safeEvent(event.event, original);
    if (!approved) return null;
    const properties = {
      token: original.token,
      distinct_id: original.distinct_id,
      '$process_person_profile': false,
      '$geoip_disable': true,
      ...approved.properties,
    };
    Object.keys(properties).forEach((key) => properties[key] === undefined && delete properties[key]);
    return { ...event, event: approved.event, properties };
  }

  function postHogConfig(host) {
    return {
      api_host: host,
      persistence: 'memory',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_dead_clicks: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      person_profiles: 'identified_only',
      mask_all_text: true,
      mask_all_element_attributes: true,
      before_send: beforeSend,
    };
  }

  function generationModel(path, body) {
    const route = String(path || '').split('?')[0];
    const payload = body && typeof body === 'object' ? body : {};
    if (route === '/api/director/generate') return 'LTX 2.3 Director';
    if (route === '/api/animate') {
      return { ltx: 'LTX 2.3', 'ltx-edit': 'LTX Edit', eros: '10Eros DMD', wan: 'Wan 2.2', scail: 'SCAIL 2' }[payload.engine] || 'LTX 2.3';
    }
    if (route === '/api/upscale') return payload.engine === 'ultimate' ? 'Ultimate SD' : 'SeedVR2';
    if (route !== '/api/generate') return '';
    if (payload.mode !== 'edit') return payload.krea2Turbo === false ? 'Krea 2 Raw' : 'Krea 2 Turbo';
    return { klein4: 'Flux Klein 4B', klein9: 'Flux Klein 9B', qwen: 'Qwen Edit', krea2ref: 'Krea 2 Edit', krea2: 'Krea 2' }[payload.editEngine] || 'Flux Klein 9B';
  }

  function installPostHogStub(win, host) {
    if (win.posthog && win.posthog.__SV) return win.posthog;
    const posthog = win.posthog || [];
    win.posthog = posthog;
    posthog._i = [];
    posthog.init = function init(key, config, name) {
      function queueMethod(target, method) {
        const parts = method.split('.');
        if (parts.length === 2) target = target[parts[0]];
        const methodName = parts[parts.length - 1];
        target[methodName] = function queuedMethod() {
          target.push([methodName].concat(Array.prototype.slice.call(arguments)));
        };
      }
      const script = win.document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `${host}/static/array.js`;
      script.dataset.kreaAnalytics = 'posthog';
      win.document.head.appendChild(script);
      let instance = posthog;
      if (name) instance = posthog[name] = [];
      else name = 'posthog';
      instance.people = instance.people || [];
      'capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing opt_in_capturing reset'.split(' ')
        .forEach((method) => queueMethod(instance, method));
      posthog._i.push([key, config, name]);
    };
    posthog.__SV = 1;
    return posthog;
  }

  function createAnalytics(win) {
    let config = null;
    let initPromise = null;
    let initialized = false;
    let pending = [];
    let idleHandle = null;

    const storage = win.localStorage;
    const optedOut = () => storage.getItem(OPT_OUT_KEY) === '1';

    function updateToggle() {
      const toggle = win.document.getElementById('analyticsToggle');
      const status = win.document.getElementById('analyticsToggleStatus');
      if (!toggle) return;
      toggle.hidden = !config;
      if (!config) return;
      const enabled = !optedOut();
      toggle.setAttribute('aria-checked', String(enabled));
      toggle.classList.toggle('active', enabled);
      if (status) status.textContent = enabled
        ? 'Shares app launches and the generation model only. Never prompts or media.'
        : 'Anonymous analytics are off on this browser.';
    }

    function closeNotice(remember = true) {
      const notice = win.document.getElementById('telemetryNotice');
      if (remember) storage.setItem(NOTICE_KEY, 'seen');
      if (notice) notice.remove();
    }

    function showNotice() {
      if (storage.getItem(NOTICE_KEY) === 'seen' || optedOut()) return;
      const zone = win.document.getElementById('toastZone');
      if (!zone || win.document.getElementById('telemetryNotice')) return;
      const notice = win.document.createElement('div');
      notice.id = 'telemetryNotice';
      notice.className = 'toast telemetry-toast';
      notice.setAttribute('role', 'status');
      notice.innerHTML = '<span class="telemetry-toast-copy"><strong>Anonymous usage analytics</strong><small>Mix Studio shares app launches and the generation model to improve the app. No prompts, images, video, accounts, or saved identifiers.</small></span><button class="telemetry-toast-optout" type="button">Don\'t share</button><button class="telemetry-toast-close" type="button" aria-label="Dismiss analytics notice">&times;</button>';
      notice.querySelector('.telemetry-toast-optout').addEventListener('click', () => setEnabled(false));
      notice.querySelector('.telemetry-toast-close').addEventListener('click', () => closeNotice(true));
      zone.appendChild(notice);
    }

    function send(eventName, properties) {
      const approved = safeEvent(eventName, properties);
      if (!approved || optedOut()) return false;
      if (!initialized || !win.posthog || typeof win.posthog.capture !== 'function') {
        pending.push(approved);
        return true;
      }
      win.posthog.capture(approved.event, approved.properties);
      return true;
    }

    function start() {
      idleHandle = null;
      if (!config || !config.enabled || optedOut() || initialized) return;
      const posthog = installPostHogStub(win, config.host);
      posthog.init(config.key, postHogConfig(config.host));
      initialized = true;
      posthog.capture('App_Launched', {});
      const queued = pending;
      pending = [];
      queued.forEach((event) => posthog.capture(event.event, event.properties));
    }

    function scheduleStart() {
      if (idleHandle !== null || initialized || optedOut()) return;
      if (typeof win.requestIdleCallback === 'function') idleHandle = win.requestIdleCallback(start, { timeout: 4000 });
      else idleHandle = win.setTimeout(start, 1200);
    }

    function init() {
      updateToggle();
      const toggle = win.document.getElementById('analyticsToggle');
      if (toggle && !toggle.dataset.analyticsWired) {
        toggle.dataset.analyticsWired = 'true';
        toggle.addEventListener('click', () => setEnabled(optedOut()));
      }
      if (initPromise) return initPromise;
      initPromise = win.fetch('/api/analytics-config', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((value) => {
          config = value && value.enabled ? value : null;
          updateToggle();
          if (!config || optedOut()) { pending = []; return false; }
          showNotice();
          scheduleStart();
          return true;
        })
        .catch(() => { pending = []; return false; });
      return initPromise;
    }

    function setEnabled(enabled) {
      closeNotice(true);
      if (!enabled) {
        storage.setItem(OPT_OUT_KEY, '1');
        pending = [];
        if (idleHandle !== null) {
          if (typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idleHandle);
          else win.clearTimeout(idleHandle);
          idleHandle = null;
        }
        if (initialized && win.posthog && typeof win.posthog.opt_out_capturing === 'function') win.posthog.opt_out_capturing();
        updateToggle();
        return;
      }
      storage.removeItem(OPT_OUT_KEY);
      updateToggle();
      if (initialized && win.posthog && typeof win.posthog.opt_in_capturing === 'function') win.posthog.opt_in_capturing();
      else if (config) scheduleStart();
      else { initPromise = null; init(); }
    }

    function trackGenerationRequest(path, options) {
      let body = options && options.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const modelName = generationModel(path, body);
      if (modelName) send('Generation_Started', { model_name: modelName });
    }

    return {
      init,
      isOptedOut: optedOut,
      setEnabled,
      trackEvent: send,
      trackGenerationRequest,
    };
  }

  return {
    ALLOWED_EVENTS,
    NOTICE_KEY,
    OPT_OUT_KEY,
    beforeSend,
    createAnalytics,
    generationModel,
    postHogConfig,
    safeEvent,
  };
}));
