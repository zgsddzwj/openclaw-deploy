# 早晚 7:30 定时任务

服务器时区为 Asia/Shanghai，cron 直接写本地时间表达式，任务上再加 `--tz Asia/Shanghai` 显式声明。

投递模式为**简短通知制**：文章只进公众号草稿箱，微信只发一条简短通知（标题 + 选题条数 + 发表提醒），不发长内容。

## 现有任务

| 任务 | ID | cron | 下次触发 |
| --- | --- | --- | --- |
| AI早报 | `fc601622-62b5-430e-961d-9a25882111ce` | `0 7 * * *` | 明天 07:00 |
| AI晚报 | `11a6e8b4-52b6-4b9f-bd09-d59217dec235` | `0 19 * * *` | 今天 19:00 |

## 创建命令（复现用）

```bash
openclaw cron add --name "AI早报" --cron "0 7 * * *" --tz "Asia/Shanghai" --exact \
  --channel openclaw-weixin --to "<你的微信ID@im.wechat>" --announce --timeout-seconds 900 \
  --message "执行 ai-news-mp 技能的完整流程：抓新闻、写文章、推送公众号草稿箱。完成后只发一条简短通知：本期标题、共几条选题、提醒到公众号后台「草稿箱」检查后手动发表（勾选 AI 生成声明）。不要把选题列表、原文链接或正文发到微信。"

# AI晚报同法：--cron "0 19 * * *"
```

> **`--to` 的微信 ID 区分大小写**。`openclaw status` 会话表里显示的是小写化版本，直接复制会导致投递报
> `sendMessage ret=-3 invalid arguments`。正确大小写从网关日志拿：
> `journalctl --user -u openclaw-gateway | grep 'config cached for'`
> 也可以在微信里让 Agent 自己建任务（它知道当前会话的原始 ID），建完用 `openclaw cron get <id>` 核对大小写。

## 常用操作

```bash
openclaw cron list              # 查看全部任务
openclaw cron get <任务id>       # 看单个任务配置与投递目标
openclaw cron run <任务id>       # 手动触发一次（验证用）
openclaw cron runs <任务id>      # 运行历史与投递结果
openclaw cron disable <任务id>   # 临时停用（enable 恢复）
```

## 每期产出

- 公众号后台「草稿箱」一条图文，人工检查后点「发表」（发表时勾选 AI 生成声明）
- 微信收到一条简短通知：标题、选题条数、发表提醒
