import { hourOf, weatherAt, type Weather } from './sim/worldTime'

/**
 * 世界時刻與天氣的覆寫值。正式環境永遠是 null（用本機實際時間）；
 * 只有開發環境的測試模式面板會寫入它。
 */
export const overrides: { hour: number | null; weather: Weather | null } = { hour: null, weather: null }

export function worldHour(nowMs: number): number {
  return overrides.hour ?? hourOf(new Date(nowMs))
}

export function worldWeather(nowMs: number): Weather {
  return overrides.weather ?? weatherAt(nowMs)
}
