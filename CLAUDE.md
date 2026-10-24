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
- 每張素材有錨點：`ax` 水平中心、`ay` 腳底基準線；同一隻動物所有姿勢腳底對齊。alpha 只有 0 或 255。
- 動物素材鍵名：`dog_<品種>_<動作>`、`cat_<花色>_<動作>`、`front_dog_*`／`front_cat_*`（領養預覽）；品種 id 與素材鍵名的對應在 `config/species.ts`（`assetKey`）。貓的 `sit_b` 是背面，標記 `unused_back`，不可用在動畫上。
- 鐘樓時鐘由程式畫（`pixel/clock.ts`），位置來自處理管線偵測到的鐘面中心（manifest 的 `meta.clock`）；時間必須來自遊戲的時間來源（含測試模式覆寫），不可直接用 `Date.now()`；指針角度公式有純函式測試，改動要保留。
- 場景配置固定（住家左下、路燈右側、鐘樓最右後排且周圍留空、2 棵樹、固定裝飾），寵物活動範圍與障礙物都在 `pixel/layout.ts`（`petBounds`、`blockers`），不要讓寵物走進住家、停在燈柱後面或鐘樓底座；領養按鈕放在選單列，不要放浮動按鈕在畫面角落。
- 水池（開局就有，住家右上方後排）：位置與水面橢圓在 `pixel/layout.ts`（`pondPos`、`waterEllipse`、`WATER`），數值要與 manifest 的 `pond_a.meta.water`、尺寸一致（測試會比對）；水池與石頭、樹幹、鐘樓底座都在 `blockers`，寵物不會走進去。樹與裝飾要讓出水池，不可重疊。
- 版面（v3.1.1）：後排景物（鐘塔、2 棵樹、水池）與裝飾物貼草地上緣，位置全由 `pixel/layout.ts` 依草地上緣計算（`BACK_BASE`、`DECOR_BASE`、`BACK_MARGIN`），不手調座標；樹不縮放；裝飾物腳底與樹同一個 y；寵物活動範圍從草地上緣下 14 像素開始（草地中段也能跑）。建築空位（`buildingSlots`）有 8 個專用標記：走道上 kennel、bowls、catTree（腳底在走道上緣下 `PATH_FOOT` = 24，走道下半部至少留 `PATH_FREE_MIN` = 36 給寵物；狗窩位置見下方 v3.3.1），草地上 campfire（v3.4.0，右邊那棵樹正下方）、picnicMat、sandbox（留給之後的版本）。空位不顯示、不擋寵物；建築購買後才用 `slotBlockers` 加入障礙（購買後走道上會變窄，寵物要繞行）；窄視窗放不下的建築用 `buildingAvailability` 判斷、購買時提示 `SLOT_UNAVAILABLE_MESSAGE`，不要刪建築種類。
- 拖曳寵物：按住 150 ms 或移動超過 4 px 才算拖曳，沒拖就是點擊；座標一律用 `fromCss`／`toCss`（處理 dpr 與整數縮放，不可有偏移）；放開用 `dropKind` 判斷落地、彈回（`nearestWalkable`）或洗澡。睡覺中被拖起用 `wakeForDrag`（不扣點，規則同叫醒）。
- 水池洗澡：同一時間只允許一隻（`usesPond`）；數值在 `BALANCE.bath`，扣點走既有的 `runAction('bath')`（跳進水池時才扣）；洗澡中的寵物不能被點、被拖；氣泡選單的洗澡是「走到水池前再跳進去」，途中點擊或拖曳取消。泡澡時寵物用水面橢圓裁切（程式裁切，不旋轉、不縮放）。
- 新素材 `scene_pond`（2 幀）、`fx_water`、`scene_clocktower_open` 由處理管線產生；開門鐘塔必須與 `clocktower` 同尺寸（123×160）、同錨點；夜晚開門版的門縫暖光要在暗色疊層之後再畫一次，鐘面維持清楚可讀。
- 新增素材或改尺寸後，要看 `screenshots/assets-overview.png` 與 `assets-report.txt` 確認沒有洋紅殘留、白框、大小不一。

## 金幣經濟與建築（v3.2.0）

