import type { ExternalApp } from '../types'

/**
 * 預設的外部程式清單：新使用者（或沒有存過清單的使用者）一開始看到的程式，
 * 也是啟動台「恢復預設程式」會還原的內容。
 * 使用者之後在啟動台新增、編輯、刪除的內容存在瀏覽器（見 store/appListStore.ts），不會改到這個檔案。
 *
 * 所有外部程式都用瀏覽器新分頁開啟，所以不需要檢查網站能不能嵌入。
 * icon 可以是 public/icons/ 底下的圖片路徑，或 "" 使用自動文字圖示。
 */
export const DEFAULT_APPS: ExternalApp[] = [
  {
    id: 'filmaster',
    name: 'FilMaster',
    icon: 'icons/filmaster.svg', // FilMaster 標題使用的 lucide-react Cpu（晶片）
    url: 'https://t22016aemc.github.io/FilMaster/',
  },
  {
    id: 'specreader',
    name: 'SpecReader',
    icon: 'icons/specreader.svg', // 取自網站的 <link rel="icon">
    url: 'https://specreader-v1.onrender.com',
  },
  {
    id: 'chemscutter',
    name: 'CheMScutter',
    icon: 'icons/chemscutter.png', // 使用者提供的原圖（裁切到分子主體，縮成 256×256）
    url: 'https://t22016aemc.github.io/chemscutter/',
  },
  {
    id: 'elusim',
    name: 'EluSim',
    icon: 'icons/elusim.svg', // 依外觀重新繪製的正弦波
    url: 'https://elusim-v1.onrender.com/',
  },
  {
    id: 'autoellipso',
    name: 'AutoEllipso',
    icon: 'icons/autoellipso.svg', // 藍色漸層圓角方形加白色「ΨΔ」
    url: 'https://autoellipso.t22016.workers.dev/',
  },
]
