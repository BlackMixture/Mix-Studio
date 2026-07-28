'use strict';

(() => {
  let installPrompt = null;

  const standalone = () => (
    window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  );

  function installButton() {
    return document.getElementById('installAppBtn');
  }

  function renderInstallButton() {
    const button = installButton();
    if (!button) return;
    const installed = standalone();
    button.hidden = installed || !installPrompt;
    button.disabled = installed || !installPrompt;
    button.setAttribute('aria-hidden', button.hidden ? 'true' : 'false');
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    try {
      await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    } catch (error) {
      console.warn('Mix Studio app installation is unavailable', error);
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    renderInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    renderInstallButton();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const button = installButton();
    if (button) {
      button.addEventListener('click', async () => {
        if (!installPrompt) return;
        const prompt = installPrompt;
        installPrompt = null;
        renderInstallButton();
        await prompt.prompt();
        await prompt.userChoice.catch(() => null);
      });
    }
    renderInstallButton();
    registerServiceWorker();
  });
})();
