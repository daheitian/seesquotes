# seesquotes · 小信号

个人数字花园：金句收藏、读书笔记与长文写作。纯静态站点，托管于 GitHub Pages。

## 结构

- `index.html` — 见室引号（金句信息流，同步自 Notion）
- `archive.html` — 全部金句的时间线归档
- `reading.html` — 阅览（微信读书书架、划线与想法）
- `writing.html` — 写作（基于 GitHub Issues）
- `search.html` — 全站搜索（金句 + 读书笔记）
- `_data/weread.json` — 微信读书同步数据（Actions 自动生成）

## 数据同步

| 数据源 | 工作流 | 频率 | Secret |
|---|---|---|---|
| Notion 金句 | `.github/workflows/sync-notion.yml` | 每 6 小时 | `NOTION_TOKEN`、`NOTION_DATABASE_ID` |
| 微信读书 | `.github/workflows/weread-sync.yml` | 每天 09:00 | `WEREAD_COOKIE` |

### 配置微信读书同步

1. 浏览器打开 [weread.qq.com](https://weread.qq.com/)，微信扫码登录
2. 按 `F12` 打开开发者工具 → Network（网络）面板 → 刷新页面
3. 点击任意一条指向 `weread.qq.com` 的请求，在 Headers 里找到 `Cookie:`，**完整复制**它的值
4. 仓库 **Settings → Secrets and variables → Actions → New repository secret**：
   - Name: `WEREAD_COOKIE`
   - Secret: 粘贴刚才复制的 Cookie
5. 到 **Actions → Sync WeRead Notes → Run workflow** 手动触发一次
6. 成功后 `_data/weread.json` 会入库，阅览页即可显示

> Cookie 约 30 天失效，届时同步会报错（Actions 会收到邮件通知），重复上面步骤重新获取即可。

## 本地预览

```bash
python -m http.server 8642
# 打开 http://localhost:8642
```

