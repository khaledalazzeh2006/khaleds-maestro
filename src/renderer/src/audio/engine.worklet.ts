/**
 * Maestro playing engine (runs on the audio thread).
 *
 * - Sustained instruments: every loudness layer near the note runs together and the bow (dyn) crossfades
 *   between them inside the held note, so a crescendo changes the tone, not just the volume.
 * - Seamless loops: equal-power crossfade inside the sustain, so a note can be held forever.
 * - Legato: a new note while one is held starts past its attack and the old one fades under it.
 * - Recordings are kept as 16-bit (half the memory of float), read with cubic interpolation.
 * - Every message may carry a time (AudioContext seconds) so playback can be sample accurate later.
 */

declare const sampleRate: number
declare const currentTime: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
}
declare function registerProcessor(name: string, ctor: unknown): void

type Kind = 'sus' | 'shot' | 'piano' | 'perc'

interface Region {
  root: number; layer: number; rr: number; tune: number; gain: number; rms: number
  L: Int16Array; R: Int16Array; len: number
  loopStart: number; loopEnd: number; xf: number // in frames; loopEnd 0 = no loop
}
interface Pack {
  kind: Kind; layers: number; release: number; legatoSkip: number; pitchRoot: number | null; dynRange: number
  byLayer: Map<number, Region[]>; rr: Map<string, number>
  dynTarget: number | null; dynCur: number // a fixed level instead of the bow (e.g. the chord instrument)
  vol: number; volCur: number
  bus: number // which output (stage position) this instrument plays through
}
interface Stream { region: Region; pos: number; rate: number; w: number; target: number; ended: boolean }
interface Voice {
  id: number; pack: Pack; note: number; held: boolean; pedal: boolean
  streams: Stream[]; slots: (Region | null)[] // per available layer (sus) or one (others)
  env: number; relCoef: number; releasing: boolean
  fade: number; fadeStep: number // fade-in 0..1
  strikeDyn: number; strikeGain: number; gain: number; age: number; done: boolean
}

type Msg =
  | { type: 'region'; pack: string; region: Omit<Region, 'L' | 'R'> & { L: Int16Array; R: Int16Array } }
  | { type: 'pack'; pack: string; kind: Kind; layers: number; release: number; legatoSkip: number; pitchRoot: number | null; dynRange: number }
  | { type: 'drop'; pack: string }
  | { type: 'on'; pack: string; note: number; dyn: number; legato?: boolean; time?: number }
  | { type: 'off'; pack: string; note: number; time?: number }
  | { type: 'packdyn'; pack: string; value: number | null; time?: number }
  | { type: 'packvol'; pack: string; value: number; time?: number }
  | { type: 'bus'; pack: string; bus: number }
  | { type: 'dyn'; value: number; time?: number }
  | { type: 'sustain'; on: boolean; time?: number }
  | { type: 'legato'; on: boolean }
  | { type: 'alloff'; time?: number }
  | { type: 'ping'; id: number }

const MAX_VOICES = 48
const NEAR_LAYER = 4 // a layer whose nearest recording is further than this does not join the note
const NEAR = 3

