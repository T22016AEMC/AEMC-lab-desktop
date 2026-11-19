import { BALANCE } from '../config/balance'
import { CHECKIN_MAX } from '../save/migrate'
import { CURRENT_SCHEMA_VERSION, DATA_REV, type SaveData } from '../save/types'

/** 本機日期 YYYY-MM-DD */
export function todayKey(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 簽到月曆（v3.10.0）的文字。每日 +5（BALANCE.dailyBonus）以前是載入或跨日時自動給，現在只有打開簽到月曆才給。
 */
export const CHECKIN_TEXT = {
  noSave: '領養第一隻寵物後就能簽到',
  already: '今天已經簽到過了',
  claimed: (n: number) => `簽到成功，+${n} 金幣`,
  toast: (n: number) => `簽到 +${n} 金幣`,
  otherTab: '這個分頁已停止存檔，不能簽到。請重新整理網頁。',
  newer: '存檔來自更新的版本，這個分頁不能簽到。請重新整理網頁。',
} as const

/** 上個月 1 號（YYYY-MM-DD）：簽到紀錄只留這天以後的（月曆顯示當月與上個月） */
export function prevMonthStart(today: string): string {
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7)) - 1
  if (m === 0) {
    m = 12
    y--
  }
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/** 簽到過的日期（月曆顯示「簽」）：簽到紀錄＋lastDailyClaim（更新前已領的今天、或更早只有 lastDailyClaim 的那天）。沒有存檔 = 空 */
export function checkinDays(save: Pick<SaveData, 'checkins' | 'lastDailyClaim'> | null): Set<string> {
  const out = new Set<string>(save?.checkins ?? [])
  if (save?.lastDailyClaim) out.add(save.lastDailyClaim)
  return out
}

/** 今天簽到過了沒（今天領過每日獎勵 = 簽過） */
export function isCheckedIn(save: Pick<SaveData, 'checkins' | 'lastDailyClaim'>, today: string): boolean {
  return save.lastDailyClaim === today || (save.checkins?.includes(today) ?? false)
}

/** 簽到紀錄加上 day：只留上個月 1 號以後（未來日期留著，避免時鐘調回來又能再簽）、去重、由舊到新、最多 CHECKIN_MAX 筆 */
export function trimCheckins(list: readonly string[] | undefined, day: string): string[] {
  const from = prevMonthStart(day)
  return [...new Set([...(list ?? []).filter((d) => d >= from), day])].sort().slice(-CHECKIN_MAX)
}

/** 簽到今天（只能簽今天、不能補簽）：+5 金幣、lastDailyClaim = 今天、紀錄加上今天。今天簽過（含更新前已領）= 不變 */
export function checkIn(save: SaveData, today: string): { save: SaveData; claimed: boolean } {
  if (isCheckedIn(save, today)) return { save, claimed: false }
  return {
    save: { ...save, points: save.points + BALANCE.dailyBonus, lastDailyClaim: today, checkins: trimCheckins(save.checkins, today) },
    claimed: true,
  }
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

/** 點擊領取禮物：+1～3 金幣 */
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
    // 第一次建立存檔時已經有起始金幣，當天不再重複給每日獎勵（簽到月曆當天直接顯示「簽」）
    lastDailyClaim: today,
    gifts: { date: today, count: 0 },
    nextPetId: 1,
    createdAt: now,
    ownedBuildings: [],
    earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 },
    bowl: { date: today, used: 0 },
    collection: {},
    finds: [],
    events: {},
    skins: { owned: [], equipped: {} },
    dataRev: DATA_REV,
  }
}
