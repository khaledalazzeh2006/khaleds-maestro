/**
 * The clock: tempo, meter (eighth-note steps in groups, e.g. 7/8 = 2+2+3) and the metronome.
 * Clicks are scheduled ahead on the audio clock ("a tale of two clocks"), so they stay exact even when
 * the screen is busy; the screen is told which step is sounding through onStep.
 */

export interface Meter { sig: string; groups: number[] }
export const METERS: Meter[] = [
  { sig: '4/4', groups: [2, 2, 2, 2] },
  { sig: '3/4', groups: [2, 2, 2] },
  { sig: '6/8', groups: [3, 3] },
  { sig: '5/8', groups: [3, 2] },
  { sig: '7/8', groups: [2, 2, 3] },
  { sig: '7/8', groups: [3, 2, 2] },
  { sig: '9/8', groups: [2, 2, 2, 3] },
  { sig: '10/8', groups: [3, 3, 2, 2] },
  { sig: '11/8', groups: [2, 2, 3, 2, 2] },
  { sig: '12/8', groups: [3, 3, 3, 3] }
]

export type ClickMode = 'all' | 'groups'
export interface StepInfo { bar: number; step: number; countIn: boolean } // bar < 0 while counting in

const LOOKAHEAD = 0.12 // seconds scheduled ahead
const TICK = 25 // ms between scheduler runs

export class Transport {
  private out: GainNode
  private timer: number | null = null
  private nextTime = 0
  private stepIdx = 0
  private bar = 0
  private queue: { time: number; info: StepInfo }[] = []
  private abs = 0 // steps since the start of bar 1 (count-in not included)
  private history: { k: number; time: number }[] = []
  private raf = 0
  running = false
  tempo = 120
  meter: Meter = METERS[4]
  clickMode: ClickMode = 'all'
  countIn = true
  onStep: (s: StepInfo | null) => void = () => undefined
  /** called for every step as it is scheduled (k counts from bar 1), so recorded layers can be played in time */
  onSchedule: (k: number, time: number, stepDur: number) => void = () => undefined

  constructor(private ctx: AudioContext) {
    this.out = ctx.createGain()
    this.out.gain.value = 0.5
    this.out.connect(ctx.destination)
  }

  get steps(): number { return this.meter.groups.reduce((a, b) => a + b, 0) }
  /** seconds per eighth-note step; tempo is quarter notes per minute */
  get stepDur(): number { return 60 / this.tempo / 2 }
  set volume(v: number) { this.out.gain.value = v }
  /** when true the clicks are silent but the clock still runs (playing back without the metronome) */
  set silent(v: boolean) { this.mute = v }
  private mute = false

  /** Song position (in steps from bar 1) of an audio-clock time; negative during the count-in. */
  positionAt(time: number): number {
    const h = this.history
    if (!h.length) return -1
    let e = h[0]
    for (const x of h) { if (x.time <= time) e = x; else break }
    return e.k + (time - e.time) / this.stepDur
  }

  /** the audio-clock time of the first beat of bar 1 (after the count-in) */
  get firstBeat(): number | null { return this.history.length && this.history[0].k === 0 ? this.history[0].time : null }

  /** step index -> 2 bar start, 1 group start, 0 other */
  accent(step: number): 0 | 1 | 2 {
    if (step === 0) return 2
    let acc = 0
    for (const g of this.meter.groups) { acc += g; if (acc === step) return 1 }
    return 0
  }

  start(): void {
    if (this.running) return
    if (this.ctx.state !== 'running') void this.ctx.resume()
    this.running = true
    this.stepIdx = 0
    this.bar = this.countIn ? -1 : 0
    this.abs = 0
    this.history = []
    this.nextTime = this.ctx.currentTime + 0.08
    this.timer = window.setInterval(() => this.schedule(), TICK)
    this.schedule()
    const frame = (): void => {
      const now = this.ctx.currentTime
      let shown: StepInfo | null = null
      while (this.queue.length && this.queue[0].time <= now) shown = this.queue.shift()!.info
      if (shown) this.onStep(shown)
      if (this.running) this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  stop(): void {
    this.running = false
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    cancelAnimationFrame(this.raf)
    this.queue = []
    this.onStep(null)
  }

  private schedule(): void {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const info: StepInfo = { bar: this.bar, step: this.stepIdx, countIn: this.bar < 0 }
      const acc = this.accent(this.stepIdx)
      if (!this.mute || info.countIn) if (this.clickMode === 'all' || acc > 0 || info.countIn) this.click(this.nextTime, acc, info.countIn)
      if (!info.countIn) {
        this.history.push({ k: this.abs, time: this.nextTime })
        if (this.history.length > 256) this.history.shift()
        this.onSchedule(this.abs, this.nextTime, this.stepDur)
        this.abs++
      }
      this.queue.push({ time: this.nextTime, info })
      this.nextTime += this.stepDur
      this.stepIdx++
      if (this.stepIdx >= this.steps) { this.stepIdx = 0; this.bar++ }
    }
  }

  /** a short wooden tick; higher and louder on the bar and on each group */
  private click(t: number, acc: 0 | 1 | 2, countIn: boolean): void {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = acc === 2 ? 1760 : acc === 1 ? 1320 : 990
    const peak = (acc === 2 ? 0.9 : acc === 1 ? 0.6 : 0.32) * (countIn ? 1 : 0.85)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0008, t + (acc === 2 ? 0.09 : 0.05))
    osc.connect(g).connect(this.out)
    osc.start(t)
    osc.stop(t + 0.12)
  }
}

/** Tempo from taps: average of the last few intervals, ignored after a pause. */
export class TapTempo {
  private taps: number[] = []
  tap(now = performance.now()): number | null {
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2000) this.taps = []
    this.taps = [...this.taps, now].slice(-6)
    if (this.taps.length < 3) return null
    const gaps = this.taps.slice(1).map((t, i) => t - this.taps[i])
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
    return Math.round(60000 / avg) // each tap is a quarter note
  }
}
