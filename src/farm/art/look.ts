import type { SpeciesId } from '../config/species'

export type Pose = 'stand' | 'sit' | 'lie' | 'stretch'

/**
 * 繪製一隻生物所需的全部「外觀與姿態」參數。
 * 與場景實體分開：圖鑑、領養預覽、場景上的寵物都用同一個 Look 呼叫同一套繪圖程式。
 */
export interface Look {
  species: SpeciesId
  /** 狗的品種／貓的花色與品種 id */
  variant?: string
  /** 面向：1 向右、-1 向左（整體水平翻轉，左右不對稱的部件如蟹的大螯也會跟著翻） */
  facing: 1 | -1
  /** 動畫時鐘（秒），驅動搖尾、划鰭、腿的擺動等 */
  t: number
  stage: 'young' | 'adult'
  /** 胖瘦（身體厚度倍率）：0.82 瘦、1 標準、1.28 胖 */
  fat: number
  sleeping: boolean
  moving: boolean
  /** 陸地姿勢 */
  pose: Pose
  happy: boolean
  eating: boolean
  yawn: boolean
  /** 海洋：身體俯仰角（弧度）、嘴巴張開程度、浮在水面 */
  pitch: number
  mouthOpen: number
  surfacing: boolean
}

export function makeLook(species: SpeciesId, variant?: string, over: Partial<Look> = {}): Look {
  return {
    species,
    variant,
    facing: 1,
    t: 0,
    stage: 'adult',
    fat: 1,
    sleeping: false,
    moving: false,
    pose: 'stand',
    happy: false,
    eating: false,
    yawn: false,
    pitch: 0,
    mouthOpen: 0.5,
    surfacing: false,
    ...over,
  }
}

/** 設計座標下的外框（面向右、成年、標準體重）：x0..x1、y0..y1，用來自動縮放與對齊 */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
