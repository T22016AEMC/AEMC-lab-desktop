import { hourOf, weatherAt, type Weather } from './sim/worldTime'

/**
 * 世界時刻、天氣與時鐘的覆寫值。正式環境永遠是 null／0（用本機實際時間）；
 * 只有開發環境的測試模式面板（與自動化測試）會寫入它。
 */
export const overrides: { hour: number | null; weather: Weather | null; nowOffsetMs: number } = { hour: null, weather: null, nowOffsetMs: 0 }

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

export function worldWeather(nowMs: number): Weather {
  return overrides.weather ?? weatherAt(nowMs)
}
