# v3.9.0 測試封存

v3.9.0（農場自由擺放與倉庫）開發與審查時用的全部自動化測試。**不接進主專案的 npm scripts，也不是 CI**：改動存檔格式、版面、擺放、引擎之前後各跑一次，確認沒有退步。所有測試都不會修改專案原始碼。

## 環境需求

- Node 20 以上（寫成時用 24）、專案本身已經 `npm install`（用專案的 `node_modules/vite` 打包測試入口）。
- `git`、`tar`（取出舊版原始碼用；Windows 10 以上內建 tar）。
- 瀏覽器測試：本機 Chrome（預設 `C:/Program Files/Google/Chrome/Application/chrome.exe`，用環境變數 `CHROME` 改路徑）和 `playwright-core`（只裝在這個資料夾，不動專案的 `package.json`）。

## 第一次準備

```bash
node tests-archive/v390/setup.mjs                 # 從 git 取出 v3.6.2、v3.8.0、v3.8.1（719a575）原始碼到 .work/
cd tests-archive/v390 && npm install              # 只裝 playwright-core
```

`.work/`、`node_modules/`、`shots/` 都在 `.gitignore`，刪掉重跑 `setup.mjs` 即可。

### 取出 v3.8.1 原始碼做逐像素／逐項比對

`setup.mjs` 做的事等於：

```bash
mkdir -p tests-archive/v390/.work/v381src
git archive --format=tar 719a575 | tar -x -C tests-archive/v390/.work/v381src
```

（v3.6.2 = tag `v3.6.2`，v3.8.0 = tag `v3.8.0`，分別放 `.work/v362src`、`.work/v380src`。）測試引用它們的方式：Node 套件直接 `import` 舊版的 `layout.ts`、`migrate.ts`、`storage.ts`、`backup.ts` 和新版比；瀏覽器測試啟動一個 v3.8.1 的 dev server 當對照組（見下）。

## 跑法

```bash
bash tests-archive/v390/runall.sh                       # 23 個 Node 套件；也可只跑 bash runall.sh v390-review review-fuzz
node tests-archive/v390/run-browser.mjs                 # 7 個瀏覽器測試（自己啟動／關閉兩個 dev server）
npm run build && node tests-archive/v390/dist-check.mjs # 正式 build 不可含測試模式等 11 個字串
npx tsc -b                                              # 型別檢查
```

- `run-browser.mjs` 預設用 5181（目前專案）與 5182（v3.8.1 舊版）。埠被佔用時：`NEW_PORT=5191 OLD_PORT=5192 node tests-archive/v390/run-browser.mjs`。可以只跑指定的：`node tests-archive/v390/run-browser.mjs t5-edit-browser`。
- 單獨跑一個 Node 套件：`node tests-archive/v390/run-bundled.mjs tests-archive/v390/node/v390-save-entry.js`。
- 輸出（打包結果）在 `.work/out/`、截圖在 `browser/shots/`。

## Node 套件（`node/*-entry.js`）

| 套件 | 測什麼 |
|---|---|
| v390-review | **審查修正**：同一影格連續兩次擺放寫入都保留（含「用過期擺放結果寫入」的負向對照）、買建築忽略舊紀錄、匯入摘要 `layoutCount` |
| review-fuzz | **審查壓力測試**：300 組隨機擺放跑版面／導航／寶物草地／野餐墊／洗澡站位／`canPlace`／20 秒寵物模擬；損壞擺放資料（`__proto__`、極端座標、100 萬筆…）；匯入格式 2～7 × dataRev 的接受／拒絕矩陣 |
| v390-save | 存檔：`cleanFarmLayout` 54 萬項（含 2 萬次隨機）、和 v3.8.0／v3.8.1 的存檔讀寫互動、舊版讀到 dataRev 4 的行為、匯出入 2～6 |
| v390-layout | 版面：預設位置 = v3.8.1、腳下佔地、擺放規則 `canPlace`、跟著走的互動區、快取、寵物模擬 |
| v390-stage4 | 倉庫的後果：食盆收起、狗窩／貓跳台收起、野餐墊、寶物擁擠提示 |
| v390-stage5 | 擺設模式：拖曳判斷（`editDrag`）、快捷鍵 E、引擎暫停與預覽 |
| v381-hover | v3.8.1 滑鼠互動 |
| v380-logic、v380-adapt-v36x／v37x | v3.8.0 個性／野餐／拍照，以及舊測試（v3.6.0、v3.6.1、v3.7.0、v3.7.1）針對 v3.8.0 之後的預期調整過的版本 |
| v371-weather、v370-calc、v370-layout | 天氣、計算機解析器、版面（和 v3.6.2 比對） |
| v361-days、v360-cap／engine／sim | 收藏天數、寶物上限、玩耍與尋寶引擎、混合模擬 |
| v351-layout-test／logic／sim、v350-logic | 洗澡站位、食盆、金幣經濟等 |

