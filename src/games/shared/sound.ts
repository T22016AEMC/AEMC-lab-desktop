/** 簡易音效：用 WebAudio 合成，不使用外部音檔。預設關閉。 */
export type Sfx =
  | 'click'
  | 'flag'
  | 'win'
  | 'lose'
  | 'eat'
  | 'merge'
  | 'move'
  | 'shoot'
  | 'hit'
  | 'explode'
  | 'power'
  | 'bounce'
  | 'launch'
  | 'flip'

let enabled = false
let ctx: AudioContext | null = null
const listeners = new Set<() => void>()

export function isSoundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(v: boolean): void {
  enabled = v
  listeners.forEach((l) => l())
}

export function subscribeSound(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise(dur: number, vol: number): void {
  const c = getCtx()
  if (!c) return
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  const gain = c.createGain()
  src.buffer = buf
  gain.gain.value = vol
  src.connect(gain).connect(c.destination)
  src.start()
}

export function playSfx(kind: Sfx): void {
  if (!enabled) return
  try {
    switch (kind) {
      case 'click':
        tone(520, 0.05, 'square', 0.05)
        break
      case 'flag':
        tone(660, 0.07, 'triangle', 0.08)
        break
      case 'move':
        tone(300, 0.04, 'sine', 0.05)
        break
      case 'merge':
        tone(440, 0.09, 'triangle', 0.09, 880)
        break
      case 'eat':
        tone(700, 0.08, 'square', 0.06, 1100)
        break
      case 'shoot':
        tone(900, 0.05, 'square', 0.025, 500)
        break
      case 'hit':
        tone(180, 0.06, 'sawtooth', 0.05)
        break
      case 'explode':
        noise(0.28, 0.12)
        tone(120, 0.25, 'sawtooth', 0.06, 40)
        break
      case 'power':
        tone(520, 0.08, 'triangle', 0.09)
        tone(780, 0.1, 'triangle', 0.09, undefined, 0.08)
        tone(1040, 0.14, 'triangle', 0.09, undefined, 0.16)
        break
      case 'bounce':
        tone(260, 0.1, 'sine', 0.12, 680)
        break
      case 'launch':
        tone(160, 0.28, 'sawtooth', 0.07, 700)
        break
      case 'flip':
        tone(140, 0.05, 'square', 0.06, 90)
        break
      case 'win':
        tone(523, 0.12, 'triangle', 0.1)
        tone(659, 0.12, 'triangle', 0.1, undefined, 0.12)
        tone(784, 0.12, 'triangle', 0.1, undefined, 0.24)
        tone(1046, 0.3, 'triangle', 0.1, undefined, 0.36)
        break
      case 'lose':
        tone(400, 0.2, 'sawtooth', 0.08, 90)
        tone(200, 0.35, 'sawtooth', 0.08, 50, 0.18)
        break
    }
  } catch {
    // 音效失敗不影響遊戲
  }
}
