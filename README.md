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

## 內建程式

`src/config/builtinApps.ts` 用來登錄「內建程式」：不使用 iframe，直接在視窗中渲染 React 元件（階段二的小遊戲會使用）。元件會收到 `active`（是否為作用中視窗）與 `minimized`（是否最小化）兩個屬性。`category: 'games'` 的程式會歸入啟動台的「遊戲」資料夾，且只有開啟時才出現在 Dock。

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
├─ hooks/         useClock、useMediaQuery、useViewportSync
└─ lib/           layout、fullscreen、format、icon、dock
```
