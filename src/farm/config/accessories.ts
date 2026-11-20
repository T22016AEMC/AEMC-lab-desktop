import type { SaveData } from '../save/types'

/**
 * 4.0-C 房屋與鐘樓配件（商店「建築」分頁的「房屋配件」「鐘樓配件」列）。沿用外觀機制（存檔 skins.owned／equipped，不新增存檔欄位）：
 * 配件 id `acc.<名稱>` 放在 skins.owned；掛上的放在 skins.equipped 的四個「位置」（slot）：
 *  - houseDoll（晴天娃娃，買一次，掛在屋簷下左邊）、houseSign（門牌 A／B／C，同時只能掛一個，可切換或取下）
 *  - towerBellman（敲鐘人，買一次，站在鐘樓底部右側）、towerFlag（旗幟 A／B／C，同時只能掛一個，可切換或取下）
 * 配件畫在目前穿著的房屋／鐘樓（含亞特蘭提斯與各主題外殼）上，位置是「相對素材左上角」的固定座標（所有房屋外觀都是 139×134、鐘樓都是 123×160，門、窗、鐘面位置共用，
 * 所以同一組座標對每個外觀都不會蓋到門、窗點擊區與鐘面；測試逐外觀驗證）。素材在延後載入的圖集 `acc`（買了或開商店建築分頁才載入）。
 */
export type AccSlot = 'houseDoll' | 'houseSign' | 'towerBellman' | 'towerFlag'
export type AccPart = 'house' | 'tower'

export interface AccDef {
  id: string
  slot: AccSlot
  part: AccPart
  name: string
  price: number
  /** 圖集 acc 的素材鍵名 */
  frame: string
}

export const ACCESSORIES: readonly AccDef[] = [
  { id: 'acc.doll', slot: 'houseDoll', part: 'house', name: '晴天娃娃', price: 10, frame: 'acc_doll' },
  { id: 'acc.sign_home', slot: 'houseSign', part: 'house', name: 'HOME 門牌', price: 3, frame: 'acc_sign_home' },
  { id: 'acc.sign_paw', slot: 'houseSign', part: 'house', name: '貓爪狗骨頭門牌', price: 3, frame: 'acc_sign_paw' },
  { id: 'acc.sign_lab', slot: 'houseSign', part: 'house', name: 'AEMC LAB 門牌', price: 3, frame: 'acc_sign_lab' },
  { id: 'acc.bellman', slot: 'towerBellman', part: 'tower', name: '敲鐘人', price: 6, frame: 'acc_bellman' },
  { id: 'acc.flag_paw', slot: 'towerFlag', part: 'tower', name: '腳印旗幟', price: 3, frame: 'acc_flag_paw' },
  { id: 'acc.flag_clock', slot: 'towerFlag', part: 'tower', name: '時鐘旗幟', price: 3, frame: 'acc_flag_clock' },
  { id: 'acc.flag_aemc', slot: 'towerFlag', part: 'tower', name: 'AEMC 旗幟', price: 3, frame: 'acc_flag_aemc' },
]

export const ACC_SLOTS: readonly AccSlot[] = ['houseDoll', 'houseSign', 'towerBellman', 'towerFlag']
export const ACC_SLOT_GROUP: Readonly<Record<AccSlot, string>> = {
  houseDoll: '房屋配件：晴天娃娃',
  houseSign: '房屋配件：門牌',
  towerBellman: '鐘樓配件：敲鐘人',
  towerFlag: '鐘樓配件：旗幟',
}
/** 「不掛」卡片的縮圖：房屋／鐘樓的預設圖 */
export const ACC_DEFAULT_FRAME: Readonly<Record<AccSlot, string>> = { houseDoll: 'house_closed', houseSign: 'house_closed', towerBellman: 'clocktower', towerFlag: 'clocktower' }
export const ACC_ATLAS = 'acc'
export const ACC_DOLL = 'acc.doll'

const BY_ID: ReadonlyMap<string, AccDef> = new Map(ACCESSORIES.map((d) => [d.id, d]))
export const accDef = (id: string | undefined): AccDef | undefined => (id ? BY_ID.get(id) : undefined)
export const isAccId = (id: string): boolean => id.startsWith('acc.')

/**
 * 掛點（相對房屋／鐘樓素材左上角的像素座標）。素材錨點：doll、sign = 上方中心（掛點）；bellman、flag = 底部（腳底、旗桿底）。
 *  - 晴天娃娃掛在屋簷下左邊（門 x 36～63 的左側）、門牌掛在門與右邊窗戶之間的牆上（門的右側）
 *  - 旗幟的旗桿插在主塔頂的右端（窗戶 56～69 × 38～54、鐘面、塔門都在它下面）、敲鐘人站在塔底右側灌木前（塔門 x 49～74、招牌 x 68～92 × 126～142 的右邊）
 */
export const ACC_MOUNT: Readonly<Record<AccSlot, { x: number; y: number }>> = {
  houseDoll: { x: 12, y: 66 },
  houseSign: { x: 77, y: 78 },
  towerBellman: { x: 104, y: 158 },
  towerFlag: { x: 83, y: 31 },
}

/** 現在有掛著晴天娃娃嗎（掛著才有天氣加成；取下就沒有） */
export const hasSunnyDoll = (save: Pick<SaveData, 'skins'> | null | undefined): boolean => save?.skins.equipped.houseDoll === ACC_DOLL
