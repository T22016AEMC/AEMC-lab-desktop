import { rgb, skyAt, type Weather } from '../sim/worldTime'
import { assets, drawSprite } from './assets'
import { FAR_H, PATH_H, HOUSE_X0, type Layout, type Rect } from './layout'

/**
 * v3.9.0：可見範圍（邏輯座標，含場景外的延伸區），取整數邊界。沒給 ext（拍照、或剛好塞滿）＝場景本身 0..W × 0..H，
 * 畫出來的結果和 v3.8.1 逐像素相同；有延伸區時只是同樣的圖案往外多鋪幾格。
 */
export interface Ext {
  x0: number
  y0: number
  x1: number
  y1: number
}
export function extOf(L: Layout, ext?: Rect): Ext {
  if (!ext) return { x0: 0, y0: 0, x1: L.W, y1: L.H }
  return { x0: Math.min(0, Math.floor(ext.x0)), y0: Math.min(0, Math.floor(ext.y0)), x1: Math.max(L.W, Math.ceil(ext.x1)), y1: Math.max(L.H, Math.ceil(ext.y1)) }
}
/** 水平鋪排的起點：<= x0 且和 0 對齊 tile 寬（場景內的格子位置不變） */
const tileStart = (x0: number, w: number): number => (x0 >= 0 ? 0 : -Math.ceil(-x0 / w) * w)

/** 微小的確定性亂數（星星、雲的位置固定，不閃爍） */
function hash(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const SKY_BANDS = 14

/** 天空：程式畫的漸層（分成幾條色帶，像素風），隨日夜變色 */
export function drawSky(ctx: CanvasRenderingContext2D, L: Layout, hour: number, weather: Weather, ext?: Rect): void {
  const e = extOf(L, ext)
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
    // 最上面那條色帶往上延伸到可見範圍頂端（場景上方的天空）
    const y0 = i === 0 ? e.y0 : Math.floor((h * i) / SKY_BANDS)
    const y1 = Math.floor((h * (i + 1)) / SKY_BANDS)
    ctx.fillRect(e.x0, y0, e.x1 - e.x0, y1 - y0 + 1)
  }
}

/** 星星：夜晚出現，位置固定，緩慢閃爍 */
export function drawStars(ctx: CanvasRenderingContext2D, L: Layout, hour: number, time: number, ext?: Rect): void {
  const vis = skyAt(hour).stars
  if (vis < 0.05) return
  const e = extOf(L, ext)
  const ew = e.x1 - e.x0
  const n = Math.round(ew / 9)
  const star = assets.get('star')
  for (let i = 0; i < n; i++) {
    const x = e.x0 + Math.floor(hash(i * 7 + 1) * ew)
    const y = e.y0 + Math.floor(hash(i * 13 + 5) * (L.farBottom - 22 - e.y0))
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
export function drawClouds(ctx: CanvasRenderingContext2D, L: Layout, weather: Weather, time: number, darkness: number, ext?: Rect): void {
  const e = extOf(L, ext)
  const n = weather === 'sunny' ? 3 : weather === 'cloudy' ? 7 : weather === 'rain' ? 8 : 5
  const span = e.x1 - e.x0 + 80
  for (let i = 0; i < n; i++) {
    const s = assets.get(CLOUD_KEYS[i % 3])
    if (!s) continue
    const speed = 2.5 + hash(i + 40) * 3
    const x = e.x0 + ((hash(i * 3 + 9) * span + time * speed) % span) - 40
    const y = e.y0 + 8 + Math.floor(hash(i * 5 + 3) * Math.max(8, L.farBottom - 52 - e.y0))
    ctx.globalAlpha = 1 - darkness * 0.35
    drawSprite(ctx, s, x, y + s.h)
  }
  ctx.globalAlpha = 1
}

/** 遠景：水平重複的樹與丘陵 */
export function drawFar(ctx: CanvasRenderingContext2D, L: Layout, ext?: Rect): void {
  const s = assets.get('far')
  if (!s) return
  const e = extOf(L, ext)
  for (let x = tileStart(e.x0, s.w); x < e.x1; x += s.w) ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x, L.farBottom - FAR_H, s.w, s.h)
}

/** 草地：2×2 鏡像無縫的草地方塊，從遠景底邊鋪到畫面底部 */
export function drawGrass(ctx: CanvasRenderingContext2D, L: Layout, ext?: Rect): void {
  const s = assets.get('grass_tile')
  const e = extOf(L, ext)
  if (!s) {
    ctx.fillStyle = '#5aa83a'
    ctx.fillRect(e.x0, L.farBottom, e.x1 - e.x0, e.y1 - L.farBottom)
    return
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(e.x0, L.farBottom, e.x1 - e.x0, e.y1 - L.farBottom)
  ctx.clip()
  for (let y = L.farBottom; y < e.y1; y += s.h) for (let x = tileStart(e.x0, s.w); x < e.x1; x += s.w) ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x, y, s.w, s.h)
  ctx.restore()
}

/** 橫向小路：從住家門口往右延伸到畫面右側（水平重複） */
export function drawPath(ctx: CanvasRenderingContext2D, L: Layout, ext?: Rect): void {
  const s = assets.get('path')
  if (!s) return
  const y = L.H - 6 - PATH_H
  // 沙土路從住家門口往右，右邊的延伸區也接著鋪（左邊延伸區沒有路）
  const x1 = extOf(L, ext).x1
  for (let x = HOUSE_X0 + 40; x < x1; x += s.w) ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x, y, s.w, s.h)
}

/** 夜晚與黃昏的暗色疊層 */
export function drawDarkness(ctx: CanvasRenderingContext2D, L: Layout, hour: number, weather: Weather, ext?: Rect): number {
  let dark = skyAt(hour).dark
  if (weather === 'rain') dark = Math.min(0.7, dark + 0.16)
  else if (weather === 'cloudy') dark = Math.min(0.7, dark + 0.06)
  if (dark > 0.01) {
    ctx.fillStyle = `rgba(10,14,52,${(dark * 0.78).toFixed(3)})`
    const e = extOf(L, ext)
    ctx.fillRect(e.x0, e.y0, e.x1 - e.x0, e.y1 - e.y0)
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
export function makeDrops(L: Layout, weather: Weather, prev: Drop[], ext?: Rect): Drop[] {
  const e = extOf(L, ext)
  const ew = e.x1 - e.x0
  const want = weather === 'rain' ? Math.round(ew / 3.2) : weather === 'snow' ? Math.round(ew / 22) : 0
  const out = prev.slice(0, want)
  while (out.length < want)
    out.push({ x: e.x0 + Math.random() * ew, y: e.y0 + Math.random() * (e.y1 - e.y0), v: 0.8 + Math.random() * 0.5, ph: Math.random() * 6.28, len: 4 + Math.floor(Math.random() * 5) })
  return out
}

export function updateDrops(drops: Drop[], L: Layout, weather: Weather, dt: number, ext?: Rect): void {
  const e = extOf(L, ext)
  for (const d of drops) {
    if (weather === 'rain') {
      d.y += 260 * d.v * dt
      d.x -= 40 * d.v * dt
    } else {
      d.y += 16 * d.v * dt
      d.x += Math.sin(d.ph + d.y * 0.05) * 7 * dt
    }
    if (d.y > e.y1 + 10) {
      d.y = e.y0 - 12
      d.x = e.x0 + Math.random() * (e.x1 - e.x0)
    }
    if (d.x < e.x0 - 12) d.x = e.x1 + 6
    if (d.x > e.x1 + 12) d.x = e.x0 - 6
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
