// notion-blog-sync.mjs
// Sync published articles from the public Notion blog (小信号) to GitHub Issues,
// which the writing page (writing.html) uses as its article store.
//
// - No Notion token needed (the notion.site is public).
// - Images are downloaded via Notion's /image/ proxy (S3 URLs are anonymous-denied
//   and expire) and committed under notion-assets/ for stable hosting.
// - Dedup/update via hidden marker `<!-- notion-sync:<pageId> -->` in the issue body.
//
// Env:
//   GITHUB_TOKEN   token with repo/issues write access (Actions GITHUB_TOKEN or a PAT)
//   REPO           default: daheitian/seesquotes
//   IMAGE_BASE     default: https://raw.githubusercontent.com/<REPO>/main
//
// Modes:
//   --dry-run           fetch & convert, write markdown to ./notion-staging-out, no GitHub writes
//   (default)           create missing issues, update changed ones, download images

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PAGE_ID = "7280c130-37e8-477e-9dd5-2ec1c733357e";
const VIEW_ID = "0447f516e8f34dabaafa920e5079a163";
const COLLECTION_ID = "493fbf58-4ece-4082-872a-db925761e265";
const SPACE_ID = "ca1c8dfb-7480-4f52-9503-0534e30c8f71";
const NOTION_BASE = "https://buerc.notion.site/api/v3";
const NOTION_SITE = "https://buerc.notion.site";
const IMAGE_PROXY = `${NOTION_SITE}/image/`;
const REPO = process.env.REPO ?? "daheitian/seesquotes";
const IMAGE_BASE = process.env.IMAGE_BASE ?? `https://raw.githubusercontent.com/${REPO}/main`;
const ASSETS_DIR = path.join(ROOT, "notion-assets");
const SYNC_LABEL = "notion-blog";
const MARKER = (id) => `<!-- notion-sync:${id} -->`;
const DRY_RUN = process.argv.includes("--dry-run");
const TOKEN = process.env.GITHUB_TOKEN;
const API = `https://api.github.com/repos/${REPO}`;

