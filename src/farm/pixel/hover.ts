import { BALANCE } from '../config/balance'
import type { PersonalityId } from '../config/personality'
import { overrides } from '../overrides'
import { clampToWalk, isWalkable, nearestWalkable, petBounds, type Layout } from './layout'
import { releaseHover, type Actor, type HoverAct } from './pets'

/**
 * 滑鼠互動（v3.8.1，純邏輯、不碰 DOM，可在 Node 測試）：游標的位置與速度 → 寵物的暫時反應。
 *  1 停下來看你（look）  2 黏人靠近（approach）  3 膽小閃開（retreat）  4 摸頭（pat）  5 小名字標籤（label）  6 貓拍、狗吠（swat／bark）
 * 規則（全部在 BALANCE.hover，單位 = 邏輯像素、秒）：
 *  - 只有「醒著、閒置或在走路」的寵物回應 1、2、3、6；睡覺、吃東西、玩耍、挖寶、尋寶、洗澡（含走去水池）、被拖曳、選單開著、野餐中不回應。
 *    野餐中的寵物只回應 4（只冒愛心，不改姿勢）與 5。
 *  - 引擎既有狀態永遠優先：每個影格檢查，寵物一進入上述任何狀態、或選單開了、視窗開了、游標離開，就立刻解除（不卡住、不走出場景）。
 *  - 不改任何存檔數值（心情、飽食、清潔都不動），只改這個影格的姿勢、面向與位置。
 *  - 游標資料只在影格更新時處理（指標事件只記下最新位置，不做運算、不重畫）。
 */

type Feature = 'look' | 'approach' | 'retreat' | 'pat' | 'label' | 'swat'
const on = (f: Feature): boolean => !overrides.hover.off[f]

/** 引擎提供給這一層的東西（不 import engine，避免循環、也方便測試） */
export interface HoverEnv {
  layout: Layout
  actors: Iterable<Actor>
  rand: () => number
  /** 氣泡選單開著的寵物 id */
  selectedId: string | null
  /** 正在拖曳寵物 */
  dragging: boolean
  /** 睡覺時間（夜間規則）：存檔層的 isSleeping，需要寵物的睡眠狀態與目前時間 */
  sleeping: (a: Actor) => boolean
  /** 游標下的寵物（含睡著的；洗澡中的不算） */
  petAt: (x: number, y: number) => Actor | null
  /** 寵物外框（邏輯座標，含跳一下的位移）；畫不出來 = null */
  box: (a: Actor) => { x0: number; y0: number; x1: number; y1: number } | null
  emit: (kind: 'heart', x: number, y: number) => void
}

interface Sample {
  t: number
  x: number
  y: number
}

interface Cooldown {
  approach: number
  retreat: number
  pat: number
  swat: number
}

/** 這隻寵物的個性（沒有個性 = undefined，只有測試會這樣） */
const persOf = (a: Actor): PersonalityId | undefined => a.pet.personality

/** 指令動作以外、滑鼠互動自己設的短動作（摸頭、貓拍狗吠）用的標記 */
export const HOVER_TAGS = ['hpat', 'hswat'] as const
export const isHoverOverride = (a: Actor): boolean => !!a.override && (HOVER_TAGS as readonly string[]).includes(a.override.tag)

export class HoverController {
  /** 有 hover 能力的裝置（桌面滑鼠）才會是 true；手機、平板永遠是 false（不影響觸控） */
  enabled = false
  /** 外部擋住（開了視窗、對話框、啟動台、建築模式、野餐拍立得…）：全部立即解除 */
  blocked = false

  /** 游標（邏輯座標）；inside = 游標在畫布上 */
  private cur = { x: 0, y: 0, inside: false }
  private t = 0
  private hist: Sample[] = []
  private cd = new Map<string, Cooldown>()
  /** 在草地範圍（petBounds）裡連續停留的時間 */
  private grassT = 0
  /** 摸頭：水平方向反轉偵測（鋸齒偵測）＋反轉的時間、這些反轉都發生在哪隻身上 */
  private dir = 0
  private ext = 0
  private revs: number[] = []
  private revId: string | null = null
  /** 名字標籤：游標下的寵物與停留時間 */
  private onId: string | null = null
  private onT = 0
  /** 貓拍狗吠：游標在寵物身上「快速掃過」已經抽過的寵物 id → 之後「慢下來或離開」連續多久（秒）；連續 swatRearm 秒才會再抽（一次掃過只抽一次，游標速度忽快忽慢也不會重複抽） */
  private fastOn = new Map<string, number>()
  /** 每隻正在「離開範圍」的計時：look 離開 lookRelease 秒、approach 離開 releaseAfter 秒才解除 */
  private gone = new Map<string, number>()

