import { BALANCE } from '../config/balance'
import { EVENTS, RETRO_EVENT_IDS, type EventDef, type EventId } from '../config/events'
import { isCollected, itemDef, itemsFor, shardKey, shardsHave, type ItemDef, type Rarity } from '../config/items'
import { skinDef } from '../config/skins'
import { instanceId } from '../config/layoutItems'
import type { SpeciesId } from '../config/species'
import type { Find, SaveData } from '../save/types'
import { rollEarning } from './earning'
import { todayKey } from './points'

/**
 * 挖寶與尋寶的規則（純函式，可在 Node 測試）。時間參數 nowMs 一律由呼叫端從遊戲時間來源傳入，亂數由呼叫端傳入。
 * 流程：玩耍時留下寶物（addFind）→ 玩家點開或 10 分鐘到期（revealFind／revealDue）→ 抽選、發金幣、記收藏、檢查事件。
 */

export type Coin = 'bronze' | 'silver' | 'gold'

/** 揭曉的結果。coin.value 是實際給的金幣（每日上限只剩一點時比面額少）；capped = 擲到金幣但今日已達上限，改成空 */
export type RevealResult =
  | { kind: 'empty'; capped?: boolean }
  | { kind: 'coin'; coin: Coin; value: number }
  | { kind: 'item'; id: string; shard?: number; isNew: boolean; have?: number; total?: number }

/** 事件對話框的資料（只在記憶體，不進存檔）：coins = 實際扣掉（罰款）或獲得（獎勵）的金幣 */
export interface EventNotice {
  /** 'retroBatch' = 載入時一次補發 2 個以上的收藏獎勵，合併成一個彈窗（各項在 parts） */
  id: EventId | 'retroBatch'
  coins: number
  /** v4.0：載入時補發的（彈窗開頭寫「更新補發：」）；揭曉當下觸發的沒有這個欄位 */
  retro?: true
  /** retroBatch 的各項（依事件順序） */
  parts?: { id: EventId; coins: number }[]
}

export interface RevealOutcome {
  save: SaveData
  find: Find
  result: RevealResult
  notices: EventNotice[]
}

/** 擲「結果」：金幣（銅板、銀幣、金幣）→ 收藏品（四種稀有度）→ 否則空。總和 100%（空 = 剩下的 28%） */
export function rollOutcome(rand: () => number): { kind: 'empty' } | { kind: 'coin'; coin: Coin } | { kind: 'item'; rarity: Rarity } {
  const p = BALANCE.dig
  const r = rand()
  let acc = 0
  for (const c of ['bronze', 'silver', 'gold'] as const) {
    acc += p.coin[c]
    if (r < acc) return { kind: 'coin', coin: c }
  }
  const weights: [Rarity, number][] = [
    ['common', p.rarity.common],
    ['uncommon', p.rarity.uncommon],
    ['rare', p.rarity.rare],
    ['legendary', p.rarity.legendary],
  ]
  for (const [rarity, w] of weights) {
    acc += w
    if (r < acc) return { kind: 'item', rarity }
  }
  return { kind: 'empty' }
}

const pickOf = <T>(arr: readonly T[], rand: () => number): T => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))]

/**
 * 在這個稀有度挑一個項目：只從這種寵物抽得到的項目（共用＋自己的專屬）；
 * 70%（antiDup）只從「尚未收集」的挑，已收集的仍可重複抽到。套組抽到後分片也一樣偏向缺的那一片。
 */
export function pickItem(species: SpeciesId, rarity: Rarity, col: Readonly<Record<string, number>>, rand: () => number): { def: ItemDef; shard?: number } {
  const pool = itemsFor(species, rarity)
  const missing = pool.filter((d) => !isCollected(col, d))
  const def = missing.length > 0 && rand() < BALANCE.dig.antiDup ? pickOf(missing, rand) : pickOf(pool, rand)
  if (!def.shards) return { def }
  const lacking: number[] = []
  for (let i = 1; i <= def.shards; i++) if ((col[shardKey(def.id, i)] ?? 0) < 1) lacking.push(i)
  const shard = lacking.length > 0 && rand() < BALANCE.dig.antiDup ? pickOf(lacking, rand) : 1 + Math.min(def.shards - 1, Math.floor(rand() * def.shards))
  return { def, shard }
}

/** 還能領的金幣：今天（用揭曉當下的本機日期）已經從挖寶領了多少，上限 BALANCE.dig.dailyCoinMax */
export function digCoinRoom(save: SaveData, nowMs: number): number {
  const e = rollEarning(save.earning, todayKey(nowMs))
  return Math.max(0, BALANCE.dig.dailyCoinMax - e.digCoins)
}

