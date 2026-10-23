import type { ComponentType, LazyExoticComponent } from 'react'

export interface Size {
  width: number
  height: number
}

export interface Rect extends Size {
  x: number
  y: number
}

/** 使用者的外部程式：一律用瀏覽器新分頁開啟 */
export interface ExternalApp {
  id: string
  name: string
  /** 只接受 http / https 網址 */
  url: string
  /**
   * 圖示：圖片路徑（public/ 底下，例如 "icons/foo.png"）、data URL（使用者上傳的 256×256 圖片），
   * 或空字串 ""（自動文字圖示：取名稱前 1～2 個字，背景色依名稱雜湊決定）。
   */
  icon: string
}

/** 內建程式的元件會收到的屬性（供小遊戲在最小化或失去焦點時暫停） */
export interface BuiltinAppProps {
  /** 此視窗是否為作用中視窗 */
  active: boolean
  /** 此視窗是否已最小化 */
  minimized: boolean
}

/** 內建程式（小遊戲）：直接在桌面視窗中渲染 React 元件 */
export interface BuiltinApp {
  id: string
  kind: 'builtin'
  name: string
  icon: string
  defaultSize?: Size
  minSize?: Size
  component: ComponentType<BuiltinAppProps> | LazyExoticComponent<ComponentType<BuiltinAppProps>>
  /** 放進啟動台的哪個資料夾；沒有就直接列在啟動台 */
  category?: 'games'
}
