# 关于

**小信号**是一个个人数字花园，用于收集、整理和分享那些容易被忽视但价值巨大的「小信号」——可能是灵光一闪的想法、读到的好书、或是值得记录的观点。

这个名字源于对信息过载时代的反思：我们每天都在接收海量信息，但真正有价值的往往是那些微弱但持续的信号。

> "在噪声中寻找信号，在信号中发现意义。"
>
> — 小信号的设计理念

## 四个板块

- **见室引号** — 收集金句、想法和优质信息源，同步自 Notion 数据库，每 6 小时更新
- **归档** — 稍后读清单，来自 Notion 稍后读数据库
- **阅览** — 微信读书书架、划线与想法，每天自动同步（官方 API）
- **想法** — 我自己的随想，同步自 posts.im
- **写作** — 更长形式的思考，基于 GitHub Issues，站内直接阅读

## 技术架构

极简技术栈，追求速度与可靠性：

静态 HTML · Vanilla JS · CSS Variables · GitHub Pages · GitHub Actions · Notion API · 微信读书

数据流：Notion / 微信读书 / posts.im → GitHub Actions 定时同步 → GitHub Pages 自动部署。无需数据库，无需后端服务器，页面访问时不调用任何第三方 API。

## 相关链接

- [GitHub 仓库](https://github.com/daheitian/seesquotes) — 查看源代码和更新日志
- [微信读书](https://weread.qq.com/) — 阅览页的数据来源
- [posts.im/daheitian](https://posts.im/daheitian) — 想法页的数据来源
- [Notion](https://notion.so) — 金句数据的存储和管理后台

## 更新日志

- **2026.09** — 全站视觉统一为扁平时间线；归档页改为稍后读；阅览页接入微信读书官方 API 并支持分类筛选；新增想法页；补上 RSS、精选分离与 Markdown 备份导出
- **2024.03** — 重构为纯静态站点，移除 Jekyll 依赖
- **2024.02** — 集成 Notion API，实现数据自动同步
- **2024.01** — 项目启动，确定「小信号」概念和核心板块

---

*本页内容来自 `content/about.md`，在 GitHub 上直接编辑即可更新，支持 Markdown 与预览。*
