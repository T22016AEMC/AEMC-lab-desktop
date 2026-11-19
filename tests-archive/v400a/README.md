# v4.0 階段 A 測試封存（商店骨架、實例 id、集齊獎勵）

不接進主專案的 npm scripts，也不是 CI。改動商店、存檔、擺放、事件之前後各跑一次。測試不會修改專案原始碼。

## 準備

沿用 `tests-archive/calendar-tweaks` 的環境（`npm install` 過的 playwright-core、`.work/v3100src` = v3.10.0 對照組、`node/env-shim.js`、`browser/lib.mjs`）：

```bash
node tests-archive/calendar-tweaks/setup.mjs
cd tests-archive/calendar-tweaks && npm install
```

`.work/`、`browser/shots/` 不進 git（`.gitignore` 已涵蓋 `tests-archive/*/.work`、`shots`）。

## 跑法

```bash
bash tests-archive/v400a/runall.sh                         # 2 個 Node 套件
NEW_PORT=5181 node tests-archive/v400a/run-browser.mjs      # 瀏覽器測試（自己啟動／關閉 dev server）
python tests-archive/v400a/adapt-a.py                      # 對既有測試的預期值異動（可重複執行，已改過的略過）
```

整套回歸：`tests-archive/v390`（25 個 Node 套件＋9 個瀏覽器測試）、`tests-archive/calendar-tweaks`（8＋10）、這裡（2＋1），外加 `npx tsc -b`、`npm run build && node tests-archive/calendar-tweaks/dist-check.mjs`。

## Node 套件

| 套件 | 測什麼 |
|---|---|
| v400a-logic | 常數（DATA_REV 6、格式 8、價格、上限、TEMP 商品、商品表沒有外觀）；實例 id 解析；`cleanShop` 防呆（5000 次隨機、冪等、安全上限 200）；沒有 shop 的舊存檔和 v3.10.0 逐欄相同；`cleanFarmLayout`／`resolvePlacement` 的實例（沒擁有的紀錄忽略、順序）；購買（買多個、每種 10、全體 60、金幣不足存檔不變、300 組隨機購買序列金幣不為負、建築一次、殘留紀錄、預設位置被佔放進倉庫、寵物不經過 purchase）；測試資料的 skin 類型、前置條件、環境主題（買一次、切換、預設草地不寫存檔、存檔來回、裝飾品分頁的「環境主題」小標題）；買後收進倉庫重新整理仍在、擺上場景、收回、還原預設；匯出入來回（含實例）、匯入格式 2～9 矩陣；事件固定順序、套組 5 片不算、只有狗的傳說不算傳說全集齊、補發（合併、單一、未達成不發、只發一次、不觸發舊事件、400 組隨機）；最擠：買滿 60 個盡量擺上場景 → 寶物上限、野餐墊、引擎挖寶尋寶不丟錯誤、提示都是「擺設太多」 |
| v400a-store | farmStore＋真的 LocalStorageAdapter：購買立刻寫入（扣金幣與實例同一次寫入）、同時 5 次買建築只成功 1 次、同時 3 次買裝飾編號不重複、金幣不足不寫；補充 a：寫入前一刻被接手（購買裝飾、建築、領養）→ 回傳失敗、otherTab、記憶體回到購買前（同一個物件）、儲存沒變；領養對照、滿 6 隻；載入補發（合併 5 項 295、立刻寫入、重新載入不再發、只 1 項用原彈窗、沒達成不發也不寫、舊事件不在載入時觸發）；3.10.0 的舊分頁讀到 dataRev 6 不讀、不覆寫；被接手的分頁買不了（放最後：farmStore 的 markOtherTab 會停止這個模組之後所有存檔） |

## 瀏覽器測試

| 測試 | 測什麼 |
|---|---|
| ta-shop-browser | 截圖 1024×768／1366×768／1920×988／1366×282／1024×282 × 寵物、裝飾品、建築、農場（即將開放）＋金幣不足＋確認列（低視窗）；商店在視窗內、低視窗捲得到最後一個商品；農場不可點；確認步驟、取消、雙擊確認只買一次、購買提示、擁有數、建築已擁有、Esc；倉庫合併格 ×2、拖一個上場景、重新整理一個擺著一個在倉庫；領養走商店、滿 6 隻、零寵物第一次領養不變；兩分頁（被接手買不了；寫入前一刻被接手 → 鎖定、記憶體回到購買前、儲存沒變）；補發合併彈窗與單一彈窗、重新整理不再發、收藏冊集齊獎勵標示、沒有罰款字樣；商店開著時事件排隊 |

截圖在 `browser/shots/ta-*.png`。

## 對既有測試的預期異動（`adapt-a.py`，使用者在 4.0 階段 A 指令裡同意的範圍）

1. **存檔版本常數**：DATA_REV 5 → 6、匯出格式 7 → 8；「較新版本」的 dataRev 6 → 7、格式 8 → 9；匯入矩陣多一格。`ct-v3101-compat`（3.10.1 和 3.10.0 相容）改成「除了 dataRev 與格式版本之外逐欄相同」，3.10.0 的匯出檔改用 3.10.0 讀出的存檔來做；新版匯出檔 3.10.0 改成「不能匯入（較新版本）」。
2. **事件**：`v380-adapt-v360-logic-entry.js` 207 行，L001～L004 都有時通知從 `['dogVault', 'catAtlantis']` 變成 `['dogVault', 'catAtlantis', 'colLegend']`（獨立的新事件「傳說全集齊」）。
3. **文字**：「草地太擠」→「擺設太多」（stage4、v360 adapt、t4、t5 第 11 段、t9）。
4. **舊購買介面**（`adapt_a_browser.py`）：t4 第 2 段改成在商店確認狗窩「已擁有」、貓跳台可以買；t5 第 10 段購買步驟改走商店（「預設位置被佔住就放進倉庫」的斷言保留），第 13 段刪掉購買分頁專屬的斷言，第 14 段只剩編輯分頁。

## 已知

- 測試存檔的個性要用真的 id（`lively` 等）；`calm` 不是合法個性，載入時會觸發「補個性並寫回」（v3.8.0 的行為），讓「載入不寫入」之類的斷言失準。
- 同一個 Node 程序裡連續「開頁」時，上一頁沒等的寫入會在下一頁設好存檔之後才落地；`v400a-store` 的 `boot` 先等幾個 tick。
