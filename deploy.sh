#!/usr/bin/env bash
# 部署脚本：把本地代码推到服务器，并同步进 OpenClaw 运行工作区。
#
# 用法：./deploy.sh   （默认直连 ubuntu@<服务器IP>:<SSH端口>，密钥 ~/.ssh/<SSH别名>）
#       DEPLOY_SERVER 可覆盖：含 @ 按显式主机（配 DEPLOY_PORT/DEPLOY_KEY），
#       不含 @ 则视为 ~/.ssh/config 里的别名（如 <SSH别名>）

set -euo pipefail
cd "$(dirname "$0")"

SERVER="${DEPLOY_SERVER:-ubuntu@<服务器IP>}"
SSH_PORT="${DEPLOY_PORT:-<SSH端口>}"
SSH_KEY="${DEPLOY_KEY:-$HOME/.ssh/<SSH别名>}"
if [[ "$SERVER" == *"@"* ]]; then
  SSH_OPTS=(-o ConnectTimeout=15 -o BatchMode=yes -p "$SSH_PORT" -i "$SSH_KEY")
else
  SSH_OPTS=(-o ConnectTimeout=15 -o BatchMode=yes)   # 别名：端口/密钥交给 ssh config
fi

# 行为：
#   1. 打包本地仓库（排除 .git / .env / .env.swo / deploy.sh / 运行时产物），推到
#      服务器 /home/ubuntu/apps/openclaw-deploy/ —— 只覆盖同名文件，不删除服务器已有文件
#   2. 在服务器上把 workspace/ 内容拷进 ~/.openclaw/workspace/（main Agent），
#      把 workspace-qq/ 内容拷进 ~/.openclaw/workspace-qq/（qq-task Agent，本地存在时）
#      —— 同样只覆盖，不删除
#   3. 输出变更清单并校验两边一致
#
# 说明：
#   - .env（密钥）永远不会被打包推送，服务器上的密钥只能在那边改
#   - 技能代码和脚本每次运行时现读磁盘，部署即生效，无需重启网关
#   - 本脚本不做删除同步；要删服务器上的文件请手动 ssh 处理，防误删

DEPLOY_DIR="${DEPLOY_DIR:-/home/ubuntu/apps/openclaw-deploy}"
QQ_WORKSPACE_DIR="${QQ_WORKSPACE_DIR:-/home/ubuntu/.openclaw/workspace-qq}"

ssh "${SSH_OPTS[@]}" "$SERVER" true 2>/dev/null \
  || { echo "✗ 无法连接 $SERVER（检查 ssh 别名与密钥）"; exit 1; }

echo "── 打包并上传到 $SERVER ──"
tar czf - \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./.env.swo' \
  --exclude='./deploy.sh' \
  --exclude='./article.html' \
  --exclude='./article.txt' \
  --exclude='./digest.md' \
  --exclude='./digest.json' \
  --exclude='./.mp_state.json' \
  --exclude='./.last_cover.txt' \
  --exclude='tasks.jsonl' \
  --exclude='reports' \
  . | ssh "${SSH_OPTS[@]}" "$SERVER" "cat > /tmp/openclaw-deploy-incoming.tgz"

ssh "${SSH_OPTS[@]}" "$SERVER" "DEPLOY_DIR='$DEPLOY_DIR' QQ_WORKSPACE_DIR='$QQ_WORKSPACE_DIR' bash -s" <<'REMOTE'
set -euo pipefail
DEPLOY_DIR="${DEPLOY_DIR:-/home/ubuntu/apps/openclaw-deploy}"
QQ_WORKSPACE_DIR="${QQ_WORKSPACE_DIR:-$HOME/.openclaw/workspace-qq}"
RUNTIME_DIR="$HOME/.openclaw/workspace"

[ -d "$DEPLOY_DIR" ] || { echo "✗ 服务器上不存在 $DEPLOY_DIR"; exit 1; }
[ -d "$RUNTIME_DIR" ] || { echo "✗ 服务器上不存在 $RUNTIME_DIR"; exit 1; }

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
tar xzf /tmp/openclaw-deploy-incoming.tgz -C "$STAGE"

echo "── 部署目录 $DEPLOY_DIR ──"
changed=0
while IFS= read -r f; do
  f=${f#./}
  if [ -f "$DEPLOY_DIR/$f" ]; then
    cmp -s "$STAGE/$f" "$DEPLOY_DIR/$f" && continue
    echo "  [更新] $f"
  else
    echo "  [新增] $f"
  fi
  changed=$((changed + 1))
done < <(cd "$STAGE" && find . -type f | LC_ALL=C sort)
if [ "$changed" -eq 0 ]; then echo "  （无差异）"; fi
cp -rf "$STAGE/." "$DEPLOY_DIR/"

echo "── 运行工作区 $RUNTIME_DIR ──"
rt_changed=0
while IFS= read -r f; do
  f=${f#./}
  if [ -f "$RUNTIME_DIR/$f" ]; then
    cmp -s "$STAGE/workspace/$f" "$RUNTIME_DIR/$f" && continue
    echo "  [更新] $f"
  else
    echo "  [新增] $f"
  fi
  rt_changed=$((rt_changed + 1))
done < <(cd "$STAGE/workspace" && find . -type f | LC_ALL=C sort)
if [ "$rt_changed" -eq 0 ]; then echo "  （已是最新）"; fi
cp -rf "$STAGE/workspace/." "$RUNTIME_DIR/"

if [ -d "$STAGE/workspace-qq" ]; then
  echo "── QQ Agent 工作区 $QQ_WORKSPACE_DIR ──"
  [ -d "$QQ_WORKSPACE_DIR" ] || { echo "✗ 服务器上不存在 $QQ_WORKSPACE_DIR（先在服务器上创建 qq-task Agent）"; exit 1; }
  qq_changed=0
  while IFS= read -r f; do
    f=${f#./}
    if [ -f "$QQ_WORKSPACE_DIR/$f" ]; then
      cmp -s "$STAGE/workspace-qq/$f" "$QQ_WORKSPACE_DIR/$f" && continue
      echo "  [更新] $f"
    else
      echo "  [新增] $f"
    fi
    qq_changed=$((qq_changed + 1))
  done < <(cd "$STAGE/workspace-qq" && find . -type f | LC_ALL=C sort)
  if [ "$qq_changed" -eq 0 ]; then echo "  （已是最新）"; fi
  cp -rf "$STAGE/workspace-qq/." "$QQ_WORKSPACE_DIR/"
else
  echo "── QQ Agent 工作区：本地无 workspace-qq，跳过 ──"
fi

echo "── 校验 ──"
while IFS= read -r f; do
  f=${f#./}
  cmp -s "$STAGE/workspace/$f" "$RUNTIME_DIR/$f" || { echo "✗ 校验失败: $f"; exit 1; }
done < <(cd "$STAGE/workspace" && find . -type f | LC_ALL=C sort)
if [ -d "$STAGE/workspace-qq" ]; then
  while IFS= read -r f; do
    f=${f#./}
    cmp -s "$STAGE/workspace-qq/$f" "$QQ_WORKSPACE_DIR/$f" || { echo "✗ 校验失败: workspace-qq/$f"; exit 1; }
  done < <(cd "$STAGE/workspace-qq" && find . -type f | LC_ALL=C sort)
fi
echo "✓ 部署完成：部署目录与各运行工作区均已同步（代码现读磁盘，无需重启网关）"
REMOTE
