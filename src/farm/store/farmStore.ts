import { create } from 'zustand'
import { BALANCE } from '../config/balance'
import { gameNow, worldHour, worldWeather } from '../overrides'
import { PICNIC_TEXT, endPicnic, picnicEndDue, settlePicnicOnLoad, startPicnic, type PicnicDecor, type PicnicEndReason } from '../sim/picnic'
import { LocalStorageAdapter, setNewerDataHandler } from '../save/storage'
import type { FarmLayout, Find, SaveData, SaveStorage } from '../save/types'
import { layoutItemDef } from '../config/layoutItems'
import { withoutRecord } from '../pixel/placement'
import { applySleepRecovery, buyBuilding, eatAtBowl } from '../sim/buildings'
import { adopt, execute, settlePlay, startPlay, wakeForDrag, type ActionId, type PlayToyId, type AdoptRequest, type Ctx, type FarmEffect } from '../sim/commands'
import { claimProgram, earningToday } from '../sim/earning'
import { claimDaily, collectGift, giftCandidates, newSave, registerGift, todayKey } from '../sim/points'
import { addFind, digCoinsToday, makeFindId, resultText, revealDue, revealFind, type EventNotice, type RevealOutcome } from '../sim/dig'
import { advanceSave } from '../sim/stats'
import { rehomePet } from '../sim/rehome'
import { useUIStore } from '../../store/uiStore'
import { addNote, deleteNote, updateNote } from '../../tools/notes'
import { TOOLS, type NoteColor } from '../../config/tools'

type NoteDraft = { title: string; body: string; color: NoteColor }
/** 公佈欄的資料存在養殖場存檔裡：還沒有存檔（還沒領養）時不能用 */
const NO_SAVE_FOR_NOTES = TOOLS.notes.noSaveMessage

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
  /** 載入時退還的已移除建築金幣（營火 20），給一次性對話框用；只在記憶體，不進存檔，0 = 沒有 */
  legacyRefund: number
  /** 還沒被畫面層消化的效果（浮字、動畫） */
  effects: FarmEffect[]
  /** 目前頭上有禮物、等著被點擊的寵物 id（不存檔） */
  gifts: string[]
  /** 等著顯示的事件對話框（不存檔；事件旗標已經寫進存檔，所以重新整理後不會再出現） */
  pendingEvents: EventNotice[]
  /** 儲存的資料來自比這份程式更新的版本：不讀、不覆寫，畫面提示重新整理 */
  newerData: boolean

  init: () => Promise<void>
  /** init 的實作（init 保證同一時間只跑一次） */
  initImpl: () => Promise<void>
  /** 領養（沒有存檔時建立新存檔，第一隻免費）。回傳錯誤訊息或 null */
  adoptPet: (req: Omit<AdoptRequest, 'free'>) => string | null
  runAction: (action: ActionId, petId: string) => string | null
  /** 玩耍開始（選了玩具）：扣金幣。playBlock = 引擎說現在不能玩的原因。回傳錯誤訊息或 null */
  startPlay: (petId: string, toy: PlayToyId, playBlock?: string | null, findCap?: number) => string | null
  /** 玩耍結算（撿回次數、留下的寶物數）：心情、體重、飽食度；0 次不動 */
  settlePlay: (petId: string, catches: number, toy: PlayToyId) => void
  /** 挖寶、尋寶：留下一個寶物（座標是草地範圍內的相對位置）；已滿回傳 false */
  addFind: (petId: string, kind: Find['kind'], fx: number, fy: number) => boolean
  /** 點開一個寶物：抽選、發金幣、記收藏、檢查事件，立刻寫入存檔。回傳結果（找不到 = null） */
  revealFind: (id: string) => RevealOutcome | null
  /** 到期（10 分鐘）的寶物自動揭曉 */
  revealDueNow: () => void
  /** 事件對話框按「確定」 */
  dismissEvent: () => void
  /** 睡覺中的寵物被拖起來：醒來（免費，規則同叫醒） */
  wakeForDrag: (petId: string) => void
  /**
   * 找新主人（v3.7.1）：寵物從存檔移除、返還金幣，立刻寫入。回傳錯誤訊息或 null。
   * 場景上的狀態（玩耍提前結算、座位、洗澡、拖曳、選取）要先由引擎的 removePet 處理，再呼叫這個
   */
  rehomePet: (petId: string) => string | null
  /** 週期性結算：數值下降、跨日的每日獎勵、睡覺的心情回復（atBuilding = 睡在建築旁的寵物 id） */
  tick: (atBuilding?: ReadonlySet<string>) => void
  /** 重置後的一次性提示按「確定」：清掉旗標並存檔 */
  dismissResetNotice: () => void
  dismissLegacyRefund: () => void
  /** 購買建築（扣金幣、紀錄、存檔）。回傳錯誤訊息或 null */
  /**
   * 購買建築。storeIt = true：預設位置被其他擺設佔住（畫面層用擺放規則判斷），買下後直接放進庫存（v3.9.0）；
   * 扣金幣、加進 ownedBuildings、寫入擺放紀錄在同一次存檔完成。
   */
  buyBuilding: (id: string, storeIt?: boolean) => string | null
  /** v3.9.0 擺設模式：寫入農場擺放（只記和預設不同的；全部預設 = 拿掉欄位），立刻存檔。不動 ownedBuildings */
  setFarmLayout: (layout: FarmLayout | undefined) => void
  /** v3.9.0 還原預設：有預設位置的物件全部回到預設位置；花槽、珊瑚、灌木、高草叢（沒有預設位置）收進庫存。已購買的建築不變 */
  restoreDefaultLayout: () => void
  /** 寵物在食盆吃一份（用掉今日份量、回復飽食度）。回傳錯誤訊息或 null */
  eatAtBowl: (petId: string) => string | null
  /** 從啟動台成功開啟使用者的程式：依冷卻與每日上限給金幣，回傳實際給的數量 */
  earnProgram: (appId: string) => number
  /** 週期性擲禮物 */
  rollGift: (rand?: () => number) => void
  collectGift: (petId: string) => void
  drainEffects: () => FarmEffect[]
  /** 公佈欄（v3.7.0）：新增、編輯、刪除便利貼，立刻寫進存檔（節流寫入）。回傳錯誤訊息或 null；沒有存檔時不能用 */
  addNote: (draft: NoteDraft) => string | null
  updateNote: (id: string, draft: NoteDraft) => string | null
  deleteNote: (id: string) => void
  /**
   * 野餐（v3.8.0）開始：participants = 引擎挑出來的寵物（場景上有空、數值符合）。次數 +1、參加的寵物清潔 −8、心情 +5，立刻寫入。
   * 回傳錯誤訊息或 null
   */
  startPicnic: (participants: readonly string[], decor: PicnicDecor) => string | null
  /** 野餐結束（時間到、下雨、天黑、寵物都離開）：冷卻從現在起算、顯示提示，立刻寫入。沒在野餐就不動 */
  endPicnic: (reason: PicnicEndReason) => void
  /** 通用的存檔修改入口（測試模式等使用） */
  mutate: (fn: (save: SaveData) => SaveData) => void
  resetAll: () => Promise<void>
}

