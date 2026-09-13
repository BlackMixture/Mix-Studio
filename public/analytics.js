'use strict';

(function analyticsModule(root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  if (root && root.document) root.KreaAnalytics = exported.createAnalytics(root);
}(typeof window !== 'undefined' ? window : null, function analyticsFactory() {
  const OPT_OUT_KEY = 'ks-anonymous-analytics-opt-out';
  const BROWSER_KEY = 'ks-analytics-browser-id-v2';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const NOTICE_KEY = 'ks-anonymous-analytics-notice';
  const ALLOWED_EVENTS = new Set(['App_Launched', 'Generation_Started']);
  const VIDEO_MODELS = Object.freeze({ ltx: 'LTX 2.3', ltx25: 'LTX 2.5', h3: 'MiniMax H3', 'ltx-edit': 'LTX Edit', eros: '10Eros DMD', wan: 'Wan 2.2', 'wan-animate2': 'Wan Animate 2', scail: 'SCAIL 2' });
  const EDIT_MODELS = Object.freeze({ klein4: 'Flux Klein 4B', klein9: 'Flux Klein 9B', qwen: 'Qwen Edit', krea2ref: 'Krea 2 Edit', krea2remix: 'Krea 2 Remix', krea2: 'Krea 2' });
  const MODEL_LABELS = new Set([...Object.values(VIDEO_MODELS), ...Object.values(EDIT_MODELS), 'LTX 2.3 Director', 'Ultimate SD', 'SeedVR2', 'Krea 2 Raw', 'Krea 2 Turbo']);
  const publicModel = (models, engine, fallback) => {
    const key = engine === undefined || engine === null || engine === '' ? fallback : engine;
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(models, key) ? models[key] : '';
  };

  function text(value, max = 80) {
    return String(value || '').trim().slice(0, max);
  }

  function safeEvent(eventName, properties = {}) {
    const event = text(eventName, 60);
    if (!ALLOWED_EVENTS.has(event)) return null;
    const safe = {};
    if (event === 'Generation_Started') {
      const modelName = text(properties.model_name);
      if (!MODEL_LABELS.has(modelName)) return null;
      safe.model_name = modelName;
    }
    return { event, properties: safe };
  }

  function beforeSend(event, identity) {
    if (!event || typeof event !== 'object') return null;
    const original = event.properties && typeof event.properties === 'object' ? event.properties : {};
    const approved = safeEvent(event.event, original);
    if (!approved) return null;
    if (identity && (!identity.enabled() || !UUID.test(original.visit_id) ||
      original.visit_id !== identity.visitId || original.distinct_id !== identity.browserId)) return null;
    const properties = {
      token: original.token,
      distinct_id: original.distinct_id,
      '$process_person_profile': false,
      '$geoip_disable': true,
      ...approved.properties,
      ...(identity ? { visit_id: identity.visitId, measurement_version: 2, identity_scope: identity.scope } : {}),
    };
    Object.keys(properties).forEach((key) => properties[key] === undefined && delete properties[key]);
    const clean = { event: approved.event, properties };
    // Keep the SDK event UUID so ingestion can deduplicate transport retries.
    if (typeof event.uuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.uuid)) clean.uuid = event.uuid;
    // Do not let top-level SDK enrichment bypass the properties allowlist.
    if (event.timestamp instanceof Date && Number.isFinite(event.timestamp.getTime())) clean.timestamp = event.timestamp;
    else if (typeof event.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(event.timestamp)
      && Number.isFinite(Date.parse(event.timestamp))) clean.timestamp = event.timestamp;
    return clean;
  }

  function postHogConfig(host, identity) {
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
      person_profiles: 'never',
      mask_all_text: true,
      mask_all_element_attributes: true,
      before_send: (event) => beforeSend(event, identity),
    };
  }

  function generationModel(path, body) {
    const route = String(path || '').split('?')[0];
    const payload = body && typeof body === 'object' ? body : {};
    if (route === '/api/director/generate') return 'LTX 2.3 Director';
    if (route === '/api/animate') {
      return publicModel(VIDEO_MODELS, payload.engine, 'ltx');
    }
    if (route === '/api/upscale') return publicModel({ ultimate: 'Ultimate SD', seedvr2: 'SeedVR2' }, payload.engine, 'seedvr2');
    if (route !== '/api/generate') return '';
    if (payload.mode !== 'edit') return payload.krea2Turbo === false ? 'Krea 2 Raw' : 'Krea 2 Turbo';
    return publicModel(EDIT_MODELS, payload.editEngine, 'klein9');
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

    // Storage denial must not make the app fail. Fail closed for analytics.
    let storage;
    try { storage = win.localStorage; } catch {}
    const optedOut = () => { try { return !storage || storage.getItem(OPT_OUT_KEY) === '1'; } catch { return true; } };
    let identity = null;
    function randomId() {
      if (typeof win.crypto?.randomUUID === 'function') return win.crypto.randomUUID();
      const bytes = win.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
    }
    function ensureIdentity() {
      if (identity) return true;
      try {
        let browserId = storage.getItem(BROWSER_KEY);
        if (!UUID.test(browserId)) { browserId = randomId(); storage.setItem(BROWSER_KEY, browserId); }
        if (storage.getItem(BROWSER_KEY) !== browserId) return false;
        identity = { browserId, visitId: randomId(), scope: 'browser', enabled: () => {
          try { return !optedOut() && storage.getItem(BROWSER_KEY) === browserId; } catch { return false; }
        } };
        return true;
      } catch { return false; }
    }

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
        ? 'On · a random browser ID measures visits, returns, and model requests. Never prompts, media, or screen recordings.'
        : 'Off on this browser. No anonymous events are sent.';
    }

    function closeNotice(remember = true) {
      const notice = win.document.getElementById('telemetryNotice');
      if (remember) { try { storage.setItem(NOTICE_KEY, 'seen-v2'); } catch {} }
      if (notice) notice.remove();
    }

    function showNotice() {
      if (storage.getItem(NOTICE_KEY) === 'seen-v2' || optedOut()) return;
      const zone = win.document.getElementById('toastZone');
      if (!zone || win.document.getElementById('telemetryNotice')) return;
      const notice = win.document.createElement('div');
      notice.id = 'telemetryNotice';
      notice.className = 'toast telemetry-toast';
      notice.setAttribute('role', 'region');
      notice.setAttribute('aria-live', 'polite');
      notice.setAttribute('aria-labelledby', 'telemetryNoticeTitle');
      notice.setAttribute('aria-describedby', 'telemetryNoticeCopy');
      notice.innerHTML = '<span class="telemetry-toast-copy"><strong id="telemetryNoticeTitle">Usage analytics are on</strong><small id="telemetryNoticeCopy">Mix Studio uses a saved random browser ID to count visits, return visits, and model requests. No prompts, media, screen recording, or generation content. Change this anytime in Preferences.</small></span><span class="telemetry-toast-actions"><button class="telemetry-toast-thanks" type="button">Thanks, continue</button><button class="telemetry-toast-disable" type="button">Disable</button></span>';
      notice.querySelector('.telemetry-toast-disable').addEventListener('click', () => requestSetEnabled(false));
      notice.querySelector('.telemetry-toast-thanks').addEventListener('click', () => closeNotice(true));
      zone.appendChild(notice);
    }

    function send(eventName, properties) {
      const approved = safeEvent(eventName, properties);
      if (!approved || optedOut()) return false;
      if (!initialized || !win.posthog || typeof win.posthog.capture !== 'function') {
        pending.push(approved);
        return true;
      }
      try {
        if (!ensureIdentity()) return false;
        win.posthog.capture(approved.event, { ...approved.properties, distinct_id: identity.browserId, visit_id: identity.visitId }); return true; }
      catch { return false; } // Analytics must never fail a successful generation request.
    }

    function start() {
      idleHandle = null;
      if (!config || !config.enabled || optedOut() || initialized) return;
      if (!ensureIdentity()) return;
      const posthog = installPostHogStub(win, config.host);
      posthog.init(config.key, postHogConfig(config.host, identity));
      initialized = true;
      send('App_Launched', {});
      const queued = pending;
      pending = [];
      queued.forEach((event) => send(event.event, event.properties));
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
        toggle.addEventListener('click', () => requestSetEnabled(optedOut()));
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

    async function requestSetEnabled(enabled) {
      if (!enabled) {
        const message = 'Mix Studio will stop sending anonymous app launch and model start events. You can turn them back on anytime in Preferences.';
        const confirmed = typeof win.askConfirm === 'function'
          ? await win.askConfirm({
            title: 'Disable anonymous analytics?',
            message,
            confirmLabel: 'Disable',
            cancelLabel: 'Keep enabled',
          })
          : (typeof win.confirm === 'function' ? win.confirm(`Disable anonymous analytics? ${message}`) : true);
        if (!confirmed) return false;
      }
      setEnabled(enabled);
      return true;
    }

    function setEnabled(enabled) {
      closeNotice(true);
      if (!enabled) {
        storage.setItem(OPT_OUT_KEY, '1');
        storage.removeItem(BROWSER_KEY);
        identity = null;
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
      if (initialized && win.posthog && typeof win.posthog.opt_in_capturing === 'function') {
        if (!ensureIdentity()) return;
        win.posthog.set_config(postHogConfig(config.host, identity));
        win.posthog.opt_in_capturing();
        send('App_Launched', {});
      }
      else if (config) scheduleStart();
      else { initPromise = null; init(); }
    }

    win.addEventListener?.('storage', (event) => {
      if (event.key === OPT_OUT_KEY || event.key === BROWSER_KEY || event.key === null) {
        pending = [];
        if (optedOut() || !identity || !identity.enabled()) {
          identity = null;
          // Invalidate the old context before any other tab resumes collection.
          if (initialized) win.posthog?.opt_out_capturing?.();
          if (!optedOut()) setEnabled(true);
        }
        updateToggle();
      }
    });

    function trackGenerationRequest(path, options) {
      if (String(options?.method || 'GET').toUpperCase() !== 'POST') return false;
      let body = options && options.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return false; }
      }
      const modelName = generationModel(path, body);
      return modelName ? send('Generation_Started', { model_name: modelName }) : false;
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
    BROWSER_KEY,
    ALLOWED_EVENTS,
    MODEL_LABELS,
    NOTICE_KEY,
    OPT_OUT_KEY,
    beforeSend,
    createAnalytics,
    generationModel,
    postHogConfig,
    safeEvent,
  };
}));
