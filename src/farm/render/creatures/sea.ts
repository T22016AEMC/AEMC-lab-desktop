import type { Entity } from '../../ai/entity'
import { circ, ell, eye, limb, shade, TAU } from './helpers'

const clampN = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))

/** 游動時的俯仰角：往下游鼻子朝下；躍出水面時幾乎垂直 */
function pitchOf(e: Entity): number {
  if (e.state === 'breach') return clampN(Math.atan2(e.vy, Math.max(40, Math.abs(e.vx))), -1.35, 1.35)
  if (e.state === 'surface') return -0.3
  return clampN(Math.atan2(e.vy, Math.max(30, Math.abs(e.vx))), -0.45, 0.45) * 0.7
}

function drawOneClownfish(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, scale: number, t: number, young: boolean, fat: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(facing * scale, scale)
  const wag = Math.sin(t * 9) * 0.35
  // 尾鰭
  ctx.save()
  ctx.translate(-18, 0)
  ctx.rotate(wag)
  ctx.fillStyle = '#ff8a2a'
  ctx.strokeStyle = '#2b1a14'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(2, 0)
  ctx.quadraticCurveTo(-8, -12, -15, -10)
  ctx.quadraticCurveTo(-11, 0, -15, 10)
  ctx.quadraticCurveTo(-8, 12, 2, 0)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  // 背鰭
  ctx.fillStyle = '#ff7a1a'
  ctx.beginPath()
  ctx.moveTo(-8, -10 * fat)
  ctx.quadraticCurveTo(2, -20 * fat, 12, -10 * fat)
  ctx.closePath()
  ctx.fill()
  // 身體＋白色條紋（用身體形狀裁切）
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, 0, 22, 12 * fat, 0, 0, TAU)
  ctx.clip()
  ell(ctx, 0, 0, 22, 12 * fat, '#ff8a2a')
  for (const sx of [-3, 10]) {
    ctx.fillStyle = '#2b1a14'
    ctx.fillRect(sx - 3.6, -16, 7.2, 32)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(sx - 2.2, -16, 4.4, 32)
  }
  ell(ctx, 0, 5 * fat, 18, 5, 'rgba(255,255,255,0.18)')
  ctx.restore()
  ctx.strokeStyle = '#2b1a14'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.ellipse(0, 0, 22, 12 * fat, 0, 0, TAU)
  ctx.stroke()
  // 胸鰭與眼睛
  ell(ctx, 4, 4, 5, 3, '#ffb15a', 0.5 + Math.sin(t * 7) * 0.3)
  eye(ctx, 13, -3, young ? 3.4 : 2.8, false)
  ctx.restore()
}

function drawClownfishSchool(ctx: CanvasRenderingContext2D, e: Entity): void {
  const scale = (e.def.length * e.sizeK) / 46
  const sorted = [...e.school].sort((a, b) => a.y - b.y)
  sorted.forEach((f, i) => drawOneClownfish(ctx, f.x, f.y, f.facing, scale, e.t + f.ph + i, e.stage === 'young', e.fat))
}

