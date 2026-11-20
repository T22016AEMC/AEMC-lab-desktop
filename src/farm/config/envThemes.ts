import { THEME_NAME, type ThemeId } from './skins'

/**
 * 4.0-B2 環境主題：地板＋小路＋遠景＋路燈＋樹一起買（一次 30 金幣）、買了可以切換（含原樣草地）。
 * 外觀 id = `env.<主題>`（存檔 skins.owned／equipped.env；預設草地 `env.grass` 不寫進存檔），圖集 `env_<主題>`（延後載入，穿上了才載入）、
 * 商店縮圖圖集 `env_thumbs`（開商店的裝飾品分頁才載入）。主題順序一律：亞特蘭提斯、無塵室、森林、魔法、龐克、野餐鄉村。
 */
export const ENV_THEME_IDS: readonly ThemeId[] = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']
export const envSkinId = (t: ThemeId): string => 'env.' + t
export const envThemeOf = (skinId: string | undefined): ThemeId | null => {
  const t = skinId && skinId.startsWith('env.') ? skinId.slice(4) : ''
  return (ENV_THEME_IDS as readonly string[]).includes(t) ? (t as ThemeId) : null
}
export const envAtlas = (t: ThemeId): string => 'env_' + t
export const ENV_THUMB_ATLAS = 'env_thumbs'
/** 商店環境主題卡片的縮圖鍵名（原樣＝草地用 envthumb_grass） */
export const envThumb = (t: ThemeId | 'grass'): string => 'envthumb_' + t
export const envName = (t: ThemeId): string => THEME_NAME[t]

export interface EnvKeys {
  far: string
  floor: string
  path: string
  lamp: string
  tree: string
}
export const envKeys = (t: ThemeId): EnvKeys => ({ far: `far_${t}`, floor: `floor_${t}`, path: `path_${t}`, lamp: `lamp_${t}`, tree: `tree_${t}` })

/** 遠景是「看窗外」的主題（牆填滿整張高度、只有窗玻璃透明）：雨雪畫在雲之後、遠景之前，只出現在窗玻璃裡（其他主題的畫圖順序不變） */
export const ENV_WINDOW_THEMES: ReadonlySet<ThemeId> = new Set<ThemeId>(['cleanroom'])

/**
 * 夜晚補光：光源相對素材錨點（水平中心＝底部中心 x、腳底 y）的位置與顏色。dx 往右為正、dy 往上為正（邏輯像素）。
 * 數字由 tests-archive/v400b2/measure-glow.mjs 從圖集成品的「發光部位」重心量出（測試重跑比對）。
 * 預設路燈（沒穿環境主題）：燈罩在腳下往上 62、暖黃色、光暈大小 1。
 */
export interface GlowDef {
  dx: number
  dy: number
  rgb: readonly [number, number, number]
  /** 光暈大小倍率（1 = 路燈的 36×28 最大橢圓） */
  scale: number
}
export const LAMP_GLOW_DEFAULT: GlowDef = { dx: 0, dy: 62, rgb: [255, 200, 100], scale: 1 }
/** 素材鍵名 → 光源（路燈六款、水晶球座、資訊終端螢幕；擺出來的裝飾也各自發光） */
export const GLOW: Readonly<Record<string, GlowDef>> = {
  lamp_atlantis: { dx: -1, dy: 76, rgb: [90, 170, 255], scale: 1 },
  lamp_cleanroom: { dx: 16, dy: 74, rgb: [200, 230, 255], scale: 1 },
  lamp_forest: { dx: 19, dy: 61, rgb: [255, 200, 100], scale: 1 },
  lamp_magic: { dx: -1, dy: 66, rgb: [130, 160, 255], scale: 1 },
  lamp_punk: { dx: -1, dy: 72, rgb: [255, 70, 70], scale: 1 },
  lamp_plaid: { dx: 21, dy: 55, rgb: [255, 200, 120], scale: 1 },
  crystal_ball: { dx: -1, dy: 30, rgb: [190, 120, 255], scale: 0.7 },
  info_terminal: { dx: 0, dy: 32, rgb: [90, 220, 255], scale: 0.55 },
}
