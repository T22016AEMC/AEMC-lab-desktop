/** 飛機打怪：純邏輯（不碰 DOM），畫面在 draw.ts */

export const W = 360
export const H = 640

export type SfxEvent = 'shoot' | 'hit' | 'explode' | 'power' | 'lose' | 'win'
export type EnemyType = 'grunt' | 'weaver' | 'shooter' | 'tank' | 'boss'
export type PowerKind = 'power' | 'shield'

export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  dmg: number
}

export interface Enemy {
  id: number
  type: EnemyType
  x: number
  y: number
  r: number
  hp: number
  maxHp: number
  baseX: number
  age: number
  cd: number
  cd2: number
  angle: number
  flash: number
  score: number
  phase: number
}

export interface PowerUp {
  x: number
  y: number
  kind: PowerKind
  age: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  kind: 'spark' | 'ring' | 'smoke'
}

export interface Star {
  x: number
  y: number
  z: number
}

interface Spawn {
  t: number
  type: EnemyType
  x: number
  hpBonus: number
}

export interface Player {
  x: number
  y: number
  lives: number
  power: number
  shield: number
  invuln: number
  fireCd: number
  thrust: number
}

export interface ShooterState {
  player: Player
  playerBullets: Bullet[]
  enemyBullets: Bullet[]
  enemies: Enemy[]
  powerups: PowerUp[]
  particles: Particle[]
  stars: Star[]
  queue: Spawn[]
  input: { left: boolean; right: boolean; up: boolean; down: boolean }
  score: number
  wave: number
  /** 下一波開始前的等待秒數 */
  waveDelay: number
  /** 畫面上方「WAVE n」或「BOSS」橫幅的剩餘秒數與文字 */
  banner: { text: string; t: number }
  time: number
  nextId: number
  over: boolean
  /** 本影格產生的音效事件，由畫面層讀取後清空 */
  events: SfxEvent[]
  shake: number
  rand: () => number
}

export const MAX_POWER = 5
const PLAYER_SPEED = 300
const SHIELD_SECONDS = 8

export function createState(rand: () => number = Math.random): ShooterState {
  const stars: Star[] = []
  for (let i = 0; i < 70; i++) stars.push({ x: rand() * W, y: rand() * H, z: [0.3, 0.6, 1][i % 3] })
  const s: ShooterState = {
    player: { x: W / 2, y: H - 90, lives: 3, power: 1, shield: 0, invuln: 1.5, fireCd: 0, thrust: 0 },
    playerBullets: [],
    enemyBullets: [],
    enemies: [],
    powerups: [],
    particles: [],
    stars,
    queue: [],
    input: { left: false, right: false, up: false, down: false },
    score: 0,
    wave: 0,
    waveDelay: 0.6,
    banner: { text: '', t: 0 },
    time: 0,
    nextId: 1,
    over: false,
    events: [],
    shake: 0,
    rand,
  }
  return s
}

// ---------- 波次 ----------

export function spawnWave(s: ShooterState, n: number): void {
  const t0 = s.time + 0.4
  const hpBonus = Math.floor((n - 1) / 4)
  const add = (dt: number, type: EnemyType, x: number) => s.queue.push({ t: t0 + dt, type, x, hpBonus })

  if (n % 5 === 0) {
    add(0, 'boss', W / 2)
    const escorts = 4 + Math.floor(n / 5)
    for (let i = 0; i < escorts; i++) add(7 + i * 1.4, 'grunt', i % 2 ? 60 : W - 60)
    s.banner = { text: '⚠ BOSS', t: 2.2 }
  } else {
    const kind = n % 4
    const cnt = 5 + Math.min(6, Math.floor(n / 2))
    if (kind === 0) {
      for (let i = 0; i < cnt; i++) add(i * 0.45, 'grunt', 30 + ((W - 60) * i) / (cnt - 1))
    } else if (kind === 1) {
      for (let i = 0; i < cnt; i++) add(i * 0.35, 'grunt', W / 2 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 34)
    } else if (kind === 2) {
      for (let i = 0; i < cnt; i++) add(i * 0.6, 'weaver', i % 2 ? 80 : W - 80)
    } else {
      add(0, 'shooter', 70)
      add(0.5, 'shooter', 180)
      add(1, 'shooter', 290)
      for (let i = 0; i < 6; i++) add(2 + i * 0.5, 'grunt', 50 + i * 52)
    }
    if (n >= 2 && kind !== 3) {
      add(cnt * 0.4 + 1, 'shooter', 100)
      add(cnt * 0.4 + 1.6, 'shooter', 260)
    }
    if (n >= 3 && n % 2 === 1) add(2.5, 'tank', W / 2)
    s.banner = { text: `WAVE ${n}`, t: 1.6 }
  }
  s.queue.sort((a, b) => a.t - b.t)
}

