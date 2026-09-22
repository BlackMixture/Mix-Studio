/* Themed model choices backed by a select for settings serialization. */
'use strict';
(() => {
  for (const select of document.querySelectorAll('select[data-model-select]')) {
    const root = document.createElement('div');
    root.className = 'model-select';
    select.before(root);
    root.append(select);
    select.hidden = true;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'model-select-trigger';
    trigger.id = `${select.id}Trigger`;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const label = document.querySelector(`label[for="${select.id}"]`);
    if (label) { label.id ||= `${select.id}Label`; label.htmlFor = trigger.id; trigger.setAttribute('aria-labelledby', `${label.id} ${select.id}Value`); }
    const value = document.createElement('span');
    value.id = `${select.id}Value`;
    const chevron = document.createElement('span'); chevron.textContent = '⌄'; chevron.setAttribute('aria-hidden', 'true');
    trigger.append(value, chevron);
    const menu = document.createElement('div');
    menu.className = 'model-select-options';
    menu.id = `${select.id}Options`;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', label?.textContent || 'Model choice');
    menu.inert = true;
    trigger.setAttribute('aria-controls', menu.id);
    root.append(trigger, menu);
    const options = [...select.options].map((option) => {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'option');
      button.textContent = option.textContent; button.dataset.value = option.value; button.tabIndex = -1;
      button.addEventListener('click', () => {
        select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); sync(); close(true);
      });
      menu.append(button); return button;
    });
    function sync() {
      value.textContent = select.selectedOptions[0]?.textContent || '';
      trigger.disabled = select.disabled;
      for (const button of options) button.setAttribute('aria-selected', String(button.dataset.value === select.value));
    }
    function close(focus = false) {
      root.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); menu.inert = true;
      if (focus) trigger.focus({ preventScroll: true });
    }
    function open() {
      if (select.disabled) return;
      sync(); root.classList.add('open'); trigger.setAttribute('aria-expanded', 'true'); menu.inert = false;
      (options.find(b => b.dataset.value === select.value) || options[0])?.focus();
    }
    trigger.addEventListener('click', () => root.classList.contains('open') ? close() : open());
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      if (event.key === 'Tab') close();
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        if (!root.classList.contains('open')) return open();
        const current = options.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      }
    });
    document.addEventListener('pointerdown', (event) => { if (!root.contains(event.target)) close(); });
    root.addEventListener('focusout', (event) => { if (!root.contains(event.relatedTarget)) close(); });
    select.addEventListener('change', sync);
    // App renderers set .value directly when restoring profile or gallery state.
    select.modelSelectSync = sync;
    new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'] });
    sync();
  }
})();
