import { isSpeciesId } from '../config/species'
import { CURRENT_SCHEMA_VERSION, type Pet, type SaveData } from './types'

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

function cleanPet(raw: unknown): Pet | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isSpeciesId(r.species) || typeof r.id !== 'string') return null
  const pet: Pet = {
    id: r.id,
    species: r.species,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 12) : '無名',
    adoptedAt: num(r.adoptedAt, Date.now()),
    heightFactor: num(r.heightFactor, 1, 0.7, 1.3),
    weight: num(r.weight, 50, 0, 100),
    satiety: num(r.satiety, 70, 0, 100),
    mood: num(r.mood, 70, 0, 100),
    cleanliness: num(r.cleanliness, 70, 0, 100),
  }
  if (typeof r.coat === 'string') pet.coat = r.coat
  if (typeof r.awakeUntil === 'number') pet.awakeUntil = r.awakeUntil
  return pet
}

/**
 * 把讀到的任意資料轉成目前版本的 SaveData；格式無法辨識時回傳 null。
 * 之後資料格式升級時，在這裡依 schemaVersion 逐版轉換（v1 → v2 → …）。
 */
export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const version = typeof r.schemaVersion === 'number' ? r.schemaVersion : 0
  if (version < 1 || version > CURRENT_SCHEMA_VERSION) return null

  // if (version === 1) { r = upgradeV1toV2(r) }  ← 未來在這裡串接

  const pets = (Array.isArray(r.pets) ? r.pets : []).map(cleanPet).filter((p): p is Pet => p !== null)
  const gifts = (r.gifts && typeof r.gifts === 'object' ? r.gifts : {}) as Record<string, unknown>
  const now = Date.now()
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pets,
    points: Math.floor(num(r.points, 0, 0)),
    lastSeen: num(r.lastSeen, now),
    lastDailyClaim: typeof r.lastDailyClaim === 'string' ? r.lastDailyClaim : null,
    gifts: { date: typeof gifts.date === 'string' ? gifts.date : '', count: Math.floor(num(gifts.count, 0, 0)) },
    nextPetId: Math.floor(num(r.nextPetId, pets.length + 1, 1)),
    createdAt: num(r.createdAt, now),
  }
}
