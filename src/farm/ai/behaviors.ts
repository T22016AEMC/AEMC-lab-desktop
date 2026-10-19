import { SPECIES } from '../config/species'
import type { Pet } from '../save/types'
import { fatness, stageOf, stageScale } from '../sim/stats'
import { Particles } from '../render/effects'
import {
  SAND_TOP,
  WATER_TOP,
  clamp,
  landRect,
  perspective,
  pondRect,
  type Layout,
  type Rect,
} from '../render/layout'
import { landSize, seaHalf } from '../render/creatures/art'
import type { Entity, Pellet } from './entity'
import { appearanceOf } from '../config/appearance'

export interface Env {
  layout: Layout
  land: Rect
  pond: Rect
  night: boolean
  /** 白天而且天氣不是雨雪：貓會去曬太陽 */
  sunny: boolean
  pellets: Pellet[]
  removePellet: (id: number) => void
  fx: Particles
  rand: () => number
}

const rr = (rand: () => number, a: number, b: number): number => a + rand() * (b - a)

// ---------------------------------------------------------------------------
// 建立與外觀更新
// ---------------------------------------------------------------------------

export function refreshAppearance(e: Entity, pet: Pet, nowMs: number, layout: Layout): void {
  e.pet = pet
  e.stage = stageOf(pet, nowMs)
  e.fat = fatness(pet.weight)
  // 陸地：品種決定基本體型（小 0.82／中 1／大 1.22）；池塘：隨視窗大小縮放
  const breedK = e.def.domain === 'land' ? appearanceOf(pet.species, pet.variant).sizeScale : 1
  e.sizeK = pet.heightFactor * stageScale(e.stage) * breedK * (e.def.domain === 'sea' ? layout.fit : 1)
}

/** 身體的半寬／半高（邏輯像素，含大小與胖瘦），用來限制活動範圍與點擊判定 */
export function bodyHalf(e: Entity): { hw: number; hh: number } {
  const len = e.def.length * e.sizeK
  if (e.pet.species === 'clownfish') return { hw: len * 0.6, hh: len * 0.4 }
  if (e.def.domain === 'sea') return seaHalf(e)
  const { w, h } = landSize(e)
  return { hw: w / 2, hh: h / 2 }
}

export function createEntity(pet: Pet, nowMs: number, layout: Layout, rand: () => number): Entity {
  const def = SPECIES[pet.species]
  const e: Entity = {
    id: pet.id,
    pet,
    def,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: rand() < 0.5 ? 1 : -1,
    state: def.domain === 'land' ? 'stand' : 'swim',
    stateT: rr(rand, 1, 4),
    tx: 0,
    ty: 0,
    t: rand() * 10,
    stage: 'young',
    sizeK: 1,
    fat: 1,
    sleeping: false,
    moving: false,
    anim: null,
    noticeT: rand() * 3,
    specialCd: rr(rand, 8, 30),
    breachY0: 0,
    school: [],
    foodId: null,
    spin: 0,
    sepX: 0,
    sepY: 0,
    flipT: 0,
  }
  refreshAppearance(e, pet, nowMs, layout)
  const land = landRect(layout)
  const pond = pondRect(layout)
  if (def.domain === 'land') {
    e.x = rr(rand, land.x0, land.x1)
    e.y = rr(rand, land.y0, land.y1)
  } else if (pet.species === 'crab') {
    e.x = rr(rand, pond.x0 + 60, pond.x1 - 60)
    e.y = SAND_TOP + 34
  } else {
    const { hw, hh } = bodyHalf(e)
    e.x = rr(rand, pond.x0 + hw, Math.max(pond.x0 + hw, pond.x1 - hw))
    const [a, b] = DEPTH_BAND[pet.species] ?? [0.05, 0.95]
    const ymin = pond.y0 + hh + 10
    const ymax = Math.max(ymin + 1, pond.y1 - hh - 6)
    e.y = ymin + (ymax - ymin) * (a + rand() * (b - a))
  }
  if (def.groupSize > 1) {
    e.school = Array.from({ length: def.groupSize }, (_, i) => ({
      x: e.x - i * 16,
      y: e.y + (i - 1) * 14,
      facing: e.facing,
      ox: 26 + i * 12 - (i === 0 ? 26 : 0),
      oy: (i - 1) * 20,
      ph: rand() * 6,
    }))
  }
  return e
}

