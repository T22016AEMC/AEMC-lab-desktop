import { lazy } from 'react'
import type { BuiltinApp } from '../types'

/**
 * 內建程式（直接在視窗中渲染 React 元件，不使用 iframe）。
 * category 設為 'games' 的程式會歸入啟動台的「遊戲」資料夾，
 * 不顯示在桌面圖示與 Dock，只有開啟時才出現在 Dock。
 * 遊戲用 lazy 載入，打開才會下載對應的程式碼（彈珠台的 matter-js 比較大）。
 */
export const builtinApps: BuiltinApp[] = [
  {
    id: 'game-minesweeper',
    kind: 'builtin',
    name: '踩地雷',
    icon: '💣',
    category: 'games',
    component: lazy(() => import('../games/minesweeper')),
    defaultSize: { width: 720, height: 680 },
    minSize: { width: 360, height: 420 },
  },
  {
    id: 'game-2048',
    kind: 'builtin',
    name: '2048',
    icon: '🔢',
    category: 'games',
    component: lazy(() => import('../games/game2048')),
    defaultSize: { width: 480, height: 580 },
    minSize: { width: 320, height: 400 },
  },
  {
    id: 'game-snake',
    kind: 'builtin',
    name: '貪食蛇',
    icon: '🐍',
    category: 'games',
    component: lazy(() => import('../games/snake')),
    defaultSize: { width: 520, height: 600 },
    minSize: { width: 340, height: 420 },
  },
  {
    id: 'game-pinball',
    kind: 'builtin',
    name: '彈珠台',
    icon: '🎱',
    category: 'games',
    component: lazy(() => import('../games/pinball')),
    defaultSize: { width: 440, height: 680 },
    minSize: { width: 300, height: 420 },
  },
  {
    id: 'game-shooter',
    kind: 'builtin',
    name: '飛機打怪',
    icon: '✈️',
    category: 'games',
    component: lazy(() => import('../games/shooter')),
    defaultSize: { width: 400, height: 680 },
    minSize: { width: 280, height: 420 },
  },
]
