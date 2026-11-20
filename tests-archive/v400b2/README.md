# v4.0 階段 B2：環境主題（地板＋小路＋遠景＋路燈＋樹）與主題裝飾

不接進主專案的 npm scripts，也不是 CI。設計與規格見 `CLAUDE.md` 的「階段 B2」。

| 檔案 | 用途 |
|---|---|
| `node/v400b2-themes-entry.js`、`runall.sh` | Node 測試（`bash tests-archive/v400b2/runall.sh`，原圖資料夾 `ASSET_SRC`）：圖集／延後載入／檔案大小、既有素材逐像素相同、尺寸與錨點、洋紅 0 殘留 0 誤吃（魔法路燈／魔法樹／水晶球座另比例）、48 件偵測切件與表一致、商店（環境主題 6 款 30、裝飾 48 種 小 3／中 6／大 10、每種 10／合計 60）、存檔／購買／環境主題切換／舊存檔相容、夜晚補光表＝量測、drawGlow 預設逐筆相同、路燈與樹沿用舊輪廓 |
| `measure-glow.mjs` | 夜晚補光光源（路燈 6 款、水晶球座、資訊終端）的量測：從成品圖集的發光部位重心算出相對錨點的 `{ dx, dy }`；`src/farm/config/envThemes.ts` 的 `GLOW` 要和它一致 |
| `browser/tb1-env-browser.mjs`、`run-browser.mjs` | 瀏覽器測試（自己開 dev server，port 5194）：商店裝飾品分頁（環境主題列＋六主題裝飾小標題、買環境主題 30 並立刻換上、切換、換回草地、重新整理維持、買小／中／大裝飾進倉庫、1366×282 捲得到最後）、6 主題 1366×768 日夜、無塵室下雨與下雪（粒子只在窗玻璃、牆與地面完全沒有；森林下雨地面也有）、夜晚光暈的 `fillRect` 位置＝各自錨點（白天沒有）、1366×282、沒有環境主題的舊存檔。截圖在 `browser/shots/`（共 15 張場景圖＋商店圖，不進 git） |
| `browser/tb2-pwa-env-browser.mjs`、`run-pwa.mjs` | 離線＋PWA 升級：`git archive 9049eca`（B1 完成時）建舊版、目前程式建新版（都在 `.work/`），可切換的靜態伺服器。新圖集在預先快取裡、穿森林環境才載入 `env_forest`、有主題裝飾才載入 `decor_themes`、離線換魔法環境從快取載入。`node tests-archive/v400b2/run-pwa.mjs` |
| `adapt-b2.py` | 對既有測試的預期值異動（可重複執行），見下表 |

## 對既有測試的預期異動

| 測試 | 異動 | 原因 |
|---|---|---|
| v400a `v400a-logic`、`v400a-store`、`ta-shop-browser` | 測試開頭 `SHOP_ITEMS.push(...LEGACY_TEMP_ITEMS)`；6 種 TEMP 裝飾的比對只看 `temp`；裝飾分頁其他比對只看 `grant.type === 'decor'`；買滿 60 用 6 種暫時裝飾各 10 個；商品表的外觀允許 B2 的環境主題 | 階段 A 的 6 種暫時裝飾（蘑菇、小花叢、石頭、灌木、花槽、珊瑚石堆）B2 起商店不賣（換成 48 種主題裝飾），商店流程的測試拿它們當樣本 |
| v400b1 `v400b1-skins` | 建築外殼商品不含環境主題（`slot !== 'env'`）；新增素材白名單加上 `env_*`／`decor_themes` 圖集 | 環境主題也是 skin 商品；新增 B2 素材 |
| v400r `v400r-assets` | `env_*`／`decor_themes` 的洋紅殘留改用 `isBgExact`（恰好 #FF00FF） | 新原圖底色恰好是 #FF00FF，畫作裡的紫、粉紅不是；一般的 `isBg` 會把魔法的紫、粉紅當殘留（逐格 0 殘留、0 誤吃見 v400b2） |
| v390 `v380-logic` | 圖集清單多 `env_<主題>`×6、`env_thumbs`、`decor_themes` | 新增延後載入圖集 |
| v390 `t9-picnic-pick-browser` | 頁面安裝假時鐘（固定 2026-11-19 10:00），存檔日期由同一個時間算（相對日期），不寫死日期也不依賴執行當天的時間 | 原本寫死 11/19 又沒有假時鐘，隔天跑會離線衰減到心情 29 < 野餐 `minMood` 30（B1 改成 `Date.now()` 仍要在白天跑；B2 改成假時鐘） |
| v400b1 `adapt-b1.py` | 移除 t9 的那一筆（改由 `adapt-b2.py` 負責） | 同上 |
