import type { ExternalAppConfig } from '../types'

/**
 * 外部程式清單。新增程式時只需要修改這個檔案：在陣列中加一筆即可。
 *
 * - id          唯一識別碼（英文小寫，不可重複）
 * - name        顯示名稱
 * - icon        emoji，或圖片路徑（把圖片放進 public/icons/，寫 "icons/檔名.png"）；
 *               留空字串 "" 會顯示「文字圖示」（名稱前兩個字母＋漸層底色），可用 iconColor 指定顏色
 * - url         程式網址
 * - openMode    "window"：在桌面內開視窗（iframe）；"tab"：開瀏覽器新分頁。預設 "window"
 * - defaultSize 選填，視窗預設寬高（只對 openMode 為 "window" 有效）
 * - status      選填，"coming-soon" 表示尚未上線：圖示半透明並加「即將推出」標籤，點擊只顯示提示。
 *               此時 url 可以省略。上線時補上 url 並刪除 status 這一行即可
 *
 * 網站若回應 X-Frame-Options 或 CSP frame-ancestors 禁止嵌入，openMode 必須用 "tab"。
 */
export const apps: ExternalAppConfig[] = [
  {
    id: 'filmaster',
    name: 'FilMaster',
    icon: 'icons/filmaster.svg', // 原始圖示：FilMaster 標題使用的 lucide-react Cpu（晶片）
    url: 'https://t22016aemc.github.io/FilMaster/',
    openMode: 'window',
    defaultSize: { width: 1100, height: 720 },
  },
  {
    id: 'specreader',
    name: 'SpecReader',
    icon: 'icons/specreader.svg', // 取自網站的 <link rel="icon">
    url: 'https://specreader-v1.onrender.com',
    openMode: 'window',
    defaultSize: { width: 1100, height: 720 },
  },
  {
    id: 'chemscutter',
    name: 'CheMScutter',
    icon: 'icons/chemscutter.png', // 使用者提供的原圖（裁切到分子主體，縮成 256×256）
    url: 'https://t22016aemc.github.io/chemscutter/',
    openMode: 'window', // GitHub Pages 沒有 X-Frame-Options 或 frame-ancestors 限制，可以嵌入
    defaultSize: { width: 1000, height: 700 },
  },
  {
    id: 'elusim',
    name: 'EluSim',
    icon: 'icons/elusim.svg', // 找不到原始檔，依外觀重新繪製的正弦波
    url: 'https://elusim-v1.onrender.com/',
    openMode: 'tab', // 網站以 X-Frame-Options: DENY 禁止嵌入，只能開新分頁
  },
  {
    id: 'autoellipso',
    name: 'AutoEllipso',
    icon: 'icons/autoellipso.svg', // 藍色漸層圓角方形加白色「ΨΔ」，依名稱重新繪製
    url: 'https://autoellipso.t22016.workers.dev/',
    openMode: 'tab', // 網站以 X-Frame-Options: DENY 與 CSP frame-ancestors 'none' 禁止嵌入，只能開新分頁
  },
]