/** 自動揭曉（離線或沒點的寶物到期）的一句話摘要：幾個、共得到幾金幣、幾件新寶物 */
function announceAuto(revealed: RevealOutcome[], save: SaveData, now: number): void {
  let coins = 0
  let fresh = 0
  for (const r of revealed) {
    if (r.result.kind === 'coin') coins += r.result.value
    else if (r.result.kind === 'item' && r.result.isNew) fresh++
  }
  const parts = [`${revealed.length} 個寶物到期，自動揭曉了`]
  if (coins > 0) parts.push(`+${coins} 金幣（今日 ${digCoinsToday(save, now).coins}/${digCoinsToday(save, now).max}）`)
  if (fresh > 0) parts.push(`${fresh} 件新寶物`)
  useUIStore.getState().showToast(parts.join('，'), 4200, 'reveal')
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
  legacyRefund: 0,
  effects: [],
  gifts: [],
  pendingEvents: [],
  newerData: false,

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
    const { save: loaded, reset, refund, newer } = await storage.loadOrReset(() => ({ ...newSave(now, todayKey(now)), resetNotice: true as const }))
    if (newer) {
      suspendSaves()
      set({ status: 'ready', save: null, newerData: true })
      return
    }
    if (reset === 'failed') {
      suspendSaves()
      set({ status: 'ready', save: null, resetFailed: true })
      return
    }
    if (!loaded) {
      set({ status: 'ready', save: null })
      return
    }
    // v3.8.0：重新整理、離線回來時還有進行中的野餐 → 直接結束（墊子不會出現、不補償；冷卻從離開網頁的時間起算）。要在補算數值（會更新 lastSeen）之前
    const hadPicnic = !!loaded.picnic?.active
    // 離開網站期間補算數值（下限 20），再看今天有沒有每日獎勵
    let save = advanceSave(settlePicnicOnLoad(loaded), now, true)
    const daily = claimDaily(save, todayKey(now))
    save = daily.save
    // 離線期間到期的寶物一次揭曉（揭曉後從清單拿掉，所以同一天載入多次不會重複結算）
    const due = revealDue(save, now, Math.random)
    save = due.save
    set({ status: 'ready', save, pendingEvents: due.notices })
    if (due.revealed.length) announceAuto(due.revealed, save, now)
    if (daily.claimed) useUIStore.getState().showToast(`每日登入獎勵 +${BALANCE.dailyBonus} 金幣`, undefined, 'daily')
    if (refund) set({ legacyRefund: refund })
    if (hadPicnic) flushSave()
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

  startPlay: (petId, toy, playBlock, findCap) => {
    const save = get().save
    if (!save) return '尚未開始'
    const r = startPlay(save, { ...ctxNow(), playBlock, findCap }, petId, toy)
    if (r.error) return r.error
    set({ save: r.save })
    return null
  },

  settlePlay: (petId, catches, toy) => {
    const save = get().save
    if (!save) return
    const r = settlePlay(save, ctxNow(), petId, catches, toy)
    if (r.save !== save) set((s) => ({ save: r.save, effects: [...s.effects, ...r.effects] }))
  },

  addFind: (petId, kind, fx, fy) => {
    const save = get().save
    const pet = save?.pets.find((p) => p.id === petId)
    if (!save || !pet) return false
    const now = gameNow()
    const find: Find = { id: makeFindId(now, Math.random), kind, by: pet.species, fx, fy, at: now }
    const next = addFind(save, find)
    if (!next) return false
    set({ save: next })
    return true
  },

  revealFind: (id) => {
    const save = get().save
    if (!save) return null
    const now = gameNow()
    const out = revealFind(save, id, now, Math.random)
    if (!out) return null
    set((s) => ({ save: out.save, pendingEvents: [...s.pendingEvents, ...out.notices] }))
    useUIStore.getState().showToast(resultText(out.result, out.result.kind === 'coin' ? digCoinsToday(out.save, now) : undefined), undefined, 'reveal')
    flushSave() // 揭曉後立刻寫入（不等節流）
    return out
  },

  revealDueNow: () => {
    const save = get().save
    if (!save || save.finds.length === 0) return
    const now = gameNow()
    const due = revealDue(save, now, Math.random)
    if (due.revealed.length === 0) return
    set((s) => ({ save: due.save, pendingEvents: [...s.pendingEvents, ...due.notices] }))
    announceAuto(due.revealed, due.save, now)
    flushSave()
  },

  dismissEvent: () => set((s) => ({ pendingEvents: s.pendingEvents.slice(1) })),

  wakeForDrag: (petId) => {
    const save = get().save
    if (!save) return
    const r = wakeForDrag(save, ctxNow(), petId)
    if (r.save !== save) set((s) => ({ save: r.save, effects: [...s.effects, ...r.effects] }))
  },

  rehomePet: (petId) => {
    const save = get().save
    if (!save) return '尚未開始'
    const r = rehomePet(save, petId)
    if (r.error) return r.error
    // 頭上的禮物、還沒消化的浮字與動畫都跟著拿掉（禮物的每日次數已經算過，不退）
    set((s) => ({ save: r.save, gifts: s.gifts.filter((g) => g !== petId), effects: s.effects.filter((e) => e.petId !== petId) }))
    flushSave() // 無法找回的操作：立刻寫入（不等節流）
    return null
  },

  tick: (atBuilding = NO_PETS) => {
    const save = get().save
    if (!save) return
    const now = gameNow()
    // 睡覺的心情回復只算線上即時的這一小段（最多 2 分鐘，背景分頁被節流也不會一次補很多）
    const elapsedSec = Math.min(120, Math.max(0, (now - save.lastSeen) / 1000))
    let next = advanceSave(save, now, false)
    next = applySleepRecovery(next, { nowMs: now, hour: worldHour(now) }, elapsedSec, atBuilding)
    const daily = claimDaily(next, todayKey(now))
    next = daily.save
    if (daily.claimed) useUIStore.getState().showToast(`每日登入獎勵 +${BALANCE.dailyBonus} 金幣`, undefined, 'daily')
    if (next !== save) set({ save: next })
    // v3.8.0：野餐時間到、下雨、天黑 → 結束（主迴圈每個影格也會檢查；這裡是分頁被蓋住或在背景時的備援）
    const due = picnicEndDue(next, { nowMs: now, hour: worldHour(now), weather: worldWeather(now) })
    if (due) get().endPicnic(due)
    // 到期（10 分鐘）的寶物自動揭曉
    get().revealDueNow()
  },

  startPicnic: (participants, decor) => {
    const save = get().save
    if (!save) return PICNIC_TEXT.noSave
    const now = gameNow()
    const r = startPicnic(save, { nowMs: now, hour: worldHour(now), weather: worldWeather(now) }, participants, decor)
    if (r.error) return r.error
    set((s) => ({ save: r.save, effects: [...s.effects, ...r.effects] }))
    flushSave()
    return null
  },

  endPicnic: (reason) => {
    const save = get().save
    if (!save?.picnic?.active) return
    set({ save: endPicnic(save, gameNow()) })
    flushSave()
    const msg = reason === 'rain' ? PICNIC_TEXT.endRain : reason === 'night' ? PICNIC_TEXT.endNight : reason === 'empty' ? PICNIC_TEXT.endEmpty : reason === 'resize' ? PICNIC_TEXT.endResize : PICNIC_TEXT.endTime
    useUIStore.getState().showToast(msg, 3200)
  },

  dismissLegacyRefund: () => set({ legacyRefund: 0 }),

  dismissResetNotice: () => {
    const save = get().save
    if (!save?.resetNotice) return
    const { resetNotice: _drop, ...rest } = save
    void _drop
    set({ save: rest })
  },

  buyBuilding: (id, storeIt = false) => {
    const save = get().save
    if (!save) return '尚未開始'
    const r = buyBuilding(save, id)
    if (r.error) return r.error
    let next = r.save
    // 存檔裡這棟（還沒買的）建築以前殘留的擺放紀錄一律忽略：不論放不放進倉庫，都從預設位置規則重新來
    const kept = withoutRecord(next.farmLayout, id)
    if (kept !== next.farmLayout) {
      next = { ...next }
      if (kept) next.farmLayout = kept
      else delete next.farmLayout
    }
    if (storeIt) {
      const def = layoutItemDef(id)
      if (def) next = { ...next, farmLayout: { items: [...(next.farmLayout?.items ?? []), { id, kind: def.kind, state: 'stored' }] } }
    }
    set({ save: next })
    flushSave()
    return null
  },

  setFarmLayout: (layout) => {
    const save = get().save
    if (!save) return
    const next: SaveData = { ...save }
    if (layout && layout.items.length > 0) next.farmLayout = { items: layout.items.map((it) => ({ ...it })) }
    else delete next.farmLayout
    set({ save: next })
    flushSave()
  },

  restoreDefaultLayout: () => get().setFarmLayout(undefined),

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

  addNote: (draft) => {
    const save = get().save
    if (!save) return NO_SAVE_FOR_NOTES
    const r = addNote(save.notes ?? [], draft, Date.now())
    if (!r.ok) return r.error
    set({ save: { ...save, notes: r.notes } })
    return null
  },

  updateNote: (id, draft) => {
    const save = get().save
    if (!save) return NO_SAVE_FOR_NOTES
    const r = updateNote(save.notes ?? [], id, draft, Date.now())
    if (!r.ok) return r.error
    set({ save: { ...save, notes: r.notes } })
    return null
  },

  deleteNote: (id) => {
    const save = get().save
    if (!save) return
    set({ save: { ...save, notes: deleteNote(save.notes ?? [], id) } })
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
// 儲存的資料來自更新的版本（例如另一個分頁已經是新版）：不覆寫，停止自動存檔並提示重新整理
setNewerDataHandler(() => {
  if (useFarmStore.getState().newerData) return
  suspendSaves()
  useFarmStore.setState({ newerData: true })
  useUIStore.getState().showToast('存檔來自更新的版本，這個分頁不會覆寫它，請重新整理網頁', 10000, 'update')
})
window.addEventListener('beforeunload', flush)
document.addEventListener('visibilitychange', () => document.hidden && flush())
