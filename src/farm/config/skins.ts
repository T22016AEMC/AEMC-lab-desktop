/**
 * 外觀（v3.6.0 最小版，4.0-B1 擴充成七個部位）。每個外觀有穩定的 id（存檔 skins.owned／equipped 用）、套用的部位、外殼圖集裡的素材鍵名。
 * 部位就是存檔 skins.equipped 的鍵（任意字串，不用改存檔格式）；沒有穿 = 原樣（預設圖）。
 * id house.gold／tower.gold（傳說獎勵）不變：v3.6.0 起的舊存檔照用，圖在 4.0-B1 換成亞特蘭提斯。
 * 主題外殼（商店賣）：id = 部位.主題（例如 kennel.forest）；外殼圖集依部位拆開、延後載入（SKIN_ATLAS）。
 */
export type SkinPart = 'house' | 'tower' | 'pond' | 'board' | 'kennel' | 'catTree' | 'bowls'

export const SKIN_PARTS: readonly SkinPart[] = ['house', 'tower', 'pond', 'board', 'kennel', 'catTree', 'bowls']

/** 各部位的外殼圖集（延後載入，assets.LAZY_ATLASES）：穿上了才載入，商店開「建築」分頁時也載入（卡片縮圖） */
export const SKIN_ATLAS: Readonly<Record<SkinPart, string>> = {
  house: 'skins_house',
  tower: 'skins_tower',
  pond: 'skins_pond',
  board: 'skins_board',
  kennel: 'skins_small',
  catTree: 'skins_small',
  bowls: 'skins_small',
}

/** 商店「建築」分頁裡各部位的小標題（同時是外殼商品的 group） */
export const SKIN_PART_GROUP: Readonly<Record<SkinPart, string>> = {
  house: '房子外裝',
  tower: '鐘樓外裝',
  pond: '池塘外裝',
  board: '公佈欄外裝',
  kennel: '狗窩外殼',
  catTree: '貓跳台外殼',
  bowls: '食盆外殼',
}
/** 部位的物件名稱（外觀名稱 = 主題名稱＋物件名稱） */
const PART_NOUN: Readonly<Record<SkinPart, string>> = { house: '房子', tower: '鐘樓', pond: '池塘', board: '公佈欄', kennel: '狗窩', catTree: '貓跳台', bowls: '食盆' }
/** 預設圖（原樣）的素材鍵名：商店「原樣」卡片的縮圖 */
export const PART_DEFAULT_FRAME: Readonly<Record<SkinPart, string>> = { house: 'house_closed', tower: 'clocktower', pond: 'pond', board: 'board', kennel: 'doghouse', catTree: 'cat_tree', bowls: 'bowls' }

export type ThemeId = 'atlantis' | 'cleanroom' | 'forest' | 'magic' | 'punk' | 'plaid'
export const THEME_NAME: Readonly<Record<ThemeId, string>> = { atlantis: '亞特蘭提斯', cleanroom: '無塵室', forest: '森林', magic: '魔法', punk: '龐克夜城', plaid: '野餐鄉村' }

export interface SkinDef {
  id: string
  part: SkinPart
  name: string
  theme: ThemeId
  /** 傳說獎勵（不在商店賣；拿到了才出現在換外觀的列表裡） */
  legend?: true
  /** 外殼圖集的素材鍵名：關門／開門／夜晚（住家有三張、鐘樓有關門開門，其他部位只有 closed） */
  frames: { closed: string; open?: string; night?: string }
}

const THEMES: readonly ThemeId[] = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']
/** 商店賣的主題：住家、鐘樓沒有亞特蘭提斯（那是傳說獎勵）；池塘、公佈欄、小建築六款都賣 */
const SHOP_THEMES: Readonly<Record<SkinPart, readonly ThemeId[]>> = {
  house: ['cleanroom', 'forest', 'magic', 'punk', 'plaid'],
  tower: ['cleanroom', 'forest', 'magic', 'punk', 'plaid'],
  pond: THEMES,
  board: THEMES,
  kennel: THEMES,
  catTree: THEMES,
  bowls: THEMES,
}
const frameOf = (part: SkinPart, t: ThemeId): SkinDef['frames'] => {
  switch (part) {
    case 'house':
      return { closed: `house_${t}_closed`, open: `house_${t}_open`, night: `house_${t}_night` }
    case 'tower':
      return { closed: `tower_${t}`, open: `tower_${t}_open` }
    case 'kennel':
      return { closed: `doghouse_${t}` }
    case 'catTree':
      return { closed: `cat_tree_${t}` }
    default:
      return { closed: `${part}_${t}` }
  }
}

export const SKINS: readonly SkinDef[] = [
  { id: 'house.gold', part: 'house', theme: 'atlantis', legend: true, name: '亞特蘭提斯房屋', frames: frameOf('house', 'atlantis') },
  { id: 'tower.gold', part: 'tower', theme: 'atlantis', legend: true, name: '亞特蘭提斯鐘樓', frames: frameOf('tower', 'atlantis') },
  ...SKIN_PARTS.flatMap((part) => SHOP_THEMES[part].map((t): SkinDef => ({ id: `${part}.${t}`, part, theme: t, name: THEME_NAME[t] + PART_NOUN[part], frames: frameOf(part, t) }))),
]

export const skinDef = (id: string): SkinDef | undefined => SKINS.find((s) => s.id === id)

/** 某個部位目前穿的外觀定義（沒穿或不認得 = undefined = 原樣） */
export function equippedSkinDef(equipped: Readonly<Record<string, string>>, part: SkinPart): SkinDef | undefined {
  const id = equipped[part]
  const d = id ? skinDef(id) : undefined
  return d && d.part === part ? d : undefined
}

/** 目前穿著的外觀要載入哪些圖集（equipped 的值是外觀 id；不認得的略過）。4.0-B2：環境主題 `env.<主題>` 載入 `env_<主題>`（地板、小路、遠景、路燈、樹） */
export function skinAtlasesFor(equipped: Readonly<Record<string, string>>): string[] {
  const out = new Set<string>()
  for (const id of Object.values(equipped)) {
    const d = skinDef(id)
    if (d) out.add(SKIN_ATLAS[d.part])
    else if (id.startsWith('env.') && (THEMES as readonly string[]).includes(id.slice(4))) out.add('env_' + id.slice(4))
    else if (id.startsWith('acc.')) out.add('acc') // 4.0-C 房屋與鐘樓配件（config/accessories.ts）
  }
  return [...out]
}
