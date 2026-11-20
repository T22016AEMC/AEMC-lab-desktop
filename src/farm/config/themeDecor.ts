import type { ThemeId } from './skins'

/**
 * 4.0-B2 主題裝飾（商店「裝飾品」分頁，買了放進倉庫、到編輯農場擺放）。價格小 3／中 6／大 10（SIZE_PRICE），每種最多 10、購買合計最多 60（SHOP_LIMITS）。
 * 素材在延後載入的圖集 `decor_themes`（鍵名 = 種類 id；管線 scripts/process-assets.mjs 的 DECOR_SHEETS 要和這張表一致，測試比對）。
 * 種類只增不減（存檔的實例 id「種類#編號」永遠認得）。傳說展示台（legend_stand）只切好放進圖集，C 階段用，不賣、不是擺設種類。
 */
export type DecorSize = 'S' | 'M' | 'L'

export const THEME_DECOR_LIST = [
  // 亞特蘭提斯
  { kind: 'jelly_lamp', name: '發光水母燈', theme: 'atlantis', size: 'S' },
  { kind: 'conch_lamp', name: '海螺燈', theme: 'atlantis', size: 'S' },
  { kind: 'old_pillar', name: '古石柱', theme: 'atlantis', size: 'M' },
  { kind: 'seahorse_statue', name: '海馬雕像', theme: 'atlantis', size: 'M' },
  { kind: 'trident_statue', name: '三叉戟雕像', theme: 'atlantis', size: 'L' },
  { kind: 'temple_arch', name: '神殿拱門', theme: 'atlantis', size: 'L' },
  // 無塵室
  { kind: 'warn_light', name: '警示燈', theme: 'cleanroom', size: 'S' },
  { kind: 'tube_rack', name: '試管架', theme: 'cleanroom', size: 'S' },
  { kind: 'lab_bench', name: '潔淨工作台', theme: 'cleanroom', size: 'M' },
  { kind: 'air_filter', name: '空氣過濾器', theme: 'cleanroom', size: 'M' },
  { kind: 'centrifuge', name: '離心機', theme: 'cleanroom', size: 'M' },
  { kind: 'air_shower', name: '風淋室', theme: 'cleanroom', size: 'L' },
  // 森林
  { kind: 'firefly_jar', name: '螢火蟲罐', theme: 'forest', size: 'S' },
  { kind: 'bird_house', name: '鳥屋', theme: 'forest', size: 'S' },
  { kind: 'moss_log', name: '苔蘚圓木', theme: 'forest', size: 'M' },
  { kind: 'hollow_stump_door', name: '樹洞門', theme: 'forest', size: 'M' },
  { kind: 'vine_arch', name: '藤蔓拱門', theme: 'forest', size: 'M' },
  { kind: 'tree_house', name: '樹屋', theme: 'forest', size: 'L' },
  // 魔法
  { kind: 'crystal_cluster', name: '水晶簇', theme: 'magic', size: 'S' },
  { kind: 'spell_books', name: '魔法書堆', theme: 'magic', size: 'S' },
  { kind: 'float_candles', name: '漂浮蠟燭', theme: 'magic', size: 'M' },
  { kind: 'star_telescope', name: '占星望遠鏡', theme: 'magic', size: 'M' },
  { kind: 'magic_cauldron', name: '魔法藥鍋', theme: 'magic', size: 'M' },
  { kind: 'rune_circle', name: '符文傳送圈', theme: 'magic', size: 'L' },
  // 龐克
  { kind: 'neon_star', name: '霓虹星星燈', theme: 'punk', size: 'S' },
  { kind: 'spray_cans', name: '噴漆罐堆', theme: 'punk', size: 'S' },
  { kind: 'speaker', name: '擴音喇叭', theme: 'punk', size: 'M' },
  { kind: 'graffiti_wall', name: '塗鴉磚牆', theme: 'punk', size: 'M' },
  { kind: 'fire_barrel', name: '鐵桶營火', theme: 'punk', size: 'M' },
  { kind: 'neon_stage', name: '霓虹舞台拱架', theme: 'punk', size: 'L' },
  // 野餐鄉村
  { kind: 'cake_stand', name: '蛋糕盤', theme: 'plaid', size: 'S' },
  { kind: 'lemonade_jar', name: '檸檬水罐', theme: 'plaid', size: 'S' },
  { kind: 'rocking_chair', name: '搖椅', theme: 'plaid', size: 'M' },
  { kind: 'picnic_set', name: '野餐桌椅組', theme: 'plaid', size: 'M' },
  { kind: 'vine_gazebo', name: '花藤涼亭', theme: 'plaid', size: 'L' },
  { kind: 'carousel', name: '旋轉木馬', theme: 'plaid', size: 'L' },
  // 其他（extra_decor_a、extra_decor_b；全部小）
  { kind: 'coral_pot', name: '珊瑚盆栽', theme: 'extra', size: 'S' },
  { kind: 'twin_jar', name: '雙耳陶罐', theme: 'extra', size: 'S' },
  { kind: 'gas_cylinders', name: '氣體鋼瓶組', theme: 'extra', size: 'S' },
  { kind: 'info_terminal', name: '資訊終端', theme: 'extra', size: 'S' },
  { kind: 'mushroom_ring', name: '蘑菇圈', theme: 'extra', size: 'S' },
  { kind: 'stone_stack', name: '疊石', theme: 'extra', size: 'S' },
  { kind: 'crystal_ball', name: '水晶球座', theme: 'extra', size: 'S' },
  { kind: 'magic_broom', name: '魔法掃帚', theme: 'extra', size: 'S' },
  { kind: 'guitar_stand', name: '電吉他架', theme: 'extra', size: 'S' },
  { kind: 'tire_stack', name: '舊輪胎堆', theme: 'extra', size: 'S' },
  { kind: 'red_pots', name: '紅花盆組', theme: 'extra', size: 'S' },
  { kind: 'windmill', name: '彩旗風車', theme: 'extra', size: 'S' },
] as const

export type ThemeDecorKind = (typeof THEME_DECOR_LIST)[number]['kind']
export interface ThemeDecorDef {
  kind: ThemeDecorKind
  name: string
  theme: ThemeId | 'extra'
  size: DecorSize
}
export const THEME_DECOR: readonly ThemeDecorDef[] = THEME_DECOR_LIST
export const THEME_DECOR_KINDS: readonly ThemeDecorKind[] = THEME_DECOR_LIST.map((d) => d.kind)
const BY_KIND: ReadonlyMap<string, ThemeDecorDef> = new Map(THEME_DECOR.map((d) => [d.kind, d]))
export const themeDecorDef = (kind: string): ThemeDecorDef | undefined => BY_KIND.get(kind)
export const isThemeDecorKind = (v: unknown): v is ThemeDecorKind => typeof v === 'string' && BY_KIND.has(v)

/** 延後載入的主題裝飾圖集；傳說展示台（C 階段用，不賣）的素材鍵名 */
export const DECOR_ATLAS = 'decor_themes'
export const LEGEND_STAND_KEY = 'legend_stand'
/** 商店裝飾品分頁的小標題：各主題一個、其他擺設一個 */
export const DECOR_GROUP_OTHER = '其他擺設'
