import { isBuildingId } from '../config/buildings'
import { SPECIES, isSpeciesId, isVariantId } from '../config/species'
import { CURRENT_SCHEMA_VERSION, type BowlState, type EarningState, type Pet, type SaveData } from './types'

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

function cleanPet(raw: unknown): Pet | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isSpeciesId(r.species) || typeof r.id !== 'string') return null
  const variants = SPECIES[r.species].variants
  const pet: Pet = {
    id: r.id,
    species: r.species,
    variant: isVariantId(r.species, r.variant) ? r.variant : variants[0].id,
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
 * 讀取並驗證目前格式（schema 5）的存檔；格式無法辨識或不是目前版本時回傳 null。
 * v3.4.0 起舊格式（schema 4 以下）不再升級：由 storage.ts 的 loadOrReset 在載入時一律重置為全新存檔（isResetSchema 判斷）。
 */
function cleanEarning(raw: unknown): EarningState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const lastAward: Record<string, number> = {}
  if (r.lastAward && typeof r.lastAward === 'object') {
    for (const [k, v] of Object.entries(r.lastAward as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) lastAward[k] = v
    }
  }
  return {
    date: typeof r.date === 'string' ? r.date : '',
    programCoins: Math.floor(num(r.programCoins, 0, 0)),
    gameCoins: Math.floor(num(r.gameCoins, 0, 0)),
    lastAward,
  }
}

function cleanBowl(raw: unknown): BowlState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { date: typeof r.date === 'string' ? r.date : '', used: Math.floor(num(r.used, 0, 0)) }
}

function cleanOwned(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter(isBuildingId))]
}

/** 這份原始資料是「重置前的舊格式」（schema 1～4）嗎：是的話第一次載入要重置為全新存檔 */
export function isResetSchema(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const v = (raw as Record<string, unknown>).schemaVersion
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v < CURRENT_SCHEMA_VERSION
}

export function parseSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.schemaVersion !== CURRENT_SCHEMA_VERSION) return null

  const pets: Pet[] = []
  for (const p of Array.isArray(r.pets) ? r.pets : []) {
    const pet = cleanPet(p)
    if (pet) pets.push(pet)
  }
  const gifts = (r.gifts && typeof r.gifts === 'object' ? r.gifts : {}) as Record<string, unknown>
  const now = Date.now()
  const save: SaveData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pets,
    points: Math.floor(num(r.points, 0, 0)),
    lastSeen: num(r.lastSeen, now),
    lastDailyClaim: typeof r.lastDailyClaim === 'string' ? r.lastDailyClaim : null,
    gifts: { date: typeof gifts.date === 'string' ? gifts.date : '', count: Math.floor(num(gifts.count, 0, 0)) },
    nextPetId: Math.floor(num(r.nextPetId, pets.length + 1, 1)),
    createdAt: num(r.createdAt, now),
    ownedBuildings: cleanOwned(r.ownedBuildings),
    earning: cleanEarning(r.earning),
    bowl: cleanBowl(r.bowl),
  }
  if (r.resetNotice === true) save.resetNotice = true
  return save
}