const HEADERS = { "Content-Type": "application/json", "User-Agent": "notion-blog-sync/1.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pexec = promisify(execFile);

async function notionPost(pathname, body, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${NOTION_BASE}/${pathname}`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      const text = await res.text();
      if (!res.ok) throw new Error(`${pathname} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
      return JSON.parse(text);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

function val(entry) { return entry ? (entry.value?.value ?? entry.value ?? null) : null; }

// ---------- rich text ----------
const wrap = (t, m) => (t && !(t.startsWith(m) && t.endsWith(m))) ? m + t + m : t;

function richText(prop, plain = false) {
  if (!Array.isArray(prop)) return "";
  let out = "";
  for (const seg of prop) {
    if (typeof seg === "string") { out += seg; continue; }
    if (!Array.isArray(seg)) continue;
    let text = seg[0] ?? "";
    if (Array.isArray(text)) text = richText(text, plain);
    const decos = seg[1] ?? [];
    for (const d of decos) {
      if (!Array.isArray(d)) continue;
      const [key, value] = d;
      if (key === "a" && value) { out += plain ? `${text} (${value})` : `[${text}](${value})`; text = ""; }
      else if (key === "d" && value?.start_date) { out += value.start_date; text = ""; }
      else if (key === "c" && !plain) { text = wrap(text, "`"); }
      else if (key === "b" && !plain) { text = wrap(text, "**"); }
      else if (key === "i" && !plain) { text = wrap(text, "*"); }
      else if (key === "s" && !plain) { text = wrap(text, "~~"); }
      else if (key === "e" && !plain) { text += " $$" + value + "$$"; }
    }
    out += text;
  }
  return out;
}

const propText = (b, key, plain = false) => richText(b?.properties?.[key], plain);

// ---------- image handling ----------
let imgSeq = 0;
const downloadedImages = new Map(); // src -> repoRelativePath

function guessExt(src) {
  try {
    if (src.startsWith("attachment:")) {
      const name = src.split(":").pop() || "";
      const m = name.match(/\.(png|jpe?g|gif|webp|svg|bmp)$/i);
      return m ? "." + m[1].toLowerCase() : ".png";
    }
    const u = new URL(src, NOTION_SITE);
    const m = u.pathname.match(/\.(png|jpe?g|gif|webp|svg|bmp)$/i);
    return m ? "." + m[1].toLowerCase() : ".png";
  } catch { return ".png"; }
}

async function downloadImage(src, blockId, articleId) {
  if (downloadedImages.has(src)) return downloadedImages.get(src);
  const proxied = `${IMAGE_PROXY}${encodeURIComponent(src)}?table=block&id=${blockId}&cache=v2`;
  const idx = ++imgSeq;
  const rel = `notion-assets/${articleId}/${idx}${guessExt(src)}`;
  const target = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    await pexec("curl", ["-sL", "-f", "--max-time", "60", "-o", target, proxied], { maxBuffer: 64 * 1024 * 1024 });
    const buf = fs.readFileSync(target);
    if (buf.length < 100 || buf[0] === 0x7b /* { */) throw new Error(`invalid image (${buf.length} bytes)`);
    downloadedImages.set(src, rel);
    return rel;
  } catch (e) {
    console.log(`\n  ! image failed (${String(e.message).split("\n")[0].slice(0, 80)}): ${src.slice(0, 80)}`);
    try { fs.unlinkSync(target); } catch {}
    return null;
  }
}

// ---------- blocks -> markdown ----------
function notionUrl(id) { return `https://buerc.notion.site/${id.replaceAll("-", "")}`; }

async function blockToMarkdown(b, blocksById, depth = 0, counters = { num: 0 }, articleId = null) {
  if (!b) return null;
  const type = b.type;
  const content = (b.content ?? []).map((id) => blocksById[id]).filter(Boolean);
  const childrenMd = async () => {
    let n = 0;
    const parts = [];
    for (const c of content) {
      if (c.type === "numbered_list") n++;
      else n = 0;
      parts.push(await blockToMarkdown(c, blocksById, depth + 1, { num: n }, articleId));
    }
    return parts.filter(Boolean).join("\n\n");
  };
  const text = propText(b, "title");
  const pad = "  ".repeat(depth);

  switch (type) {
    case "text": case "header": case "sub_header": case "sub_sub_header": {
      const kids = await childrenMd();
      let md = text || "";
      if (type === "header") md = md ? `${pad}# ${md}` : "";
      if (type === "sub_header") md = md ? `${pad}## ${md}` : "";
      if (type === "sub_sub_header") md = md ? `${pad}### ${md}` : "";
      if (kids) return md ? `${md}\n\n${kids}` : kids;
      return md || null;
    }
    case "bulleted_list": {
      const kids = await childrenMd();
      return `${pad}- ${text}${kids ? "\n" + kids.split("\n").map((l) => "  " + l).join("\n") : ""}`;
    }
    case "numbered_list": {
      const kids = await childrenMd();
      return `${pad}${counters.num || 1}. ${text}${kids ? "\n" + kids.split("\n").map((l) => "  " + l).join("\n") : ""}`;
    }
    case "quote": return `${pad}> ${text}`;
    case "callout": {
      const icon = b.format?.callout?.emoji ?? "💡";
      return `${pad}> ${icon} ${text}`;
    }
    case "code": {
      const lang = (b.format?.code_language ?? "").split("_")[0] || "";
      return "```" + lang + "\n" + text + "\n```";
    }
    case "image": {
      const src = b.format?.display_source ?? b.properties?.source?.[0]?.[0];
      if (!src || src.startsWith("data:")) return null; // data: URIs are Notion UI icons, not content
      const caption = b.properties?.caption ? richText(b.properties.caption) : "";
      if (DRY_RUN) return `![${caption || "image"}](${src})${caption ? `\n\n*${caption}*` : ""}`;
      const rel = await downloadImage(src, b.id, articleId);
      return rel ? `![${caption || "image"}](${IMAGE_BASE}/${rel})${caption ? `\n\n*${caption}*` : ""}` : null;
    }
    case "bookmark": case "embed": case "video": case "file": case "pdf": {
      const link = b.properties?.source?.[0]?.[0] ?? b.format?.display_source ?? "";
      if (!link || link.startsWith("data:")) return null;
      const caption = b.properties?.caption ? richText(b.properties.caption) : (type === "bookmark" ? "书签" : type);
      return `[${caption || link}](${link})`;
    }
    case "divider": return "---";
    case "page": return `[📄 ${propText(b, "title", true)}](${notionUrl(b.id)})`;
    case "toggle": {
      const kids = await childrenMd();
      return `<details><summary>${text}</summary>\n\n${kids}\n\n</details>`;
    }
    case "table": {
      const rows = content.filter((c) => c.type === "table_row");
      if (!rows.length) return null;
      const keys = Object.keys(rows[0].properties ?? {});
      const line = (p) => `| ${keys.map((k) => richText(p[k])).join(" | ")} |`;
      return [line(rows[0].properties), `|${keys.map(() => " --- ").join("|")}|`, ...rows.slice(1).map((r) => line(r.properties))].join("\n");
    }
    case "table_row": return null;
    case "column_list": case "column": return (await childrenMd()) || null;
    case "table_of_contents": case "breadcrumb": return null;
    default: {
      const kids = await childrenMd();
      return text ? (kids ? `${text}\n\n${kids}` : text) : kids || null;
    }
  }
}

// ---------- github ----------
function ghHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "notion-blog-sync",
  };
}

