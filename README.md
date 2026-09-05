# seesquotes · 小信号

个人数字花园：金句收藏、读书笔记与长文写作。纯静态站点，托管于 GitHub Pages。

## 结构

- `index.html` — 见室引号（金句信息流，同步自 Notion）
- `archive.html` — 全部金句的时间线归档
- `reading.html` — 阅览（微信读书书架、划线与想法）
- `writing.html` — 写作（基于 GitHub Issues，站内阅读）
- `search.html` — 全站搜索（金句 + 读书笔记）
- `_data/weread.json` — 微信读书同步数据（Actions 自动生成）

## 数据同步

| 数据源 | 工作流 | 频率 | Secret |
|---|---|---|---|
| Notion 金句 | `.github/workflows/sync-notion.yml` | 每 6 小时 | `NOTION_TOKEN`、`NOTION_DATABASE_ID` |
| 微信读书 | `.github/workflows/weread-sync.yml` | 每天 09:00 | `WEREAD_API_KEY` |

### 配置微信读书同步（官方 API）

1. 前往 [weread.qq.com/r/weread-skills](https://weread.qq.com/r/weread-skills) 获取你的 API Key（`wrk-` 开头）
2. 仓库 **Settings → Secrets and variables → Actions → New repository secret**：
   - Name: `WEREAD_API_KEY`
   - Secret: 粘贴你的 Key
3. 到 **Actions → Sync WeRead Notes → Run workflow** 手动触发一次

使用微信读书官方 Agent API，Key 长期有效无需续期；同步为增量进行，日常只需少量请求。

## 本地预览

```bash
python -m http.server 8642
# 打开 http://localhost:8642
```
