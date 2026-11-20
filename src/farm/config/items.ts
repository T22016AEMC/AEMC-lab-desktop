import type { SpeciesId } from './species'

/**
 * 寶物（收藏品）目錄（v3.6.0）。編號、稀有度、適用寵物、名稱、描述、圖示都在這裡；抽選機率與上限在 balance.ts 的 BALANCE.dig。
 * 套組（U002 機密碎片、U009 合約碎片）算 1 個項目、6 片：存檔 collection 用「編號-片號」（U002-1…U002-6）各自計數，
 * 抽中時隨機 1 片（可重複）；6 片都至少 1 片才算「已收集」。
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary'
/** 哪種寵物抽得到：both = 貓狗共用 */
export type ItemPool = 'both' | 'dog' | 'cat'

export interface ItemDef {
  id: string
  rarity: Rarity
  pool: ItemPool
  name: string
  /** 搞笑描述（收藏冊用，已收集才顯示） */
  desc: string
  /** 圖集 items 裡的素材鍵名；套組是第 1 片的鍵名（item_U002_1），實際用 shardIcon() */
  icon: string
  /** 套組的片數；沒有 = 一般項目 */
  shards?: number
}

export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'legendary']
export const RARITY_LABEL: Record<Rarity, string> = { common: '常見', uncommon: '少見', rare: '稀有', legendary: '傳說' }

const it = (id: string, rarity: Rarity, pool: ItemPool, name: string, desc: string, shards?: number): ItemDef => ({
  id, rarity, pool, name, desc, icon: 'item_' + id + (shards ? '_1' : ''), ...(shards ? { shards } : {}),
})

export const ITEMS: readonly ItemDef[] = [
  it('C001', 'common', 'both', '發芽的馬鈴薯', '長得像晶圓，其實只是放太久'),
  it('C002', 'common', 'both', '報廢晶片', '曾經試圖運算，最後決定退休'),
  it('C003', 'common', 'both', '被套牢的股票', '持有者已經在土裡住了三年'),
  it('C004', 'common', 'both', '破裂的矽晶圓', '良率 0%，外觀還算漂亮'),
  it('C005', 'common', 'both', '黃金狗便便', '看起來很值錢，聞起來不是'),
  it('C006', 'common', 'both', '128MB 隨身碟', '裡面存著 2008 年的報告'),
  it('C007', 'common', 'both', '迷你無塵衣', '穿上後仍然會掉毛'),
  it('C008', 'common', 'both', '神秘螺絲', '不知道從哪台機台掉下來的'),
  it('C009', 'common', 'both', '加班申請單', '申請時間：昨天晚上 23:59'),
  it('C010', 'common', 'both', '寵物指紋晶圓', '全世界第一片由貓掌製造的晶圓'),
  it('U001', 'uncommon', 'both', '24K 鍍金晶圓', '性能沒有提升，身價倒是提高了'),
  it('U002', 'uncommon', 'dog', '某公司機密碎片', '該不會要發達了吧?', 6),
  it('U003', 'uncommon', 'both', '神秘探針卡', '測過一次，機台就開始懷疑人生'),
  it('U004', 'uncommon', 'both', '過熱的 GPU', '挖出來時還在冒煙'),
  it('U005', 'uncommon', 'both', '像 iPhone 的化石', '這是來自遠古的科技'),
  it('U006', 'uncommon', 'both', '退休工程師的識別證', '據說持有者可以免除所有加班'),
  it('U007', 'uncommon', 'both', '神秘零件', '用途已經超出人類理解'),
  it('U008', 'uncommon', 'both', '迷你矽錠', '所有晶片的祖先'),
  it('U009', 'uncommon', 'cat', '某公司神秘合約碎片', '簽了名才發現是賣身契', 6),
  it('R001', 'rare', 'both', '1A 神級晶片', '技術領先全世界，連工程師都不知道怎麼做出來'),
  it('R002', 'rare', 'both', '百倍股認購憑證', '曾經讓一隻狗實現財富自由'),
  it('R003', 'rare', 'both', '失落的光罩', '藏著下一世代製程的秘密'),
  it('R004', 'rare', 'both', '完美零缺陷晶圓', '傳說中的 100% 良率，連 QA 都不敢相信'),
  it('R005', 'rare', 'both', '製程工程師的神秘筆記', '記錄著如何讓異常在主管來之前消失'),
  it('L001', 'legendary', 'dog', '董事長的保險箱鑰匙', '這是啥?'),
  it('L002', 'legendary', 'dog', '董事長的保險箱', '裡面有未公開技術、神祕股票代號，以及永遠不會公開的分紅公式，但我沒鑰匙'),
  it('L003', 'legendary', 'cat', '亞特蘭提斯雷射', '失落文明的 EUV 光源，貓一看到就停不下來'),
  it('L004', 'legendary', 'cat', '亞特蘭提斯山銅', '傳說中的金屬，良率不明，但很閃'),
]

const BY_ID = new Map(ITEMS.map((d) => [d.id, d]))
export const itemDef = (id: string): ItemDef | undefined => BY_ID.get(id)

/** 這隻寵物抽得到的項目（共用＋自己的專屬） */
export function itemsFor(species: SpeciesId, rarity?: Rarity): ItemDef[] {
  return ITEMS.filter((d) => (d.pool === 'both' || d.pool === species) && (!rarity || d.rarity === rarity))
}

/** 存檔 collection 的鍵：一般項目是編號，套組的某一片是「編號-片號」（片號 1 起算） */
export const shardKey = (id: string, n: number): string => `${id}-${n}`
/** 套組某一片的圖示鍵名 */
export const shardIcon = (id: string, n: number): string => `item_${id}_${n}`

export type Collection = Readonly<Record<string, number>>

/** 套組已收集了幾片（至少 1 件的片數）；一般項目回傳 0 */
export function shardsHave(col: Collection, def: ItemDef): number {
  if (!def.shards) return 0
  let n = 0
  for (let i = 1; i <= def.shards; i++) if ((col[shardKey(def.id, i)] ?? 0) >= 1) n++
  return n
}

/** 已收集：一般項目至少 1 個；套組要 6 片都至少 1 片 */
export function isCollected(col: Collection, def: ItemDef): boolean {
  return def.shards ? shardsHave(col, def) >= def.shards : (col[def.id] ?? 0) >= 1
}

/** 這個項目累計的數量（套組 = 所有片數的總和） */
export function countOf(col: Collection, def: ItemDef): number {
  if (!def.shards) return col[def.id] ?? 0
  let n = 0
  for (let i = 1; i <= def.shards; i++) n += col[shardKey(def.id, i)] ?? 0
  return n
}

/** 存檔裡的 collection 鍵是否合法（編號存在；套組要帶 1～片數的片號；一般項目不能帶片號） */
export function isCollectionKey(key: string): boolean {
  const m = /^([A-Z]\d{3})(?:-(\d+))?$/.exec(key)
  if (!m) return false
  const def = BY_ID.get(m[1])
  if (!def) return false
  if (def.shards) return m[2] !== undefined && Number(m[2]) >= 1 && Number(m[2]) <= def.shards
  return m[2] === undefined
}

/** 收藏冊的獎勵剪影：傳說項目對應的外觀（狗＝亞特蘭提斯房屋，貓＝亞特蘭提斯鐘樓；4.0-B1 前是全黃金） */
export const REWARD_SILHOUETTE: Record<'dog' | 'cat', string> = { dog: 'sil_house_atlantis', cat: 'sil_tower_atlantis' }
