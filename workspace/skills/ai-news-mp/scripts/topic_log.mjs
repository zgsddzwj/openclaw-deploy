#!/usr/bin/env node
// 选题类型台账：记录每期选题类型，供「每 5 期至少 3 期模型/技术类」的配比自查。
//
// 用法：
//   node topic_log.mjs --tail 5                     # 读最近 5 期（日期 | 类型 | 标题）
//   node topic_log.mjs --type 模型 --title "标题"    # 追加一条本期记录
//
// type 取值：模型 / 产品 / 技术 / 应用 / 商业 / 政策
// 数据文件：同目录 topic_log.jsonl（一行一条，运行时产物，不提交）。

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(dir, "topic_log.jsonl");

const argv = process.argv.slice(2);
const get = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : "";
};

const tailN = get("--tail");
const type = get("--type");
const title = get("--title");

if (tailN) {
  if (!existsSync(FILE)) {
    console.log("（还没有台账，本期是第一期）");
    process.exit(0);
  }
  const lines = readFileSync(FILE, "utf-8").split("\n").filter(Boolean).slice(-(parseInt(tailN) || 5));
  for (const l of lines) {
    try {
      const e = JSON.parse(l);
      console.log(`${e.date} | ${e.type} | ${e.title}`);
    } catch {}
  }
  process.exit(0);
}

if (type && title) {
  const entry = {
    date: new Date().toISOString().slice(0, 10),
    type,
    title: title.slice(0, 80),
  };
  appendFileSync(FILE, JSON.stringify(entry) + "\n", "utf-8");
  console.log(`已记录：${entry.date} | ${entry.type} | ${entry.title}`);
  process.exit(0);
}

console.error("用法：node topic_log.mjs --tail 5 | --type <类型> --title <标题>");
process.exit(1);
