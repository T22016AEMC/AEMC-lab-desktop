import { BALL_R, H, W, type Flipper, type Pinball } from './engine'

function drawFlipper(ctx: CanvasRenderingContext2D, f: Flipper, active: boolean) {
  ctx.save()
  ctx.translate(f.pivot.x, f.pivot.y)
  ctx.rotate(f.angle)
  const r = f.thickness / 2
  const len = f.length - r
  const g = ctx.createLinearGradient(0, -r, 0, r)
  g.addColorStop(0, active ? '#fde68a' : '#fca5a5')
  g.addColorStop(1, active ? '#f59e0b' : '#dc2626')
  ctx.fillStyle = g
  ctx.shadowColor = active ? '#fbbf24' : '#000'
  ctx.shadowBlur = active ? 14 : 4
  ctx.beginPath()
  ctx.moveTo(0, -r)
  ctx.lineTo(len - r * 0.4, -r * 0.45)
  ctx.arc(len - r * 0.4, 0, r * 0.45, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(0, r)
  ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function drawPinball(ctx: CanvasRenderingContext2D, pb: Pinball): void {
  // 球檯底色
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#1e1b4b')
  bg.addColorStop(0.55, '#312e81')
  bg.addColorStop(1, '#0f172a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 拱形內的裝飾
  ctx.strokeStyle = 'rgba(165,180,252,0.12)'
  ctx.lineWidth = 2
  for (let r = 60; r <= 160; r += 50) {
    ctx.beginPath()
    ctx.arc(182, 330, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 牆
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#38bdf8'
  ctx.shadowColor = '#0ea5e9'
  ctx.shadowBlur = 8
  ctx.lineWidth = 6
  ctx.beginPath()
  for (const s of pb.walls) {
    ctx.moveTo(s.x1, s.y1)
    ctx.lineTo(s.x2, s.y2)
  }
  ctx.stroke()
  if (pb.gateClosed) {
    ctx.strokeStyle = '#f472b6'
    ctx.beginPath()
    ctx.moveTo(362, 235)
    ctx.lineTo(362, 100)
    ctx.stroke()
  }
  ctx.shadowBlur = 0

  // 頂部通道
  for (const p of pb.posts) {
    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const r of pb.rollovers) {
    ctx.fillStyle = r.on ? '#fde047' : 'rgba(250,204,21,0.2)'
    ctx.shadowColor = r.on ? '#facc15' : 'transparent'
    ctx.shadowBlur = r.on ? 14 : 0
    ctx.beginPath()
    ctx.arc(r.x, r.y, 8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0

  // 彈弓
  for (const sl of pb.slings) {
    ctx.fillStyle = sl.lit > 0 ? '#fef08a' : '#7c3aed'
    ctx.strokeStyle = '#c4b5fd'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.beginPath()
    sl.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // 立靶
  for (const t of pb.targets) {
    ctx.save()
    ctx.translate(t.body.position.x, t.body.position.y)
    ctx.fillStyle = t.lit > 0 ? '#ffffff' : t.on ? '#4ade80' : '#f97316'
    ctx.shadowColor = t.on ? '#4ade80' : '#f97316'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.roundRect(-t.w / 2, -t.h / 2, t.w, t.h, 3)
    ctx.fill()
    ctx.restore()
  }
  ctx.shadowBlur = 0

  // 彈跳器
  for (const b of pb.bumpers) {
    const lit = b.lit > 0
    const g = ctx.createRadialGradient(b.x - 6, b.y - 6, 2, b.x, b.y, b.r)
    g.addColorStop(0, lit ? '#ffffff' : '#fda4af')
    g.addColorStop(1, lit ? '#fde047' : '#e11d48')
    ctx.fillStyle = g
    ctx.shadowColor = lit ? '#fde047' : '#fb7185'
    ctx.shadowBlur = lit ? 24 : 10
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r * (lit ? 1.06 : 1), 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r - 6, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 彈射道底板與彈簧
  ctx.fillStyle = '#475569'
  ctx.fillRect(366, 684, 30, 10)
  if (pb.phase === 'waiting') {
    const pull = pb.plunger * 26
    const top = 680 + pull * 0.4
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    const y0 = 684
    ctx.moveTo(374, y0)
    const coils = 6
    for (let i = 0; i < coils; i++) {
      const y = y0 - ((y0 - top - 8) / coils) * (i + 0.5)
      ctx.lineTo(i % 2 ? 374 : 390, y)
    }
    ctx.stroke()
  }

  drawFlipper(ctx, pb.flippers.left, pb.flippers.left.pressed)
  drawFlipper(ctx, pb.flippers.right, pb.flippers.right.pressed)

  // 球
  if (pb.phase !== 'over') {
    const { x, y } = pb.ball.position
    const yy = pb.phase === 'waiting' ? y + pb.plunger * 14 : y
    const g = ctx.createRadialGradient(x - 3, yy - 3, 1, x, yy, BALL_R)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.5, '#cbd5e1')
    g.addColorStop(1, '#64748b')
    ctx.fillStyle = g
    ctx.shadowColor = 'rgba(255,255,255,0.6)'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(x, yy, BALL_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // 得分彈出文字
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of pb.popups) {
    ctx.globalAlpha = Math.min(1, p.life / 0.4)
    ctx.fillStyle = '#fde68a'
    ctx.fillText(p.text, p.x, p.y)
  }
  ctx.globalAlpha = 1

  // 發射提示與力道條
  if (pb.phase === 'waiting') {
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.font = '12px sans-serif'
    ctx.fillText('按住空白鍵蓄力', 182, 470)
    ctx.fillText('放開發射', 182, 488)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(372, 560, 16, 100)
    ctx.fillStyle = pb.plunger > 0.8 ? '#f87171' : '#4ade80'
    ctx.fillRect(372, 660 - 100 * pb.plunger, 16, 100 * pb.plunger)
  }
}
