// D2-3 野餐點心（瀏覽器）：貓狗都參加 → 兩樣、只有狗 → 只有餅乾、只有貓 → 只有小魚乾；
// 點心畫在墊子上（比對「有點心」與「把參加名單換成空」的畫面，差異在點心的位置）；照片裡也有。截圖
import { launch, open, ok, fails, save, pet, sleep, SHOTS, startPicnic, saveSceneCrop } from './lib.mjs'
import { mkdirSync } from 'node:fs'
mkdirSync(SHOTS, { recursive: true })

const b = await launch()
const cases = [
  ['mixed', [pet('d1', 'dog', 'shiba'), pet('c1', 'cat', 'tabby'), pet('d2', 'dog', 'corgi')], ['dog', 'cat']],
  ['dogs', [pet('d1', 'dog', 'shiba'), pet('d2', 'dog', 'golden')], ['dog']],
  ['cats', [pet('c1', 'cat', 'tabby'), pet('c2', 'cat', 'siamese')], ['cat']],
]
for (const [tag, pets, want] of cases) {
  const { ctx, page, errors } = await open(b, save({ pets, ownedBuildings: [], nextPetId: 9 }))
  const mat = await startPicnic(page, pets.length)
  await sleep(500)
  const r = await page.evaluate(() => {
    const E = window.__farm
    const st = E.picnicState
    const L = E.layout
    const draw = () => { const c = E.snapshot(); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data }
    const A = draw()
    const keep = st.active.pets
    st.active = { ...st.active, pets: [] }
    const B = draw()
    st.active = { ...st.active, pets: keep }
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0
    for (let k = 0; k < A.length; k += 4) {
      if (A[k] === B[k] && A[k + 1] === B[k + 1] && A[k + 2] === B[k + 2]) continue
      const p = k / 4, x = p % L.W, y = Math.floor(p / L.W)
      n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1)
    }
    return { n, box: n ? { x0, y0, x1, y1 } : null, mat: E.picnicMat() }
  })
  // 預期的點心外框（素材座標 → 場景座標）
  const SN = { dog: { x: 33, y: 52, w: 15, h: 8, ax: 8, ay: 8 }, cat: { x: 50, y: 56, w: 15, h: 4, ax: 8, ay: 4 } }
  const boxes = want.map((k) => { const s = SN[k]; return { x0: mat.x0 + s.x - s.ax, y0: mat.y0 + s.y - s.ay, x1: mat.x0 + s.x - s.ax + s.w, y1: mat.y0 + s.y - s.ay + s.h } })
  const u = { x0: Math.min(...boxes.map((q) => q.x0)), y0: Math.min(...boxes.map((q) => q.y0)), x1: Math.max(...boxes.map((q) => q.x1)), y1: Math.max(...boxes.map((q) => q.y1)) }
  ok(r.n > 0, `${tag}：畫了點心（${r.n} 像素）`)
  ok(r.box && r.box.x0 >= u.x0 && r.box.y0 >= u.y0 && r.box.x1 <= u.x1 && r.box.y1 <= u.y1, `${tag}：差異都在預期的點心位置內（${JSON.stringify(r.box)} ⊂ ${JSON.stringify(u)}）`)
  if (want.length === 1) {
    const other = want[0] === 'dog' ? 'cat' : 'dog'
    const s = SN[other]
    const ob = { x0: mat.x0 + s.x - s.ax, y0: mat.y0 + s.y - s.ay, x1: mat.x0 + s.x - s.ax + s.w, y1: mat.y0 + s.y - s.ay + s.h }
    ok(!(r.box.x0 < ob.x1 && r.box.x1 > ob.x0 && r.box.y0 < ob.y1 && r.box.y1 > ob.y0), `${tag}：沒有畫${other === 'cat' ? '小魚乾' : '餅乾'}`)
  }
  await saveSceneCrop(page, { x0: mat.x0 - 24, y0: mat.y0 - 44, x1: mat.x1 + 24, y1: mat.y1 + 10 }, SHOTS + `td23-snack-${tag}.png`)
  ok(errors.length === 0, `${tag}：沒有頁面錯誤 ` + errors.join(' | '))
  await ctx.close()
}
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : '全部通過')
process.exit(fails() ? 1 : 0)
