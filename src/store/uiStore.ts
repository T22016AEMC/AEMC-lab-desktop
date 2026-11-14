import { create } from 'zustand'
import type { BackupFile, BackupSummary } from '../lib/backup'
import type { Size } from '../types'
import type { ToolId } from '../config/tools'

/** 匯入存檔視窗：錯誤原因，或通過檢查、等使用者確認 */
export type ImportState = { kind: 'error'; message: string } | { kind: 'confirm'; backup: BackupFile; summary: BackupSummary; fileName: string }

/**
 * 提示訊息的優先序（v3.6.0 起有佇列）：有新版本 > 事件 > 揭曉結果 > 每日獎勵 > 一般提示。
 * 較高的會立刻蓋過目前顯示的（被蓋過的重要提示排回佇列前面，等一下再顯示）；一般提示沿用舊行為（新的直接取代舊的）。
 * 事件的主要呈現是對話框（farm/ui/EventDialog），event 等級保留給需要用 Toast 補充說明的情況。
 */
export type ToastLevel = 'normal' | 'daily' | 'reveal' | 'event' | 'update'
const RANK: Record<ToastLevel, number> = { normal: 1, daily: 2, reveal: 3, event: 4, update: 5 }
/** 排隊太久的一般提示（動作回饋）過期就不顯示了 */
const NORMAL_STALE_MS = 3000
const QUEUE_MAX = 8

export interface ToastItem {
  id: number
  message: string
  ms?: number
  /** 優先序（數字越大越優先） */
  level: number
  at: number
}
let toastSeq = 0
const sortQueue = (q: ToastItem[]): ToastItem[] => [...q].sort((a, b) => b.level - a.level || a.at - b.at).slice(0, QUEUE_MAX)

interface UIState {
  booted: boolean
  /** 畫面下方的提示訊息；id 每次遞增，讓相同訊息也能重新計時 */
  toast: ToastItem | null
  /** 排隊等著顯示的提示（依優先序） */
  toastQueue: ToastItem[]
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
  /** ms：顯示多久（預設 2.8 秒）；level：優先序（預設一般提示） */
  showToast: (message: string, ms?: number, level?: ToastLevel) => void
  /** 收掉目前的提示，接著顯示佇列裡的下一則 */
  hideToast: () => void
  /** 收藏冊 */
  collectionOpen: boolean
  setCollectionOpen: (v: boolean) => void
  /** v3.7.0 工具包：目前開著的工具視窗（一次只開一個；null = 都沒開） */
  toolOpen: ToolId | null
  setToolOpen: (v: ToolId | null) => void
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
  toastQueue: [],
  collectionOpen: false,
  setCollectionOpen: (collectionOpen) => set({ collectionOpen }),
  toolOpen: null,
  // 開工具視窗時離開建築模式（Esc 只關工具視窗，不會同時離開建築模式）
  setToolOpen: (toolOpen) => set(toolOpen ? { toolOpen, buildMode: false } : { toolOpen }),
  launchpadOpen: false,
  aboutOpen: false,
  adoptOpen: false,
  buildMode: false,
  logoMenuOpen: false,
  importState: null,
  persisted: null,
  viewport: { width: window.innerWidth, height: window.innerHeight },
  setBooted: (booted) => set({ booted }),
  showToast: (message, ms, level = 'normal') =>
    set((s) => {
      const item: ToastItem = { id: ++toastSeq, message, ms, level: RANK[level], at: Date.now() }
      const cur = s.toast
      if (!cur) return { toast: item }
      // 比目前的優先序高：立刻蓋過；被蓋過的重要提示（每日獎勵以上）排回佇列
      if (item.level > cur.level) return { toast: item, toastQueue: sortQueue(cur.level >= RANK.daily ? [...s.toastQueue, cur] : s.toastQueue) }
      // 都是一般提示：沿用舊行為，新的直接取代舊的
      if (item.level === 1 && cur.level === 1) return { toast: item }
      return { toastQueue: sortQueue([...s.toastQueue, item]) }
    }),
  hideToast: () =>
    set((s) => {
      const now = Date.now()
      const q = s.toastQueue.filter((t) => t.level > 1 || now - t.at <= NORMAL_STALE_MS)
      return { toast: q[0] ?? null, toastQueue: q.slice(1) }
    }),
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