`fixtures/` 是兩個舊版存檔／匯出檔範例（`save363.json`、`export370.json`），給 v380-adapt-v370-data、v380-adapt-v371-logic、v380-logic 讀。

## 瀏覽器測試（`browser/*.mjs`，Playwright + 本機 Chrome）

| 測試 | 測什麼 |
|---|---|
| t1c-path | 預設畫面（新 5181 對舊 5182）逐像素比對：差異只在沙土路左段（x 0～36、y 249～313）；16 項（1280×640、1920×960 × 8 情境） |
| t2-scale | 8 種視窗的縮放（整數倍優先、小於七成五才非整數倍）、畫面不出界 |
| t3-follow-browser | 物件移到新位置後入口與互動跟著走（住家門、鐘樓、公佈欄、池塘洗澡） |
| t4-browser | 倉庫的後果（食盆、狗窩收起；金幣不被扣） |
| t5-edit-browser | 擺設模式（購買／編輯分頁）：拖曳合法／不合法、倉庫列、收起、還原預設、買了放進倉庫的提示卡、橫幅不出界（96 項） |
| t6-planter-coral-browser | 花槽、珊瑚：倉庫縮圖、放上場景、拖曳、收回、重新整理 |
| t7-save-browser | 新舊版互相讀存檔：v3.8.1 讀到 dataRev 4 的提示與存檔不被覆寫、匯入格式 5／6 的確認視窗 |

通過條件：結束碼 0 且沒有「失敗」開頭的輸出行。

## 已知失敗與例外

- **t1-pixel 已被 t1c-path 取代**（沙土路從場景左緣鋪滿，預設畫面和 v3.8.1 不再逐像素相同，t1c 只允許那塊差異）。舊腳本沒有放進來。
- **t2-scale 的「純黑像素」**：v3.8.1 也有純黑像素（寵物素材本身），所以允許 12 × 每方向格數²（實測 7～8 個邏輯像素，隨寵物動畫幀變動；審查時發現上限 7 會偶發失敗），不是 0。黑邊問題會是幾萬個像素以上。
- **t1c-path 會寫 `browser/diff-pixels.json`**（已在 `.gitignore`），只是除錯用。
- dev server 熱更新後若素材索引換了，測試可能讀到另一個實例（skins 沒載入）→ 重啟 dev server 就好；`run-browser.mjs` 每次都重新啟動，不會遇到。
- 測試用日期固定在 2026-11-19 前後（`T0`），睡覺時段 23～6 點，測試別用 22.5 點。
- `dist-check.mjs` 的 11 個字串（測試模式、生物圖鑑、`__farm`、`shiftTime`、`flowerbed`、`seesaw`、`butterfly_`、`polaroid_frames_a`、`polaroid_frames_c`、`picnic_decor`、`stickers_`）是依 CLAUDE.md 與各階段測試記錄整理出來的清單，不是當年腳本的逐字複本；新增「不可進正式版」的字串時直接加在檔案最上面的 `FORBIDDEN`。
- 沒有整合進來的：其他版本的舊 Node／瀏覽器腳本（v3.7.x 的 t370*、v3.8.x 的 t380*／t381*、`live*.mjs` 線上測試、PWA 升級測試、各種 `dbg-*`／`patch-*` 一次性腳本）。它們在舊 session 的 scratchpad，不屬於 v3.9.0 的回歸範圍，也沒有針對 v3.9.0 重新確認過。