/** 今日挖寶金幣進度（給提示用） */
export function digCoinsToday(save: SaveData, nowMs: number): { coins: number; max: number } {
  return { coins: rollEarning(save.earning, todayKey(nowMs)).digCoins, max: BALANCE.dig.dailyCoinMax }
}

/** 還在持有的寶物是否已滿（available = 這個視窗放得下的上限，見 pixel/finds.ts 的 findCap） */
export function findsFull(save: SaveData, cap: number = BALANCE.dig.holdMax): boolean {
  return save.finds.length >= Math.min(BALANCE.dig.holdMax, Math.max(0, cap))
}

export const FULL_MESSAGE = '先點開土堆'
/** 草地完全放不下寶物（上限 0）時的提示（v3.9.0：場景固定，原因只會是擺設太多） */
/**
 * v4.0 文字：擺設太多（商店可以買到 60 個裝飾）讓寶物放不下。v3.9.0 起場景固定 640×320、和視窗大小無關，
 * 所以原因只會是擺設太多（沒有「視窗太小」的情況，也不提示放大視窗）。
 */
export const TOO_SMALL_MESSAGE = '擺設太多，放不下寶物，請收起一些擺設'
/** 擺設太多讓上限變小、而且已經滿了 */
export const crowdedFullMessage = (cap: number): string => `擺設太多，寶物最多放 ${cap} 個，先點開土堆`
/** 玩耍途中找不到地方埋寶物（提前結束時的提示） */
export const NO_SPOT_MESSAGE = '擺設太多，找不到地方埋寶物，請收起一些擺設'
/**
 * 現在不能開始挖寶、尋寶的原因（寶物已滿或草地放不下）；可以 = null。
 * 已有的寶物比上限多時（擺設變擠了）全部保留，只是不能再挖。
 */
export function findsBlock(save: SaveData, cap: number = BALANCE.dig.holdMax): string | null {
  if (cap <= 0) return TOO_SMALL_MESSAGE
  if (!findsFull(save, cap)) return null
  return cap < BALANCE.dig.holdMax ? crowdedFullMessage(cap) : FULL_MESSAGE
}

export function makeFindId(nowMs: number, rand: () => number): string {
  return 'f' + nowMs.toString(36) + Math.floor(rand() * 46656).toString(36).padStart(3, '0')
}

/** 留下一個寶物。滿了（holdMax）回傳 null，存檔不變 */
export function addFind(save: SaveData, find: Find): SaveData | null {
  if (save.finds.length >= BALANCE.dig.holdMax || save.finds.some((f) => f.id === find.id)) return null
  return { ...save, finds: [...save.finds, find] }
}

/** 套用事件：條件達成而且還沒觸發過的，依序觸發（罰款不扣到負數；獎勵給金幣＋外觀） */
export function checkEvents(save: SaveData, nowMs: number, only?: readonly EventId[]): { save: SaveData; notices: EventNotice[] } {
  let s = save
  const notices: EventNotice[] = []
  for (const ev of EVENTS) {
    if (only && !only.includes(ev.id)) continue
    if (s.events[ev.id] !== undefined || !ev.met(s.collection)) continue
    s = applyEvent(s, ev, nowMs, notices)
  }
  return { save: s, notices }
}

function applyEvent(save: SaveData, ev: EventDef, nowMs: number, notices: EventNotice[]): SaveData {
  const events = { ...save.events, [ev.id]: nowMs }
  if (ev.kind === 'fine') {
    const coins = Math.min(save.points, BALANCE.dig.events.fine)
    notices.push({ id: ev.id, coins })
    return { ...save, points: save.points - coins, events }
  }
  const coins = ev.coins ?? BALANCE.dig.events.legendReward
  notices.push({ id: ev.id, coins })
  let skins = save.skins
  const def = ev.skin ? skinDef(ev.skin) : undefined
  if (ev.skin && def) {
    skins = {
      owned: skins.owned.includes(ev.skin) ? skins.owned : [...skins.owned, ev.skin],
      equipped: { ...skins.equipped, [def.part]: ev.skin },
    }
  }
  // 4.0-C 擺設獎勵（傳說展示台）：新的實例「種類#編號」加進 shop.decor（沒有擺放紀錄 = 放進倉庫）
  let shop = save.shop
  if (ev.decor) {
    const cur = save.shop ?? { decor: [], nextDecorId: 1 }
    shop = { decor: [...cur.decor, { id: instanceId(ev.decor, cur.nextDecorId), kind: ev.decor }], nextDecorId: cur.nextDecorId + 1 }
  }
  return { ...save, points: save.points + coins, events, skins, ...(shop ? { shop } : {}) }
}

