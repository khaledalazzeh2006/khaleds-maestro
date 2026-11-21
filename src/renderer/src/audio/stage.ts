/**
 * The 3D stage: every instrument group plays through its own output of the engine, placed in space
 * (HRTF for headphones, or panning for speakers), a little darker and wetter the further back it sits,
 * all sharing one hall reverb. The spotlight lifts the melody and lowers the rest.
 */
import { BUSES } from './sampler'

export type StageMode = 'headphones' | 'speakers'
export interface Spot { x: number; y: number } // x: -1 left .. 1 right, y: 0 front .. 1 back

interface Bus { input: GainNode; panner: PannerNode; air: BiquadFilterNode; send: GainNode; key: string | null }

export class Stage {
  private buses: Bus[] = []
  private reverb: ConvolverNode
  private wet: GainNode
  private byKey = new Map<string, number>()
  private room = 0.5
  private spotKey: string | null = null
  private spotDb = 0

  private levels = new Map<string, number>() // dB per group (the mix)

  constructor(private ctx: BaseAudioContext, node: AudioWorkletNode, dest: AudioNode) {
    this.reverb = ctx.createConvolver()
    this.wet = ctx.createGain()
    this.reverb.connect(this.wet).connect(dest)
    for (let i = 0; i < BUSES; i++) {
      const input = ctx.createGain()
      const air = ctx.createBiquadFilter()
      air.type = 'lowpass'
      air.frequency.value = 20000
      const panner = new PannerNode(ctx, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 2, rolloffFactor: 0.45, positionZ: -2 })
      const send = ctx.createGain()
      node.connect(input, i)
      input.connect(air).connect(panner).connect(dest)
      panner.connect(send).connect(this.reverb)
      this.buses.push({ input, panner, air, send, key: i === 0 ? 'centre' : null })
    }
    this.setRoom(0.5)
  }

  /** The output an instrument group plays through (taken on first use; the centre if all are taken). */
  busFor(key: string): number {
    const have = this.byKey.get(key)
    if (have !== undefined) return have
    const free = this.buses.findIndex((b, i) => i > 0 && b.key === null)
    const i = free > 0 ? free : 0
    if (i > 0) { this.buses[i].key = key; this.byKey.set(key, i) }
    return i
  }

  setMode(m: StageMode): void {
    for (const b of this.buses) b.panner.panningModel = m === 'headphones' ? 'HRTF' : 'equalpower'
  }

  /** where a group sits: up to 5 m to the side, 1.5–8 m away */
  place(key: string, p: Spot): void {
    const b = this.buses[this.busFor(key)]
    const t = this.ctx.currentTime
    const x = Math.max(-1, Math.min(1, p.x)) * 5
    const z = -(1.5 + Math.max(0, Math.min(1, p.y)) * 6.5)
    b.panner.positionX.setTargetAtTime(x, t, 0.05)
    b.panner.positionZ.setTargetAtTime(z, t, 0.05)
    b.air.frequency.setTargetAtTime(19000 - p.y * 9000, t, 0.05)  // far away sounds a little darker
    b.send.gain.setTargetAtTime(0.25 + p.y * 0.75, t, 0.05)        // and has more of the room
  }

  /** 0 dry and close .. 1 a big hall */
  setRoom(room: number): void {
    this.room = room
    this.reverb.buffer = hall(this.ctx, 0.8 + room * 2.8)
    this.wet.gain.value = 0.08 + room * 0.42
  }
  get roomSize(): number { return this.room }

  /** the melody stands out: +db/3 for it, -2db/3 for everything else */
  setSpotlight(key: string | null, db: number): void {
    this.spotKey = key
    this.spotDb = db
    this.applyGains()
  }
  /** the mix: a group's own level in dB */
  setLevel(key: string, db: number): void { this.levels.set(key, db); this.applyGains() }
  private applyGains(): void {
    const t = this.ctx.currentTime
    const key = this.spotKey, db = this.spotDb
    this.buses.forEach((b) => {
      const g = (!key || !db ? 0 : b.key === key ? db / 3 : -(2 * db) / 3) + (b.key ? this.levels.get(b.key) ?? 0 : 0)
      b.input.gain.setTargetAtTime(10 ** (g / 20), t, 0.03)
    })
  }
  refreshSpotlight(): void { this.setSpotlight(this.spotKey, this.spotDb) }
}

/** A synthetic hall: early reflections and a smooth decaying tail, slightly different left and right. */
function hall(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.floor(seconds * sr)
  const buf = ctx.createBuffer(2, n, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let seed = ch ? 7919 : 104729
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1 }
    let lp = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      lp += 0.35 * (rnd() - lp) // softer, warmer noise
      d[i] = lp * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.012)
    }
    for (const [ms, g] of [[11, 0.5], [19, 0.35], [27, 0.3], [41, 0.22], [53, 0.18]] as const) {
      const at = Math.floor(((ms + ch * 3) / 1000) * sr)
      if (at < n) d[at] += g * (ch ? -1 : 1)
    }
  }
  return buf
}
