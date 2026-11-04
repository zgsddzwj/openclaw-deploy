#!/usr/bin/env node
// 从页面提取可用的图片地址（og:image 优先，其次正文 <img>），供正文配图。
// 用法：node fetch_og_image.mjs --url https://openai.com/index/xxx
// 输出：每行一个绝对图片 URL（最多 10 个，去重）。找不到图片 exit 1。
//
// 说明：
// - 自动补全相对路径、解码 &amp;、跳过 svg/data:URI
// - <img> 提取优先 data-src / data-original（懒加载站点），再回退 src
// - <img> 结果会过滤站点杂物（logo/二维码/横幅/图标类文件名）；og:image 不过滤（站点自选的分享图）

const i = process.argv.indexOf("--url");
const url = i >= 0 ? process.argv[i + 1] : process.argv[2];
if (!url) {
  console.error("用法：node fetch_og_image.mjs --url <页面地址>");
  process.exit(1);
}

let html;
try {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ai-news-bot/1.0)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    console.error(`抓取失败 HTTP ${res.status}`);
    process.exit(1);
  }
  html = await res.text();
} catch (e) {
  console.error(`抓取失败：${e.message}`);
  process.exit(1);
}

const abs = (u) => {
  try {
    return new URL(u.replace(/&amp;/g, "&"), url).href;
  } catch {
    return "";
  }
};

// 杂图过滤：logo/二维码/横幅/图标类文件名（og:image 和 <img> 都应用）
const JUNK = /logo|qrcode|qr[-_]code|banner|favicon|avatar|icon|share|head\.|weixin|download|app[-_]?store|\\/i;

const og = [];
for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) {
  const a = abs(m[1]);
  if (a && !JUNK.test(a)) og.push(a);
}
for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi)) {
  const a = abs(m[1]);
  if (a && !JUNK.test(a)) og.push(a);
}

// 懒加载兼容：每个 <img> 标签内优先 data-src / data-original，回退 src
const imgs = [];
for (const m of html.matchAll(/<img[^>]*>/gi)) {
  const tag = m[0];
  const raw =
    (tag.match(/data-src=["']([^"']+)["']/i) || [])[1] ||
    (tag.match(/data-original=["']([^"']+)["']/i) || [])[1] ||
    (tag.match(/src=["']([^"']+)["']/i) || [])[1];
  if (!raw) continue;
  const a = abs(raw);
  if (!a || /\.svg$/i.test(a) || /^data:/i.test(a)) continue;
  if (JUNK.test(a)) continue;
  imgs.push(a);
}

const seen = new Set();
const out = [];
for (const u of [...og, ...imgs]) {
  if (seen.has(u)) continue;
  seen.add(u);
  out.push(u);
  if (out.length >= 10) break;
}
if (!out.length) {
  console.error("页面里没找到可用图片");
  process.exit(1);
}
console.log(out.join("\n"));
