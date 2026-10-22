#!/usr/bin/env node
// QQ 群任务台账：登记 / 查询 / 勾销 / 每日汇总。零依赖。
// 数据存本目录 tasks.jsonl，一行一个 JSON：{ id, from, text, date, created_at, done_at }

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(dir, "tasks.jsonl");
const TZ = "Asia/Shanghai";

const dateStr = (d = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d); // YYYY-MM-DD
const timeStr = (d) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[argv[i].slice(2)] = next;
        i++;
      } else {
        args[argv[i].slice(2)] = true; // 无值的布尔旗标，如 --save / --today
      }
    } else {
      args._.push(argv[i]);
    }
  }
  return args;
}

function load() {
  if (!existsSync(DATA_FILE)) return [];
  return readFileSync(DATA_FILE, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function save(tasks) {
  writeFileSync(DATA_FILE, tasks.map((t) => JSON.stringify(t)).join("\n") + "\n", "utf-8");
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const tasks = load();
const today = dateStr();

if (cmd === "add") {
  const text = (args.text || "").trim();
  if (!text) die("用法：node task_log.mjs add --from \"发送人\" --text \"任务内容\"");
  const t = {
    id: tasks.reduce((m, x) => Math.max(m, x.id), 0) + 1,
    from: String(args.from ?? "").trim() || "未知",
    text,
    date: today,
    created_at: new Date().toISOString(),
    done_at: null,
  };
  tasks.push(t);
  save(tasks);
  console.log(`已登记 #${t.id} [${t.from}] ${t.text}`);
} else if (cmd === "list") {
  const rows = args.today
    ? tasks.filter((t) => t.date === today)
    : tasks.filter((t) => !t.done_at);
  if (rows.length === 0) {
    console.log(args.today ? "今天还没有登记任务" : "当前没有未完成任务");
  }
  for (const t of rows) {
    const when = `${t.date === today ? "今天" : t.date} ${timeStr(new Date(t.created_at))}`;
    console.log(`#${t.id} [${t.from}] ${t.text}（${when} 登记${t.done_at ? "，已完成" : ""}）`);
  }
} else if (cmd === "done") {
  const t = tasks.find((x) => x.id === Number(args.id) && !x.done_at);
  if (!t) die(`没有找到未完成的任务 #${args.id}`);
  t.done_at = new Date().toISOString();
  save(tasks);
  console.log(`已完成 #${t.id} ${t.text}`);
} else if (cmd === "summary") {
  const d = args.date || today;
  const added = tasks.filter((t) => t.date === d);
  const todo = tasks.filter((t) => !t.done_at);
  const lines = [`【任务日报 ${d}】今日新增 ${added.length} 条，未完成 ${todo.length} 条`];
  if (todo.length > 0) {
    lines.push("未完成：");
    for (const t of todo) lines.push(`${t.id}. [${t.from}] ${t.text}（${t.date} 登记）`);
  } else {
    lines.push("当前没有未完成任务。");
  }
  const out = lines.join("\n");
  if (args.save) {
    const rdir = path.join(dir, "..", "..", "..", "reports");
    mkdirSync(rdir, { recursive: true });
    const file = path.join(rdir, `${d}.md`);
    writeFileSync(file, out + "\n", "utf-8");
    console.log(out);
    console.log(`已存档：${file}`);
  } else {
    console.log(out);
  }
} else {
  die("用法：node task_log.mjs add|list|done|summary [--from x] [--text x] [--id N] [--today] [--date YYYY-MM-DD]");
}
