import { BALANCE } from '../config/balance'
import { isBuildingId } from '../config/buildings'
import { isCollectionKey } from '../config/items'
import { SPECIES, isSpeciesId, isVariantId } from '../config/species'
import { isPersonalityId, personalityFromId } from '../config/personality'
import { cleanNotes } from '../../tools/notes'
import { LAYOUT_MAX_ITEMS, isLayoutKind, layoutItemDef } from '../config/layoutItems'
import { SCENE_H, SCENE_W } from '../pixel/layout'
import { CURRENT_SCHEMA_VERSION, DATA_REV, type BowlState, type EarningState, type FarmLayout, type Find, type LayoutItem, type Pet, type PicnicActive, type PicnicState, type SaveData, type SkinState } from './types'

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

/**
 * 農場擺放（v3.9.0）。不丟錯誤、不改寫存檔（只在讀進記憶體時清理）；清理兩次和一次結果相同。
 *  - farmLayout 不是物件、items 不是陣列 → 整個忽略（回傳 undefined = 全部預設）
 *  - 原始陣列只看前 LAYOUT_MAX_ITEMS（300）筆
 *  - 單筆不是物件、kind 不認得、id 不在物件表或和 kind 對不上 → 丟掉；重複 id 留第一筆
 *  - state 不是 placed／stored → 擺放；不能收的（住家、鐘樓、池塘、公佈欄）寫成 stored → 擺放
 *  - 擺放：x、y 有一個不是有限數字 → 兩個都拿掉（回到預設位置）；沒有預設位置的（花槽、珊瑚石堆）改成在庫存
 *  - 座標夾回 0～SCENE_W、0～SCENE_H 並取整數；在庫存的不帶座標
 * 重疊、走不到之類的擺放規則不在這裡處理（載入後原樣保留，不自動挪位）。
 */
export function cleanFarmLayout(raw: unknown): FarmLayout | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const list = (raw as Record<string, unknown>).items
  if (!Array.isArray(list)) return undefined
  const items: LayoutItem[] = []
  const seen = new Set<string>()
  const n = Math.min(list.length, LAYOUT_MAX_ITEMS)
  for (let i = 0; i < n; i++) {
    const e = list[i]
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue
    const r = e as Record<string, unknown>
    const kind = r.kind
    if (!isLayoutKind(kind)) continue
    const def = layoutItemDef(r.id)
    if (!def || def.kind !== kind || seen.has(def.id)) continue
    seen.add(def.id)
    let state: 'placed' | 'stored' = r.state === 'stored' && def.storable ? 'stored' : 'placed'
    const x = r.x
    const y = r.y
    const okXY = typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
    if (state === 'placed' && !okXY && !def.hasDefault) state = 'stored'
    const item: LayoutItem = { id: def.id, kind: def.kind, state }
    if (state === 'placed' && okXY) {
      item.x = Math.round(Math.min(SCENE_W, Math.max(0, x)))
      item.y = Math.round(Math.min(SCENE_H, Math.max(0, y)))
    }
    items.push(item)
  }
  return { items }
}

/** 簽到紀錄最多保留幾筆（月曆顯示當月與上個月，最多 31 + 31 天） */
export const CHECKIN_MAX = 62

/** YYYY-MM-DD 而且是真的日期（不收 2026-02-30） */
export function isDayKey(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const y = Number(v.slice(0, 4))
  const m = Number(v.slice(5, 7))
  const d = Number(v.slice(8, 10))
  if (m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * v3.10.0 簽到紀錄的防呆：不是陣列 = 沒有這個欄位；只留合法日期、去重、由舊到新、最多 CHECKIN_MAX 筆（留最新的）。
 * 不在這裡刪未來日期（讀檔用的時間和測試平移的遊戲時間不一定一樣）；簽到時才修剪（sim/points.ts 的 trimCheckins）。
 * 清完是空的 = 沒有這個欄位（不重置、不影響其他欄位）。
 */
export function cleanCheckins(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = [...new Set(raw.filter(isDayKey))].sort()
  const kept = out.slice(-CHECKIN_MAX)
  return kept.length > 0 ? kept : undefined
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
  // v3.9.0：農場擺放（可缺少；不是物件或 items 不是陣列 = 沒有這個欄位）
  const layout = cleanFarmLayout(r.farmLayout)
  if (layout) save.farmLayout = layout
  // v3.10.0：簽到紀錄（可缺少；清完是空的就不放這個欄位）
  const checkins = cleanCheckins(r.checkins)
  if (checkins) save.checkins = checkins
  if (r.resetNotice === true) save.resetNotice = true
  return save
}
