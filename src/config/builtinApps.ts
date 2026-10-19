import type { BuiltinApp } from '../types'

/**
 * 內建程式（直接在視窗中渲染 React 元件，不使用 iframe）。
 * 階段二的小遊戲會在這裡登錄，category 設為 'games' 會歸入啟動台的「遊戲」資料夾。
 */
export const builtinApps: BuiltinApp[] = []
