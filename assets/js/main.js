/* 小信号 · 全站共享脚本 */
(() => {
  // ===== 主题 =====
  const html = document.documentElement;
  let ls = null;
  try { ls = window.localStorage; } catch (e) {}

  const savedTheme = ls ? ls.getItem('theme') || 'dark' : 'dark';
  html.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  document.getElementById('themeBtn')?.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    if (ls) ls.setItem('theme', next);
    updateThemeIcon(next);
  });

  function updateThemeIcon(theme) {
    const sun = document.getElementById('sunIcon');
    const moon = document.getElementById('moonIcon');
    if (!sun || !moon) return;
    sun.style.display = theme === 'dark' ? 'block' : 'none';
    moon.style.display = theme === 'dark' ? 'none' : 'block';
  }

  // ===== 移动端菜单 =====
  document.getElementById('menuBtn')?.addEventListener('click', () => {
    document.getElementById('mobileNav')?.classList.add('active');
  });
  document.getElementById('mobileNavClose')?.addEventListener('click', () => {
    document.getElementById('mobileNav')?.classList.remove('active');
  });

  // ===== 金句折叠（全站事件委托） =====
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('show-more')) return;
    const container = e.target.closest('.post, .entry');
    if (!container) return;
    const body = container.querySelector('.post-content, .entry-body');
    if (!body) return;
    const clamped = body.classList.toggle('clamped');
    e.target.textContent = clamped ? '展开全文' : '收起';
  });

  // ===== 共享工具 =====
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function hostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (e) { return ''; }
  }

  function isNotion(url) {
    return /notion\.(so|com)/.test(url || '');
  }

  // 中文日期：2026年6月3日
  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // 微信读书时间戳（秒）转日期
  function formatTs(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // 「——」开头的行视为出处，弱化显示
  function renderQuoteBody(text) {
    return escapeHtml(text).split('\n').map(line => {
      const t = line.trim();
      if (/^——|^—|^──/.test(t)) return `<span class="attr">${line}</span>`;
      return line;
    }).join('\n');
  }

  function needsClamp(text) {
    return (text || '').length > 160 || (text || '').split('\n').length > 6;
  }

  // 外链帖：域名前置行
  function sourceLink(url, cls) {
    if (!url || isNotion(url)) return '';
    const host = hostname(url);
    if (!host) return '';
    return `<a class="${cls}" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(host)}</a>`;
  }

  async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  window.siteUtils = { escapeHtml, hostname, isNotion, formatDate, formatTs, renderQuoteBody, needsClamp, sourceLink, loadJSON };
})();
