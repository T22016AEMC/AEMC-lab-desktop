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
- **官方程式（v3.4.3 起共 7 個，強制更新給所有人）**：定義在 `src/config/apps.ts` 的 `OFFICIAL_APPS`，順序與穩定 id：`official-filmaster`、`official-specreader`、`official-chemscutter`、`official-elusim`、`official-autoellipso`、`official-moleform`、`official-adsorvia`（Adsorvia 網址是 `…/login`，網址一字不改）。官方程式的名稱、網址、logo 由程式碼決定，不由存檔決定；id 不可改（賺金幣冷卻以 id 為鍵）。新增或改官方程式只改這個檔案，圖示是 `public/icons/official-<小寫程式名>.png`。
- **合併規則**（`src/lib/officialApps.ts` 的 `mergeOfficialApps`，`appListStore.init` 載入已存清單時與每次修改後都套用，結果和存檔不同才寫回；只動 `apps`，不碰養殖場／設定／備份鍵）：官方 7 個依順序在最前面（少了補回、內容以程式碼為準）；後面接使用者新增的項目，保持相對順序；移除的只有三種：官方 id 的存檔項目（已被取代）、舊預設的確切 id（`LEGACY_DEFAULT_APP_IDS`：`filmaster`、`specreader`、`chemscutter`、`elusim`、`autoellipso`）、與官方網址相同的項目（網址用 `URL.href` 正規化後比對；視為同一個只留官方）。**其他任何項目一律保留，絕對不能刪**；沒有 id 的項目（`parseAppList` 補上由網址＋名稱決定的穩定 id `u-noid-…`）也保留。沒有存檔的新使用者直接得到官方 7 個且不寫入；壞掉或版本不認得的存檔不覆蓋。冪等：重複合併結果相同。
- 官方程式不能刪除、改名：`Launchpad` 對官方程式不顯示右鍵選單，`updateApp`／`removeApp` 對官方 id 直接忽略；新增或編輯成與官方相同網址由 `AppEditorDialog` 的 `validate` 擋下並說明。「恢復預設程式」= 只留官方 7 個（移除使用者新增的）。以後若有程式要退役，把它的 id 加進 `LEGACY_DEFAULT_APP_IDS` 風格的移除清單，不要用網址或名稱判斷。
- **logo 處理**（v3.6.3 重做）：`node scripts/process-logos.mjs <原圖資料夾>`（資料夾內 `<程式名>.png`，1024×1024、純洋紅 #FF00FF 背景、只有 logo；不要用同資料夾的 `*_source.png` 與 zip；不寫死路徑，也可用環境變數 `LOGO_SRC`）→ `public/icons/official-*.png`，一律 144×144（顯示尺寸 `Launchpad` 的 `ICON_SIZE` 72 的 2 倍）：洋紅去背（混色還原成 logo 本色＋透明度，despill）→ 裁到圖形外框置中 → 縮到 72%（較長邊、Lanczos3）→ 疊在各自的圓角底色上（`TILES` 表的底色與半徑是從 v3.6.2 的舊圖示取樣的，改底色就改這張表）。Adsorvia 預設是完整版（分子圖＋文字），只留分子圖的預覽版另存 `screenshots/adsorvia-b-144.png`、不放進 public。原圖不進 repo。`AppIcon` 的 `<img>` 還有 CSS 圓角 22%。圖示檔名不在 `assets/` 底下，vite-plugin-pwa 會用內容比對預快取；檔名不變時內容變了照樣會更新（升級測試：先載入舊版 dist、切換成新版重新整理，檢查載入與快取的是新的 `official-*.png`）。
- 所有外部程式一律用 `openExternal(url)`（`src/lib/openExternal.ts`：`window.open(url, '_blank')`，成功後立刻把 `opener` 設為 null）新分頁開啟，不用 `'noopener,noreferrer'`（加了之後瀏覽器不論成功與否都回傳 null，就無法判斷彈出視窗有沒有被擋，而「開啟成功才給金幣」需要判斷）；不使用 iframe，也沒有 openMode 或「即將推出」機制。視窗系統只給內建程式（小遊戲）。
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
6. **打 tag 之後要單獨執行 `git push origin vX.Y.Z`**：`--follow-tags` 只推送附註 tag（annotated），推不到我們用的輕量 tag（v3.2.0 就發生過）。推完用 `git ls-remote --tags origin` 確認遠端真的有該 tag。tag 不會觸發 workflow（只有 push main 會），所以不會重複部署。

### 上線測試規則

- 只用介面操作（正式版沒有測試模式、沒有 `__farm` 等全域物件）；時間與天氣用 Playwright 的假時鐘（`page.clock`），假時鐘的日期要和存檔裡的日期一致（存檔的 `lastDailyClaim`、`earning.date`、`bowl.date` 等要設成假時鐘當天，否則每日獎勵會多給、數字對不上）。
- **每個測試都要有逾時**：單項 60 秒（`page.setDefaultTimeout(60000)`，或自己包 `Promise.race`），整個上線測試上限 9 分鐘（用 `timeout 540 node …` 包起來）；不要寫沒有上限的迴圈。
- **遊戲自動遊玩類測試（例如用鍵盤自動玩 2048 到 512）只在本機跑，不在上線站跑**（耗時長又不穩，v3.2.0 上線測試曾因此跑 18 分鐘被中止）。上線站只確認遊戲館的進度顯示。
- 測試一開始要等開機畫面真的消失（`getByRole('button', { name: '點擊以開始' })` 的 `waitFor({ state: 'detached' })`），不要用固定毫秒等待。開機畫面（z-10000）會擋住所有指標事件，機器忙碌時淡出動畫來不及結束，下一步的點擊與拖曳就點到開機畫面——這就是 t310「貓拖曳」偶發失敗的根因（不是隨機行為，也不是等待不夠長，而是沒有等「狀態」）。

### 階段流程

- 階段一（v1.0.0）完成並 build 成功後，先停下來，告知本機預覽指令與網址，等使用者確認畫面後再推送。
- 推送與部署完成後，才開始階段二（v1.1.0）。

## 寵物養殖場（src/farm/）

- 桌面是像素風草地養殖場，沒有桌面圖示；**住家是啟動台的入口**（點門；備用入口：選單列小圖示、F4），**鐘塔的門是遊戲館的入口**（滑鼠移上去換開門版與「遊戲」招牌，點門開遊戲館視窗；備用入口：選單列的遊戲館小圖示）。5 個內建遊戲只放在遊戲館，啟動台只放使用者自己的程式（沒有「隱藏內建遊戲」，`app-list` 存檔的 `hiddenBuiltins` 欄位已移除、讀到要安全忽略）。Dock 平時隱藏，有內建視窗（小遊戲）開啟時才滑出，沒有啟動台按鈕。
- 存檔只能透過 `SaveStorage` 介面（`src/farm/save/`）；存檔是含 `schemaVersion` 的單一物件（目前 **v5**，見下方「v3.4.0 強制重置」：**舊格式（schema 1～4）不再升級，一律重置**，沒有 v3→v4 之類的升級程式；`migrate.ts` 只剩 `parseSave`（只吃 schema 5，並清理欄位）與 `isResetSchema`）。改資料格式時：新增欄位且舊 v5 存檔讀得進來就不必升 schema；否則要升版並決定舊存檔怎麼辦（升級或重置），補測試。寵物存檔鍵名 `aemc-desktop:farm-save`，遊戲最高分的舊鍵名不能動。寫入失敗要提示使用者（`setStorageErrorHandler`），不可靜默忽略。
- 測試模式與圖鑑（`src/dev/`）只能在 `import.meta.env.DEV` 下條件式動態載入，正式 build 不可包含；改完要檢查 `dist/` 搜尋不到「測試模式」「生物圖鑑」`__farm`、`shiftTime` 等字串。測試用的修改入口不要放進 `farmStore`。
- 純邏輯（`sim/`、`pixel/pets.ts`）不碰 DOM，可在 Node 測試。寵物行為只決定「動作名稱」，畫哪一幀由 `ANIMS` 表對應（邏輯與畫圖分離）；不做旋轉、傾斜、縮放，往左走用水平翻轉。

### 像素素材規格與管線

