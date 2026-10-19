# OpenClaw AI 资讯公众号工作流

每天 **07:00 / 19:00（北京时间）** 各执行一次：抓取 AI 圈新闻 → LLM 写成公众号文章 → 推送到公众号**草稿箱** → 微信里收到汇报，人工检查后发表。同时把个人微信接进来，随时跟 Agent 对话。

```
服务器（Ubuntu 26.04 · 华为云 <服务器IP> · 时区 Asia/Shanghai）
  OpenClaw Gateway 2026.10.5（npm 全局安装，systemd 常驻，只绑 127.0.0.1:18789）
    ├─ cron 定时任务 07:00 / 19:00
    ├─ 技能 ai-news-mp（~/.openclaw/workspace/skills/ai-news-mp/）
    │    ├─ fetch_news.mjs   抓 RSS（量子位/IT之家/爱范儿/Solidot/HN/Verge/TechCrunch/OpenAI）→ digest.md
    │    ├─ （LLM 选题写作 → humanize-zh-pro 去AI味自查 → article.html）
    │    ├─ gen_cover.mjs    文生图封面（Seedream，按本期主题生成，每期不同）
    │    └─ mp_publish.mjs   调公众号 API → 草稿箱
    └─ 微信渠道（腾讯官方 openclaw-weixin 插件，扫码绑定）
```

发布走「草稿箱 + 人工发表」：个人主体公众号自 2025-07 起已被微信回收 API 发表权限，且人工过目再发，内容质量可控。

> 本项目当前为**服务器原生安装**方案（npm 国内镜像，不依赖 Docker、不依赖 GitHub）。如需在新机器复现，见下文「复现到新服务器」。

## 当前部署状态（2026-10-19 部署完成）

- [x] 套件上传：服务器 `/home/ubuntu/apps/openclaw-deploy/`
- [x] Node v26.12.0（npmmirror 二进制包，装于 /usr/local）
- [x] OpenClaw 2026.10.5（npm 全局，npmmirror 源）
- [x] 技能工作区：`~/.openclaw/workspace/`（ai-news-mp + humanize-zh-pro 去AI味技能；封面每期由 Seedream 按文章主题实时生成，covers/ 静态橙色图仅兜底）
- [x] 写作规范：主题色亮橙 #FF6622；去 AI 味硬规则 + humanize 检测自查已写入 SKILL.md
- [x] 联网搜索：web_search 已启用并实测（provider 锁 Tavily；额度报错时 Agent 按 SKILL.md 自愈切 Brave）
- [x] 模型：火山引擎 Ark（OpenAI 兼容）`deepseek-v4-1-flash-261017`
- [x] 公众号凭据：AppID/Secret 已配 systemd 环境文件，IP 白名单已加
- [x] onboard 初始化 + 网关守护进程（systemd user 服务 + lingering）
- [x] 定时任务：AI早报 07:00 / AI晚报 19:00，草稿箱 + 微信简短通知（全链路已跑通）
- [x] 微信桥：openclaw-weixin 2.4.10 扫码绑定，投递验证 OK
- [ ] 人工验收：草稿箱检查样式（含「样式自查」稿）后手动「发表」
- [ ] QQ 群机器人：已上线并端到端实测；「记录对象」名单待填（见第八节）

## 一、服务器环境（已就绪）

- SSH：`ssh <SSH别名>`（ubuntu@<服务器IP>:<SSH端口>，密钥 ~/.ssh/<SSH别名>，本地 ssh config 别名）
- 同机已有：adward_web、ocr-pro 两个容器（均绑 127.0.0.1，互不干扰）
- 资源：3.7G 内存（可用约 2.9G）、磁盘剩 57G —— OpenClaw 官方口径 2G 内存可跑
- 时区：Asia/Shanghai，cron 直接写 `0 7 * * *` / `0 19 * * *`

## 二、onboard 初始化（已完成 2026-10-19）

