import { BALANCE } from '../config/balance'
import { SPECIES, variantOf } from '../config/species'
import { isSleeping } from '../sim/rules'
import { isSleepTime } from '../sim/worldTime'
import { releaseUse } from './buildingUse'
import { isWalkable, nearestWalkable, petBounds, type Layout } from './layout'
import { isClear, type Pt } from './nav'
import { isFinderBusy, updateFinder } from './finder'
import type { Action, Actor, BehaviorEnv } from './pets'

/**
 * 玩耍的狀態機（v3.5.0）。這一層只決定「現在在做什麼」與位置，畫哪一幀由 pets.ts 的 ANIMS 對應；不旋轉、不縮放。
 * 玩耍的所有狀態都在 `Actor.play`（單一欄位，和 bath 一樣），階段轉換全部寫在這個檔案，沒有散落的旗標。
 * 之後貓的玩具（v3.6.0）沿用同一套：開始（beginPlay）、計時與提前結算（endPlay）、點擊處理，只換「玩具的動作」。
 *
 * 一次完整的丟球：
 *   ready 待命（也是「等下一次丟球」）→ 合法點擊 → flight（球出手、狗看著球 reaction 秒）
 *   → chase 追球（球可能還在空中，到達而且球已落地才叼）→ grab 叼起 → return 叼回 home → drop 放下（撿回 +1）→ ready
 *   時間到（seconds）：ready／flight／chase 直接 cheer；grab／return／drop 讓它做完（最多再 graceSeconds 秒），之後 cheer
 *   cheer 開心跳一下、冒愛心（結算在進入 cheer 的那一刻，只做一次）。提前結算（拖曳、開視窗、睡覺時間到、視窗大小改變）不演 cheer。
 * 多幀動作沒完成就維持目前階段，不會每一幀重新開始；路徑只在目標改變時重算（moveToward 的規則）。
 */

export type PlayToyId = 'ball' | 'dig' | 'hunt'
/**
 * 丟球：ready → flight → chase → grab → return → drop。
 * 挖寶（dig）、尋寶（hunt）（v3.6.0，pixel/finder.ts）：search 挑位置 → go 走過去 → work（狗挖地／貓蹲下）→ [貓：pounce 撲 → back 叼著布包走回 → put 放下]／[狗：mark 留下土堆] → search…
 * 時間到時 cheer；所有玩具共用 cheer 與提前結算。
 */
export type PlayPhase = 'ready' | 'flight' | 'chase' | 'grab' | 'return' | 'drop' | 'cheer' | 'search' | 'go' | 'work' | 'pounce' | 'back' | 'put' | 'mark'
/** 結束的原因：time／user 演 cheer；其他只結算數值 */
export type PlayEnd = 'time' | 'user' | 'drag' | 'window' | 'sleep' | 'resize' | 'rehome'

/** 球：從 (fromX, fromY, 高 fromZ) 飛到地面 (toX, toY)；t 是出手後的時間，dur 是飛行時間（dur 之後是落地彈跳） */
export interface PlayBall {
  fromX: number
  fromY: number
  fromZ: number
  toX: number
  toY: number
  arc: number
  t: number
  dur: number
}

export interface PlayState {
  toy: PlayToyId
  phase: PlayPhase
  /** 這個階段已經過的時間（秒） */
  t: number
  /** 剩餘玩耍時間（秒）；小於 0 = 時間到、正在寬限 */
  left: number
  /** 撿回次數（完整叼回放下才算） */
  catches: number
  /** 開始玩耍時狗站的位置：球叼回這裡 */
  home: Pt
  /** 地上或空中的球；叼著的球不在這裡（phase 為 grab、return 時畫在嘴邊） */
  ball: PlayBall | null
  /** 開始時就在睡覺時間內（夜間被叫醒的狗）：這種情況睡覺時間不會結束玩耍，只有 30 秒或其他提前結算 */
  nightStart: boolean
  /** ready：下一次輕輕跳一下的倒數 */
  hopIn: number
  /** cheer：愛心已經冒了幾顆 */
  hearts: number
  /** 挖寶／尋寶：這一次要去的位置、貓叼回來放下的位置（沒在這個階段 = null） */
  spot: Pt | null
  put: Pt | null
}