  /** 指標事件：只記下最新位置（邏輯座標） */
  move(x: number, y: number): void {
    this.cur.x = x
    this.cur.y = y
    this.cur.inside = true
  }

  /** 游標離開畫布、視窗失焦、分頁被藏起來 */
  leave(): void {
    this.cur.inside = false
  }

  /** 目前游標（給測試與標籤用）；游標不在畫布上 = null */
  cursor(): { x: number; y: number } | null {
    return this.cur.inside ? { x: this.cur.x, y: this.cur.y } : null
  }

  /** 要顯示名字標籤的寵物 id；沒有 = null */
  labelId(): string | null {
    return this.onId !== null && this.onT >= BALANCE.hover.labelDelay ? this.onId : null
  }

  /** 游標速度（邏輯像素／秒）：最近 speedWindow 秒內位移的直線距離 ÷ 時間；資料不夠 = 0 */
  speed(): number {
    const h = this.hist
    if (h.length < 2) return 0
    const now = h[h.length - 1]
    let from = h[0]
    for (const s of h) {
      if (now.t - s.t <= BALANCE.hover.speedWindow + 1e-9) {
        from = s
        break
      }
    }
    const span = now.t - from.t
    return span > 1e-6 ? Math.hypot(now.x - from.x, now.y - from.y) / span : 0
  }

  private cdOf(id: string): Cooldown {
    let c = this.cd.get(id)
    if (!c) {
      c = { approach: 0, retreat: 0, pat: 0, swat: 0 }
      this.cd.set(id, c)
    }
    return c
  }

  /** 全部解除（游標離開、視窗被擋住…）；cancelAnims = 連摸頭／貓拍狗吠的短動作也立刻取消 */
  private clearAll(env: HoverEnv, cancelAnims: boolean): void {
    for (const a of env.actors) {
      if (a.hv) releaseHover(a, env.rand)
      if (cancelAnims && isHoverOverride(a)) {
        a.override = null
        a.action = 'idle'
        a.t = 0
        a.dur = 0.5
      }
    }
    this.gone.clear()
    this.grassT = 0
    this.dir = 0
    this.revs = []
    this.revId = null
    this.onId = null
    this.onT = 0
    this.fastOn.clear()
    this.hist = []
  }

  removePet(id: string): void {
    this.cd.delete(id)
    this.gone.delete(id)
    this.fastOn.delete(id)
    if (this.onId === id) {
      this.onId = null
      this.onT = 0
    }
  }

  /** 這隻現在能不能回應移動類的互動（1、2、3、6）：醒著、閒置或走路，沒有任何既有狀態在管牠 */
  free(a: Actor, env: HoverEnv): boolean {
    if (a.drag || a.fly || a.bath || a.play || a.picnic || a.bld || a.seek !== null) return false
    if (a.action === 'sleep' || env.sleeping(a)) return false
    if (env.selectedId === a.id) return false
    if (a.override) return false // 指令動作（吃、撫摸…）與互動自己的短動作都在演
    return a.action === 'idle' || a.action === 'walk' || a.action === 'sit'
  }

  /** 游標到寵物外框的距離（在外框裡 = 0） */
  private rectDist(a: Actor, env: HoverEnv): number {
    const b = env.box(a)
    if (!b) return Infinity
    const dx = Math.max(b.x0 - this.cur.x, 0, this.cur.x - b.x1)
    const dy = Math.max(b.y0 - this.cur.y, 0, this.cur.y - b.y1)
    return Math.hypot(dx, dy)
  }

  /** 寵物身體中心（距離黏人／膽小的目標用） */
  private center(a: Actor, env: HoverEnv): { x: number; y: number; h: number } {
    const b = env.box(a)
    const h = b ? b.y1 - b.y0 : 30
    return { x: a.x, y: a.y - h * 0.45, h }
  }

