import { BALANCE } from '../config/balance'
import type { Pet, SaveData } from '../save/types'

export type Stage = 'young' | 'adult'

export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

export const clamp100 = (v: number): number => Math.min(100, Math.max(0, v))

/**
 * 結算一隻寵物經過 elapsedMs 之後的數值。
 * offline 為 true（離開網站期間補算）時，數值最低不會被拉到 20 以下
 * （原本就低於 20 的維持原值，不再往下掉）。
 */
export function advancePet(pet: Pet, elapsedMs: number, offline: boolean): Pet {
  if (elapsedMs <= 0) return pet
  const hours = elapsedMs / HOUR_MS
  const d = BALANCE.decayPerHour
  const hungry = pet.satiety < BALANCE.lowThreshold
  const moodRate = d.mood * (hungry ? 1 + BALANCE.moodExtraDecayWhenHungry : 1)

  const drop = (value: number, rate: number): number => {
    const next = value - rate * hours
    if (!offline) return clamp100(next)
    return clamp100(Math.max(next, Math.min(value, BALANCE.offlineFloor)))
  }

  return {
    ...pet,
    satiety: drop(pet.satiety, d.satiety),
    mood: drop(pet.mood, moodRate),
    cleanliness: drop(pet.cleanliness, d.cleanliness),
  }
}

/** 把整份存檔的所有寵物結算到 nowMs，並更新 lastSeen。時鐘倒退時不做任何事 */
export function advanceSave(save: SaveData, nowMs: number, offline: boolean): SaveData {
  const elapsed = nowMs - save.lastSeen
  if (elapsed <= 0) return save
  return { ...save, pets: save.pets.map((p) => advancePet(p, elapsed, offline)), lastSeen: nowMs }
}

export function ageDays(pet: Pet, nowMs: number): number {
  return Math.max(0, (nowMs - pet.adoptedAt) / DAY_MS)
}

/** 幼年 → 成年：以領養後的實際天數判斷 */
export function stageOf(pet: Pet, nowMs: number): Stage {
  return ageDays(pet, nowMs) >= BALANCE.adultDays ? 'adult' : 'young'
}

export function weightLabel(weight: number): string {
  if (weight < 30) return '偏瘦'
  if (weight < 65) return '標準'
  if (weight < 85) return '微胖'
  return '偏胖'
}

/** 幼年（未滿 adultDays 天）顯示的身高、體重倍率；成年顯示完整 */
export const YOUNG_HEIGHT_MUL = 0.6
export const YOUNG_WEIGHT_MUL = 0.3

/** 資訊卡顯示的身高（公分，整數）：品種的成年肩高 ×（幼年 0.6）。由品種決定，不看個體的身高係數、不存檔 */
export function heightCm(baseCm: number, stage: Stage): number {
  return Math.round(baseCm * (stage === 'young' ? YOUNG_HEIGHT_MUL : 1))
}

/**
 * 資訊卡顯示的體重（公斤，1 位小數）：品種標準體重 ×（0.7 + 0.006 × 遊戲體重值）×（幼年 0.3）。
 * 遊戲體重值範圍 0～100：50 剛好是標準、0 是 70%、100 是 130%。遊戲內部的體重值、標準／偏瘦／偏胖判斷與存檔欄位都不動。
 */
export function weightKg(baseKg: number, weight: number, stage: Stage): number {
  const w = clamp100(Number.isFinite(weight) ? weight : 50)
  // + 1e-6：剛好落在 .x5 的數字（例如 5.5 × 1.3 = 7.15）不要被浮點誤差往下捨
  return Math.round(baseKg * (0.7 + 0.006 * w) * (stage === 'young' ? YOUNG_WEIGHT_MUL : 1) * 10 + 1e-6) / 10
}

/** 數值低於門檻時要冒出的提示（優先順序：餓、髒、心情差） */
export type StatusIcon = 'exclaim' | 'sweat' | 'bubble'

/** 數值低於門檻時要顯示的狀態（優先順序：餓、心情差、髒）：餓＝驚嘆號、心情低＝汗滴、髒＝泡泡 */
export function lowStatNotices(pet: Pet): { icon: StatusIcon; text: string }[] {
  const out: { icon: StatusIcon; text: string }[] = []
  if (pet.satiety < BALANCE.lowThreshold) out.push({ icon: 'exclaim', text: '餓了' })
  if (pet.mood < BALANCE.lowThreshold) out.push({ icon: 'sweat', text: '心情差' })
  if (pet.cleanliness < BALANCE.lowThreshold) out.push({ icon: 'bubble', text: '髒了' })
  return out
}