/** 玩耍需要的引擎連接（BehaviorEnv 的子集） */
export type PlayEnv = Pick<BehaviorEnv, 'layout' | 'rand' | 'emit' | 'settlePlay' | 'others' | 'nowMs' | 'hour' | 'finds' | 'findCap' | 'addFind'>

export interface PlayOps {
  setAction: (a: Actor, action: Action, dur: number) => void
  moveToward: (a: Actor, dt: number, speed: number, env: BehaviorEnv) => void
  clampActor: (a: Actor, L: Layout) => void
}

/**
 * 叼球時球心的位置：各品種、各幀，相對腳底錨點（面向右時；往左走水平翻轉，x 跟著反號）。y 是球心離腳底的高度（負 = 往上）。
 * 逐張量過吻部最右邊的不透明像素（上半身），球心放在吻部前緣往內 1 像素、嘴的高度；柯基頭小，球往下 2 像素。
 * 球是 toy_ball_s（11×12）。改狗素材後要重量（測試會檢查每個品種都有 stand／walk_a／walk_b）。
 */
export const MOUTH: Record<string, Record<string, readonly [number, number]>> = {
  shiba: { stand: [17, -20], walk_a: [19, -19], walk_b: [19, -18] },
  corgi: { stand: [16, -14], walk_a: [17, -15], walk_b: [17, -15] },
  husky: { stand: [21, -24], walk_a: [23, -22], walk_b: [23, -24] },
  golden: { stand: [23, -31], walk_a: [26, -31], walk_b: [27, -32] },
  collie: { stand: [21, -25], walk_a: [23, -25], walk_b: [23, -25] },
  poodle: { stand: [15, -20], walk_a: [17, -20], walk_b: [18, -20] },
}

export function mouthOffset(assetKey: string, frame: string, facing: 1 | -1): { x: number; y: number } | null {
  const m = MOUTH[assetKey]?.[frame]
  return m ? { x: m[0] * facing, y: m[1] } : null
}

const T = BALANCE.play.timing
const rr = (rand: () => number, a: number, b: number): number => a + rand() * (b - a)

/** 球現在的位置：x、y 是地面位置，z 是離地高度（飛行是拋物線，落地後小彈跳兩下） */
export function ballPos(b: PlayBall): { x: number; y: number; z: number } {
  if (b.t < b.dur) {
    const k = b.t / b.dur
    const e = 1 - (1 - k) * (1 - k) // ease-out：出手快、快落地時慢下來
    return { x: b.fromX + (b.toX - b.fromX) * e, y: b.fromY + (b.toY - b.fromY) * e, z: b.fromZ * (1 - k) + b.arc * 4 * k * (1 - k) }
  }
  const bt = b.t - b.dur
  let z = 0
  if (bt < T.bounce) {
    const k = bt / T.bounce
    z = 5 * (1 - k) * Math.abs(Math.sin(k * Math.PI * 2))
  }
  return { x: b.toX, y: b.toY, z: Math.round(z) }
}

/** 球已經停在地上了嗎（飛行結束） */
export const ballLanded = (b: PlayBall): boolean => b.t >= b.dur

/** 叼著球（畫在嘴邊）：叼起到叼回放下之前 */
export const isCarrying = (p: PlayState): boolean => p.phase === 'grab' || p.phase === 'return'

