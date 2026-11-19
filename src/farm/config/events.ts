import { BALANCE } from './balance'
import { ITEMS, isCollected, itemDef, type Collection, type Rarity } from './items'

/**
 * 一次性事件（v3.6.0）：收藏集齊時觸發，旗標寫進存檔 events（事件 id → 觸發時間），有旗標就不再觸發。
 * 玩家事先不會被提示（收藏冊、說明文字都不能出現罰款的字樣），所以這個檔案的文字只給事件對話框用。
 * 罰款與違約金一次性、不扣到負數（實際扣的 = min(金幣, 罰款)）。
 */
export type EventId = 'dogLeak' | 'catContract' | 'dogVault' | 'catAtlantis' | 'colCommon' | 'colUncommon' | 'colRare' | 'colLegend' | 'colAll'

export interface EventDef {
  id: EventId
  /** 哪種寵物集齊的（只是標示，觸發條件看收藏）；v4.0 的收藏集齊獎勵不分貓狗，沒有這個欄位 */
  species?: 'dog' | 'cat'
  kind: 'fine' | 'reward'
  title: string
  /** 對話框內文；coins = 實際扣掉（fine）或獲得（reward）的金幣 */
  body: (coins: number) => string
  /** 對話框顯示的圖（圖集 items 的素材鍵名） */
  images: string[]
  /** 獎勵金幣（reward 才有；沒有 = BALANCE.dig.events.legendReward，舊的傳說配對事件） */
  coins?: number
  /** v4.0 收藏集齊獎勵：載入時會補發給已經達成的老玩家（舊的罰款、傳說配對事件不在載入時檢查） */
  retro?: true
  /** 外觀獎勵（reward 才有）：加進 skins.owned 並自動穿上 */
  skin?: string
  /** 條件：收藏是否達成 */
  met: (col: Collection) => boolean
}

const have = (col: Collection, id: string): boolean => {
  const d = itemDef(id)
  return d ? isCollected(col, d) : false
}

const fineBody = (lead: string, what: string) => (coins: number): string =>
  coins >= BALANCE.dig.events.fine ? `${lead}${what}${BALANCE.dig.events.fine} 金幣。` : `${lead}${what}${BALANCE.dig.events.fine} 金幣。你身上只有 ${coins} 金幣，全部沒收，不會扣到負數。`

/** 某個稀有度的項目全部集齊（套組要 6 片都至少 1 片） */
const allOf = (c: Collection, r?: Rarity): boolean => ITEMS.filter((d) => !r || d.rarity === r).every((d) => isCollected(c, d))

const R = BALANCE.dig.collectionRewards
const setReward = (id: EventId, title: string, coins: number, text: string, met: (c: Collection) => boolean): EventDef => ({
  id, kind: 'reward', title, coins, retro: true, images: [], body: (n) => `${text}獲得 ${n} 金幣。`, met,
})

/**
 * 事件的固定順序（checkEvents 依這個陣列逐一處理；同一次揭曉觸發多個事件時就是這個順序）：
 * 罰款先於獎勵 → 收藏集齊（常見、少見、稀有：等級由低到高）→ 傳說配對（狗、貓）→ 傳說全集齊 → 全圖鑑。
 */
export const EVENTS: readonly EventDef[] = [
  {
    id: 'dogLeak', species: 'dog', kind: 'fine', title: '某公司洩密訴訟',
    body: fineBody('你把機密文件拼回去了……某公司發現後提告，', '罰款 '), images: ['paper_dog'], met: (c) => have(c, 'U002'),
  },
  {
    id: 'catContract', species: 'cat', kind: 'fine', title: '某公司神秘合約違約',
    body: fineBody('你把合約拼好，才發現簽名的是你……', '違約金 '), images: ['paper_cat'], met: (c) => have(c, 'U009'),
  },
  setReward('colCommon', '常見寶物收集完成！', R.common, '10 種常見寶物都找到了，', (c) => allOf(c, 'common')),
  setReward('colUncommon', '少見寶物收集完成！', R.uncommon, '連兩套碎片在內，9 種少見寶物都湊齊了，', (c) => allOf(c, 'uncommon')),
  setReward('colRare', '稀有寶物收集完成！', R.rare, '5 種稀有寶物全數到手，', (c) => allOf(c, 'rare')),
  {
    id: 'dogVault', species: 'dog', kind: 'reward', title: '保險箱打開了！',
    body: (coins) => `裡面有 ${coins} 金幣，還有一張金色屋頂的設計圖。屋頂換成金色了。`, images: ['item_L001', 'item_L002'], skin: 'house.gold',
    met: (c) => have(c, 'L001') && have(c, 'L002'),
  },
  {
    id: 'catAtlantis', species: 'cat', kind: 'reward', title: '亞特蘭提斯的力量',
    body: (coins) => `雷射與山銅合而為一，鐘樓變成黃金鐘樓了。獲得 ${coins} 金幣。`, images: ['item_L003', 'item_L004'], skin: 'tower.gold',
    met: (c) => have(c, 'L003') && have(c, 'L004'),
  },
  setReward('colLegend', '傳說寶物全數到齊！', R.legendary, '保險箱鑰匙、保險箱、亞特蘭提斯雷射、山銅都收進收藏冊了，', (c) => allOf(c, 'legendary')),
  setReward('colAll', '收藏冊全部完成！', R.all, '28 種寶物全部收集完成，你是真正的寶物獵人。', (c) => allOf(c)),
]

/** v4.0 收藏集齊獎勵的事件 id（載入時補發只查這些） */
export const RETRO_EVENT_IDS: readonly EventId[] = EVENTS.filter((e) => e.retro).map((e) => e.id)

/** 收藏冊各等級的集齊獎勵（事件 id 與金幣）；罰款不在這裡（收藏冊不顯示） */
export const RARITY_REWARD: Record<Rarity, { id: EventId; coins: number }> = {
  common: { id: 'colCommon', coins: R.common },
  uncommon: { id: 'colUncommon', coins: R.uncommon },
  rare: { id: 'colRare', coins: R.rare },
  legendary: { id: 'colLegend', coins: R.legendary },
}
export const ALL_REWARD = { id: 'colAll' as EventId, coins: R.all }

export const eventDef = (id: string): EventDef | undefined => EVENTS.find((e) => e.id === id)
