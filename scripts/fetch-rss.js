// scripts/fetch-rss.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 配置项（替换为你的即刻用户 ID）
const CONFIG = {
  rsshubUrl: 'https://rsshub.app/jike/user/16120E35-EB4B-4FF1-9DBC-9BEFC1D16CCD',
  cachePath: path.join(__dirname, '../data/jike-rss.xml'), // 缓存文件路径
  timeout: 10000, // 请求超时时间
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// 抓取 RSS 数据并保存到本地
async function fetchAndSaveRSS() {
  try {
    console.log('开始请求 RSSHub 接口...');
    const response = await axios.get(CONFIG.rsshubUrl, {
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'application/rss+xml, application/xml, text/xml'
      },
      timeout: CONFIG.timeout
    });

    // 确保 data 目录存在
    if (!fs.existsSync(path.dirname(CONFIG.cachePath))) {
      fs.mkdirSync(path.dirname(CONFIG.cachePath), { recursive: true });
    }

    // 保存数据到缓存文件
    fs.writeFileSync(CONFIG.cachePath, response.data, 'utf8');
    console.log(`✅ 缓存成功，文件路径：${CONFIG.cachePath}`);
  } catch (error) {
    console.error('❌ 抓取失败：', error.message);
    // 抓取失败时保留旧缓存，避免文件丢失
    if (fs.existsSync(CONFIG.cachePath)) {
      console.log('保留旧缓存文件');
    } else {
      // 无旧缓存时写入空内容，避免前端报错
      fs.writeFileSync(CONFIG.cachePath, '', 'utf8');
    }
    process.exit(1); // 标记 Action 执行失败（但不删除旧缓存）
  }
}

// 执行脚本
fetchAndSaveRSS();