/** 開始玩耍：狗留在原地（home），清掉建築使用、躲雨倒數與指令動作。layout 用來確認 home 站得住 */
export function beginPlay(a: Actor, L: Layout, setAction: PlayOps['setAction'], hour: number, toy: PlayToyId = 'ball'): void {
  releaseUse(a)
  // 座位旁的位置是坐下時算的：之後換過視窗大小，同一個座標可能已經落在別的建築裡，離開座位時要確認站得住
  if (!isWalkable(L, a.x, a.y)) {
    const p = nearestWalkable(L, a.x, a.y)
    a.x = p.x
    a.y = p.y
  }
  a.override = null
  a.rainIn = null
  a.seek = null
  a.path = []
  a.pathKey = ''
  let home = { x: a.x, y: a.y }
  if (!isClear(L, home.x, home.y)) home = nearestWalkable(L, home.x, home.y)
  a.tx = a.x
  a.ty = a.y
  const ball = toy === 'ball'
  a.play = {
    toy, phase: ball ? 'ready' : 'search', t: 0, left: ball ? BALANCE.play.seconds : BALANCE.dig.seconds, catches: 0, home, ball: null, nightStart: isSleepTime(hour), hopIn: 1.2, hearts: 0,
    spot: null, put: null,
  }
  setAction(a, 'idle', 1e9)
}

export type ThrowCheck = { ok: true; x: number; y: number } | { ok: false; reason: 'busy' | 'out' | 'blocked' | 'near' | 'pet'; message?: string }

const NOT_HERE = '這裡不能丟，請丟在草地或走道上'

/**
 * 球的落點合法嗎：必須是 ready（球在空中、狗在追、叼回中都不接受新的丟球）、時間還沒到、在主要活動範圍（不含洗澡通道）內、
 * 離障礙（水池、建築、樹幹、塔底…）至少 3 像素（狗走得到）、離狗至少 minThrow、不壓在睡著或坐在座位上的寵物身上。
 */
export function checkThrow(L: Layout, a: Actor, others: readonly Actor[], x: number, y: number): ThrowCheck {
  const p = a.play
  if (!p || p.phase !== 'ready' || p.left <= 0) return { ok: false, reason: 'busy' }
  const b = petBounds(L)
  if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return { ok: false, reason: 'out', message: NOT_HERE }
  if (!isClear(L, x, y) || !isWalkable(L, x, y)) return { ok: false, reason: 'blocked', message: NOT_HERE }
  if (Math.hypot(x - a.x, y - a.y) < BALANCE.play.minThrow) return { ok: false, reason: 'near', message: '太近了，丟遠一點' }
  for (const o of others) {
    if (o === a || o.drag || o.fly || o.bath) continue
    if ((o.action === 'sleep' || o.bld?.phase === 'at') && ((o.x - x) / 38) ** 2 + ((o.y - y) / 13) ** 2 < 1) return { ok: false, reason: 'pet', message: '那裡有寵物在休息' }
  }
  return { ok: true, x, y }
}

/** 丟球（落點已通過 checkThrow）：球從狗的嘴邊飛出，狗轉向看球 */
export function throwBall(a: Actor, x: number, y: number, setAction: PlayOps['setAction']): void {
  const p = a.play!
  if (Math.abs(x - a.x) > 1) a.facing = x > a.x ? 1 : -1
  const mouth = mouthOffset(variantOf(a.pet.species, a.pet.variant).assetKey, 'stand', a.facing) ?? { x: 14 * a.facing, y: -20 }
  const d = Math.hypot(x - a.x, y - a.y)
  p.phase = 'flight'
  p.t = 0
  p.ball = {
    fromX: a.x + mouth.x,
    fromY: a.y,
    fromZ: -mouth.y,
    toX: x,
    toY: y,
    arc: Math.min(52, Math.max(14, d * 0.3)),
    t: 0,
    dur: Math.min(T.flightMax, Math.max(T.flightMin, T.flightBase + d * T.flightPerPx)),
  }
  setAction(a, 'idle', 1e9)
}

