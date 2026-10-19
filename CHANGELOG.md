# 更新紀錄

版本號遵循語意化版本；每次修改程式都要在最上方新增一筆（格式固定，建置時會讀取第一筆的日期）。

## [1.2.1] - 2026-10-19

### 變更
- 更新 FilMaster 與 EluSim 的圖示：FilMaster 使用其標題採用的 lucide Cpu 晶片圖形，EluSim 為重新繪製的正弦波；兩者與 SpecReader 同風格（深色圓角方形底、青色發光線條）

## [1.2.0] - 2026-10-19

### 新增
- 加入 5 個正式程式，取代佔位範例：FilMaster、SpecReader、CheMScutter（視窗模式）、EluSim（網站禁止嵌入，改以新分頁開啟）、AutoEllipso
- 圖示：SpecReader 使用網站提供的圖示（存於 public/icons/specreader.svg），其餘使用「文字圖示」（圓角方形＋漸層底色＋名稱前兩個字母）
- 「即將推出」狀態（status: coming-soon，url 可省略）：桌面、Dock、啟動台圖示半透明並加標籤，點擊只顯示「尚未上線，敬請期待」提示；AutoEllipso 使用此狀態

### 變更
- GitHub Actions 升級到最新主版本（checkout v7、setup-node v7、upload-pages-artifact v5、deploy-pages v5），Node 改為 24，消除 Node 20 棄用警告

## [1.1.0] - 2026-10-19

### 新增
- 5 個內建小遊戲：踩地雷（初／中／高級）、2048、貪食蛇、彈珠台（matter-js）、飛機打怪（含 Boss、道具、爆炸效果）
- 啟動台「遊戲」資料夾列出所有遊戲；遊戲不顯示在桌面與 Dock，開啟時才出現在 Dock
- 遊戲共通功能：開始／暫停／結束畫面、視窗最小化或失去焦點時自動暫停、最高分存 localStorage、畫面隨視窗縮放、觸控操作、可開關的合成音效（預設關閉）
- 遊戲程式碼以動態載入拆分，打開遊戲時才下載

## [1.0.1] - 2026-10-19

### 修正
- 修正背景視窗要點兩下才能操作的問題：移除非作用中視窗的透明遮罩，遮罩只在拖曳或調整視窗大小時出現
- 改為偵測焦點進入 iframe（父頁面 blur 加上每 200ms 輪詢 document.activeElement）後自動置頂並更新選單列，不會搶走 iframe 的焦點

## [1.0.0] - 2026-10-19

### 新增
- macOS 風格虛擬桌面：開機畫面、頂部選單列、桌面圖示、底部 Dock、啟動台
- 視窗系統：紅黃綠按鈕、拖曳、邊緣與角落縮放、雙擊標題列最大化、最小化動畫、置頂管理
- 外部程式以 iframe 嵌入（不加 sandbox），含載入中動畫與逾時提示；也可設定為新分頁開啟
- 內建程式類型（直接渲染 React 元件），供階段二的小遊戲使用
- 手機橫向適配與直拿提示、全螢幕與橫向鎖定
- PWA 支援（fullscreen、landscape）
- GitHub Actions 自動部署到 GitHub Pages