- 素材一律由 `node scripts/process-assets.mjs "<原圖資料夾>"` 從洋紅底原圖產生到 `public/assets/`（圖集＋`manifest.json`）；**原圖不進 repo**（資料夾在 `.gitignore`）。不要手動改圖集，改處理腳本後重跑。
- **素材檔名必須帶內容雜湊**（`<組名>.<8 碼>.png`、`manifest.<8 碼>.json`，`src/farm/pixel/assetIndex.ts` 記錄目前的 manifest 檔名），一律由處理管線產生，不可手動放沒有雜湊的 png／json 進 `public/assets/`。原因：vite-plugin-pwa 把 `assets/` 底下的檔案當成「檔名已帶雜湊」而不比對內容，沒有雜湊的素材會永遠停在舊的 service worker 快取（v3.1.0 上線時新水池看不到就是這個）。改素材後要驗證舊快取升級：把舊版的 dist 與新版的 dist 分別建好，用能切換內容的靜態伺服器（Cache-Control: max-age=600）先載入舊版、切換成新版後重新整理，檢查載入的 manifest／圖集檔名是新的、快取裡沒有舊素材、存檔還在（測試腳本範例在 scratchpad 的 upgrade-test.mjs，不進 repo）；另外邏輯測試會檢查檔名雜湊與內容一致。頁面是網路優先、service worker 立刻接手但不自動重新整理（會顯示「有新版本，重新整理即可」），不要改回 autoUpdate（會在使用者洗澡或玩遊戲時突然重新整理）。
- 全部素材 1 格像素 = 1 邏輯像素，畫面上像素大小一致（整數倍放大，不旋轉、不縮放）；各素材可各自取樣來調整大小（取樣比例 p 越小圖越大），但同一隻動物的所有姿勢共用同一個 p，貓的 extra 檔維持與 core 的相對取樣。目前尺寸：狗站姿高 46／43／41／36／34／31（黃金／哈士奇／邊牧／柴犬／貴賓／柯基）、貓 33／32／31／30／29／28（布偶／英短藍貓／暹羅／橘虎斑／三花／黑貓）；住家 139×134、鐘樓 123×160、樹 82×103、路燈 51×84、狗窩 99×83、貓跳台 72×90、食盆水盆 57×26（建築三個用 `process-assets.mjs` 的 `BUILDING_SCALES` 縮放係數：狗窩 ×1.15、貓跳台 ×1.15、食盆水盆 ×0.7，係數是除在像素格 p 上重新取樣，不是事後縮放）；狀態與特效圖示約 15 高。改尺寸要改 `process-assets.mjs` 的目標值、重跑，並同步 `pixel/layout.ts` 的尺寸常數（測試會比對）。場景邏輯解析度約 480×270，整數倍放大（`image-rendering: pixelated`、處理 devicePixelRatio）；畫圖座標一律取整數。
- **橘貓 core 的 sleep／eat／groom 三格是換圖的（v3.6.3）**：來源是 `cat_orange_core_fix.png`（3 隻橫排，原圖像素格 p≈5.5、比舊的清楚），`process-assets.mjs` 的 `CAT_CORE_FIX`／`catCoreFix` 用 `sheet({ solveGroup })` 求「三隻共用」的一個像素格 p（目前約 15.8），讓 sleep、eat 的寬度對齊舊的 sleep、eat，groom 的高度對齊舊的 sit_a；錨點沿用預設（水平中心、外框底邊）。`core.p`（橘貓 extra 的取樣基準）不受影響。碗畫在 eat 圖裡，程式不另外疊碗（所有貓的 eat 都是）。貓的第 8 格叫 `groom`（不是 happy；貓的 `happy` 動畫用 `sit_a`＋`stand`）。
- 每張素材有錨點：`ax` 水平中心、`ay` 腳底基準線；同一隻動物所有姿勢腳底對齊。alpha 只有 0 或 255。
- 動物素材鍵名：`dog_<品種>_<動作>`、`cat_<花色>_<動作>`、`front_dog_*`／`front_cat_*`（領養預覽）；品種 id 與素材鍵名的對應在 `config/species.ts`（`assetKey`）。貓的 `sit_b` 是背面，標記 `unused_back`，不可用在動畫上。
- 鐘樓時鐘由程式畫（`pixel/clock.ts`），位置來自處理管線偵測到的鐘面中心（manifest 的 `meta.clock`）；時間必須來自遊戲的時間來源（含測試模式覆寫），不可直接用 `Date.now()`；指針角度公式有純函式測試，改動要保留。
- 場景配置固定（住家左下、路燈右側、鐘樓最右後排且周圍留空、2 棵樹、固定裝飾），寵物活動範圍與障礙物都在 `pixel/layout.ts`（`petBounds`、`blockers`），不要讓寵物走進住家、停在燈柱後面或鐘樓底座；領養按鈕放在選單列，不要放浮動按鈕在畫面角落。
- 水池（開局就有，住家右上方後排）：位置與水面橢圓在 `pixel/layout.ts`（`pondPos`、`waterEllipse`、`WATER`），數值要與 manifest 的 `pond_a.meta.water`、尺寸一致（測試會比對）；水池與石頭、樹幹、鐘樓底座都在 `blockers`，寵物不會走進去。樹與裝飾要讓出水池，不可重疊。
- 版面（v3.1.1）：後排景物（鐘塔、2 棵樹、水池）與裝飾物貼草地上緣，位置全由 `pixel/layout.ts` 依草地上緣計算（`BACK_BASE`、`DECOR_BASE`、`BACK_MARGIN`），不手調座標；樹不縮放；裝飾物腳底與樹同一個 y；寵物活動範圍從草地上緣下 14 像素開始（草地中段也能跑）。建築空位（`buildingSlots`）有 5 個專用標記：走道上 kennel、bowls、catTree（腳底在走道上緣下 `PATH_FOOT` = 24，走道下半部至少留 `PATH_FREE_MIN` = 36 給寵物；狗窩位置見下方 v3.3.1），草地上 picnicMat、sandbox（留給之後的版本）。空位不顯示、不擋寵物；建築購買後才用 `slotBlockers` 加入障礙（購買後走道上會變窄，寵物要繞行）；窄視窗放不下的建築用 `buildingAvailability` 判斷、建築模式的提示由 `slotUnavailableMessage()` 算出「請放大視窗寬度（或高度）到約 N px 以上」（`SLOT_UNAVAILABLE_MESSAGE` 是找不到尺寸時的備用說法），不要刪建築種類。
- 拖曳寵物：按住 150 ms 或移動超過 4 px 才算拖曳，沒拖就是點擊；座標一律用 `fromCss`／`toCss`（處理 dpr 與整數縮放，不可有偏移）；放開用 `dropKind` 判斷落地、彈回（`nearestWalkable`）或洗澡。睡覺中被拖起用 `wakeForDrag`（不扣點，規則同叫醒）。
- 水池洗澡：同一時間只允許一隻（`usesPond`）；數值在 `BALANCE.bath`，扣點走既有的 `runAction('bath')`（跳進水池時才扣）；洗澡中的寵物不能被點、被拖；氣泡選單的洗澡是「走到水池前再跳進去」，途中點擊或拖曳取消。泡澡時寵物用水面橢圓裁切（程式裁切，不旋轉、不縮放）。
- 新素材 `scene_pond`（2 幀）、`fx_water`、`scene_clocktower_open` 由處理管線產生；開門鐘塔必須與 `clocktower` 同尺寸（123×160）、同錨點；夜晚開門版的門縫暖光要在暗色疊層之後再畫一次，鐘面維持清楚可讀。
- 新增素材或改尺寸後，要看 `screenshots/assets-overview.png` 與 `assets-report.txt` 確認沒有洋紅殘留、白框、大小不一。

## 金幣經濟與建築（v3.2.0）

- 介面上一律叫「金幣」，內部欄位仍叫 `points`（不改名）。新存檔初始 50（`BALANCE.startPoints`；已有存檔不補發）、每日 +5、日常活動 −1、領養狗貓都是 15（`species.ts` 的 `cost`；15／25／35 是 v3.0.0 前含海洋生物時的舊價格），第一隻免費（`farmStore.adoptPet` 的 `isFirst` = 沒有存檔或 0 隻寵物）。
- 賺金幣的規則是 `sim/earning.ts` 的純函式，數值在 `balance.ts`（`BALANCE.earn`）：啟動台開啟使用者的程式 +3（每程式每小時一次、合計每天 +10，開啟成功才給、管理清單不給）。**v3.10.0 起小遊戲不再給金幣**（遊戲本身保留；`useRoundReward`／`claimGame`／`gameGoals` 已刪除；存檔的 `earning.gameCoins` 只為相容保留，讀寫照舊、每天歸零、不再增加，不要拿它做新用途）。**冷卻與每日上限的時間一律用遊戲時間來源 `gameNow()`**（`farm/overrides.ts`，測試模式可平移），每日進度以本地日期 00:00 重置；不可直接用 `Date.now()`。純前端、存在瀏覽器，**無法防作弊**（程式註解有寫），帳號與雲端階段再處理，不要為此加複雜機制。
- **空位專用標記**：建築空位的 id 就是專用標記，也是存檔 `ownedBuildings` 的值與 `config/buildings.ts` 的建築 id：`kennel` 狗窩、`bowls` 食盆水盆、`catTree` 貓跳台（走道上半部）、`picnicMat`（草地，留給之後的版本；沙坑在 v3.6.0 開發期間做過又取消、沒有發布，認不得的 `sandbox` 由 `parseSave` 過濾，素材也不輸出）。**可購買的建築由 `PURCHASABLE` 決定**（`buyBuilding` 擋掉其他的）：有食盆水盆、狗窩、貓跳台（營火 v3.4.0 加入、v3.5.1 移除）；野餐墊不顯示、不開放，資料與 `buildingAvailability` 保留（留給之後的版本）。價格在 `BALANCE.buildings.price`（食盆水盆 10、狗窩／貓跳台各 20）。
- **購買規則**：建築選單列「建築」按鈕進入建築模式（`uiStore.buildMode`，再按一次或 Esc 離開），`ui/BuildLayer.tsx` 在可購買而未購買的空位顯示虛線框與價格，點開小卡片購買；金幣不足停用。窄視窗放不下的建築（`buildingAvailability` 的 `available` 為 false）不顯示空位，建築模式改顯示放大視窗的提示（見 v3.4.2）；已購買但放不下的建築，紀錄保留、畫面與障礙都隱藏（`engine.buildings()` 只回傳已購買且放得下的），放大後自動恢復，不退款不刪除。
- 購買後建築的腳下佔地才進障礙（v3.3.1 佔地：狗窩 76×22、食盆水盆 48×12、貓跳台 53×22）：`Layout.owned`（引擎在存檔變動時換新的 Set）→ `blockers(L)` 併入 `slotBlockers(slots, owned)`；走道下半部寬度必須維持 ≥ `PATH_FREE_MIN`（36，實際 44），三個建築全買完寵物也要走得過去（`pixel/nav.ts` 的 A* 尋路，測試會檢查連通）。貓跳台與睡在頂層的貓的不透明像素不可碰塔門與招牌（v3.4.2 起用像素判斷，測試會檢查）。
- 建築行為（`pixel/buildingUse.ts`）只決定去哪裡與動作名稱，動作畫面由 `ANIMS` 對應，不旋轉不傾斜。食盆：飽食度 < 40（v3.6.1 起，原本 60；「餓了」驚嘆號是 `lowThreshold` 30）且沒在睡覺／洗澡／被操作／選單開著，每隻寵物每天 2 份（全部寵物共用一池，上限 = 寵物數 × `BALANCE.buildings.bowls.portionsPerPet`，查詢時即時算；存檔 `bowl` 只記今天用掉幾份，本地日期 00:00 補滿；v3.4.2）、同時最多 2 隻，用完顯示程式畫的「空」圖示（`pixel/icons.ts`）；狗窩／貓跳台：睡覺時間睡在座位上、下雨躲雨，各最多 2 隻（座位位置見 v3.3.1），睡在真座位心情回復 ×2.5（`BALANCE.sleepMood`，睡覺的基準回復每小時 +1.7（v3.4.2 與下降速度同比例調降），只在線上即時結算）；走去座位先走到建築前方的走道（lane），再到座位旁（near）；使用中的寵物位置固定、避讓機制不推牠們（別的寵物離牠們更遠一點）；兩隻都在走去建築座位的寵物之間不互相推開（座位旁靠得近，互推會卡住）。
- 測試模式面板有「加金幣」按鈕；時間快轉（+1 小時、+1 天）要連同 `earning`、`bowl` 的時間一起往前推（`dev/DevPanel.tsx` 的 `shiftTime`）。

