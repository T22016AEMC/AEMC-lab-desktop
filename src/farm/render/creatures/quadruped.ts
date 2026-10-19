import type { Entity } from '../../ai/entity'
import { circ, curve, ell, eye, limb, shade, TAU } from './helpers'

type Pose = 'stand' | 'sit' | 'lie' | 'stretch'

interface Spec {
  bodyRx: number
  bodyRy: number
  legH: number
  legW: number
  headR: number
}

const DOG: Spec = { bodyRx: 34, bodyRy: 17, legH: 21, legW: 8, headR: 15 }
const CAT: Spec = { bodyRx: 27, bodyRy: 13, legH: 18, legW: 6, headR: 13 }

function poseOf(e: Entity): Pose {
  if (e.sleeping || e.state === 'lie') return 'lie'
  const a = e.anim?.kind
  if (a === 'groom' || a === 'pet') return 'sit'
  if (a === 'bath' || a === 'eat' || a === 'wake' || a === 'walk') return 'stand'
  if (e.state === 'sit') return 'sit'
  if (e.state === 'stretch') return 'stretch'
  return 'stand'
}

/** 狗與貓共用的側面繪製（面向右，原點在腳底中心）。毛色由 colors 決定 */
export function drawQuadruped(ctx: CanvasRenderingContext2D, e: Entity, colors: Record<string, string>, persp: number): void {
  const isDog = e.pet.species === 'dog'
  const S = isDog ? DOG : CAT
  const k = e.sizeK * persp
  const young = e.stage === 'young'
  const pose = poseOf(e)
  const fT = e.fat // 厚度
  const fW = 1 + (e.fat - 1) * 0.55
  const headK = young ? 1.28 : 1
  const legK = young ? 0.78 : 1
  const a = e.anim?.kind
  const moving = e.moving && pose === 'stand'
  const t = e.t
  const bodyC = colors.body
  const belly = colors.belly
  const earC = colors.ear
  const dark = colors.dark ?? '#2b2230'
  const happy = a === 'pet' || a === 'groom' || a === 'walk' || (isDog && e.state === 'run')
  const eating = a === 'eat'

  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.scale(e.facing * k, k)

  const rx = S.bodyRx * fW * (young ? 0.88 : 1)
  const ry = S.bodyRy * fT
  const legH = S.legH * legK

  // 影子
  ell(ctx, 0, 1, rx * 1.15, 6, 'rgba(0,0,0,0.2)')

  // ---- 姿勢決定的座標 ----
  let bodyCy: number
  let headX: number
  let headY: number
  let tailBase: { x: number; y: number }
  let bodyRot = 0
  if (pose === 'lie') {
    bodyCy = -ry * 0.9
    headX = rx * 0.78
    headY = -S.headR * headK * 0.9
    tailBase = { x: -rx * 0.85, y: -ry * 0.7 }
  } else if (pose === 'sit') {
    bodyCy = -legH - ry * 1.25
    headX = rx * 0.52
    headY = bodyCy - ry * 1.55 - S.headR * headK * 0.2
    tailBase = { x: -rx * 0.6, y: -6 }
    bodyRot = -0.02
  } else if (pose === 'stretch') {
    bodyCy = -legH * 0.55 - ry * 0.8
    headX = rx * 1.1
    headY = -S.headR * headK * 0.9
    tailBase = { x: -rx * 0.95, y: bodyCy - ry * 0.6 }
    bodyRot = 0.2
  } else {
    bodyCy = -legH - ry * 0.55
    headX = rx * 0.98
    headY = bodyCy - ry * 0.85 - S.headR * headK * 0.2 + (eating ? 15 : 0) + Math.sin(t * 8) * (moving ? 1.2 : 0)
    tailBase = { x: -rx * 0.95, y: bodyCy - ry * 0.35 }
  }

  // ---- 尾巴（在身體後面） ----
  const wag = happy ? 0.55 : 0.2
  const wagSpeed = happy ? 14 : 4
  if (isDog) {
    const ang = pose === 'lie' ? -0.2 : -1.05 + Math.sin(t * wagSpeed) * wag
    const len = 27
    const tx = tailBase.x + Math.cos(ang + Math.PI) * -len
    const ty = tailBase.y + Math.sin(ang + Math.PI) * -len
    curve(ctx, tailBase.x, tailBase.y, tailBase.x - 8, (tailBase.y + ty) / 2 - 6, tx - 16 + len * 0.1, ty, 8 * (young ? 0.85 : 1), bodyC)
  } else {
    const sway = Math.sin(t * (happy ? 5 : 1.6)) * (happy ? 9 : 4)
    if (pose === 'lie') {
      curve(ctx, tailBase.x, tailBase.y, tailBase.x - 22, tailBase.y + 8, tailBase.x - 6, -3, 6, bodyC)
    } else if (pose === 'sit') {
      curve(ctx, tailBase.x, tailBase.y, tailBase.x - 30, -2, tailBase.x - 14 + sway * 0.3, -8, 6, bodyC)
    } else {
      curve(ctx, tailBase.x, tailBase.y, tailBase.x - 24 + sway, tailBase.y - 12, tailBase.x - 8 + sway * 1.4, tailBase.y - 40 * (young ? 0.8 : 1), 6, bodyC)
      if (colors.stripe) circ(ctx, tailBase.x - 8 + sway * 1.4, tailBase.y - 40 * (young ? 0.8 : 1), 3.3, colors.stripe)
    }
  }

  // ---- 後腿與前腿 ----
  const legColor = shade(bodyC, -0.12)
  const swing = (i: number): number => (moving ? Math.sin(t * 11 + (i % 2 ? 0 : Math.PI)) * 7 : 0)
  const pawColor = colors.patchA ? '#ffffff' : isDog ? belly : (colors.belly === '#ffffff' ? '#ffffff' : bodyC)
  const drawLeg = (x: number, i: number, front: boolean): void => {
    const top = bodyCy + ry * 0.4
    if (pose === 'lie') {
      ell(ctx, x * 0.9 + (front ? 10 : -2), -4, 8, 5, front ? shade(bodyC, -0.05) : legColor)
      return
    }
    if (pose === 'sit' && !front) {
      ell(ctx, -rx * 0.35, -10, rx * 0.42, 11, legColor)
      ell(ctx, -rx * 0.05, -3, 9, 4, pawColor)
      return
    }
    let fx = x
    let bottomY = 0
    if (pose === 'stretch' && front) {
      fx = x + 14
      bottomY = -3
    }
    const sw = swing(i)
    limb(ctx, x, top, fx + sw, bottomY - 2, S.legW * (young ? 0.9 : 1), legColor)
    ell(ctx, fx + sw + 2, bottomY - 1, S.legW * 0.7, 3.6, pawColor)
  }
  drawLeg(-rx * 0.62, 0, false)
  drawLeg(-rx * 0.28, 1, false)

  // ---- 身體 ----
  ctx.save()
  ctx.translate(0, bodyCy)
  ctx.rotate(bodyRot)
  if (pose === 'sit') {
    // 坐姿：身體立起來的橢圓
    ell(ctx, 0, -2, ry * 1.25 * fW, ry * 1.6, bodyC)
    ell(ctx, 3, 2, ry * 0.8 * fW, ry * 1.2, belly)
  } else {
    ell(ctx, 0, 0, rx, ry, bodyC)
    if (!colors.patchA) ell(ctx, 2, ry * 0.35, rx * 0.78, ry * 0.58, belly)
  }
  if (colors.stripe && !colors.patchA) {
    // 貓的條紋
    ctx.strokeStyle = colors.stripe
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (const sx of [-rx * 0.45, -rx * 0.12, rx * 0.2]) {
      ctx.beginPath()
      ctx.moveTo(sx, -ry * 0.95)
      ctx.quadraticCurveTo(sx + 2, -ry * 0.4, sx - 1, -ry * 0.05)
      ctx.stroke()
    }
  }
  if (colors.patchA) {
    // 三花：用身體形狀裁切橘色與黑色色塊
    ctx.save()
    ctx.beginPath()
    if (pose === 'sit') ctx.ellipse(0, -2, ry * 1.25 * fW, ry * 1.6, 0, 0, TAU)
    else ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
    ctx.clip()
    ell(ctx, -rx * 0.5, -ry * 0.4, rx * 0.42, ry * 0.8, colors.patchA)
    ell(ctx, rx * 0.35, ry * 0.2, rx * 0.3, ry * 0.7, colors.patchB)
    ell(ctx, rx * 0.05, -ry * 0.9, rx * 0.2, ry * 0.4, colors.patchA)
    ctx.restore()
  }
  ctx.restore()

  drawLeg(rx * 0.3, 2, true)
  drawLeg(rx * 0.62, 3, true)

  // ---- 頭 ----
  const hr = S.headR * headK * (young ? 0.92 : 1)
  ctx.save()
  ctx.translate(headX, headY)
  if (pose === 'lie') ctx.rotate(0.12)
  if (pose === 'stretch') ctx.rotate(0.35)
  if (eating) ctx.rotate(0.45)

  // 耳朵（在頭後面）
  if (isDog) {
    const flop = pose === 'lie' ? 0.9 : 0.5 + Math.sin(t * 5) * (moving ? 0.1 : 0)
    ell(ctx, -hr * 0.45, -hr * 0.55, hr * 0.38, hr * 0.7, earC, flop)
  } else {
    for (const sx of [-0.55, 0.15]) {
      ctx.fillStyle = bodyC
      ctx.beginPath()
      ctx.moveTo(hr * sx - hr * 0.42, -hr * 0.55)
      ctx.lineTo(hr * sx + hr * 0.05, -hr * 1.55)
      ctx.lineTo(hr * sx + hr * 0.5, -hr * 0.6)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = earC
      ctx.beginPath()
      ctx.moveTo(hr * sx - hr * 0.22, -hr * 0.65)
      ctx.lineTo(hr * sx + hr * 0.05, -hr * 1.2)
      ctx.lineTo(hr * sx + hr * 0.3, -hr * 0.68)
      ctx.closePath()
      ctx.fill()
    }
  }
  circ(ctx, 0, 0, hr, bodyC)
  if (colors.patchA) {
    ell(ctx, -hr * 0.35, -hr * 0.4, hr * 0.5, hr * 0.45, colors.patchA)
    ell(ctx, hr * 0.5, -hr * 0.55, hr * 0.28, hr * 0.3, colors.patchB)
    ell(ctx, hr * 0.15, hr * 0.15, hr * 0.62, hr * 0.5, '#ffffff')
  }
  if (isDog) {
    // 吻部與臉
    ell(ctx, hr * 0.62, hr * 0.28, hr * 0.62, hr * 0.46, belly)
    circ(ctx, hr * 1.12, hr * 0.12, hr * 0.17, dark)
    if (colors.belly === '#ffffff' && colors.body === '#35353b') ell(ctx, hr * 0.15, -hr * 0.15, hr * 0.22, hr * 0.7, '#ffffff', 0.1)
    if (happy || (e.state === 'run')) ell(ctx, hr * 0.78, hr * 0.7, hr * 0.2, hr * 0.28, '#ff7f9c')
    ctx.strokeStyle = dark
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(hr * 0.62, hr * 0.3)
    ctx.quadraticCurveTo(hr * 0.75, hr * 0.55, hr * 0.95, hr * 0.42)
    ctx.stroke()
  } else {
    // 貓：小鼻、鬍鬚、額頭條紋
    ell(ctx, hr * 0.42, hr * 0.3, hr * 0.46, hr * 0.34, belly === '#3a3a42' ? '#4a4a54' : belly)
    ell(ctx, hr * 0.72, hr * 0.1, hr * 0.12, hr * 0.08, '#e87d95')
    ctx.strokeStyle = dark
    ctx.globalAlpha = 0.6
    ctx.lineWidth = 1.1
    for (const dy of [-0.05, 0.12]) {
      ctx.beginPath()
      ctx.moveTo(hr * 0.55, hr * (0.22 + dy))
      ctx.lineTo(hr * 1.35, hr * (0.12 + dy * 3))
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    if (colors.stripe && !colors.patchA) {
      ctx.strokeStyle = colors.stripe
      ctx.lineWidth = 2.4
      for (const sx of [-0.25, 0.1]) {
        ctx.beginPath()
        ctx.moveTo(hr * sx, -hr * 0.98)
        ctx.lineTo(hr * sx - 1, -hr * 0.55)
        ctx.stroke()
      }
    }
  }
  // 眼睛與腮紅
  ell(ctx, hr * 0.32, hr * 0.28, hr * 0.2, hr * 0.12, 'rgba(255,120,150,0.45)')
  const eyeClosed = pose === 'lie' || a === 'groom' || (a === 'pet' && !isDog)
  eye(ctx, hr * 0.38, -hr * 0.1, hr * 0.15, eyeClosed, dark)
  if (a === 'wake') {
    // 被叫醒：眼睛瞇、嘴巴張開打哈欠
    ell(ctx, hr * 0.72, hr * 0.52, hr * 0.2, hr * 0.26, '#7a2a3a')
  }
  ctx.restore()

  ctx.restore()
}
