import { create } from 'zustand'
import type { Size } from '../types'

interface UIState {
  booted: boolean
  /** 畫面下方的提示訊息；id 每次遞增，讓相同訊息也能重新計時 */
  toast: { id: number; message: string; ms?: number } | null
  launchpadOpen: boolean
  aboutOpen: boolean
  /** 領養視窗 */
  adoptOpen: boolean
  viewport: Size
  setBooted: (v: boolean) => void
  /** ms：顯示多久（預設 2.8 秒） */
  showToast: (message: string, ms?: number) => void
  hideToast: () => void
  setLaunchpadOpen: (v: boolean) => void
  setAboutOpen: (v: boolean) => void
  setAdoptOpen: (v: boolean) => void
  setViewport: (width: number, height: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  booted: false,
  toast: null,
  launchpadOpen: false,
  aboutOpen: false,
  adoptOpen: false,
  viewport: { width: window.innerWidth, height: window.innerHeight },
  setBooted: (booted) => set({ booted }),
  showToast: (message, ms) => set((s) => ({ toast: { id: (s.toast?.id ?? 0) + 1, message, ms } })),
  hideToast: () => set({ toast: null }),
  setLaunchpadOpen: (launchpadOpen) => set({ launchpadOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setAdoptOpen: (adoptOpen) => set({ adoptOpen }),
  setViewport: (width, height) =>
    set((s) =>
      s.viewport.width === width && s.viewport.height === height
        ? s
        : { viewport: { width, height } },
    ),
}))
