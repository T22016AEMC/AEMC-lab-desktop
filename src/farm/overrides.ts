import { hourOf, weatherAt, type Weather } from './sim/worldTime'
import { hasSunnyDoll } from './config/accessories'
import type { SaveData } from './save/types'

/**
 * 世界時刻、天氣與時鐘的覆寫值。正式環境永遠是 null／0（用本機實際時間）；
 * 只有開發環境的測試模式面板（與自動化測試）會寫入它。
 */
export const overrides: { hour: number | null; weather: Weather | null; nowOffsetMs: number; hover: HoverOverrides } = {
  hour: null,
  weather: null,
  nowOffsetMs: 0,
  hover: { off: { look: false, approach: false, retreat: false, pat: false, label: false, swat: false }, swatChance: null },
}

/**
 * 滑鼠互動（v3.8.1）的測試覆寫：off = 單項關掉（6 項各一個）；swatChance = 取代「貓拍、狗吠」的機率（例如 1＝必定、0＝不會）。
 * 正式環境永遠是預設（全部沒關、機率 null＝用 BALANCE.hover.swatChance）；只有開發環境的測試模式面板（與自動化測試）會寫入。
 */
export interface HoverOverrides {
  off: Record<'look' | 'approach' | 'retreat' | 'pat' | 'label' | 'swat', boolean>
  swatChance: number | null
}

/**
 * 遊戲時間來源：賺金幣的冷卻與每日上限、食盆每日份量、每日獎勵等一律用它，不直接用 Date.now()。
 * 正式環境等於 Date.now()；測試模式可以平移（nowOffsetMs）來快轉到隔天或隔小時。
 */
export function gameNow(): number {
  return Date.now() + overrides.nowOffsetMs
}

export function worldHour(nowMs: number): number {
  return overrides.hour ?? hourOf(new Date(nowMs))
}

/**
 * 現在的天氣（唯一的入口：畫面、野餐、結算都走這個函式）。4.0-C：save 有掛著晴天娃娃 → 下雨機率 −5%、晴天機率 +5%（weatherAt 的 sunnyDoll）；
 * 一律傳存檔（沒有存檔 = null），不要自己呼叫 weatherAt。測試模式的 overrides.weather 優先。
 */
export function worldWeather(nowMs: number, save: Pick<SaveData, 'skins'> | null | undefined): Weather {
  return overrides.weather ?? weatherAt(nowMs, hasSunnyDoll(save))
}
