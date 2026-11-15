import { BALANCE } from './balance'

/**
 * 個性（v3.8.0）：活潑、貪吃、懶散、黏人、膽小。數值倍率在 balance.ts 的 BALANCE.personality，這裡只放名稱、圖示與「誰是什麼個性」。
 * 領養時隨機（rollPersonality）；舊存檔沒有個性欄位的寵物用 id 算出固定的一種（personalityFromId：同一個 id 永遠得到同一種）。
 */
export const PERSONALITY_IDS = ['lively', 'greedy', 'lazy', 'clingy', 'timid'] as const
export type PersonalityId = (typeof PERSONALITY_IDS)[number]

export const PERSONALITY_NAMES: Record<PersonalityId, string> = { lively: '活潑', greedy: '貪吃', lazy: '懶散', clingy: '黏人', timid: '膽小' }
/** 資訊卡的圖示（圖集 ui 的 pers_*，personality_icons.png：球、碗、枕頭、愛心、水滴） */
export const PERSONALITY_ICONS: Record<PersonalityId, string> = { lively: 'pers_lively', greedy: 'pers_greedy', lazy: 'pers_lazy', clingy: 'pers_clingy', timid: 'pers_timid' }

export const isPersonalityId = (v: unknown): v is PersonalityId => typeof v === 'string' && (PERSONALITY_IDS as readonly string[]).includes(v)

/** 字串雜湊（FNV-1a 32 位元）：同一個字串永遠是同一個數字，與執行環境無關 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 舊寵物（沒有個性欄位）的固定個性：由寵物 id 決定 */
export function personalityFromId(id: string): PersonalityId {
  return PERSONALITY_IDS[fnv1a('personality:' + id) % PERSONALITY_IDS.length]
}

/** 新領養：5 種平均隨機 */
export function rollPersonality(rand: () => number = Math.random): PersonalityId {
  return PERSONALITY_IDS[Math.min(PERSONALITY_IDS.length - 1, Math.floor(rand() * PERSONALITY_IDS.length))]
}

/** 一隻寵物的全部倍率（沒有列出的 = 1）。沒有個性（只有測試會這樣）= 全部 1，數值與 v3.7.1 相同 */
export interface PersonalityMul {
  digMood: number
  satietyDecay: number
  moodDecay: number
  eatMood: number
  wander: number
  petMood: number
  lonelyMoodDecay: number
  shelterDelay: number
  dragMood: number
}
export const NEUTRAL_MUL: Readonly<PersonalityMul> = { digMood: 1, satietyDecay: 1, moodDecay: 1, eatMood: 1, wander: 1, petMood: 1, lonelyMoodDecay: 1, shelterDelay: 1, dragMood: 1 }

export function personalityMul(p: { personality?: PersonalityId } | null | undefined): Readonly<PersonalityMul> {
  const id = p?.personality
  if (!id) return NEUTRAL_MUL
  return { ...NEUTRAL_MUL, ...BALANCE.personality[id] }
}