  /** 每個影格呼叫一次（在 updateActor 之前） */
  update(dt: number, env: HoverEnv): void {
    this.t += dt
    const B = BALANCE.hover
    // 不啟用、被擋住、拖曳中、選單開著：立刻全部解除（連短動作也取消）
    if (!this.enabled || this.blocked || env.dragging || env.selectedId !== null) {
      this.clearAll(env, true)
      return
    }
    if (!this.cur.inside) {
      // 游標離開畫布：看、靠近、退開立即解除；已經在演的短動作（摸頭、貓拍狗吠，最多 1.2 秒）演完
      this.clearAll(env, false)
      return
    }
    const list = [...env.actors]
    this.hist.push({ t: this.t, x: this.cur.x, y: this.cur.y })
    while (this.hist.length > 2 && this.t - this.hist[0].t > 0.5) this.hist.shift()

    // ---- 既有狀態優先：不符合的寵物立刻解除 ----
    for (const a of list) {
      if (a.hv && !this.free(a, env)) {
        if (a.hv.kind === 'approach') this.cdOf(a.id).approach = this.t + BALANCE.hover.approachCooldown
        releaseHover(a, env.rand)
      }
    }

    // ---- 游標資料 ----
    const gb = petBounds(env.layout)
    const inGrass = this.cur.x >= gb.x0 && this.cur.x <= gb.x1 && this.cur.y >= gb.y0 && this.cur.y <= gb.y1
    this.grassT = inGrass ? this.grassT + dt : 0
    const spd = this.speed()
    const under = env.petAt(this.cur.x, this.cur.y)

    // 水平反轉偵測（摸頭）：每次要朝反方向移動 patMinMove 以上才算一次反轉
    if (this.dir === 0) {
      this.ext = this.cur.x
      this.dir = 1
    } else if (this.dir === 1) {
      if (this.cur.x > this.ext) this.ext = this.cur.x
      else if (this.ext - this.cur.x >= B.patMinMove) {
        this.revs.push(this.t)
        this.dir = -1
        this.ext = this.cur.x
      }
    } else {
      if (this.cur.x < this.ext) this.ext = this.cur.x
      else if (this.cur.x - this.ext >= B.patMinMove) {
        this.revs.push(this.t)
        this.dir = 1
        this.ext = this.cur.x
      }
    }
    while (this.revs.length && this.t - this.revs[0] > B.patWindow) this.revs.shift()
    // 反轉必須都發生在同一隻身上：游標換到別隻（或離開寵物）就重算
    if ((under?.id ?? null) !== this.revId) {
      this.revId = under?.id ?? null
      this.revs = []
    }

    // ---- 5 小名字標籤：游標停在同一隻寵物上 ----
    if (under && on('label')) {
      if (this.onId === under.id) this.onT += dt
      else {
        this.onId = under.id
        this.onT = 0
      }
    } else {
      this.onId = null
      this.onT = 0
    }

    // ---- 4 摸頭 ----
    if (under && on('pat') && this.revs.length >= B.patReversals) {
      this.revs = []
      this.pat(under, env)
    }

    // ---- 6 貓拍、狗吠：快速掃過 ----
    // 一次「掃過」只抽一次：抽完要等游標慢下來（低於門檻的一半）或離開這隻、連續 swatRearm 秒才會再抽
    for (const [id, slow] of [...this.fastOn]) {
      if (under?.id === id && spd >= B.swatSpeed * 0.5) this.fastOn.set(id, 0)
      else if (slow + dt >= B.swatRearm) this.fastOn.delete(id)
      else this.fastOn.set(id, slow + dt)
    }
    if (under && on('swat') && spd >= B.swatSpeed && !this.fastOn.has(under.id)) {
      this.fastOn.set(under.id, 0)
      if (this.freeIgnoringHover(under, env)) this.swat(under, env)
    }

    // ---- 3 膽小閃開、1 停下來看你 ----
    for (const a of list) {
      if (!this.free(a, env)) continue
      const rd = this.rectDist(a, env)
      const c = this.cdOf(a.id)
      // 3：游標快速靠近並進入範圍內（朝寵物靠近的速度 ≥ retreatSpeed）
      if (on('retreat') && persOf(a) === 'timid' && a.hv?.kind !== 'retreat' && this.t >= c.retreat && rd <= B.retreatRadius && this.closing(a, env) >= B.retreatSpeed) {
        if (this.retreat(a, env)) continue
      }
      if (a.hv?.kind === 'retreat') continue
      // 1：停下來看你
      if (on('look') && rd <= B.lookRadius) {
        this.gone.delete(a.id)
        if (!a.hv) this.startLook(a)
        else if (a.hv.kind === 'look') this.aim(a.hv)
      } else if (a.hv?.kind === 'look') {
        const g = (this.gone.get(a.id) ?? 0) + dt
        this.gone.set(a.id, g)
        if (g >= B.lookRelease) {
          releaseHover(a, env.rand)
          this.gone.delete(a.id)
        }
      }
    }

    // ---- retreat 結束（到了或逾時）→ 解除 ----
    for (const a of list) {
      const h = a.hv
      if (h?.kind === 'retreat' && (h.arrived || h.t > B.retreatMaxSeconds)) releaseHover(a, env.rand)
    }

    // ---- 2 黏人靠近 ----
    this.updateApproach(dt, env, list, inGrass)
    // 每個 hv 的游標位置更新（面向游標）
    for (const a of list) if (a.hv && a.hv.kind !== 'retreat') this.aim(a.hv)
  }

