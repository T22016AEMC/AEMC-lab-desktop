import { BALANCE } from '../config/balance'
import type { Pet, PicnicActive, PicnicState, SaveData } from '../save/types'
import { applyDelta, type FarmEffect } from './commands'
import { isSleeping } from './rules'
import { todayKey } from './points'
import { isSleepTime, phaseOf, type Weather } from './worldTime'

/**
 * 野餐（v3.8.0，純函式，可在 Node 測試）：開始條件、每日次數與冷卻、參加者的清潔與心情、結束與載入時的處理。
 * 場景上的部分（墊子飛下來、寵物走過去坐著、拍照）在 pixel/picnic.ts 與 engine；這裡只管存檔。
 * 時間一律由呼叫端從遊戲時間來源傳入（gameNow），每日次數以本機日期 00:00 切日（和每日獎勵、食盆份量相同）。
 */

export interface PicnicCtx {
  nowMs: number
  hour: number
  weather: Weather
}

export const PICNIC_TEXT = {
  rain: '下雨了，不能野餐',
  night: '天黑了，明天再野餐',
  dailyMax: `今天已經野餐 ${BALANCE.picnic.dailyMax} 次了，明天再來`,
  active: '正在野餐中',
  noSave: '先領養寵物才能野餐',
  nobody: '沒有寵物可以參加（要醒著、心情不差、清潔度 20 以上）',
  busy: '寵物們現在都在忙，等一下再野餐',
  endTime: '野餐結束了',
  endRain: '下雨了，野餐提前結束',
  endNight: '天黑了，野餐提前結束',
  endEmpty: '寵物都離開了，野餐結束',
  // v3.9.0：場景固定，放不下墊子的原因只會是擺設太多（v4.0 起文字改成「擺設太多」，不提示放大視窗）
  endResize: '擺設太多，放不下野餐墊，野餐提前結束',
  noRoom: '擺設太多，放不下野餐墊，請收起一些擺設',
} as const

/** 冷卻中的提示（剩幾分幾秒） */
export const cooldownText = (ms: number): string => `野餐完要休息一下（還要 ${formatMmSs(ms)}）`

