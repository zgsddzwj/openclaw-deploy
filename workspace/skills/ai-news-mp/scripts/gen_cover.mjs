#!/usr/bin/env node
// 按本期文章主题生成公众号封面（文生图）。每期生成新图，保证不重样、贴合内容。
//
// 用法：
//   node gen_cover.mjs --topic "本期标题；一句话讲什么" [--style "画面要点，须覆盖主体/关系/数字"] [--labels "标签1|标签2"] [--out covers/auto-xxx.jpg]
//
// 凭据从环境变量读取：ARK_API_KEY（火山引擎 Ark，OpenAI 兼容，不要写进任何文件）。
// 可选：ARK_BASE_URL（默认 https://ark.cn-beijing.volces.com/api/v3）、
//       ARK_IMAGE_MODEL（默认 doubao-seedream-5-0-pro-260628）。
// 输出：封面文件路径（stdout），供 mp_publish.mjs --cover 使用。生成失败时 exit 1。
//
// 尺寸说明：Seedream 要求面积 ≥ 921600 像素；1664x704 ≈ 2.35:1，满足公众号封面 ≥900px 宽的要求。

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API = (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3") + "/images/generations";
const MODEL = process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-pro-260628";
const SIZE = "1664x704"; // ≈2.35:1 公众号封面比例

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1] ?? "";
  }
  if (!args.topic) {
    console.error("用法：node gen_cover.mjs --topic \"本期标题；选题要点…\" [--style 画面要点] [--labels \"标签1|标签2\"] [--out 路径]");
    process.exit(1);
  }
  return args;
}

function buildPrompt(topic, style, labels) {
  // 封面必须完整表现标题：主体、关系/动作、关键数字的含义缺一不可，不能只画其中一个。
  // 短标签用「主体名 + 数字」组成的短语（最多 2 个），实测渲染可靠；
  // 单独的数字和长句容易被漏画或加戏，不交给模型。
  const labelText = labels && labels.length
    ? `画面中用清晰醒目的短文字标注：${labels.join("、")}。文字必须拼写准确、笔画完整、排版整齐。`
    : "";
  return [
    `微信公众号封面图，画面主题：${topic}。`,
    "画面必须完整表现标题的含义，同时覆盖这三点：主体是谁、主体之间的关系或动作、关键数字的含义。",
    labelText,
    "只印提示中给出的词，不要添加其他文字、字母或数字。",
    "主体清晰、大小适中，构图干净均衡，背景简洁不抢戏；用光自然，写实质感。",
    "平实呈现，不夸张、不加戏：不做戏剧化光影和特效，不用超现实手法，不堆砌无关元素。",
    "除标注文字外，无其他文字、无水印。",
    style ? `画面要点：${style}。` : "",
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

const labels = (args.labels || "").split(/[|｜]/).map((s) => s.trim()).filter(Boolean).slice(0, 2);
const body = JSON.stringify({ model: MODEL, prompt: buildPrompt(args.topic, args.style, labels), size: SIZE, response_format: "b64_json" });

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
