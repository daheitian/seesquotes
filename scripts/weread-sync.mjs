/**
 * 微信读书 → _data/weread.json 同步脚本
 *
 * 环境变量：
 *   WEREAD_COOKIE — 微信读书网页版 Cookie（必填）
 *
 * 输出：_data/weread.json
 *   { lastSync, books: [{bookId,title,author,cover,intro,readingTime,highlights[],reviews[]}], shelf: [...] }
 *
 * Node 20+，无第三方依赖。
 */

import { writeFileSync, mkdirSync } from 'node:fs';

const COOKIE = process.env.WEREAD_COOKIE;
if (!COOKIE || !COOKIE.trim()) {
  console.error('::error::缺少 WEREAD_COOKIE，请在仓库 Secrets 中配置（获取方式见 README）');
  process.exit(1);
}

const HEADERS = {
  Cookie: COOKIE,
  Referer: 'https://weread.qq.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      const json = await res.json().catch(() => ({}));
      if (json.errCode === 0 || json.errcode === undefined) return json;
      const code = json.errcode ?? json.errCode;
      if (code === -2012 || code === -2010) {
        console.error('::error::微信读书 Cookie 已过期，请重新获取并更新 WEREAD_COOKIE');
        process.exit(2);
      }
      throw new Error(`${url} -> errcode ${code}`);
    } catch (err) {
      console.warn(`  重试 ${attempt}/3: ${err.message}`);
      if (attempt === 3) throw err;
      await sleep(5000);
    }
  }
}

// 找到 errcode 字段（有的接口成功时返回 errCode:-1 或无该字段，只有失败才报错）
function failed(json) {
  const code = json?.errcode ?? json?.errCode;
  return typeof code === 'number' && code !== 0 && code !== -1;
}

async function getStrict(url) {
  const json = await get(url);
  if (failed(json)) throw new Error(`${url} -> ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

const pick = (obj, ...keys) => {
  for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null && obj?.[k] !== '') return obj[k];
  return '';
};

async function main() {
  console.log('🔄 开始同步微信读书…');

  // 预热主页（部分接口依赖 session）
  await fetch('https://weread.qq.com/', { headers: HEADERS }).catch(() => {});

  // 1. 书架
  let shelfRaw = [];
  try {
    const shelf = await getStrict('https://i.weread.qq.com/shelf/sync?synckey=0&teenmode=0&album=1&onlyBookid=0');
    shelfRaw = (shelf.books || []).filter((b) => b.bookId);
    console.log(`📚 书架 ${shelfRaw.length} 本`);
  } catch (e) {
    console.warn('书架获取失败（不影响笔记同步）:', e.message);
  }

  const shelfMap = new Map(
    shelfRaw.map((b) => [String(b.bookId), { readingTime: b.readingTime || 0 }])
  );

  // 2. 笔记本（有笔记的书）
  const notebooks = await getStrict('https://i.weread.qq.com/user/notebooks');
  const nbBooks = (notebooks.books || [])
    .filter((nb) => nb.book)
    .sort((a, b) => (b.sort ?? 0) - (a.sort ?? 0));
  console.log(`📓 笔记本 ${nbBooks.length} 本`);

  // 3. 逐本抓取划线与想法
  const books = [];
  for (let i = 0; i < nbBooks.length; i++) {
    const nb = nbBooks[i];
    const bookId = String(nb.bookId ?? nb.book.bookId);
    const meta = nb.book || {};
    process.stdout.write(`  [${i + 1}/${nbBooks.length}] ${meta.title || bookId} `);

    const book = {
      bookId,
      title: meta.title || '',
      author: meta.author || '',
      cover: meta.cover || '',
      intro: meta.intro || '',
      readingTime: shelfMap.get(bookId)?.readingTime || 0,
      highlights: [],
      reviews: [],
    };

    try {
      const bm = await getStrict(`https://i.weread.qq.com/book/bookmarklist?bookId=${bookId}`);
      book.highlights = (bm.updated || []).map((h) => ({
        id: h.bookmarkId || '',
        chapter: h.chapterName || h.chapter || '',
        text: pick(h, 'text', 'abstract'),
        time: h.createTime || 0,
        range: h.range || '',
      })).filter((h) => h.text);
    } catch (e) {
      console.warn('    划线获取失败:', e.message);
    }
    await sleep(600);

    try {
      const rv = await getStrict(
        `https://i.weread.qq.com/review/list?bookId=${bookId}&listType=11&mine=1&syncKey=0`
      );
      book.reviews = (rv.reviews || [])
        .map((x) => x.review || x)
        .map((r) => ({
          id: r.reviewId || '',
          chapter: r.chapterName || '',
          content: pick(r, 'content', 'html'),
          abstract: r.abstract || '',
          time: r.createTime || 0,
        }))
        .filter((r) => r.content);
    } catch (e) {
      console.warn('    想法获取失败:', e.message);
    }
    await sleep(600);

    console.log(`(${book.highlights.length} 划线 / ${book.reviews.length} 想法)`);
    books.push(book);
  }

  // 按最近活跃排序（最新划线/想法在前）
  const lastActive = (b) =>
    Math.max(
      ...[0, ...b.highlights.map((h) => h.time || 0), ...b.reviews.map((r) => r.time || 0)]
    );
  books.sort((a, b) => lastActive(b) - lastActive(a));

  // 4. 书架（仅展示用）
  const shelf = shelfRaw.map((b) => ({
    bookId: String(b.bookId),
    title: b.title || '',
    author: b.author || '',
    cover: b.cover || '',
    readingTime: b.readingTime || 0,
  }));

  const out = { lastSync: new Date().toISOString(), count: books.length, books, shelf };
  mkdirSync('_data', { recursive: true });
  writeFileSync('_data/weread.json', JSON.stringify(out, null, 2));

  const totalH = books.reduce((n, b) => n + b.highlights.length, 0);
  const totalR = books.reduce((n, b) => n + b.reviews.length, 0);
  console.log(`✅ 同步完成：${books.length} 本笔记 / ${shelf.length} 本在架，共 ${totalH} 划线、${totalR} 想法`);
}

main().catch((err) => {
  console.error('::error::同步失败:', err.message);
  process.exit(1);
});
