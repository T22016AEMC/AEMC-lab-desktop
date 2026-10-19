import { rgb, skyAt, type Weather } from '../sim/worldTime'
import { HORIZON_Y, SAND_TOP, WALL_W, WATER_TOP, WORLD_H, type Layout } from './layout'

const TAU = Math.PI * 2

// 固定的偽亂數，讓星星、雲、草花、卵石每次位置都一樣
function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

type RGB = [number, number, number]
const gray = (c: RGB, amount: number, level: number): RGB => [
  c[0] + (level - c[0]) * amount,
  c[1] + (level - c[1]) * amount,
  c[2] + (level - c[2]) * amount,
]

export interface SceneState {
  hour: number
  weather: Weather
  /** 場景經過的秒數（動畫用） */
  time: number
  /** 池塘生物的平均清潔度 0～100，越低水越混濁 */
  pondClean: number
}

/** 天氣與時間決定的天空色彩：多雲、下雨會把藍天往灰色拉 */
function weatherSky(s: SceneState): { top: RGB; bottom: RGB; dark: number; stars: number; cloudy: number } {
  const sky = skyAt(s.hour)
  const cloudy = s.weather === 'sunny' ? 0 : s.weather === 'cloudy' ? 0.35 : s.weather === 'rain' ? 0.6 : 0.45
  const level = 150 * (1 - sky.dark)
  return {
    top: gray(sky.top, cloudy, level * 0.9),
    bottom: gray(sky.bottom, cloudy, level + 25),
    dark: Math.min(0.7, sky.dark + (s.weather === 'rain' ? 0.1 : s.weather === 'cloudy' ? 0.04 : 0)),
    stars: sky.stars * (s.weather === 'sunny' ? 1 : 0.35),
    cloudy,
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  for (const [dx, dy, r] of [[0, 0, 34], [38, -12, 42], [82, 0, 32], [40, 8, 34]] as const) {
    ctx.moveTo(x + dx * scale + r * scale, y + dy * scale)
    ctx.arc(x + dx * scale, y + dy * scale, r * scale, 0, TAU)
  }
  ctx.fill()
}

function drawSky(ctx: CanvasRenderingContext2D, l: Layout, s: SceneState): ReturnType<typeof weatherSky> {
  const sky = weatherSky(s)
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 20)
  g.addColorStop(0, rgb(sky.top))
  g.addColorStop(1, rgb(sky.bottom))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, l.Wl, HORIZON_Y + 24)

  // 星星
  if (sky.stars > 0.02) {
    for (let i = 0; i < 90; i++) {
      const x = rnd(i * 3.1) * l.Wl
      const y = rnd(i * 7.7 + 1) * (HORIZON_Y - 40)
      const tw = 0.55 + 0.45 * Math.sin(s.time * (1 + rnd(i) * 2) + i)
      ctx.globalAlpha = sky.stars * tw * (0.5 + rnd(i * 2.2) * 0.5)
      ctx.fillStyle = '#fffbe8'
      const r = 0.9 + rnd(i * 5.3) * 1.6
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // 太陽（6～18 點）與月亮（18～6 點）
  const h = s.hour
  if (h >= 5.5 && h <= 18.5) {
    const p = (h - 5.5) / 13
    const x = l.Wl * (0.08 + 0.84 * p)
    const y = HORIZON_Y - 40 - Math.sin(Math.PI * p) * 300
    const dim = 1 - sky.cloudy * 0.8
    const glow = ctx.createRadialGradient(x, y, 10, x, y, 130)
    glow.addColorStop(0, `rgba(255,240,180,${0.55 * dim})`)
    glow.addColorStop(1, 'rgba(255,240,180,0)')
    ctx.fillStyle = glow
    ctx.fillRect(x - 130, y - 130, 260, 260)
    ctx.globalAlpha = 0.35 + 0.65 * dim
    ctx.fillStyle = h < 7 || h > 17.3 ? '#ffb070' : '#ffe27a'
    ctx.beginPath()
    ctx.arc(x, y, 38, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  if (sky.stars > 0.25) {
    const q = (((h - 18 + 24) % 24) / 12)
    const p = Math.min(1, Math.max(0, q))
    const x = l.Wl * (0.1 + 0.8 * p)
    const y = HORIZON_Y - 50 - Math.sin(Math.PI * p) * 260
    ctx.globalAlpha = Math.min(1, sky.stars * 1.2) * (1 - sky.cloudy * 0.55)
    const glow = ctx.createRadialGradient(x, y, 8, x, y, 90)
    glow.addColorStop(0, 'rgba(255,250,210,0.35)')
    glow.addColorStop(1, 'rgba(255,250,210,0)')
    ctx.fillStyle = glow
    ctx.fillRect(x - 90, y - 90, 180, 180)
    // 月牙：圓形減掉一個偏移的圓（evenodd），不會在天空上留下色塊
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, 30, 0, TAU)
    ctx.clip()
    ctx.fillStyle = '#fff6cf'
    ctx.beginPath()
    ctx.rect(x - 40, y - 40, 80, 80)
    ctx.arc(x + 13, y - 6, 27, 0, TAU)
    ctx.fill('evenodd')
    ctx.restore()
    ctx.globalAlpha = 1
  }

  // 雲
  const cloudCount = s.weather === 'sunny' ? 3 : s.weather === 'cloudy' ? 9 : s.weather === 'rain' ? 10 : 8
  const lum = Math.round(255 - sky.dark * 150 - (s.weather === 'rain' ? 70 : s.weather === 'cloudy' ? 30 : s.weather === 'snow' ? 20 : 0))
  const cloudColor = `rgba(${lum},${lum},${Math.min(255, lum + 6)},${s.weather === 'sunny' ? 0.92 : 0.95})`
  for (let i = 0; i < cloudCount; i++) {
    const speed = 6 + rnd(i * 1.7) * 10
    const span = l.Wl + 360
    const x = ((rnd(i * 4.3) * span + s.time * speed) % span) - 180
    const y = 50 + rnd(i * 9.1) * 200
    cloud(ctx, x, y, 0.8 + rnd(i * 2.9) * 0.9, cloudColor)
  }
  return sky
}

function drawHills(ctx: CanvasRenderingContext2D, l: Layout, dark: number): void {
  const layers: [number, string, number][] = [
    [46, '#9ab8d9', 0.9],
    [30, '#7fb98f', 1.3],
  ]
  layers.forEach(([amp, color, freq], li) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, WATER_TOP)
    for (let x = 0; x <= l.Wl; x += 20) {
      ctx.lineTo(x, WATER_TOP - 14 - amp * (0.55 + 0.45 * Math.sin(x * 0.004 * freq + li * 2.1)) * (0.7 + 0.3 * Math.sin(x * 0.011 + li)))
    }
    ctx.lineTo(l.Wl, WATER_TOP)
    ctx.closePath()
    ctx.fill()
  })
  void dark
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, snow: boolean): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.beginPath()
  ctx.ellipse(10, 4, 70, 14, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#8a5a35'
  ctx.beginPath()
  ctx.roundRect(-13, -120, 26, 124, 8)
  ctx.fill()
  ctx.fillStyle = '#734a2a'
  ctx.fillRect(2, -110, 8, 110)
  for (const [dx, dy, r, c] of [[-38, -150, 52, '#4fae5a'], [38, -154, 54, '#58b862'], [0, -198, 58, '#62c46b'], [-2, -140, 46, '#55b35f']] as const) {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(dx, dy, r, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.beginPath()
  ctx.arc(-14, -210, 26, 0, TAU)
  ctx.fill()
  // 蘋果
  for (const [dx, dy] of [[-34, -150], [40, -168], [8, -122]] as const) {
    ctx.fillStyle = '#e8564a'
    ctx.beginPath()
    ctx.arc(dx, dy, 6, 0, TAU)
    ctx.fill()
  }
  if (snow) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath()
    ctx.ellipse(0, -236, 44, 12, 0, 0, TAU)
    ctx.ellipse(-48, -184, 30, 9, -0.3, 0, TAU)
    ctx.ellipse(50, -190, 30, 9, 0.3, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function drawLand(ctx: CanvasRenderingContext2D, l: Layout, s: SceneState): void {
  const x1 = l.half - WALL_W
  const top = WATER_TOP - 10
  const g = ctx.createLinearGradient(0, top, 0, WORLD_H)
  g.addColorStop(0, '#9be07a')
  g.addColorStop(1, '#58b055')
  ctx.fillStyle = g
  ctx.fillRect(0, top, x1 + 2, WORLD_H - top)
  // 割草條紋
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  for (let i = 0; i < 9; i++) {
    const y = top + 30 + i * i * 7 + i * 12
    ctx.fillRect(0, y, x1, 14 + i * 3)
  }
  // 小徑：從近處蜿蜒到遠處
  const px = x1 * 0.46
  ctx.fillStyle = '#ecd7a6'
  ctx.beginPath()
  ctx.moveTo(px - 130, WORLD_H + 4)
  ctx.bezierCurveTo(px - 160, 740, px + 40, 640, px - 10, 560)
  ctx.bezierCurveTo(px - 30, 500, px + 6, 450, px + 8, top + 6)
  ctx.lineTo(px + 24, top + 6)
  ctx.bezierCurveTo(px + 28, 450, px + 56, 500, px + 50, 560)
  ctx.bezierCurveTo(px + 100, 650, px + 230, 740, px + 190, WORLD_H + 4)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#d6bb86'
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.fillStyle = '#e0c590'
  for (let i = 0; i < 14; i++) {
    const t = i / 13
    const yy = 880 - t * 440
    const cx = px + 60 - t * 44 + Math.sin(i * 2.3) * 14
    ctx.beginPath()
    ctx.ellipse(cx + Math.sin(i * 5.1) * 24 * (1 - t * 0.7), yy, 7 * (1 - t * 0.5), 3.2 * (1 - t * 0.5), 0, 0, TAU)
    ctx.fill()
  }
  // 小花與草叢
  for (let i = 0; i < 46; i++) {
    const x = rnd(i * 2.7) * x1
    const y = top + 30 + rnd(i * 6.1) * (WORLD_H - top - 40)
    if (Math.abs(x - px - 40) < 100 && y > 450) continue
    const sc = 0.6 + (y - top) / (WORLD_H - top)
    if (i % 3 === 0) {
      ctx.fillStyle = ['#ffffff', '#ffd1e6', '#fff09a'][i % 3 + (i % 2)] ?? '#fff'
      ctx.beginPath()
      ctx.arc(x, y, 3.2 * sc, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#ffd24a'
      ctx.beginPath()
      ctx.arc(x, y, 1.3 * sc, 0, TAU)
      ctx.fill()
    } else {
      ctx.strokeStyle = 'rgba(40,120,60,0.55)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 4 * sc, y)
      ctx.lineTo(x - 2 * sc, y - 9 * sc)
      ctx.moveTo(x, y)
      ctx.lineTo(x + 1 * sc, y - 12 * sc)
      ctx.moveTo(x + 4 * sc, y)
      ctx.lineTo(x + 6 * sc, y - 8 * sc)
      ctx.stroke()
    }
  }
  // 樹（純裝飾）
  tree(ctx, x1 * 0.1, 505, 0.9, s.weather === 'snow')
  tree(ctx, x1 * 0.84, 470, 0.72, s.weather === 'snow')
  if (s.weather === 'snow') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(0, top, x1, WORLD_H - top)
  }
}

function drawWall(ctx: CanvasRenderingContext2D, l: Layout): void {
  const x = l.half - WALL_W
  const g = ctx.createLinearGradient(x, 0, x + WALL_W, 0)
  g.addColorStop(0, '#a98a62')
  g.addColorStop(1, '#8a6c48')
  ctx.fillStyle = g
  ctx.fillRect(x, WATER_TOP - 14, WALL_W, WORLD_H - WATER_TOP + 14)
  // 石頭
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  for (let i = 0; i < 12; i++) {
    ctx.beginPath()
    ctx.roundRect(x + 4 + (i % 2) * 8, WATER_TOP + i * 42, 18, 28, 8)
    ctx.fill()
  }
  // 草緣
  ctx.fillStyle = '#7fcf68'
  ctx.beginPath()
  ctx.roundRect(x - 6, WATER_TOP - 22, WALL_W + 10, 14, 7)
  ctx.fill()
}

function drawPond(ctx: CanvasRenderingContext2D, l: Layout, s: SceneState): void {
  const x0 = l.half
  const w = l.Wl - x0
  // 沙地
  ctx.fillStyle = '#f2dfa4'
  ctx.fillRect(x0, SAND_TOP - 10, w, WORLD_H - SAND_TOP + 10)
  // 海水：上淺下深
  const g = ctx.createLinearGradient(0, WATER_TOP, 0, SAND_TOP)
  g.addColorStop(0, '#7edcf2')
  g.addColorStop(0.35, '#36a8e0')
  g.addColorStop(1, '#1b5fa8')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x0, WATER_TOP)
  ctx.lineTo(x0 + w, WATER_TOP)
  ctx.lineTo(x0 + w, SAND_TOP)
  for (let x = x0 + w; x >= x0; x -= 24) ctx.lineTo(x, SAND_TOP - 6 + Math.sin(x * 0.03) * 4)
  ctx.closePath()
  ctx.fill()

  // 光線
  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, WATER_TOP, w, SAND_TOP - WATER_TOP)
  ctx.clip()
  for (let i = 0; i < 6; i++) {
    const bx = x0 + w * (0.1 + i * 0.17) + Math.sin(s.time * 0.25 + i * 1.7) * 30
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(bx, WATER_TOP)
    ctx.lineTo(bx + 46, WATER_TOP)
    ctx.lineTo(bx - 70, SAND_TOP)
    ctx.lineTo(bx - 130, SAND_TOP)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // 沙地上的卵石、貝殼與海草
  for (let i = 0; i < 24; i++) {
    const x = x0 + 30 + rnd(i * 3.3) * (w - 60)
    const y = SAND_TOP + 20 + rnd(i * 7.9) * 70
    ctx.fillStyle = i % 4 === 0 ? '#ffc6d4' : i % 3 === 0 ? '#c9b98a' : '#d9c58c'
    ctx.beginPath()
    ctx.ellipse(x, y, 6 + rnd(i) * 7, 3 + rnd(i * 2) * 3, 0, 0, TAU)
    ctx.fill()
  }
  for (let i = 0; i < 7; i++) {
    const bx = x0 + 60 + (w - 120) * (i / 6) + Math.sin(i * 9) * 25
    ctx.strokeStyle = i % 2 ? '#3fae6a' : '#2d9a5c'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    for (let b = 0; b < 3; b++) {
      ctx.beginPath()
      ctx.moveTo(bx + b * 10, SAND_TOP + 6)
      const sway = Math.sin(s.time * 1.2 + i + b) * 14
      ctx.bezierCurveTo(bx + b * 10 + sway, SAND_TOP - 30, bx + b * 10 - sway, SAND_TOP - 64, bx + b * 10 + sway * 1.3, SAND_TOP - 92 - b * 14)
      ctx.stroke()
    }
  }

  // 水質：清潔度越低越混濁
  const murk = Math.max(0, (1 - s.pondClean / 100)) * 0.38
  if (murk > 0.01) {
    ctx.fillStyle = `rgba(110,125,45,${murk})`
    ctx.fillRect(x0, WATER_TOP, w, SAND_TOP - WATER_TOP + 8)
  }
}

/** 水面的波浪（畫在生物之後，讓浮在水面的部分被水蓋住一點） */
function drawWaves(ctx: CanvasRenderingContext2D, l: Layout, s: SceneState): void {
  const x0 = l.half
  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, WATER_TOP - 14, l.Wl - x0, 60)
  ctx.clip()
  for (let layer = 0; layer < 3; layer++) {
    const amp = 5 - layer * 1.2
    const y0 = WATER_TOP + layer * 6
    ctx.fillStyle = layer === 0 ? 'rgba(170,232,250,0.55)' : layer === 1 ? 'rgba(110,205,240,0.35)' : 'rgba(60,160,220,0.22)'
    ctx.beginPath()
    ctx.moveTo(x0, y0 + 40)
    for (let x = x0; x <= l.Wl + 10; x += 8) {
      const y = y0 + Math.sin(x * 0.03 + s.time * (1.4 + layer * 0.3) + layer * 1.3) * amp + Math.sin(x * 0.011 - s.time * 0.8) * 2.5
      ctx.lineTo(x, y)
    }
    ctx.lineTo(l.Wl + 10, y0 + 40)
    ctx.closePath()
    ctx.fill()
  }
  // 浪尖白線
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 2.4
  ctx.beginPath()
  for (let x = x0; x <= l.Wl + 10; x += 8) {
    const y = WATER_TOP + Math.sin(x * 0.03 + s.time * 1.4) * 5 + Math.sin(x * 0.011 - s.time * 0.8) * 2.5
    if (x === x0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

export function drawBackground(ctx: CanvasRenderingContext2D, l: Layout, s: SceneState): number {
  const sky = drawSky(ctx, l, s)
  drawHills(ctx, l, sky.dark)
  drawLand(ctx, l, s)
  drawPond(ctx, l, s)
  drawWall(ctx, l)
  return sky.dark
}

export { drawWaves }

/** 夜晚與陰天讓地面與池塘變暗（天空本身已經是暗的） */
export function drawDarkness(ctx: CanvasRenderingContext2D, l: Layout, dark: number): void {
  if (dark <= 0.01) return
  // 從遠景樹梢附近漸層變暗，避免在樹上留下一條生硬的分界線
  const top = WATER_TOP - 200
  const g = ctx.createLinearGradient(0, top, 0, WATER_TOP + 30)
  g.addColorStop(0, `rgba(8,12,44,0)`)
  g.addColorStop(1, `rgba(8,12,44,${dark * 0.62})`)
  ctx.fillStyle = g
  ctx.fillRect(0, top, l.Wl, WATER_TOP + 30 - top)
  ctx.fillStyle = `rgba(8,12,44,${dark * 0.62})`
  ctx.fillRect(0, WATER_TOP + 30, l.Wl, WORLD_H - WATER_TOP - 30)
}

interface Drop {
  x: number
  y: number
  v: number
  r: number
}

/** 雨與雪：固定數量的粒子，隨畫面寬度分布 */
export class WeatherFx {
  private drops: Drop[] = []
  private ripples: { x: number; life: number }[] = []

  private ensure(count: number, l: Layout, rand: () => number): void {
    while (this.drops.length < count) this.drops.push({ x: rand() * l.Wl, y: rand() * WORLD_H, v: 0.7 + rand() * 0.6, r: rand() })
    if (this.drops.length > count) this.drops.length = count
  }

  update(dt: number, l: Layout, weather: Weather, rand: () => number): void {
    const count = weather === 'rain' ? Math.round(l.Wl / 6) : weather === 'snow' ? Math.round(l.Wl / 14) : 0
    this.ensure(count, l, rand)
    for (const d of this.drops) {
      if (weather === 'rain') {
        d.y += 760 * d.v * dt
        d.x -= 90 * d.v * dt
        const hitsWater = d.x > l.half && d.y > WATER_TOP
        if (d.y > WORLD_H || hitsWater) {
          if (hitsWater && this.ripples.length < 40 && rand() < 0.5) this.ripples.push({ x: d.x, life: 0.6 })
          d.y = -20 - rand() * 80
          d.x = rand() * (l.Wl + 160)
        }
      } else if (weather === 'snow') {
        d.y += 52 * d.v * dt
        d.x += Math.sin(d.y * 0.02 + d.r * 6) * 18 * dt
        if (d.y > WORLD_H || (d.x > l.half && d.y > WATER_TOP + 2)) {
          d.y = -10 - rand() * 60
          d.x = rand() * l.Wl
        }
      }
    }
    for (const r of this.ripples) r.life -= dt
    this.ripples = this.ripples.filter((r) => r.life > 0)
  }

  draw(ctx: CanvasRenderingContext2D, weather: Weather): void {
    if (weather === 'rain') {
      ctx.strokeStyle = 'rgba(205,230,255,0.65)'
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (const d of this.drops) {
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x + 5, d.y - 17 * d.v)
      }
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1.5
      for (const r of this.ripples) {
        ctx.globalAlpha = r.life / 0.6
        ctx.beginPath()
        ctx.ellipse(r.x, WATER_TOP + 1, 14 * (1 - r.life / 0.6) + 2, 3 * (1 - r.life / 0.6) + 0.5, 0, 0, TAU)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    } else if (weather === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      for (const d of this.drops) {
        ctx.beginPath()
        ctx.arc(d.x, d.y, 2 + d.r * 2.4, 0, TAU)
        ctx.fill()
      }
    }
  }
}