- 介面上一律叫「金幣」，內部欄位仍叫 `points`（不改名）。新存檔初始 50（`BALANCE.startPoints`；已有存檔不補發）、每日 +5、日常活動 −1、領養 15／25／35。
- 賺金幣的規則是 `sim/earning.ts` 的純函式，數值在 `balance.ts`（`BALANCE.earn`、`gameGoals`）：啟動台開啟使用者的程式 +3（每程式每小時一次、合計每天 +10，開啟成功才給、管理清單不給）；遊戲達標 +1（合計每天 5，遊戲結束時判定一次，達標條件見 `gameGoals`）。**冷卻與每日上限的時間一律用遊戲時間來源 `gameNow()`**（`farm/overrides.ts`，測試模式可平移），每日進度以本地日期 00:00 重置；不可直接用 `Date.now()`。純前端、存在瀏覽器，**無法防作弊**（程式註解有寫），帳號與雲端階段再處理，不要為此加複雜機制。遊戲用 `games/shared/hooks.ts` 的 `useRoundReward` 在每局結束時回報成績。
- **空位專用標記**：建築空位的 id 就是專用標記，也是存檔 `ownedBuildings` 的值與 `config/buildings.ts` 的建築 id：`kennel` 狗窩、`bowls` 食盆水盆、`catTree` 貓跳台（走道上半部）、`campfire`（草地）、`picnicMat`、`sandbox`（草地，留給之後的版本）。**可購買的建築由 `PURCHASABLE` 決定**（`buyBuilding` 擋掉其他的）：v3.4.0 起有食盆水盆、狗窩、貓跳台、營火；野餐墊、沙坑不顯示、不開放，資料與 `buildingAvailability` 保留（留給之後的版本）。價格在 `BALANCE.buildings.price`（食盆水盆 10、狗窩／貓跳台／營火各 20）。
- **購買規則**：建築選單列「建築」按鈕進入建築模式（`uiStore.buildMode`，再按一次或 Esc 離開），`ui/BuildLayer.tsx` 在可購買而未購買的空位顯示虛線框與價格，點開小卡片購買；金幣不足停用。窄視窗放不下的建築（`buildingAvailability` 的 `available` 為 false）不顯示空位，建築模式改顯示 `SLOT_UNAVAILABLE_MESSAGE`；已購買但放不下的建築，紀錄保留、畫面與障礙都隱藏（`engine.buildings()` 只回傳已購買且放得下的），放大後自動恢復，不退款不刪除。
- 購買後建築的腳下佔地才進障礙（v3.3.1 佔地：狗窩 76×22、食盆水盆 48×12、貓跳台 53×22）：`Layout.owned`（引擎在存檔變動時換新的 Set）→ `blockers(L)` 併入 `slotBlockers(slots, owned)`；走道下半部寬度必須維持 ≥ `PATH_FREE_MIN`（36，實際 44），三個建築全買完寵物也要走得過去（`pixel/nav.ts` 的 A* 尋路，測試會檢查連通）。貓跳台的素材外框不可遮到塔門與招牌（測試會檢查）。
- 建築行為（`pixel/buildingUse.ts`）只決定去哪裡與動作名稱，動作畫面由 `ANIMS` 對應，不旋轉不傾斜。食盆：飽食度 < 60 且沒在睡覺／洗澡／被操作／選單開著，每天 6 份（存檔 `bowl`，本地日期 00:00 補滿）、同時最多 2 隻，用完顯示程式畫的「空」圖示（`pixel/icons.ts`）；狗窩／貓跳台：睡覺時間睡在座位上、下雨躲雨，各最多 2 隻（座位位置見 v3.3.1），睡在真座位心情回復 ×2.5（`BALANCE.sleepMood`，睡覺的基準回復每小時 +4，只在線上即時結算）；走去座位先走到建築前方的走道（lane），再到座位旁（near）；使用中的寵物位置固定、避讓機制不推牠們（別的寵物離牠們更遠一點）；兩隻都在走去建築座位的寵物之間不互相推開（座位旁靠得近，互推會卡住）。
- 測試模式面板有「加金幣」按鈕；時間快轉（+1 小時、+1 天）要連同 `earning`、`bowl` 的時間一起往前推（`dev/DevPanel.tsx` 的 `shiftTime`）。