模型走**火山引擎 CodingPlan**（OpenAI 兼容）：base-url `https://ark.cn-beijing.volces.com/api/coding/v3`，模型 `deepseek-v4.1-flash`。
（2026-10-23 从按量付费 Ark `/api/v3` + `deepseek-v4-1-flash-261017` 切换；封面生成的 ARK_API_KEY 仍用按量 key，CodingPlan 不含图片。换 key 时必须同步清旧凭据档案：`openclaw models auth logout ark:default --agent <id> --yes`，否则旧档案会持久化冷却锁拦住所有请求。）

```bash
# 1. 生成网关令牌
openssl rand -hex 32   # 记下输出，记为 TOKEN

# 2. 非交互初始化（custom provider 直连 Ark）
openclaw onboard --non-interactive --accept-risk --skip-health \
  --auth-choice custom-api-key \
  --custom-api-key <ARK_KEY> \
  --custom-base-url "https://ark.cn-beijing.volces.com/api/coding/v3" \
  --custom-model-id deepseek-v4.1-flash \
  --custom-compatibility openai --custom-text-input --custom-provider-id ark \
  --gateway-auth token --gateway-token <TOKEN> \
  --gateway-bind loopback \
  --install-daemon --skip-channels

# 3. 验证
openclaw gateway status
curl -s http://127.0.0.1:18789/healthz
```

公众号凭据走 systemd 环境文件 `~/.config/systemd/user/openclaw-gateway.service.d/env.conf`。**注意 `[Service]` 节头必须写**，否则整段指令被 systemd 静默忽略：

```ini
[Service]
Environment=WECHAT_MP_APPID=xxx
Environment=WECHAT_MP_SECRET=xxx
```

改完执行 `systemctl --user daemon-reload && systemctl --user restart openclaw-gateway.service`。注意 `openclaw gateway restart` 是热重启，**不会**重新加载单元环境变量。

控制台（127.0.0.1:18789）本机浏览走 SSH 隧道：`ssh -L 18789:127.0.0.1:18789 <SSH别名>`。

## 三、微信公众号准备（需要用户操作）

1. mp.weixin.qq.com → 设置与开发 → 基本配置：取 `AppID`、`AppSecret`（Secret 只显示一次）
2. **IP 白名单**加 `<服务器IP>`，否则 access_token 拿不到（脚本报 40164）
3. 告知账号类型：个人未认证订阅号 = 草稿+人工发表（本方案）；认证号 = 后续可升级全自动
4. 封面：每期由 `gen_cover.mjs` 根据当篇文章主题实时生成（Seedream，1664x704 橙色系）；`~/.openclaw/workspace/covers/` 里留几张静态橙色图，仅在生成失败时兜底
5. 账号定位（名称/读者/口吻）填进技能 SKILL.md 的「账号定位」小节

## 四、定时任务与微信对话

见 [automations.md](automations.md)：推荐直接把那段话发给 Agent 自建自报。

微信桥（腾讯官方插件）：

```bash
openclaw plugins install "@tencent-weixin/openclaw-weixin"
openclaw config set plugins.entries.openclaw-weixin.enabled true
openclaw channels login --channel openclaw-weixin   # 出二维码，个人微信扫码确认
openclaw gateway restart && openclaw channels status
```

> 扫码授权属个人微信接入自动化收发，存在一定账号风控风险；介意可改绑企业微信或 Telegram。

## 五、验收清单

- [x] `openclaw gateway status` 运行中，healthz 正常
- [x] 定时任务全链路：AI早报手动触发，草稿推送成功，微信通知送达（首跑因投递 ID 大小写失败，已修复，见 automations.md）
- [ ] 微信里能和 Agent 对话（已扫码绑定，发条消息确认）
- [ ] 查看草稿箱「样式自查」稿：大标题/着重/图片/表格/列表渲染符合预期，确认后删除该稿
- [ ] 人工「发表」成功；次日 07:00 / 19:00 自动各一条