async function gh(pathname, options = {}) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${API}${pathname}`, { headers: ghHeaders(), ...options });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`GitHub ${pathname} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
    return json;
  }
  throw new Error(`GitHub ${pathname} failed after retries`);
}

async function listSyncedIssues() {
  const found = new Map(); // notionId -> issue
  for (let page = 1; page <= 5; page++) {
    const issues = await gh(`/issues?state=all&labels=${SYNC_LABEL}&per_page=100&page=${page}`);
    if (!issues.length) break;
    for (const it of issues) {
      const m = (it.body ?? "").match(/<!-- notion-sync:([0-9a-f-]+) -->/);
      if (m) found.set(m[1], it);
    }
  }
  return found;
}

const cleanTag = (t) => String(t).split(/[，,]/).map((s) => s.trim()).filter(Boolean).slice(0, 40);

async function ensureLabels(names) {
  for (const name of names) {
    try {
      const res = await fetch(`${API}/labels`, { method: "POST", headers: ghHeaders(), body: JSON.stringify({ name }) });
      if (res.status === 422) { /* exists */ } else if (!res.ok) {
        const t = await res.text(); console.log(`  ! label "${name}" create failed: HTTP ${res.status} ${t.slice(0, 100)}`);
      }
    } catch (e) { console.log(`  ! label "${name}": ${e.message.slice(0, 100)}`); }
  }
}

// ---------- main ----------
// 1. rows
const data = await notionPost("queryCollection", {
  source: { type: "collection", id: COLLECTION_ID, spaceId: SPACE_ID },
  collectionView: { id: VIEW_ID, spaceId: SPACE_ID },
  loader: { type: "reducer", reducers: { collection_group_results: { type: "results", limit: 100 } }, searchQuery: "", userTimeZone: "Asia/Shanghai" },
});
const rm = data.recordMap ?? {};
const rowIds = data.result?.reducerResults?.collection_group_results?.blockIds ?? [];
const schema = Object.values(rm.collection ?? {}).map(val)[0]?.schema ?? {};
const sk = (name) => Object.keys(schema).find((k) => schema[k].name === name);

const articles = [];
for (const id of rowIds) {
  const b = val(rm.block?.[id]);
  if (!b || b.type !== "page") continue;
  const status = propText(b, sk("status"), true);
  const type = propText(b, sk("type"), true);
  if (status !== "Published" || ["Menu", "Config"].includes(type) || propText(b, sk("password"), true)) continue;
  articles.push({
    id,
    title: propText(b, "title", true).replace(/\s*[｜|]\s*小信号\s*$/, "").replace(/\s+/g, " ").trim(),
    category: propText(b, sk("category"), true),
    tags: (b.properties?.[sk("tags")] ?? []).flatMap((s) => cleanTag(Array.isArray(s) ? (s[0] ?? "") : s)),
    summary: propText(b, sk("summary"), true),
    date: propText(b, sk("date"), true),
    slug: propText(b, sk("slug"), true),
  });
}
articles.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
console.log(`published articles: ${articles.length}`);

