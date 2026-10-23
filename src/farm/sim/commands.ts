import { BALANCE } from '../config/balance'
import { SPECIES, variantOf, type SpeciesId } from '../config/species'
import type { Pet, SaveData } from '../save/types'
import { clamp100 } from './stats'
import { adoptCheck, isSleeping } from './rules'

/** 寵物操作（點寵物彈出的氣泡選單）。之後的「玩耍」等動作只要在這裡新增名稱 */
export type ActionId = 'feed' | 'pet' | 'bath' | 'walk' | 'groom' | 'wake'

export interface Ctx {
  nowMs: number
  /** 世界時刻（小時，可能被測試模式覆寫），判斷夜晚與睡覺 */
  hour: number
}

/** 指令執行後給畫面層的效果：浮字、寵物動畫 */
export type FarmEffect =
  | { kind: 'float'; petId: string; text: string; tone: 'good' | 'bad' }
  | { kind: 'anim'; petId: string; anim: 'eat' | 'pet' | 'bath' | 'walk' | 'groom' | 'wake' }

export interface ActionOption {
  id: ActionId
  label: string
  /** 消耗金幣 */
  cost: number
  disabledReason?: string
}

export const DAILY_COST = 1

export const ACTION_LABELS: Record<ActionId, string> = {
  feed: '餵食',
  pet: '撫摸',
  bath: '洗澡',
  walk: '散步',
  groom: '梳毛',
  wake: '叫醒',
}

const ACTION_ORDER: ActionId[] = ['feed', 'pet', 'bath', 'walk', 'groom', 'wake']

/** 這個動作適用這隻寵物嗎（還沒考慮睡覺等暫時狀態） */
function applicable(action: ActionId, pet: Pet): boolean {
  switch (action) {
    case 'walk':
      return pet.species === 'dog'
    case 'groom':
      return pet.species === 'cat'
    default:
      return true
  }
}

/** 一隻寵物目前可以做的操作（氣泡選單用）：睡覺時只能撫摸或叫醒，金幣不足會標示原因 */
export function petActions(save: SaveData, pet: Pet, ctx: Ctx): ActionOption[] {
  const sleeping = isSleeping(pet, ctx.hour, ctx.nowMs)
  const out: ActionOption[] = []
  for (const id of ACTION_ORDER) {
    if (!applicable(id, pet)) continue
    if (id === 'wake' && !sleeping) continue
    let disabledReason: string | undefined
    if (id !== 'pet' && id !== 'wake' && sleeping) disabledReason = `${pet.name}正在睡覺，可以先叫醒`
    else if (save.points < DAILY_COST) disabledReason = `金幣不足（需要 ${DAILY_COST} 金幣，目前 ${save.points} 金幣）`
    out.push({ id, label: ACTION_LABELS[id], cost: DAILY_COST, disabledReason })
  }
  return out
}

export interface Delta {
  satiety?: number
  mood?: number
  cleanliness?: number
  weight?: number
}

const STAT_NAMES: Record<keyof Delta, string> = { satiety: '飽食度', mood: '心情', cleanliness: '清潔度', weight: '體重' }

/** 套用數值變化（0～100 夾住），回傳新寵物與實際變化量的浮字 */
export function applyDelta(pet: Pet, d: Delta): { pet: Pet; floats: FarmEffect[] } {
  const next = { ...pet }
  const floats: FarmEffect[] = []
  for (const k of ['satiety', 'mood', 'cleanliness', 'weight'] as const) {
    const change = d[k]
    if (!change) continue
    const before = pet[k]
    next[k] = clamp100(before + change)
    const actual = Math.round(next[k] - before)
    if (actual === 0) continue
    // 體重變胖視為負面提示
    const tone = k === 'weight' ? (actual > 0 ? 'bad' : 'good') : actual > 0 ? 'good' : 'bad'
    floats.push({ kind: 'float', petId: pet.id, text: `${STAT_NAMES[k]} ${actual > 0 ? '+' : ''}${actual}`, tone })
  }
  return { pet: next, floats }
}

export interface ExecResult {
  save: SaveData
  effects: FarmEffect[]
  error?: string
}

export function replacePet(save: SaveData, pet: Pet): SaveData {
  return { ...save, pets: save.pets.map((p) => (p.id === pet.id ? pet : p)) }
}

