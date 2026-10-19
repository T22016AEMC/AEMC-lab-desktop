/**
 * 7 個固定建築位置（第三段才會實作建築，這裡先定義座標與 id，不繪製、不互動）。
 *
 * 座標用「邏輯座標」：畫面高度固定為 900，x 以所屬區域（陸地或池塘）的寬度比例 0～1 表示，
 * 所以不論螢幕比例如何，建築都會落在各自區域的同一相對位置。
 * y 是建築底部（地面接觸點）的邏輯座標。
 */
export type BuildingId = 'bellTower' | 'doghouse' | 'catTree' | 'foodBowl' | 'flowerBed' | 'streetLamp' | 'coralReef'

export interface BuildingSlot {
  id: BuildingId
  name: string
  area: 'land' | 'pond'
  /** 在所屬區域內的水平位置，0（區域左緣）～1（區域右緣） */
  fx: number
  /** 底部的邏輯 y 座標 */
  y: number
}

export const BUILDING_SLOTS: BuildingSlot[] = [
  { id: 'bellTower', name: '鐘樓', area: 'land', fx: 0.5, y: 520 },
  { id: 'doghouse', name: '狗窩', area: 'land', fx: 0.2, y: 640 },
  { id: 'catTree', name: '貓跳台', area: 'land', fx: 0.82, y: 600 },
  { id: 'foodBowl', name: '食盆', area: 'land', fx: 0.4, y: 790 },
  { id: 'flowerBed', name: '花圃', area: 'land', fx: 0.68, y: 820 },
  { id: 'streetLamp', name: '路燈', area: 'land', fx: 0.58, y: 700 },
  { id: 'coralReef', name: '珊瑚礁', area: 'pond', fx: 0.5, y: 800 },
]
