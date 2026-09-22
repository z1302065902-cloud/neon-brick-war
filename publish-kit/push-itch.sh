#!/bin/bash
# ============================================================
# push-itch.sh — 把 Neon Brick War 发布到 itch.io
#
# 用法:
#   publish-kit/push-itch.sh                 # 推免费试玩版 → 默认 channel
#   publish-kit/push-itch.sh full            # 推完整版 → 付费 channel
#
# 依赖 ~/.game-factory 的 butler 与 ~/.cursor/mcp-secrets.env 里的 ITCH_API_KEY。
# ============================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUTLER="$HOME/.game-factory/tools/butler/darwin-arm64/butler"
SECRETS="$HOME/.cursor/mcp-secrets.env"

[ -x "$BUTLER" ] || { echo "找不到 butler: $BUTLER"; exit 1; }
KEY=$(grep "^ITCH_API_KEY=" "$SECRETS" | cut -d= -f2- | tr -d '"'"'"' ')
[ -n "$KEY" ] || { echo "未配置 ITCH_API_KEY"; exit 1; }

TARGET_USER="zsy2026"
TARGET_GAME="neon-brick-war"
MODE="${1:-demo}"

cd "$ROOT"
if [ "$MODE" = "full" ]; then
  echo "构建完整战役版…"
  npx tsc && VITE_CAMPAIGN=free npx vite build --outDir dist-full
  SRC="dist-full"; CHANNEL="$TARGET_USER/$TARGET_GAME:full"
else
  echo "构建免费试玩版（前 5 关）…"
  npx tsc && npx vite build --outDir dist-demo
  SRC="dist-demo"; CHANNEL="$TARGET_USER/$TARGET_GAME:html5"
fi

echo "推送到 $CHANNEL …"
BUTLER_API_KEY="$KEY" "$BUTLER" push "$SRC" "$CHANNEL"
BUTLER_API_KEY="$KEY" "$BUTLER" status "$TARGET_USER/$TARGET_GAME"
echo "完成。页面：https://$TARGET_USER.itch.io/$TARGET_GAME"
