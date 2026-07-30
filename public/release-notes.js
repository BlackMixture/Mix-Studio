(function initMixStudioReleaseNotes(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MixStudioReleaseNotes = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderInline(value) {
    const placeholders = [];
    const stash = (html) => {
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    };

    let html = escapeHtml(value);
    html = html.replace(/`([^`\n]+)`/g, (_match, code) => stash(`<code>${code}</code>`));
    html = html.replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_match, label, url) => stash(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`),
    );
    html = html
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,!?;:)])/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,!?;:)])/g, '$1<em>$2</em>');

    return html.replace(/\u0000(\d+)\u0000/g, (_match, index) => placeholders[Number(index)] || '');
  }

  function toHtml(value) {
    const lines = String(value == null ? '' : value).replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let paragraph = [];
    let listType = '';
    let inCode = false;
    let codeLines = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(`<p>${renderInline(paragraph.join(' ').trim())}</p>`);
      paragraph = [];
    };
    const closeList = () => {
      if (!listType) return;
      blocks.push(`</${listType}>`);
      listType = '';
    };
    const openList = (nextType) => {
      if (listType === nextType) return;
      closeList();
      listType = nextType;
      blocks.push(`<${listType}>`);
    };

    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        if (inCode) {
          blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
          codeLines = [];
          inCode = false;
        } else {
          flushParagraph();
          closeList();
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        codeLines.push(line);
        continue;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        closeList();
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = heading[1].length <= 2 ? 3 : 4;
        blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        continue;
      }

      if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) {
        flushParagraph();
        closeList();
        blocks.push('<hr>');
        continue;
      }

      const unordered = trimmed.match(/^[-+*]\s+(.+)$/);
      if (unordered) {
        flushParagraph();
        openList('ul');
        blocks.push(`<li>${renderInline(unordered[1])}</li>`);
        continue;
      }

      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (ordered) {
        flushParagraph();
        openList('ol');
        blocks.push(`<li>${renderInline(ordered[1])}</li>`);
        continue;
      }

      const quote = trimmed.match(/^>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        closeList();
        blocks.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
        continue;
      }

      closeList();
      paragraph.push(trimmed);
    }

    if (inCode) blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    flushParagraph();
    closeList();
    return blocks.join('');
  }

  return { toHtml };
}));
