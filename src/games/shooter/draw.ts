import { H, MAX_POWER, W, type Enemy, type PowerUp, type ShooterState } from './engine'

function drawPlayer(ctx: CanvasRenderingContext2D, s: ShooterState) {
  const p = s.player
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0 && p.shield <= 0) return // 無敵時閃爍
  ctx.save()
  ctx.translate(p.x, p.y)
  // 噴射火焰
  const flame = 10 + Math.sin(p.thrust) * 4
  const fg = ctx.createLinearGradient(0, 10, 0, 10 + flame + 8)
  fg.addColorStop(0, '#fde68a')
  fg.addColorStop(1, 'rgba(249,115,22,0)')
  ctx.fillStyle = fg
  ctx.beginPath()
  ctx.moveTo(-5, 12)
  ctx.lineTo(0, 12 + flame + 8)
  ctx.lineTo(5, 12)
  ctx.fill()
  // 機翼
  ctx.fillStyle = '#3b82f6'
  ctx.beginPath()
  ctx.moveTo(0, -8)
  ctx.lineTo(24, 14)
  ctx.lineTo(12, 14)
  ctx.lineTo(0, 6)
  ctx.lineTo(-12, 14)
  ctx.lineTo(-24, 14)
  ctx.closePath()
  ctx.fill()
  // 機身
  const body = ctx.createLinearGradient(-8, 0, 8, 0)
  body.addColorStop(0, '#e2e8f0')
  body.addColorStop(0.5, '#ffffff')
  body.addColorStop(1, '#94a3b8')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(0, -22)
  ctx.quadraticCurveTo(9, -4, 8, 14)
  ctx.lineTo(-8, 14)
  ctx.quadraticCurveTo(-9, -4, 0, -22)
  ctx.fill()
  // 座艙
  ctx.fillStyle = '#38bdf8'
  ctx.beginPath()
  ctx.ellipse(0, -4, 3.5, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  // 護盾
  if (p.shield > 0) {
    const fade = p.shield < 2 ? (Math.floor(p.shield * 8) % 2 ? 0.25 : 0.7) : 0.8
    ctx.strokeStyle = `rgba(103,232,249,${fade})`
    ctx.lineWidth = 2.5
    ctx.fillStyle = `rgba(34,211,238,${fade * 0.18})`
    ctx.beginPath()
    ctx.arc(0, 0, 28, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
  ctx.save()
  ctx.translate(e.x, e.y)
  const flash = e.flash > 0
  const fill = (normal: string) => (flash ? '#ffffff' : normal)
  switch (e.type) {
    case 'grunt':
      ctx.fillStyle = fill('#ef4444')
      ctx.beginPath()
      ctx.moveTo(0, 15)
      ctx.lineTo(15, -11)
      ctx.lineTo(0, -5)
      ctx.lineTo(-15, -11)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#fecaca'
      ctx.beginPath()
      ctx.arc(0, -2, 3.5, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'weaver':
      ctx.fillStyle = fill('#a855f7')
      ctx.beginPath()
      ctx.ellipse(0, 0, 17, 9, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = fill('#d8b4fe')
      ctx.beginPath()
      ctx.ellipse(0, -4, 8, 6, 0, Math.PI, 0)
      ctx.fill()
      ctx.fillStyle = '#f0abfc'
      for (const x of [-10, 0, 10]) {
        ctx.beginPath()
        ctx.arc(x, 3, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'shooter':
      ctx.fillStyle = fill('#f97316')
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6
        ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18)
      }
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#7c2d12'
      ctx.fillRect(-3, 6, 6, 14)
      ctx.fillStyle = '#fed7aa'
      ctx.beginPath()
      ctx.arc(0, -2, 5, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'tank':
      ctx.fillStyle = fill('#64748b')
      ctx.beginPath()
      ctx.roundRect(-22, -16, 44, 32, 8)
      ctx.fill()
      ctx.fillStyle = fill('#475569')
      ctx.fillRect(-26, -8, 8, 22)
      ctx.fillRect(18, -8, 8, 22)
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(-14, 10, 5, 12)
      ctx.fillRect(9, 10, 5, 12)
      ctx.fillRect(-2.5, 12, 5, 14)
      ctx.fillStyle = '#22c55e'
      ctx.beginPath()
      ctx.arc(0, -2, 7, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'boss': {
      const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 70)
      glow.addColorStop(0, 'rgba(244,63,94,0.35)')
      glow.addColorStop(1, 'rgba(244,63,94,0)')
      ctx.fillStyle = glow
      ctx.fillRect(-70, -70, 140, 140)
      ctx.fillStyle = fill('#7f1d1d')
      ctx.beginPath()
      ctx.moveTo(0, 46)
      ctx.lineTo(54, 6)
      ctx.lineTo(46, -30)
      ctx.lineTo(18, -16)
      ctx.lineTo(0, -40)
      ctx.lineTo(-18, -16)
      ctx.lineTo(-46, -30)
      ctx.lineTo(-54, 6)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = fill('#b91c1c')
      ctx.beginPath()
      ctx.moveTo(0, 34)
      ctx.lineTo(32, 4)
      ctx.lineTo(0, -24)
      ctx.lineTo(-32, 4)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#fbbf24'
      ctx.beginPath()
      ctx.arc(0, 2, 9 + Math.sin(e.age * 6) * 1.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#450a0a'
      for (const x of [-38, 38]) ctx.fillRect(x - 4, 8, 8, 20)
      break
    }
  }
  ctx.restore()
}

function drawPowerUp(ctx: CanvasRenderingContext2D, u: PowerUp) {
  const isPower = u.kind === 'power'
  const bob = Math.sin(u.age * 5) * 2
  ctx.save()
  ctx.translate(u.x, u.y + bob)
  ctx.shadowColor = isPower ? '#f97316' : '#22d3ee'
  ctx.shadowBlur = 12
  ctx.fillStyle = isPower ? '#f97316' : '#06b6d4'
  ctx.beginPath()
  ctx.arc(0, 0, 13, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(isPower ? 'P' : 'S', 0, 1)
  ctx.restore()
}

export function drawShooter(ctx: CanvasRenderingContext2D, s: ShooterState): void {
  ctx.save()
  if (s.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * s.shake * 2, (Math.random() - 0.5) * 8 * s.shake * 2)

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#020617')
  bg.addColorStop(1, '#1e1b4b')
  ctx.fillStyle = bg
  ctx.fillRect(-10, -10, W + 20, H + 20)
  for (const st of s.stars) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + st.z * 0.55})`
    const size = 0.8 + st.z * 1.2
    ctx.fillRect(st.x, st.y, size, size * (1 + st.z))
  }

  for (const u of s.powerups) drawPowerUp(ctx, u)
  for (const e of s.enemies) drawEnemy(ctx, e)

  // 子彈
  for (const b of s.playerBullets) {
    ctx.fillStyle = '#67e8f9'
    ctx.shadowColor = '#22d3ee'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.roundRect(b.x - 2, b.y - 8, 4, 14, 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0
  for (const b of s.enemyBullets) {
    ctx.fillStyle = '#fb7185'
    ctx.shadowColor = '#f43f5e'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffe4e6'
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0

  if (!s.over) drawPlayer(ctx, s)

  // 爆炸粒子
  for (const q of s.particles) {
    const k = Math.max(0, q.life / q.maxLife)
    if (q.kind === 'ring') {
      ctx.strokeStyle = `rgba(253,230,138,${k})`
      ctx.lineWidth = 3 * k
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.size * (1 - k) + 4, 0, Math.PI * 2)
      ctx.stroke()
    } else if (q.kind === 'smoke') {
      ctx.fillStyle = `rgba(71,85,105,${k * 0.5})`
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.size * (1.4 - k * 0.6), 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.globalAlpha = k
      ctx.fillStyle = q.color
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.size * (0.4 + k * 0.6), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  // Boss 血條
  const boss = s.enemies.find((e) => e.type === 'boss')
  if (boss) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(40, 14, W - 80, 8)
    ctx.fillStyle = boss.hp / boss.maxHp > 0.33 ? '#f43f5e' : '#fb923c'
    ctx.fillRect(40, 14, (W - 80) * Math.max(0, boss.hp / boss.maxHp), 8)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 1
    ctx.strokeRect(40, 14, W - 80, 8)
  }

  // HUD：生命、火力、護盾
  const p = s.player
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = '16px sans-serif'
  for (let i = 0; i < p.lives; i++) ctx.fillText('❤️', 8 + i * 22, H - 16)
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = '#fdba74'
  ctx.fillText(`火力 ${'▮'.repeat(p.power)}${'▯'.repeat(MAX_POWER - p.power)}`, W - 8, H - 24)
  if (p.shield > 0) {
    ctx.fillStyle = '#67e8f9'
    ctx.fillText(`護盾 ${p.shield.toFixed(1)}s`, W - 8, H - 8)
  }

  // 橫幅
  if (s.banner.t > 0) {
    const a = Math.min(1, s.banner.t / 0.5)
    ctx.globalAlpha = a
    ctx.textAlign = 'center'
    ctx.font = 'bold 34px sans-serif'
    ctx.fillStyle = s.banner.text.startsWith('⚠') ? '#f87171' : '#e0f2fe'
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 8
    ctx.fillText(s.banner.text, W / 2, H * 0.32)
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }
  ctx.restore()
}