  private aim(h: HoverAct): void {
    h.cx = this.cur.x
    h.cy = this.cur.y
  }

  private startLook(a: Actor): void {
    a.hv = { kind: 'look', cx: this.cur.x, cy: this.cur.y, gx: a.x, gy: a.y, arrived: true, t: 0, goalT: 0, chkT: 0, chkX: a.x, chkY: a.y }
  }

  /** 朝寵物靠近的速度（邏輯像素／秒）：最近 speedWindow 秒內「游標到寵物身體中心」距離的縮短量 ÷ 時間 */
  private closing(a: Actor, env: HoverEnv): number {
    const h = this.hist
    if (h.length < 2) return 0
    const now = h[h.length - 1]
    let from = h[0]
    for (const s of h) {
      if (now.t - s.t <= BALANCE.hover.speedWindow + 1e-9) {
        from = s
        break
      }
    }
    const span = now.t - from.t
    if (span <= 1e-6) return 0
    const c = this.center(a, env)
    return (Math.hypot(from.x - c.x, from.y - c.y) - Math.hypot(now.x - c.x, now.y - c.y)) / span
  }

  /** 3 膽小：往遠離游標的方向退開 retreatDistance；退不開（被牆擋住，能退的不到一半）就不動作。回傳 true = 開始退開 */
  private retreat(a: Actor, env: HoverEnv): boolean {
    const B = BALANCE.hover
    const c = this.center(a, env)
    let ux = a.x - this.cur.x
    let uy = c.y - this.cur.y
    const m = Math.hypot(ux, uy)
    if (m < 1e-3) {
      ux = a.facing === 1 ? -1 : 1 // 游標正好壓在中心上：往牠背對的方向
      uy = 0
    } else {
      ux /= m
      uy /= m
    }
    const g = this.walkableGoal(env.layout, a.x + ux * B.retreatDistance, a.y + uy * B.retreatDistance)
    if (Math.hypot(g.x - a.x, g.y - a.y) < B.retreatDistance * 0.5) return false
    this.cdOf(a.id).retreat = this.t + B.retreatCooldown
    a.hv = { kind: 'retreat', cx: this.cur.x, cy: this.cur.y, gx: g.x, gy: g.y, arrived: false, t: 0, goalT: 0, chkT: 0, chkX: a.x, chkY: a.y }
    this.gone.delete(a.id)
    return true
  }

  /** 把想去的點收進可以站的地方（活動範圍內、不在障礙物裡） */
  private walkableGoal(L: Layout, x: number, y: number): { x: number; y: number } {
    const c = clampToWalk(L, x, y)
    return isWalkable(L, c.x, c.y) ? c : nearestWalkable(L, c.x, c.y)
  }

  /** 2 黏人靠近：開始、更新目標、解除；同一時間最多 maxApproach 隻 */
  private updateApproach(dt: number, env: HoverEnv, list: Actor[], inGrass: boolean): void {
    const B = BALANCE.hover
    // 進行中的：游標離開草地、或離寵物太遠 → 計時，releaseAfter 秒後解除；回來就歸零
    for (const a of list) {
      const h = a.hv
      if (h?.kind !== 'approach') continue
      const c = this.center(a, env)
      // 還在走的時候不看距離（剛出發時離游標本來就遠）；站定之後游標離開 keepRadius 才算「移開」。游標離開草地一律算移開
      const far = !inGrass || (h.arrived && Math.hypot(this.cur.x - c.x, this.cur.y - c.y) > B.approachKeepRadius)
      if (far) {
        const g = (this.gone.get(a.id) ?? 0) + dt
        this.gone.set(a.id, g)
        if (g >= B.approachReleaseAfter) {
          releaseHover(a, env.rand)
          this.gone.delete(a.id)
          this.cdOf(a.id).approach = this.t + B.approachCooldown
        }
      } else {
        this.gone.delete(a.id)
        // 還在走：游標移動了就更新目標（站定之後不再追）
        if (!h.arrived && h.t - h.goalT >= 0.5) this.setApproachGoal(a, h, env)
      }
    }
    if (!on('approach') || !inGrass || this.grassT < B.approachDwell) return
    let n = 0
    for (const a of list) if (a.hv?.kind === 'approach') n++
    if (n >= B.maxApproach) return
    // 候選：黏人、自由、冷卻過了、還沒靠近到位；離游標近的先
    const cands = list
      .filter((a) => persOf(a) === 'clingy' && !a.hv && this.free(a, env) && this.t >= this.cdOf(a.id).approach)
      .map((a) => ({ a, d: Math.hypot(this.cur.x - a.x, this.cur.y - a.y) }))
      .sort((p, q) => p.d - q.d)
    for (const { a } of cands) {
      if (n >= B.maxApproach) break
      const c = this.center(a, env)
      // 已經在游標旁邊（40 以內）：不用走，站著看就好（還是算「靠近中」，之後離開一樣有 3 秒與冷卻）
      const h: HoverAct = { kind: 'approach', cx: this.cur.x, cy: this.cur.y, gx: a.x, gy: a.y, arrived: false, t: 0, goalT: 0, chkT: 0, chkX: a.x, chkY: a.y }
      a.hv = h
      this.setApproachGoal(a, h, env)
      if (Math.hypot(this.cur.x - c.x, this.cur.y - c.y) <= B.approachGap + 6) h.arrived = true
      this.gone.delete(a.id)
      n++
    }
  }

