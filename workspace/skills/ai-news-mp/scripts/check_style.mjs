#!/usr/bin/env node
// 风格层去AI味检查（humanize-zh-pro 只查词法，这里查节奏和密度）。
// 用法：node check_style.mjs scripts/article.txt
// 阈值（超标打印 ⚠️ 并 exit 1；全部通过 exit 0）：
//   对仗/排比 ≤2 处；比喻关键词 ≤6 处；金句短段 ≤4 段；
//   短总结收尾段占比 ≤30%；模具词 ≤1 次。
// 判断依据见 SKILL.md 第 3 步「风格配额」。

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("用法：node check_style.mjs <article.txt>");
  process.exit(1);
}
const t = readFileSync(file, "utf-8");
const paras = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);

const duibi =
  (t.match(/不是[^，。！？]{1,14}，是/g) || []).length +
  (t.match(/一边[^。]{1,40}一边/g) || []).length +
  (t.match(/对谁[^？]{1,10}？[^。]{0,12}对谁/g) || []).length;

const meta = ["修车", "上课", "修理工", "老师", "手术", "盖楼", "鬼打墙", "开关", "赠品", "工单", "赌注", "牌桌"];
const metaCount = meta.reduce((n, k) => n + t.split(k).length - 1, 0);

const moju = ["先说结论", "算笔账", "更少人注意", "真正的", "但前提", "换句话说"];
const mojuCount = moju.reduce((n, k) => n + t.split(k).length - 1, 0);

const gold = paras.filter((p) => p.length < 32 && !/\d/.test(p) && /[。？]$/.test(p)).length;
const shortEnd = paras.filter((p) => /[。]$/.test(p) && p.length < 40).length;
const shortEndPct = Math.round((100 * shortEnd) / paras.length);

const checks = [
  ["对仗/排比 ≤2", duibi, 2],
  ["比喻关键词 ≤6", metaCount, 6],
  ["金句短段 ≤4", gold, 4],
  ["短总结收尾占比 ≤30%", shortEndPct, 30],
  ["模具词 ≤1", mojuCount, 1],
];

let fail = 0;
console.log(`风格检查（${paras.length} 段）：`);
for (const [name, val, max] of checks) {
  const ok = val <= max;
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "⚠️"} ${name}：${val}（上限 ${max}）`);
}
if (fail) {
  console.log(`共 ${fail} 项超标，按 SKILL.md 第 4 步改掉再查。`);
  process.exit(1);
}
console.log("全部通过。");
