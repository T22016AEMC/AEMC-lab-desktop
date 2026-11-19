#!/bin/bash
# 跑全部 Node 邏輯／引擎測試（vite 打包後執行）。用法：bash tests-archive/v390/runall.sh [套件名…]（不給名稱 = 全部）
# 失敗的套件會在最後列出；全部通過 exit 0。TAILN=行數 控制每個套件顯示輸出最後幾行（預設 3）。
cd "$(dirname "$0")" || exit 2
SUITES=(v350-logic v351-layout-test v351-logic v351-sim v360-cap v360-engine v360-sim v361-days v370-calc v370-layout v371-weather
  v380-adapt-v360-logic v380-adapt-v361-logic v380-adapt-v370-data v380-adapt-v371-logic v380-logic v381-hover
  v390-save v390-layout v390-stage4 v390-stage5 v390-tower v390-review review-fuzz)
[ $# -gt 0 ] && SUITES=("$@")
[ -d .work/v381src/src ] || { echo "先執行 node tests-archive/v390/setup.mjs"; exit 2; }
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