function makeEnemy(s: ShooterState, sp: Spawn): Enemy {
  const n = s.wave
  const base = { id: s.nextId++, x: sp.x, y: -30, baseX: sp.x, age: 0, cd: 1 + s.rand() * 1.2, cd2: 0, angle: 0, flash: 0, phase: s.rand() * 6.28 }
  switch (sp.type) {
    case 'grunt':
      return { ...base, type: 'grunt', r: 14, hp: 1 + sp.hpBonus, maxHp: 1 + sp.hpBonus, score: 100 }
    case 'weaver':
      return { ...base, type: 'weaver', r: 15, hp: 2 + sp.hpBonus, maxHp: 2 + sp.hpBonus, score: 150 }
    case 'shooter':
      return { ...base, type: 'shooter', r: 17, hp: 3 + sp.hpBonus, maxHp: 3 + sp.hpBonus, score: 250 }
    case 'tank':
      return { ...base, type: 'tank', r: 22, hp: 10 + sp.hpBonus * 3, maxHp: 10 + sp.hpBonus * 3, score: 400 }
    case 'boss': {
      const hp = 70 + (n / 5 - 1) * 45
      return { ...base, y: -80, type: 'boss', r: 48, hp, maxHp: hp, score: 3000 * (n / 5), cd: 2 }
    }
  }
}

// ---------- 射擊 ----------

function bulletSpeed(s: ShooterState): number {
  return Math.min(280, 190 + s.wave * 4)
}

function fireEnemy(s: ShooterState, x: number, y: number, angle: number, speed: number, r = 5): void {
  s.enemyBullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, dmg: 1 })
}

function angleToPlayer(s: ShooterState, x: number, y: number): number {
  return Math.atan2(s.player.y - y, s.player.x - x)
}

function playerShoot(s: ShooterState): void {
  const p = s.player
  const mk = (dx: number, ang: number) =>
    s.playerBullets.push({ x: p.x + dx, y: p.y - 18, vx: Math.sin(ang) * 560, vy: -Math.cos(ang) * 560, r: 4, dmg: 1 })
  switch (p.power) {
    case 1:
      mk(0, 0)
      break
    case 2:
      mk(-8, 0)
      mk(8, 0)
      break
    case 3:
      mk(0, 0)
      mk(-8, -0.12)
      mk(8, 0.12)
      break
    case 4:
      mk(-8, 0)
      mk(8, 0)
      mk(-12, -0.2)
      mk(12, 0.2)
      break
    default:
      mk(0, 0)
      mk(-9, -0.08)
      mk(9, 0.08)
      mk(-14, -0.26)
      mk(14, 0.26)
  }
  s.events.push('shoot')
}

// ---------- 特效 ----------

function explode(s: ShooterState, x: number, y: number, size: number, color = '#fbbf24'): void {
  const n = Math.round(10 + size * 0.7)
  for (let i = 0; i < n; i++) {
    const a = s.rand() * Math.PI * 2
    const sp = 40 + s.rand() * (80 + size * 4)
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.35 + s.rand() * 0.45,
      maxLife: 0.8,
      size: 2 + s.rand() * (2 + size / 8),
      color: s.rand() < 0.5 ? color : '#fb923c',
      kind: 'spark',
    })
  }
  s.particles.push({ x, y, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, size: size * 1.6, color: '#fde68a', kind: 'ring' })
  for (let i = 0; i < 4; i++) {
    s.particles.push({
      x: x + (s.rand() - 0.5) * size,
      y: y + (s.rand() - 0.5) * size,
      vx: (s.rand() - 0.5) * 30,
      vy: -10 - s.rand() * 25,
      life: 0.7,
      maxLife: 0.7,
      size: size * 0.5,
      color: '#475569',
      kind: 'smoke',
    })
  }
  s.events.push('explode')
}

function dropPowerUp(s: ShooterState, x: number, y: number, kind?: PowerKind): void {
  s.powerups.push({ x, y, kind: kind ?? (s.rand() < 0.6 ? 'power' : 'shield'), age: 0 })
}

function killEnemy(s: ShooterState, e: Enemy): void {
  s.score += e.score
  explode(s, e.x, e.y, e.r * (e.type === 'boss' ? 1.2 : 1))
  if (e.type === 'boss') {
    for (let i = 0; i < 5; i++) explode(s, e.x + (s.rand() - 0.5) * 90, e.y + (s.rand() - 0.5) * 70, 26)
    dropPowerUp(s, e.x - 24, e.y, 'power')
    dropPowerUp(s, e.x + 24, e.y, 'shield')
    s.shake = 0.5
    // 打倒 Boss 時清掉畫面上的敵彈
    s.enemyBullets = []
    s.events.push('win')
  } else {
    const chance = e.type === 'tank' ? 0.5 : e.type === 'shooter' ? 0.25 : 0.1
    if (s.rand() < chance) dropPowerUp(s, e.x, e.y)
  }
}

