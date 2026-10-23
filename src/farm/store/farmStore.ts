import { create } from 'zustand'
import { BALANCE } from '../config/balance'
import { worldHour } from '../overrides'
import { takeMigrationNotice } from '../save/migrate'
import { LocalStorageAdapter } from '../save/storage'
import type { SaveData, SaveStorage } from '../save/types'
import { adopt, execute, wakeForDrag, type ActionId, type AdoptRequest, type Ctx, type FarmEffect } from '../sim/commands'
import { claimDaily, collectGift, giftCandidates, newSave, registerGift, todayKey } from '../sim/points'
import { advanceSave } from '../sim/stats'
import { useUIStore } from '../../store/uiStore'

/** 儲存層：目前是瀏覽器 localStorage，之後可換成綁定帳號的雲端存檔 */
let storage: SaveStorage = new LocalStorageAdapter()
export function setSaveStorage(next: SaveStorage): void {
  storage = next
}
export function getSaveStorage(): SaveStorage {
  return storage
}

interface FarmState {
  status: 'loading' | 'ready'
  save: SaveData | null
  /** 還沒被畫面層消化的效果（浮字、動畫） */
  effects: FarmEffect[]
  /** 目前頭上有禮物、等著被點擊的寵物 id（不存檔） */
  gifts: string[]

  init: () => Promise<void>
  /** 領養（沒有存檔時建立新存檔，第一隻免費）。回傳錯誤訊息或 null */
  adoptPet: (req: Omit<AdoptRequest, 'free'>) => string | null
  runAction: (action: ActionId, petId: string) => string | null
  /** 睡覺中的寵物被拖起來：醒來（免費，規則同叫醒） */
  wakeForDrag: (petId: string) => void
  /** 週期性結算：數值下降、跨日的每日獎勵 */
  tick: () => void
  /** 週期性擲禮物 */
  rollGift: (rand?: () => number) => void
  collectGift: (petId: string) => void
  drainEffects: () => FarmEffect[]
  /** 通用的存檔修改入口（測試模式等使用） */
  mutate: (fn: (save: SaveData) => SaveData) => void
  resetAll: () => Promise<void>
}

const ctxNow = (): Ctx => {
  const nowMs = Date.now()
  return { nowMs, hour: worldHour(nowMs) }
}

export const useFarmStore = create<FarmState>((set, get) => ({
  status: 'loading',
  save: null,
  effects: [],
  gifts: [],

  init: async () => {
    const loaded = await storage.load()
    const now = Date.now()
    const notice = takeMigrationNotice()
    if (notice) {
      useUIStore.getState().showToast('海洋已經取消，' + notice.removed + ' 隻海洋生物已移除，退還 ' + notice.refunded + ' 點')
      // 升級後的存檔立刻寫回，避免下次讀到舊格式又退一次
      if (loaded) void storage.save(loaded)
    }
    if (!loaded) {
      set({ status: 'ready', save: null })
      return
    }
    // 離開網站期間補算數值（下限 20），再看今天有沒有每日獎勵
    let save = advanceSave(loaded, now, true)
    const daily = claimDaily(save, todayKey(now))
    save = daily.save
    set({ status: 'ready', save })
    if (daily.claimed) useUIStore.getState().showToast(`每日登入獎勵 +5 點`)
  },

  adoptPet: (req) => {
    const c = ctxNow()
    const existing = get().save
    const isFirst = existing === null
    const base = existing ?? newSave(c.nowMs, todayKey(c.nowMs))
    const r = adopt(base, c, { ...req, free: isFirst })
    if (r.error) return r.error
    set({ save: r.save })
    return null
  },

  runAction: (action, petId) => {
    const save = get().save
    if (!save) return '尚未開始'
    const r = execute(save, ctxNow(), action, petId)
    if (r.error) return r.error
    set((s) => ({ save: r.save, effects: [...s.effects, ...r.effects] }))
    return null
  },

  wakeForDrag: (petId) => {
    const save = get().save
    if (!save) return
    const r = wakeForDrag(save, ctxNow(), petId)
    if (r.save !== save) set((s) => ({ save: r.save, effects: [...s.effects, ...r.effects] }))
  },

  tick: () => {
    const save = get().save
    if (!save) return
    const now = Date.now()
    let next = advanceSave(save, now, false)
    const daily = claimDaily(next, todayKey(now))
    next = daily.save
    if (daily.claimed) useUIStore.getState().showToast('每日登入獎勵 +5 點')
    if (next !== save) set({ save: next })
  },

  rollGift: (rand = Math.random) => {
    const { save, gifts } = get()
    if (!save) return
    const today = todayKey(Date.now())
    const candidates = giftCandidates(save, today).filter((id) => !gifts.includes(id))
    if (candidates.length === 0 || rand() >= BALANCE.gift.chancePerMinute) return
    const id = candidates[Math.floor(rand() * candidates.length)]
    set({ save: registerGift(save, today), gifts: [...gifts, id] })
  },

  collectGift: (petId) => {
    const { save, gifts } = get()
    if (!save || !gifts.includes(petId)) return
    const r = collectGift(save)
    set((s) => ({
      save: r.save,
      gifts: s.gifts.filter((g) => g !== petId),
      effects: [...s.effects, { kind: 'float', petId, text: `+${r.points} 點`, tone: 'good' }],
    }))
  },

  drainEffects: () => {
    const e = get().effects
    if (e.length) set({ effects: [] })
    return e
  },

  mutate: (fn) => {
    const save = get().save
    if (save) set({ save: fn(save) })
  },

  resetAll: async () => {
    await storage.clear()
    set({ save: null, effects: [], gifts: [], status: 'ready' })
  },
}))

// 存檔有變化時節流寫入；離開頁面時立刻寫一次
let saveTimer: number | undefined
let lastSaved: SaveData | null = null
function flush(): void {
  window.clearTimeout(saveTimer)
  saveTimer = undefined
  const s = useFarmStore.getState().save
  if (s && s !== lastSaved) {
    lastSaved = s
    void storage.save(s)
  }
}
useFarmStore.subscribe((state, prev) => {
  if (state.save === prev.save) return
  if (state.save === null) {
    lastSaved = null
    window.clearTimeout(saveTimer)
    saveTimer = undefined
    return
  }
  if (saveTimer === undefined) saveTimer = window.setTimeout(flush, BALANCE.saveDebounceMs)
})
window.addEventListener('beforeunload', flush)
document.addEventListener('visibilitychange', () => document.hidden && flush())