class Engine extends AudioWorkletProcessor {
  private packs = new Map<string, Pack>()
  private voices: Voice[] = []
  private queue: Msg[] = []
  private dynTarget = 0.58
  private dyn = 0.58
  private sustain = false
  private legato = true
  private nextId = 1
  private still = 0 // frames the bow has not moved
  private lastTarget = 0.58
  private blockDynCoef = 1 - Math.exp(-128 / (0.035 * sampleRate))

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<Msg>) => this.receive(e.data)
  }

  private receive(m: Msg): void {
    switch (m.type) {
      case 'pack':
        this.packs.set(m.pack, { kind: m.kind, layers: m.layers, release: m.release, legatoSkip: m.legatoSkip, pitchRoot: m.pitchRoot,
          dynRange: m.dynRange, byLayer: new Map(), rr: new Map(), dynTarget: null, dynCur: 0.58, vol: 1, volCur: 1, bus: 0 })
        return
      case 'region': {
        const p = this.packs.get(m.pack)
        if (!p) return
        const r = m.region as Region
        p.byLayer.set(r.layer, [...(p.byLayer.get(r.layer) ?? []), r])
        return
      }
      case 'drop':
        this.voices = this.voices.filter((v) => v.pack !== this.packs.get(m.pack))
        this.packs.delete(m.pack)
        return
      case 'legato':
        this.legato = m.on
        return
      case 'bus': {
        const p = this.packs.get(m.pack)
        if (p) p.bus = m.bus
        return
      }

      case 'ping':
        this.port.postMessage({ type: 'pong', id: m.id })
        return
      default:
        if ('time' in m && m.time !== undefined && m.time > currentTime) {
          // keep the queue in time order (binary insert: a whole song can be thousands of events)
          const t = m.time
          let lo = 0, hi = this.queue.length
          while (lo < hi) { const mid = (lo + hi) >> 1; if (((this.queue[mid] as { time?: number }).time ?? 0) <= t) lo = mid + 1; else hi = mid }
          this.queue.splice(lo, 0, m)
        } else this.apply(m)
    }
  }

  private apply(m: Msg): void {
    switch (m.type) {
      case 'on': this.noteOn(m.pack, m.note, m.dyn, m.legato ?? this.legato); break
      case 'off': this.noteOff(m.pack, m.note); break
      case 'packvol': { const p = this.packs.get(m.pack); if (p) p.vol = Math.max(0, m.value); break }
      case 'packdyn': {
        const p = this.packs.get(m.pack)
        if (p) { if (p.dynTarget === null && m.value !== null) p.dynCur = m.value; p.dynTarget = m.value === null ? null : Math.min(1, Math.max(0, m.value)) }
        break
      }
      case 'dyn': this.dynTarget = Math.min(1, Math.max(0, m.value)); break
      case 'sustain':
        this.sustain = m.on
        if (!m.on) for (const v of this.voices) if (v.pedal && !v.held) this.release(v, v.pack.release)
        break
      case 'alloff': for (const v of this.voices) { v.held = false; v.pedal = false; this.release(v, 0.05) } this.sustain = false; break
    }
  }

  // ------------------------------------------------------------------ notes

  private nearest(p: Pack, layer: number, note: number): Region[] | null {
    const regs = p.byLayer.get(layer)
    if (!regs?.length) return null
    let best = regs[0].root
    for (const r of regs) {
      const a = Math.abs(r.root - note), b = Math.abs(best - note)
      if (a < b || (a === b && r.root > best)) best = r.root
    }
    return regs.filter((r) => r.root === best)
  }

  private take(p: Pack, takes: Region[]): Region {
    const key = `${takes[0].root}:${takes[0].layer}`
    const i = p.rr.get(key) ?? 0
    p.rr.set(key, i + 1)
    return takes[i % takes.length]
  }

  private rateFor(p: Pack, r: Region, note: number): number {
    const semis = p.kind === 'perc' ? (p.pitchRoot != null ? note - p.pitchRoot : 0) : note - r.root
    return 2 ** (semis / 12) * 2 ** (-r.tune / 1200)
  }

  private noteOn(packId: string, note: number, dyn: number, legato: boolean): void {
    const p = this.packs.get(packId)
    if (!p) return
    const d = Math.min(1, Math.max(0, dyn))
    for (const v of this.voices) if (v.note === note && v.pack === p && !v.releasing) this.release(v, 0.03)

    let legatoFrom: Voice | null = null
    if (p.kind === 'sus' && legato) {
      const held = this.voices.filter((v) => v.pack === p && v.held && !v.releasing)
      if (held.length === 1 && held[0].age > 0.06 * sampleRate) legatoFrom = held[0]
    }

    const v: Voice = { id: this.nextId++, pack: p, note, held: true, pedal: false, streams: [], slots: [], env: 1, relCoef: 1,
      releasing: false, fade: 0, fadeStep: 1, strikeDyn: d, strikeGain: 1, gain: 0, age: 0, done: false }

    if (p.kind === 'sus') {
      for (let l = 1; l <= p.layers; l++) {
        const takes = this.nearest(p, l, note)
        v.slots.push(takes && Math.abs(takes[0].root - note) <= NEAR_LAYER ? this.take(p, takes) : null)
      }
      if (!v.slots.some((s) => s !== null)) { // no layer close enough: use the closest recording anywhere
        let best: Region[] | null = null
        for (let l = 1; l <= p.layers; l++) {
          const t = this.nearest(p, l, note)
          if (t && (!best || Math.abs(t[0].root - note) < Math.abs(best[0].root - note))) best = t
        }
        if (best) v.slots[best[0].layer - 1] = this.take(p, best)
      }
      const skip = legatoFrom ? p.legatoSkip * sampleRate : 0
      for (const r of v.slots) {
        if (!r) continue
        const rate = this.rateFor(p, r, note)
        v.streams.push({ region: r, pos: Math.min(skip, r.len * 0.3), rate, w: 0, target: 0, ended: false })
      }
      const fadeSec = legatoFrom ? 0.06 : 0.003
      v.fadeStep = 1 / (fadeSec * sampleRate)
      const pd = this.packDyn(p)
      v.gain = this.gainFor(p, pd) * p.volCur
      this.setWeights(v, pd, true, p.dynTarget !== null || this.still > 0.3 * sampleRate)
      if (legatoFrom) this.release(legatoFrom, 0.1)
    } else {
      let layer = 1 + Math.round(d * (p.layers - 1))
      let takes = this.nearest(p, layer, note)
      if (p.kind !== 'perc' && (!takes || Math.abs(takes[0].root - note) > NEAR)) {
        for (let step = 1; step < p.layers; step++) {
          for (const l of [layer - step, layer + step]) {
            const t = this.nearest(p, l, note)
            if (t && (!takes || Math.abs(t[0].root - note) + 1 < Math.abs(takes[0].root - note))) { takes = t; layer = l }
          }
          if (takes && Math.abs(takes[0].root - note) <= NEAR) break
        }
      }
      if (!takes) return
      const r = this.take(p, takes)
      v.streams.push({ region: r, pos: 0, rate: this.rateFor(p, r, note), w: 1, target: 1, ended: false })
      v.fade = 1
      v.strikeGain = this.gainFor(p, d)
      v.gain = v.strikeGain * p.volCur
    }
    this.voices.push(v)
    this.limit()
  }

  private noteOff(packId: string, note: number): void {
    const p = this.packs.get(packId)
    for (const v of this.voices) {
      if (v.note !== note || v.pack !== p || !v.held) continue
      v.held = false
      if (v.pack.kind === 'shot' || v.pack.kind === 'perc') continue // plucked and struck notes ring out
      if (this.sustain) v.pedal = true
      else this.release(v, v.pack.release)
    }
  }

  private release(v: Voice, seconds: number): void {
    if (v.releasing && v.relCoef < Math.exp(-1 / (Math.max(0.005, seconds) / 3 * sampleRate))) return
    v.releasing = true
    v.relCoef = Math.exp(-1 / (Math.max(0.005, seconds) / 3 * sampleRate)) // falls 60 dB in about 'seconds'
  }

  private limit(): void {
    const live = this.voices.filter((v) => !v.done)
    if (live.length <= MAX_VOICES) return
    const order = [...live].sort((a, b) => Number(b.releasing) - Number(a.releasing) || b.age - a.age)
    for (const v of order.slice(0, live.length - MAX_VOICES)) this.release(v, 0.01)
  }

  private packDyn(p: Pack): number { return p.dynTarget === null ? this.dyn : p.dynCur }

  private gainFor(p: Pack, d: number): number {
    return 10 ** (((d - 1) * p.dynRange) / 20)
  }

  /** Spread the bow position over the layers this note really has, equal-power between neighbours. */
  private setWeights(v: Voice, d: number, snap: boolean, settled = false): void {
    const avail = v.streams
    const n = avail.length
    if (n === 1) { avail[0].target = 1; if (snap) avail[0].w = 1; return }
    const x = d * (n - 1)
    const i = Math.min(n - 2, Math.floor(x))
    // Two different recordings sounding together at equal strength can beat against each other
    // (clear tones like clarinet), so the handover happens in the middle 40% between two layers only.
    const t = Math.min(1, Math.max(0, (x - i - 0.5) / 0.4 + 0.5))
    avail.forEach((s, k) => {
      s.target = k === i ? Math.cos((t * Math.PI) / 2) : k === i + 1 ? Math.sin((t * Math.PI) / 2) : 0
      if (snap) s.w = s.target
    })
    // Bow at rest: two recordings held together can beat against each other, so let the stronger one
    // take over alone, at the same loudness the pair had.
    if (settled && avail.every((s) => s.region.rms > 0)) {
      let k = 0
      avail.forEach((s, j) => { if (s.target > avail[k].target) k = j })
      let p2 = 0
      for (const s of avail) p2 += (s.target * s.region.rms * s.region.gain) ** 2
      const lone = Math.sqrt(p2) / (avail[k].region.rms * avail[k].region.gain)
      avail.forEach((s, j) => { s.target = j === k ? Math.min(2, Math.max(0.5, lone)) : 0 })
    }
  }

  // ------------------------------------------------------------------ audio

  process(_in: Float32Array[][], outputs: Float32Array[][]): boolean {
    for (const o of outputs) for (const ch of o) ch.fill(0)
    const N = outputs[0][0].length

    while (this.queue.length && ((this.queue[0] as { time?: number }).time ?? 0) <= currentTime + N / sampleRate / 2) {
      this.apply(this.queue.shift()!)
    }
    this.dyn += (this.dynTarget - this.dyn) * this.blockDynCoef
    if (Math.abs(this.dynTarget - this.lastTarget) < 1e-4 && Math.abs(this.dynTarget - this.dyn) < 0.003) this.still += N
    else this.still = 0
    this.lastTarget = this.dynTarget
    const settled = this.still > 0.3 * sampleRate
    for (const p of this.packs.values()) {
      if (p.dynTarget !== null) p.dynCur += (p.dynTarget - p.dynCur) * this.blockDynCoef
      p.volCur += (p.vol - p.volCur) * this.blockDynCoef
    }

    for (const v of this.voices) {
      if (v.done) continue
      const p = v.pack
      const out = outputs[p.bus] ?? outputs[0]
      const oL = out[0], oR = out[1] ?? out[0]
      const sus = p.kind === 'sus'
      const pd = this.packDyn(p)
      const pSettled = p.dynTarget !== null ? Math.abs(p.dynTarget - p.dynCur) < 0.003 : settled
      const wCoef = 1 - Math.exp(-N / ((pSettled ? 0.3 : 0.02) * sampleRate))
      const g0 = v.gain
      const g1 = (sus ? this.gainFor(p, pd) : v.strikeGain) * p.volCur
      if (sus) this.setWeights(v, pd, false, pSettled)
      let alive = false
      for (const s of v.streams) {
        if (s.ended) continue
        const w0 = s.w, w1 = sus ? s.w + (s.target - s.w) * wCoef : s.target
        if (w0 < 1e-4 && w1 < 1e-4 && s.target < 1e-4) { s.w = w1; this.advance(s, N); alive = alive || !s.ended; continue }
        const r = s.region
        const L = r.L, R = r.R
        const loop = r.loopEnd > 0
        const loopLen = r.loopEnd - r.loopStart
        let pos = s.pos
        let env = v.env, fade = v.fade
        for (let n = 0; n < N; n++) {
          const k = n / N
          const amp = (w0 + (w1 - w0) * k) * (g0 + (g1 - g0) * k) * r.gain * env * fade / 32768
          let a: number, b: number
          if (loop && pos >= r.loopEnd - r.xf) {
            if (pos >= r.loopEnd) pos -= loopLen
          }
          if (loop && pos >= r.loopEnd - r.xf && r.xf > 0) {
            const t = (pos - (r.loopEnd - r.xf)) / r.xf
            const fo = Math.cos((t * Math.PI) / 2), fi = Math.sin((t * Math.PI) / 2)
            a = cubic(L, pos) * fo + cubic(L, pos - loopLen) * fi
            b = cubic(R, pos) * fo + cubic(R, pos - loopLen) * fi
          } else {
            if (pos >= r.len - 3) { s.ended = true; break }
            a = cubic(L, pos)
            b = cubic(R, pos)
          }
          oL[n] += a * amp
          oR[n] += b * amp
          pos += s.rate
          if (v.releasing) env *= v.relCoef
          if (fade < 1) fade = Math.min(1, fade + v.fadeStep)
        }
        s.pos = pos
        s.w = w1
        alive = alive || !s.ended
      }
      // envelope state advances once per voice (streams share it)
      if (v.releasing) v.env *= v.relCoef ** N
      if (v.fade < 1) v.fade = Math.min(1, v.fade + v.fadeStep * N)
      v.gain = g1
      v.age += N
      if (!alive || v.env < 1e-4) v.done = true
    }
    if (this.voices.some((v) => v.done)) this.voices = this.voices.filter((v) => !v.done)
    return true
  }

  /** keep a silent layer moving in time so it is ready when the bow brings it in */
  private advance(s: Stream, N: number): void {
    const r = s.region
    s.pos += s.rate * N
    if (r.loopEnd > 0) { while (s.pos >= r.loopEnd) s.pos -= r.loopEnd - r.loopStart }
    else if (s.pos >= r.len - 3) s.ended = true
  }
}

/** 4-point Hermite interpolation on 16-bit samples */
function cubic(x: Int16Array, pos: number): number {
  const i = pos | 0
  const f = pos - i
  const xm1 = x[i - 1] ?? x[i], x0 = x[i], x1 = x[i + 1] ?? x0, x2 = x[i + 2] ?? x1
  const c1 = 0.5 * (x1 - xm1)
  const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2
  const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1)
  return ((c3 * f + c2) * f + c1) * f + x0
}

registerProcessor('maestro-engine', Engine)
