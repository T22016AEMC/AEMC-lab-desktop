import { create } from 'zustand'
import { COMPACT_HEIGHT } from '../lib/layout'
import type { Size } from '../types'

interface UIState {
  booted: boolean
  launchpadOpen: boolean
  aboutOpen: boolean
  viewport: Size
  /** 手機尺寸（橫向高度小於 500px） */
  compact: boolean
  setBooted: (v: boolean) => void
  setLaunchpadOpen: (v: boolean) => void
  setAboutOpen: (v: boolean) => void
  setViewport: (width: number, height: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  booted: false,
  launchpadOpen: false,
  aboutOpen: false,
  viewport: { width: window.innerWidth, height: window.innerHeight },
  compact: window.innerHeight < COMPACT_HEIGHT,
  setBooted: (booted) => set({ booted }),
  setLaunchpadOpen: (launchpadOpen) => set({ launchpadOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setViewport: (width, height) =>
    set((s) =>
      s.viewport.width === width && s.viewport.height === height
        ? s
        : { viewport: { width, height }, compact: height < COMPACT_HEIGHT },
    ),
}))
