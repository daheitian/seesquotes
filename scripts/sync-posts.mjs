/**
 * posts.im 时间线 → _data/thoughts.json 抓取脚本
 *
 * 无需鉴权。抓取 https://posts.im/<user> 页面，解析条目（日期链接 + div.entry 正文）。
 * 注意：posts.im 无 RSS，列表页可能只展示最近若干条，抓到的即全部可得内容。
 *
 * 输出：_data/thoughts.json
 *   { lastSync, posts: [{url, date, content}] }
 *
 * Node 20+，无第三方依赖。
 */

import { writeFileSync, mkdirSync } from 'node:fs';

const USER = process.env.POSTS_IM_USER || 'daheitian';
const PAGE_URL = `https://posts.im/${USER}`;

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
}

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

async function main() {
  console.log(`🔄 抓取 ${PAGE_URL} …`);
  const res = await fetch(PAGE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; seesquotes-sync)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const posts = [];
  // 条目结构：<article>…<a href="/user/entries/ID">DD–MM–YYYY</a>…<div class="entry">…</div>…</article>
  const articleRe = /<article>([\s\S]*?)<\/article>/g;
  const linkRe = /href="(\/[^"]*\/entries\/[^"]+)"[^>]*>([\d–\-]+)</;
  const entryRe = /<div class="entry">([\s\S]*?)<\/div>/;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const block = m[1];
    const link = block.match(linkRe);
    const entry = block.match(entryRe);
    if (!link || !entry) continue;

    const content = htmlToText(entry[1]);
    if (!content) continue;

    // DD–MM–YYYY（或 DD-MM-YYYY）→ YYYY-MM-DD
    const d = link[2].trim().match(/^(\d{1,2})[–-](\d{1,2})[–-](\d{4})$/);
    let iso = null;
    if (d) {
      const [, dd, mm, yyyy] = d;
      iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    posts.push({
      url: `https://posts.im${link[1]}`,
      date: iso || link[2].trim(),
      content,
    });
  }

  if (posts.length === 0) throw new Error('未解析到任何条目，页面结构可能已变化');

  mkdirSync('_data', { recursive: true });
  writeFileSync(
    '_data/thoughts.json',
    JSON.stringify({ lastSync: new Date().toISOString(), count: posts.length, posts }, null, 2)
  );
  console.log(`✅ 同步完成：${posts.length} 条想法（最早 ${posts[posts.length - 1]?.date}）`);
}

main().catch((err) => {
  console.error('::error::同步失败:', err.message);
  process.exit(1);
});
