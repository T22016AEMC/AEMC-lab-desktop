import { BALANCE } from '../config/balance'
import { buildingDef, isPurchasable } from '../config/buildings'
import type { SaveData } from '../save/types'
import { applyDelta, replacePet, type Ctx, type FarmEffect } from './commands'
import { isSleeping } from './rules'
import { todayKey } from './points'

/** 建築的購買、食盆份量與睡覺回復（純函式，可在 Node 測試）。時間一律由呼叫端從遊戲時間來源傳入 */

export interface BuyResult {
  save: SaveData
  error?: string
}

/** 購買建築：只能買本版開放的、還沒買過的，金幣要夠。建築出現在哪個空位由版面決定，這裡只管紀錄與扣金幣 */
export function buyBuilding(save: SaveData, id: string): BuyResult {
  const def = buildingDef(id)
  if (!def || !isPurchasable(id)) return { save, error: '這個建築還沒開放' }
  if (save.ownedBuildings.includes(id)) return { save, error: `已經買過${def.name}了` }
  if (save.points < def.price) return { save, error: `金幣不足（需要 ${def.price} 金幣，目前 ${save.points} 金幣）` }
  return { save: { ...save, points: save.points - def.price, ownedBuildings: [...save.ownedBuildings, id] } }
}

/** 食盆今天還剩幾份（本地日期 00:00 補滿；沒買食盆就是 0） */
export function bowlLeft(save: SaveData, nowMs: number): number {
  if (!save.ownedBuildings.includes('bowls')) return 0
  const used = save.bowl.date === todayKey(nowMs) ? save.bowl.used : 0
  return Math.max(0, BALANCE.buildings.bowls.portionsPerDay - used)
}

export interface EatResult {
  save: SaveData
  effects: FarmEffect[]
  error?: string
}

/**
 * 寵物在食盆吃一份：用掉今日 1 份、飽食度回復 BALANCE.buildings.bowls.satiety。不扣金幣，
 * 和手動「餵食」（−1 金幣、+20）並存。睡覺中、份量用完時不能吃。
 */
export function eatAtBowl(save: SaveData, ctx: Ctx, petId: string): EatResult {
  const fail = (error: string): EatResult => ({ save, effects: [], error })
  const pet = save.pets.find((p) => p.id === petId)
  if (!pet) return fail('找不到這隻寵物')
  if (bowlLeft(save, ctx.nowMs) <= 0) return fail('食盆今天空了')
  if (isSleeping(pet, ctx.hour, ctx.nowMs)) return fail('正在睡覺')
  const today = todayKey(ctx.nowMs)
  const used = save.bowl.date === today ? save.bowl.used : 0
  const r = applyDelta(pet, { satiety: BALANCE.buildings.bowls.satiety })
  return { save: { ...replacePet(save, r.pet), bowl: { date: today, used: used + 1 } }, effects: [{ kind: 'anim', petId, anim: 'eat' }, ...r.floats] }
}

/**
 * 睡覺中的心情回復（每次結算約 10 秒，只在線上即時算）：一般睡覺每小時 +base，
 * 睡在狗窩／貓跳台旁邊乘以 buildingMul。atBuilding = 目前睡在建築旁的寵物 id。
 */
export function applySleepRecovery(save: SaveData, ctx: Ctx, elapsedSec: number, atBuilding: ReadonlySet<string>): SaveData {
  if (elapsedSec <= 0) return save
  let changed = false
  const pets = save.pets.map((p) => {
    if (!isSleeping(p, ctx.hour, ctx.nowMs) || p.mood >= 100) return p
    const rate = BALANCE.sleepMood.base * (atBuilding.has(p.id) ? BALANCE.sleepMood.buildingMul : 1)
    changed = true
    return { ...p, mood: Math.min(100, p.mood + (rate * elapsedSec) / 3600) }
  })
  return changed ? { ...save, pets } : save
}
