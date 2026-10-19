import type { SpeciesDef } from '../config/species'
import type { Pet } from '../save/types'
import type { Stage } from '../sim/stats'

export interface SchoolFish {
  x: number
  y: number
  facing: 1 | -1
  ox: number
  oy: number
  ph: number
}

export interface Entity {
  id: string
  pet: Pet
  def: SpeciesDef
  /** 陸地：腳底位置；海洋：身體中心 */
  x: number
  y: number
  vx: number
  vy: number
  facing: 1 | -1
  state: string
  stateT: number
  tx: number
  ty: number
  /** 動畫時鐘（秒） */
  t: number
  stage: Stage
  /** 身高係數 × 成長階段 × 池塘縮放 */
  sizeK: number
  fat: number
  sleeping: boolean
  moving: boolean
  /** 指令觸發的短動畫（吃、洗澡…） */
  anim: { kind: string; t: number; dur: number } | null
  /** 輪流顯示低數值提示的計時 */
  noticeT: number
  /** 海龜浮上水面、白鯨吐泡泡、虎鯨躍出水面的倒數計時 */
  specialCd: number
  /** 躍出水面時用的拋物線起點深度 */
  breachY0: number
  /** 小丑魚群 */
  school: SchoolFish[]
  /** 正在追的飼料 id */
  foodId: number | null
  /** 追尾巴時轉圈的角度 */
  spin: number
}

export interface Pellet {
  id: number
  x: number
  y: number
  vy: number
  /** 沉到沙地後剩餘的存活時間 */
  rest: number
  sway: number
}