## 存檔匯出／匯入與備份提醒（v3.3.0）

- Logo 選單（`components/LogoMenu.tsx`）：關於這個桌面、匯出存檔…、匯入存檔…、持久儲存狀態。啟動時呼叫 `navigator.storage.persist()`（失敗不顯示錯誤），結果在 Logo 選單與「關於這個桌面」顯示。
- 匯出檔格式（`lib/backup.ts`）：`{ format: "aemc-desktop-backup", formatVersion: 3（v3.6.0 起；匯入接受 2 與 3，2 缺的欄位補預設值）, exportedAt, appVersion, data: { farm, appList } }`，檔名 `aemc-desktop-backup-YYYYMMDD-HHmm.json`（本地時間）。**讀取一律走 `SaveStorage`／`DocumentStorage`（`getSaveStorage()`、`getAppListStorage()`），不要在別處直接讀 localStorage**，之後換雲端時才能整體替換。`DocumentStorage` 因此多了 `saveStrict`（失敗丟例外）、`snapshot`、`restore`，換雲端時整組一起實作。
- 匯入檢查順序：大小（5 MB）→ JSON → format → formatVersion／schema 不高於目前（較新的拒絕，訊息「這個存檔來自較新版本，請重新整理網頁更新後再試」；formatVersion 1 或養殖場 schema 4 以下一律拒絕，訊息「這個備份來自重置前的版本，無法匯入」）→ `parseSave()` 驗證 → 啟動台清單 `parseAppList`。`parseBackup` 不寫入；按「匯入」才 `applyBackup`：先 snapshot 兩份資料、依序 saveStrict，任何一份失敗就全部還原（整批成功或整批不寫）。成功後 `suspendSaves()`（否則離開頁面時自動存檔會把記憶體裡的舊存檔寫回去）再重新整理。不做防竄改。
- 匯入舊備份時：離線補算照舊（`lastSeen` 是備份當時，所以重新整理時一次補算到現在，數值最低掉到 `offlineFloor` 20，原本就更低的維持）；每日 +5 依 `lastDailyClaim`（備份的日期早於今天就領一次，只領一次不會補領每一天）；程式與遊戲的今日進度、食盆份量、禮物次數依日期歸零重算；各程式的冷卻以備份當時的時間計。
- 備份提醒（`components/BackupReminder.tsx`、`lib/backupReminder.ts`）：從未匯出且有寵物領養滿 3 天，或距上次匯出超過 14 天，顯示不擋操作的小提示（匯出／不再提醒），每天最多一次。上次匯出時間、「不再提醒」、上次提醒日期存在獨立的設定鍵 `aemc-desktop:settings`（`lib/settings.ts`），**不寫進養殖場存檔，也不放進匯出檔**。
- 狗窩／貓跳台座位（2 個）坐滿時，多出來的寵物睡覺、躲雨改站在建築「前方」的前方位置（腳底比建築低 28、離洗澡通道遠，`seatsOf` 的 index ≥ capacity），不會被屋頂遮住；真座位空出來就換過去。這些位置沒有睡覺心情加成。

## 建築尺寸、位置與睡覺座位（v3.3.1）

- **尺寸**：狗窩 99×83、貓跳台 72×90、食盆水盆 57×26（`layout.ts` 的 `KENNEL_W/H`、`CAT_TREE_W/H`、`BOWLS_W/H` 必須和 manifest 一致，測試會比對；`KENNEL_AX = 50`、`LAMP_AX = 26` 也要和素材一致）。食盆水盆縮到 0.7 倍後食物與水的細節仍看得清楚；0.75 倍是候選（`BOWL_SCALE=0.75 node scripts/process-assets.mjs …` 可重產比較）。
- **位置**（`layout.ts`，與視窗大小無關的部分）：狗窩 = 路燈 + `KENNEL_DX_FROM_LAMP`(55)，路燈與狗窩的不透明像素左右相接（逐列量過，最窄處縫 1 像素、不重疊；狗窩在路燈後面，路燈腳底較低、畫在前）；食盆水盆 = 狗窩 + `BOWLS_DX_FROM_KENNEL`(79)，同樣和狗窩的不透明像素相接。改素材尺寸或內容後要重算這兩個常數（測試用圖集像素重新量一次）。狗窩的佔地左緣在 `petMinX()`（= `lampX()+42`，寵物活動範圍左緣）之外，所以窩前的座位旁只能站在 `petMinX()` 右邊；燈與窩之間、路燈本身都在可走範圍之外。貓跳台預設在鐘樓中心右 6 像素（`CAT_TREE_DX_FROM_TOWER`），右緣離畫面右緣 `CAT_TREE_RIGHT_MARGIN`=28 以上；放不下（頂端含睡在頂層的貓碰到塔門或招牌）時往左挪，見 v3.4.2。
- **座位模型**（`pixel/buildingUse.ts` 的 `seatsOf()`，`Seat` 有 `kind: 'ground' | 'inside' | 'platform'` 與 `near`）：寵物走到 `near`（座位旁邊的地面，一定在可走範圍內），之後**直接出現**在座位上（沒有跳上去、走進去的過場）。`BuildingUse.near` 記下座位旁位置，座位被放掉（叫醒、建築被隱藏）時寵物回到那裡；拖曳開始時 `releaseUse(a, false)`、從畫面上的位置開始拖。
  - 狗窩（睡覺、躲雨）：座位 0 = **窩裡**（`inside`：畫在狗窩素材之後，用 `KENNEL_DOOR_CLIP`（門洞的階梯形矩形，素材座標）裁切，吻部對齊門洞右緣 `KENNEL_INSIDE_RIGHT`、底邊貼墊子前緣 `KENNEL_INSIDE_BOTTOM`，只露出頭，ZZZ 畫在門洞拱頂上方；身體被門框擋住；躲雨時醒著也用睡姿幀 `*_sleep`、沒有 ZZZ，因為站姿與坐姿比門洞高）、座位 1 = **窩門口**（地面座位，面向左、頭朝窩，身體中心離門洞中心約半個身體 `KENNEL_FRONT_DX`，躲雨時坐著）。
  - 貓跳台（睡覺）：座位 0 = **頂層圓平台**（`CAT_TREE_TOP_SEAT`，素材座標）、座位 1 = **中層平台**（`CAT_TREE_MID_SEAT`），用現有睡姿、腳底貼平台表面；ZZZ 畫在平台外側（左邊、貓頭高度），不往上伸。貓跳台躲雨沒有爬台素材，醒著的貓用建築前方的地面座位（左右各一）。
  - 座位坐滿多出來的寵物：沿用 v3.3.0 的前方位置（index ≥ capacity，腳底比建築低 `OVERFLOW_DY`=28，沒有心情加成）。窩裡、門口、兩層平台都算真座位（睡覺心情 ×2.5）。躲雨躲到睡覺時間：放掉躲雨座位、重新分配成睡覺座位。
  - 引擎（`engine.ts` 的 `seatView()`）：窩裡與平台上的寵物用 `sortY = slot.y + 0.5` 排前後（在建築之後、建築前方的寵物之前）；點擊判定只算露出來的部分（窩裡的狗 = 門洞內）；氣泡選單錨點在露出來的頭上方。座位資訊不進存檔。