## 存檔匯出／匯入與備份提醒（v3.3.0）

- Logo 選單（`components/LogoMenu.tsx`）：關於這個桌面、匯出存檔…、匯入存檔…、持久儲存狀態。啟動時呼叫 `navigator.storage.persist()`（失敗不顯示錯誤），結果在 Logo 選單與「關於這個桌面」顯示。
- 匯出檔格式（`lib/backup.ts`）：`{ format: "aemc-desktop-backup", formatVersion: 2, exportedAt, appVersion, data: { farm, appList } }`，檔名 `aemc-desktop-backup-YYYYMMDD-HHmm.json`（本地時間）。**讀取一律走 `SaveStorage`／`DocumentStorage`（`getSaveStorage()`、`getAppListStorage()`），不要在別處直接讀 localStorage**，之後換雲端時才能整體替換。`DocumentStorage` 因此多了 `saveStrict`（失敗丟例外）、`snapshot`、`restore`，換雲端時整組一起實作。
- 匯入檢查順序：大小（5 MB）→ JSON → format → formatVersion／schema 不高於目前（較新的拒絕，訊息「這個存檔來自較新版本，請重新整理網頁更新後再試」；formatVersion 1 或養殖場 schema 4 以下一律拒絕，訊息「這個備份來自重置前的版本，無法匯入」）→ `parseSave()` 驗證 → 啟動台清單 `parseAppList`。`parseBackup` 不寫入；按「匯入」才 `applyBackup`：先 snapshot 兩份資料、依序 saveStrict，任何一份失敗就全部還原（整批成功或整批不寫）。成功後 `suspendSaves()`（否則離開頁面時自動存檔會把記憶體裡的舊存檔寫回去）再重新整理。不做防竄改。
- 匯入舊備份時：離線補算照舊（`lastSeen` 是備份當時，所以重新整理時一次補算到現在，數值最低掉到 `offlineFloor` 20，原本就更低的維持）；每日 +5 依 `lastDailyClaim`（備份的日期早於今天就領一次，只領一次不會補領每一天）；程式與遊戲的今日進度、食盆份量、禮物次數依日期歸零重算；各程式的冷卻以備份當時的時間計。
- 備份提醒（`components/BackupReminder.tsx`、`lib/backupReminder.ts`）：從未匯出且有寵物領養滿 3 天，或距上次匯出超過 14 天，顯示不擋操作的小提示（匯出／不再提醒），每天最多一次。上次匯出時間、「不再提醒」、上次提醒日期存在獨立的設定鍵 `aemc-desktop:settings`（`lib/settings.ts`），**不寫進養殖場存檔，也不放進匯出檔**。
- 狗窩／貓跳台座位（2 個）坐滿時，多出來的寵物睡覺、躲雨改站在建築「前方」的前方位置（腳底比建築低 28、離洗澡通道遠，`seatsOf` 的 index ≥ capacity），不會被屋頂遮住；真座位空出來就換過去。這些位置沒有睡覺心情加成。

## 建築尺寸、位置與睡覺座位（v3.3.1）

