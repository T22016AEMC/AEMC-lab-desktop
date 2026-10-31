/**
 * 外觀（v3.6.0 最小版）。每個外觀有穩定的 id（存檔 skins.owned／equipped 用）、套用的部位、圖集 skins 裡的素材鍵名。
 * 之後的外觀商店（金幣購買）只要新增項目、購買時把 id 加進 owned；換裝介面改 equipped，不用動引擎的畫法。
 */
export type SkinPart = 'house' | 'tower'

export interface SkinDef {
  id: string
  part: SkinPart
  name: string
  /** 圖集 skins 的素材鍵名：關門／開門／夜晚（只有住家有夜晚版） */
  frames: { closed: string; open: string; night?: string }
}

export const SKINS: readonly SkinDef[] = [
  { id: 'house.gold', part: 'house', name: '金色屋頂', frames: { closed: 'house_gold_closed', open: 'house_gold_open', night: 'house_gold_night' } },
  { id: 'tower.gold', part: 'tower', name: '黃金鐘樓', frames: { closed: 'clocktower_gold', open: 'clocktower_open_gold' } },
]

export const skinDef = (id: string): SkinDef | undefined => SKINS.find((s) => s.id === id)
