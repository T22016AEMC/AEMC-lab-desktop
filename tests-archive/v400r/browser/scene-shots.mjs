// 階段 R 截圖：真的頁面（dev server）＋固定的寵物位置。輸出到 shots/<名稱>/（before 或 after）
//  - scene-<寬>-<day|night>.png：整個瀏覽器畫面（1024×768、1366×768、1920×1080）
//  - snap-<day|night>.png：引擎快照（邏輯像素 1:1，640×320）× 2
//  - crop-kennel-<day|night>.png、crop-cattree-night.png、crop-tower-<day|night>.png、crop-house-day.png、crop-pond-day.png、crop-board-day.png：場景近照 × 4
//  - adopt-first.png：第一次領養畫面（正面照）
// 寵物：editing = true 讓引擎停住（不畫任何擺設標記），再把寵物放到固定位置與動作；夜晚把柴犬放進狗窩、黃金放在窩門口、
//       橘貓與黑貓放上貓跳台頂層與中層（和遊戲裡 seatView 用同一套座位）。
import { launch, open, save, pet, saveSceneCrop, sleep } from '../../calendar-tweaks/browser/lib.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const NAME = process.argv[2] ?? 'before'
const OUT = fileURLToPath(new URL(`./shots/${NAME}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
const SIZES = [[1024, 768], [1366, 768], [1920, 1080]]
const PETS = [['p1', 'dog', 'shiba'], ['p2', 'cat', 'tabby'], ['p3', 'dog', 'golden'], ['p4', 'cat', 'black'], ['p5', 'dog', 'corgi'], ['p6', 'cat', 'calico']]
const S = save({ pets: PETS.map(([id, sp, v]) => pet(id, sp, v, { personality: 'lively' })), nextPetId: 7, ownedBuildings: ['kennel', 'bowls', 'catTree'] })

/** 把寵物停在固定位置；night = 柴犬窩裡、黃金窩門口、橘貓頂層、黑貓中層，其餘睡在地上 */
async function stage(page, hour) {
  await page.evaluate((hour) => { window.__overrides.weather = 'sunny'; window.__overrides.hour = hour }, hour)
  await sleep(400)
  return page.evaluate((night) => {
    const e = window.__farm
    e.editing = true
    e.particles.length = 0
    const bs = e.buildings()
    const seat = (a, id, seat) => {
      const slot = bs.get(id)
      a.bld = { id, seat, purpose: 'sleep', phase: 'at', t: 0, leaveIn: null, poseIn: 9, stage: 'seat', near: { x: slot.x, y: slot.y + 6 } }
    }
    let k = 0
    for (const a of e.actors.values()) {
      a.drag = null; a.fly = null; a.bath = null; a.play = null; a.picnic = null; a.override = null; a.hv = null; a.bld = null
      a.x = 200 + k * 48
      a.y = 268 - (k % 2) * 14
      a.facing = k % 2 ? -1 : 1
      a.action = night ? 'sleep' : k % 3 === 0 ? 'sit' : 'idle'
      a.t = 0; a.animT = 0; a.hop = 0; a.lift = 0
      if (night) {
        if (a.id === 'p1') seat(a, 'kennel', 0)
        if (a.id === 'p3') seat(a, 'kennel', 1)
        if (a.id === 'p2') seat(a, 'catTree', 0)
        if (a.id === 'p4') seat(a, 'catTree', 1)
      }
      k++
    }
    const L = window.__layout
    const out = {}
    for (const [id, s] of bs) out[id] = { x: s.x, y: s.y }
    out.tower = { x: L.towerX(e.layout), y: L.towerBase(e.layout) }
    return { slots: out, W: e.layout.W, H: e.layout.H }
  }, hour >= 20 || hour < 6)
}

async function snap(page, file) {
  const url = await page.evaluate(() => {
    const c = window.__farm.snapshot()
    const o = document.createElement('canvas')
    o.width = c.width * 2; o.height = c.height * 2
    const g = o.getContext('2d')
    g.imageSmoothingEnabled = false
    g.drawImage(c, 0, 0, o.width, o.height)
    return o.toDataURL('image/png')
  })
  writeFileSync(OUT + file, Buffer.from(url.split(',')[1], 'base64'))
}

const b = await launch()
const info = {}
for (const [w, h] of SIZES)
  for (const [tag, hour] of [['day', 10], ['night', 22]]) {
    const { ctx, page, errors } = await open(b, S, { w, h, hour })
    const st = await stage(page, hour)
    await sleep(300)
    await page.screenshot({ path: OUT + `scene-${w}-${tag}.png` })
    if (w === 1366) {
      info[tag] = st
      await snap(page, `snap-${tag}.png`)
      const L = await page.evaluate(() => {
        const m = window.__layout
        return { KW: m.KENNEL_W, KH: m.KENNEL_H, KAX: m.KENNEL_AX, CW: m.CAT_TREE_W, CH: m.CAT_TREE_H, TW: m.TOWER_W, TH: m.TOWER_H, HW: m.HOUSE_W, HH: m.HOUSE_H, BW: m.BOARD_W, BH: m.BOARD_H }
      })
      const k = st.slots.kennel, c = st.slots.catTree, t = st.slots.tower
      if (k) await saveSceneCrop(page, { x0: Math.round(k.x - L.KAX - 70), x1: Math.round(k.x - L.KAX + L.KW + 70), y0: Math.round(k.y - L.KH - 20), y1: Math.round(k.y + 14) }, OUT + `crop-kennel-${tag}.png`, 4)
      if (c && tag === 'night') await saveSceneCrop(page, { x0: Math.round(c.x - L.CW / 2 - 40), x1: Math.round(c.x + L.CW / 2 + 30), y0: Math.max(0, Math.round(c.y - L.CH - 24)), y1: Math.round(c.y + 8) }, OUT + 'crop-cattree-night.png', 4)
      await saveSceneCrop(page, { x0: Math.round(t.x - L.TW / 2 - 6), x1: Math.round(t.x + L.TW / 2 + 6), y0: Math.max(0, Math.round(t.y - L.TH - 4)), y1: Math.min(st.H, Math.round(t.y + 4)) }, OUT + `crop-tower-${tag}.png`, 3)
      if (tag === 'day') {
        const r = await page.evaluate(() => {
          const e = window.__farm, P = e.layout.placement.placed
          const box = (id) => { const p = P.get(id); return p ? { x: p.x, y: p.y } : null }
          return { house: box('house'), pond: box('pond'), board: box('board') }
        })
        if (r.house) await saveSceneCrop(page, { x0: Math.max(0, Math.round(r.house.x - L.HW / 2 - 6)), x1: Math.round(r.house.x + L.HW / 2 + 6), y0: Math.max(0, Math.round(r.house.y - L.HH - 4)), y1: Math.round(r.house.y + 4) }, OUT + 'crop-house-day.png', 3)
        if (r.pond) await saveSceneCrop(page, { x0: Math.max(0, Math.round(r.pond.x - 62)), x1: Math.round(r.pond.x + 62), y0: Math.max(0, Math.round(r.pond.y - 86)), y1: Math.round(r.pond.y + 4) }, OUT + 'crop-pond-day.png', 4)
        if (r.board) await saveSceneCrop(page, { x0: Math.max(0, Math.round(r.board.x - L.BW / 2 - 6)), x1: Math.round(r.board.x + L.BW / 2 + 6), y0: Math.max(0, Math.round(r.board.y - L.BH - 4)), y1: Math.round(r.board.y + 4) }, OUT + 'crop-board-day.png', 4)
      }
    }
    if (errors.length) console.log('頁面錯誤 ' + errors.join(' | '))
    await ctx.close()
  }
{
  const { ctx, page } = await open(b, null, { w: 1366, h: 768, hour: 10 })
  await page.getByRole('dialog').first().waitFor({ timeout: 15000 }).catch(() => {})
  await sleep(800)
  await page.screenshot({ path: OUT + 'adopt-first.png' })
  await ctx.close()
}
writeFileSync(OUT + 'scene-info.json', JSON.stringify(info, null, 1))
await b.close()
console.log('截圖完成 → ' + OUT)
