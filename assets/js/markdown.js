/**
 * 轻量 Markdown 渲染器（写作页文章 + 关于页正文共用）
 * 支持：代码块、标题、引用、列表、图片、链接、行内代码、加粗、斜体、删除线
 */
(function () {
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(src) {
  if (!src) return '';
  const codeBlocks = [];

  // 1. 抽出代码块，避免内部内容被当作 markdown 处理
  let text = src.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = codeBlocks.length;
    codeBlocks.push({ lang, code });
    return `\u0000CODEBLOCK${i}\u0000`;
  });

  // 2. 整体转义 HTML
  text = escapeHtml(text);

  // 3. 按行解析块级结构
  const lines = text.split('\n');
  const out = [];
  let para = [], listType = null, listItems = [], inQuote = false;

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join('<br>'))}</p>`); para = []; }
  };
  const flushList = () => {
    if (listItems.length) {
      out.push(`<${listType}>${listItems.map(li => `<li>${inline(li)}</li>`).join('')}</${listType}>`);
      listItems = []; listType = null;
    }
  };
  const flushQuote = () => {
    if (inQuote) { out.push('</blockquote>'); inQuote = false; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^\u0000CODEBLOCK\d+\u0000$/.test(line.trim())) {
      flushPara(); flushList(); flushQuote();
      out.push(line.trim());
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); flushQuote(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) { flushPara(); flushList(); flushQuote(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushPara(); flushList(); flushQuote(); out.push('<hr>'); continue; }

    const q = line.match(/^&gt;\s?(.*)/);
    if (q) {
      flushPara(); flushList();
      if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
      out.push(`<p>${inline(q[1])}</p>`);
      continue;
    }
    flushQuote();

    const ul = line.match(/^[-*+]\s+(.*)/);
    const ol = line.match(/^\d+[.)]\s+(.*)/);
    if (ul) {
      flushPara();
      if (listType !== 'ul') flushList();
      listType = 'ul'; listItems.push(ul[1]);
      continue;
    }
    if (ol) {
      flushPara();
      if (listType !== 'ol') flushList();
      listType = 'ol'; listItems.push(ol[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara(); flushList(); flushQuote();

  // 4. 填回代码块
  return out.join('\n').replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_, i) => {
    const { lang, code } = codeBlocks[+i];
    return `<pre><code${lang ? ` class="lang-${escapeHtml(lang)}"` : ''}>${escapeHtml(code)}</code></pre>`;
  });

  // 行内元素
  function inline(s) {
    return s
      .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img src="$2" alt="$1" loading="lazy">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  }
}
  window.renderMarkdown = renderMarkdown;
})();
