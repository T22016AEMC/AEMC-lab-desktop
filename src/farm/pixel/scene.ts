import { rgb, skyAt, type Weather } from '../sim/worldTime'
import { assets, drawSprite } from './assets'
import { FAR_H, PATH_H, HOUSE_X0, type Layout } from './layout'

/** 微小的確定性亂數（星星、雲的位置固定，不閃爍） */
function hash(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const SKY_BANDS = 14

/** 天空：程式畫的漸層（分成幾條色帶，像素風），隨日夜變色 */
export function drawSky(ctx: CanvasRenderingContext2D, L: Layout, hour: number, weather: Weather): void {
  const sky = skyAt(hour)
  // 下雨、下雪、多雲時天空偏灰
  const grey = weather === 'rain' ? 0.55 : weather === 'snow' ? 0.4 : weather === 'cloudy' ? 0.3 : 0
  const gray = (c: [number, number, number]): [number, number, number] => {
    const g = (c[0] + c[1] + c[2]) / 3
    return [c[0] + (g - c[0]) * grey, c[1] + (g - c[1]) * grey, c[2] + (g - c[2]) * grey]
  }
  const top = gray(sky.top)
  const bottom = gray(sky.bottom)
  const h = L.farBottom
  for (let i = 0; i < SKY_BANDS; i++) {
    const t = (i + 0.5) / SKY_BANDS
    const c: [number, number, number] = [
      top[0] + (bottom[0] - top[0]) * t,
      top[1] + (bottom[1] - top[1]) * t,
      top[2] + (bottom[2] - top[2]) * t,
    ]
    ctx.fillStyle = rgb(c)
    const y0 = Math.floor((h * i) / SKY_BANDS)
    const y1 = Math.floor((h * (i + 1)) / SKY_BANDS)
    ctx.fillRect(0, y0, L.W, y1 - y0 + 1)
  }
}

/** 星星：夜晚出現，位置固定，緩慢閃爍 */
export function drawStars(ctx: CanvasRenderingContext2D, L: Layout, hour: number, time: number): void {
  const vis = skyAt(hour).stars
  if (vis < 0.05) return
  const n = Math.round(L.W / 9)
  const star = assets.get('star')
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash(i * 7 + 1) * L.W)
    const y = Math.floor(hash(i * 13 + 5) * (L.farBottom - 22))
    const tw = 0.55 + 0.45 * Math.sin(time * (0.8 + hash(i) * 1.4) + i)
    ctx.globalAlpha = Math.min(1, vis * tw)
    if (i % 17 === 0 && star) drawSprite(ctx, star, x, y + star.h)
    else {
      ctx.fillStyle = '#fffbe0'
      ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1)
    }
  }
  ctx.globalAlpha = 1
}

/** 太陽（6～18 時）與月亮（18～6 時）沿弧線移動 */
export function drawCelestial(ctx: CanvasRenderingContext2D, L: Layout, hour: number, weather: Weather): void {
  const h = ((hour % 24) + 24) % 24
  const isDay = h >= 6 && h < 18
  const t = isDay ? (h - 6) / 12 : ((h >= 18 ? h - 18 : h + 6) / 12)
  const s = assets.get(isDay ? 'sun' : 'moon')
  if (!s) return
  const x = Math.round(L.W * (0.08 + 0.84 * t))
  const y = Math.round(L.farBottom - 14 - Math.sin(Math.PI * t) * (L.farBottom * 0.78))
  if (weather === 'rain') ctx.globalAlpha = 0.35
  else if (weather === 'snow') ctx.globalAlpha = 0.5
  else if (weather === 'cloudy') ctx.globalAlpha = 0.75
  drawSprite(ctx, s, x, y + s.h / 2)
  ctx.globalAlpha = 1
}

const CLOUD_KEYS = ['cloud_a', 'cloud_b', 'cloud_c']

/** 雲：緩慢向右漂移（位置由時間決定，水平循環）；天氣越差雲越多 */
export function drawClouds(ctx: CanvasRenderingContext2D, L: Layout, weather: Weather, time: number, darkness: number): void {
  const n = weather === 'sunny' ? 3 : weather === 'cloudy' ? 7 : weather === 'rain' ? 8 : 5
  const span = L.W + 80
  for (let i = 0; i < n; i++) {
    const s = assets.get(CLOUD_KEYS[i % 3])
    if (!s) continue
    const speed = 2.5 + hash(i + 40) * 3
    const x = ((hash(i * 3 + 9) * span + time * speed) % span) - 40
    const y = 8 + Math.floor(hash(i * 5 + 3) * Math.max(8, L.farBottom - 52))
    ctx.globalAlpha = 1 - darkness * 0.35
    drawSprite(ctx, s, x, y + s.h)
  }
  ctx.globalAlpha = 1
}