export function formatMmSs(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 白天才能野餐：不是夜晚（19:30～5:00），也不是睡覺時間（23:00～6:00）→ 實際是 6:00～19:30 */
export function isPicnicDaytime(hour: number): boolean {
  return phaseOf(hour) !== 'night' && !isSleepTime(hour)
}

/** 今天的野餐進度：已野餐幾次、還剩幾次、冷卻還剩多久（毫秒，0 = 沒有）、是否正在野餐 */
export function picnicToday(save: Pick<SaveData, 'picnic'>, nowMs: number): { count: number; left: number; cooldownMs: number; active: boolean } {
  const p = save.picnic
  const count = p && p.date === todayKey(nowMs) ? p.count : 0
  const cooldownMs = p && !p.active && p.lastEnd > 0 ? Math.max(0, p.lastEnd + BALANCE.picnic.cooldownMs - nowMs) : 0
  return { count, left: Math.max(0, BALANCE.picnic.dailyMax - count), cooldownMs, active: !!p?.active }
}

/** 這隻寵物的數值與狀態符合參加條件嗎（醒著、心情不差、清潔夠）。場景上的狀態（拖曳、洗澡、玩耍、座位）由引擎另外判斷 */
export function picnicEligible(pet: Pet, ctx: Pick<PicnicCtx, 'nowMs' | 'hour'>): boolean {
  if (isSleeping(pet, ctx.hour, ctx.nowMs)) return false
  return pet.mood >= BALANCE.picnic.minMood && pet.cleanliness >= BALANCE.picnic.minCleanliness
}

/** 現在不能開始野餐的原因（按鈕停用時顯示）；可以 = null。順序：沒有存檔 → 進行中 → 下雨 → 夜晚 → 今天次數用完 → 冷卻 → 沒有符合條件的寵物 */
export function picnicBlock(save: SaveData | null, ctx: PicnicCtx): string | null {
  if (!save || save.pets.length === 0) return PICNIC_TEXT.noSave
  const t = picnicToday(save, ctx.nowMs)
  if (t.active) return PICNIC_TEXT.active
  if (ctx.weather === 'rain') return PICNIC_TEXT.rain
  if (!isPicnicDaytime(ctx.hour)) return PICNIC_TEXT.night
  if (t.left <= 0) return PICNIC_TEXT.dailyMax
  if (t.cooldownMs > 0) return cooldownText(t.cooldownMs)
  if (!save.pets.some((p) => picnicEligible(p, ctx))) return PICNIC_TEXT.nobody
  return null
}

export interface PicnicDecor {
  mat: number
  basket: number
  foods: number[]
}

/** 墊子顏色（紅、藍、粉）、籃子（闔上、打開）、食物 1～2 樣（4 種裡不重複地挑）都隨機 */
export function rollDecor(rand: () => number = Math.random): PicnicDecor {
  const pick = (n: number): number => Math.min(n - 1, Math.floor(rand() * n))
  const mat = pick(3)
  const basket = pick(2)
  const n = 1 + pick(2)
  const pool = [0, 1, 2, 3]
  const foods: number[] = []
  for (let i = 0; i < n; i++) foods.push(pool.splice(pick(pool.length), 1)[0])
  return { mat, basket, foods }
}

export interface PicnicStartResult {
  save: SaveData
  effects: FarmEffect[]
  error?: string
}

/**
 * 開始野餐：participants = 引擎挑出來的寵物 id（場景上有空的、數值符合的；最多 6 隻）。
 * 次數 +1（今天）、記下進行中的那一場；每隻參加的寵物清潔 −8、心情 +5（只在這裡算一次）、上次互動 = 現在。不收金幣。
 */
export function startPicnic(save: SaveData, ctx: PicnicCtx, participants: readonly string[], decor: PicnicDecor): PicnicStartResult {
  const why = picnicBlock(save, ctx)
  if (why) return { save, effects: [], error: why }
  const ids = participants.filter((id) => {
    const p = save.pets.find((q) => q.id === id)
    return !!p && picnicEligible(p, ctx)
  })
  if (ids.length === 0) return { save, effects: [], error: PICNIC_TEXT.busy }
  const b = BALANCE.picnic
  const effects: FarmEffect[] = []
  const pets = save.pets.map((p) => {
    if (!ids.includes(p.id)) return p
    const r = applyDelta({ ...p, lastInteract: ctx.nowMs }, { cleanliness: b.cleanliness, mood: b.mood })
    effects.push(...r.floats)
    return r.pet
  })
  const t = picnicToday(save, ctx.nowMs)
  const active: PicnicActive = { startedAt: ctx.nowMs, until: ctx.nowMs + b.seconds * 1000, pets: [...ids], mat: decor.mat, basket: decor.basket, foods: [...decor.foods] }
  const picnic: PicnicState = { date: todayKey(ctx.nowMs), count: t.count + 1, lastEnd: save.picnic?.lastEnd ?? 0, active }
  return { save: { ...save, pets, picnic }, effects }
}

export type PicnicEndReason = 'time' | 'rain' | 'night' | 'empty' | 'resize' | 'reload'

/** 結束野餐（時間到、下雨、天黑、寵物都離開、重新整理）：拿掉進行中的那一場、冷卻從 endMs 起算。沒在野餐就不動 */
export function endPicnic(save: SaveData, endMs: number): SaveData {
  const p = save.picnic
  if (!p?.active) return save
  const { active, ...rest } = p
  void active
  return { ...save, picnic: { ...rest, lastEnd: endMs } }
}

/** 進行中的野餐現在該不該結束（時間到、下雨、天黑）；不用結束 = null。「寵物都離開了」由引擎判斷 */
export function picnicEndDue(save: SaveData, ctx: PicnicCtx): PicnicEndReason | null {
  const a = save.picnic?.active
  if (!a) return null
  if (ctx.nowMs >= a.until) return 'time'
  if (ctx.weather === 'rain') return 'rain'
  if (!isPicnicDaytime(ctx.hour)) return 'night'
  return null
}

/**
 * 載入存檔時（重新整理、離線回來、匯入備份）還有進行中的野餐：一律直接結束、墊子不會出現；不補償、不退次數（次數在開始時就算過了）。
 * 結束時間 = 「離開網頁的時間（lastSeen）」和「預定結束時間」較早的那個（不早於開始時間），冷卻從那時起算。
 */
export function settlePicnicOnLoad(save: SaveData): SaveData {
  const a = save.picnic?.active
  if (!a) return save
  return endPicnic(save, Math.max(a.startedAt, Math.min(a.until, save.lastSeen)))
}
