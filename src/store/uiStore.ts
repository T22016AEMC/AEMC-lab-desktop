import { create } from 'zustand'
import type { BackupFile, BackupSummary } from '../lib/backup'
import type { Size } from '../types'

/** 匯入存檔視窗：錯誤原因，或通過檢查、等使用者確認 */
export type ImportState = { kind: 'error'; message: string } | { kind: 'confirm'; backup: BackupFile; summary: BackupSummary; fileName: string }

interface UIState {
  booted: boolean
  /** 畫面下方的提示訊息；id 每次遞增，讓相同訊息也能重新計時 */
  toast: { id: number; message: string; ms?: number } | null
  launchpadOpen: boolean
  aboutOpen: boolean
  /** 領養視窗 */
  adoptOpen: boolean
  /** 建築模式：場景上顯示可購買的虛線空位 */
  buildMode: boolean
  /** 選單列 Logo 的下拉選單 */
  logoMenuOpen: boolean
  importState: ImportState | null
  /** 瀏覽器是否已授予持久儲存（null = 不支援或還不知道） */
  persisted: boolean | null
  viewport: Size
  setBooted: (v: boolean) => void
  /** ms：顯示多久（預設 2.8 秒） */
  showToast: (message: string, ms?: number) => void
  hideToast: () => void
  setLaunchpadOpen: (v: boolean) => void
  setAboutOpen: (v: boolean) => void
  setAdoptOpen: (v: boolean) => void
  setBuildMode: (v: boolean) => void
  setLogoMenuOpen: (v: boolean) => void
  setImportState: (v: ImportState | null) => void
  setPersisted: (v: boolean | null) => void
  setViewport: (width: number, height: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  booted: false,
  toast: null,
  launchpadOpen: false,
  aboutOpen: false,
  adoptOpen: false,
  buildMode: false,
  logoMenuOpen: false,
  importState: null,
  persisted: null,
  viewport: { width: window.innerWidth, height: window.innerHeight },
  setBooted: (booted) => set({ booted }),
  showToast: (message, ms) => set((s) => ({ toast: { id: (s.toast?.id ?? 0) + 1, message, ms } })),
  hideToast: () => set({ toast: null }),
  setLaunchpadOpen: (launchpadOpen) => set({ launchpadOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setAdoptOpen: (adoptOpen) => set({ adoptOpen }),
  setBuildMode: (buildMode) => set({ buildMode }),
  setLogoMenuOpen: (logoMenuOpen) => set({ logoMenuOpen }),
  setImportState: (importState) => set({ importState }),
  setPersisted: (persisted) => set({ persisted }),
  setViewport: (width, height) =>
    set((s) =>
      s.viewport.width === width && s.viewport.height === height
        ? s
        : { viewport: { width, height } },
    ),
}))
