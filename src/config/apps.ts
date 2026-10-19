import type { ExternalAppConfig } from '../types'

/**
 * 外部程式清單。新增程式時只需要修改這個檔案：在陣列中加一筆即可。
 *
 * - id          唯一識別碼（英文，不可重複）
 * - name        顯示名稱
 * - icon        emoji，或圖片路徑（把圖片放進 public/icons/，寫 "icons/檔名.png"）
 * - url         程式網址
 * - openMode    "window"：在桌面內開視窗（iframe）；"tab"：開瀏覽器新分頁
 * - defaultSize 選填，視窗預設寬高（只對 openMode 為 "window" 有效）
 *
 * 目前是 5 個佔位範例，請把 url 換成實際網址。
 */
export const apps: ExternalAppConfig[] = [
  {
    id: 'app-1',
    name: '範例程式 1',
    icon: '📊',
    url: 'https://example.com/',
    openMode: 'window',
    defaultSize: { width: 960, height: 640 },
  },
  {
    id: 'app-2',
    name: '範例程式 2',
    icon: '🧪',
    url: 'https://example.com/',
    openMode: 'window',
    defaultSize: { width: 820, height: 600 },
  },
  {
    id: 'app-3',
    name: '範例程式 3',
    icon: '📐',
    url: 'https://example.com/',
    openMode: 'window',
  },
  {
    id: 'app-4',
    name: '範例程式 4',
    icon: '🔬',
    url: 'https://example.com/',
    openMode: 'tab',
  },
  {
    id: 'app-5',
    name: '範例程式 5',
    icon: '📁',
    url: 'https://example.com/',
    openMode: 'tab',
  },
]
