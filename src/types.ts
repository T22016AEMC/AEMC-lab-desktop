import type { ComponentType, LazyExoticComponent } from 'react'

export interface Size {
  width: number
  height: number
}

export interface Rect extends Size {
  x: number
  y: number
}

/** apps.ts 中每個外部程式的設定 */
export interface ExternalAppConfig {
  id: string
  name: string
  /**
   * emoji，或圖片路徑（放在 public/ 底下，例如 "icons/foo.png"）。
   * 留空字串 "" 會改用「文字圖示」：圓角方形加漸層底色，顯示名稱前兩個字母。
   */
  icon: string
  /** 程式網址。status 為 "coming-soon" 時可以省略 */
  url?: string
  /** window：在桌面內開視窗（iframe）；tab：用瀏覽器新分頁開啟。預設 window */
  openMode?: 'window' | 'tab'
  defaultSize?: Size
  /** "coming-soon"：尚未上線。圖示半透明並加「即將推出」標籤，點擊只顯示提示、不開視窗 */
  status?: 'coming-soon'
  /** 文字圖示的漸層底色 [起, 迄]；沒設定就依 id 自動決定 */
  iconColor?: [string, string]
}

interface AppBase {
  id: string
  name: string
  icon: string
  defaultSize?: Size
  minSize?: Size
}

export interface ExternalApp extends AppBase {
  kind: 'external'
  url?: string
  openMode: 'window' | 'tab'
  status?: 'coming-soon'
  iconColor?: [string, string]
}

/** 內建程式的元件會收到的屬性（供小遊戲在最小化或失去焦點時暫停） */
export interface BuiltinAppProps {
  /** 此視窗是否為作用中視窗 */
  active: boolean
  /** 此視窗是否已最小化 */
  minimized: boolean
}

/** 內建程式：不使用 iframe，直接在視窗中渲染 React 元件 */
export interface BuiltinApp extends AppBase {
  kind: 'builtin'
  component: ComponentType<BuiltinAppProps> | LazyExoticComponent<ComponentType<BuiltinAppProps>>
  /** 放進啟動台的哪個資料夾；沒有就直接列在啟動台 */
  category?: 'games'
  /** 是否顯示在桌面圖示（預設否） */
  showOnDesktop?: boolean
  /** 是否常駐 Dock（預設否，只有開啟時才出現） */
  showInDock?: boolean
}

export type DesktopApp = ExternalApp | BuiltinApp