  /** 靠近的目標：游標與寵物連線上、離游標 approachGap 的點（身體中心在那裡，換算成腳底） */
  private setApproachGoal(a: Actor, h: HoverAct, env: HoverEnv): void {
    const B = BALANCE.hover
    const c = this.center(a, env)
    let ux = c.x - this.cur.x
    let uy = c.y - this.cur.y
    const m = Math.hypot(ux, uy)
    if (m < 1e-3) {
      ux = 1
      uy = 0
    } else {
      ux /= m
      uy /= m
    }
    const gx = this.cur.x + ux * B.approachGap
    const gy = this.cur.y + uy * B.approachGap + (a.y - c.y)
    const g = this.walkableGoal(env.layout, gx, gy)
    h.gx = g.x
    h.gy = g.y
    h.goalT = h.t
  }

  /** 4 摸頭：愛心 1～2 個、開心姿勢 patSeconds 秒；不加任何心情。野餐中只冒愛心（座位上的姿勢由野餐管，不蓋掉） */
  private pat(a: Actor, env: HoverEnv): void {
    const B = BALANCE.hover
    // 野餐中：只冒愛心（座位上的姿勢由野餐管）；其他：要是「醒著、閒置或走路」的才回應（睡覺、吃、玩耍…不回應）；正在退開的不理
    const ok = a.picnic ? !a.drag && !a.fly && !a.bath : a.hv?.kind !== 'retreat' && this.freeIgnoringHover(a, env)
    if (!ok) return
    const c = this.cdOf(a.id)
    if (this.t < c.pat) return
    c.pat = this.t + B.patCooldown
    const top = env.box(a)?.y0 ?? a.y - 30
    const n = B.patHearts[0] + Math.floor(env.rand() * (B.patHearts[1] - B.patHearts[0] + 1))
    for (let i = 0; i < n; i++) env.emit('heart', a.x + (n === 1 ? 0 : i === 0 ? -6 : 6) + (env.rand() - 0.5) * 3, top + 2 + i * 2)
    if (a.picnic) return
    if (a.hv) releaseHover(a, env.rand)
    a.override = { action: 'happy', left: B.patSeconds, speedMul: 0, tag: 'hpat' }
    a.hop = 0.4
  }

  /** 把 a.hv 當作沒有來判斷（互動自己正在讓牠看著游標時，摸頭還是可以接手） */
  private freeIgnoringHover(a: Actor, env: HoverEnv): boolean {
    const h = a.hv
    a.hv = null
    const ok = this.free(a, env)
    a.hv = h
    return ok
  }

  /** 6 貓拍、狗吠：機率抽中才演（沒抽中不算、也不冷卻）；冷卻只在演出時算 */
  private swat(a: Actor, env: HoverEnv): void {
    const B = BALANCE.hover
    const c = this.cdOf(a.id)
    if (this.t < c.swat || a.hv?.kind === 'retreat') return
    const chance = overrides.hover.swatChance ?? B.swatChance
    if (!(env.rand() < chance)) return
    c.swat = this.t + B.swatCooldown
    if (a.hv) releaseHover(a, env.rand)
    if (Math.abs(this.cur.x - a.x) > 1.5) a.facing = this.cur.x > a.x ? 1 : -1
    a.override = { action: a.pet.species === 'cat' ? 'swat' : 'bark', left: B.swatSeconds, speedMul: 0, tag: 'hswat' }
  }
}
