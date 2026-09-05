/**
 * 生成 rss.xml
 *
 * 订阅内容策略（借鉴 Jant 的「发布 ≠ 推送」）：
 *   - 精选金句（Notion 里勾选「精选」）+ 全部想法 进 RSS
 *   - 如果没有任何精选，回退为最近 20 条金句，保证订阅者不会拿到空 feed
 *   - 按时间倒序合并，最多 50 条
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const SITE_URL = 'https://daheitian.github.io/seesquotes/';
const SITE_TITLE = '小信号';
const SITE_DESC = '一些金句 一些思考 一些优质信息源 —— 同步自 Notion 与微信读书';
const LIMIT = 50;

const readJSON = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const pad = (n) => String(n).padStart(2, '0');

function rfc822(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return new Date().toUTCString();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`;
}

function item({ title, link, description, date, guid }) {
  return `    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="${guid?.startsWith('http') ? 'true' : 'false'}">${esc(guid || link)}</guid>
      <pubDate>${rfc822(date)}</pubDate>
      <description>${esc(description)}</description>
    </item>`;
}

function main() {
  const items = [];

  // 精选金句（无精选则回退最新 20 条）
  const quotesRaw = readJSON('notion-data.json');
  const quotes = quotesRaw ? (Array.isArray(quotesRaw) ? quotesRaw : quotesRaw.posts || []) : [];
  const featured = quotes.filter((q) => q.featured === true);
  const pickedQuotes = featured.length ? featured : quotes.slice(0, 20);
  for (const q of pickedQuotes) {
    const text = q.content || q.title || '';
    items.push({
      title: (featured.length ? '[精选] ' : '') + text.replace(/\s+/g, ' ').slice(0, 60),
      link: q.url || SITE_URL,
      description: text,
      date: q.date || q.pubDate,
      guid: q.url || `quote-${dateOf(q.date || q.pubDate)}-${text.slice(0, 20)}`,
    });
  }

  // 想法
  const thoughts = readJSON('_data/thoughts.json');
  for (const p of thoughts?.posts || []) {
    items.push({
      title: p.content.replace(/\s+/g, ' ').slice(0, 60),
      link: p.url || SITE_URL,
      description: p.content,
      date: p.date,
      guid: p.url,
    });
  }

  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  const feed = items.slice(0, LIMIT);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${esc(SITE_DESC)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${rfc822(new Date().toISOString())}</lastBuildDate>
    <atom:link href="${SITE_URL}rss.xml" rel="self" type="application/rss+xml"/>
${feed.map(item).join('\n')}
  </channel>
</rss>
`;

  writeFileSync('rss.xml', xml);
  console.log(`✅ rss.xml 生成完成：${feed.length} 条（精选金句 ${featured.length} + 想法 ${(thoughts?.posts || []).length}）`);
}

function dateOf(iso) {
  return String(iso || '').slice(0, 10);
}

main();
