/**
 * 内容 → Markdown 备份导出
 *
 * 读取 notion-data.json / _data/*.json，在 content/ 下生成纯 Markdown 树：
 *   content/quotes/    金句（一条一文件）
 *   content/thoughts/  想法（posts.im）
 *   content/reading/   读书笔记（一本书一文件，划线按章节分组）
 *   content/readlater/ 稍后读
 *
 * 每次运行先清空对应目录再重新生成，保证与数据源完全一致。
 * 用途：AI 可读的文件接口、完整备份、随时可迁移到任意静态站生成器。
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';

const readJSON = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const pad = (n) => String(n).padStart(2, '0');
const dateOf = (iso) => (iso ? String(iso).slice(0, 10) : 'unknown');

function safeName(text, fallback = 'untitled') {
  return (String(text) || fallback)
    .replace(/[\\/:*?"<>|#\[\]]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60) || fallback;
}

function frontMatter(obj) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    lines.push(`${k}: ${JSON.stringify(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function exportDir(dir, files) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of files) {
    writeFileSync(`${dir}/${name}`, content);
  }
  console.log(`  📄 ${dir}: ${files.length} 个文件`);
}

function main() {
  // 1. 金句
  const quotes = readJSON('notion-data.json');
  if (quotes) {
    const list = Array.isArray(quotes) ? quotes : quotes.posts || [];
    const files = list.map((p, i) => {
      const text = p.content || p.title || '';
      const fm = frontMatter({
        title: (p.title || text).slice(0, 80),
        date: dateOf(p.date || p.pubDate),
        url: p.url || '',
        tags: p.tags || [],
        featured: p.featured === true ? true : undefined,
        index: i,
      });
      return [`${dateOf(p.date || p.pubDate)}-${i}.md`, `${fm}${text}\n`];
    });
    exportDir('content/quotes', files);
  }

  // 2. 想法
  const thoughts = readJSON('_data/thoughts.json');
  if (thoughts) {
    const files = (thoughts.posts || []).map((p) => {
      const fm = frontMatter({ title: p.content.slice(0, 60), date: dateOf(p.date), url: p.url || '' });
      return [`${dateOf(p.date)}-${safeName(p.url?.split('/').pop(), 'post')}.md`, `${fm}${p.content}\n`];
    });
    exportDir('content/thoughts', files);
  }

  // 3. 读书笔记
  const weread = readJSON('_data/weread.json');
  if (weread) {
    const files = (weread.books || []).map((b) => {
      const fm = frontMatter({
        title: b.title,
        author: b.author,
        category: b.category || '',
        status: b.markedStatus === 1 ? '读完' : '在读',
        progress: b.readingProgress || 0,
        bookId: b.bookId,
        deepLink: b.deepLink || '',
        cover: b.cover || '',
      });
      const parts = [];

      const reviews = b.reviews || [];
      const bookReviews = reviews.filter((r) => !r.chapter);
      const chapterReviews = reviews.filter((r) => r.chapter);
      for (const r of bookReviews) {
        parts.push(r.content, '');
        if (r.star >= 1) parts.push('★'.repeat(Math.min(5, Math.round(r.star))), '');
      }
      for (const r of chapterReviews) {
        parts.push(`## ${r.chapter}`, '', r.content, '');
      }

      const chapterMap = new Map();
      for (const h of b.highlights || []) {
        const key = h.chapter || '未分章';
        if (!chapterMap.has(key)) chapterMap.set(key, []);
        chapterMap.get(key).push(h);
      }
      for (const [chapter, items] of chapterMap) {
        parts.push(`## ${chapter}`, '');
        for (const h of items) {
          parts.push(`> ${String(h.text).replace(/\n/g, '\n> ')}`, '');
        }
      }
      return [`${b.bookId}-${safeName(b.title)}.md`, `${fm}${parts.join('\n')}\n`];
    });
    exportDir('content/reading', files);

    // 书架索引
    const index = (weread.shelf || [])
      .map((s) => `- [${s.title}](${s.deepLink || '#'}) — ${s.author}${s.finished ? ' ✅' : ''}`)
      .join('\n');
    exportDir('content/shelf', [['index.md', `# 书架\n\n共 ${(weread.shelf || []).length} 条\n\n${index}\n`]]);
  }

  // 4. 稍后读
  const readlater = readJSON('_data/readlater.json');
  if (readlater) {
    const files = (readlater.items || []).map((p, i) => {
      const fm = frontMatter({
        title: (p.title || '').slice(0, 80),
        date: dateOf(p.date || p.pubDate),
        url: p.url || '',
        tags: p.tags || [],
      });
      return [`${dateOf(p.date || p.pubDate)}-${i}.md`, `${fm}${p.content || p.title || ''}\n`];
    });
    exportDir('content/readlater', files);
  }

  // 汇总索引
  let total = 0;
  const sections = [];
  for (const dir of ['quotes', 'thoughts', 'reading', 'readlater']) {
    const p = `content/${dir}`;
    if (!existsSync(p)) continue;
    const n = readdirSync(p).length;
    total += n;
    sections.push(`- ${dir}/ ${n} 个文件`);
  }
  writeFileSync('content/INDEX.md', `# 内容备份索引\n\n由 GitHub Actions 自动生成，与数据源保持一致。\n\n${sections.join('\n')}\n`);
  console.log(`✅ Markdown 导出完成：共 ${total} 个文件`);
}

main();