function drawCrab(ctx: CanvasRenderingContext2D, e: Entity): void {
  const scale = (e.def.length * e.sizeK) / 80
  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.scale(scale, scale)
  const t = e.t
  const f = e.fat
  ell(ctx, 0, 6, 46, 7, 'rgba(0,0,0,0.18)')
  const shell = '#e8553d'
  const leg = shade(shell, -0.15)
  // 腿
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const base = 10 + i * 8
      const sw = e.moving ? Math.sin(t * 12 + i * 1.3 + (side > 0 ? 0 : Math.PI)) * 5 : 0
      limb(ctx, side * base, -8, side * (base + 15), -2 + sw * 0.3, 4.4, leg)
      limb(ctx, side * (base + 15), -2 + sw * 0.3, side * (base + 19), 5, 4.4, leg)
    }
  }
  // 螯
  const raise = e.state === 'pause' ? Math.sin(t * 2.2) * 6 : 0
  const eating = e.anim?.kind === 'eat'
  for (const side of [-1, 1]) {
    const lift = eating ? Math.sin(t * 20) * 4 : raise * (side > 0 ? 1 : 0.4)
    limb(ctx, side * 28, -14, side * 46, -30 - lift, 6, leg)
    ell(ctx, side * 52, -36 - lift, 12, 10, shell, side * 0.5)
    // 螯的缺口
    ctx.fillStyle = '#7a2f23'
    ctx.beginPath()
    ctx.moveTo(side * 58, -38 - lift)
    ctx.lineTo(side * 64, -44 - lift)
    ctx.lineTo(side * 64, -34 - lift)
    ctx.closePath()
    ctx.fill()
  }
  // 身體
  ell(ctx, 0, -10, 36, 22 * f, shell)
  ell(ctx, -6, -18 * f, 22, 8, 'rgba(255,255,255,0.22)')
  circ(ctx, -14, -2, 2.6, shade(shell, -0.2))
  circ(ctx, 14, -2, 2.6, shade(shell, -0.2))
  // 眼睛（眼柄）
  for (const side of [-1, 1]) {
    limb(ctx, side * 10, -28 * f, side * 11, -37 * f, 3, shade(shell, -0.1))
    circ(ctx, side * 11, -39 * f, 5, '#ffffff')
    circ(ctx, side * 11 + 1, -39 * f, 2.6, '#2b2230')
  }
  ctx.strokeStyle = '#7a2f23'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, -18, 7, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()
  ctx.restore()
}

function drawTurtle(ctx: CanvasRenderingContext2D, e: Entity): void {
  const scale = (e.def.length * e.sizeK) / 120
  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.scale(e.facing * scale, scale)
  ctx.rotate(pitchOf(e))
  const t = e.t
  const f = e.fat
  const paddle = Math.sin(t * 3.2)
  const skin = '#8fcf8a'
  // 後鰭與尾巴
  ell(ctx, -30, 16, 12, 5, skin, 0.6 - paddle * 0.3)
  ell(ctx, -50, 4, 8, 4, skin, 0.2)
  // 後方的前鰭
  ell(ctx, 18, 14, 22, 7, shade(skin, -0.12), 0.7 + paddle * 0.5)
  // 殼
  const shell = '#4aa869'
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, -4, 46, 32 * f, 0, Math.PI, TAU)
  ctx.lineTo(46, -4)
  ctx.quadraticCurveTo(0, 16 * f, -46, -4)
  ctx.closePath()
  ctx.fillStyle = shell
  ctx.fill()
  ctx.clip()
  ctx.strokeStyle = '#2f8049'
  ctx.lineWidth = 2.4
  for (const [x, y, r] of [[0, -18, 11], [-22, -12, 9], [22, -12, 9], [-10, -2, 9], [12, -2, 9]] as const) {
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (TAU / 6) * i + Math.PI / 6
      const px = x + Math.cos(a) * r * 1.1
      const py = y * f + Math.sin(a) * r * 0.95
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    }
    ctx.closePath()
    ctx.stroke()
  }
  ell(ctx, -14, -26 * f, 16, 6, 'rgba(255,255,255,0.22)', -0.3)
  ctx.restore()
  // 腹甲
  ell(ctx, 0, 6, 44, 8, '#e9d9a6')
  // 頭與脖子
  ell(ctx, 44, -2, 16, 9, skin, -0.2)
  circ(ctx, 56, -6, 12, skin)
  eye(ctx, 61, -9, 3, false)
  ell(ctx, 58, -2, 6, 3, 'rgba(255,130,150,0.45)')
  ctx.strokeStyle = '#3a6a3a'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(61, -3, 4, 0.25 * Math.PI, 0.75 * Math.PI)
  ctx.stroke()
  // 前方的前鰭
  ell(ctx, 26, 16, 24, 7.5, skin, 0.75 - paddle * 0.5)
  ctx.restore()
}

