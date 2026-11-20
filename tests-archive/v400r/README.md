# v4.0 階段 R：統一 4×4 格的原圖重新套用

2026-11 原圖資料夾「像素風圖片」的每張圖都被重新存成整齊的 4×4 像素格（board_themes 是 3）。管線估算的像素格因此每張都落在 4.00（= 估算範圍下限），沒有明確參數的素材會變大（樹 82×103→113×142、小路高 67→103…）。這一階段維持畫面上原本的大小：每張圖改用明確的像素格 `P_FIXED`（`scripts/process-assets.mjs`），並加上「估算碰到邊界就報錯」的保護。

不接進主專案的 npm scripts，也不是 CI。備份：`像素風圖片_備份_20261120.zip`（素材資料夾的上一層，換圖後、動手前的狀態，168 檔）。

## 檔案

| 檔案 | 用途 |
|---|---|
| `before.json` | 換圖前（fa6e940）的素材輸出：每個圖集的尺寸、每幀的寬高、錨點、meta。所有「和以前一樣嗎」的比對都以它為準 |
| `assets-snapshot.mjs` | 把某個 repo 的素材輸出存成 `assets.json`＋貼圖集（`sheet-*.png`，含花槽／珊瑚 ×8） |
| `run-shots.mjs`、`browser/scene-shots.mjs` | 截圖：1024／1366／1920 × 白天／夜晚的全場景、引擎快照、狗窩（窩裡＋門口）、貓跳台（兩層平台）、鐘樓、住家、水池、公佈欄近照、第一次領養畫面；寵物固定位置（`engine.editing = true` 停住）。`node tests-archive/v400r/run-shots.mjs before|after`（自己開關 dev server，埠 5191） |
| `compare-shots.mjs` | 前後並排：`shots/compare/pair-*.png`（同名截圖左右並排）、`obj-*.png`（每個物件一列，從兩個版本的圖集切）。`node tests-archive/v400r/compare-shots.mjs <換圖前 repo 根目錄>`（舊圖集用 `git show fa6e940:public/assets/…` 取出） |
| `tune-p.mjs`、`tune-terrain.mjs` | 調參：用管線自己的 `sheet({ probe })` 掃描像素格 p，找輸出尺寸和 `before.json` 相同的值（結果寫到 `.work/tune-result.json`）。`ASSET_SRC=<原圖資料夾> node tests-archive/v400r/tune-p.mjs [項目…]` |
| `cat-tree-envelope.mjs` | 由圖集算 `layout.ts` 的 `CAT_TREE_ENVELOPE`（用換圖前的圖集可逐項重現舊值） |
| `node/v400r-assets-entry.js`、`runall.sh` | 素材一致性測試（見下） |
| `adapt-r.py` | 對既有測試的預期值異動（可重複執行） |
| `edge-magenta.mjs`、`edge-before.json`、`edge-r-nodefringe.json`、`edge-magenta-table.csv` | 邊緣洋紅偏色計數（判斷式 = 管線的 `edgeMagentaCount`）：換圖前（fa6e940）、換圖後未去邊、去邊後，逐張表格。測試以 `edge-before.json` 為基準 |
| `defringe-shots.mjs` | 去邊放大圖（換圖前｜未去邊｜去邊後）：雲、樹、狗窩、路燈、貓跳台、花槽、珊瑚 → `shots/defringe/` |
| `overlay-old-assets.mjs` | 把目前素材蓋到「舊版逐像素比對」的對照組（`v390/.work/v381src`、`calendar-tweaks/.work/v391src`），讓 t1c-path、tp-pixel-v391 比的是程式；改素材後要再跑一次 |

`shots/`、`.work/` 不進 git。

## 跑法

```bash
bash tests-archive/v400r/runall.sh                 # 素材一致性測試
python tests-archive/v400r/adapt-r.py              # 既有測試的預期值異動
node tests-archive/v400r/overlay-old-assets.mjs    # 舊版對照組換成目前素材（跑 v390、calendar-tweaks 瀏覽器測試前）
```

## 素材一致性測試（v400r-assets）

1. 關鍵素材（樹、路燈、鐘樓四張、狗窩、貓跳台、食盆、小路、遠景、公佈欄、野餐墊、住家、水池）的尺寸與錨點 = `layout.ts`／`picnic.ts` 的常數；`BOARD_GREEN`、`WATER`、鐘面備用值 = manifest；四張鐘樓的窗玻璃都在 `TOWER_WINDOW` 裡
2. `envelopes.ts` 的尺寸、錨點、逐列不透明區段 = 圖集
3. `CAT_TREE_ENVELOPE` = 圖集重新算一次
4. 寵物 156 格：錨點 ay = 底邊、底邊那列有不透明像素、ax = 水平中心、腳底位置和換圖前差 0
5. 每張素材洋紅殘留 0、沒有半透明像素
6. `MOUTH` 在狗的素材外框內
7. 沒有明確參數的原圖會讓管線報錯（估算碰到範圍下限）
8. 邊緣洋紅偏色：合計 ≤ 換圖前；雲、樹、狗窩、路燈、貓跳台、花槽、珊瑚逐張 ≤ 換圖前；其餘逐張 ≤ 換圖前 + 2（計數也會算到真正的紅、粉紅、紫色輪廓）；去邊不改透明度、不改薰衣草紫與粉紅

## 對既有測試的預期異動（`adapt-r.py`）

| 測試 | 異動 | 原因 |
|---|---|---|
| v390 `v370-layout` | 和 v3.6.2 比的建築空位：食盆 h 26→27 | 新原圖沒有 57×26 的取樣格，取 57×27 |
| v390 `v390-tower` | t8 位置蓋住格數 207/86→205/82；面積表 E／B25 與新規則鎖定值（每項差 0.3% 以內） | 樹、路燈等輪廓重畫 |
| v390 `v391-picnic-pick` | 和 v3.9.0 比自動位置時，舊程式改用新的 `envelopes.ts` | 不改的話 422 組裡 21 組不同；改了之後 0 組不同 = 差異全部來自輪廓 |
| calendar-tweaks `td1-label` | 愛心框 16×15（錨點 8）→ 17×15（錨點 9） | fx_heart 新尺寸 |
| v390 `t1c-path`、calendar-tweaks `tp-pixel-v391`（對照組） | 舊版原始碼的對照組換成目前素材＋BOWLS_H 27（`overlay-old-assets.mjs`） | 不換的話整個畫面都不同（素材本身換了）；換了之後和 v3.8.1、v3.9.1 逐像素相同 |