/**
 * v4.0 載入時補發（老玩家）：只查收藏集齊獎勵（RETRO_EVENT_IDS），已達成而且旗標沒設的才發；旗標保證只發一次，
 * 未達成的不會發。舊的罰款、傳說配對事件不在這裡檢查（它們只在揭曉時觸發）。通知帶 retro。
 */
export function retroEvents(save: SaveData, nowMs: number): { save: SaveData; notices: EventNotice[] } {
  const r = checkEvents(save, nowMs, RETRO_EVENT_IDS)
  // 只有 1 個：沿用原本的彈窗；2 個以上：合併成一個彈窗，列出各項與總金額
  if (r.notices.length <= 1) return { save: r.save, notices: r.notices.map((n) => ({ ...n, retro: true as const })) }
  const parts = r.notices.map((n) => ({ id: n.id as EventId, coins: n.coins }))
  return { save: r.save, notices: [{ id: 'retroBatch', coins: parts.reduce((a, p) => a + p.coins, 0), retro: true, parts }] }
}

/** 揭曉一個寶物：抽選、發金幣（受每日上限）、記收藏、檢查事件、把它從清單拿掉。找不到這個寶物回傳 null */
export function revealFind(save: SaveData, id: string, nowMs: number, rand: () => number): RevealOutcome | null {
  const find = save.finds.find((f) => f.id === id)
  if (!find) return null
  const rolled = rollOutcome(rand)
  let next: SaveData = { ...save, finds: save.finds.filter((f) => f.id !== id) }
  let result: RevealResult
  if (rolled.kind === 'coin') {
    const e = rollEarning(next.earning, todayKey(nowMs))
    const value = Math.min(BALANCE.dig.coinValue[rolled.coin], Math.max(0, BALANCE.dig.dailyCoinMax - e.digCoins))
    if (value <= 0) result = { kind: 'empty', capped: true }
    else {
      result = { kind: 'coin', coin: rolled.coin, value }
      next = { ...next, points: next.points + value, earning: { ...e, digCoins: e.digCoins + value } }
    }
    if (value <= 0 && e !== next.earning) next = { ...next, earning: e }
  } else if (rolled.kind === 'item') {
    const { def, shard } = pickItem(find.by, rolled.rarity, next.collection, rand)
    const key = shard ? shardKey(def.id, shard) : def.id
    const before = next.collection[key] ?? 0
    next = { ...next, collection: { ...next.collection, [key]: before + 1 } }
    result = { kind: 'item', id: def.id, ...(shard ? { shard, have: shardsHave(next.collection, def), total: def.shards } : {}), isNew: before === 0 }
  } else result = { kind: 'empty' }
  const ev = checkEvents(next, nowMs)
  return { save: ev.save, find, result, notices: ev.notices }
}

/** 已經過了 10 分鐘的寶物（現在時間比建立時間早的不算：時鐘被調回去就多活一陣子） */
export function dueFinds(save: SaveData, nowMs: number): Find[] {
  return save.finds.filter((f) => nowMs - f.at >= BALANCE.dig.autoRevealMs)
}

/** 到期的全部自動揭曉（載入時、每 10 秒的結算都呼叫）。揭曉後 finds 已經拿掉，所以同一天載入多次不會重複結算 */
export function revealDue(save: SaveData, nowMs: number, rand: () => number): { save: SaveData; revealed: RevealOutcome[]; notices: EventNotice[] } {
  let s = save
  const revealed: RevealOutcome[] = []
  const notices: EventNotice[] = []
  for (const f of dueFinds(save, nowMs)) {
    const r = revealFind(s, f.id, nowMs, rand)
    if (!r) continue
    s = r.save
    revealed.push(r)
    notices.push(...r.notices)
  }
  return { save: s, revealed, notices }
}

/** 揭曉結果的一句話提示（Toast 用）。不含任何事件相關文字 */
export function resultText(r: RevealResult, nowCoinsToday?: { coins: number; max: number }): string {
  switch (r.kind) {
    case 'empty':
      return r.capped ? '什麼也沒有（今天的挖寶金幣已達上限）' : '什麼也沒有'
    case 'coin':
      return `挖到 ${r.coin === 'bronze' ? '銅板' : r.coin === 'silver' ? '銀幣' : '金幣'}，+${r.value} 金幣` + (nowCoinsToday ? `（今日 ${nowCoinsToday.coins}/${nowCoinsToday.max}）` : '')
    case 'item': {
      const d = itemDef(r.id)
      const name = d?.name ?? r.id
      if (r.shard) return `${r.isNew ? '新寶物：' : ''}${name} 第 ${r.shard} 片（${r.have}/${r.total}）`
      return r.isNew ? `新寶物：${name}！` : `${name} +1`
    }
  }
}

