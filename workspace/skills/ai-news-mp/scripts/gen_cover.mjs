#!/usr/bin/env node
// 按本期文章主题生成公众号封面（文生图）。每期生成新图，保证不重样、贴合内容。
//
// 用法：
//   node gen_cover.mjs --topic "本期标题；一句话讲什么" [--style "画面冲突点，如 两大AI巨头棋盘对弈"] [--out covers/auto-xxx.jpg]
//
// 凭据从环境变量读取：ARK_API_KEY（火山引擎 Ark，OpenAI 兼容，不要写进任何文件）。
// 可选：ARK_BASE_URL（默认 https://ark.cn-beijing.volces.com/api/v3）、
//       ARK_IMAGE_MODEL（默认 doubao-seedream-5-0-flash-260915）。
// 输出：封面文件路径（stdout），供 mp_publish.mjs --cover 使用。生成失败时 exit 1。
//
// 尺寸说明：Seedream 要求面积 ≥ 921600 像素；1664x704 ≈ 2.35:1，满足公众号封面 ≥900px 宽的要求。

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API = (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3") + "/images/generations";
const MODEL = process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-flash-260915";
const SIZE = "1664x704"; // ≈2.35:1 公众号封面比例

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1] ?? "";
  }
  if (!args.topic) {
    console.error("用法：node gen_cover.mjs --topic \"本期标题；选题要点…\" [--out 路径] [--style 风格关键词]");
    process.exit(1);
  }
  return args;
}

function buildPrompt(topic, style) {
  // 画面完全由主题决定，不限定配色；禁止文字（AI 生成的文字会乱码）。
  // 封面按信息流缩略图标准：戏剧张力、高对比、动感构图，一眼抓人。
  return [
    `微信公众号封面图，画面主题：${topic}。`,
    "把它当作信息流里争夺点击的缩略图来画：画面要有戏剧张力和事件感，动感构图，主体大而突出，",
    "高对比戏剧光影（强光聚焦主体、背景压暗衬托），视觉冲击力优先；主体必须贴合主题本身，写实或超现实手法皆可，杂志封面级质感。",
    "构图饱满聚焦，无任何文字、无字母、无数字、无水印。",
    style ? `视觉冲突提示：${style}。` : "",
  ].filter(Boolean).join("");
}

const args = parseArgs(process.argv.slice(2));
const key = process.env.ARK_API_KEY;
if (!key) {
  console.error("缺少环境变量 ARK_API_KEY");
  process.exit(1);
}

const dir = path.dirname(fileURLToPath(import.meta.url));
// 脚本位于 workspace/skills/ai-news-mp/scripts/，covers 在 workspace/covers/
const coversDir = path.resolve(dir, "../../../covers");
const out = path.resolve(args.out || path.join(coversDir, "auto-" + Date.now() + ".jpg"));
mkdirSync(path.dirname(out), { recursive: true });

const body = JSON.stringify({ model: MODEL, prompt: buildPrompt(args.topic, args.style), size: SIZE, response_format: "b64_json" });

let j;
try {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(120000),
  });
  j = await res.json();
} catch (e) {
  console.error(`调用文生图失败：${e.message}`);
  process.exit(1);
}

if (j.error || !j.data?.[0]?.b64_json) {
  console.error(`文生图返回错误：${JSON.stringify(j.error ?? j).slice(0, 300)}`);
  process.exit(1);
}

writeFileSync(out, Buffer.from(j.data[0].b64_json, "base64"));
console.log(out);
