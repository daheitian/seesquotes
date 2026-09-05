/**
 * 微信读书 → _data/weread.json 同步脚本（官方 Agent API 版）
 *
 * 环境变量：
 *   WEREAD_API_KEY — 微信读书 Agent API Key（必填，wrk- 开头，获取：weread.qq.com/r/weread-skills）
 *
 * 增量策略：
 *   已有 _data/weread.json 时，仅对「笔记变动」（sort/noteCount/reviewCount 变化或无详情）的书
 *   重新拉取划线与想法，其余复用本地数据，日常运行只需几次请求。
 *
 * 输出：_data/weread.json
 *   { lastSync, books[], shelf[] }
 *
 * Node 20+，无第三方依赖。
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const API_KEY = process.env.WEREAD_API_KEY;
if (!API_KEY || !API_KEY.trim()) {
  console.error('::error::缺少 WEREAD_API_KEY，请在仓库 Secrets 中配置（获取：https://weread.qq.com/r/weread-skills）');
  process.exit(1);
}

const GATEWAY = 'https://i.weread.qq.com/api/agent/gateway';
const VERSION = '1.0.4';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(apiName, params = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(GATEWAY, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ api_name: apiName, skill_version: VERSION, ...params }),
      });
      const json = await res.json().catch(() => ({}));
      const code = json.errcode ?? json.errCode ?? 0;
      if (code === 0 || code === -1) return json;
      if (code === -2012 || code === -2010 || res.status === 401 || res.status === 403) {
        console.error('::error::API Key 无效或已过期，请到 https://weread.qq.com/r/weread-skills 重新获取');
        process.exit(2);
      }
      throw new Error(`${apiName} -> errcode ${code} ${JSON.stringify(json).slice(0, 150)}`);
    } catch (err) {
      console.warn(`  重试 ${attempt}/3: ${err.message}`);
      if (attempt === 3) throw err;
      await sleep(5000);
    }
  }
}

/** 分页拉取 /user/notebooks 全量 */
async function fetchNotebooks() {
  const all = [];
  let lastSort;
  for (let page = 0; ; page++) {
    const params = { count: 100 };
    if (lastSort !== undefined) params.lastSort = lastSort;
    const data = await api('/user/notebooks', params);
    const books = data.books || [];
    all.push(...books);
    console.log(`  笔记本第 ${page + 1} 页：${books.length} 本（累计 ${all.length}/${data.totalBookCount}）`);
    if (!data.hasMore || books.length === 0) break;
    lastSort = books[books.length - 1].sort;
    await sleep(400);
  }
  return all;
}

/** 分页拉取某本书的个人想法 */
async function fetchReviews(bookId) {
  const reviews = [];
  let synckey = 0;
  for (let i = 0; i < 50; i++) {
    const data = await api('/review/list/mine', { bookid: bookId, synckey, count: 100 });
    const list = (data.reviews || []).map((x) => x.review || x);
    reviews.push(...list);
    if (!data.hasMore || list.length === 0) break;
    synckey = data.synckey ?? synckey;
    await sleep(300);
  }
  return reviews;
}