## v3.4.0：營火（v3.5.1 移除）＋一次性強制重置（花圃與遊樂設施取消）

- **強制重置**：存檔 schema 5。載入時（`SaveStorage.loadOrReset`，`save/storage.ts`）若養殖場存檔是 schema 1～4：先把原始內容**原封不動**複製到 `aemc-desktop:farm-pre-v5-backup`（只寫一次，已存在不覆蓋；寫入失敗不阻擋；不讀取、不顯示、不進匯出檔），再寫入全新存檔（0 隻寵物、50 金幣、無建築、賺金幣與每日領取歸零、`resetNotice: true`）。**寫入新存檔失敗時不改動舊存檔**（`resetFailed`，畫面顯示說明、不能領養，下次載入重試）。不動 `aemc-desktop:app-list` 與 `aemc-desktop:settings`。沒有存檔（全新玩家）、無法解析的存檔都不重置、沒有提示。沒有選單的重置按鈕。`farmStore.init` 同一時間只跑一次（StrictMode 會呼叫兩次）。
- **一次性提示**（`ui/ResetNotice.tsx`）：「養殖場已重新開始，所有寵物與金幣已重置，請重新領養。」旗標 `resetNotice` 存在新存檔裡，按「確定」清掉並存檔，之後不再出現。沒有寵物（全新玩家或重置後）走第一次領養流程：第一隻免費（`adoptPet` 的 `isFirst` = 沒有存檔或 0 隻寵物），提示顯示期間先不顯示領養視窗。
- 匯出檔 `formatVersion` 升到 2；匯入 schema 4 以下（或 formatVersion 1）的備份一律拒絕。
- **花圃（蝴蝶）與遊樂設施（蹺蹺板）取消**（從來沒有發布過）：不留任何程式、數值、素材（管線不輸出 `flowerbed`、`seesaw`、`butterfly_*`，`dist` 與圖集都沒有，測試會檢查）。建築 id 只剩 `kennel`、`bowls`、`catTree`、`campfire`（可購買）與 `picnicMat`、`sandbox`（留給之後的版本，不顯示、不開放）。
- **位置**（`layout.ts`）：路燈、住家位置不動。狗窩 = 路燈 + `KENNEL_DX_FROM_LAMP`(55)，食盆水盆 = 狗窩 + `BOWLS_DX_FROM_KENNEL`(79)：兩組間隙都是用素材**不透明像素逐列量過**（路燈與狗窩、狗窩與食盆水盆最窄處縫 1 像素、不重疊；測試用圖集像素重新量一次，要求 0～2）；改素材尺寸或內容後要重算這兩個常數。貓跳台預設 = 鐘樓中心 + `CAT_TREE_DX_FROM_TOWER`(6)（右緣離畫面右緣約 30；放不下時往左挪，見 v3.4.2）。外框不可蓋住水池、洗澡通道、住家、路燈、塔門與彼此。放不下就隱藏（不為了擠進去而改別的物件位置）：v3.5.1 起 17 種常見視窗（含 1024×768）三個建築都放得下。
- **寵物走動區**：整條走道（沙地路面）除了建築腳下的障礙（狗窩、食盆水盆、貓跳台、路燈、住家）之外都能走；測試把活動範圍切成 4 像素格，要求所有「清楚」的格子是同一個連通區塊（沒有死角），且從各起點走得到所有使用位置（食盆、狗窩座位旁、貓跳台座位旁、洗澡站位）。

## 洗澡站位（v3.4.1）

- 洗澡的站位 `pondStand(L)`（走去洗澡的終點、洗完爬出來的落點）三種入口共用：緊貼水池右緣（`POND_STAND_DX` = 28），高度在水面中心偏下；洗澡通道 `pondStrip(L)` 從水池右緣 +8 一路接到主要活動範圍，下緣在住家屋頂頂端之上 4（站位的寵物整個身體在屋頂之上），和有沒有買建築無關，不再有「買了狗窩就移到狗窩上方」之類的特例。改水池、住家或建築位置後，測試會檢查：站位離水池近、不被任何建築外框蓋住、不與座位重疊、走得到。

## v3.4.2：貓跳台往左挪、數值變慢、食盆份量隨寵物數

- **貓跳台放不下時往左挪，不再隱藏**：`computeSlots` 對貓跳台在「預設位置（鐘樓中心 +6）往左 `CAT_TREE_MAX_SHIFT`(120)」的範圍內逐像素找位置，挑離預設最近、而且 `catTreeHitsTower()` 不碰的。判斷用逐列不透明像素輪廓 `CAT_TREE_ENVELOPE`（貓跳台＋6 種貓睡在頂層平台的睡姿圖〔面向左、座位在 `CAT_TREE_TOP_SEAT`〕的聯集，相對貓跳台水平中心，第 0 列 = 素材頂端往上 `CAT_TREE_ENVELOPE_ROW0`(−12) 列），和塔門（外擴 1 像素）與招牌（`towerSignRect`）比。頂端（含頂層貓高出的 `CAT_TREE_HEADROOM`=12）整個在塔門下緣之下就直接放預設位置，所以 H≥314 的大視窗外觀與 v3.4.1 完全一樣。**改貓跳台素材、貓的睡姿圖或 `CAT_TREE_TOP_SEAT` 後要重算 `CAT_TREE_ENVELOPE`**（測試用圖集像素逐列比對）。不縮放素材、不移塔、不改 `CAT_TREE_HEADROOM`。
- **提示文字**：放不下的建築（v3.5.1 起常見視窗都放得下，邏輯保留）建築模式顯示 `slotUnavailableMessage(L, id)`：同高度、同縮放倍率，由目前寬度往上找第一個放得下的視窗寬度（CSS px，進位到 10）。`BuildingAvailability.message` 是讀取時才算的 getter（要掃描視窗大小）。
- **數值**（`balance.ts`）：`decayPerHour` 改 satiety 1.7、mood 1.3、cleanliness 1.1（原 4／3／2.5）；`sleepMood.base` 改 1.7（原 4），`buildingMul` 2.5 不動。
- **食盆份量** = 寵物數 × `portionsPerPet`(2)：`sim/buildings.ts` 的 `bowlCapacity(save)`；`bowlLeft` = 上限 − 今天已用（`bowl.used`）。跨日補滿用當時的寵物數；當天領養新寵物，上限立刻多 2（`used` 不變）。存檔格式 `{ date, used }` 不變、不升 schema。
- 洗澡通道 `pondStrip` 在邏輯高度 H<287 時不存在（例如 1920×930 搭配 dpr 1.25），洗澡相關程式本版沒有動，見 CHANGELOG 的已知問題。

## v3.5.0：玩耍框架與狗的丟球

