# AEMC Lab Desktop

macOS 風格的虛擬桌面網頁，桌面是一座寵物養殖場，用來集中開啟部署在網路上的小程式（GitHub Pages / Render）並內建小遊戲。純前端，部署到 GitHub Pages。

正式網址：https://t22016aemc.github.io/AEMC-lab-desktop/

## 功能

- 開機畫面，點擊後直接進入桌面（不需要全螢幕）
- 頂部選單列（Logo →「關於這個桌面」、作用中程式名稱、點數、日期時間）
- 桌面是寵物養殖場（見下方），畫面貼合瀏覽器可視區域（扣掉選單列），視窗縮放時即時重新計算；底部 Dock 平時只有「啟動台」，開啟中的內建視窗（小遊戲）才會出現圖示
- 視窗系統（只給內建程式使用）：紅黃綠按鈕、拖曳、邊緣與角落縮放、雙擊標題列最大化、最小化動畫、置頂、同一程式只開一個視窗
- 外部程式一律用瀏覽器新分頁開啟；啟動台是使用者自己的程式清單，可新增、編輯（右鍵）、刪除（右鍵、需確認）、恢復預設程式，清單存在瀏覽器
- 電腦專用：可視寬度低於 1024px 時只顯示「本網站僅支援電腦瀏覽，請使用電腦開啟」，不載入桌面與養殖場
- 5 個內建小遊戲（踩地雷、2048、貪食蛇、彈珠台、飛機打怪），收在啟動台的「遊戲」資料夾
- PWA：可安裝成電腦的獨立視窗（`display: standalone`）

## 本機啟動

需要 Node.js 20.19 以上（建議 22）。

```bash
npm install
npm run dev        # 開發模式，網址 http://localhost:5173/
```

預覽正式建置的結果：

```bash
npm run build
npm run preview    # 網址 http://localhost:4173/
```

## 寵物養殖場（桌面）

桌面本身就是一個寵物養殖場：左半邊是陸地（草地、小徑、樹），右半邊是側面剖面的海水池塘，上方是天空。所有程式與遊戲都從 Dock 最左邊的「啟動台」開啟，開啟後才會在 Dock 出現該程式的圖示，視窗顯示在養殖場上方。程式碼在 `src/farm/`。

**場景**
- 以程式繪製（Canvas 2D，可愛扁平風，無外部圖片），30fps。分頁在背景或有視窗最大化時暫停動畫。
- 畫面高度固定為邏輯座標 900，水平寬度依視窗比例變化；背景一律畫滿，任何比例（16:9、16:10、21:9…）都不會有黑邊，陸地與池塘各佔寬度一半，生物依邏輯座標等比縮放並限制在各自區域內。
- 日夜依本機實際時間（清晨 5–8、白天 8–17、黃昏 17–19:30、夜晚 19:30–5），天空顏色平滑過渡；夜晚有星星月亮，場景變暗，池塘生物游得較慢。
- 陸地寵物的睡覺時間是本機時間 23:00～隔天 6:00（`balance.ts` 的 `sleep`），與天空的日夜變化分開；黃昏與 23:00 前仍醒著正常活動。
- 天氣（晴、多雲、下雨、下雪）每 4 小時換一次，以時間為種子，重新整理不會跳變；純視覺效果，不連網。

**寵物**
外觀都是以 SVG 路徑部件在 Canvas 上繪製（`src/farm/art/`），狗有柴犬、柯基、哈士奇、黃金獵犬、邊牧、貴賓（小／中／大型 0.82／1.0／1.22 倍），貓有橘虎斑、黑貓、三花、暹羅、英短藍貓、布偶貓。領養時預覽縮圖即時更新，領養後長得一樣。開發環境測試模式有「生物圖鑑」可檢視所有生物與姿勢。

| 種類 | 佔用 | 領養點數 |
| --- | --- | --- |
| 狗（6 個品種）、貓（6 種花色／品種） | 陸地，貓狗合計最多 3 隻 | 15 |
| 小丑魚（一次 3 隻成群） | 池塘 1 格 | 15 |
| 帝王蟹 | 1 格 | 15 |
| 海龜 | 2 格 | 25 |
| 白鯨、虎鯨 | 3 格 | 35 |
| 鯨鯊 | 4 格 | 35 |

