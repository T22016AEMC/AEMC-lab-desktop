import { BALANCE } from '../config/balance'
import { CURRENT_SCHEMA_VERSION, type SaveData } from '../save/types'

/** 本機日期 YYYY-MM-DD */
export function todayKey(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 每日第一次開啟 +5（以本機日期判斷） */
export function claimDaily(save: SaveData, today: string): { save: SaveData; claimed: boolean } {
  if (save.lastDailyClaim === today) return { save, claimed: false }
  return { save: { ...save, points: save.points + BALANCE.dailyBonus, lastDailyClaim: today }, claimed: true }
}

export function giftsToday(save: SaveData, today: string): number {
  return save.gifts.date === today ? save.gifts.count : 0
}

/** 今天還能不能再出現禮物，以及有沒有心情高於 70 的寵物 */
export function giftCandidates(save: SaveData, today: string): string[] {
  if (giftsToday(save, today) >= BALANCE.gift.dailyMax) return []
  return save.pets.filter((p) => p.mood > BALANCE.gift.moodThreshold).map((p) => p.id)
}

export function registerGift(save: SaveData, today: string): SaveData {
  return { ...save, gifts: { date: today, count: giftsToday(save, today) + 1 } }
}

/** 點擊領取禮物：+1～3 點 */
export function collectGift(save: SaveData, rand: () => number = Math.random): { save: SaveData; points: number } {
  const { minPoints, maxPoints } = BALANCE.gift
  const points = minPoints + Math.floor(rand() * (maxPoints - minPoints + 1))
  return { save: { ...save, points: save.points + points }, points }
}

export function newSave(now: number, today: string): SaveData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pets: [],
    points: BALANCE.startPoints,
    lastSeen: now,
    // 第一次建立存檔時已經有起始點數，當天不再重複給每日獎勵
    lastDailyClaim: today,
    gifts: { date: today, count: 0 },
    nextPetId: 1,
    createdAt: now,
  }
}