function hurtPlayer(s: ShooterState): void {
  const p = s.player
  if (p.invuln > 0) return
  if (p.shield > 0) {
    // 護盾期間不受傷，只給一小段無敵避免連續碰撞
    p.invuln = 0.25
    s.events.push('hit')
    return
  }
  p.lives -= 1
  p.power = Math.max(1, p.power - 1)
  p.invuln = 2
  s.shake = 0.35
  explode(s, p.x, p.y, 18, '#93c5fd')
  s.events.push('lose')
  if (p.lives <= 0) {
    s.over = true
    explode(s, p.x, p.y, 40)
  }
}

// ---------- 更新 ----------

export function movePlayerBy(s: ShooterState, dx: number, dy: number): void {
  const p = s.player
  p.x = Math.min(W - 16, Math.max(16, p.x + dx))
  p.y = Math.min(H - 24, Math.max(60, p.y + dy))
}

function updateEnemy(s: ShooterState, e: Enemy, dt: number): void {
  e.age += dt
  e.flash = Math.max(0, e.flash - dt)
  e.cd -= dt
  const n = s.wave
  switch (e.type) {
    case 'grunt':
      e.y += (70 + n * 3) * dt
      e.x = e.baseX + Math.sin(e.age * 2 + e.phase) * 14
      break
    case 'weaver':
      e.y += 62 * dt
      e.x = Math.min(W - 20, Math.max(20, e.baseX + Math.sin(e.age * 2.2 + e.phase) * 90))
      break
    case 'shooter':
      if (e.y < 110) e.y += 90 * dt
      else if (e.age > 11) e.y += 80 * dt
      e.x = e.baseX + Math.sin(e.age * 0.9 + e.phase) * 55
      if (e.cd <= 0 && e.y > 20) {
        fireEnemy(s, e.x, e.y + 14, angleToPlayer(s, e.x, e.y), bulletSpeed(s))
        e.cd = Math.max(0.9, 1.9 - n * 0.04)
      }
      break
    case 'tank':
      if (e.y < 130) e.y += 38 * dt
      else if (e.age > 14) e.y += 60 * dt
      e.x = e.baseX + Math.sin(e.age * 0.7) * 50
      if (e.cd <= 0 && e.y > 20) {
        const a = angleToPlayer(s, e.x, e.y)
        for (const off of [-0.3, 0, 0.3]) fireEnemy(s, e.x, e.y + 16, a + off, bulletSpeed(s) - 20, 6)
        e.cd = 2.2
      }
      break
    case 'boss': {
      if (e.y < 120) {
        e.y += 60 * dt
        break
      }
      e.x = W / 2 + Math.sin(e.age * 0.8) * (W / 2 - 80)
      const ratio = e.hp / e.maxHp
      e.cd2 -= dt
      if (ratio > 0.66) {
        if (e.cd <= 0) {
          const a = angleToPlayer(s, e.x, e.y)
          for (const off of [-0.28, 0, 0.28]) fireEnemy(s, e.x, e.y + 30, a + off, 200, 6)
          e.cd = 1.3
        }
      } else if (ratio > 0.33) {
        if (e.cd <= 0) {
          e.angle += 0.3
          for (let i = 0; i < 10; i++) fireEnemy(s, e.x, e.y + 20, e.angle + (i * Math.PI * 2) / 10, 150, 6)
          e.cd = 1.1
        }
        if (e.cd2 <= 0) {
          fireEnemy(s, e.x, e.y + 30, angleToPlayer(s, e.x, e.y), 230, 7)
          e.cd2 = 0.55
        }
      } else {
        if (e.cd <= 0) {
          e.angle += 0.5
          fireEnemy(s, e.x, e.y + 20, e.angle, 170, 5)
          fireEnemy(s, e.x, e.y + 20, e.angle + Math.PI, 170, 5)
          e.cd = 0.1
        }
        if (e.cd2 <= 0) {
          const a = angleToPlayer(s, e.x, e.y)
          for (const off of [-0.5, -0.25, 0, 0.25, 0.5]) fireEnemy(s, e.x, e.y + 30, a + off, 210, 6)
          e.cd2 = 1.8
        }
      }
      break
    }
  }
}

export function update(s: ShooterState, dtRaw: number): void {
  // 固定小步長，避免高速子彈穿透
  let left = dtRaw
  while (left > 0 && !s.over) {
    const dt = Math.min(left, 1 / 60)
    step(s, dt)
    left -= dt
  }
  if (s.over) {
    // 遊戲結束後仍讓爆炸動畫播完
    for (const p of s.particles) {
      p.x += p.vx * dtRaw
      p.y += p.vy * dtRaw
      p.life -= dtRaw
    }
    s.particles = s.particles.filter((p) => p.life > 0)
  }
}

