import { BALANCE } from '../config/balance'
import { isBuildingId } from '../config/buildings'
import { isCollectionKey } from '../config/items'
import { SPECIES, isSpeciesId, isVariantId } from '../config/species'
import { isPersonalityId, personalityFromId } from '../config/personality'
import { cleanNotes } from '../../tools/notes'
import { CURRENT_SCHEMA_VERSION, DATA_REV, type BowlState, type EarningState, type Find, type Pet, type PicnicActive, type PicnicState, type SaveData, type SkinState } from './types'

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/** saveLastSeen：舊寵物沒有 lastInteract 時補成這個（存檔最後結算的時間） */
function cleanPet(raw: unknown, saveLastSeen: number): Pet | null {
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
  // v3.8.0：個性（舊存檔沒有 → 用 id 算固定的一種）、上次互動時間（舊存檔沒有 → 存檔的 lastSeen）
  pet.personality = isPersonalityId(r.personality) ? r.personality : personalityFromId(r.id)
  pet.lastInteract = num(r.lastInteract, saveLastSeen)
  return pet
}

/** 這份原始存檔有沒有寵物缺個性欄位（載入時要立刻寫回，見 storage.ts） */
export function needsPersonalityFill(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const pets = (raw as Record<string, unknown>).pets
  return Array.isArray(pets) && pets.some((p) => p && typeof p === 'object' && !isPersonalityId((p as Record<string, unknown>).personality))
}

/** 野餐紀錄（v3.8.0）：壞掉的欄位補預設；進行中的那一場只留合法的 */
function cleanPicnic(raw: unknown): PicnicState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  const out: PicnicState = {
    date: typeof r.date === 'string' ? r.date : '',
    count: Math.floor(num(r.count, 0, 0, 99)),
    lastEnd: num(r.lastEnd, 0, 0),
  }
  const a = r.active as Record<string, unknown> | undefined
  if (a && typeof a === 'object' && typeof a.startedAt === 'number' && Number.isFinite(a.startedAt) && typeof a.until === 'number' && Number.isFinite(a.until)) {
    const active: PicnicActive = {
      startedAt: a.startedAt,
      until: a.until,
      pets: Array.isArray(a.pets) ? a.pets.filter((x): x is string => typeof x === 'string').slice(0, 6) : [],
      mat: Math.floor(num(a.mat, 0, 0, 2)),
      basket: Math.floor(num(a.basket, 0, 0, 1)),
      foods: Array.isArray(a.foods) ? a.foods.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 3).slice(0, 2) : [],
    }
    out.active = active
  }
  return out
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
    digCoins: Math.floor(num(r.digCoins, 0, 0, BALANCE.dig.dailyCoinMax)),
  }
}

function cleanBowl(raw: unknown): BowlState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { date: typeof r.date === 'string' ? r.date : '', used: Math.floor(num(r.used, 0, 0)) }
}

/**
 * v3.5.1 移除的建築與退款金幣（舊存檔還擁有時，載入就退款並從 ownedBuildings 拿掉）。
 * 「只退一次」的依據是這份原始資料裡還有它：載入後立刻寫回（storage.ts），拿掉之後就不會再退；不新增任何存檔欄位。
 */
export const REMOVED_BUILDING_REFUNDS: Readonly<Record<string, number>> = { campfire: 20 }

/** 這份原始存檔載入時會退多少金幣（沒有已移除的建築 = 0） */
export function legacyRefundOf(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0
  const owned = (raw as Record<string, unknown>).ownedBuildings
  if (!Array.isArray(owned)) return 0
  let sum = 0
  for (const [id, coins] of Object.entries(REMOVED_BUILDING_REFUNDS)) if (owned.includes(id)) sum += coins
  return sum
}

/** 寶物數量：只留合法的編號與正整數（上限 99999，避免壞檔撐爆畫面） */
function cleanCollection(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isCollectionKey(k) || typeof v !== 'number' || !Number.isFinite(v)) continue
    const n = Math.min(99999, Math.floor(v))
    if (n >= 1) out[k] = n
  }
  return out
}

function cleanFinds(raw: unknown): Find[] {
  if (!Array.isArray(raw)) return []
  const out: Find[] = []
  const ids = new Set<string>()
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue
    const r = f as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id || ids.has(r.id)) continue
    if ((r.kind !== 'mound' && r.kind !== 'bundle') || (r.by !== 'dog' && r.by !== 'cat')) continue
    if (typeof r.at !== 'number' || !Number.isFinite(r.at)) continue
    ids.add(r.id)
    out.push({ id: r.id, kind: r.kind, by: r.by, fx: num(r.fx, 0.5, 0, 1), fy: num(r.fy, 0.5, 0, 1), at: r.at })
    if (out.length >= BALANCE.dig.holdMax) break
  }
  return out
}

function cleanEvents(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (k.length <= 40 && typeof v === 'number' && Number.isFinite(v)) out[k] = v
  return out
}

function cleanSkins(raw: unknown): SkinState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const owned = Array.isArray(r.owned) ? [...new Set(r.owned.filter((x): x is string => typeof x === 'string' && x.length <= 40))] : []
  const equipped: Record<string, string> = {}
  if (r.equipped && typeof r.equipped === 'object') for (const [k, v] of Object.entries(r.equipped as Record<string, unknown>)) if (typeof v === 'string' && owned.includes(v)) equipped[k] = v
  return { owned, equipped }
}

/** 儲存的資料是不是比這份程式更新（schemaVersion 較大，或同一個 schema 內 dataRev 較大）：是的話不讀、不覆寫 */
export function isNewerData(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  if (typeof r.schemaVersion === 'number' && r.schemaVersion > CURRENT_SCHEMA_VERSION) return true
  return typeof r.dataRev === 'number' && r.dataRev > DATA_REV
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

  const now = Date.now()
  const lastSeen = num(r.lastSeen, now)
  const pets: Pet[] = []
  for (const p of Array.isArray(r.pets) ? r.pets : []) {
    const pet = cleanPet(p, lastSeen)
    if (pet) pets.push(pet)
  }
  const gifts = (r.gifts && typeof r.gifts === 'object' ? r.gifts : {}) as Record<string, unknown>
  const save: SaveData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pets,
    points: Math.floor(num(r.points, 0, 0)) + legacyRefundOf(r),
    lastSeen,
    lastDailyClaim: typeof r.lastDailyClaim === 'string' ? r.lastDailyClaim : null,
    gifts: { date: typeof gifts.date === 'string' ? gifts.date : '', count: Math.floor(num(gifts.count, 0, 0)) },
    nextPetId: Math.floor(num(r.nextPetId, pets.length + 1, 1)),
    createdAt: num(r.createdAt, now),
    ownedBuildings: cleanOwned(r.ownedBuildings),
    earning: cleanEarning(r.earning),
    bowl: cleanBowl(r.bowl),
    collection: cleanCollection(r.collection),
    finds: cleanFinds(r.finds),
    events: cleanEvents(r.events),
    skins: cleanSkins(r.skins),
    dataRev: DATA_REV,
    // v3.7.0：公佈欄（可缺少；沒有 = 空、壞掉的單張捨棄）
    notes: cleanNotes(r.notes),
  }
  // v3.8.0：野餐紀錄（可缺少；沒有就不放這個欄位）
  const picnic = cleanPicnic(r.picnic)
  if (picnic) save.picnic = picnic
  if (r.resetNotice === true) save.resetNotice = true
  return save
}