/** 叼回的終點：home 沒被別的寵物占著就用 home，否則由近到遠找最近的、可站而且沒被占住的位置 */
function returnSpot(a: Actor, p: PlayState, env: PlayEnv): Pt {
  const L = env.layout
  const b = petBounds(L)
  const free = (x: number, y: number): boolean => {
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1 || !isClear(L, x, y)) return false
    for (const o of env.others) if (o !== a && !o.drag && !o.fly && !o.bath && ((o.x - x) / 30) ** 2 + ((o.y - y) / 9) ** 2 < 1) return false
    return true
  }
  if (free(p.home.x, p.home.y)) return p.home
  for (let r = 6; r <= 96; r += 6)
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2
      const x = p.home.x + Math.cos(ang) * r * 1.6
      const y = p.home.y + Math.sin(ang) * r * 0.6
      if (free(x, y)) return { x, y }
    }
  return p.home
}

/** 進入 cheer：結算數值（只做這一次）、開心跳一下 */
function toCheer(a: Actor, env: PlayEnv, ops: PlayOps): void {
  const p = a.play!
  env.settlePlay(a.id, p.catches, p.toy)
  p.phase = 'cheer'
  p.spot = null
  p.put = null
  p.t = 0
  p.ball = null
  p.hearts = 0
  a.hop = 0.4
  a.moving = false
  ops.setAction(a, 'happy', 1e9)
}

function toIdle(a: Actor, ops: PlayOps): void {
  a.play = null
  a.tx = a.x
  a.ty = a.y
  a.path = []
  a.pathKey = ''
  a.moving = false
  ops.setAction(a, 'idle', 0.8)
}

/**
 * 結束玩耍。time／user：演 cheer（結算在進入 cheer 時）；其他原因（拖曳、開視窗、睡覺時間、視窗大小改變、找新主人）
 * 直接結算數值並回到一般行為，不演 cheer。已經在 cheer（數值結算過了）就只是結束，不會重複結算。
 */
export function endPlay(a: Actor, reason: PlayEnd, env: PlayEnv, ops: PlayOps): void {
  const p = a.play
  if (!p) return
  if (p.phase === 'cheer') {
    toIdle(a, ops)
    return
  }
  if (reason === 'time' || reason === 'user') {
    toCheer(a, env, ops)
    return
  }
  env.settlePlay(a.id, p.catches, p.toy)
  toIdle(a, ops)
}