- **框架**：`sim/commands.ts` 的 `PLAY_TOYS[物種]` 決定誰有「玩耍」與玩具清單（v3.6.0 起：狗 丟球、挖寶，貓 尋寶（見下方 v3.6.0 一節））。`ActionId` 多了 `'play'`（`execute` 不處理它）；扣金幣走 `startPlay`（`farmStore.startPlay`，選了玩具才扣 `BALANCE.play.cost`），結算走 `settlePlay`（`farmStore.settlePlay`，0 次完全不動）。`petActions` 的 `ctx.playBlock`（引擎算的「別隻在玩、洗澡中、被拖曳中」）決定停用原因；「玩耍」被停用時按鈕仍可點、點了 toast 顯示原因（`PetMenu`，只有這個按鈕這樣，其他維持原生 disabled）。數值全部在 `BALANCE.play`（含各階段時間、追球速度倍率、卡住保險秒數）；改數值要同步 CHANGELOG 與邏輯測試。
- **狀態機**在 `pixel/play.ts`，狀態是 `Actor.play`（單一欄位，和 `a.bath` 同一種做法）：`ready → flight → chase → grab → return → drop → ready`，`cheer` 是結算演出；所有階段轉換、提前結算（`endPlay(reason)`）都在這個檔案，不要在別處加玩耍的旗標。`updateActor` 在 `bath` 之後、`updateBuildingUse` 之前呼叫 `updatePlay`，所以玩耍中不去食盆、狗窩、不躲雨（`beginPlay` 會 `releaseUse`、清 `rainIn`）。多幀動作沒完成就維持階段（用 `p.t` 累計）；路徑只在目標改變時算（`moveToward`）；追球與叼回超過 `stuckSeconds` 還沒到就傳送到目標（保險）。不旋轉、不縮放；球的軌跡是位移（ease-out＋落地彈跳）。
- **結束原因**（`PlayEnd`）：`time`、`user`（Esc／右鍵）演 `cheer`（結算在進入 cheer 時、只做一次）；`drag`、`window`、`sleep`、`resize` 直接結算、不演。時間到時已叼起的那一次最多再給 `graceSeconds` 秒。睡覺時間：`isSleepTime(hour)` 且不是夜間才被叫醒開始玩的（`nightStart`），或狗變成 `isSleeping`。Farm 層在開遊戲視窗、啟動台、領養、建築模式、關於、匯入對話框、視窗最大化時呼叫 `engine.endPlay('window')`；`setSize` 在版面真的變了才 `endPlay('resize')`；`beginDrag` 對玩耍中的狗先 `endPlay('drag')`。Esc／右鍵只在 `engine.isPlaying()` 時處理（右鍵 `preventDefault` 也是）。
- **落點**（`checkThrow`）：`petBounds` 內（不含洗澡通道，所以洗澡通道不存在的低視窗不影響）、`isClear`（離障礙 ≥ 3）、`isWalkable`、離狗 ≥ `minThrow`、不壓在睡著或座位上的寵物；只有 `ready` 且時間沒到才接受丟球。點擊座標一律 `fromCss`。玩耍中點到其他寵物與禮物照常；點到玩耍中的狗：不開選單、不丟球，按住 150 ms 或移動 4 px 仍是拖曳（提前結算）。
- **素材**：場景裡的球是 `toy_ball_s`（11×12）：處理管線對同一張 `toys_dog.png` 的球再取樣一次（`BALL_S_H` 預設 12，環境變數可覆寫來比較；柯基站姿高 31、黃金 46，13 以上在柯基嘴邊偏大、11 的細節變少），其他玩具與 `toy_ball` 不動。叼球位置 `MOUTH`（`play.ts`，品種 assetKey → 幀名 → 相對腳底錨點的球心，面向右）逐品種逐幀量過，往左走時 x 反號；改狗素材要重量（測試檢查 6 品種 × `stand`／`walk_a`／`walk_b` 都有）。狗的 `jump` 已畫入飛盤、`tug` 已畫入繩子、`dig` 已畫入土堆，這些姿勢不可再疊同一個道具；`happy`＋`hop` 位移是「開心跳一下」，新增的 `bark` 動作用現有的 `bark` 幀（貓對應 `sit_a`）。
- **游標與 HUD**：`ui/ballCursor.ts` 用 `toy_ball_s` 畫成 CSS 游標（整數倍，每個邏輯像素至少 3 個 CSS 像素，熱點在球心，失敗退回 crosshair），只套在畫布上；`index.tsx` 的主迴圈依 `engine.playHud()` 同步游標與 HUD（選單列下方正中央，`pointer-events: none`，固定底色邊框）。
- **已知行為**：玩耍進度不存檔（關掉網頁已扣的金幣不退）；分頁在背景時計時暫停（用 dt 累加）。

## v3.5.1：移除營火、洗澡備援站位

- **營火完整移除**：程式、數值、素材（管線不輸出 `campfire_a/b/off`，scene 圖集與 manifest 檔名改變，其他 231 張像素逐張比對相同）、`moodGain`／`takeMoodGains`／`applyMoodGains`（營火是唯一使用者）都拿掉。`BuildingId`、`ALL_BUILDING_IDS`、`PURCHASABLE` 不再有 `campfire`；狗窩、食盆水盆、貓跳台的排位在營火之前，位置與以前相同。`drawGlow` 路燈還在用。
- **舊存檔含營火**（`save/migrate.ts`）：`parseSave` 看原始資料的 `ownedBuildings` 有已移除的建築（`REMOVED_BUILDING_REFUNDS`，營火 20）→ 過濾掉並讓 `points` 加上退款，其餘欄位原樣；沒有的存檔輸出與以前相同。`LocalStorageAdapter.loadOrReset` 偵測到退款就立刻 `saveStrict` 寫回（「只退一次」的依據就是原始資料裡還有它，不新增存檔欄位，schema 維持 5），`LoadResult.refund` → `farmStore.legacyRefund`（只在記憶體）→ `ui/LegacyRefundNotice.tsx` 對話框「營火已移除，已退還 20 金幣」（有每日登入獎勵 toast 時排在它之後）。寫入失敗時下次載入從同一份原始資料重算，仍是 +20 不是 +40。匯入備份走 `parseBackup` → `parseSave`，匯入確認視窗多一行 `summary.refund` 提示；匯入是整份取代，不會重複加。
- **洗澡備援站位**（`layout.ts` 的 `pondStand`）：洗澡通道不存在（H < 287，`pondStrip` 為 null）時，原站位落在不可走的區域，寵物走不到。現在用 `petBounds.x0 + 4`、高度在水面中心偏下夾進可走範圍的備援點（極端小視窗不可走時用 `nearestWalkable`），走路終點與洗完爬出的落點是同一個點；H ≥ 287 的站位完全沒變。
- **走去洗澡的放棄條件**（`pets.ts` 的 `BATH_WALK`）：總共最多 45 秒；12 秒內離站位沒有再靠近 4 像素就放棄；離站位 6 像素內算到了。原本 20 秒硬上限會讓慢的貓（速度 24）從畫面遠側出發時在通道入口被取消。`BATH_TIMES`、洗澡費用（每次 1 金幣，走到水池才扣）、拖曳到水池都沒動。

## 其他約定

- 「關於這個桌面」顯示的版本號必須從 `package.json` 讀取，不可寫死。
- 小遊戲不使用外部圖片素材，一律以程式繪製；每個遊戲放在 `src/games/<遊戲名稱>/`。
- 最高分等 localStorage 讀寫一律包在 try/catch 中。

## v3.6.0：挖寶、尋寶、收藏冊、金色外觀

- **玩耍框架的兩個新玩具**：狗 `dig`（挖寶）、貓 `hunt`（尋寶），都是 30 秒、1 金幣（選了玩具就扣，和丟球一樣），數值全在 `BALANCE.dig`。狀態機的玩耍共用部分（計時、cheer、提前結算）仍在 `pixel/play.ts`，一次挖／尋的各階段在 `pixel/finder.ts`：`search → go → work →（狗：mark；貓：pounce → back → put → mark）→ search`。**每一次完成才留下寶物**（`env.addFind`，立刻進存檔），被提前結算打斷時進行到一半的那一次作廢、已留下的保留；寶物滿了（`env.findCap`）或挑不到位置就結束。貓不離開畫面（引擎沒有出畫面的機制），速度 `cat.speedMul` 2.5 倍、離原位 ≤ `cat.maxRange`；貓沒有嗅聞幀，用 `crouch → pounce`；叼的布包是程式畫的通用外觀（`engine.drawBundle`），狗的土堆是圖集 `toys` 的 `toy_dirt_mound_s`。名稱一律叫「寶物」，不要叫「禮物」（`gifts`、`collectGift` 是寵物送金幣）。
- **寶物與揭曉**（`sim/dig.ts`，純函式）：存檔 `finds`（土堆、布包；座標是草地範圍內的相對位置 0～1，`pixel/finds.ts` 換算，並推到最近的放得下的位置）。**擺放規則**（`finds.ts`）：寶物外框（`BALANCE.dig.box`）離所有障礙物外框（建築素材外框、住家、鐘樓含底部花叢、路燈、水池與洗澡通道、樹根、裝飾物）與別的寶物至少 `BALANCE.dig.clearance`(8) 像素，上緣不碰草地上緣；用素材外框比腳下佔地大是故意的。改素材大小、加障礙物時要檢查這份規則（有測試掃 17 視窗）。**抽選在揭曉當下**才做（`revealFind`）：先擲結果（銅板 12%、銀幣 5%、金幣 1%、收藏品 34%、空 48%；v3.6.1 起，原本 18／5／1／48／28），收藏品再擲稀有度；70% 只從未收集的項目挑，套組分片也 70% 偏向缺的。金幣每日上限 10（`earning.digCoins`，**用揭曉當下的本機日期**，貓狗共用，只剩一點時只給剩下的）。10 分鐘沒點自動揭曉（`revealDue`：載入時與每 10 秒的 `tick`）；上限 8 個，低視窗 = min(8, 可放面積 ÷ `areaPerFind`(1200))（`findCap`，可放面積 = 土堆外框離障礙物都夠遠的格點面積；`areaPerFind` 是用「隨機亂放 150 次、最差一次塞得下的個數」校準的，上限不超過它，所以達到上限前一定找得到位置；完全放不下 = 0，提示「視窗太小」），滿了「挖寶」「尋寶」不能開始、不扣金幣、提示「先點開土堆」。
- **收藏冊**（`components/CollectionDialog.tsx`，選單列右上角「收藏冊」按鈕（v3.6.1 起，原本在 Logo 選單））：物品表在 `config/items.ts`（28 項，套組 U002 機密碎片、U009 合約碎片各 6 片，存檔 `collection` 的鍵是「編號」或「編號-片號」）。未收集用原圖輪廓填暗色（`PixelSprite silhouette`），名稱「？？？」；套組顯示完整紙張剪影＋片數，集齊顯示完整圖；傳說旁的獎勵剪影是預先烘進 `items` 圖集的 `sil_house_gold`、`sil_tower_gold`。**收藏冊與提示文字不得出現罰款、違約等字樣**（有測試掃原始碼與畫面）。
- **一次性事件**（`config/events.ts`、`sim/dig.ts` 的 `checkEvents`）：存檔 `events`（事件 id → 觸發時間）有旗標就不再觸發。集齊洩密碎片（狗）／合約碎片（貓）→ 罰款 10 金幣、不扣到負數；L001＋L002（狗）／L003＋L004（貓）→ +100 金幣與外觀。對話框 `ui/EventDialog.tsx`（`farmStore.pendingEvents`，只在記憶體），一次一個、按確定才換下一個。
- **外觀**（`config/skins.ts`、存檔 `skins: { owned, equipped }`）：金色屋頂（`house.gold`）、黃金鐘樓（`tower.gold`）。圖集 `skins` **不在啟動時載入**（`assets.LAZY_ATLASES`），穿上外觀時 `assets.loadGroup('skins')` 動態載入，載入前引擎退回預設圖、載入後立刻換。未來的外觀商店只要往 `owned` 加 id、改 `equipped`。鐘面位置用素材的 `meta.clock`（管線偵測），金色鐘樓與原版差 ≤ 1 像素。
- **存檔相容**（schema 維持 5）：新欄位 `collection`、`finds`、`events`、`skins`、`dataRev`、`earning.digCoins` 全部在 `parseSave` 補預設值（舊存檔不重置、其餘欄位逐欄相同）；`dataRev`（`DATA_REV = 1`）用來擋「更新版本的資料被舊版覆寫」：`loadOrReset` 發現 schemaVersion 或 dataRev 比程式新就不讀（`LoadResult.newer`）、`LocalStorageAdapter.save` 寫入前發現儲存的資料更新就不覆寫，畫面顯示 `NewerDataNotice`。**v3.5.1 以前的分頁／舊快取無法被這個機制保護**（舊程式會丟掉不認得的欄位）。匯出檔 `formatVersion` 3，匯入接受 2 與 3。
- **Toast 佇列**（`store/uiStore.ts`）：優先序 有新版本 > 事件 > 揭曉 > 每日獎勵 > 一般；高的立刻蓋過目前的、被蓋過的重要提示排回佇列，一般提示被蓋過就丟掉、排隊超過 3 秒不再顯示。`showToast(message, ms?, level?)`，level 預設一般。
- **素材管線**新增（`scripts/process-assets.mjs`）：`sheet({ fitMax })`（整張共用 p、最大那張長邊 = fitMax）、`defringePink`（去粉紅光暈與膠帶殘邊）、圖集 `items`（收藏品圖示 48×48、錢幣、完整紙張、獎勵剪影，必載）與 `skins`（金色住家、黃金鐘樓）；`ITEM_BOX` 環境變數決定圖示邊長（預設 48）。改圖示大小要重跑管線並重新比對舊素材逐像素相同。
- **測試**：邏輯與引擎測試是 repo 外的 Node 腳本（用 vite 打包 TS 後執行），瀏覽器測試用 Playwright（`page.clock` 與開發版的 `__farm`、`__farmStore`、`__ui`，正式版沒有這些全域物件）。

