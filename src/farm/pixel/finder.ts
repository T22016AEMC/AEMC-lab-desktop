import { BALANCE } from '../config/balance'
import { SPECIES } from '../config/species'
import { pickFindSpot } from './finds'
import type { Pt } from './nav'
import type { Actor, BehaviorEnv } from './pets'
import type { PlayOps, PlayState } from './play'

/**
 * 挖寶（狗）與尋寶（貓）的狀態機（v3.6.0）。和丟球共用 play.ts 的開始、計時、cheer 與提前結算，這裡只管「一次挖／尋」的各階段：
 *   search 挑位置 → go 走過去 → work（狗：挖地 dig；貓：蹲下 crouch）
 *     狗：work 結束 → 留下土堆（addFind）→ mark（開心一下）→ search
 *     貓：work 結束 → pounce 撲 → back 叼著布包走到放下的位置 → put 放下（addFind）→ mark → search
 * 每一次完成才留下寶物（立刻寫進存檔）；進行到一半被提前結算（拖走、開視窗…）的那一次作廢，已經留下的保留。
 * 寶物滿了（env.findCap）或挑不到位置就結束玩耍（走時間到的 cheer）。
 */

const B = BALANCE.dig

/** 這一次已經開始了（時間到時讓它做完，最多再給 graceSeconds 秒）：走到位置之後到放下之前 */
export function isFinderBusy(p: PlayState): boolean {
  return p.phase === 'work' || p.phase === 'pounce' || p.phase === 'back' || p.phase === 'put' || p.phase === 'mark'
}

/** 貓叼著布包：back 階段 */
export const isCarryingBundle = (p: PlayState): boolean => p.toy === 'hunt' && p.phase === 'back'

const speedOf = (a: Actor): number => SPECIES[a.pet.species].speed * (a.pet.species === 'cat' ? B.cat.speedMul : B.dog.speedMul)

function startGo(a: Actor, p: PlayState, to: Pt, phase: 'go' | 'back', ops: PlayOps): void {
  p.phase = phase
  p.t = 0
  a.tx = to.x
  a.ty = to.y
  a.pathKey = ''
  ops.setAction(a, 'walk', 1e9)
}

/** 抵達判斷：到了，或走太久（保險）直接傳送到目標。回傳 true = 到了 */
function arrived(a: Actor, p: PlayState, env: BehaviorEnv, ops: PlayOps, stuck: number): boolean {
  const close = Math.hypot(a.tx - a.x, a.ty - a.y) < 3
  if (close || p.t > stuck) {
    if (!close) {
      a.x = a.tx
      a.y = a.ty
      ops.clampActor(a, env.layout)
    }
    a.moving = false
    return true
  }
  return false
}

export function updateFinder(a: Actor, dt: number, env: BehaviorEnv, ops: PlayOps): void {
  const p = a.play!
  const L = env.layout
  const cat = a.pet.species === 'cat'
  const cfg = cat ? B.cat : B.dog
  switch (p.phase) {
    case 'search': {
      if (p.catches >= B.maxFinds || env.finds.length >= env.findCap) {
        p.left = Math.min(p.left, 0) // 滿了：結束（下一個影格走時間到的 cheer）
        break
      }
      if (a.action !== 'idle') ops.setAction(a, 'idle', 1e9)
      const kind = cat ? 'bundle' : 'mound'
      const reach = cat ? B.cat.maxRange : B.dog.maxReach
      const q = {
        L, rand: env.rand, kind: kind as 'bundle' | 'mound', anchor: cat ? p.home : { x: a.x, y: a.y }, reach,
        finds: env.finds, pets: env.others.filter((o) => o !== a && !o.drag && !o.fly && !o.bath),
      }
      // 附近擠滿了（寶物很多）：放寬到 3 倍距離再找一次，不要白白結束
      const spot = pickFindSpot(q) ?? pickFindSpot({ ...q, reach: reach * 3 })
      if (!spot) {
        p.left = Math.min(p.left, 0)
        break
      }
      p.spot = { x: spot.x, y: spot.y }
      startGo(a, p, p.spot, 'go', ops)
      break
    }
    case 'go': {
      if (arrived(a, p, env, ops, cfg.stuckSeconds)) {
        p.phase = 'work'
        p.t = 0
        if (p.spot && Math.abs(p.spot.x - a.x) > 1) a.facing = p.spot.x > a.x ? 1 : -1
        ops.setAction(a, cat ? 'crouch' : 'dig', 1e9)
        break
      }
      a.animT += dt * (cat ? 1.2 : 1) // 跑得比走快：動畫速度加快
      ops.moveToward(a, dt, speedOf(a), env)
      break
    }
    case 'work': {
      if (!cat) {
        // 挖地：泥土粒子往嘴邊前方飛
        if (env.rand() < dt * 16) env.emit('dirt', a.x + a.facing * (10 + env.rand() * 8), a.y - 2 - env.rand() * 4)
        if (p.t >= B.dog.digSeconds) {
          if (!env.addFind(a, 'mound', p.spot!.x, p.spot!.y)) {
            p.left = Math.min(p.left, 0)
            break
          }
          p.catches++
          p.phase = 'mark'
          p.t = 0
          a.hop = 0.4
          env.emit('heart', a.x + a.facing * 6, a.y - 30)
          ops.setAction(a, 'happy', 1e9)
        }
        break
      }
      if (p.t >= B.cat.crouchSeconds) {
        p.phase = 'pounce'
        p.t = 0
        a.hop = B.cat.pounceSeconds
        ops.setAction(a, 'pounce', 1e9)
      }
      break
    }
    case 'pounce': {
      if (p.t >= B.cat.pounceSeconds) {
        // 叼起布包，走回原位附近放下（放下的位置：離原位近、不壓到別的寶物與寵物；挑不到就放在撲的位置）
        const others = env.others.filter((o) => o !== a && !o.drag && !o.fly && !o.bath)
        const put =
          pickFindSpot({ L, rand: env.rand, kind: 'bundle', anchor: p.home, reach: 60, finds: env.finds, pets: others, minDist: 0 }) ??
          pickFindSpot({ L, rand: env.rand, kind: 'bundle', anchor: p.home, reach: B.cat.maxRange, finds: env.finds, pets: [], minDist: 0 })
        p.put = put ? { x: put.x, y: put.y } : p.spot
        startGo(a, p, p.put!, 'back', ops)
      }
      break
    }
    case 'back': {
      if (arrived(a, p, env, ops, cfg.stuckSeconds)) {
        p.phase = 'put'
        p.t = 0
        ops.setAction(a, 'sit', 1e9)
        break
      }
      a.animT += dt * 1.2
      ops.moveToward(a, dt, speedOf(a), env)
      break
    }
    case 'put': {
      if (p.t >= B.cat.dropSeconds) {
        if (!env.addFind(a, 'bundle', p.put!.x, p.put!.y)) {
          p.left = Math.min(p.left, 0)
          break
        }
        p.catches++
        p.phase = 'mark'
        p.t = 0
        a.hop = 0.4
        env.emit('heart', a.x, a.y - 28)
        ops.setAction(a, 'happy', 1e9)
      }
      break
    }
    case 'mark': {
      if (p.t >= (cat ? B.cat.markSeconds : B.dog.markSeconds)) {
        p.phase = 'search'
        p.t = 0
        p.spot = null
        p.put = null
        ops.setAction(a, 'idle', 1e9)
      }
      break
    }
    default:
      break
  }
}
