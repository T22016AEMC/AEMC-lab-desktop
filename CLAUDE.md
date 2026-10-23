# virtual-desktop 專案規則

macOS 風格虛擬桌面網頁（React + TypeScript + Vite + zustand + Tailwind），部署於 GitHub Pages。

## 版本規則（每次修改程式後都必須遵守）

1. 更新 `package.json` 的 `version`，依語意化版本：
   - 修正錯誤 → 第三碼 +1（1.0.0 → 1.0.1）
   - 新增功能 → 第二碼 +1，第三碼歸零（1.0.1 → 1.1.0）
   - 重大改版或不相容變更 → 第一碼 +1，其餘歸零（1.1.0 → 2.0.0）
2. 在 `CHANGELOG.md` 最上方新增該版本紀錄：版本號、日期、變更內容（中文）。
3. 完成後建立 git commit，訊息格式「vX.Y.Z: 變更摘要」，並加上 git tag `vX.Y.Z`。

## 版本規劃

- 階段一（桌面主體）完成為 v1.0.0
- 階段二（小遊戲）完成為 v1.1.0

## 外部程式（啟動台）

- 外部程式清單是使用者自己的，存在瀏覽器（`store/appListStore.ts`，鍵名 `aemc-desktop:app-list`，含 `schemaVersion`），一律透過 `lib/documentStorage.ts` 的儲存層讀寫，不可直接呼叫 localStorage（之後會搬到帳號雲端）。
- 預設清單在 `src/config/apps.ts` 的 `DEFAULT_APPS`（新使用者與「恢復預設程式」用）。新增預設程式只改這個檔案；圖片圖示放進 `public/icons/<id>.<副檔名>`。
- 所有外部程式一律用 `window.open(url, '_blank', 'noopener,noreferrer')` 新分頁開啟，不使用 iframe，也沒有 openMode 或「即將推出」機制。視窗系統只給內建程式（小遊戲）。
- 本網站只支援電腦：可視寬度低於 1024px 顯示提示頁、不載入桌面；不要再加手機介面或觸控虛擬按鈕。不使用全螢幕。

## GitHub 與部署

- 帳號：`T22016AEMC`（個人帳號，非組織）；repo：`T22016AEMC/AEMC-lab-desktop`（公開）。
- 正式網址：https://t22016aemc.github.io/AEMC-lab-desktop/
- `BASE_PATH` 由 GitHub Actions 自動帶入 `/AEMC-lab-desktop/`；本機開發為 `/`。
- 套件管理器：npm。
- git 作者只設在本專案（不加 `--global`）：`user.name` = `T22016AEMC`、`user.email` = `t22016@aemc.com.tw`。
- GitHub Pages 來源必須是「GitHub Actions」，push 到 main 時由 workflow 自動 build 並部署。

### 推送流程（之後的更新都依此執行）

1. 本機完成修改，依版本規則更新 version / CHANGELOG，`npm run build` 確認成功，commit 並打 tag。
2. 只有在使用者確認後才推送；不要自行推送。
3. 推送前先執行 `gh auth status`，確認已登入且帳號是 `T22016AEMC`。若未安裝 gh、未登入或帳號不符，停下來告訴使用者該怎麼做，不要改用其他方式。
4. 首次推送：建立公開 repo `T22016AEMC/AEMC-lab-desktop`，推送 main 與 tag，並用 `gh api` 將 Pages 來源設為 GitHub Actions。之後的版本直接 `git push origin main --follow-tags`。
5. 確認 Actions 部署成功後，告訴使用者正式網址。

### 階段流程

- 階段一（v1.0.0）完成並 build 成功後，先停下來，告知本機預覽指令與網址，等使用者確認畫面後再推送。
- 推送與部署完成後，才開始階段二（v1.1.0）。

## 寵物養殖場（src/farm/）

