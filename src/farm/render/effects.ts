export type ParticleKind = 'bubble' | 'ring' | 'heart' | 'soap' | 'splash' | 'text' | 'sparkle' | 'crumb' | 'note' | 'zzz' | 'puff'

export interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  ax: number
  ay: number
  life: number
  maxLife: number
  size: number
  color: string
  text?: string
}

/** 粒子池：泡泡、愛心、肥皂泡、水花、浮字…都用同一套，上限避免失控 */
export class Particles {
  list: Particle[] = []
  private readonly max = 600

  add(p: Partial<Particle> & { kind: ParticleKind; x: number; y: number }): void {
    if (this.list.length >= this.max) this.list.shift()
    const life = p.life ?? 1
    this.list.push({
      vx: 0, vy: 0, ax: 0, ay: 0, size: 6, color: '#fff', ...p, life, maxLife: p.maxLife ?? life,
    })
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.vx += p.ax * dt
      p.vy += p.ay * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
    }
    this.list = this.list.filter((p) => p.life > 0)
  }

  /** layer：world 畫一般粒子；text 只畫浮字（要蓋在夜晚的暗色之上） */
  draw(ctx: CanvasRenderingContext2D, waterTop: number, layer: 'world' | 'text' = 'world'): void {
    for (const p of this.list) {
      if ((p.kind === 'text') !== (layer === 'text')) continue
      const k = Math.max(0, p.life / p.maxLife)
      ctx.save()
      switch (p.kind) {
        case 'bubble': {
          // 泡泡浮到水面就破掉
          if (p.y < waterTop) break
          ctx.globalAlpha = 0.75 * Math.min(1, k * 3)
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'
          ctx.fillStyle = 'rgba(255,255,255,0.18)'
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          ctx.fillStyle = 'rgba(255,255,255,0.8)'
          ctx.beginPath()
          ctx.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.22, 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'ring': {
          ctx.globalAlpha = 0.85 * k
          ctx.strokeStyle = 'rgba(255,255,255,0.95)'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (1.25 - k * 0.5), 0, Math.PI * 2)
          ctx.stroke()
          break
        }
        case 'heart': {
          ctx.globalAlpha = Math.min(1, k * 2)
          ctx.font = `${p.size * 2.4}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('💖', p.x, p.y)
          break
        }
        case 'soap': {
          ctx.globalAlpha = 0.85 * Math.min(1, k * 2.5)
          const g = ctx.createRadialGradient(p.x - p.size * 0.3, p.y - p.size * 0.3, 1, p.x, p.y, p.size)
          g.addColorStop(0, 'rgba(255,255,255,0.95)')
          g.addColorStop(0.7, 'rgba(190,230,255,0.45)')
          g.addColorStop(1, 'rgba(255,190,240,0.55)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'splash': {
          ctx.globalAlpha = Math.min(1, k * 1.6)
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'sparkle': {
          ctx.globalAlpha = Math.min(1, k * 2)
          ctx.fillStyle = p.color
          ctx.translate(p.x, p.y)
          ctx.rotate(Math.PI / 4)
          const s = p.size * (0.6 + 0.4 * Math.sin(k * 12))
          ctx.fillRect(-s / 2, -1.2, s, 2.4)
          ctx.fillRect(-1.2, -s / 2, 2.4, s)
          break
        }
        case 'crumb': {
          ctx.globalAlpha = Math.min(1, k * 2)
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'note':
        case 'zzz': {
          ctx.globalAlpha = Math.min(1, k * 2)
          ctx.fillStyle = p.color
          ctx.font = `bold ${p.size}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(p.text ?? (p.kind === 'zzz' ? 'z' : '♪'), p.x, p.y)
          break
        }
        case 'puff': {
          // 呼嚕泡泡：帶字的小泡泡
          ctx.globalAlpha = Math.min(1, k * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          ctx.strokeStyle = 'rgba(255,170,190,0.9)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          ctx.fillStyle = '#e0607e'
          ctx.font = `bold ${p.size * 0.9}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(p.text ?? '呼嚕', p.x, p.y + 1)
          break
        }
        case 'text': {
          // 數值變化的小浮字：描邊讓它在任何背景都看得清楚
          ctx.globalAlpha = Math.min(1, k * 2.2)
          ctx.font = `bold ${p.size}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.lineWidth = 4
          ctx.strokeStyle = 'rgba(0,0,0,0.55)'
          ctx.lineJoin = 'round'
          ctx.strokeText(p.text ?? '', p.x, p.y)
          ctx.fillStyle = p.color
          ctx.fillText(p.text ?? '', p.x, p.y)
          break
        }
      }
      ctx.restore()
    }
  }
}
