import { BALANCE } from '../config/balance'
import type { EarningState, SaveData } from '../save/types'
import { todayKey } from './points'

/**
 * 賺金幣的規則（純函式，可在 Node 測試）。時間參數 nowMs 一律由呼叫端從遊戲時間來源傳入。
 * 純前端、存在瀏覽器，無法防作弊；之後帳號與雲端階段再處理，這裡不加額外機制。
 */

/**
 * 本地日期變了就把今日進度歸零（冷卻記錄 lastAward 跨日保留）。
 * gameCoins：v3.10.0 起小遊戲不再給金幣，這個欄位只為了和舊存檔、舊版程式相容而保留（照樣每天歸零，不再增加）。
 */
export function rollEarning(e: EarningState, today: string): EarningState {
  if (e.date === today) return e
  return { ...e, date: today, programCoins: 0, gameCoins: 0, digCoins: 0 }
}

/** 今日進度（給畫面顯示；已經依今天的日期歸零過） */
export function earningToday(save: SaveData, nowMs: number): { programCoins: number; programMax: number } {
  const e = rollEarning(save.earning, todayKey(nowMs))
  return { programCoins: e.programCoins, programMax: BALANCE.earn.program.dailyMax }
}

export interface EarnResult {
  save: SaveData
  /** 這次實際給了幾枚（0 = 沒給） */
  coins: number
  /** 沒給的原因（冷卻中、今日已達上限），給的時候是 null */
  reason: 'cooldown' | 'daily-max' | null
}

/**
 * 從啟動台開啟使用者的程式：每個程式每小時最多一次，所有程式合計每天上限。
 * 呼叫端只在「開啟成功」（window.open 沒被擋）時才呼叫。管理程式清單本身不給金幣。
 */
export function claimProgram(save: SaveData, appId: string, nowMs: number): EarnResult {
  const { coin, cooldownMs, dailyMax } = BALANCE.earn.program
  const e = rollEarning(save.earning, todayKey(nowMs))
  const rolled = e === save.earning ? save : { ...save, earning: e }
  const last = e.lastAward[appId]
  if (last !== undefined && nowMs - last < cooldownMs && nowMs >= last) return { save: rolled, coins: 0, reason: 'cooldown' }
  const room = dailyMax - e.programCoins
  if (room <= 0) return { save: rolled, coins: 0, reason: 'daily-max' }
  const coins = Math.min(coin, room)
  return {
    save: { ...rolled, points: rolled.points + coins, earning: { ...e, programCoins: e.programCoins + coins, lastAward: { ...e.lastAward, [appId]: nowMs } } },
    coins,
    reason: null,
  }
}
