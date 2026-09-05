/**
 * Notion → notion-data.json（金句）+ _data/readlater.json（稍后读）同步脚本
 *
 * 环境变量：
 *   NOTION_TOKEN           — Notion Integration Token（必填）
 *   NOTION_DATABASE_ID     — 金句数据库（必填）
 *   READLATER_DATABASE_ID  — 稍后读数据库（可选，未配置则跳过）
 *
 * 字段自动探测：标题取 title 类型属性，正文取最长的 rich_text，
 * 链接取 url 类型属性，标签取 multi_select/select，日期用创建时间。
 */

import { writeFileSync, mkdirSync } from 'node:fs';

const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) {
  console.error('::error::缺少 NOTION_TOKEN');
  process.exit(1);
}
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function queryDatabase(dbId) {
  const all = [];
  let cursor;
  for (let page = 0; ; page++) {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        start_cursor: cursor,
        page_size: 100,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion API ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    all.push(...data.results);
    console.log(`  第 ${page + 1} 页：${data.results.length} 条（累计 ${all.length}）`);
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
    await sleep(350);
  }
  return all;
}

const richText = (v) => (v?.rich_text || []).map((t) => t.plain_text).join('');
const titleText = (v) => (v?.title || []).map((t) => t.plain_text).join('');

function detect(pages) {
  return pages.map((page) => {
    const props = page.properties || {};
    let title = '', content = '', url = '', tags = [], tagName = '';

    for (const [key, val] of Object.entries(props)) {
      if (!title && val.type === 'title') title = titleText(val);
      if (val.type === 'url' && val.url && !url) url = val.url;
      if (val.type === 'multi_select' && !tags.length) tags = val.multi_select.map((t) => t.name);
      if (val.type === 'select' && !tagName && val.select) tagName = val.select.name;
      if (val.type === 'rich_text') {
        const t = richText(val);
        if (t.startsWith('http') && !url) url = t;
        else if (t.length > content.length) content = t;
      }
    }

    // 中文常见字段名兜底
    if (props.链接?.url) url = props.链接.url;
    if (props.Tags?.multi_select) tags = props.Tags.multi_select.map((t) => t.name);

    return {
      title: title || '无标题',
      url: url || page.url,
      content,
      tags,
      tag: tagName,
      date: page.created_time,
      pubDate: page.created_time,
    };
  });
}

async function main() {
  // 1. 金句库
  const quotesDb = process.env.NOTION_DATABASE_ID;
  if (!quotesDb) {
    console.error('::error::缺少 NOTION_DATABASE_ID');
    process.exit(1);
  }
  console.log('🔄 同步金句数据库…');
  const quotes = detect(await queryDatabase(quotesDb));
  writeFileSync('notion-data.json', JSON.stringify(quotes, null, 2));
  console.log(`✅ 金句：${quotes.length} 条`);

  // 2. 稍后读库（可选）
  const readLaterDb = process.env.READLATER_DATABASE_ID;
  if (readLaterDb) {
    console.log('🔄 同步稍后读数据库…');
    try {
      const items = detect(await queryDatabase(readLaterDb));
      mkdirSync('_data', { recursive: true });
      writeFileSync(
        '_data/readlater.json',
        JSON.stringify({ lastSync: new Date().toISOString(), count: items.length, items }, null, 2)
      );
      console.log(`✅ 稍后读：${items.length} 条`);
    } catch (err) {
      console.error(`::error::稍后读同步失败（不影响金句）: ${err.message}`);
      // 不退出，金句同步已成功
    }
  } else {
    console.log('ℹ️ 未配置 READLATER_DATABASE_ID，跳过稍后读');
  }
}

main().catch((err) => {
  console.error('::error::同步失败:', err.message);
  process.exit(1);
});
