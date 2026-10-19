import { BALANCE } from '../config/balance'
import { SPECIES, variantOf, type SpeciesId } from '../config/species'
import type { Pet, SaveData } from '../save/types'
import { clamp100 } from './stats'
import { adoptCheck, isSleeping } from './rules'

export type ActionId = 'feed' | 'pet' | 'bath' | 'walk' | 'groom' | 'wake' | 'feedPond' | 'cleanPond' | 'adopt'

export interface Ctx {
  nowMs: number
  /** 世界時刻（小時，可能被測試模式覆寫），判斷夜晚與睡覺 */
  hour: number
}

/** 指令執行後給畫面層的效果：浮字、寵物動畫、池塘整體動畫 */
export type FarmEffect =
  | { kind: 'float'; petId: string; text: string; tone: 'good' | 'bad' }
  | { kind: 'anim'; petId: string; anim: 'eat' | 'pet' | 'bath' | 'walk' | 'groom' | 'wake' }
  | { kind: 'pond'; anim: 'feed' | 'clean' }

export interface ActionOption {
  id: ActionId
  label: string
  /** 消耗點數（領養的點數依種類而定，這裡為 0） */
  cost: number
  disabledReason?: string
}

export interface TargetOption {
  id: string
  label: string
  disabledReason?: string
}

export const DAILY_COST = 1

const ACTION_LABELS: Record<ActionId, string> = {
  feed: '餵食',
  pet: '撫摸',
  bath: '洗澡',
  walk: '散步',
  groom: '梳毛',
  wake: '叫醒',
  feedPond: '餵飼料',
  cleanPond: '清潔池塘',
  adopt: '領養',
}

const ACTION_ORDER: ActionId[] = ['feed', 'pet', 'bath', 'walk', 'groom', 'wake', 'feedPond', 'cleanPond', 'adopt']

/** 這個動作適用的寵物（還沒考慮睡覺等暫時狀態） */
function applicable(action: ActionId, pet: Pet): boolean {
  const sp = SPECIES[pet.species]
  switch (action) {
    case 'feed':
    case 'bath':
      return sp.domain === 'land'
    case 'pet':
      return sp.touchable
    case 'walk':
      return pet.species === 'dog'
    case 'groom':
      return pet.species === 'cat'
    case 'wake':
      return sp.domain === 'land'
    default:
      return false
  }
}

const POND = 'pond'

export function listTargets(save: SaveData, action: ActionId, ctx: Ctx): TargetOption[] {
  if (action === 'feedPond' || action === 'cleanPond') {
    const has = save.pets.some((p) => SPECIES[p.species].domain === 'sea')
    return [{ id: POND, label: '整個池塘', disabledReason: has ? undefined : '池塘裡還沒有生物' }]
  }
  const out: TargetOption[] = []
  for (const pet of save.pets) {
    if (!applicable(action, pet)) continue
    const sleeping = isSleeping(pet, ctx.hour, ctx.nowMs)
    const label = `${pet.name}（${SPECIES[pet.species].name}）`
    if (action === 'wake') {
      if (sleeping) out.push({ id: pet.id, label })
      continue
    }
    // 撫摸：睡覺時也可以（不會醒來，心情小幅上升）
    if (action === 'pet') {
      out.push({ id: pet.id, label: sleeping ? `${label}・睡夢中` : label })
      continue
    }
    let reason: string | undefined
    if (sleeping) reason = `${pet.name}正在睡覺，可以先叫醒`
    out.push({ id: pet.id, label, disabledReason: reason })
  }
  return out
}

export function listActions(save: SaveData, ctx: Ctx): ActionOption[] {
  return ACTION_ORDER.map((id): ActionOption => {
    const label = ACTION_LABELS[id]
    if (id === 'adopt') return { id, label, cost: 0 }
    const cost = DAILY_COST
    const targets = listTargets(save, id, ctx)
    const usable = targets.filter((t) => !t.disabledReason)
    let disabledReason: string | undefined
    if (id === 'wake' && targets.length === 0) disabledReason = '沒有正在睡覺的寵物'
    else if (targets.length === 0) {
      disabledReason =
        id === 'walk' ? '沒有狗可以散步' : id === 'groom' ? '沒有貓可以梳毛' : id === 'pet' ? '沒有可以撫摸的寵物' : '沒有適合的寵物'
    } else if (usable.length === 0) disabledReason = targets[0].disabledReason
    else if (save.points < cost) disabledReason = `點數不足（需要 ${cost} 點，目前 ${save.points} 點）`
    return { id, label, cost, disabledReason }
  })
}

