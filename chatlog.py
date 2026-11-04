#!/usr/bin/env python3
# 聊天记录查看器：读 OpenClaw 会话数据库，按时间倒序打印最近的用户/机器人消息。
# 用法: python3 chatlog.py [agent] [条数] [会话过滤词]
#   python3 chatlog.py                  # qq-task 最近 30 条
#   python3 chatlog.py qq-task 50       # 最近 50 条
#   python3 chatlog.py qq-task 30 group # 只看群会话
#   python3 chatlog.py main 20          # 看公众号 Agent 的会话
import sqlite3, json, sys, os
from datetime import datetime


def fmt_ts(ts):
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts / 1000).strftime("%m-%d %H:%M")
    return str(ts)[:16].replace("T", " ")

agent = sys.argv[1] if len(sys.argv) > 1 else "qq-task"
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 30
filt = sys.argv[3] if len(sys.argv) > 3 else ""

db_path = os.path.expanduser("~/.openclaw/agents/%s/agent/openclaw-agent.sqlite" % agent)
if not os.path.exists(db_path):
    print("找不到 %s" % db_path)
    sys.exit(1)
db = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True)

keymap = dict(db.execute("SELECT current_session_id, session_key FROM session_nodes"))
rows = db.execute(
    "SELECT session_id, created_at, event_json FROM transcript_events ORDER BY created_at DESC, seq DESC"
)
out = []
for sid, ts, ej in rows:
    try:
        ev = json.loads(ej)
    except Exception:
        continue
    if ev.get("type") != "message":
        continue
    msg = ev.get("message", {})
    role = msg.get("role", "?")
    content = msg.get("content", [])
    text = "".join(c.get("text", "") for c in content if isinstance(c, dict)).strip()
    if not text:
        continue
    key = keymap.get(sid, str(sid)[:8])
    out.append((ts, key, role, text))

printed = 0
for ts, key, role, text in reversed(out[:limit]):
    if filt and filt not in key:
        continue
    if role != "user" and (text.startswith("{") or text.startswith("[")):
        continue  # 旧回合里混入的工具原始输出，跳过
    tag = "用户" if role == "user" else "机器人"
    if "group" in key:
        who = "群"
    elif key.endswith(":main"):
        who = "私聊"
    else:
        who = key.split(":")[-1][:12]
    print("[%s] [%s] %s: %s" % (fmt_ts(ts), who, tag, text[:150]))
    printed += 1
    if printed >= limit:
        break
