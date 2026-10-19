/** 彈珠台：物理與規則（matter-js），不碰 DOM；畫面在 draw.ts */
import Matter from 'matter-js'

const { Engine, Bodies, Body, Composite, Events } = Matter

// matter-js 0.20 的 setAngle／setPosition 有第三個參數 updateVelocity，但 @types 還沒有
const setAngle = Body.setAngle as (b: Matter.Body, angle: number, updateVelocity?: boolean) => void
const setPosition = Body.setPosition as (b: Matter.Body, pos: Matter.Vector, updateVelocity?: boolean) => void

export const W = 400
export const H = 700
export const BALL_R = 10
export const START_LIVES = 3

const LANE_X = 382
const BALL_START_Y = 668
const SUBSTEPS = 3
const MAX_SPEED = 26

export type PinballEvent = 'bounce' | 'flip' | 'launch' | 'hit' | 'bonus' | 'lose' | 'over'

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Bumper {
  x: number
  y: number
  r: number
  lit: number
}
export interface Target {
  body: Matter.Body
  w: number
  h: number
  lit: number
  on: boolean
}
export interface Rollover {
  x: number
  y: number
  on: boolean
}
export interface Sling {
  pts: { x: number; y: number }[]
  lit: number
}

export interface Popup {
  x: number
  y: number
  text: string
  life: number
}

export type Phase = 'waiting' | 'playing' | 'over'

export interface Pinball {
  readonly walls: Segment[]
  readonly bumpers: Bumper[]
  readonly targets: Target[]
  readonly rollovers: Rollover[]
  readonly slings: Sling[]
  readonly posts: { x: number; y: number; r: number }[]
  readonly flippers: { left: Flipper; right: Flipper }
  ball: Matter.Body
  score: number
  lives: number
  phase: Phase
  /** 彈簧蓄力 0~1 */
  plunger: number
  charging: boolean
  gateClosed: boolean
  popups: Popup[]
  events: PinballEvent[]
  time: number
  setFlipper(side: 'left' | 'right', pressed: boolean): void
  /** 按住蓄力、放開發射 */
  setPlunger(pressed: boolean): void
  update(dt: number): void
  destroy(): void
}

export interface Flipper {
  body: Matter.Body
  pivot: { x: number; y: number }
  length: number
  thickness: number
  rest: number
  up: number
  angle: number
  pressed: boolean
}

function segmentBody(s: Segment, thickness: number, opts: Matter.IChamferableBodyDefinition = {}): Matter.Body {
  const cx = (s.x1 + s.x2) / 2
  const cy = (s.y1 + s.y2) / 2
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
  return Bodies.rectangle(cx, cy, len + thickness * 0.6, thickness, {
    isStatic: true,
    angle: Math.atan2(s.y2 - s.y1, s.x2 - s.x1),
    restitution: 0.35,
    friction: 0,
    label: 'wall',
    ...opts,
  })
}

