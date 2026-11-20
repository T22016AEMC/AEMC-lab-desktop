#!/bin/bash
# v4.0 階段 A 的 Node 套件（vite 打包後執行）。用法：bash tests-archive/v400a/runall.sh [套件名…]
# 需要 tests-archive/calendar-tweaks 已準備好（.work/v3100src 當 3.10.0 對照組、env-shim）。
cd "$(dirname "$0")" || exit 2
SUITES=(v400a-logic v400a-store)
[ $# -gt 0 ] && SUITES=("$@")
[ -d ../calendar-tweaks/.work/v3100src/src ] || { echo "先執行 node tests-archive/calendar-tweaks/setup.mjs"; exit 2; }
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