## v3.7.0：工具包（計算機、碼表與倒數、公佈欄）

- **設定集中在 `src/config/tools.ts`**（`TOOLS`：歷史 50、計次 50、便利貼 8 張／標題 20／內容 200、顯示 15 位有效數字、點擊區至少 24 CSS 像素、各種提示文字；`NOTE_COLORS`／`NOTE_CSS`；`TOOL_LIST`）。數字與訊息不要寫死在別處。
- **入口**：選單列「工具」（`components/tools/ToolsMenu.tsx`，排在收藏冊之後）；場景上三個 DOM 按鈕疊在畫布上（`farm/index.tsx` 的 `TOOL_SPOTS`，主迴圈每幀用 `engine.toolHits()` 定位）：時鐘上面的窗戶 → 計算機、鐘面 → 碼表與倒數、公佈欄 → 公佈欄。點擊區由 `layout.ts` 的 `toolHitRects()` 算（純函式）：窗戶 `TOWER_WINDOW`（鐘樓素材像素座標，四種鐘樓圖都量過）、鐘面用素材 `meta.clock` + `TOWER_CLOCK_FRAME`、塔門沿用 `TOWER_DOOR`；不足 24 CSS 像素只放大點擊區，放大後碰到下方區域就往上移。三區不可重疊（測試掃 17 視窗 × 4 種鐘樓圖）。`uiStore.toolOpen` 一次只開一個工具，開啟時離開建築模式、結束玩耍、關掉氣泡選單。
- **工具視窗外框** `components/tools/ToolDialog.tsx`：收藏冊樣式，Esc／右上角「關閉」／點遮罩關閉；在 window 捕捉階段攔下所有 keydown 並停止傳遞（F4、建築模式、玩耍、小遊戲都收不到），keyup 不攔。新增工具視窗一律用它。
- **計算機**：解析器 `src/tools/calc.ts`（純函式，**禁止 eval／new Function／數學套件**，測試會掃原始碼）。一元負號比冪次低（-3^2 = -9）、冪次右結合、函數後面一定要接括號（√ 例外）、省略乘號（2π、2(3)）。錯誤一律回傳中文訊息（`CALC_ERRORS`），不可出現 NaN／Infinity。狀態在元件裡，關閉就清空。
- **碼表與倒數**：邏輯 `src/tools/timer.ts`（純函式，時間由呼叫端傳入），狀態 `src/tools/timerStore.ts`（只在記憶體，關視窗後繼續跑、重新整理清掉）；一律用時間戳記差值，不用 setInterval 累加。倒數完成用 `setTimeout` 到結束時間＋`visibilitychange` 檢查，toast「倒數完成」（level `event`），**不給金幣**。時間來源是真實時間（`setTimerClock` 可換），不用 `gameNow()`。
- **公佈欄**：素材在圖集 `tools` 的 `board`（64×50，`layout.ts` 的 `BOARD_W/H`、`BOARD_GREEN` 要和 manifest 一致）；位置 `boardPos()` = 右緣對齊水池右緣（x 48～112）、腳底在草地上緣（`farBottom`），和視窗寬度、建築購買無關；**x 0～48 的空位留給之後的農場告示牌，不要放東西**。標題縮圖 `farm/ui/BoardThumbs.tsx`（最多 3 張、依大小減少、多的「…共 N 張」）。資料：養殖場存檔的可缺少欄位 `notes`（`tools/notes.ts`：`cleanNotes` 驗證、壞的單張捨棄、最多 8 張新的在前；字數一律 `Array.from`）；操作走 `farmStore.addNote/updateNote/deleteNote`（沒有存檔時不能用）。**顯示一律用 React 文字節點，禁止 innerHTML**（測試會掃）。
- **存檔與備份**：`DATA_REV` 1 → 2（v3.6.x 舊分頁會停止存檔、不洗掉 notes）；`schemaVersion` 仍 5。匯出檔 `formatVersion` 4（`NOTES_FORMAT_VERSION`），匯入接受 2～4，2、3 的 notes 一律視為空；確認視窗有「公佈欄 N 張」（`summary.noteCount`／`hasNotes`）。
- **素材**：`process-assets.mjs` 第 8 段，`tools_icons.png`（3×1：計算機、碼表、公佈欄 → `tool_calc`／`tool_timer`／`tool_board`，48×48）、`sticky_notes.png`（2×2：黃、粉紅／藍、綠 → `note_*`，32×32，只用在顏色鈕）、`items_dig_b.png` 第 5 格 → `board`（第 6 格農場告示牌這版不用）。介面上便利貼的顏色用 CSS（`NOTE_CSS`，取樣自便條紙）。選單與視窗標題的 48×48 圖示用 `PixelSprite scale={0.5}`（裝置像素 1:1）。

## v3.7.1：找新主人、食盆與天氣、睡覺心情

- **找新主人**（`sim/rehome.ts` 純函式 `rehomePet`／`rehomeBlock`、文字 `REHOME_TEXT`、數值 `BALANCE.rehome`：返還 10、`minPets` 1）：只動 `pets` 與 `points`，其他欄位（`finds`、`collection`、`events`、`notes`、`ownedBuildings`、`bowl`、`earning`、`nextPetId`）一律不動；**最後一隻不能找新主人**（沒有寵物會讓公佈欄等功能當成沒有存檔，而且會重新觸發「第一隻免費」→ 領養再找新主人變成賺錢）。領養 15、返還 10 → 每輪淨 −5，不要讓返還 ≥ 領養價。
- **順序**（`farm/index.tsx` 的 `confirmRehome`）：先 `rehomeBlock` 檢查 → `engine.removePet(id)`（玩耍用 `endPlay(a, 'rehome')` 提前結算、清洗澡／拖曳／座位、取消選取；座位、食盆位置、水池占用都是由場景上的寵物算出來的，刪掉 actor 就空出來）→ `farmStore.rehomePet(id)`（拿掉頭上禮物與還沒消化的效果，`flushSave` 立刻寫入）。玩耍結算要在寵物還在存檔裡時做，所以引擎一定要先。寶物 `Find` 只記物種（`by`），沒有寵物 id，移除寵物後照常揭曉。
- **介面**：`PetMenu` 最下面虛線分隔的「找新主人」（`data-testid="action-rehome"`；停用時下方顯示原因 `rehome-why`）→ `ui/RehomeDialog.tsx` 二次確認（`fixed z-[9900]` 蓋在所有視窗之上；捕捉階段攔 keydown、Esc＝取消、預設焦點在取消）。選取的寵物換了或選單被關掉，確認框一起關掉、不執行。
- **數值**（`balance.ts`）：`weatherWeights` 54／30／15／1；`buildings.bowls` 門檻 60、每盆 +20、`portionsPerPet` 3（份量仍是全部寵物共用一池）；`sleepMood.groundMul` 1.9（不在真座位上睡覺的回復 = base × groundMul，座位仍是 base × buildingMul，兩者與白天衰減都不要順手改）。模擬數字見 CHANGELOG 3.7.1。

