# v3.10.0 第一批測試封存（簽到月曆、兩分頁寫入權、取消遊戲金幣、四項小改）

不接進主專案的 npm scripts，也不是 CI。改動存檔、選單列、引擎畫面、野餐、拍照之前後各跑一次。所有測試都不會修改專案原始碼。

## 準備

```bash
node tests-archive/calendar-tweaks/setup.mjs        # 從 git 取出 v3.9.1（80c567a）與 v3.9.0 原始碼到 .work/
cd tests-archive/calendar-tweaks && npm install     # 只裝 playwright-core
```

`.work/`、`node_modules/`、`browser/shots/` 都在 `.gitignore`。另外也要準備 `tests-archive/v390`（見那邊的 README），整套回歸會一起跑。

## 跑法

```bash
bash tests-archive/calendar-tweaks/runall.sh                                   # 7 個 Node 套件
NEW_PORT=5191 OLD_PORT=5192 node tests-archive/calendar-tweaks/run-browser.mjs  # 9 個瀏覽器測試（自己啟動／關閉兩個 dev server：NEW = 目前、OLD = v3.9.1）
npm run build && node tests-archive/calendar-tweaks/dist-check.mjs              # 正式 build 不可含測試模式等 16 個字串
```

本機 5181 被舊的 dev server 佔用時，用 `NEW_PORT`／`OLD_PORT` 換埠。只跑指定的：`node tests-archive/calendar-tweaks/run-browser.mjs td1-label-browser`。

## Node 套件（`node/*-entry.js`）

| 套件 | 測什麼 |
|---|---|
| ct-b-games | B：原始碼不再有遊戲發金幣的路徑；啟動台程式金幣與 v3.9.1 逐項相同；`earning.gameCoins` 相容 |
| ct-e-writer | E：寫入權（單一分頁永不誤判、後開的接手、storage 事件、寫入權鍵失敗不鎖死、較新版本不接手、匯入先接手、三分頁隨機交錯 500 回合） |
| ct-c-calendar | C：`checkins` 防呆（隨機）、簽到規則、`farmStore.checkIn`、載入與跨日不再自動 +5、DATA_REV 5／格式 7、匯入 2～8 矩陣、v3.9.0 讀到 dataRev 5 不覆寫 |
| ct-d3-swat | D3：弧線像素表、時間、6 色爪尖、鏡像 |
| ct-d23-snack | D2-3：點心在墊面內、比座位低、不壓籃子與食物、依參加者 |
| ct-d22-nap | D2-2：野餐睡覺的模擬（頻率、時長、上限、懶散）、引擎整場野餐 hooks 呼叫與不睡完全相同 |
| ct-d21-date | D2-1：日期文字、點陣字型、白邊寬度 |

## 瀏覽器測試（`browser/*.mjs`）

| 測試 | 測什麼 |
|---|---|
| tb-games-browser | B：5 個遊戲實際玩（2048 中途重新開始），金幣不變、沒有金幣提示 |
| te-writer-browser | E：同一個 context 兩個分頁；單一分頁 20 次重新整理 0 提示；錯過事件、匯入、匯出、寫入權鍵失敗 |
| tc-calendar-browser | C：三種視窗的紅點／簽到／截圖；6 種視窗選單列；更新前已領；沒有存檔；入口與互斥；跨午夜；兩分頁；v3.9.1 舊分頁；真實格式遷移（v3.9.1 寫出的存檔與匯出檔） |
| tp-pixel-v391-browser | 沒有標籤、揮爪、野餐的情境：與 v3.9.1 逐像素相同 |
| td1-label-browser | D1：標籤避開頭上圖示（5 種）、摸頭愛心畫在標籤之上 |
| td3-swat-browser | D3：6 色 × 左右 × 4 個時間點的弧線像素、真的掃過會揮爪 |
| td23-snack-browser | D2-3：三種參加組合的點心像素 |
| td22-nap-browser | D2-2：睡姿、ZZZ、拍照不叫醒、摸頭不醒、存檔與對照組相同 |
| td21-date-browser | D2-1：三款相框的大小、日期點陣、上半部逐像素不變、下載 PNG |

截圖在 `browser/shots/`（`tc-*`、`te-*`、`td*-*`）。

## 對 tests-archive/v390 的預期異動

`adapt-c.py`（可重複執行）：C 把 `DATA_REV` 4 → 5、匯出格式 6 → 7，舊測試裡寫死的版本號跟著改（「較新版本」的 dataRev 5 → 6、格式 7 → 8；t7 的「載入後改變的欄位」多了 dataRev）。共 40 處，判斷邏輯不動。

## 測試時踩過的坑

- 在頁面裡用同一張畫布連續 `engine.render` 比對時，上一次留下的畫布狀態會造成 ±1 的顏色差 → 每次用新畫布（`willReadFrequently`）。
- 貓的品種 id 是 `tabby`／`britishblue`（素材名稱是 orange／bluecat）。
- 同一個 context 開第二個分頁時，注入存檔的旗標要放 localStorage（新分頁的 sessionStorage 是空的，會重新注入）。