/** 每個影格更新玩耍中的狗 */
export function updatePlay(a: Actor, dt: number, env: BehaviorEnv, ops: PlayOps): void {
  const p = a.play!
  const sp = SPECIES[a.pet.species]
  p.t += dt
  if (p.ball) p.ball.t += dt

  if (p.phase !== 'cheer') {
    p.left -= dt
    // 睡覺時間到（23:00，或狗變成「睡覺中」）：結算並結束。夜間才被叫醒開始玩的狗不受 23:00 影響
    if (isSleeping(a.pet, env.hour, env.nowMs) || (isSleepTime(env.hour) && !p.nightStart)) {
      endPlay(a, 'sleep', env, ops)
      return
    }
    if (p.left <= 0) {
      const ball = p.toy === 'ball'
      // 已經開始的那一次讓它做完（丟球：叼起之後；挖寶／尋寶：已經走到位置之後），最多再給 graceSeconds 秒
      const finishing = ball ? p.phase === 'grab' || p.phase === 'return' || p.phase === 'drop' : isFinderBusy(p)
      if (!finishing || -p.left > (ball ? BALANCE.play.graceSeconds : BALANCE.dig.graceSeconds)) endPlay(a, 'time', env, ops)
    }
    if (!a.play) return
  }
  if (p.toy !== 'ball' && p.phase !== 'cheer') {
    updateFinder(a, dt, env, ops)
    return
  }

  switch (p.phase) {
    case 'ready': {
      if (a.action !== 'idle') ops.setAction(a, 'idle', 1e9)
      p.hopIn -= dt
      if (p.hopIn <= 0) {
        a.hop = 0.4
        p.hopIn = rr(env.rand, 1.8, 3.2)
      }
      // 被別的寵物輕輕推開時跟著被推（和一般站著的寵物一樣）；球落在哪裡，下一次是從這裡出手
      a.x += a.sepX * dt
      a.y += a.sepY * dt
      ops.clampActor(a, env.layout)
      break
    }
    case 'flight': {
      if (a.action !== 'idle') ops.setAction(a, 'idle', 1e9)
      if (p.t >= T.reaction && p.ball) {
        p.phase = 'chase'
        p.t = 0
        a.tx = p.ball.toX
        a.ty = p.ball.toY
        a.pathKey = ''
        ops.setAction(a, 'walk', 1e9)
      }
      break
    }
    case 'chase': {
      const b = p.ball
      if (!b) {
        // 球不見了（不應該發生）：回到待命
        p.phase = 'ready'
        p.t = 0
        break
      }
      const close = Math.hypot(b.toX - a.x, b.toY - a.y) < 3
      if ((close && ballLanded(b)) || p.t > BALANCE.play.stuckSeconds) {
        if (!close) {
          a.x = b.toX
          a.y = b.toY
          ops.clampActor(a, env.layout)
        }
        p.ball = null
        p.phase = 'grab'
        p.t = 0
        a.hop = 0.3
        ops.setAction(a, 'idle', 1e9)
        break
      }
      if (close) {
        if (a.action !== 'idle') ops.setAction(a, 'idle', 1e9) // 球還在空中：先站著等
        break
      }
      a.animT += dt // 跑得比走快：動畫速度加倍
      ops.moveToward(a, dt, sp.speed * BALANCE.play.chaseSpeedMul, env)
      break
    }
    case 'grab': {
      if (p.t >= T.grab) {
        const spot = returnSpot(a, p, env)
        p.phase = 'return'
        p.t = 0
        a.tx = spot.x
        a.ty = spot.y
        a.pathKey = ''
        ops.setAction(a, 'walk', 1e9)
      }
      break
    }
    case 'return': {
      const close = Math.hypot(a.tx - a.x, a.ty - a.y) < 3
      if (close || p.t > BALANCE.play.stuckSeconds + 2) {
        if (!close) {
          a.x = a.tx
          a.y = a.ty
          ops.clampActor(a, env.layout)
        }
        // 放下：球落在腳邊，小彈跳；狗汪一聲、冒一顆小愛心（撿到球 = 小回饋）
        p.catches = Math.min(BALANCE.play.maxCatches, p.catches + 1)
        p.phase = 'drop'
        p.t = 0
        const fx = a.x + a.facing * 12
        p.ball = { fromX: fx, fromY: a.y + 1, fromZ: 0, toX: fx, toY: a.y + 1, arc: 0, t: 0, dur: 0 }
        a.moving = false
        ops.setAction(a, 'bark', 1e9)
        env.emit('heart', a.x + rr(env.rand, -6, 6), a.y - 30)
        break
      }
      ops.moveToward(a, dt, sp.speed * BALANCE.play.returnSpeedMul, env)
      break
    }
    case 'drop': {
      if (p.t >= T.drop) {
        p.ball = null
        p.phase = 'ready'
        p.t = 0
        p.hopIn = rr(env.rand, 0.8, 1.6)
        if (p.catches >= BALANCE.play.maxCatches) p.left = Math.min(p.left, 0)
        ops.setAction(a, 'idle', 1e9)
      }
      break
    }
    case 'cheer': {
      // 中回饋：開心跳兩下（0 秒、0.5 秒）、冒 3 顆愛心，然後回到一般行為
      if (p.hearts < 3 && p.t >= p.hearts * 0.22) {
        p.hearts++
        env.emit('heart', a.x + rr(env.rand, -10, 10), a.y - 32)
      }
      if (p.t >= 0.5 && p.t - dt < 0.5) a.hop = 0.4
      if (p.t >= T.cheer) toIdle(a, ops)
      break
    }
  }
}
