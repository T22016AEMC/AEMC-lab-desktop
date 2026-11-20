# v4.0 階段 B1：主題外殼、亞特蘭提斯取代全黃金

不接進主專案的 npm scripts，也不是 CI。設計見 `notes/v4.0-B1/設計報告.md`。

## 停點 1（管線＋亞特蘭提斯）

| 檔案 | 用途 |
|---|---|
| `scripts/measure-skins.mjs`（repo 的 scripts） | 外殼量測：尺寸、內容外框、鐘面、窗戶偵測與信心、洋紅殘留、保留的內部洋紅、邊緣偏色、nearBg 保住的原圖像素。`--write` 寫 `skins-measure.json` |
| `skins-measure.json` | 量測結果；測試重跑後比對（數字可重現） |
| `frame-hashes.mjs`、`r-frames.json` | 每張素材的指紋（尺寸、錨點、meta、RGBA sha1）；`r-frames.json` = 階段 R 完成時（bfc1390）的基準，證明預設外觀逐像素相同 |
| `node/v400b1-skins-entry.js`、`runall.sh` | 停點 1 的 Node 測試 |
| `stop1-shots.mjs` | 檢查圖 → `browser/shots/`：`overlay/`（點擊區疊圖：預設、亞特蘭提斯、無塵室、魔法）、`magic/`（魔法主題：isBg 對照、nearBg 實際輸出、紅＝isBg 會吃掉的像素）、`sheets/`（每部位一張 contact sheet）、`compare/`（全黃金 → 亞特蘭提斯前後）。`ASSET_SRC=<原圖> node tests-archive/v400b1/stop1-shots.mjs <換圖前 repo 根目錄>` |
| `adapt-b1.py` | 對既有測試的預期值異動（可重複執行） |

`browser/shots/`、`.work/` 不進 git。

## 跑法

```bash
ASSET_SRC=<原圖資料夾> bash tests-archive/v400b1/runall.sh
python tests-archive/v400b1/adapt-b1.py
node tests-archive/v400r/overlay-old-assets.mjs     # 跑 t1c-path、tp-pixel-v391 之前（素材改了就要再跑）
```

## 對既有測試的預期異動

| 測試 | 異動 | 原因 |
|---|---|---|
| v390 `v370-layout` | 鐘樓四張圖的鍵名 gold → atlantis | 全黃金換成亞特蘭提斯 |
| v390 `v380-adapt-v360-logic` | 兩句傳說事件文案 | 金色屋頂／黃金鐘樓 → 亞特蘭提斯房屋／鐘樓 |
| v390 `t1c-path`（瀏覽器） | 移除「金色住家＋黃金鐘樓」情境；載入 `skins` 圖集失敗不中斷 | 外觀圖與圖集都換了，和 v3.8.1 比沒有意義 |
| v400r `v400r-assets`（直接改） | gold 鍵名 → atlantis；外殼用 nearBg 判斷殘留（保留內部洋紅的外殼外緣 ≤ 6）；邊緣偏色只比換圖前就有的素材；窗戶偵測只驗預設鐘樓；寵物格排除 `cat_tree_<主題>` | 新增 60 張外殼 |
| v400r `assets-snapshot.mjs`、`compare-shots.mjs` | 鍵名 gold → atlantis | 同上 |