/** 遠景：水平重複的樹與丘陵 */
export function drawFar(ctx: CanvasRenderingContext2D, L: Layout): void {
  const s = assets.get('far')
  if (!s) return
  for (let x = 0; x < L.W; x += s.w) ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x, L.farBottom - FAR_H, s.w, s.h)
}

/** 草地：2×2 鏡像無縫的草地方塊，從遠景底邊鋪到畫面底部 */
export function drawGrass(ctx: CanvasRenderingContext2D, L: Layout): void {
  const s = assets.get('grass_tile')
  if (!s) {
    ctx.fillStyle = '#5aa83a'
    ctx.fillRect(0, L.farBottom, L.W, L.H - L.farBottom)
    return
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, L.farBottom, L.W, L.H - L.farBottom)
  ctx.clip()
  for (let y = L.farBottom; y < L.H; y += s.h) for (let x = 0; x < L.W; x += s.w) ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x, y, s.w, s.h)
  ctx.restore()
}

/** 橫向小路：從住家門口往右延伸到畫面右側（水平重複） */
export function drawPath(ctx: CanvasRenderingContext2D, L: Layout): void {
  const s = assets.get('path')
  if (!s) return
  const y = L.H - 6 - PATH_H
  for (let x = HOUSE_X0 + 40; x < L.W; x += s.w) ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x, y, s.w, s.h)
}

/** 夜晚與黃昏的暗色疊層 */
export function drawDarkness(ctx: CanvasRenderingContext2D, L: Layout, hour: number, weather: Weather): number {
  let dark = skyAt(hour).dark
  if (weather === 'rain') dark = Math.min(0.7, dark + 0.16)
  else if (weather === 'cloudy') dark = Math.min(0.7, dark + 0.06)
  if (dark > 0.01) {
    ctx.fillStyle = `rgba(10,14,52,${(dark * 0.78).toFixed(3)})`
    ctx.fillRect(0, 0, L.W, L.H)
  }
  return dark
}

/** 路燈的光暈（疊在暗色疊層之上）：用橫條組成的同心橢圓，邊緣是像素階梯，不是平滑漸層 */
export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, strength: number): void {
  if (strength <= 0.02) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const cx = Math.round(x)
  const cy = Math.round(y)
  for (let ring = 4; ring >= 1; ring--) {
    const rx = ring * 9
    const ry = ring * 7
    ctx.fillStyle = `rgba(255,200,100,${(0.055 * strength).toFixed(3)})`
    for (let dy = -ry; dy <= ry; dy++) {
      const hw = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.01)))
      ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1)
    }
  }
  ctx.restore()
}

export interface Drop {
  x: number
  y: number
  v: number
  ph: number
  /** 雨絲長度（像素） */
  len: number
}

/**
 * 雨雪粒子，由引擎持有。雨是細細的淺藍色短線（1 像素寬、4～8 像素長、數量多、速度快），不用水珠素材；
 * 雪是縮小後的小顆雪花素材，密度適中。
 */
export function makeDrops(L: Layout, weather: Weather, prev: Drop[]): Drop[] {
  const want = weather === 'rain' ? Math.round(L.W / 3.2) : weather === 'snow' ? Math.round(L.W / 22) : 0
  const out = prev.slice(0, want)
  while (out.length < want)
    out.push({ x: Math.random() * L.W, y: Math.random() * L.H, v: 0.8 + Math.random() * 0.5, ph: Math.random() * 6.28, len: 4 + Math.floor(Math.random() * 5) })
  return out
}

export function updateDrops(drops: Drop[], L: Layout, weather: Weather, dt: number): void {
  for (const d of drops) {
    if (weather === 'rain') {
      d.y += 260 * d.v * dt
      d.x -= 40 * d.v * dt
    } else {
      d.y += 16 * d.v * dt
      d.x += Math.sin(d.ph + d.y * 0.05) * 7 * dt
    }
    if (d.y > L.H + 10) {
      d.y = -12
      d.x = Math.random() * L.W
    }
    if (d.x < -12) d.x = L.W + 6
    if (d.x > L.W + 12) d.x = -6
  }
}

export function drawDrops(ctx: CanvasRenderingContext2D, drops: Drop[], weather: Weather): void {
  if (weather === 'rain') {
    // 細長的淺藍色雨絲：沿著斜線一格一格畫
    ctx.fillStyle = 'rgba(180,215,255,0.62)'
    for (const d of drops) {
      const x0 = Math.round(d.x)
      const y0 = Math.round(d.y)
      for (let i = 0; i < d.len; i++) ctx.fillRect(x0 - Math.floor(i / 5), y0 + i, 1, 1)
    }
    return
  }
  const s = assets.get('snowflake')
  if (!s) return
  ctx.globalAlpha = 0.9
  for (const d of drops) drawSprite(ctx, s, d.x, d.y + s.h)
  ctx.globalAlpha = 1
}