/** 每個影格先把物體壓回自己的區域，視窗縮放後也不會跑出邊界 */
export function clampToArea(e: Entity, env: Env): void {
  const { hw, hh } = bodyHalf(e)
  if (e.def.domain === 'land') {
    e.x = clamp(e.x, env.land.x0, env.land.x1)
    e.y = clamp(e.y, env.land.y0, env.land.y1)
  } else if (e.pet.species === 'crab') {
    e.x = clamp(e.x, env.pond.x0 + hw, env.pond.x1 - hw)
    e.y = SAND_TOP + 34
  } else if (e.state !== 'breach') {
    e.x = clamp(e.x, env.pond.x0 + hw, env.pond.x1 - hw)
    e.y = clamp(e.y, env.pond.y0 + hh, env.pond.y1 - hh)
  } else {
    e.x = clamp(e.x, env.pond.x0 + hw, env.pond.x1 - hw)
  }
}

// ---------------------------------------------------------------------------
// 陸地（狗、貓）
// ---------------------------------------------------------------------------

function pickLandSpot(e: Entity, env: Env): void {
  e.tx = rr(env.rand, env.land.x0, env.land.x1)
  e.ty = rr(env.rand, env.land.y0, env.land.y1)
}

function goTo(e: Entity, speed: number): boolean {
  const dx = e.tx - e.x
  const dy = e.ty - e.y
  const d = Math.hypot(dx, dy)
  if (d < 6) {
    e.vx = e.vy = 0
    return true
  }
  e.vx = (dx / d) * speed
  e.vy = (dy / d) * speed * 0.7
  return false
}

function nextLandState(e: Entity, env: Env): void {
  const r = env.rand()
  const dog = e.pet.species === 'dog'
  if (dog) {
    if (r < 0.22) setState(e, 'sit', rr(env.rand, 3, 7))
    else if (r < 0.34) setState(e, 'stand', rr(env.rand, 2, 4))
    else if (r < 0.62) {
      pickLandSpot(e, env)
      setState(e, 'wander', 14)
    } else if (r < 0.84) {
      pickLandSpot(e, env)
      setState(e, 'run', 10)
    } else {
      e.spin = env.rand() * 6.28
      setState(e, 'spin', rr(env.rand, 3.5, 5))
    }
  } else {
    if (r < 0.3) setState(e, 'sit', rr(env.rand, 4, 9))
    else if (r < 0.45) setState(e, 'stand', rr(env.rand, 2, 4))
    else if (r < 0.7) {
      pickLandSpot(e, env)
      setState(e, 'wander', 16)
    } else if (r < 0.82) setState(e, 'stretch', 3.2)
    else if (env.sunny) {
      pickLandSpot(e, env)
      setState(e, 'sunGo', 18)
    } else setState(e, 'sit', rr(env.rand, 4, 8))
  }
}

function setState(e: Entity, state: string, t: number): void {
  e.state = state
  e.stateT = t
}

export function startAnim(e: Entity, kind: string, env: Env): void {
  const dur: Record<string, number> = { eat: 3, pet: 3.2, bath: 4, groom: 3.4, wake: 1.6, walk: 9, feed: 1 }
  e.anim = { kind, t: 0, dur: dur[kind] ?? 2 }
  if (kind === 'walk') {
    pickLandSpot(e, env)
    e.stateT = 3
  }
}

