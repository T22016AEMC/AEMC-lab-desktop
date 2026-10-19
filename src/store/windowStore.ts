import { create } from 'zustand'
import { getApp } from '../config/registry'
import { getDockTarget } from '../lib/dock'
import { DEFAULT_MIN_SIZE, DEFAULT_WINDOW_SIZE, clamp, workArea } from '../lib/layout'
import type { DesktopApp, Rect } from '../types'
import { useUIStore } from './uiStore'

export interface WindowState extends Rect {
  /** 同一程式只開一個視窗，所以視窗 id 就是 app id */
  appId: string
  z: number
  minimized: boolean
  maximized: boolean
  /** 最小化時要縮向的 Dock 圖示中心點 */
  minimizeTo: { x: number; y: number } | null
  /** 每次「重新載入」加 1，讓 iframe 重新建立 */
  reloadKey: number
}

interface WindowStore {
  windows: Record<string, WindowState>
  activeId: string | null
  zCounter: number
  openApp: (app: DesktopApp) => void
  closeWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  toggleMaximize: (id: string) => void
  focusWindow: (id: string) => void
  setRect: (id: string, rect: Rect) => void
  moveWindow: (id: string, x: number, y: number) => void
  reloadWindow: (id: string) => void
}

/** 最上層且未最小化的視窗 */
function topVisible(windows: Record<string, WindowState>): string | null {
  let best: WindowState | null = null
  for (const w of Object.values(windows)) {
    if (!w.minimized && (!best || w.z > best.z)) best = w
  }
  return best ? best.appId : null
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: {},
  activeId: null,
  zCounter: 100,

  openApp: (app) => {
    // 新分頁模式：不建立視窗
    if (app.kind === 'external' && app.openMode === 'tab') {
      window.open(app.url, '_blank', 'noopener,noreferrer')
      return
    }
    if (get().windows[app.id]) {
      get().focusWindow(app.id) // 已開啟：切換過去；已最小化就還原
      return
    }
    const { viewport, compact } = useUIStore.getState()
    const wa = workArea(viewport, compact)
    const size = app.defaultSize ?? DEFAULT_WINDOW_SIZE
    const width = Math.min(size.width, wa.width - 24)
    const height = Math.min(size.height, wa.height - 16)
    const n = Object.keys(get().windows).length
    const offset = (n % 6) * 28 - 56
    const x = clamp(wa.x + (wa.width - width) / 2 + offset, 0, wa.width - width)
    const y = clamp(wa.y + (wa.height - height) / 2 + offset, wa.y, wa.y + wa.height - height)
    set((s) => {
      const z = s.zCounter + 1
      return {
        zCounter: z,
        activeId: app.id,
        windows: {
          ...s.windows,
          [app.id]: {
            appId: app.id,
            x,
            y,
            width: Math.max(width, Math.min(DEFAULT_MIN_SIZE.width, wa.width)),
            height: Math.max(height, Math.min(DEFAULT_MIN_SIZE.height, wa.height)),
            z,
            minimized: false,
            maximized: false,
            minimizeTo: null,
            reloadKey: 0,
          },
        },
      }
    })
  },

  closeWindow: (id) =>
    set((s) => {
      if (!s.windows[id]) return s
      const { [id]: _removed, ...rest } = s.windows
      return { windows: rest, activeId: s.activeId === id ? topVisible(rest) : s.activeId }
    }),

  minimizeWindow: (id) =>
    set((s) => {
      const w = s.windows[id]
      if (!w) return s
      const windows = {
        ...s.windows,
        [id]: { ...w, minimized: true, minimizeTo: getDockTarget(id) },
      }
      return { windows, activeId: s.activeId === id ? topVisible(windows) : s.activeId }
    }),

  toggleMaximize: (id) =>
    set((s) => {
      const w = s.windows[id]
      if (!w) return s
      return { windows: { ...s.windows, [id]: { ...w, maximized: !w.maximized } } }
    }),

  focusWindow: (id) =>
    set((s) => {
      const w = s.windows[id]
      if (!w) return s
      if (s.activeId === id && !w.minimized && w.z === s.zCounter) return s
      const z = s.zCounter + 1
      return {
        zCounter: z,
        activeId: id,
        windows: { ...s.windows, [id]: { ...w, z, minimized: false } },
      }
    }),

  setRect: (id, rect) =>
    set((s) => {
      const w = s.windows[id]
      if (!w) return s
      return { windows: { ...s.windows, [id]: { ...w, ...rect } } }
    }),

  moveWindow: (id, x, y) =>
    set((s) => {
      const w = s.windows[id]
      if (!w) return s
      return { windows: { ...s.windows, [id]: { ...w, x, y } } }
    }),

  reloadWindow: (id) =>
    set((s) => {
      const w = s.windows[id]
      if (!w) return s
      return { windows: { ...s.windows, [id]: { ...w, reloadKey: w.reloadKey + 1 } } }
    }),
}))

/** 目前作用中視窗對應的 app */
export function useActiveApp(): DesktopApp | undefined {
  const id = useWindowStore((s) => s.activeId)
  return id ? getApp(id) : undefined
}