- 桌面是像素風草地養殖場，沒有桌面圖示；**住家是啟動台的入口**（點門；備用入口：選單列小圖示、F4）。Dock 平時隱藏，有內建視窗（小遊戲）開啟時才滑出，沒有啟動台按鈕。
- 存檔只能透過 `SaveStorage` 介面（`src/farm/save/`）；存檔是含 `schemaVersion` 的單一物件（目前 v3），改資料格式要同步更新 `migrate.ts` 並補測試（v2 含海洋生物與乾淨 v2 都要驗證）。寵物存檔鍵名 `aemc-desktop:farm-save`，遊戲最高分的舊鍵名不能動。寫入失敗要提示使用者（`setStorageErrorHandler`），不可靜默忽略。
- 測試模式與圖鑑（`src/dev/`）只能在 `import.meta.env.DEV` 下條件式動態載入，正式 build 不可包含；改完要檢查 `dist/` 搜尋不到「測試模式」「生物圖鑑」`__farm`、`shiftTime` 等字串。測試用的修改入口不要放進 `farmStore`。
- 純邏輯（`sim/`、`pixel/pets.ts`）不碰 DOM，可在 Node 測試。寵物行為只決定「動作名稱」，畫哪一幀由 `ANIMS` 表對應（邏輯與畫圖分離）；不做旋轉、傾斜、縮放，往左走用水平翻轉。

### 像素素材規格與管線

- 素材一律由 `node scripts/process-assets.mjs "<原圖資料夾>"` 從洋紅底原圖產生到 `public/assets/`（圖集＋`manifest.json`）；**原圖不進 repo**（資料夾在 `.gitignore`）。不要手動改圖集，改處理腳本後重跑。
- 全部素材 1 格像素 = 1 邏輯像素，畫面上像素大小一致（整數倍放大，不旋轉、不縮放）；各素材可各自取樣來調整大小（取樣比例 p 越小圖越大），但同一隻動物的所有姿勢共用同一個 p，貓的 extra 檔維持與 core 的相對取樣。目前尺寸：狗站姿高 46／43／41／36／34／31（黃金／哈士奇／邊牧／柴犬／貴賓／柯基）、貓 33／32／31／30／29／28（布偶／英短藍貓／暹羅／橘虎斑／三花／黑貓）；住家 139×134、鐘樓 123×160、樹 82×103、路燈 51×84；狀態與特效圖示約 15 高。改尺寸要改 `process-assets.mjs` 的目標值、重跑，並同步 `pixel/layout.ts` 的尺寸常數（測試會比對）。場景邏輯解析度約 480×270，整數倍放大（`image-rendering: pixelated`、處理 devicePixelRatio）；畫圖座標一律取整數。
- 每張素材有錨點：`ax` 水平中心、`ay` 腳底基準線；同一隻動物所有姿勢腳底對齊。alpha 只有 0 或 255。
- 動物素材鍵名：`dog_<品種>_<動作>`、`cat_<花色>_<動作>`、`front_dog_*`／`front_cat_*`（領養預覽）；品種 id 與素材鍵名的對應在 `config/species.ts`（`assetKey`）。貓的 `sit_b` 是背面，標記 `unused_back`，不可用在動畫上。
- 鐘樓時鐘由程式畫（`pixel/clock.ts`），位置來自處理管線偵測到的鐘面中心（manifest 的 `meta.clock`）；時間必須來自遊戲的時間來源（含測試模式覆寫），不可直接用 `Date.now()`；指針角度公式有純函式測試，改動要保留。
- 場景配置固定（住家左下、路燈右側、鐘樓最右後排且周圍留空、2 棵樹、固定裝飾），寵物活動範圍與障礙物都在 `pixel/layout.ts`（`petBounds`、`blockers`），不要讓寵物走進住家、停在燈柱後面或鐘樓底座；領養按鈕放在選單列，不要放浮動按鈕在畫面角落。
- 新增素材或改尺寸後，要看 `screenshots/assets-overview.png` 與 `assets-report.txt` 確認沒有洋紅殘留、白框、大小不一。

## 其他約定

- 「關於這個桌面」顯示的版本號必須從 `package.json` 讀取，不可寫死。
- 小遊戲不使用外部圖片素材，一律以程式繪製；每個遊戲放在 `src/games/<遊戲名稱>/`。
- 最高分等 localStorage 讀寫一律包在 try/catch 中。
