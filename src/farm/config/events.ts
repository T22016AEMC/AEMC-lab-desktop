import { BALANCE } from './balance'
import { isCollected, itemDef, type Collection } from './items'

/**
 * 一次性事件（v3.6.0）：收藏集齊時觸發，旗標寫進存檔 events（事件 id → 觸發時間），有旗標就不再觸發。
 * 玩家事先不會被提示（收藏冊、說明文字都不能出現罰款的字樣），所以這個檔案的文字只給事件對話框用。
 * 罰款與違約金一次性、不扣到負數（實際扣的 = min(金幣, 罰款)）。
 */
export type EventId = 'dogLeak' | 'catContract' | 'dogVault' | 'catAtlantis'

export interface EventDef {
  id: EventId
  /** 哪種寵物集齊的（只是標示，觸發條件看收藏） */
  species: 'dog' | 'cat'
  kind: 'fine' | 'reward'
  title: string
  /** 對話框內文；coins = 實際扣掉（fine）或獲得（reward）的金幣 */
  body: (coins: number) => string
  /** 對話框顯示的圖（圖集 items 的素材鍵名） */
  images: string[]
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

export const EVENTS: readonly EventDef[] = [
  {
    id: 'dogLeak', species: 'dog', kind: 'fine', title: '某公司洩密訴訟',
    body: fineBody('你把機密文件拼回去了……某公司發現後提告，', '罰款 '), images: ['paper_dog'], met: (c) => have(c, 'U002'),
  },
  {
    id: 'catContract', species: 'cat', kind: 'fine', title: '某公司神秘合約違約',
    body: fineBody('你把合約拼好，才發現簽名的是你……', '違約金 '), images: ['paper_cat'], met: (c) => have(c, 'U009'),
  },
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
]

export const eventDef = (id: string): EventDef | undefined => EVENTS.find((e) => e.id === id)
