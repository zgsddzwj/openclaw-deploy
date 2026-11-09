#!/usr/bin/env node
// 归档本期文章：把 article.txt / article.html 写入 archive/，并在 index.jsonl 追加一条索引。
// 用法：
//   node archive_article.mjs --title "本期标题" [--type 模型|产品|技术|应用|商业|政策]
//     [--slot 早报|晚报] [--skeleton "发布/评测"] [--digest "一句话摘要"] [--cover "<封面路径>"]
//
// 产物：
//   archive/YYYY-MM-DD-HHmm-<时段>.md   元信息 + 正文纯文本
//   archive/YYYY-MM-DD-HHmm-<时段>.html 本期 HTML（便于日后回看排版）
//   archive/index.jsonl                 每期一条索引（reads 字段留给日后人工填阅读量）

import { readFileSync, appendFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const archiveDir = path.resolve(dir, "..", "archive");
const textFile = path.resolve(dir, "article.txt");
const htmlFile = path.resolve(dir, "article.html");

const argv = process.argv.slice(2);
const get = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] || "" : "";
};

const title = get("--title");
if (!title) {
  console.error("用法：node archive_article.mjs --title \"本期标题\" [--type ...] [--slot ...] ...");
  process.exit(1);
}
const type = get("--type") || "未知";
const slot = get("--slot") || "issue";
const skeleton = get("--skeleton");
const digest = get("--digest");
const cover = get("--cover");

if (!existsSync(textFile)) {
  console.error("找不到 scripts/article.txt（本期正文还没写？）");
  process.exit(1);
}
mkdirSync(archiveDir, { recursive: true });

// 北京时间戳（不依赖系统时区）
const sh = new Date(Date.now() + 8 * 3600e3);
const iso = sh.toISOString();
const stamp = iso.slice(0, 16).replace("T", "-").replace(":", "");
const date = iso.slice(0, 10);
const time = iso.slice(11, 16);
const base = `${stamp}-${slot}`;

const mdPath = path.join(archiveDir, `${base}.md`);
const htmlPath = path.join(archiveDir, `${base}.html`);
const text = readFileSync(textFile, "utf-8");

const header = [
  `# ${title}`,
  "",
  `- 日期：${date} ${time}`,
  `- 时段：${slot}`,
  `- 题材：${type}`,
  skeleton ? `- 骨架：${skeleton}` : "",
  digest ? `- 摘要：${digest}` : "",
  cover ? `- 封面：${cover}` : "",
  `- 阅读量：待填`,
  "",
  "---",
  "",
  "",
].filter(Boolean);

let md;
try {
  readFileSync(mdPath); // 同名已存在则不覆盖
  md = null;
} catch {
  md = header.join("\n") + text;
  appendFileSync(mdPath, md, "utf-8");
}
if (existsSync(htmlFile)) {
  try {
    readFileSync(htmlPath);
  } catch {
    copyFileSync(htmlFile, htmlPath);
  }
}

appendFileSync(
  path.join(archiveDir, "index.jsonl"),
  JSON.stringify({
    date,
    time,
    slot,
    title,
    type,
    skeleton,
    digest,
    cover,
    md: path.basename(mdPath),
    html: path.basename(htmlPath),
    reads: null,
  }) + "\n",
  "utf-8"
);

console.log(`已归档：archive/${path.basename(mdPath)}（索引 archive/index.jsonl 已追加）`);
