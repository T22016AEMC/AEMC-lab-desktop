import { LAND_CAPACITY, POND_CAPACITY } from '../config/balance'
import { SPECIES, type SpeciesId } from '../config/species'
import type { Pet, SaveData } from '../save/types'
import { isSleepTime } from './worldTime'

export const landUsed = (pets: Pet[]): number => pets.filter((p) => SPECIES[p.species].domain === 'land').length
export const pondUsed = (pets: Pet[]): number =>
  pets.reduce((n, p) => (SPECIES[p.species].domain === 'sea' ? n + SPECIES[p.species].slots : n), 0)

export interface Check {
  ok: boolean
  reason?: string
}

/** 能不能領養：先看容量，再看點數。第一隻免費（free） */
export function adoptCheck(save: Pick<SaveData, 'pets' | 'points'>, species: SpeciesId, free = false): Check {
  const sp = SPECIES[species]
  if (sp.domain === 'land') {
    if (landUsed(save.pets) >= LAND_CAPACITY) return { ok: false, reason: `陸地已滿（貓狗合計最多 ${LAND_CAPACITY} 隻）` }
  } else {
    const left = POND_CAPACITY - pondUsed(save.pets)
    if (sp.slots > left) return { ok: false, reason: `池塘容量不足（剩 ${left} 格，需要 ${sp.slots} 格）` }
  }
  if (!free && sp.cost > save.points) return { ok: false, reason: `點數不足（需要 ${sp.cost} 點，目前 ${save.points} 點）` }
  return { ok: true }
}

/** 陸地寵物是否正在睡覺：在睡覺時間內，而且沒有被叫醒（或叫醒／互動後已閒置超過一段時間） */
export function isSleeping(pet: Pet, hour: number, nowMs: number): boolean {
  if (SPECIES[pet.species].domain !== 'land') return false
  if (!isSleepTime(hour)) return false
  return !(pet.awakeUntil !== undefined && pet.awakeUntil > nowMs)
}