function tailFlukes(ctx: CanvasRenderingContext2D, x: number, swing: number, span: number, color: string): void {
  ctx.save()
  ctx.translate(x, 0)
  ctx.rotate(swing)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(8, 0)
  ctx.quadraticCurveTo(-8, -span * 0.35, -span * 0.6, -span)
  ctx.quadraticCurveTo(-span * 0.35, -span * 0.25, -span * 0.4, 0)
  ctx.quadraticCurveTo(-span * 0.35, span * 0.25, -span * 0.6, span)
  ctx.quadraticCurveTo(-8, span * 0.35, 8, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawBeluga(ctx: CanvasRenderingContext2D, e: Entity): void {
  const scale = (e.def.length * e.sizeK) / 220
  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.scale(e.facing * scale, scale)
  ctx.rotate(pitchOf(e))
  const t = e.t
  const f = e.fat
  const swing = Math.sin(t * 2.4) * 0.22
  const white = '#f3f8fc'
  const shadow = '#d3e2ee'
  // 尾部與尾鰭
  ctx.save()
  ctx.translate(-82, 0)
  ctx.rotate(swing * 0.5)
  ell(ctx, -22, 0, 34, 12 * f, white)
  tailFlukes(ctx, -52, swing, 26, white)
  ctx.restore()
  // 身體
  ell(ctx, 0, 0, 100, 38 * f, white)
  ell(ctx, 0, 14 * f, 96, 24 * f, shadow)
  ell(ctx, 0, -4 * f, 98, 34 * f, white)
  // 額頭（圓圓的）
  circ(ctx, 84, -10 * f, 27 * (0.9 + f * 0.1), white)
  // 胸鰭
  ell(ctx, 28, 28 * f, 24, 9, shadow, 0.6 + Math.sin(t * 2) * 0.25)
  // 臉
  eye(ctx, 88, 2, 3.4, false)
  ell(ctx, 80, 10, 7, 4, 'rgba(255,150,170,0.5)')
  ctx.strokeStyle = '#8aa3b6'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(94, 8, 14, 0.12 * Math.PI, 0.4 * Math.PI)
  ctx.stroke()
  ctx.restore()
}

function drawOrca(ctx: CanvasRenderingContext2D, e: Entity): void {
  const scale = (e.def.length * e.sizeK) / 250
  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.scale(e.facing * scale, scale)
  ctx.rotate(pitchOf(e))
  const t = e.t
  const f = e.fat
  const swing = Math.sin(t * 3.2) * 0.26
  const black = '#1d2433'
  // 尾部
  ctx.save()
  ctx.translate(-96, 0)
  ctx.rotate(swing * 0.5)
  ell(ctx, -20, 0, 32, 12 * f, black)
  tailFlukes(ctx, -48, swing, 28, black)
  ctx.restore()
  // 背鰭
  ctx.fillStyle = black
  ctx.beginPath()
  ctx.moveTo(-18, -34 * f)
  ctx.quadraticCurveTo(-6, -78, 22, -36 * f)
  ctx.closePath()
  ctx.fill()
  // 身體
  ell(ctx, 0, 0, 118, 40 * f, black)
  // 白肚（用身體裁切）
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, 0, 118, 40 * f, 0, 0, TAU)
  ctx.clip()
  ell(ctx, 14, 34 * f, 112, 22 * f, '#f6f7fa')
  ell(ctx, 100, 18 * f, 26, 16, '#f6f7fa')
  ctx.restore()
  // 胸鰭
  ell(ctx, 24, 30 * f, 28, 10, black, 0.7 + Math.sin(t * 2.4) * 0.25)
  // 眼白斑與眼睛
  ell(ctx, 82, -12 * f, 17, 7, '#ffffff', -0.25)
  eye(ctx, 94, -2, 3.4, false)
  ell(ctx, 100, 8, 6, 3.5, 'rgba(255,150,170,0.45)')
  ctx.strokeStyle = '#8b94a8'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(104, 10, 14, 0.12 * Math.PI, 0.4 * Math.PI)
  ctx.stroke()
  ctx.restore()
}

function drawWhaleShark(ctx: CanvasRenderingContext2D, e: Entity): void {
  const scale = (e.def.length * e.sizeK) / 340
  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.scale(e.facing * scale, scale)
  ctx.rotate(pitchOf(e))
  const t = e.t
  const f = e.fat
  const swing = Math.sin(t * 2) * 0.2
  const blue = '#4f78a6'
  // 尾鰭（直立）
  ctx.save()
  ctx.translate(-150, 0)
  ctx.rotate(swing * 0.4)
  ell(ctx, -20, 0, 40, 11 * f, blue)
  ctx.save()
  ctx.translate(-52, 0)
  ctx.rotate(swing)
  ctx.fillStyle = blue
  ctx.beginPath()
  ctx.moveTo(10, 0)
  ctx.quadraticCurveTo(-4, -34, -30, -64)
  ctx.quadraticCurveTo(-26, -20, -22, 0)
  ctx.quadraticCurveTo(-24, 14, -34, 30)
  ctx.quadraticCurveTo(-8, 18, 10, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.restore()
  // 背鰭
  ctx.fillStyle = shade(blue, -0.1)
  ctx.beginPath()
  ctx.moveTo(-30, -38 * f)
  ctx.quadraticCurveTo(-12, -78, 18, -40 * f)
  ctx.closePath()
  ctx.fill()
  // 身體
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, 0, 170, 44 * f, 0, 0, TAU)
  ctx.clip()
  ell(ctx, 0, 0, 170, 44 * f, blue)
  ell(ctx, 6, 26 * f, 168, 24 * f, '#d7e1ec')
  // 花紋：白色斑點與淡淡的橫紋
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 3
  for (let x = -130; x < 130; x += 36) {
    ctx.beginPath()
    ctx.moveTo(x, -44 * f)
    ctx.lineTo(x + 8, 6 * f)
    ctx.stroke()
  }
  for (let i = 0; i < 46; i++) {
    const px = -150 + ((i * 53) % 300)
    const py = (-30 + ((i * 29) % 36)) * f
    circ(ctx, px, py, 2.4 + (i % 3) * 0.6, 'rgba(255,255,255,0.85)')
  }
  ctx.restore()
  // 寬扁的頭與張大的嘴
  ell(ctx, 150, -2 * f, 24, 36 * f, blue)
  const open = 6 + (Math.sin(t * 1.3) * 0.5 + 0.5) * 9
  ell(ctx, 170, 10 * f, 11, open, '#5a2438')
  ell(ctx, 172, 10 * f + open * 0.45, 7, open * 0.5, '#e07a90')
  eye(ctx, 138, -14 * f, 3.4, false)
  ell(ctx, 146, 0, 7, 4, 'rgba(255,150,170,0.4)')
  // 胸鰭
  ell(ctx, 40, 40 * f, 34, 9, shade(blue, -0.1), 0.65 + Math.sin(t * 1.6) * 0.2)
  ctx.restore()
}

export function drawSea(ctx: CanvasRenderingContext2D, e: Entity): void {
  switch (e.pet.species) {
    case 'clownfish':
      drawClownfishSchool(ctx, e)
      break
    case 'crab':
      drawCrab(ctx, e)
      break
    case 'turtle':
      drawTurtle(ctx, e)
      break
    case 'beluga':
      drawBeluga(ctx, e)
      break
    case 'orca':
      drawOrca(ctx, e)
      break
    case 'whaleshark':
      drawWhaleShark(ctx, e)
      break
  }
}