function step(s: ShooterState, dt: number): void {
  s.time += dt
  const p = s.player
  const inp = s.input
  s.shake = Math.max(0, s.shake - dt)
  s.banner.t = Math.max(0, s.banner.t - dt)

  // 玩家移動
  const mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0)
  const my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0)
  if (mx || my) {
    const len = Math.hypot(mx, my)
    movePlayerBy(s, (mx / len) * PLAYER_SPEED * dt, (my / len) * PLAYER_SPEED * dt)
  }
  p.invuln = Math.max(0, p.invuln - dt)
  p.shield = Math.max(0, p.shield - dt)
  p.thrust += dt * 30

  // 自動射擊
  p.fireCd -= dt
  if (p.fireCd <= 0) {
    playerShoot(s)
    p.fireCd = p.power >= 4 ? 0.13 : 0.16
  }

  // 波次
  while (s.queue.length && s.queue[0].t <= s.time) s.enemies.push(makeEnemy(s, s.queue.shift()!))
  if (s.queue.length === 0 && s.enemies.length === 0) {
    s.waveDelay -= dt
    if (s.waveDelay <= 0) {
      if (s.wave > 0) s.score += 200 * s.wave // 過關獎勵
      s.wave += 1
      s.waveDelay = 1.8
      spawnWave(s, s.wave)
    }
  }

  // 敵人
  for (const e of s.enemies) updateEnemy(s, e, dt)
  s.enemies = s.enemies.filter((e) => e.y < H + 50)

  // 子彈
  for (const b of s.playerBullets) {
    b.x += b.vx * dt
    b.y += b.vy * dt
  }
  s.playerBullets = s.playerBullets.filter((b) => b.y > -20 && b.x > -20 && b.x < W + 20)
  for (const b of s.enemyBullets) {
    b.x += b.vx * dt
    b.y += b.vy * dt
  }
  s.enemyBullets = s.enemyBullets.filter((b) => b.y > -30 && b.y < H + 30 && b.x > -30 && b.x < W + 30)

  // 玩家子彈 vs 敵人
  for (const b of s.playerBullets) {
    for (const e of s.enemies) {
      if (e.hp <= 0 || e.y < -e.r * 0.5) continue
      const dx = b.x - e.x
      const dy = b.y - e.y
      if (dx * dx + dy * dy < (e.r + b.r) * (e.r + b.r)) {
        e.hp -= b.dmg
        e.flash = 0.06
        b.y = -999
        if (e.hp <= 0) killEnemy(s, e)
        else if (s.rand() < 0.3) s.events.push('hit')
        break
      }
    }
  }
  s.playerBullets = s.playerBullets.filter((b) => b.y > -100)
  s.enemies = s.enemies.filter((e) => e.hp > 0)

  // 敵彈、敵機 vs 玩家（碰撞半徑比外觀小，比較寬容）
  const hit = 9
  for (const b of s.enemyBullets) {
    const dx = b.x - p.x
    const dy = b.y - p.y
    if (dx * dx + dy * dy < (hit + b.r) * (hit + b.r)) {
      b.y = 9999
      hurtPlayer(s)
    }
  }
  s.enemyBullets = s.enemyBullets.filter((b) => b.y < 9000)
  for (const e of s.enemies) {
    const dx = e.x - p.x
    const dy = e.y - p.y
    if (dx * dx + dy * dy < (e.r * 0.8 + hit) * (e.r * 0.8 + hit)) {
      if (e.type !== 'boss') {
        e.hp = 0
        killEnemy(s, e)
      }
      hurtPlayer(s)
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0)

  // 道具
  for (const u of s.powerups) {
    u.age += dt
    u.y += 70 * dt
    const dx = u.x - p.x
    const dy = u.y - p.y
    if (dx * dx + dy * dy < 26 * 26) {
      if (u.kind === 'power') {
        if (p.power < MAX_POWER) p.power += 1
        else s.score += 500
      } else {
        p.shield = Math.min(SHIELD_SECONDS + 4, p.shield + SHIELD_SECONDS)
      }
      s.score += 50
      s.events.push('power')
      u.y = 9999
    }
  }
  s.powerups = s.powerups.filter((u) => u.y < H + 20)

  // 粒子與星空
  for (const q of s.particles) {
    q.x += q.vx * dt
    q.y += q.vy * dt
    q.life -= dt
    if (q.kind === 'spark') {
      q.vx *= 0.97
      q.vy *= 0.97
    }
  }
  s.particles = s.particles.filter((q) => q.life > 0)
  for (const st of s.stars) {
    st.y += 50 * st.z * dt * (1 + s.wave * 0.02)
    if (st.y > H) {
      st.y = 0
      st.x = s.rand() * W
    }
  }
}