function updateLand(e: Entity, dt: number, env: Env): void {
  const sp = e.def.speed * (0.9 + e.sizeK * 0.1)
  e.t += dt

  if (e.sleeping) {
    if (e.state !== 'sleep') {
      e.state = 'sleep'
      e.vx = e.vy = 0
      e.anim = null
    }
    e.moving = false
    // 睡夢中被撫摸：不會醒來，冒出愉快的泡泡與愛心
    const sa = e.anim
    if (sa) {
      sa.t += dt
      if (sa.t >= sa.dur) e.anim = null
      else if (sa.kind === 'pet') {
        const persp = perspective(e.y)
        if (env.rand() < dt * 2.5) env.fx.add({ kind: 'heart', x: e.x + rr(env.rand, -20, 24), y: e.y - 50 * e.sizeK * persp, vy: -22, life: 1.4, size: 8 })
        if (env.rand() < dt * 1.2) env.fx.add({ kind: 'puff', x: e.x + 30 * e.facing, y: e.y - 58 * e.sizeK * persp, vy: -18, life: 1.6, size: 15, text: '嘿嘿~' })
      }
    }
    e.noticeT -= dt
    if (e.noticeT <= 0) {
      e.noticeT = 1.6
      env.fx.add({
        kind: 'zzz', x: e.x + 22 * e.facing, y: e.y - 40 * e.sizeK * perspective(e.y), vy: -16, vx: 8 * e.facing,
        life: 2, size: 18 + env.rand() * 6, color: '#cfe0ff', text: env.rand() < 0.5 ? 'z' : 'Z',
      })
    }
    return
  }
  if (e.state === 'sleep') setState(e, 'stand', 2.5)

  const persp = perspective(e.y)
  const a = e.anim
  if (a) {
    a.t += dt
    if (a.t >= a.dur) e.anim = null
  }

  if (a && a.kind === 'walk') {
    // 散步：以較慢的速度沿著場地走動，不停換目標
    e.stateT -= dt
    if (goTo(e, sp * 0.55) || e.stateT <= 0) {
      pickLandSpot(e, env)
      e.stateT = 3
    }
    if (env.rand() < dt * 1.2) env.fx.add({ kind: 'note', x: e.x, y: e.y - 70 * e.sizeK * persp, vy: -20, life: 1.2, size: 18, color: '#ffd166' })
  } else if (a) {
    e.vx = e.vy = 0
    if (a.kind === 'bath' && env.rand() < dt * 14) {
      env.fx.add({
        kind: 'soap', x: e.x + rr(env.rand, -34, 34), y: e.y - rr(env.rand, 8, 62) * e.sizeK * persp, vy: -rr(env.rand, 10, 26),
        life: rr(env.rand, 1.2, 2.2), size: rr(env.rand, 6, 15),
      })
    }
    if ((a.kind === 'pet' || a.kind === 'groom') && env.rand() < dt * 3.5) {
      env.fx.add({ kind: 'heart', x: e.x + rr(env.rand, -20, 24), y: e.y - 60 * e.sizeK * persp, vy: -28, life: 1.3, size: 8 })
    }
    if (a.kind === 'pet' && e.pet.species === 'cat' && env.rand() < dt * 2.2) {
      env.fx.add({ kind: 'puff', x: e.x + 30 * e.facing, y: e.y - 56 * e.sizeK * persp, vy: -22, vx: 6 * e.facing, life: 1.6, size: 15, text: '呼嚕' })
    }
    if (a.kind === 'groom' && env.rand() < dt * 5) {
      env.fx.add({ kind: 'sparkle', x: e.x + rr(env.rand, -30, 30), y: e.y - rr(env.rand, 20, 60) * e.sizeK * persp, life: 0.7, size: 12, color: '#fff3a0' })
    }
    if (a.kind === 'wake') {
      const persp2 = perspective(e.y)
      if (e.pet.species === 'dog' && env.rand() < dt * 5) {
        env.fx.add({ kind: 'heart', x: e.x + rr(env.rand, -22, 26), y: e.y - 62 * e.sizeK * persp2, vy: -30, life: 1.3, size: 8 })
      } else if (e.pet.species === 'cat' && env.rand() < dt * 2.2) {
        env.fx.add({ kind: 'puff', x: e.x + 28 * e.facing, y: e.y - 58 * e.sizeK * persp2, vy: -20, life: 1.4, size: 14, text: '哼！' })
      }
    }
    if (a.kind === 'eat' && env.rand() < dt * 6) {
      env.fx.add({ kind: 'crumb', x: e.x + 30 * e.facing, y: e.y - 6, vx: rr(env.rand, -30, 30), vy: -rr(env.rand, 20, 50), ay: 160, life: 0.5, size: 2.4, color: '#c58b4b' })
    }
  } else {
    e.stateT -= dt
    switch (e.state) {
      case 'wander':
        if (goTo(e, sp * 0.45)) setState(e, 'stand', rr(env.rand, 1, 3))
        break
      case 'run':
        if (goTo(e, sp)) setState(e, 'stand', rr(env.rand, 1.5, 3))
        break
      case 'sunGo':
        if (goTo(e, sp * 0.4)) setState(e, 'lie', rr(env.rand, 10, 16))
        break
      case 'spin': {
        // 追自己的尾巴：原地繞小圈
        e.spin += dt * 6
        e.vx = Math.cos(e.spin) * 70
        e.vy = Math.sin(e.spin) * 28
        break
      }
      default:
        e.vx = e.vy = 0
    }
    if (e.stateT <= 0) nextLandState(e, env)
  }

  e.x += (e.vx + e.sepX) * dt
  e.y += (e.vy + e.sepY) * dt
  e.moving = Math.hypot(e.vx, e.vy) > 8
  if (Math.abs(e.vx) > 3) e.facing = e.vx > 0 ? 1 : -1
}