## v3.6.1：數值調整、挖寶機率、選單列、身高體重

- **數值**（`balance.ts`）：`decayPerHour` 3／2／2（原 1.7／1.3／1.1）；`buildings.bowls.threshold` 40（原 60）；`sleepMood.base` 2.7（原 1.7）。其餘（每份 +15、每天每隻 2 份、洗澡 +40、玩耍結算、離線下限 20、`lowThreshold` 30）都沒動。**食盆份量追不上每小時 −3**（見 CHANGELOG 3.6.1「已知行為」與模擬數字）：完全不互動 72 小時飽食度平均約 26；要改份量是使用者的決定，不要自己改。
- **挖寶、尋寶機率**（`BALANCE.dig`）：`coin` 銅 0.12、銀 0.05、金 0.01；`rarity` 是 0.34／0.1／0.035／0.005 各乘 34/48（收藏品共 34%），空 = 剩下的 48%。其餘規則不動。
- **選單列**（`components/MenuBar.tsx`）：「＋領養」「建築」「收藏冊」排在一起，之後是寵物數量、金幣、時間；右側容器 `whitespace-nowrap`，最窄 1024 也不換行。`收藏冊` 按鈕不依賴存檔。
- **寵物身高體重**（只改顯示）：`species.ts` 的 `baseCm`（成年肩高）、`baseKg`（標準體重）由品種決定；`stats.ts` 的 `heightCm(baseCm, stage)`、`weightKg(baseKg, 遊戲體重值, stage)`：幼年身高 ×0.6、體重 ×0.3，公斤 = baseKg ×（0.7 + 0.006 × 體重值，範圍 0～100）。個體的 `heightFactor`、`weight` 存檔欄位與「標準／偏瘦／偏胖」判斷都不動；只有 `PetMenu` 資訊卡顯示（領養視窗沒有顯示身高體重）。

## v3.8.0：個性與野餐拍照

- **個性**（`config/personality.ts`：5 種 id、名稱、圖示、`personalityFromId`（FNV-1a，舊寵物固定個性，**不可改雜湊**，否則舊存檔換個性）、`rollPersonality`、`personalityMul`；倍率表 `BALANCE.personality`，1 = 沒影響）。套用點：`stats.advancePet`（貪吃飽食、懶散心情、黏人 `lonelyHours` 超過 `lonelyAfterHours` 的那段，需傳 `fromMs`）、`commands.execute`（餵食 eatMood、撫摸 petMood）、`wakeForDrag`（dragMood）、`digDelta`（挖寶／尋寶 digMood，丟球不算）、`buildingUse` 躲雨等待（shelterDelay）、`pets.ts` 閒晃起身（wander）。倍率全是 1 時算式與 v3.7.1 逐位元相同（`NEUTRAL_MUL` 走原本的算式），改這些地方要保住這點（測試用 v3.7.1 原始碼比對）。
- 存檔：寵物 `personality`、`lastInteract`（互動 = 選單操作、開始玩耍、參加野餐）；舊存檔由 `parseSave` 補（個性用 id、lastInteract = 存檔 lastSeen），`loadOrReset` 發現原始資料缺個性就 `saveStrict` 寫回（`needsPersonalityFill`）。`DATA_REV` 3、匯出 `formatVersion` 5（匯入 2～5）。
- **野餐**：存檔層 `sim/picnic.ts`（`picnicBlock` 條件順序、`picnicToday`、`startPicnic` 開始時一次清潔 −8／心情 +5、`endPicnic`、`picnicEndDue`、`settlePicnicOnLoad` 載入時直接結束）；存檔 `picnic: { date, count, lastEnd, active? }`。白天 = `isPicnicDaytime`（非 night 且非睡覺時間 → 6:00～19:30），只有下雨擋（下雪可以）。場景層 `pixel/picnic.ts`（`picnicMatRect` 由版面算位置、不手調；`MAT_SEATS`／`MAT_BASKET`／`MAT_FOODS` 素材座標、測試用 manifest 的 `meta.mat` 檢查在墊面上；`cameraRect`、`photoCrop`、`updatePicnicSeat`）；`Actor.picnic`（和 bath、play 同樣是單一欄位），拖曳／洗澡／玩耍／散步／removePet 清掉。引擎 `syncPicnic(save.picnic.active)` 由主迴圈同步，墊子落地（`dropSeconds`）才分座位；結束判斷在主迴圈（時間、雨、夜、`picnicParticipants() === 0`、放不下墊子）與 `farmStore.tick`（備援）。墊子是地面層（畫在 drawPath 之後、所有物件之前），不是建築、不擋路；`buildings.ts` 的 `picnicMat` 空位仍是保留資料、沒用到。
- **拍照**（`ui/photo.ts`）：`engine.snapshot()` 以 1 邏輯像素 = 1 畫布像素重畫場景（不含 DOM、不畫選取標記），`cropSizeFor(window)` = 窗口 × FRAME_SCALE(6) ÷ PHOTO_SCALE(2) 往上取整，照片在下、相框在上；下載再 ×2。相框窗口是管線偵測的 `meta.window`，不手寫座標。拍立得 `ui/PolaroidDialog.tsx`（裝置像素整數倍顯示）。閃光是白色 DOM 疊層（以前沒有現成的閃光特效）。
- **素材**：`process-assets.mjs` 第 9 段；`picnic_mats.png` 用 `strictBg`（粉色墊的深粉紅滾邊會被 `isBg` 的玫瑰紅陰影規則吃掉），相框不做 `defringePink`。只處理 personality_icons、picnic_basket／mats／food／camera／pet_snacks、polaroid_frames_b；polaroid_frames_a/c、picnic_decor、stickers_* 不處理、不輸出（測試檢查 manifest 與 dist）。圖集 `polaroid` 在 `LAZY_ATLASES`。
- 選單列按鈕 `components/PicnicButton.tsx`（每秒更新；停用時看起來停用但可點、點了 toast 原因），透過 `uiStore.requestPicnic` 交給 `farm/index.tsx` 開始。

## v3.8.1：滑鼠互動與貓圖改清晰

- **滑鼠互動**（`pixel/hover.ts` 的 `HoverController`，純邏輯；數值全在 `BALANCE.hover`，單位 = 邏輯像素、秒）：1 停下來看你、2 黏人靠近（最多 2 隻同時）、3 膽小閃開、4 摸頭（愛心）、5 小名字標籤（畫在畫布上）、6 貓拍狗吠（貓 `swat`、狗 `bark`）。**全部只是畫面演出：不改飽食／心情／清潔、不改存檔、不呼叫任何 `hooks`**（測試用 v3.8.0 原始碼比對：沒有建築時存檔數值逐位元相同）。
- **入口**：`farm/index.tsx` 的 `onPointerMove` 只在 `pointerType === 'mouse'` 時呼叫 `engine.cursorMove`（只記下位置，O(1)）；`onPointerLeave`、視窗 blur、分頁隱藏、`mouseleave` 呼叫 `engine.cursorLeave`；`engine.hover.enabled` 由 `matchMedia('(hover: hover) and (pointer: fine)')` 決定（預設 false，Node 測試與觸控裝置不受影響）；`engine.hover.blocked` 由畫面層依「領養、啟動台、建築模式、關於、收藏冊、工具、匯入、找新主人、拍立得、視窗最大化」設定。反應全部在 `engine.update` 裡（`hover.update` 在 `updateActor` 之前）。
- **既有狀態永遠優先**：`HoverController.free(a)` = 沒在拖曳／飛回去／洗澡（含走去水池）／玩耍／野餐／使用建築／找睡覺位置／睡覺／選單開著／指令動作（`a.override`）、而且動作是 idle／walk／sit；不符合就解除（`releaseHover`）。`Actor.hv`（look／approach／retreat）在 `updateActor` 裡排在睡覺、建築、玩耍、野餐、指令動作、選單之後、一般閒晃 switch 之前（`updateHoverMotion`，走路用 `moveToward`，會繞障礙、被夾回活動範圍）；摸頭與貓拍狗吠用既有的 `a.override`（標記 `hpat`／`hswat`，`isHoverOverride`），所以睡覺、拖曳、選單、野餐開始都會清掉它。新增 hover 行為時要保住這個優先順序與「不碰存檔」。
- **名字標籤**：`engine.drawLabel`（畫在 render 最後、拍照 `view` 不畫）；圖示是 `PERSONALITY_ICONS`，名字用 9px 粗體；位置在頭上、放不下放腳下，左右上下夾進 `layout.W／H`。
- **測試用覆寫**：`overrides.hover`（6 項各一個 `off` 開關＋`swatChance`），預設全關／null；只有 `src/dev/DevPanel.tsx`（開發環境）與自動化測試寫入。正式 build 要檢查不含「測試模式」「生物圖鑑」`__farm`、`shiftTime`。
- **貓圖改 hd**（`process-assets.mjs`：`CAT_HD`、`CAT_HD_REVERT`、`despillMagenta`）：貓 core／extra 用 `cat_<花色>_core_hd.png`／`_extra_hd.png`（原圖保留）；`CAT_HD_REVERT` 列出比對後退回舊圖的幀（目前只有橘貓 swat，hd 的揮爪特效弧線被濾掉）；橘貓 core 第 6、7、8 格仍是 `cat_orange_core_fix.png`（求解用的「舊」尺寸一律從舊圖 core 取，所以三張與 v3.6.3 逐像素相同）。`CAT_HD=0` 回到舊圖（只供新舊比對）。hd 圖在毛色邊緣有零星鮮豔洋紅單點，`despillMagenta` 以鄰居平均色取代（報告逐張列出）。**換貓圖後要重跑管線、確認其他素材（狗、場景、野餐…）逐像素不變、每張洋紅殘留 0、橘貓 sleep／eat／groom 沒被蓋掉。**
- 已知行為：貓 `tangled` 幀沒有任何行為使用（和 v3.8.0 一樣）；`swat` 用貓 extra 的 swat 幀（橘貓是舊圖，所以揮爪特效只剩幾個殘點，其他花色的特效與 v3.8.0 相同）。

