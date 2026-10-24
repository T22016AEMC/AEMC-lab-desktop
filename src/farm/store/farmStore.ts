import { create } from 'zustand'
import { BALANCE } from '../config/balance'
import { gameNow, worldHour } from '../overrides'
import { LocalStorageAdapter } from '../save/storage'
import type { SaveData, SaveStorage } from '../save/types'
import { applyMoodGains, applySleepRecovery, buyBuilding, eatAtBowl } from '../sim/buildings'
import { adopt, execute, wakeForDrag, type ActionId, type AdoptRequest, type Ctx, type FarmEffect } from '../sim/commands'
import { claimGame, claimProgram, earningToday, type GameResult } from '../sim/earning'
import { claimDaily, collectGift, giftCandidates, newSave, registerGift, todayKey } from '../sim/points'
import { advanceSave } from '../sim/stats'
import { useUIStore } from '../../store/uiStore'

/** 儲存層：目前是瀏覽器 localStorage，之後可換成綁定帳號的雲端存檔 */
let storage: SaveStorage = new LocalStorageAdapter()
export function setSaveStorage(next: SaveStorage): void {
  storage = next
}
const NO_PETS: ReadonlySet<string> = new Set()
export function getSaveStorage(): SaveStorage {
  return storage
}

interface FarmState {
  status: 'loading' | 'ready'
  save: SaveData | null
  /** 重置寫入失敗（瀏覽器空間不足）：舊存檔沒有被改動，畫面顯示說明、不能領養，下次載入重試 */
  resetFailed: boolean
  /** 還沒被畫面層消化的效果（浮字、動畫） */
  effects: FarmEffect[]
  /** 目前頭上有禮物、等著被點擊的寵物 id（不存檔） */
  gifts: string[]

  init: () => Promise<void>
  /** init 的實作（init 保證同一時間只跑一次） */
  initImpl: () => Promise<void>
  /** 領養（沒有存檔時建立新存檔，第一隻免費）。回傳錯誤訊息或 null */
  adoptPet: (req: Omit<AdoptRequest, 'free'>) => string | null
  runAction: (action: ActionId, petId: string) => string | null
  /** 睡覺中的寵物被拖起來：醒來（免費，規則同叫醒） */
  wakeForDrag: (petId: string) => void
  /** 週期性結算：數值下降、跨日的每日獎勵、睡覺的心情回復（atBuilding = 睡在建築旁的寵物 id） */
  tick: (atBuilding?: ReadonlySet<string>, moodGains?: ReadonlyMap<string, number>) => void
  /** 重置後的一次性提示按「確定」：清掉旗標並存檔 */
  dismissResetNotice: () => void
  /** 購買建築（扣金幣、紀錄、存檔）。回傳錯誤訊息或 null */
  buyBuilding: (id: string) => string | null
  /** 寵物在食盆吃一份（用掉今日份量、回復飽食度）。回傳錯誤訊息或 null */
  eatAtBowl: (petId: string) => string | null
  /** 從啟動台成功開啟使用者的程式：依冷卻與每日上限給金幣，回傳實際給的數量 */
  earnProgram: (appId: string) => number
  /** 一局遊戲結束：達標才給金幣，回傳實際給的數量 */
  earnGame: (gameId: string, result: GameResult) => number
  /** 週期性擲禮物 */
  rollGift: (rand?: () => number) => void
  collectGift: (petId: string) => void
  drainEffects: () => FarmEffect[]
  /** 通用的存檔修改入口（測試模式等使用） */
  mutate: (fn: (save: SaveData) => SaveData) => void
  resetAll: () => Promise<void>
}

const ctxNow = (): Ctx => {
  const nowMs = gameNow()
  return { nowMs, hour: worldHour(nowMs) }
}

let initPromise: Promise<void> | null = null
const runInit = (): Promise<void> => useFarmStore.getState().initImpl()

