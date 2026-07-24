'use strict';

(function supportPromptModule(root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  if (root && root.document) root.KreaSupportPrompt = exported.createSupportPrompt(root);
}(typeof window !== 'undefined' ? window : null, function supportPromptFactory() {
  const STORAGE_KEY = 'ks-support-prompt-v1';
  const MIN_ACTIVE_MS = 30 * 60 * 1000;
  const MIN_GENERATIONS = 5;
  const SNOOZE_MS = 45 * 24 * 60 * 60 * 1000;
  const AUTO_DISMISS_MS = 30 * 1000;
  const CHECK_INTERVAL_MS = 15 * 1000;
  const MAX_ACTIVE_SLICE_MS = 60 * 1000;
  const MAX_IMPRESSIONS = 3;
  const GENERATION_ROUTES = new Set([
    '/api/generate',
    '/api/animate',
    '/api/upscale',
    '/api/director/generate',
  ]);

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function normalizeSupportState(value) {
    const state = value && typeof value === 'object' ? value : {};
    return {
      activeMs: finiteNumber(state.activeMs),
      generations: Math.floor(finiteNumber(state.generations)),
      snoozeUntil: finiteNumber(state.snoozeUntil),
      impressions: Math.floor(finiteNumber(state.impressions)),
      completed: state.completed === true,
    };
  }

  function supportStateEligible(state, now = Date.now(), thresholds = {}) {
    const value = normalizeSupportState(state);
    const minActiveMs = finiteNumber(thresholds.minActiveMs, MIN_ACTIVE_MS);
    const minGenerations = finiteNumber(thresholds.minGenerations, MIN_GENERATIONS);
    const maxImpressions = finiteNumber(thresholds.maxImpressions, MAX_IMPRESSIONS);
    return !value.completed
      && value.activeMs >= minActiveMs
      && value.generations >= minGenerations
      && value.snoozeUntil <= now
      && value.impressions < maxImpressions;
  }

  function createSupportPrompt(win, options = {}) {
    const storage = win.localStorage;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const thresholds = {
      minActiveMs: options.minActiveMs ?? MIN_ACTIVE_MS,
      minGenerations: options.minGenerations ?? MIN_GENERATIONS,
      maxImpressions: options.maxImpressions ?? MAX_IMPRESSIONS,
    };
    let state = readState();
    let visibleSince = win.document.visibilityState === 'hidden' ? 0 : now();
    let intervalHandle = null;
    let autoDismissHandle = null;
    let initialized = false;

    function readState() {
      try {
        return normalizeSupportState(JSON.parse(storage.getItem(STORAGE_KEY) || '{}'));
      } catch {
        return normalizeSupportState({});
      }
    }

    function saveState() {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage may be unavailable */ }
    }

    function accrueActiveTime() {
      if (!visibleSince) return;
      const current = now();
      const elapsed = Math.max(0, current - visibleSince);
      state.activeMs += Math.min(elapsed, MAX_ACTIVE_SLICE_MS);
      visibleSince = current;
      saveState();
    }

    function promptIsClearToShow() {
      const doc = win.document;
      if (doc.visibilityState === 'hidden' || doc.getElementById('supportPrompt')) return false;
      if (doc.querySelector('.sheet.show, #appDrawer.show, #lightbox.show')) return false;
      const firstRun = doc.getElementById('firstRunTutorial');
      const guidedTour = doc.getElementById('guidedTour');
      const updateNotice = doc.getElementById('updateNotice');
      if ((firstRun && !firstRun.hidden) || (guidedTour && !guidedTour.hidden)) return false;
      if (updateNotice && !updateNotice.hidden) return false;
      if (doc.getElementById('telemetryNotice')) return false;
      const active = doc.activeElement;
      if (active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable)) return false;
      const zone = doc.getElementById('toastZone');
      return Boolean(zone && !zone.querySelector('.toast'));
    }

    function removePrompt() {
      if (autoDismissHandle !== null) {
        win.clearTimeout(autoDismissHandle);
        autoDismissHandle = null;
      }
      win.document.getElementById('supportPrompt')?.remove();
    }

    function snooze() {
      state.snoozeUntil = now() + SNOOZE_MS;
      saveState();
      removePrompt();
    }

    function complete() {
      state.completed = true;
      saveState();
      removePrompt();
    }

    function showPrompt() {
      const zone = win.document.getElementById('toastZone');
      if (!zone || !promptIsClearToShow()) return false;
      state.impressions += 1;
      saveState();

      const prompt = win.document.createElement('aside');
      prompt.id = 'supportPrompt';
      prompt.className = 'toast support-prompt';
      prompt.setAttribute('role', 'region');
      prompt.setAttribute('aria-live', 'polite');
      prompt.setAttribute('aria-labelledby', 'supportPromptTitle');
      prompt.setAttribute('aria-describedby', 'supportPromptCopy');
      prompt.innerHTML = '<button class="support-prompt-close" type="button" aria-label="Remind me later">&times;</button><span class="support-prompt-copy"><strong id="supportPromptTitle">Are you enjoying Mix Studio?</strong><small id="supportPromptCopy">If it has been useful, star the project on GitHub or support development on Patreon. Your support helps keep Mix Studio free and open source.</small></span><span class="support-prompt-actions"><a class="support-prompt-github" href="https://github.com/BlackMixture/Mix-Studio" target="_blank" rel="noopener noreferrer">Star on GitHub</a><a class="support-prompt-patreon" href="https://www.patreon.com/BlackMixture" target="_blank" rel="noopener noreferrer">Support on Patreon</a><button class="support-prompt-later" type="button">Maybe later</button></span>';
      prompt.querySelector('.support-prompt-close').addEventListener('click', snooze);
      prompt.querySelector('.support-prompt-later').addEventListener('click', snooze);
      prompt.querySelector('.support-prompt-github').addEventListener('click', complete);
      prompt.querySelector('.support-prompt-patreon').addEventListener('click', complete);
      zone.appendChild(prompt);
      autoDismissHandle = win.setTimeout(snooze, AUTO_DISMISS_MS);
      return true;
    }

    function checkEligibility() {
      accrueActiveTime();
      if (!supportStateEligible(state, now(), thresholds) || !promptIsClearToShow()) return false;
      return showPrompt();
    }

    function handleVisibilityChange() {
      if (win.document.visibilityState === 'hidden') {
        accrueActiveTime();
        visibleSince = 0;
        return;
      }
      visibleSince = now();
      checkEligibility();
    }

    function init() {
      if (initialized) return;
      initialized = true;
      win.document.addEventListener('visibilitychange', handleVisibilityChange);
      intervalHandle = win.setInterval(checkEligibility, CHECK_INTERVAL_MS);
      checkEligibility();
    }

    function recordGenerationRequest(path) {
      const route = String(path || '').split('?')[0];
      if (!GENERATION_ROUTES.has(route)) return false;
      accrueActiveTime();
      state.generations += 1;
      saveState();
      win.setTimeout(checkEligibility, CHECK_INTERVAL_MS);
      return true;
    }

    function destroy() {
      accrueActiveTime();
      if (intervalHandle !== null) win.clearInterval(intervalHandle);
      win.document.removeEventListener('visibilitychange', handleVisibilityChange);
      removePrompt();
      initialized = false;
    }

    return {
      destroy,
      init,
      recordGenerationRequest,
    };
  }

  return {
    AUTO_DISMISS_MS,
    MAX_IMPRESSIONS,
    MIN_ACTIVE_MS,
    MIN_GENERATIONS,
    SNOOZE_MS,
    STORAGE_KEY,
    createSupportPrompt,
    normalizeSupportState,
    supportStateEligible,
  };
}));
