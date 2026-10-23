import { SPECIES, isSpeciesId, isVariantId, type SpeciesId } from '../config/species'
import { CURRENT_SCHEMA_VERSION, type Pet, type SaveData } from './types'

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/** v1 存檔的毛色 → v2 起的品種／花色 */
export const LEGACY_VARIANTS: Partial<Record<SpeciesId, Record<string, string>>> = {
  dog: { shiba: 'shiba', bw: 'bordercollie', cream: 'poodle', choco: 'golden' },
  cat: { orange: 'tabby', black: 'black', graywhite: 'britishblue', calico: 'calico' },
}

/** v3 取消海洋：舊存檔裡的海洋生物依當初的領養價格退還點數 */
export const LEGACY_SEA_REFUND: Record<string, number> = {
  clownfish: 15,
  crab: 15,
  turtle: 25,
  beluga: 35,
  orca: 35,
  whaleshark: 35,
}

/** 最近一次升級時移除了哪些海洋生物（給畫面層顯示一次提示）；讀走後清空 */
let migrationNotice: { removed: number; refunded: number } | null = null
export function takeMigrationNotice(): { removed: number; refunded: number } | null {
  const n = migrationNotice
  migrationNotice = null
  return n
}

function cleanPet(raw: unknown, version: number): Pet | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isSpeciesId(r.species) || typeof r.id !== 'string') return null
  const variants = SPECIES[r.species].variants
  // v1 用 coat（舊毛色 id），v2 起用 variant；無法辨識時退回第一個
  const candidate = version < 2 ? LEGACY_VARIANTS[r.species]?.[String(r.coat)] : r.variant
  const pet: Pet = {
    id: r.id,
    species: r.species,
    variant: isVariantId(r.species, candidate) ? candidate : variants[0].id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 12) : '無名',
    adoptedAt: num(r.adoptedAt, Date.now()),
    heightFactor: num(r.heightFactor, 1, 0.7, 1.3),
    weight: num(r.weight, 50, 0, 100),
    satiety: num(r.satiety, 70, 0, 100),
    mood: num(r.mood, 70, 0, 100),
    cleanliness: num(r.cleanliness, 70, 0, 100),
  }
  if (typeof r.awakeUntil === 'number') pet.awakeUntil = r.awakeUntil
  return pet
}

/**
 * 把讀到的任意資料轉成目前版本的 SaveData；格式無法辨識時回傳 null。
 * 之後資料格式升級時，在這裡依 schemaVersion 逐版轉換。
 *  - v1 → v2：狗貓的毛色改為品種／花色（cleanPet 依 version 轉換）
 *  - v2 → v3：取消海洋，海洋生物移除並依領養價格退還點數；其餘貓狗保留
 */
export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const version = typeof r.schemaVersion === 'number' ? r.schemaVersion : 0
  if (version < 1 || version > CURRENT_SCHEMA_VERSION) return null

  const pets: Pet[] = []
  let refund = 0
  let removed = 0
  for (const p of Array.isArray(r.pets) ? r.pets : []) {
    const sp = p && typeof p === 'object' ? (p as Record<string, unknown>).species : undefined
    if (typeof sp === 'string' && sp in LEGACY_SEA_REFUND) {
      refund += LEGACY_SEA_REFUND[sp]
      removed++
      continue
    }
    const pet = cleanPet(p, version)
    if (pet) pets.push(pet)
  }
  if (removed > 0) migrationNotice = { removed, refunded: refund }
  const gifts = (r.gifts && typeof r.gifts === 'object' ? r.gifts : {}) as Record<string, unknown>
  const now = Date.now()
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pets,
    points: Math.floor(num(r.points, 0, 0)) + refund,
    lastSeen: num(r.lastSeen, now),
    lastDailyClaim: typeof r.lastDailyClaim === 'string' ? r.lastDailyClaim : null,
    gifts: { date: typeof gifts.date === 'string' ? gifts.date : '', count: Math.floor(num(gifts.count, 0, 0)) },
    nextPetId: Math.floor(num(r.nextPetId, pets.length + 1, 1)),
    createdAt: num(r.createdAt, now),
  }
}
