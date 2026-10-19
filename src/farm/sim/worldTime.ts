import { BALANCE } from '../config/balance'

export type Phase = 'dawn' | 'day' | 'dusk' | 'night'
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow'

export const WEATHER_NAMES: Record<Weather, string> = { sunny: '晴天', cloudy: '多雲', rain: '下雨', snow: '下雪' }
export const PHASE_NAMES: Record<Phase, string> = { dawn: '清晨', day: '白天', dusk: '黃昏', night: '夜晚' }
/** 測試模式「切換時段」用的代表時刻 */
export const PHASE_HOURS: Record<Phase, number> = { dawn: 6.5, day: 12, dusk: 18.3, night: 23 }

/** 本機時間的小時（含小數），0 ≤ h < 24 */
export function hourOf(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

export function phaseOf(hour: number): Phase {
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 17) return 'day'
  if (hour >= 17 && hour < 19.5) return 'dusk'
  return 'night'
}

/** 夜晚：陸地寵物睡覺、池塘生物游得比較慢 */
export function isNight(hour: number): boolean {
  return phaseOf(hour) === 'night'
}

type RGB = [number, number, number]
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const rgb = (c: RGB, a = 1): string => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`

interface Key {
  h: number
  top: RGB
  bottom: RGB
  /** 場景變暗程度 0～1 */
  dark: number
  /** 星星可見度 0～1 */
  stars: number
}

const KEYS: Key[] = [
  { h: 0, top: hex('#0a0e2c'), bottom: hex('#1a2152'), dark: 0.55, stars: 1 },
  { h: 5, top: hex('#141a45'), bottom: hex('#2c3270'), dark: 0.5, stars: 0.9 },
  { h: 6.5, top: hex('#7f8fe0'), bottom: hex('#ffb88a'), dark: 0.15, stars: 0.1 },
  { h: 8, top: hex('#4fa3f0'), bottom: hex('#bfe3ff'), dark: 0, stars: 0 },
  { h: 12, top: hex('#3b93ee'), bottom: hex('#aee0ff'), dark: 0, stars: 0 },
  { h: 17, top: hex('#4a9cee'), bottom: hex('#c4e6ff'), dark: 0, stars: 0 },
  { h: 18.5, top: hex('#6b5aa8'), bottom: hex('#ff9a6b'), dark: 0.2, stars: 0.15 },
  { h: 20, top: hex('#1f2455'), bottom: hex('#3d3b7c'), dark: 0.45, stars: 0.8 },
  { h: 21.5, top: hex('#0a0e2c'), bottom: hex('#1a2152'), dark: 0.55, stars: 1 },
  { h: 24, top: hex('#0a0e2c'), bottom: hex('#1a2152'), dark: 0.55, stars: 1 },
]

export interface SkyState {
  top: RGB
  bottom: RGB
  dark: number
  stars: number
}

/** 依時刻在關鍵影格之間平滑內插天空顏色 */
export function skyAt(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24
  let i = 0
  while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const t = (h - a.h) / (b.h - a.h)
  const e = t * t * (3 - 2 * t) // smoothstep
  return {
    top: mix(a.top, b.top, e),
    bottom: mix(a.bottom, b.bottom, e),
    dark: a.dark + (b.dark - a.dark) * e,
    stars: a.stars + (b.stars - a.stars) * e,
  }
}

function hash32(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** 每隔數小時換一次天氣；用時間區段當種子，所以重新整理不會跳變，也不用連網 */
export function weatherAt(ms: number): Weather {
  const block = Math.floor(ms / (BALANCE.weatherBlockHours * 3_600_000))
  const w = BALANCE.weatherWeights
  const total = w.sunny + w.cloudy + w.rain + w.snow
  let r = (hash32(block) / 4294967296) * total
  for (const k of ['sunny', 'cloudy', 'rain', 'snow'] as const) {
    if (r < w[k]) return k
    r -= w[k]
  }
  return 'sunny'
}