export function createPinball(rand: () => number = Math.random): Pinball {
  const engine = Engine.create({ positionIterations: 10, velocityIterations: 8 })
  engine.gravity.y = 0.85
  const world = engine.world

  const walls: Segment[] = []
  const wallThickness = 14
  const addWall = (s: Segment) => {
    walls.push(s)
    Composite.add(world, segmentBody(s, wallThickness))
  }

  // 上方拱形（圓心 (200,200)，半徑 200）
  const ARCH_STEPS = 28
  for (let i = 0; i < ARCH_STEPS; i++) {
    const a1 = Math.PI + (Math.PI * i) / ARCH_STEPS
    const a2 = Math.PI + (Math.PI * (i + 1)) / ARCH_STEPS
    addWall({
      x1: 200 + 200 * Math.cos(a1),
      y1: 200 + 200 * Math.sin(a1),
      x2: 200 + 200 * Math.cos(a2),
      y2: 200 + 200 * Math.sin(a2),
    })
  }
  addWall({ x1: 0, y1: 200, x2: 0, y2: 520 }) // 左牆
  addWall({ x1: 400, y1: 200, x2: 400, y2: 720 }) // 右牆（彈射道外側）
  addWall({ x1: 362, y1: 235, x2: 362, y2: 720 }) // 彈射道與球檯的隔牆
  addWall({ x1: 0, y1: 520, x2: 86, y2: 616 }) // 左導板
  addWall({ x1: 362, y1: 520, x2: 278, y2: 616 }) // 右導板
  // 彈射道底板
  Composite.add(world, Bodies.rectangle(381, 690, 30, 12, { isStatic: true, label: 'wall', friction: 0 }))

  // 閘門：球進入球檯後關上，避免彈回彈射道
  const gate = segmentBody({ x1: 362, y1: 235, x2: 362, y2: 100 }, 8)
  let gateInWorld = false

  // 彈跳器
  const bumpers: Bumper[] = [
    { x: 125, y: 255, r: 27, lit: 0 },
    { x: 239, y: 255, r: 27, lit: 0 },
    { x: 182, y: 335, r: 27, lit: 0 },
  ]
  for (const b of bumpers) {
    Composite.add(world, Bodies.circle(b.x, b.y, b.r, { isStatic: true, restitution: 0.5, friction: 0, label: `bumper:${bumpers.indexOf(b)}` }))
  }

  // 側邊彈弓（三角形）：斜面朝向球檯內側
  const slings: Sling[] = [
    { pts: [{ x: 36, y: 440 }, { x: 36, y: 520 }, { x: 96, y: 540 }], lit: 0 },
    { pts: [{ x: 328, y: 440 }, { x: 328, y: 520 }, { x: 268, y: 540 }], lit: 0 },
  ]
  slings.forEach((sl, i) => {
    const cx = (sl.pts[0].x + sl.pts[1].x + sl.pts[2].x) / 3
    const cy = (sl.pts[0].y + sl.pts[1].y + sl.pts[2].y) / 3
    const body = Bodies.fromVertices(cx, cy, [sl.pts], { isStatic: true, restitution: 0.6, friction: 0, label: `sling:${i}` })
    Composite.add(world, body)
  })

  // 立靶
  const targets: Target[] = []
  for (const t of [
    { x: 70, y: 340, w: 9, h: 36 },
    { x: 294, y: 340, w: 9, h: 36 },
    { x: 182, y: 160, w: 40, h: 9 },
  ]) {
    const body = Bodies.rectangle(t.x, t.y, t.w, t.h, { isStatic: true, restitution: 0.4, friction: 0, label: `target:${targets.length}` })
    targets.push({ body, w: t.w, h: t.h, lit: 0, on: false })
    Composite.add(world, body)
  }

  // 頂部三條通道（球經過就點亮）
  const rollovers: Rollover[] = [
    { x: 142, y: 78, on: false },
    { x: 182, y: 70, on: false },
    { x: 222, y: 78, on: false },
  ]
  rollovers.forEach((r, i) => {
    Composite.add(world, Bodies.circle(r.x, r.y, 11, { isStatic: true, isSensor: true, label: `rollover:${i}` }))
  })
  const posts = [
    { x: 162, y: 76, r: 4 },
    { x: 202, y: 76, r: 4 },
  ]
  for (const p of posts) Composite.add(world, Bodies.circle(p.x, p.y, p.r, { isStatic: true, restitution: 0.4, friction: 0, label: 'wall' }))

  // 擋板：靜態剛體，每個子步用位置與角度的差值當作速度，這樣球才會被打飛
  const makeFlipper = (side: 'left' | 'right'): Flipper => {
    const left = side === 'left'
    const pivot = left ? { x: 100, y: 625 } : { x: 264, y: 625 }
    const length = 66
    const thickness = 15
    const rest = left ? 0.45 : Math.PI - 0.45
    const up = left ? -0.42 : Math.PI + 0.42
    const body = Bodies.rectangle(0, 0, length, thickness, {
      isStatic: true,
      chamfer: { radius: 6 },
      restitution: 0.2,
      friction: 0,
      label: 'flipper',
    })
    const f: Flipper = { body, pivot, length, thickness, rest, up, angle: rest, pressed: false }
    placeFlipper(f, false)
    Composite.add(world, body)
    return f
  }
  const flippers = { left: makeFlipper('left'), right: makeFlipper('right') }

  const ball = Bodies.circle(LANE_X, BALL_START_Y, BALL_R, {
    restitution: 0.5,
    friction: 0,
    frictionAir: 0.0006,
    density: 0.0015,
    label: 'ball',
    slop: 0.02,
  })
  Composite.add(world, ball)
  Body.setStatic(ball, true)

  const pb: Pinball = {
    walls,
    bumpers,
    targets,
    rollovers,
    slings,
    posts,
    flippers,
    ball,
    score: 0,
    lives: START_LIVES,
    phase: 'waiting',
    plunger: 0,
    charging: false,
    gateClosed: false,
    popups: [],
    events: [],
    time: 0,
    setFlipper(side, pressed) {
      const f = flippers[side]
      if (pressed && !f.pressed && pb.phase !== 'over') pb.events.push('flip')
      f.pressed = pressed
    },
    setPlunger(pressed) {
      if (pb.phase === 'waiting') {
        if (pressed) pb.charging = true
        else if (pb.charging) {
          pb.charging = false
          launch()
        }
      } else if (!pressed) {
        pb.charging = false
        pb.plunger = 0
      }
    },
    update,
    destroy() {
      Events.off(engine, 'collisionStart', onCollision)
      Composite.clear(world, false)
      Engine.clear(engine)
    },
  }

  function placeFlipper(f: Flipper, updateVelocity: boolean) {
    const cx = f.pivot.x + Math.cos(f.angle) * (f.length / 2 - f.thickness / 2)
    const cy = f.pivot.y + Math.sin(f.angle) * (f.length / 2 - f.thickness / 2)
    setAngle(f.body, f.angle, updateVelocity)
    setPosition(f.body, { x: cx, y: cy }, updateVelocity)
  }

  function popup(x: number, y: number, text: string) {
    pb.popups.push({ x, y, text, life: 0.9 })
  }
  function addScore(n: number, x: number, y: number) {
    pb.score += n
    popup(x, y, `+${n}`)
  }

  function setGate(closed: boolean) {
    if (closed && !gateInWorld) {
      Composite.add(world, gate)
      gateInWorld = true
    } else if (!closed && gateInWorld) {
      Composite.remove(world, gate)
      gateInWorld = false
    }
    pb.gateClosed = closed
  }

  function resetBall() {
    setGate(false)
    Body.setStatic(ball, true)
    Body.setPosition(ball, { x: LANE_X, y: BALL_START_Y })
    Body.setVelocity(ball, { x: 0, y: 0 })
    pb.phase = 'waiting'
    pb.plunger = 0
    pb.charging = false
  }

  function launch() {
    const power = Math.max(0.18, pb.plunger)
    Body.setStatic(ball, false)
    Body.setVelocity(ball, { x: 0, y: -(12 + 15 * power) })
    pb.phase = 'playing'
    pb.plunger = 0
    pb.events.push('launch')
    stillTime = 0
  }

  // ---- 碰撞規則 ----
  const onCollision = (ev: Matter.IEventCollision<Matter.Engine>) => {
    for (const pair of ev.pairs) {
      const a = pair.bodyA
      const b = pair.bodyB
      const other = a === ball ? b : b === ball ? a : null
      if (!other) continue
      const [kind, idx] = other.label.split(':')
      const i = Number(idx)
      if (kind === 'bumper') {
        const bm = bumpers[i]
        const dx = ball.position.x - bm.x
        const dy = ball.position.y - bm.y
        const d = Math.hypot(dx, dy) || 1
        const sp = Math.min(MAX_SPEED - 4, Math.max(11, ball.speed * 0.9 + 4))
        Body.setVelocity(ball, { x: (dx / d) * sp, y: (dy / d) * sp })
        bm.lit = 0.25
        addScore(100, bm.x, bm.y - bm.r)
        pb.events.push('bounce')
      } else if (kind === 'sling') {
        const sl = slings[i]
        // 朝球檯內側推一把：往上、往中間
        const dir = i === 0 ? 1 : -1
        const sp = Math.min(MAX_SPEED - 4, Math.max(10, ball.speed * 0.85 + 4))
        Body.setVelocity(ball, { x: dir * sp * 0.55, y: -sp * 0.85 })
        sl.lit = 0.2
        addScore(50, sl.pts[0].x + 30, sl.pts[0].y)
        pb.events.push('bounce')
      } else if (kind === 'target') {
        const t = targets[i]
        t.lit = 0.25
        if (!t.on) {
          t.on = true
          addScore(150, t.body.position.x, t.body.position.y)
          pb.events.push('hit')
          if (targets.every((x) => x.on)) {
            targets.forEach((x) => (x.on = false))
            addScore(1000, 182, 230)
            pb.events.push('bonus')
          }
        } else {
          addScore(50, t.body.position.x, t.body.position.y)
          pb.events.push('hit')
        }
      } else if (kind === 'rollover') {
        const r = rollovers[i]
        if (!r.on) {
          r.on = true
          addScore(25, r.x, r.y + 10)
          if (rollovers.every((x) => x.on)) {
            rollovers.forEach((x) => (x.on = false))
            addScore(500, 182, 110)
            pb.events.push('bonus')
          }
        }
      }
    }
  }
  Events.on(engine, 'collisionStart', onCollision)

  // ---- 每影格更新 ----
  let stillTime = 0

  function update(dtRaw: number) {
    const dt = Math.min(dtRaw, 1 / 30)
    pb.time += dt
    if (pb.phase === 'over') {
      for (const p of pb.popups) p.life -= dt
      pb.popups = pb.popups.filter((p) => p.life > 0)
      return
    }

    // 蓄力
    if (pb.phase === 'waiting' && pb.charging) pb.plunger = Math.min(1, pb.plunger + dt * 1.1)

    const sub = dt / SUBSTEPS
    for (let k = 0; k < SUBSTEPS; k++) {
      // 擋板朝目標角度轉動（上擊快、回落慢）
      for (const f of [flippers.left, flippers.right]) {
        const target = f.pressed ? f.up : f.rest
        const speed = f.pressed ? 24 : 13
        const diff = target - f.angle
        const stepAngle = Math.sign(diff) * Math.min(Math.abs(diff), speed * sub)
        f.angle += stepAngle
        placeFlipper(f, true)
      }
      Engine.update(engine, sub * 1000)
      // 限速，避免高速穿透
      if (!ball.isStatic && ball.speed > MAX_SPEED) {
        const k2 = MAX_SPEED / ball.speed
        Body.setVelocity(ball, { x: ball.velocity.x * k2, y: ball.velocity.y * k2 })
      }
    }
    // 擋板停止轉動後速度歸零
    for (const f of [flippers.left, flippers.right]) {
      if (f.angle === (f.pressed ? f.up : f.rest)) {
        Body.setVelocity(f.body, { x: 0, y: 0 })
        Body.setAngularVelocity(f.body, 0)
      }
    }

    for (const b of bumpers) b.lit = Math.max(0, b.lit - dt)
    for (const s of slings) s.lit = Math.max(0, s.lit - dt)
    for (const t of targets) t.lit = Math.max(0, t.lit - dt)
    for (const p of pb.popups) {
      p.life -= dt
      p.y -= 30 * dt
    }
    pb.popups = pb.popups.filter((p) => p.life > 0)

    if (pb.phase !== 'playing') return
    const { x, y } = ball.position

    // 球進入球檯後關閘門
    if (!pb.gateClosed && x < 352 && y < 300) setGate(true)

    // 掉出下方：扣一顆球
    if (y > H + 30) {
      pb.lives -= 1
      pb.events.push('lose')
      if (pb.lives <= 0) {
        pb.phase = 'over'
        pb.events.push('over')
        Body.setStatic(ball, true)
      } else {
        resetBall()
      }
      return
    }

    // 卡住保護
    const inLane = x > 366 && y > 600
    if (ball.speed < 0.25) stillTime += dt
    else stillTime = 0
    if (inLane && stillTime > 0.6) {
      // 沒射出去，掉回彈射道底部：重新發球
      resetBall()
    } else if (stillTime > 4) {
      Body.setVelocity(ball, { x: (rand() - 0.5) * 8, y: -8 })
      stillTime = 0
    }
  }

  return pb
}
