#!/bin/bash
# 4.0 階段 B2 的 Node 套件（vite 打包後執行）。用法：bash tests-archive/v400b2/runall.sh [套件名…]
# 原圖資料夾：ASSET_SRC（預設 repo 上一層的「像素風圖片」；第 7 項會讀原圖）
cd "$(dirname "$0")" || exit 2
SUITES=(v400b2-themes)
[ $# -gt 0 ] && SUITES=("$@")
FAILED=()
for t in "${SUITES[@]}"; do
  echo "=== $t"
  timeout 900 node run-bundled.mjs "node/$t-entry.js" ".work/out/$t" 2>&1 | tail -"${TAILN:-3}"
  rc=${PIPESTATUS[0]}
  echo "exit=$rc"
  [ "$rc" -ne 0 ] && FAILED+=("$t")
done
if [ ${#FAILED[@]} -gt 0 ]; then echo "失敗：${FAILED[*]}"; exit 1; fi
echo "Node 套件全部通過（${#SUITES[@]} 個）"
