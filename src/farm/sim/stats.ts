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

/** 外觀整體大小：幼年較小 */
export function stageScale(stage: Stage): number {
  return stage === 'young' ? 0.68 : 1
}

/** 體重 0～100 對應的胖瘦倍率（身體厚度）：0 → 0.82、50 → 1、100 → 1.28 */
export function fatness(weight: number): number {
  const w = clamp100(weight)
  return w <= 50 ? 0.82 + (w / 50) * 0.18 : 1 + ((w - 50) / 50) * 0.28
}

export function weightLabel(weight: number): string {
  if (weight < 30) return '偏瘦'
  if (weight < 65) return '標準'
  if (weight < 85) return '微胖'
  return '偏胖'
}

/** 資訊卡顯示的身高（公分）：種類基準 × 身高係數 ×（幼年縮小） */
export function heightCm(pet: Pet, baseCm: number, nowMs: number): number {
  return Math.round(baseCm * pet.heightFactor * (stageOf(pet, nowMs) === 'young' ? 0.6 : 1))
}

/** 數值低於門檻時要冒出的提示（優先順序：餓、髒、心情差） */
export function lowStatNotices(pet: Pet): { emoji: string; text: string }[] {
  const out: { emoji: string; text: string }[] = []
  if (pet.satiety < BALANCE.lowThreshold) out.push({ emoji: '🍖', text: '餓了' })
  if (pet.cleanliness < BALANCE.lowThreshold) out.push({ emoji: '💧', text: '髒了' })
  if (pet.mood < BALANCE.lowThreshold) out.push({ emoji: '💔', text: '心情差' })
  return out
}