export const useFarmStore = create<FarmState>((set, get) => ({
  status: 'loading',
  save: null,
  resetFailed: false,
  effects: [],
  gifts: [],

  init: () => {
    // 開發模式的 StrictMode 會呼叫兩次：同一時間只跑一次（否則兩次載入、兩次重置檢查會各自更新存檔，畫面上的提醒計時被打斷）
    initPromise ??= runInit().finally(() => {
      initPromise = null
    })
    return initPromise
  },

  initImpl: async () => {
    const now = gameNow()
    // v3.4.0 一次性重置：schema 4 以下的舊存檔在這裡換成全新存檔（已備份）；寫入失敗就不動舊存檔、這次不能用養殖場，下次載入重試
    const { save: loaded, reset } = await storage.loadOrReset(() => ({ ...newSave(now, todayKey(now)), resetNotice: true as const }))
    if (reset === 'failed') {
      suspendSaves()
      set({ status: 'ready', save: null, resetFailed: true })
      return
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
    if (daily.claimed) useUIStore.getState().showToast(`每日登入獎勵 +${BALANCE.dailyBonus} 金幣`)
  },

  adoptPet: (req) => {
    const c = ctxNow()
    const existing = get().save
    // 沒有存檔、或重置後還沒有寵物：第一隻免費
    const isFirst = existing === null || existing.pets.length === 0
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

  tick: (atBuilding = NO_PETS, moodGains) => {
    const save = get().save
    if (!save) return
    const now = gameNow()
    // 睡覺的心情回復只算線上即時的這一小段（最多 2 分鐘，背景分頁被節流也不會一次補很多）
    const elapsedSec = Math.min(120, Math.max(0, (now - save.lastSeen) / 1000))
    let next = advanceSave(save, now, false)
    next = applySleepRecovery(next, { nowMs: now, hour: worldHour(now) }, elapsedSec, atBuilding)
    if (moodGains?.size) next = applyMoodGains(next, moodGains)
    const daily = claimDaily(next, todayKey(now))
    next = daily.save
    if (daily.claimed) useUIStore.getState().showToast(`每日登入獎勵 +${BALANCE.dailyBonus} 金幣`)
    if (next !== save) set({ save: next })
  },

  dismissResetNotice: () => {
    const save = get().save
    if (!save?.resetNotice) return
    const { resetNotice: _drop, ...rest } = save
    void _drop
    set({ save: rest })
  },

  buyBuilding: (id) => {
    const save = get().save
    if (!save) return '尚未開始'
    const r = buyBuilding(save, id)
    if (r.error) return r.error
    set({ save: r.save })
    return null
  },

  eatAtBowl: (petId) => {
    const save = get().save
    if (!save) return '尚未開始'
    const r = eatAtBowl(save, ctxNow(), petId)
    if (r.error) return r.error
    set((s) => ({ save: r.save, effects: [...s.effects, ...r.effects.filter((e) => e.kind === 'float')] }))
    return null
  },

  earnProgram: (appId) => {
    const save = get().save
    if (!save) return 0
    const now = gameNow()
    const r = claimProgram(save, appId, now)
    if (r.save !== save) set({ save: r.save })
    if (r.coins > 0) {
      const p = earningToday(r.save, now)
      useUIStore.getState().showToast(`+${r.coins} 金幣（今日 ${p.programCoins}/${p.programMax}）`)
    }
    return r.coins
  },

  earnGame: (gameId, result) => {
    const save = get().save
    if (!save) return 0
    const now = gameNow()
    const r = claimGame(save, gameId, result, now)
    if (r.save !== save) set({ save: r.save })
    if (r.coins > 0) {
      const p = earningToday(r.save, now)
      useUIStore.getState().showToast(`+${r.coins} 金幣（今日 ${p.gameCoins}/${p.gameMax}）`)
    }
    return r.coins
  },

  rollGift: (rand = Math.random) => {
    const { save, gifts } = get()
    if (!save) return
    const today = todayKey(gameNow())
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
      effects: [...s.effects, { kind: 'float', petId, text: `+${r.points} 金幣`, tone: 'good' }],
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
/** 匯入存檔後要重新整理網頁：停止自動寫入，否則離開頁面時會把記憶體裡的舊存檔寫回去、蓋掉剛匯入的 */
let savesSuspended = false
export function suspendSaves(): void {
  savesSuspended = true
  window.clearTimeout(saveTimer)
  saveTimer = undefined
}

/** 立刻把待寫入的存檔寫進儲存層（匯出前呼叫，確保匯出的是最新的） */
export function flushSave(): void {
  flush()
}

function flush(): void {
  if (savesSuspended) return
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
