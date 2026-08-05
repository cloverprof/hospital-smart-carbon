#!/usr/bin/env bash
# 生成交付压缩包（提示词 15）。
# 包含：源码、配置、锁文件、文档、测试、截图、已构建 dist。
# 排除：.git、node_modules、缓存、临时文件、原始 3D 资产。
set -euo pipefail

cd "$(dirname "$0")/.."
DATE=$(date +%Y%m%d)
NAME="hospital-smart-carbon-claude-delivery-${DATE}"
OUT="/tmp/${NAME}"

rm -rf "$OUT" "/tmp/${NAME}.zip"
mkdir -p "$OUT"

# 源码与配置
cp -R src public scripts docs "$OUT/"
cp index.html package.json pnpm-lock.yaml pnpm-workspace.yaml \
   tsconfig.json tsconfig.app.json tsconfig.node.json \
   vite.config.ts eslint.config.js .gitignore \
   README.md AGENTS.md IMPLEMENTATION_GAPS.md DESIGN.md "$OUT/" 2>/dev/null || true

# 已构建产物（附带，不替代源码）
if [ -d dist ]; then cp -R dist "$OUT/dist"; fi

# 清理不应分发的内容
rm -rf "$OUT/docs/dev/MASTER_SPEC.md"        # 甲方原始提示词，不随交付包分发
find "$OUT" -name ".DS_Store" -delete 2>/dev/null || true
find "$OUT" -name "*.log" -delete 2>/dev/null || true
find "$OUT" -name "*.tsbuildinfo" -delete 2>/dev/null || true

( cd /tmp && zip -qr "${NAME}.zip" "$NAME" -x "*.DS_Store" )
rm -rf "$OUT"

echo "打包完成: /tmp/${NAME}.zip"
du -h "/tmp/${NAME}.zip"
unzip -l "/tmp/${NAME}.zip" | tail -1