/** 執行寵物操作（每次消耗 1 金幣）。條件不符時回傳 error，存檔不變 */
export function execute(save: SaveData, ctx: Ctx, action: ActionId, petId: string): ExecResult {
  const fail = (error: string): ExecResult => ({ save, effects: [], error })
  const pet = save.pets.find((p) => p.id === petId)
  if (!pet) return fail('找不到這隻寵物')
  const opt = petActions(save, pet, ctx).find((a) => a.id === action)
  if (!opt) return fail('現在不能這麼做')
  if (opt.disabledReason) return fail(opt.disabledReason)

  let next: SaveData = { ...save, points: save.points - DAILY_COST }
  const sleeping = isSleeping(pet, ctx.hour, ctx.nowMs)
  let delta: Delta = {}
  let awakeUntil = pet.awakeUntil
  // 互動之後保持清醒；若仍在睡覺時間內，閒置超過 idleMinutes 就會自己回去睡
  const stayAwakeUntil = ctx.nowMs + BALANCE.sleep.idleMinutes * 60_000
  if (!(action === 'pet' && sleeping)) awakeUntil = stayAwakeUntil
  switch (action) {
    case 'feed': {
      const b = BALANCE.feed
      delta = { satiety: b.satiety, mood: b.mood, weight: pet.satiety >= b.fatAbove ? b.fatGain : 0 }
      break
    }
    case 'pet':
      // 睡夢中被摸：不會醒來（awakeUntil 不變），心情只小幅上升
      delta = { mood: sleeping ? BALANCE.petSleeping.mood : BALANCE.pet.mood }
      break
    case 'bath':
      delta = {
        cleanliness: BALANCE.bath.cleanliness,
        mood: pet.species === 'cat' ? BALANCE.bath.moodCat : BALANCE.bath.moodDog,
      }
      break
    case 'walk':
      delta = { ...BALANCE.walk }
      break
    case 'groom':
      delta = { ...BALANCE.groom }
      break
    case 'wake':
      delta = { mood: pet.species === 'cat' ? BALANCE.wake.moodCat : BALANCE.wake.moodDog }
      break
  }
  const anim = action === 'feed' ? 'eat' : action
  const r = applyDelta({ ...pet, awakeUntil }, delta)
  next = replacePet(next, r.pet)
  return { save: next, effects: [{ kind: 'anim', petId: pet.id, anim }, ...r.floats] }
}

/**
 * 睡覺中的寵物被拖起來：醒來（不用金幣）。規則和「叫醒」一樣：貓不開心（心情下降）、狗沒差，
 * 之後保持清醒到 idleMinutes。沒在睡覺就什麼都不做。
 */
export function wakeForDrag(save: SaveData, ctx: Ctx, petId: string): ExecResult {
  const pet = save.pets.find((p) => p.id === petId)
  if (!pet || !isSleeping(pet, ctx.hour, ctx.nowMs)) return { save, effects: [] }
  const awakeUntil = ctx.nowMs + BALANCE.sleep.idleMinutes * 60_000
  const r = applyDelta({ ...pet, awakeUntil }, { mood: pet.species === 'cat' ? BALANCE.wake.moodCat : BALANCE.wake.moodDog })
  return { save: replacePet(save, r.pet), effects: r.floats }
}

export interface AdoptRequest {
  species: SpeciesId
  variant?: string
  name: string
  /** 第一隻免費 */
  free?: boolean
}

export interface AdoptResult {
  save: SaveData
  petId?: string
  error?: string
}

/** 領養：隨機身高係數（約 0.85～1.15）、初始體重約 50、三項數值約 70～85 */
export function adopt(save: SaveData, ctx: Ctx, req: AdoptRequest, rand: () => number = Math.random): AdoptResult {
  const check = adoptCheck(save, req.species, req.free)
  if (!check.ok) return { save, error: check.reason }
  const sp = SPECIES[req.species]
  const name = req.name.trim().slice(0, 12) || sp.nameIdeas[0]
  const id = `p${save.nextPetId}`
  const pet: Pet = {
    id,
    species: req.species,
    variant: variantOf(req.species, req.variant).id,
    name,
    adoptedAt: ctx.nowMs,
    heightFactor: 0.85 + rand() * 0.3,
    weight: 45 + rand() * 10,
    satiety: 75 + rand() * 10,
    mood: 75 + rand() * 10,
    cleanliness: 75 + rand() * 10,
  }
  return {
    save: {
      ...save,
      pets: [...save.pets, pet],
      points: save.points - (req.free ? 0 : sp.cost),
      nextPetId: save.nextPetId + 1,
    },
    petId: id,
  }
}