// 2. convert
for (let i = 0; i < articles.length; i++) {
  const a = articles[i];
  const blocksById = {};
  let cursor = { stack: [] }, chunkNumber = 0;
  for (;;) {
    const chunk = await notionPost("loadPageChunk", { pageId: a.id, limit: 100, cursor, chunkNumber, verticalColumns: false });
    for (const [bid, entry] of Object.entries(chunk.recordMap?.block ?? {})) {
      const v = val(entry);
      if (v) blocksById[bid] = v;
    }
    cursor = chunk.cursor;
    chunkNumber++;
    if (!cursor?.stack?.length || !cursor.stack.some((s) => s.stack?.length) || chunkNumber > 30) break;
    await sleep(100);
  }
  const page = blocksById[a.id];
  const topIds = page?.content ?? Object.keys(blocksById).filter((id) => id !== a.id && blocksById[id]?.parent_id === a.id);
  const parts = [];
  let n = 0;
  for (const id of topIds) {
    const blk = blocksById[id];
    if (blk?.type === "numbered_list") n++;
    else n = 0;
    parts.push(await blockToMarkdown(blk, blocksById, 0, { num: n }, a.id));
  }
  a.markdown = parts.filter(Boolean).join("\n\n");
  process.stdout.write(`\r[${i + 1}/${articles.length}] converted`);
}
console.log(`\nimages downloaded: ${downloadedImages.size}`);

if (DRY_RUN) {
  const out = path.join(ROOT, "notion-staging-out");
  fs.mkdirSync(out, { recursive: true });
  for (const a of articles) {
    const safe = (a.slug || a.title).replace(/[\\/:*?"<>|*]/g, "_").slice(0, 60) || a.id;
    fs.writeFileSync(path.join(out, `${safe}.md`), `${a.markdown}\n`);
  }
  console.log(`dry-run: wrote ${articles.length} markdown files to notion-staging-out/`);
  process.exit(0);
}

if (!TOKEN) { console.error("GITHUB_TOKEN is required for issue creation"); process.exit(1); }

// 3. build bodies/labels
const buildBody = (a) => {
  const metaLine = [
    a.date && `📅 ${a.date}`,
    a.category && `🗂️ ${a.category}`,
    a.tags.length && `🏷️ ${a.tags.join(" / ")}`,
  ].filter(Boolean).join(" · ");
  return [
    metaLine && `> ${metaLine}`,
    "",
    a.markdown,
    "",
    "---",
    "",
    `> 📡 本文同步自作者 Notion 博客「小信号」 · [阅读原文](${notionUrl(a.id)})`,
    MARKER(a.id),
  ].join("\n");
};
const buildLabels = (a) => [...new Set([SYNC_LABEL, a.category, ...a.tags].filter(Boolean))];

// 4. dedup + sync (create missing, update changed)
const existing = await listSyncedIssues();
console.log(`already synced issues: ${existing.size}`);

const labelNames = [...new Set(articles.flatMap((a) => buildLabels(a)))];
await ensureLabels(labelNames);

let created = 0, updated = 0, unchanged = 0;
for (const a of articles) {
  const body = buildBody(a);
  const labels = buildLabels(a);
  const ex = existing.get(a.id);
  try {
    if (ex) {
      const clean = (s) => String(s ?? "").replace(/\r\n/g, "\n").trim();
      const labelSet = (ex.labels ?? []).map((l) => l.name ?? l).sort().join(",");
      if (clean(ex.body) !== clean(body) || clean(ex.title) !== a.title || labelSet !== labels.slice().sort().join(",")) {
        await gh(`/issues/${ex.number}`, { method: "PATCH", body: JSON.stringify({ title: a.title, body, labels }) });
        updated++;
      } else unchanged++;
    } else {
      const issue = await gh("/issues", { method: "POST", body: JSON.stringify({ title: a.title, body, labels }) });
      created++;
      process.stdout.write(`\rcreated: ${created}, updated: ${updated}, unchanged: ${unchanged}  (latest: #${issue.number})`);
    }
    await sleep(500);
  } catch (e) {
    console.log(`\n! failed: ${a.title} -> ${e.message.slice(0, 150)}`);
  }
}
console.log(`\ndone. created=${created}, updated=${updated}, unchanged=${unchanged}, images=${downloadedImages.size}`);