async function main() {
  console.log('🔄 开始同步微信读书（官方 API）…');

  // 0. 载入旧数据（增量基准）
  let prev = { books: [], state: {} };
  if (existsSync('_data/weread.json')) {
    try {
      prev = JSON.parse(readFileSync('_data/weread.json', 'utf8'));
    } catch { /* 忽略损坏的旧文件 */ }
  }
  const prevDetails = new Map((prev.books || []).map((b) => [b.bookId, b]));

  // 1. 笔记本全量（有笔记的书）
  const notebooks = await fetchNotebooks();
  console.log(`📓 共 ${notebooks.length} 本有笔记的书，总笔记 ${notebooks.reduce((n, b) => n + (b.noteCount || 0) + (b.reviewCount || 0), 0)} 条`);

  // 2. 找出需要重新拉详情的书
  const needFetch = [];
  for (const nb of notebooks) {
    const old = prevDetails.get(String(nb.bookId));
    const changed = !old
      || old._sort !== nb.sort
      || (old.highlights?.length || 0) !== (nb.noteCount || 0)
      || (old.reviews?.length || 0) !== (nb.reviewCount || 0);
    if (changed) needFetch.push(nb);
  }
  console.log(`🔍 需更新详情：${needFetch.length} 本（复用 ${notebooks.length - needFetch.length} 本）`);

  // 3. 逐本拉划线 + 想法
  const books = [];
  for (let i = 0; i < notebooks.length; i++) {
    const nb = notebooks[i];
    const bookId = String(nb.bookId);
    const meta = nb.book || {};

    let highlights = [], reviews = [];
    const cached = prevDetails.get(bookId);
    const needsFetch = needFetch.includes(nb);

    if (!needsFetch && cached) {
      highlights = cached.highlights || [];
      reviews = cached.reviews || [];
      books.push({ ...cached, title: meta.title || cached.title, author: meta.author || cached.author, cover: meta.cover || cached.cover, deepLink: meta.deepLink || cached.deepLink || '', readingProgress: nb.readingProgress ?? cached.readingProgress ?? 0, markedStatus: nb.markedStatus ?? cached.markedStatus ?? 0, _sort: nb.sort, _noteCount: nb.noteCount || 0, _reviewCount: nb.reviewCount || 0 });
      continue;
    }

    try {
      const bm = await api('/book/bookmarklist', { bookId });
      const chapterMap = new Map((bm.chapters || []).map((c) => [c.chapterUid, c.title]));
      highlights = (bm.updated || [])
        .filter((h) => h.markText)
        .map((h) => ({
          id: h.bookmarkId || '',
          chapter: chapterMap.get(h.chapterUid) || '',
          text: h.markText,
          time: h.createTime || 0,
          range: h.range || '',
        }));
    } catch (e) {
      console.warn(`    [${meta.title || bookId}] 划线获取失败: ${e.message}`);
      highlights = cached?.highlights || [];
    }
    await sleep(300);

    try {
      reviews = (await fetchReviews(bookId))
        .filter((r) => r.content)
        .map((r) => ({
          id: r.reviewId || '',
          chapter: r.chapterName || '',
          content: r.content,
          abstract: r.abstract || '',
          star: typeof r.star === 'number' && r.star >= 0 ? r.star : null,
          time: typeof r.createTime === 'number' ? r.createTime : 0,
        }));
    } catch (e) {
      console.warn(`    [${meta.title || bookId}] 想法获取失败: ${e.message}`);
      reviews = cached?.reviews || [];
    }
    await sleep(300);

    process.stdout.write(`  [${i + 1}/${notebooks.length}] ${meta.title || bookId}：${highlights.length} 划线 / ${reviews.length} 想法\n`);
    books.push({
      bookId,
      title: meta.title || '',
      author: meta.author || '',
      cover: meta.cover || '',
      deepLink: meta.deepLink || '',
      readingProgress: nb.readingProgress ?? 0,
      markedStatus: nb.markedStatus ?? 0,
      highlights,
      reviews,
      _sort: nb.sort,
      _noteCount: nb.noteCount || 0,
      _reviewCount: nb.reviewCount || 0,
    });
  }

  // 按最近笔记时间倒序
  books.sort((a, b) => (b._sort || 0) - (a._sort || 0));

  // 3.5 补全缺失分类（书架没有的书，调 /book/info；只对没试过的书调一次）
  const noCat = books.filter((b) => !b.category && !(prevDetails.get(b.bookId)?._catTried));
  if (noCat.length) {
    console.log(`🏷️ 补全 ${noCat.length} 本书的分类…`);
    for (const b of noCat) {
      try {
        const info = await api('/book/info', { bookId: b.bookId });
        b.category = info.category || '';
      } catch { /* 单本失败忽略 */ }
      b._catTried = true;
      await sleep(300);
    }
  }

  // 4. 书架（展示用）
  let shelf = [];
  try {
    const s = await api('/shelf/sync');
    shelf = [
      ...(s.books || []).map((b) => ({
        bookId: String(b.bookId), title: b.title || '', author: b.author || '',
        cover: b.cover || '', category: b.category || '', deepLink: b.deepLink || '',
        readUpdateTime: b.readUpdateTime || 0, finished: b.finishReading === 1,
      })),
      ...(s.albums || []).filter((a) => a.albumInfo).map((a) => ({
        bookId: String(a.albumInfo.albumId), title: a.albumInfo.name || '',
        author: a.albumInfo.authorName || '', cover: a.albumInfo.cover || '',
        category: '有声书', deepLink: a.albumInfo.deepLink || '',
        readUpdateTime: a.albumInfoExtra?.lectureReadUpdateTime || a.albumInfo.updateTime || 0,
        finished: a.albumInfo.finish === 1,
      })),
    ];
    console.log(`📚 书架 ${shelf.length} 条`);

    // 把书架分类回填到笔记书（用于前端分类筛选）
    const catMap = new Map(shelf.map((s2) => [s2.bookId, s2.category]));
    for (const b of books) {
      b.category = catMap.get(b.bookId) || b.category || '';
    }
  } catch (e) {
    console.warn('书架获取失败（不影响笔记）:', e.message);
    shelf = prev.shelf || [];
  }

  const out = { lastSync: new Date().toISOString(), count: books.length, books, shelf };
  writeFileSync('_data/weread.json', JSON.stringify(out));

  const totalH = books.reduce((n, b) => n + b.highlights.length, 0);
  const totalR = books.reduce((n, b) => n + b.reviews.length, 0);
  const sizeKB = Math.round(JSON.stringify(out).length / 1024);
  console.log(`✅ 同步完成：${books.length} 本笔记 / ${shelf.length} 条书架，共 ${totalH} 划线、${totalR} 想法（${sizeKB} KB）`);
}

main().catch((err) => {
  console.error('::error::同步失败:', err.message);
  process.exit(1);
});