interface Delta {
  satiety?: number
  mood?: number
  cleanliness?: number
  weight?: number
}

const STAT_NAMES: Record<keyof Delta, string> = { satiety: '飽食度', mood: '心情', cleanliness: '清潔度', weight: '體重' }

/** 套用數值變化（0～100 夾住），回傳新寵物與實際變化量的浮字 */
function applyDelta(pet: Pet, d: Delta): { pet: Pet; floats: FarmEffect[] } {
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

function replacePet(save: SaveData, pet: Pet): SaveData {
  return { ...save, pets: save.pets.map((p) => (p.id === pet.id ? pet : p)) }
}

/** 執行日常指令（每次消耗 1 點）。條件不符時回傳 error，存檔不變 */
export function execute(save: SaveData, ctx: Ctx, action: ActionId, targetId: string): ExecResult {
  const fail = (error: string): ExecResult => ({ save, effects: [], error })
  if (action === 'adopt') return fail('領養請使用領養流程')
  const opt = listActions(save, ctx).find((a) => a.id === action)
  if (!opt || opt.disabledReason) return fail(opt?.disabledReason ?? '無法執行')
  const target = listTargets(save, action, ctx).find((t) => t.id === targetId)
  if (!target || target.disabledReason) return fail(target?.disabledReason ?? '找不到對象')

  let next: SaveData = { ...save, points: save.points - DAILY_COST }
  const effects: FarmEffect[] = []

  if (action === 'feedPond' || action === 'cleanPond') {
    const feed = action === 'feedPond'
    effects.push({ kind: 'pond', anim: feed ? 'feed' : 'clean' })
    for (const pet of next.pets) {
      if (SPECIES[pet.species].domain !== 'sea') continue
      const b = BALANCE.feedPond
      const delta: Delta = feed
        ? { satiety: b.satiety, mood: b.mood, weight: pet.satiety >= b.fatAbove ? b.fatGain : 0 }
        : { cleanliness: BALANCE.cleanPond.cleanliness, mood: BALANCE.cleanPond.mood }
      const r = applyDelta(pet, delta)
      next = replacePet(next, r.pet)
      effects.push(...r.floats)
    }
    return { save: next, effects }
  }

  const pet = next.pets.find((p) => p.id === targetId)!
  const sleeping = isSleeping(pet, ctx.hour, ctx.nowMs)
  const land = SPECIES[pet.species].domain === 'land'
  let delta: Delta = {}
  let anim: Extract<FarmEffect, { kind: 'anim' }>['anim'] | null = null
  let awakeUntil = pet.awakeUntil
  // 互動之後保持清醒；若仍在睡覺時間內，閒置超過 idleMinutes 就會自己回去睡
  const stayAwakeUntil = ctx.nowMs + BALANCE.sleep.idleMinutes * 60_000
  if (land && !(action === 'pet' && sleeping)) awakeUntil = stayAwakeUntil
  switch (action) {
    case 'feed': {
      const b = BALANCE.feed
      delta = { satiety: b.satiety, mood: b.mood, weight: pet.satiety >= b.fatAbove ? b.fatGain : 0 }
      anim = 'eat'
      break
    }
    case 'pet':
      // 睡夢中被摸：不會醒來（awakeUntil 不變），心情只小幅上升
      delta = { mood: sleeping ? BALANCE.petSleeping.mood : BALANCE.pet.mood }
      anim = 'pet'
      break
    case 'bath':
      delta = {
        cleanliness: BALANCE.bath.cleanliness,
        mood: pet.species === 'cat' ? BALANCE.bath.moodCat : BALANCE.bath.moodDog,
      }
      anim = 'bath'
      break
    case 'walk':
      delta = { ...BALANCE.walk }
      anim = 'walk'
      break
    case 'groom':
      delta = { ...BALANCE.groom }
      anim = 'groom'
      break
    case 'wake':
      delta = { mood: pet.species === 'cat' ? BALANCE.wake.moodCat : BALANCE.wake.moodDog }
      anim = 'wake'
      break
  }
  const r = applyDelta({ ...pet, awakeUntil }, delta)
  next = replacePet(next, r.pet)
  if (anim) effects.push({ kind: 'anim', petId: pet.id, anim })
  effects.push(...r.floats)
  return { save: next, effects }
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
    variant: sp.variants ? variantOf(req.species, req.variant)?.id : undefined,
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
