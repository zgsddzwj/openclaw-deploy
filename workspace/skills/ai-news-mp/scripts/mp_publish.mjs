#!/usr/bin/env node
// 把一篇图文推送到微信公众号草稿箱。Node >= 20（内置 fetch / FormData / Blob），零依赖。
//
// 用法：
//   node mp_publish.mjs --title "标题" --html article.html [--digest "摘要"] [--author "作者"] [--cover cover.jpg]
//
// 凭据从环境变量读取：WECHAT_MP_APPID / WECHAT_MP_SECRET（不要写进任何文件）。
// 封面会上传为永久图片素材并按文件名缓存，同一张图不会重复上传。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API = "https://api.weixin.qq.com/cgi-bin";
const dir = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(dir, ".mp_state.json");

const HINTS = {
  40164: "服务器公网 IP 不在公众号后台 IP 白名单里：mp.weixin.qq.com → 设置与开发 → 基本配置 → IP白名单",
  40001: "appsecret 不正确或已被重置",
  48001: "该账号没有此接口权限（未认证账号部分接口受限）",
  45009: "接口调用次数超限，稍后再试",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1] ?? "";
  }
  if (!args.title || !args.html) {
    console.error("用法：node mp_publish.mjs --title \"标题\" --html article.html [--digest 摘要] [--author 作者] [--cover cover.jpg]");
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

async function uploadCover(token, coverPath) {
  const buf = readFileSync(coverPath);
  const fd = new FormData();
  fd.append("media", new Blob([buf], { type: "image/jpeg" }), path.basename(coverPath));
  const j = check(
    await api(`${API}/material/add_material?access_token=${token}&type=image`, {
      method: "POST",
      body: fd,
    }),
    "上传封面"
  );
  return j.media_id;
}

async function getThumb(token, coverPath, state) {
  state.thumbs ??= {};
  if (coverPath) {
    const key = path.basename(coverPath);
    if (state.thumbs[key]) return state.thumbs[key];
    const mediaId = await uploadCover(token, coverPath);
    state.thumbs[key] = mediaId;
    saveState(state);
    return mediaId;
  }
  const cached = Object.values(state.thumbs)[0];
  if (cached) return cached;
  console.error("未提供 --cover，且没有历史封面可用。往 workspace/covers/ 放几张图，或本次传 --cover。");
  process.exit(1);
}

const stripTags = (s = "") =>
  s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function addDraft(token, article) {
  const j = await api(`${API}/draft/add?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ articles: [article] }),
  });
  // token 失效则强制刷新重试一次（无人值守场景常见）
  if ((j.errcode === 40001 || j.errcode === 42001) && state.token) {
    state.token = null;
    saveState(state);
    const fresh = await getToken(process.env.WECHAT_MP_APPID, process.env.WECHAT_MP_SECRET, state);
    return check(
      await api(`${API}/draft/add?access_token=${fresh}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articles: [article] }),
      }),
      "新建草稿"
    );
  }
  return check(j, "新建草稿");
}

const args = parseArgs(process.argv.slice(2));
const appid = process.env.WECHAT_MP_APPID;
const secret = process.env.WECHAT_MP_SECRET;
if (!appid || !secret) {
  console.error("缺少环境变量 WECHAT_MP_APPID / WECHAT_MP_SECRET");
  process.exit(1);
}

const state = loadState();
const token = await getToken(appid, secret, state);
const thumb = await getThumb(token, args.cover, state);

const html = readFileSync(args.html, "utf-8");
const article = {
  title: args.title.slice(0, 64),
  author: args.author || "",
  digest: (args.digest || stripTags(html).slice(0, 54)).slice(0, 120),
  content: html,
  thumb_media_id: thumb,
  need_open_comment: 0,
  only_fans_can_comment: 0,
};

const res = await addDraft(token, article);
console.log(`草稿创建成功 media_id=${res.media_id}`);
console.log("下一步：登录 mp.weixin.qq.com → 草稿箱，检查排版后点「发表」；发表时记得勾选 AI 生成内容声明。");