- **尺寸**：狗窩 99×83、貓跳台 72×90、食盆水盆 57×26（`layout.ts` 的 `KENNEL_W/H`、`CAT_TREE_W/H`、`BOWLS_W/H` 必須和 manifest 一致，測試會比對；`KENNEL_AX = 50`、`LAMP_AX = 26`、`LAMP_POLE_X1 = 27` 也要和素材一致）。食盆水盆縮到 0.7 倍後食物與水的細節仍看得清楚；0.75 倍是候選（`BOWL_SCALE=0.75 node scripts/process-assets.mjs …` 可重產比較）。
- **狗窩在路燈後面**：位置固定由路燈決定（`kennelX()`，與視窗大小無關）：牆面外緣（素材第 `KENNEL_WALL_X`=12 欄，第 11 欄是外框線）被燈桿蓋住 `KENNEL_TUCK`=4 像素，路燈在前（腳底 y 較大）。驗收看畫面：1920×1080 截圖裡燈桿與狗窩之間不可看到草地縫。狗窩的佔地左緣在 `petMinX()`（= `lampX()+42`，寵物活動範圍左緣）之外，所以窩前的座位旁只能站在 `petMinX()` 右邊；燈與窩之間、路燈本身都在可走範圍之外（測試逐點探測）。食盆水盆與狗窩素材外框間隔 `BOWLS_GAP`=12；貓跳台中心在鐘樓中心左 6 像素，右緣離畫面右緣 > 40（`CAT_TREE_RIGHT_MARGIN`），頂端要在塔門下緣之下，再往上 `CAT_TREE_HEADROOM`=12（頂層的貓）也不蓋塔門，放不下就隱藏。狗窩屋頂的上緣伸進洗澡通道的下緣，所以狗窩買了之後 `pondStand()` 的站位移到狗窩頂端之上（站在屋頂後面寵物會被蓋住）。
- **座位模型**（`pixel/buildingUse.ts` 的 `seatsOf()`，`Seat` 有 `kind: 'ground' | 'inside' | 'platform'` 與 `near`）：寵物走到 `near`（座位旁邊的地面，一定在可走範圍內），之後**直接出現**在座位上（沒有跳上去、走進去的過場）。`BuildingUse.near` 記下座位旁位置，座位被放掉（叫醒、建築被隱藏）時寵物回到那裡；拖曳開始時 `releaseUse(a, false)`、從畫面上的位置開始拖。
  - 狗窩（睡覺、躲雨）：座位 0 = **窩裡**（`inside`：畫在狗窩素材之後，用 `KENNEL_DOOR_CLIP`（門洞的階梯形矩形，素材座標）裁切，吻部對齊門洞右緣 `KENNEL_INSIDE_RIGHT`、底邊貼墊子前緣 `KENNEL_INSIDE_BOTTOM`，只露出頭，ZZZ 畫在門洞拱頂上方；身體被門框擋住；躲雨時醒著也用睡姿幀 `*_sleep`、沒有 ZZZ，因為站姿與坐姿比門洞高）、座位 1 = **窩門口**（地面座位，面向左、頭朝窩，身體中心離門洞中心約半個身體 `KENNEL_FRONT_DX`，躲雨時坐著）。
  - 貓跳台（睡覺）：座位 0 = **頂層圓平台**（`CAT_TREE_TOP_SEAT`，素材座標）、座位 1 = **中層平台**（`CAT_TREE_MID_SEAT`），用現有睡姿、腳底貼平台表面；ZZZ 畫在平台外側（左邊、貓頭高度），不往上伸。貓跳台躲雨沒有爬台素材，醒著的貓用建築前方的地面座位（左右各一）。
  - 座位坐滿多出來的寵物：沿用 v3.3.0 的前方位置（index ≥ capacity，腳底比建築低 `OVERFLOW_DY`=28，沒有心情加成）。窩裡、門口、兩層平台都算真座位（睡覺心情 ×2.5）。躲雨躲到睡覺時間：放掉躲雨座位、重新分配成睡覺座位。
  - 引擎（`engine.ts` 的 `seatView()`）：窩裡與平台上的寵物用 `sortY = slot.y + 0.5` 排前後（在建築之後、建築前方的寵物之前）；點擊判定只算露出來的部分（窩裡的狗 = 門洞內）；氣泡選單錨點在露出來的頭上方。座位資訊不進存檔。

## v3.4.0：營火＋一次性強制重置（花圃與遊樂設施取消）

