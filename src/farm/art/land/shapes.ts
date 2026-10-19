/** 陸地生物用的 SVG 路徑產生器（回傳路徑字串，交給 part()／Path2D 繪製） */

/** 軀幹：中心在原點，x 從尾端（-L/2）到胸口（+L/2）；chest > 1 表示胸口更深 */
export function torsoD(L: number, D: number, chest = 1): string {
  const a = -L / 2
  const b = L / 2
  const h = D / 2
  const f = (n: number): string => n.toFixed(1)
  return (
    `M${f(a)} ${f(h * 0.15)}` +
    `C${f(a)} ${f(-h * 0.9)} ${f(a + L * 0.18)} ${f(-h * 1.02)} ${f(a + L * 0.5)} ${f(-h)}` +
    `C${f(b - L * 0.16)} ${f(-h * 0.98)} ${f(b)} ${f(-h * 0.7 * chest)} ${f(b)} ${f(h * 0.05)}` +
    `C${f(b)} ${f(h * 0.82 * chest)} ${f(b - L * 0.14)} ${f(h * chest)} ${f(b - L * 0.36)} ${f(h * chest * 0.98)}` +
    `C${f(a + L * 0.3)} ${f(h * 0.9)} ${f(a + L * 0.08)} ${f(h * 0.9)} ${f(a)} ${f(h * 0.15)}Z`
  )
}

/**
 * 腿：原點在上端中心，向下長 len；上粗下略細，有肉感。
 * belly > 0（腿上端到身體下緣的距離）時，腿在身體下緣處用一小段凹弧向兩側張開，
 * 和身體下緣接成圓順的弧線，而不是硬邦邦的直角。
 */
export function legD(w: number, len: number, belly = 0): string {
  const f = (n: number): string => n.toFixed(1)
  const hw = w * 0.56
  const yb = Math.min(belly * 0.2, len * 0.4)
  const r = belly > 0 ? Math.min(belly * 0.7 + 7, len * 0.6 - yb) : 0
  if (r <= 1) {
    return (
      `M${f(-hw)} 0L${f(hw)} 0` +
      `C${f(hw)} ${f(len * 0.4)} ${f(w * 0.5)} ${f(len * 0.7)} ${f(w * 0.46)} ${f(len - 4)}` +
      `L${f(-w * 0.46)} ${f(len - 4)}` +
      `C${f(-w * 0.5)} ${f(len * 0.7)} ${f(-hw)} ${f(len * 0.4)} ${f(-hw)} 0Z`
    )
  }
  const top = hw + 4.5
  const y1 = yb + r
  const mid = Math.max(y1, len * 0.4)
  return (
    `M${f(-top)} 0L${f(top)} 0L${f(top)} ${f(yb)}` +
    `C${f(top - 5)} ${f(yb)} ${f(hw)} ${f(yb + r * 0.45)} ${f(hw)} ${f(y1)}` +
    `C${f(hw)} ${f(mid)} ${f(w * 0.5)} ${f(len * 0.7)} ${f(w * 0.46)} ${f(len - 4)}` +
    `L${f(-w * 0.46)} ${f(len - 4)}` +
    `C${f(-w * 0.5)} ${f(len * 0.7)} ${f(-hw)} ${f(mid)} ${f(-hw)} ${f(y1)}` +
    `C${f(-hw)} ${f(yb + r * 0.45)} ${f(-(top - 5))} ${f(yb)} ${f(-top)} ${f(yb)}Z`
  )
}

/** 腳掌（圓圓的肉掌） */
export function pawD(w: number, len: number): string {
  const rx = w * 0.7
  const ry = 5.4
  const cy = len - 3
  return `M${-rx + w * 0.08} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`
}

/** 直立的三角耳（尖端圓潤），原點在耳根中心，向上 */
export function earPrickD(w: number, h: number): string {
  const f = (n: number): string => n.toFixed(1)
  return (
    `M${f(-w / 2)} 0C${f(-w / 2)} ${f(-h * 0.5)} ${f(-w * 0.12)} ${f(-h * 0.92)} 0 ${f(-h)}` +
    `C${f(w * 0.12)} ${f(-h * 0.92)} ${f(w / 2)} ${f(-h * 0.5)} ${f(w / 2)} 0Z`
  )
}

/** 半立耳：耳根直立，上半截尖端往前折下來（邊牧） */
export function earSemiD(w: number, h: number): string {
  const f = (n: number): string => n.toFixed(1)
  return (
    `M${f(-w / 2)} 0L${f(-w * 0.38)} ${f(-h * 0.8)}` +
    `C${f(-w * 0.3)} ${f(-h * 1.1)} ${f(w * 0.1)} ${f(-h * 1.12)} ${f(w * 0.4)} ${f(-h * 0.98)}` +
    `C${f(w * 0.62)} ${f(-h * 0.9)} ${f(w * 0.84)} ${f(-h * 0.7)} ${f(w * 0.9)} ${f(-h * 0.48)}` +
    `C${f(w * 0.66)} ${f(-h * 0.6)} ${f(w * 0.44)} ${f(-h * 0.56)} ${f(w * 0.3)} ${f(-h * 0.36)}` +
    `L${f(w / 2)} 0Z`
  )
}

/** 下垂的耳朵，原點在耳根，向下垂（黃金獵犬） */
export function earFloppyD(w: number, h: number): string {
  const f = (n: number): string => n.toFixed(1)
  return (
    `M${f(-w * 0.45)} 0C${f(w * 0.2)} ${f(-h * 0.14)} ${f(w * 0.7)} ${f(h * 0.2)} ${f(w * 0.72)} ${f(h * 0.62)}` +
    `C${f(w * 0.72)} ${f(h * 0.94)} ${f(w * 0.3)} ${f(h * 1.02)} ${f(-w * 0.06)} ${f(h * 0.86)}` +
    `C${f(-w * 0.5)} ${f(h * 0.7)} ${f(-w * 0.6)} ${f(h * 0.3)} ${f(-w * 0.45)} 0Z`
  )
}

/** 圓邊的小耳（英短）：短而圓 */
export function earRoundD(w: number, h: number): string {
  const f = (n: number): string => n.toFixed(1)
  return (
    `M${f(-w / 2)} 0C${f(-w / 2)} ${f(-h * 0.7)} ${f(-w * 0.26)} ${f(-h)} 0 ${f(-h)}` +
    `C${f(w * 0.26)} ${f(-h)} ${f(w / 2)} ${f(-h * 0.7)} ${f(w / 2)} 0Z`
  )
}

/** 波浪（蓬鬆毛）邊緣的橢圓：n 個小圓弧組成，毛茸茸的輪廓（貴賓、布偶貓、黃金獵犬） */
export function scallopD(cx: number, cy: number, rx: number, ry: number, n: number, amp: number): string {
  const f = (v: number): string => v.toFixed(1)
  let d = ''
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = cx + Math.cos(a) * rx
    const y = cy + Math.sin(a) * ry
    if (i === 0) {
      d += `M${f(x)} ${f(y)}`
      continue
    }
    const am = ((i - 0.5) / n) * Math.PI * 2
    const mx = cx + Math.cos(am) * (rx + amp)
    const my = cy + Math.sin(am) * (ry + amp)
    d += `Q${f(mx)} ${f(my)} ${f(x)} ${f(y)}`
  }
  return d + 'Z'
}