池塘總容量 12 格。第一隻免費。每隻寵物有身高係數（約 0.85～1.15）、體重（0～100，影響胖瘦）、飽食度／心情／清潔度（0～100，隨時間緩慢下降）。離開網站期間依經過時間補算，但最低不低於 20；任一數值低於 30 時頭上會冒出提示泡泡。領養滿 3 天由幼年成年，外觀變大。

**操作**
- 左上角「指令面板」：先選動作、再選對象，顯示消耗點數，按「執行」。點數不足或條件不符的選項會顯示為不可選並說明原因。睡覺時：撫摸可用（不會醒來，心情 +5）；叫醒可用（貓醒來不開心心情 −15，狗醒來很開心心情不變）；餵食、洗澡、散步、梳毛顯示「正在睡覺，可以先叫醒」。醒著時所有指令正常；若仍在睡覺時間內，約 10 分鐘沒有任何互動就會自己回去睡。日常指令每次 1 點：餵食、撫摸、洗澡、散步（狗）、梳毛（貓）、叫醒（睡覺中的貓或狗）、餵飼料（整個池塘）、清潔池塘、撫摸（海龜、白鯨）。另有「領養」。
- 點擊寵物顯示資訊卡（名字、種類、成長階段、三項數值、身高與體重）。
- 點數：初始 30，每日第一次開啟 +5（以本機日期判斷）；心情高於 70 的寵物每天最多 4 次叼來禮物，點擊領取 +1～3 點。選單列時間左邊顯示目前點數。

**存檔**
- 單一物件（含 `schemaVersion`），目前存在 localStorage（鍵名 `aemc-desktop:farm-save`，遊戲最高分沿用舊鍵名，不衝突）。
- 儲存層是 `SaveStorage` 介面（`load`／`save`／`clear`，皆為 Promise），目前實作 `LocalStorageAdapter`，讀寫都包在 try/catch。之後改成帳號綁定的雲端存檔時，只需實作同一介面並呼叫 `setSaveStorage()`。資料格式升級時在 `src/farm/save/migrate.ts` 依 `schemaVersion` 轉換。
- 數值、容量、點數等調整參數集中在 `src/farm/config/balance.ts` 與 `species.ts`。

**測試模式（只在本機開發環境）**
`npm run dev` 時畫面右下角會有「🧪 測試模式」面板：點數 +100／+1000、時間快轉 1 小時／1 天、調整寵物各項數值與體重、切換天氣與時段、讓寵物叼禮物、重置養殖場。它透過 `import.meta.env.DEV` 條件式動態載入，正式 build 會被整段移除（`npm run build` 後 `dist/` 內搜尋不到任何測試模式的程式碼）。

**預留給後續階段**：玩耍相關指令、7 個建築（鐘樓、狗窩、貓跳台、食盆、花圃、路燈、珊瑚礁，座標已定義在 `src/farm/config/buildings.ts`）、小程式與遊戲的點數獎勵。

## 管理程式（啟動台）

外部程式清單是使用者自己的，存在瀏覽器（`aemc-desktop:app-list`，含 `schemaVersion`，透過 `src/lib/documentStorage.ts` 的可替換儲存層，之後可搬到帳號雲端）。

- 新增：啟動台右上角的「＋」→ 填網址（沒寫 http 會自動補 https，只接受 http／https）、名稱、圖示（上傳圖片會置中裁成正方形並縮成 256×256，或使用文字圖示：名稱前 1～2 個字、顏色依名稱雜湊決定）。
- 編輯、刪除：在程式圖示上按右鍵（刪除前會確認）。預設的 5 個程式也可以編輯與刪除；內建遊戲只能「隱藏」。
- 「恢復預設程式」：還原成預設清單並重新顯示隱藏的遊戲。
- 所有外部程式都用新分頁開啟（`window.open`，帶 `noopener,noreferrer`），所以不需要檢查網站能不能嵌入。

預設的 5 個程式（FilMaster、SpecReader、CheMScutter、EluSim、AutoEllipso）定義在 [src/config/apps.ts](src/config/apps.ts) 的 `DEFAULT_APPS`；圖片圖示放在 `public/icons/`，`icon` 寫 `'icons/檔名.png'`，寫 `''` 則是文字圖示。

