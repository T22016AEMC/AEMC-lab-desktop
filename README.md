# AEMC Lab Desktop

macOS 風格的虛擬桌面網頁，用來集中開啟部署在網路上的小程式（GitHub Pages / Render）。純前端，部署到 GitHub Pages。

正式網址：https://t22016aemc.github.io/AEMC-lab-desktop/

## 功能

- 開機畫面，點擊後進入全螢幕（不支援全螢幕的瀏覽器如 iPhone 會直接進桌面）
- 頂部選單列（Logo →「關於這個桌面」、作用中程式名稱、日期時間）
- 桌面圖示（滑鼠雙擊、觸控單擊開啟）、底部 Dock（放大效果、執行中圓點）、啟動台（搜尋、遊戲資料夾）
- 視窗系統：紅黃綠按鈕、拖曳、邊緣與角落縮放、雙擊標題列最大化、最小化動畫、置頂、同一程式只開一個視窗
- 外部程式以 iframe 嵌入（不加 sandbox，可上傳與下載檔案），有載入中動畫與逾時提示
- 手機橫向適配（視窗一律最大化、Dock 與選單列縮小）、直拿時提示轉為橫向
- 5 個內建小遊戲（踩地雷、2048、貪食蛇、彈珠台、飛機打怪），收在啟動台的「遊戲」資料夾
- PWA：可「加到主畫面」，`display: fullscreen`、`orientation: landscape`

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

## 如何新增程式

只需要修改 [src/config/apps.ts](src/config/apps.ts)，在陣列中加一筆：

```ts
{
  id: 'my-app',                       // 唯一識別碼（英文）
  name: '我的程式',                    // 顯示名稱
  icon: '🧪',                         // emoji，或圖片路徑（見下方）
  url: 'https://example.onrender.com/',
  openMode: 'window',                 // 'window'：桌面內開視窗；'tab'：開新分頁
  defaultSize: { width: 960, height: 640 }, // 選填，視窗預設大小
}
```

使用圖片當圖示：把圖片放進 `public/icons/`，`icon` 寫 `'icons/my-app.png'`。

### 嵌入限制（重要）

視窗模式用 iframe 載入網站。如果目標網站的回應標頭有 `X-Frame-Options: DENY/SAMEORIGIN`，或 CSP 的 `frame-ancestors` 不允許本站，瀏覽器會拒絕顯示，而且網頁端無法偵測到這件事（只會看到空白或瀏覽器的錯誤頁）。這類網站請把 `openMode` 設為 `'tab'`，或在視窗右上角用「在新分頁開啟」。

Render 免費方案冷啟動可能需要 30 秒以上，視窗會顯示「載入中…」，60 秒後仍未載入才會出現逾時提示。

## 內建程式與小遊戲

`src/config/builtinApps.ts` 用來登錄「內建程式」：不使用 iframe，直接在視窗中渲染 React 元件。元件會收到 `active`（是否為作用中視窗）與 `minimized`（是否最小化）兩個屬性。`category: 'games'` 的程式會歸入啟動台的「遊戲」資料夾，不顯示在桌面圖示，只有開啟時才出現在 Dock。

目前的 5 個遊戲（程式碼在 `src/games/<遊戲名稱>/`，共用的暫停、結算畫面、音效、縮放畫布在 `src/games/shared/`）：

| 遊戲 | 資料夾 | 操作 |
| --- | --- | --- |
| 踩地雷 | `minesweeper` | 初級 9×9、中級 16×16、高級 30×16；左鍵翻開、右鍵插旗、點數字快速翻開；觸控輕點翻開、長按插旗。最高紀錄是各難度的最短時間 |
| 2048 | `game2048` | 方向鍵或 WASD；觸控滑動 |
| 貪食蛇 | `snake` | 方向鍵或 WASD；觸控滑動或螢幕方向鍵；分數越高速度越快 |
| 彈珠台 | `pinball` | Z／← 左擋板、/／→ 右擋板；按住空白鍵蓄力、放開發射；觸控點畫面左半邊或右半邊，用「發射」按鈕蓄力。物理使用 matter-js，3 顆球 |
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
├─ config/        apps.ts（外部程式清單）、builtinApps.ts（內建程式）、registry.ts
├─ store/         windowStore.ts（視窗管理）、uiStore.ts（開機、啟動台、版面尺寸）
├─ components/    BootScreen、MenuBar、AboutDialog、Desktop、DesktopIcon、Dock、Launchpad、Window、RotateHint …
├─ games/         minesweeper、game2048、snake、pinball、shooter、shared（共用元件）
├─ hooks/         useClock、useMediaQuery、useViewportSync、useIframeFocusSync
└─ lib/           layout、fullscreen、format、icon、dock
```