- **強制重置**：存檔 schema 5。載入時（`SaveStorage.loadOrReset`，`save/storage.ts`）若養殖場存檔是 schema 1～4：先把原始內容**原封不動**複製到 `aemc-desktop:farm-pre-v5-backup`（只寫一次，已存在不覆蓋；寫入失敗不阻擋；不讀取、不顯示、不進匯出檔），再寫入全新存檔（0 隻寵物、50 金幣、無建築、賺金幣與每日領取歸零、`resetNotice: true`）。**寫入新存檔失敗時不改動舊存檔**（`resetFailed`，畫面顯示說明、不能領養，下次載入重試）。不動 `aemc-desktop:app-list` 與 `aemc-desktop:settings`。沒有存檔（全新玩家）、無法解析的存檔都不重置、沒有提示。沒有選單的重置按鈕。`farmStore.init` 同一時間只跑一次（StrictMode 會呼叫兩次）。
- **一次性提示**（`ui/ResetNotice.tsx`）：「養殖場已重新開始，所有寵物與金幣已重置，請重新領養。」旗標 `resetNotice` 存在新存檔裡，按「確定」清掉並存檔，之後不再出現。沒有寵物（全新玩家或重置後）走第一次領養流程：第一隻免費（`adoptPet` 的 `isFirst` = 沒有存檔或 0 隻寵物），提示顯示期間先不顯示領養視窗。
- 匯出檔 `formatVersion` 升到 2；匯入 schema 4 以下（或 formatVersion 1）的備份一律拒絕。
- **花圃（蝴蝶）與遊樂設施（蹺蹺板）取消**（從來沒有發布過）：不留任何程式、數值、素材（管線不輸出 `flowerbed`、`seesaw`、`butterfly_*`，`dist` 與圖集都沒有，測試會檢查）。建築 id 只剩 `kennel`、`bowls`、`catTree`、`campfire`（可購買）與 `picnicMat`、`sandbox`（留給之後的版本，不顯示、不開放）。
- **位置**（`layout.ts`）：路燈、住家位置不動。狗窩 = 路燈 + `KENNEL_DX_FROM_LAMP`(55)，食盆水盆 = 狗窩 + `BOWLS_DX_FROM_KENNEL`(79)：兩組間隙都是用素材**不透明像素逐列量過**（路燈與狗窩、狗窩與食盆水盆最窄處縫 1 像素、不重疊；測試用圖集像素重新量一次，要求 0～2）；改素材尺寸或內容後要重算這兩個常數。貓跳台 = 鐘樓中心 + `CAT_TREE_DX_FROM_TOWER`(6)（右緣離畫面右緣約 30，頂端與頂層的貓不蓋塔門）。營火 = 右邊那棵樹正下方（水平中心 = 該樹 x，腳底 = 樹腳底 + 40～60，偏好 50，在樹前面）；外框不可蓋住水池、洗澡通道、狗窩、食盆水盆、貓跳台、塔門、路燈、住家，光暈範圍（`CAMPFIRE_GLOW`）不蓋水池與塔門，左側聚集位置離洗澡通道至少 30。放不下就隱藏（不為了擠進去而改別的物件位置）：目前只有 1024×768 放不下營火。
- **營火**（素材 `buildings_new.png` 的篝火 A、B；管線把 A、B 貼到同一個 96×81 畫布，另做 `campfire_off` = A 去掉火焰的熄滅版）：19:30～23:00 亮起（`campfireLit`；A、B 交替閃動＋`drawGlow` 光暈，畫在暗色疊層之後），其餘時間顯示 `campfire_off`。行為框架同食盆與座位（`pixel/buildingUse.ts`，用途 `gather`，數值在 `BALANCE.buildings.campfire`）：亮著、沒下雨時醒著的寵物每分鐘 0.5 的機率走到聚集位置（最多 4 個：前方兩個、左右各一，在火前面或側面、不在火後面）坐 25～55 秒，心情每秒 +0.08，之後冷卻 90 秒；睡覺時間、下雨、營火熄滅就離開（回去睡覺座位或躲雨）；被拖走的 30 秒內不會回去。聚集期間的心情增加量累積在 `Actor.moodGain`，畫面層每 10 秒用 `engine.takeMoodGains()` 取走、`applyMoodGains` 併進存檔。
- **寵物走動區**：整條走道（沙地路面）除了建築腳下的障礙（狗窩、食盆水盆、貓跳台、路燈、住家）之外都能走；測試把活動範圍切成 4 像素格，要求所有「清楚」的格子是同一個連通區塊（沒有死角），且從各起點走得到所有使用位置（食盆、狗窩座位旁、貓跳台座位旁、營火座位、洗澡站位）。

## 其他約定

- 「關於這個桌面」顯示的版本號必須從 `package.json` 讀取，不可寫死。
- 小遊戲不使用外部圖片素材，一律以程式繪製；每個遊戲放在 `src/games/<遊戲名稱>/`。
- 最高分等 localStorage 讀寫一律包在 try/catch 中。