// ---------------------------------------------------------------------------
// 海洋
// ---------------------------------------------------------------------------

function steer(e: Entity, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - e.x
  const dy = ty - e.y
  const d = Math.hypot(dx, dy)
  const arrived = d < 12
  const k = Math.min(1, dt * 1.6)
  const wantX = (arrived ? 0 : (dx / d) * speed) + e.sepX
  const wantY = (arrived ? 0 : (dy / d) * speed * 0.55) + e.sepY
  e.vx += (wantX - e.vx) * k
  e.vy += (wantY - e.vy) * k
  return arrived
}

/** 各物種偏好的深度範圍（0＝水面附近、1＝池底附近），讓大型生物分層游動、不要全擠在一起 */
const DEPTH_BAND: Partial<Record<string, [number, number]>> = {
  orca: [0, 0.22],
  beluga: [0.3, 0.58],
  turtle: [0.15, 0.7],
  whaleshark: [0.58, 1],
}

function pickSwimTarget(e: Entity, env: Env): void {
  const { hw, hh } = bodyHalf(e)
  const { pond } = env
  e.tx = rr(env.rand, pond.x0 + hw, Math.max(pond.x0 + hw + 1, pond.x1 - hw))
  const ymin = pond.y0 + hh + 10
  const ymax = Math.max(ymin + 1, pond.y1 - hh - 6)
  const [a, b] = DEPTH_BAND[e.pet.species] ?? [0.05, 0.95]
  e.ty = ymin + (ymax - ymin) * (a + env.rand() * (b - a))
}

function splash(x: number, env: Env, power: number): void {
  for (let i = 0; i < 16 * power; i++) {
    const a = -Math.PI / 2 + rr(env.rand, -0.9, 0.9)
    const v = rr(env.rand, 90, 260) * power
    env.fx.add({
      kind: 'splash', x, y: WATER_TOP, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: 700,
      life: rr(env.rand, 0.6, 1.1), size: rr(env.rand, 3, 7), color: 'rgba(210,240,255,0.95)',
    })
  }
}

