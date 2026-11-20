/**
 * 外觀（v3.6.0 最小版）。每個外觀有穩定的 id（存檔 skins.owned／equipped 用）、套用的部位、外殼圖集裡的素材鍵名。
 * 之後的外觀商店（金幣購買）只要新增項目、購買時把 id 加進 owned；換裝介面改 equipped，不用動引擎的畫法。
 * 4.0-B1：外殼圖集依部位拆開、延後載入（SKIN_ATLAS）；id house.gold／tower.gold 不變（舊存檔照用），圖換成亞特蘭提斯。
 */
export type SkinPart = 'house' | 'tower'

/** 各部位的外殼圖集（延後載入，assets.LAZY_ATLASES）：穿上了才載入 */
export const SKIN_ATLAS: Readonly<Record<SkinPart, string>> = { house: 'skins_house', tower: 'skins_tower' }

export interface SkinDef {
  id: string
  part: SkinPart
  name: string
  /** 圖集 skins 的素材鍵名：關門／開門／夜晚（只有住家有夜晚版） */
  frames: { closed: string; open: string; night?: string }
}

export const SKINS: readonly SkinDef[] = [
  { id: 'house.gold', part: 'house', name: '亞特蘭提斯房屋', frames: { closed: 'house_atlantis_closed', open: 'house_atlantis_open', night: 'house_atlantis_night' } },
  { id: 'tower.gold', part: 'tower', name: '亞特蘭提斯鐘樓', frames: { closed: 'tower_atlantis', open: 'tower_atlantis_open' } },
]

export const skinDef = (id: string): SkinDef | undefined => SKINS.find((s) => s.id === id)

/** 目前穿著的外觀要載入哪些圖集（equipped 的值是外觀 id；不認得的略過） */
export function skinAtlasesFor(equipped: Readonly<Record<string, string>>): string[] {
  const out = new Set<string>()
  for (const id of Object.values(equipped)) {
    const d = skinDef(id)
    if (d) out.add(SKIN_ATLAS[d.part])
  }
  return [...out]
}
