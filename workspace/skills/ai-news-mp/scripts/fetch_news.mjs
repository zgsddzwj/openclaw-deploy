#!/usr/bin/env node
// 抓取 AI 资讯 RSS 源，输出 digest.md / digest.json 到本目录，供写稿技能使用。
// Node >= 20（用到内置 fetch / AbortSignal.timeout），零依赖。

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// 可按需增删：[名称, RSS 地址]。中文 AI 自媒体多在微信公众号里，没有 RSS，
// 如需订阅公众号可接入 wechat2rss 之类的服务后再加进来。
// 国内商业/大厂动态源（2026-10-22 实测）：36氪/虎嗅 RSS 已停服，RSSHub、新浪科技滚动不可用，钛媒体可用。
const SOURCES = [
  ["量子位", "https://www.qbitai.com/feed"],
  ["IT之家", "https://www.ithome.com/rss/"],
  ["爱范儿", "https://www.ifanr.com/feed"],
  ["Solidot", "https://www.solidot.org/index.rss"],
  ["Hacker News", "https://hnrss.org/frontpage"],
  ["The Verge", "https://www.theverge.com/rss/index.xml"],
  ["TechCrunch", "https://techcrunch.com/feed/"],
  ["OpenAI News", "https://openai.com/news/rss.xml"],
  ["钛媒体", "https://www.tmtpost.com/feed"],
];

const WINDOW_HOURS = 36; // 只取最近这么久的条目
const PER_SOURCE_LIMIT = 10;

const dir = path.dirname(fileURLToPath(import.meta.url));

function stripTags(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ai-news-bot/1.0)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// 取区块里第一个 <tag ...>...</tag> 的文本（兼容 CDATA）
function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? stripTags(m[1]) : "";
}

function parseItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<(item|entry)(?=[\s>])[\s\S]*?<\/\1>/gi)) {
    const b = m[0];
    const href = b.match(/<link[^>]*\shref="([^"]+)"/i)?.[1] ?? "";
    const timeRaw =
      pick(b, "pubDate") || pick(b, "updated") || pick(b, "published") || pick(b, "dc:date");
    items.push({
      title: pick(b, "title"),
      link: (pick(b, "link") || href).trim(),
      time: timeRaw ? Date.parse(timeRaw) || 0 : 0,
      summary: (pick(b, "description") || pick(b, "summary") || pick(b, "content")).slice(0, 300),
    });
  }
  return items;
}

const fmt = (t) =>
  new Date(t).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });

async function main() {
  const cutoff = Date.now() - WINDOW_HOURS * 3600e3;
  let all = [];
  let okSources = 0;

  for (const [name, url] of SOURCES) {
    try {
      let items = parseItems(await fetchText(url)).filter((i) => i.title);
      const recent = items.filter((i) => i.time >= cutoff);
      if (recent.length > 0) items = recent; // 源里没有有效时间的就不过滤
      items.sort((a, b) => b.time - a.time);
      items = items.slice(0, PER_SOURCE_LIMIT).map((i) => ({ ...i, source: name }));
      all = all.concat(items);
      okSources++;
      console.error(`[ok] ${name}: ${items.length} 条`);
    } catch (e) {
      console.error(`[fail] ${name}: ${e.message}`);
    }
  }

  if (all.length === 0) {
    console.error("所有源都抓取失败");
    process.exit(1);
  }

  const bySource = {};
  for (const i of all) (bySource[i.source] ??= []).push(i);

  const lines = [
    `# AI 资讯摘要（抓取于 ${fmt(Date.now())}，窗口 ${WINDOW_HOURS} 小时，${okSources}/${SOURCES.length} 个源成功）`,
    "",
  ];
  for (const [name, items] of Object.entries(bySource)) {
    lines.push(`## ${name}`);
    for (const i of items) {
      lines.push(`- [${i.title}](${i.link})${i.time ? ` (${fmt(i.time)})` : ""}`);
      if (i.summary) lines.push(`  摘要：${i.summary}`);
    }
    lines.push("");
  }

  writeFileSync(path.join(dir, "digest.md"), lines.join("\n"), "utf-8");
  writeFileSync(path.join(dir, "digest.json"), JSON.stringify(all, null, 1), "utf-8");
  console.log(`共 ${all.length} 条，已写入 digest.md / digest.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