## 六、安全与运维

- 网关只绑 loopback，**不**对外暴露 18789；管理一律 SSH 隧道
- 密钥只进环境文件和 openclaw 配置，不进 git（.gitignore 已配）
- 日志：`journalctl --user -u openclaw -f`（服务名以 `systemctl --user list-units | grep -i claw` 实际为准）
- 升级：`sudo npm i -g openclaw@latest --registry=https://registry.npmmirror.com && openclaw gateway restart`

## 七、本地改代码怎么部署

本地仓库是代码的唯一真源。改完代码在仓库根目录跑一条命令（默认直连 ubuntu@<服务器IP>:<SSH端口>，密钥 ~/.ssh/<SSH别名>；可用 `DEPLOY_SERVER` 等环境变量覆盖）：

```bash
./deploy.sh
```

脚本会把本地代码推到服务器 `/home/ubuntu/apps/openclaw-deploy/`，再同步进运行工作区 `~/.openclaw/workspace/`，最后输出变更清单并校验一致。注意：

- **只覆盖同名文件，不删除**服务器上多出来的文件；`.env`（密钥）永远不打包推送，密钥只能在服务器上改
- 技能代码每次运行现读磁盘，部署即生效，无需重启网关
- `digest.md` / `article.html` 等运行时产物在排除清单里，不会被打包
- 要删除服务器上的文件请手动 ssh 处理，脚本刻意不做删除同步，防误删

## 八、QQ 群机器人（qq-task Agent，待激活）

同一个网关上的第二个**隔离 Agent**：独立 workspace（`~/.openclaw/workspace-qq`），与公众号 Agent（main）互不影响——插件不启用、配置纯增量、全程不重启网关，微信链路零改动。

**形态**：QQ 群里 @机器人 记任务 / 查任务 / 勾销（技能 `qq-task-log`，台账在技能目录 `tasks.jsonl`）；每日 21:00 定时把「今日新增 + 未完成」汇总发回群里。

**已就绪**（2026-10-22，端到端实测通过）：

- [x] Agent `qq-task` 已创建，qqbot 渠道流量已路由绑定到它（`qq-task <- qqbot`，QQ 消息不会进 main）
- [x] 技能 `workspace-qq/skills/qq-task-log/` 已部署（本地改，`./deploy.sh` 推）
- [x] 官方插件 `@tencent-connect/openclaw-qqbot` 2.0.3 已启用，凭据已配，探活 connected；群内 @机器人 实测回复正常
- [x] 「QQ任务日报」每日 21:00 定时任务已建，手动触发实测投递成功

**投递说明（2026-10-22 更新）**：管理员已在 QQ 开放平台开通**主动消息权限**，群聊/私聊主动发送实测均通。
每日 21:00 日报**双投递**：管理员 QQ 私聊（cron announce，目标 `qqbot:c2c:<管理员QQopenid>`）
+ 群聊（Agent 用 message 工具发 `group:<群openid>`）；报告原文同时存档 `reports/`。
若 QQ 平台收回权限（报「主动消息失败」），改回单投私聊：把 cron 提示语里群发那句删掉即可；
微信兜底：`openclaw cron edit <id> --channel openclaw-weixin --to "<你的微信ID@im.wechat>"`。

**待补充**：技能 SKILL.md 的「记录对象」还空着（当前登记所有人的任务）——把要统计的成员群名片填进去即限定范围。

## 复现到新服务器

```bash
# 1. Node（npmmirror 二进制，版本号按镜像站最新 v26 取）
curl -fsSL -o /tmp/node.tar.xz https://registry.npmmirror.com/-/binary/node/v26.12.0/node-v26.12.0-linux-x64.tar.xz
sudo tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1

# 2. OpenClaw + 工作区
sudo npm i -g openclaw@latest --registry=https://registry.npmmirror.com
cp -r workspace ~/.openclaw/workspace

# 3. 按第二节 onboard，第四、五节配置与验收
```
