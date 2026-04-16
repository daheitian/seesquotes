const { Client } = require('@notionhq/client');
const fs = require('fs').promises;
const path = require('path');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

async function sync() {
  // 确保 _data 目录存在
  await fs.mkdir('_data', { recursive: true });

  // 同步金句/想法
  const ideas = await notion.databases.query({ 
    database_id: databaseId,
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
  });
  await fs.writeFile(
    '_data/notion_ideas.json', 
    JSON.stringify(ideas, null, 2)
  );

  // 生成搜索索引
  const searchIndex = ideas.results.map(page => ({
    id: page.id,
    title: page.properties.Name?.title?.[0]?.plain_text || '',
    content: '', // 如果需要可以 fetch block children
    type: 'idea',
    date: page.last_edited_time,
    url: './'
  }));
  await fs.writeFile(
    '_data/search_index.json',
    JSON.stringify(searchIndex, null, 2)
  );

  console.log('✅ 同步完成');
}

sync().catch(console.error);
