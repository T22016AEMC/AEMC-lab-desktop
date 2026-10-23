import { create } from 'zustand'
import type { Size } from '../types'

interface UIState {
  booted: boolean
  /** 畫面下方的提示訊息；id 每次遞增，讓相同訊息也能重新計時 */
  toast: { id: number; message: string } | null
  launchpadOpen: boolean
  aboutOpen: boolean
  viewport: Size
  setBooted: (v: boolean) => void
  showToast: (message: string) => void
  hideToast: () => void
  setLaunchpadOpen: (v: boolean) => void
  setAboutOpen: (v: boolean) => void
  setViewport: (width: number, height: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  booted: false,
  toast: null,
  launchpadOpen: false,
  aboutOpen: false,
  viewport: { width: window.innerWidth, height: window.innerHeight },
  setBooted: (booted) => set({ booted }),
  showToast: (message) => set((s) => ({ toast: { id: (s.toast?.id ?? 0) + 1, message } })),
  hideToast: () => set({ toast: null }),
  setLaunchpadOpen: (launchpadOpen) => set({ launchpadOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setViewport: (width, height) =>
    set((s) =>
      s.viewport.width === width && s.viewport.height === height
        ? s
        : { viewport: { width, height } },
    ),
}))