## 內建程式與小遊戲

`src/config/builtinApps.ts` 用來登錄「內建程式」：直接在桌面視窗中渲染 React 元件。元件會收到 `active`（是否為作用中視窗）與 `minimized`（是否最小化）兩個屬性。`category: 'games'` 的程式會歸入啟動台的「遊戲」資料夾，不顯示在桌面圖示，只有開啟時才出現在 Dock。

目前的 5 個遊戲（程式碼在 `src/games/<遊戲名稱>/`，共用的暫停、結算畫面、音效、縮放畫布在 `src/games/shared/`）：

| 遊戲 | 資料夾 | 操作 |
| --- | --- | --- |
| 踩地雷 | `minesweeper` | 初級 9×9、中級 16×16、高級 30×16；左鍵翻開、右鍵插旗、點數字快速翻開。最高紀錄是各難度的最短時間 |
| 2048 | `game2048` | 方向鍵或 WASD |
| 貪食蛇 | `snake` | 方向鍵或 WASD；分數越高速度越快 |
| 彈珠台 | `pinball` | Z／← 左擋板、/／→ 右擋板；按住空白鍵蓄力、放開發射；也可以點畫面左半邊或右半邊控制擋板、用「發射」按鈕蓄力。物理使用 matter-js，3 顆球 |
| 飛機打怪 | `shooter` | 自動射擊；方向鍵、WASD 或拖曳移動。每 5 波一隻 Boss；P 火力升級（最高 5 級）、S 護盾 |

共通行為：

- 全部用 Canvas 或 React 繪製，沒有外部圖片；畫面隨視窗大小縮放。
- 有開始畫面、暫停（P 或 Esc）、遊戲結束畫面。視窗最小化、不是作用中視窗、分頁隱藏或瀏覽器失去焦點時會自動暫停。
- 最高分存在 localStorage（鍵名 `aemc-desktop:<遊戲>:best`），讀寫都有 try/catch，無痕模式也不會出錯。
- 音效用 WebAudio 合成，預設關閉，視窗右上角的喇叭按鈕可開關。

新增遊戲的做法：在 `src/games/<名稱>/index.tsx` 寫一個接收 `BuiltinAppProps` 的元件（可用 `useGameStatus` 與 `GameShell`），再到 `builtinApps.ts` 登錄。

## 部署到 GitHub Pages

1. 把專案推送到 GitHub（repo 名稱 `AEMC-lab-desktop`）。
2. 到 repo 的 **Settings → Pages**，**Source** 選 **GitHub Actions**。
3. push 到 `main` 分支後，[.github/workflows/deploy.yml](.github/workflows/deploy.yml) 會自動 build 並部署。
4. 部署完成後網址為 `https://<帳號>.github.io/<repo 名稱>/`。

Vite 的 `base` 讀取環境變數 `BASE_PATH`；Actions 會自動帶入 `/<repo 名稱>/`，本機開發則為 `/`。若要改用其他 repo 名稱，不需要修改程式。

## 版本管理

每次修改程式都要更新 `package.json` 的 version 與 [CHANGELOG.md](CHANGELOG.md)，並 commit、打 tag，詳見 [CLAUDE.md](CLAUDE.md)。「關於這個桌面」顯示的版本號與更新日期，是建置時分別從 `package.json` 與 CHANGELOG 最上方的紀錄讀取。

## 專案結構

```
src/
├─ farm/          寵物養殖場：config（物種、數值、建築）、save（存檔與儲存層）、sim（純邏輯）、store、render（Canvas 場景與生物）、ai（行為）、ui（指令面板、資訊卡…）
├─ dev/           測試模式面板（只在開發環境載入）
├─ config/        apps.ts（外部程式清單）、builtinApps.ts（內建程式）、registry.ts
├─ store/         windowStore.ts（視窗管理）、uiStore.ts（開機、啟動台、版面尺寸）
├─ components/    BootScreen、MenuBar、AboutDialog、Desktop、Dock、Launchpad、Window、RotateHint …
├─ games/         minesweeper、game2048、snake、pinball、shooter、shared（共用元件）
├─ hooks/         useClock、useMediaQuery、useViewportSync、useIframeFocusSync
└─ lib/           layout、format、icon、dock、documentStorage、appUrl、iconImage
```