function updateSea(e: Entity, dt: number, env: Env): void {
  const species = e.pet.species
  const nightMul = env.night ? 0.5 : 1
  const speed = e.def.speed * nightMul * (0.9 + e.sizeK * 0.1)
  const { hw, hh } = bodyHalf(e)
  e.t += dt * (0.55 + Math.min(1, Math.hypot(e.vx, e.vy) / Math.max(20, e.def.speed)) * 0.9)
  if (e.anim) {
    e.anim.t += dt
    if (e.anim.t >= e.anim.dur) e.anim = null
  }
  const a = e.anim

  // --- 飼料：看到就游過去吃 ---
  let pellet: Pellet | undefined
  if (env.pellets.length > 0 && e.state !== 'breach') {
    const reachable = env.pellets.filter((p) => (species === 'crab' ? p.y >= SAND_TOP - 24 : true))
    pellet = reachable.sort((p, q) => Math.hypot(p.x - e.x, p.y - e.y) - Math.hypot(q.x - e.x, q.y - e.y))[0]
  }

  if (species === 'crab') {
    // 帝王蟹：在沙地上慢慢橫著走
    e.stateT -= dt
    if (pellet) {
      e.tx = pellet.x
      const dx = e.tx - e.x
      e.vx = Math.abs(dx) < 8 ? 0 : Math.sign(dx) * e.def.speed * 2.2 * nightMul
      if (Math.abs(dx) < Math.max(14, hw * 0.4) && pellet.y >= SAND_TOP - 30) {
        env.removePellet(pellet.id)
        e.anim = { kind: 'eat', t: 0, dur: 0.7 }
        for (let i = 0; i < 5; i++) env.fx.add({ kind: 'crumb', x: e.x, y: e.y - 18, vx: rr(env.rand, -30, 30), vy: -rr(env.rand, 20, 60), ay: 140, life: 0.5, size: 2.2, color: '#d9a35a' })
      }
    } else {
      if (e.state === 'swim' || e.stateT <= 0) {
        if (env.rand() < 0.35) {
          setState(e, 'pause', rr(env.rand, 2, 5))
          e.vx = 0
        } else {
          setState(e, 'walk', rr(env.rand, 4, 9))
          e.tx = rr(env.rand, env.pond.x0 + hw, Math.max(env.pond.x0 + hw + 1, env.pond.x1 - hw))
        }
      }
      if (e.state === 'walk') {
        const dx = e.tx - e.x
        if (Math.abs(dx) < 6) setState(e, 'pause', rr(env.rand, 2, 4))
        else e.vx = Math.sign(dx) * speed
      } else e.vx = 0
    }
    e.x += e.vx * dt
    e.vy = 0
    e.moving = Math.abs(e.vx) > 3
    if (Math.abs(e.vx) > 3) e.facing = e.vx > 0 ? 1 : -1
    return
  }

  // --- 虎鯨躍出水面 ---
  if (species === 'orca') {
    if (e.state === 'breachPrep') {
      // 先游到池塘深處、靠近中央的位置助跑
      const arrived = steer(e, e.tx, e.ty, speed * 1.6, dt)
      if (arrived || e.stateT <= 0) {
        e.state = 'breach'
        e.breachY0 = e.y
        const toward = e.x < (env.pond.x0 + env.pond.x1) / 2 ? 1 : -1
        const peak = WATER_TOP - e.def.length * e.sizeK * 0.32
        e.vy = -Math.sqrt(2 * 1100 * Math.max(120, e.y - peak))
        e.vx = toward * 110
        splash(e.x, env, 0.4)
      }
      e.stateT -= dt
    } else if (e.state === 'breach') {
      const prevY = e.y
      e.vy += 1100 * dt
      e.x += e.vx * dt
      e.y += e.vy * dt
      if (prevY > WATER_TOP && e.y <= WATER_TOP) splash(e.x, env, 1.2)
      if (prevY < WATER_TOP && e.y >= WATER_TOP) {
        splash(e.x, env, 1.5)
        e.vy *= 0.35
        e.state = 'swim'
        e.stateT = 2
        e.specialCd = rr(env.rand, 25, 45)
        pickSwimTarget(e, env)
      }
      e.facing = e.vx >= 0 ? 1 : -1
      e.moving = true
      return
    } else {
      e.specialCd -= dt
      if (e.specialCd <= 0 && !pellet && !env.night) {
        e.state = 'breachPrep'
        e.stateT = 8
        const { pond } = env
        e.tx = clamp(e.x < (pond.x0 + pond.x1) / 2 ? pond.x0 + hw + 20 : pond.x1 - hw - 20, pond.x0 + hw, pond.x1 - hw)
        e.ty = clamp(pond.y1 - hh - 20, pond.y0 + hh, pond.y1 - hh)
      }
    }
  }

  // --- 海龜定時浮到水面換氣 ---
  if (species === 'turtle') {
    if (e.state === 'surface') {
      e.stateT -= dt
      const top = WATER_TOP + hh * 0.7
      steer(e, e.x, top, speed * 1.2, dt)
      if (Math.abs(e.y - top) < 10 && e.stateT > 0 && env.rand() < dt * 2) {
        env.fx.add({ kind: 'bubble', x: e.x + 40 * e.facing * e.sizeK, y: e.y - 6, vy: -22, life: 1.4, size: rr(env.rand, 3, 6) })
      }
      if (e.stateT <= 0) {
        e.state = 'swim'
        e.specialCd = rr(env.rand, 35, 60)
        pickSwimTarget(e, env)
      }
    } else {
      e.specialCd -= dt
      if (e.specialCd <= 0 && !pellet) {
        e.state = 'surface'
        e.stateT = 5
      }
    }
  }

  // --- 白鯨偶爾吐泡泡 ---
  if (species === 'beluga' && !pellet) {
    e.specialCd -= dt
    if (e.specialCd <= 0) {
      e.specialCd = rr(env.rand, 14, 26)
      e.anim = { kind: 'blow', t: 0, dur: 1.4 }
    }
  }
  if (e.anim?.kind === 'blow' && env.rand() < dt * 9) {
    env.fx.add({ kind: 'bubble', x: e.x + hw * 0.85 * e.facing, y: e.y - hh * 0.9, vx: 12 * e.facing, vy: -rr(env.rand, 24, 46), life: 2.2, size: rr(env.rand, 3, 9) })
  }
  // 撫摸白鯨：吐出泡泡圈回應
  if (e.anim?.kind === 'pet') {
    if (env.rand() < dt * 2.4) {
      env.fx.add({ kind: 'ring', x: e.x + hw * 0.9 * e.facing, y: e.y - hh, vy: -34, life: 1.8, size: rr(env.rand, 10, 18) })
    }
    if (env.rand() < dt * 3) env.fx.add({ kind: 'heart', x: e.x + rr(env.rand, -hw * 0.5, hw * 0.5), y: e.y - hh * 1.6, vy: -26, life: 1.3, size: 8 })
  }

  // --- 一般游動 ---
  if (e.state !== 'surface' && e.state !== 'breachPrep') {
    if (pellet) {
      e.foodId = pellet.id
      const arrived = steer(e, pellet.x, pellet.y, speed * 2, dt)
      if (arrived || Math.hypot(pellet.x - e.x - e.facing * hw * 0.6, pellet.y - e.y) < Math.max(14, hh)) {
        env.removePellet(pellet.id)
        e.anim = { kind: 'eat', t: 0, dur: 0.8 }
        for (let i = 0; i < 4; i++) env.fx.add({ kind: 'bubble', x: pellet.x, y: pellet.y, vx: rr(env.rand, -14, 14), vy: -rr(env.rand, 14, 36), life: 1.2, size: rr(env.rand, 2, 4) })
      }
    } else if (a && a.kind === 'pet') {
      steer(e, e.x, e.y, speed, dt) // 被摸的時候停下來
    } else {
      e.stateT -= dt
      const arrived = steer(e, e.tx, e.ty, speed, dt)
      if (e.state === 'swim' && (arrived || e.stateT <= 0 || (e.tx === 0 && e.ty === 0))) {
        pickSwimTarget(e, env)
        e.stateT = rr(env.rand, 6, 14)
      }
    }
  }

  e.x += e.vx * dt
  e.y += e.vy * dt
  e.moving = Math.hypot(e.vx, e.vy) > 6
  // 反方向游超過 0.4 秒才轉身，避免被推開時來回翻面
  const want = e.vx > 0 ? 1 : -1
  if (Math.abs(e.vx) > 8 && want !== e.facing) {
    e.flipT += dt
    if (e.flipT > 0.4) {
      e.facing = want
      e.flipT = 0
    }
  } else e.flipT = 0

  // 小丑魚：3 隻成群，跟著領頭的位置游
  if (e.school.length) {
    for (const f of e.school) {
      const wobx = Math.sin(e.t * 1.7 + f.ph) * 10
      const woby = Math.cos(e.t * 1.3 + f.ph * 1.7) * 8
      const gx = e.x - e.facing * f.ox + wobx
      const gy = e.y + f.oy + woby
      const k = Math.min(1, dt * 3.2)
      f.x += (gx - f.x) * k
      f.y += (gy - f.y) * k
      f.facing = e.facing
    }
  }
}

// ---------------------------------------------------------------------------

export function updateEntity(e: Entity, dt: number, env: Env): void {
  if (e.def.domain === 'land') updateLand(e, dt, env)
  else updateSea(e, dt, env)
  clampToArea(e, env)
}