## v3.9.0：農場自由擺放與倉庫

- **場景固定 640×320**（`pixel/layout.ts`：`SCENE_W/H`、`sceneScale`；整數倍優先，整數倍讓畫面小於視窗 75% 才用非整數倍，非整數倍走 1 倍暫存畫布再縮放）。延伸區用天空與草地填滿，沙土路從左緣鋪到右緣（格子對齊 x 46）。
- **物件表**：`config/layoutItems.ts`（18 個物件；花槽 id 是 `planter`、珊瑚是 `coral`——舊測試檢查 dist 不得出現已取消的 `flowerbed`）。住家、鐘樓、池塘、公佈欄 `storable: false`；灌木、高草叢、花槽、珊瑚 `hasDefault: false`（預設在倉庫）。
- **擺放**：`pixel/placement.ts`（`DEFAULT_POS` ＝ v3.8.1 的位置、`KIND_GEOM` 腳下佔地、`resolvePlacement`、`withMove`、`placementToLayout`）、`pixel/envelopes.ts`（`scripts/gen-envelopes.mjs` 產生，逐列不透明區段；素材改了要重跑）、`pixel/placeRules.ts`（`canPlace`：間距 `MIN_GAP`、不擋門／鐘面／水面、連通檢查；鐘樓往後的下限 `TOWER_TOP_MIN`）、`pixel/nav.ts`（連通區塊；≤18 格的死角不算不連通）。洗澡站位在 `pixel/reach.ts`（`pondStand`）。
- **存檔**：`farmLayout`（只記和預設不同的物件，`cleanFarmLayout` 防呆：x、y 壞一個兩個都回預設；花槽／珊瑚座標壞或缺 → 倉庫）；`schemaVersion` 仍 5，`DATA_REV` 3 → 4，匯出格式 5 → 6。
- **倉庫的後果**：`sim/buildings.ts` 的 `isStored`／`isPlacedBuilding`；食盆收起＝沒買（不自動吃、手動餵 1 金幣、`bowl.used` 不動，不能靠收起刷份量）；狗窩、貓跳台收起後寵物睡地上、不躲雨。
- **介面**：`ui/EditLayer.tsx`（編輯分頁）、`ui/BuildLayer.tsx`（購買分頁）、`ui/farmHotkey.ts`（E）、`pixel/editDrag.ts`（拖曳、點擊與拖曳的判斷）；`uiStore.buildMode`／`farmTab`／`farmBuyNotice` 只在記憶體，不存檔。
- **素材**：花槽 62×45、珊瑚 59×50（`PLANTER_SCALE`／`CORAL_SCALE` 預設 0.7）；`process-assets.mjs` 用 `isBgNear`＋`trimMagentaFringe` 只處理這兩格，其他素材逐像素不變。
- **擺設寫入一律用「目前存檔」算**：`EditLayer` 放下／收進倉庫時用 `layoutAfterMove(save.ownedBuildings, save.farmLayout, id, x, y)`（`placement.ts`），不能用 `engine.layout.placement`（引擎要到下一個影格才跟上存檔；同一影格內連續兩次寫入，第二次會蓋掉第一次）。買建築時 `farmStore.buyBuilding` 用 `withoutRecord` 忽略存檔裡這棟建築以前殘留的擺放紀錄；匯入摘要的 `layoutCount` 只算 `placementToLayout(resolvePlacement(...))` 的項目。
- **已知限制（不修）**：(1) 還開著的 v3.8.x 舊分頁匯出的備份不含擺放（舊版已出貨，新版分不出來）；(2) 兩個 v3.9.0 分頁同時開，後存的覆蓋先存的（寵物、金幣一直如此，4.0.0 再考慮跨分頁偵測）；(3) `backupActions.exportBackup` 先 `flushSave()` 再立刻 `load()`，因為 `LocalStorageAdapter.save` 會先 `await snapshot()` 才寫入，匯出檔可能少掉最後一個節流區間的變動（以前就有；擺放不受影響，`setFarmLayout` 放下就立刻寫入）。
- **測試**：`tests-archive/v390/`（不接 npm scripts；環境、執行方式、已知例外見該資料夾的 README.md）。
- **鐘樓與塔門保護**（`placeRules.ts`）：`TOWER_TOP_MIN` = -24（鐘樓腳底最小 y = 136 = 草地上緣，尖頂超出畫面 24 像素；`minFootY` 取 `max(草地上緣, 160 + TOWER_TOP_MIN)`，再改小也不會超過草地上緣）。塔門、招牌、鐘面三個互動區各自允許被前面物件的素材蓋住 `TOWER_ZONE_COVER_MAX`（0.25）以下（`coverStats` 數整數像素格：邊界往內取整、剛好等於上限可以；`coverExceeds`、`towerCoverBlock`）；窗戶與其他物件的互動區仍用 `runsHit`（完全不能蓋）；`catTreeHitsTower` 沒動；鐘樓腳下佔地間距維持 `MIN_GAP` 12、沒有塔門特例。能蓋到鐘面的物件一定先把塔門蓋過 25%，所以鐘面這一區在現有素材下不會單獨擋人。

## v3.9.1：野餐選位置

- **流程**：選單列「野餐」→ `uiStore.requestPicnic` → `farm/index.tsx` 的 picnicReq 效果：選位置中再按 = 取消；有對話框（領養、關於、收藏冊、匯入、找新主人、拍立得、事件與存檔提示）或視窗最大化 → 提示 `PICK_TEXT.closeFirst`、不進入；`picnicStartBlock()`（`picnicBlock` → 自動位置存在 → 有候選寵物）不過 → 原本的提示（含「草地太擠…」）；否則關掉啟動台／工具、離開編輯農場、放下拖曳中的寵物，`uiStore.picnicPick = true`。開始一律走 `beginPicnic(mat | null)`（null = 自動，和 v3.9.0 完全相同）；`engine.choosePicnicMat(r)` 把選的位置交給下一次 `syncPicnic`（用過就清掉）。
- **畫面層** `ui/PicnicPickLayer.tsx`：游標 = 墊子中心（`matRectAtCursor`），只有整數位置或擺放版本變了才判斷；原因標籤位置直接改 style（不經 React）；點綠色 → 開始並記 `uiStore.picnicSpot`（只記手動點選的，「自動選位置」不記；只在記憶體）；點紅色 → 提示原因、留在選位置；Esc／右鍵／「取消」離開；每 0.5 秒重查條件，失效就提示並離開。初始預覽 `initialPickRect`：記憶的位置還能放就用它，否則自動位置。
- **選位置期間** `editingRef = buildMode || picnicPick`：引擎 `editing = true`（寵物暫停）、入口與相機隱藏、`hover.blocked`、`endPlay('window')`、E 不作用；`setBuildMode(true)`、`setToolOpen(id)` 會清掉 `picnicPick`（兩種模式不同時開）。
- **判斷規則**只有一個：`pixel/picnic.ts` 的 `picnicSpotCheck`（自動找位置 `picnicMatRect`、手動選位置、野餐中離開編輯農場的 `picnicMatFitsAt` 共用）：範圍 `matRange`（與 v3.9.0 的掃描範圍相同）＋邊緣保險 `matEdgeOk`（座位寵物 `PICNIC_PET_REACH`、相機、照片裁切 `PICNIC_CROP_MIN` 都在場景內；範圍內一律成立）→ 外框碰佔地 → 座位站得住（`isWalkable`，不另外查「走得到」，使用者決定）→ 座位被蓋 ≤ 50%。原因文字 `MAT_SPOT_TEXT`（outside、overlap 與 `PLACE_REASON_TEXT` 相同）。改素材（寵物、相框）要確認這兩個常數仍涵蓋（測試會比對 manifest）。
- **預覽**由引擎畫（`engine.picnicGhost`，`drawPicnicGhost` 在 render 最後、拍照不畫）：半透明墊子（不行時用 `tinted` 紅色）、虛線外框、6 個座位的腳底點與寵物身體範圍（`PET_BOX`）；出問題的座位紅色、其他白色。
- 測試：`tests-archive/v390/node/v391-picnic-pick-entry.js`、`browser/t9-picnic-pick-browser.mjs`。
