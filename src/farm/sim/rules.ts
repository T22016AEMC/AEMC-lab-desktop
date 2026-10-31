import { PET_CAPACITY } from '../config/balance'
import { SPECIES, type SpeciesId } from '../config/species'
import type { Pet, SaveData } from '../save/types'
import { isSleepTime } from './worldTime'

export interface Check {
  ok: boolean
  reason?: string
}

/** 能不能領養：先看容量，再看金幣。第一隻免費（free） */
export function adoptCheck(save: Pick<SaveData, 'pets' | 'points'>, species: SpeciesId, free = false): Check {
  const sp = SPECIES[species]
  if (save.pets.length >= PET_CAPACITY) return { ok: false, reason: `寵物已滿（貓狗合計最多 ${PET_CAPACITY} 隻）` }
  if (!free && sp.cost > save.points) return { ok: false, reason: `金幣不足（需要 ${sp.cost} 金幣，目前 ${save.points} 金幣）` }
  return { ok: true }
}

/** 陸地寵物是否正在睡覺：在睡覺時間內，而且沒有被叫醒（或叫醒／互動後已閒置超過一段時間） */
export function isSleeping(pet: Pet, hour: number, nowMs: number): boolean {
  if (!isSleepTime(hour)) return false
  return !(pet.awakeUntil !== undefined && pet.awakeUntil > nowMs)
}
