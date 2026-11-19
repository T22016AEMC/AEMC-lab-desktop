/**
 * 貓揮爪的弧線（v3.10.0）：hd 貓圖去背時，揮爪特效的黃色弧線被濾掉（橘貓、黑貓只剩幾個殘點，其他 4 色完全沒有），
 * 改由程式畫，不靠素材（圖集不動）。
 *
 * - 形狀：以爪尖為中心、爪子前方的 90° 弧（從斜上 −60° 到斜下 +30°），兩層：外圈半徑 7 亮黃、內圈半徑 6 淺黃。
 *   每個點都是整數像素（四捨五入後去重），不旋轉、不傾斜；貓往左時只做水平鏡像（和素材的翻轉同一個規則）。
 * - 爪尖：素材右緣往內 PAW_IN 像素、腳底往上素材高度的 PAW_UP（6 色 swat 幀實測的爪尖約在 66%～77%）。
 * - 時間：揮爪動作（BALANCE.hover.swatSeconds = 0.6 秒）開始後第 FROM～TO 秒出現；最後 FADE 秒只畫一半（棋盤格隔一點畫一點，像素風的淡出，不用半透明）。
 * - 顏色取自 fx_sparkle（星星特效）的亮黃與淺黃。
 */
export const SWAT_ARC = { from: 0.1, to: 0.4, fade: 0.1, outer: 7, inner: 6, startDeg: -60, endDeg: 30, pawIn: 3, pawUp: 0.72 } as const
export const SWAT_ARC_COLORS = { outer: '#fdf47a', inner: '#fefdc8' } as const

export type ArcPixel = { dx: number; dy: number; layer: 'outer' | 'inner' }

/** 弧線的像素（相對爪尖，面向右）。外圈先、內圈後；同一點只留一個（外圈優先） */
export const SWAT_ARC_PIXELS: readonly ArcPixel[] = (() => {
  const out: ArcPixel[] = []
  const seen = new Set<string>()
  for (const [r, layer] of [[SWAT_ARC.outer, 'outer'], [SWAT_ARC.inner, 'inner']] as const) {
    for (let deg = SWAT_ARC.startDeg; deg <= SWAT_ARC.endDeg; deg += 1) {
      const t = (deg * Math.PI) / 180
      const dx = Math.round(r * Math.cos(t))
      const dy = Math.round(r * Math.sin(t))
      const k = dx + ',' + dy
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ dx, dy, layer })
    }
  }
  return out
})()

/** 揮爪開始後第 t 秒要畫哪些點：還沒到／已經過了 = 空；淡出時只畫棋盤格的一半 */
export function swatArcPixels(t: number): readonly ArcPixel[] {
  if (!(t >= SWAT_ARC.from && t < SWAT_ARC.to)) return []
  if (t < SWAT_ARC.to - SWAT_ARC.fade) return SWAT_ARC_PIXELS
  return SWAT_ARC_PIXELS.filter((p) => ((p.dx + p.dy) & 1) === 0)
}

/** 爪尖相對腳底錨點的位置（面向右）：w、h、ax 是 swat 幀的大小與錨點 */
export function pawTip(w: number, h: number, ax: number): { x: number; y: number } {
  return { x: w - ax - SWAT_ARC.pawIn, y: -Math.round(h * SWAT_ARC.pawUp) }
}

/** 畫到畫布上的整數座標：(x, y) = 寵物腳底錨點（已取整），facing = 1 往右、-1 往左（水平鏡像，同 drawSprite 的翻轉） */
export function swatArcScreen(x: number, y: number, facing: 1 | -1, w: number, h: number, ax: number, t: number): { x: number; y: number; layer: 'outer' | 'inner' }[] {
  const tip = pawTip(w, h, ax)
  return swatArcPixels(t).map((p) => {
    const ox = tip.x + p.dx
    return { x: facing === 1 ? x + ox : x - ox - 1, y: y + tip.y + p.dy, layer: p.layer }
  })
}
