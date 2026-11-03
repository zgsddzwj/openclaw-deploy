#!/usr/bin/env node
// 把一张图片上传到微信正文图片 CDN（media/uploadimg），stdout 打印可直接插入正文的 CDN 地址。
// 正文里的 <img> 必须用微信 CDN 地址，外链会被微信吞掉。
//
// 用法：
//   node upload_image.mjs --url https://example.com/pic.png   # 下载后上传
//   node upload_image.mjs --file /path/to/chart.png           # 上传本地文件
//
// 凭据从环境变量读取：WECHAT_MP_APPID / WECHAT_MP_SECRET（不要写进任何文件）。
// token 与 mp_publish.mjs 共用同目录 .mp_state.json，字段兼容互不影响。
// 限制：≤10MB，支持 png / jpeg / gif。超限、格式不明或失败时 exit 1（调用方应放弃配图，不要硬凑）。

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API = "https://api.weixin.qq.com/cgi-bin";
const dir = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(dir, ".mp_state.json");
const HINTS = {
  40164: "服务器公网 IP 不在公众号后台 IP 白名单里",
  40001: "appsecret 不正确或已被重置",
  48001: "该账号没有此接口权限",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1] ?? "";
  }
  if (!args.url && !args.file) {
    console.error("用法：node upload_image.mjs --url <图片地址> | --file <本地路径>");
    process.exit(1);
  }
  return args;
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1), "utf-8");
}

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  return await res.json();
}

function check(j, what) {
  if (j.errcode && j.errcode !== 0) {
    console.error(`[${what}] 失败 errcode=${j.errcode} errmsg=${j.errmsg}${HINTS[j.errcode] ? " —— " + HINTS[j.errcode] : ""}`);
    process.exit(1);
  }
  return j;
}

async function getToken(appid, secret, state) {
  if (state.token && state.appid === appid && state.tokenExpiresAt > Date.now() + 120e3) {
    return state.token;
  }
  const j = check(
    await api(`${API}/token?grant_type=client_credential&appid=${appid}&secret=${secret}`),
    "获取access_token"
  );
  state.appid = appid;
  state.token = j.access_token;
  state.tokenExpiresAt = Date.now() + (j.expires_in ?? 7200) * 1000;
  saveState(state);
  return state.token;
}

function sniffMime(buf) {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length > 6 && buf.slice(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (buf.length > 2 && buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
  return null;
}

const args = parseArgs(process.argv.slice(2));
const appid = process.env.WECHAT_MP_APPID;
const secret = process.env.WECHAT_MP_SECRET;
if (!appid || !secret) {
  console.error("缺少环境变量 WECHAT_MP_APPID / WECHAT_MP_SECRET");
  process.exit(1);
}

let buf;
if (args.file) {
  try {
    buf = readFileSync(args.file);
  } catch (e) {
    console.error(`读取文件失败：${e.message}`);
    process.exit(1);
  }
} else {
  try {
    const res = await fetch(args.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ai-news-bot/1.0)" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      console.error(`下载失败 HTTP ${res.status}`);
      process.exit(1);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error(`下载失败：${e.message}`);
    process.exit(1);
  }
}

if (buf.length > 10 * 1024 * 1024) {
  console.error(`图片 ${(buf.length / 1048576).toFixed(1)}MB，超过微信 10MB 上限，放弃配图`);
  process.exit(1);
}
const mime = sniffMime(buf);
if (!mime) {
  console.error("无法识别图片格式（支持 png/jpeg/gif），放弃配图");
  process.exit(1);
}
if (mime === "image/bmp") {
  console.error("微信不支持 bmp，放弃配图");
  process.exit(1);
}
const ext = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" }[mime];

const state = loadState();
const token = await getToken(appid, secret, state);

async function upload(t) {
  const fd = new FormData();
  fd.append("media", new Blob([buf], { type: mime }), "upload." + ext);
  return api(`${API}/media/uploadimg?access_token=${t}`, { method: "POST", body: fd });
}

let j = await upload(token);
// token 失效则强制刷新重试一次（无人值守场景常见）
if ((j.errcode === 40001 || j.errcode === 42001) && state.token) {
  state.token = null;
  saveState(state);
  const fresh = await getToken(appid, secret, state);
  j = await upload(fresh);
}
check(j, "上传正文图片");

if (!j.url) {
  console.error("接口未返回地址：" + JSON.stringify(j).slice(0, 200));
  process.exit(1);
}
console.log(j.url);
