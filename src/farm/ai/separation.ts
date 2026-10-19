import { bodyHalf } from './behaviors'
import type { Entity } from './entity'

/** 確定性的小偽亂數（兩隻正好重疊時決定往哪個方向分開，不用每次都不一樣） */
function pairAngle(a: string, b: string): number {
  let h = 2166136261
  for (const ch of a + '|' + b) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return ((h >>> 0) / 4294967296) * Math.PI * 2
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/** 小丑魚群的實際範圍比單隻大 */
function extent(e: Entity): { hw: number; hh: number } {
  const b = bodyHalf(e)
  return e.school.length ? { hw: b.hw + 34, hh: b.hh + 22 } : b
}

/**
 * 柔和的分離：彼此靠太近時，各自在「想去的方向」上多加一點離開對方的速度，
 * 所以牠們會自然轉向或減速避開，而不是被硬推開。
 * 池塘生物：依體型決定避讓距離，體型越小越會讓路（大的幾乎不動）。
 * 陸地寵物：較輕微，只避免完全疊在一起。
 * 結果寫入 sepX / sepY（像素／秒）：海洋用來疊加到目標速度，陸地直接當位移速度。
 */
export function computeSeparation(entities: Entity[]): void {
  for (const e of entities) {
    e.sepX = 0
    e.sepY = 0
  }
  const sea = entities.filter((e) => e.def.domain === 'sea' && e.state !== 'breach')
  const land = entities.filter((e) => e.def.domain === 'land')

  for (let i = 0; i < sea.length; i++) {
    for (let j = i + 1; j < sea.length; j++) {
      const A = sea[i]
      const B = sea[j]
      const crabA = A.pet.species === 'crab'
      const crabB = B.pet.species === 'crab'
      if (crabA !== crabB) continue // 帝王蟹在沙地上，其他生物在水裡，不互相影響
      const ea = extent(A)
      const eb = extent(B)
      const a = (ea.hw + eb.hw) * 0.95
      const b = crabA ? 1e9 : (ea.hh + eb.hh) * 1.25 + 14
      const dx = A.x - B.x
      const dy = crabA ? 0 : A.y - B.y
      const nx = dx / a
      const ny = dy / b
      const d = Math.hypot(nx, ny)
      if (d >= 1.4) continue
      // 越近越用力：d=1.4 時為 0，d≤0.7 時達到最大
      const s = smooth((1.4 - d) / 0.7)
      let ux: number
      let uy: number
      if (d < 1e-3) {
        const ang = pairAngle(A.id, B.id)
        ux = Math.cos(ang)
        uy = crabA ? 0 : Math.sin(ang) * 0.5
      } else {
        // 橢圓的梯度方向：長軸方向的距離比較「便宜」，所以多半沿著深度方向錯開
        const gx = dx / (a * a)
        const gy = dy / (b * b)
        const gl = Math.hypot(gx, gy) || 1
        ux = gx / gl
        uy = gy / gl
      }
      const ma = ea.hw * ea.hh
      const mb = eb.hw * eb.hh
      const wa = mb / (ma + mb) // 體型小的那隻分到比較多的避讓量
      const push = s * 110
      A.sepX += ux * push * wa * 2
      A.sepY += uy * push * wa * 2 * 0.7
      B.sepX -= ux * push * (1 - wa) * 2
      B.sepY -= uy * push * (1 - wa) * 2 * 0.7
    }
  }

  for (let i = 0; i < land.length; i++) {
    for (let j = i + 1; j < land.length; j++) {
      const A = land[i]
      const B = land[j]
      const la = A.def.length * A.sizeK
      const lb = B.def.length * B.sizeK
      const a = (la + lb) * 0.42
      const b = 36
      const dx = A.x - B.x
      const dy = A.y - B.y
      const d = Math.hypot(dx / a, dy / b)
      if (d >= 1.15) continue
      const s = smooth((1.15 - d) / 0.65)
      let ux: number
      let uy: number
      if (d < 1e-3) {
        const ang = pairAngle(A.id, B.id)
        ux = Math.cos(ang)
        uy = Math.sin(ang) * 0.5
      } else {
        const gx = dx / (a * a)
        const gy = dy / (b * b)
        const gl = Math.hypot(gx, gy) || 1
        ux = gx / gl
        uy = gy / gl
      }
      // 睡著的不動，由醒著的那隻讓開
      const wa = A.sleeping ? 0 : B.sleeping ? 1 : 0.5
      const wb = 1 - wa
      const push = s * 28
      A.sepX += ux * push * wa * 2
      A.sepY += uy * push * wa * 2
      B.sepX -= ux * push * wb * 2
      B.sepY -= uy * push * wb * 2
    }
  }

  // 避免加總後過大
  for (const e of entities) {
    const lim = e.def.domain === 'sea' ? 110 : 30
    const m = Math.hypot(e.sepX, e.sepY)
    if (m > lim) {
      e.sepX *= lim / m
      e.sepY *= lim / m
    }
  }
}
