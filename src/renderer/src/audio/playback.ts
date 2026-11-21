/**
 * Plays the song in time with the clock: either the current section looping, or the whole arrangement
 * from start to end with its transitions (build, hit, drop, fade).
 */
/** what playback needs from the engine (the live sampler, or the offline renderer) */
export interface Player {
  noteOn(id: string, midi: number, dyn: number, legato?: boolean, time?: number): void
  noteOff(id: string, midi: number, time?: number): void
  setPackDyn(id: string, value: number | null, time?: number): void
  setSustain(on: boolean, time?: number): void
  setPackVol(id: string, vol: number, time?: number): void
  isLoaded(id: string): boolean
  pin(ids: string[], group?: string): void
}
import { currentSection, segments, tightened, type Ev, type Layer, type Segment, type Song } from '../music/song'

interface Ready { layer: Layer; buckets: Map<number, Ev[]> }
export type PlayMode = 'loop' | 'song'

/** percussion used by the transitions */
export const FX_PACKS = ['crash', 'snare', 'bass-drum', 'timpani']

export class Playback {
  private ready = new Map<number, Ready[]>() // section id -> what plays
  private held = new Set<string>()
  private song: Song | null = null
  private segs: Segment[] = []
  private bowPacks = new Set<string>()
  private sentVol = new Map<string, number>()
  silenced = new Set<number>() // layers not to play (the one you are recording a new take for)
  mode: PlayMode = 'loop'
  barSteps = 8
  onEnd: (time: number) => void = () => undefined

  constructor(private sampler: Player) {}

  set(song: Song): void {
    this.song = song
    this.ready.clear()
    for (const sec of song.sections) {
      const solo = sec.layers.some((l) => l.solo)
      this.ready.set(sec.id, sec.layers
        .filter((l) => !l.mute && (!solo || l.solo) && l.takes[l.active])
        .map((layer) => {
          const buckets = new Map<number, Ev[]>()
          for (const e of tightened(layer.takes[layer.active].events, layer.tighten)) {
            const b = Math.floor(e.s)
            buckets.set(b, [...(buckets.get(b) ?? []), e])
          }
          return { layer, buckets }
        }))
    }
    this.segs = segments(song)
    this.restoreVolumes()
    this.sampler.pin([...new Set(song.sections.flatMap((s) => s.layers.map((l) => l.pack)))])
  }

  get length(): number { const l = this.segs[this.segs.length - 1]; return l ? l.start + l.len : 0 }

  /** where step k falls in the arrangement */
  segmentAt(k: number): Segment | null { return this.segs.find((s) => k >= s.start && k < s.start + s.len) ?? null }

  /** loudness of everything at step k because of a transition: 0 silent .. 1 normal */
  factorAt(k: number): number {
    if (this.mode !== 'song') return 1
    const seg = this.segmentAt(k)
    if (!seg) return 1
    const i = this.segs.indexOf(seg)
    const next = this.segs[i + 1]
    const bar = this.barSteps
    if (seg.placement.enter === 'fade' && k - seg.start < 2 * bar) return Math.max(0.05, (k - seg.start) / (2 * bar))
    if (next) {
      const toNext = next.start - k
      if (next.placement.enter === 'drop' && toNext <= bar / 2) return 0
      if (next.placement.enter === 'build' && toNext <= 2 * bar) return 0.7 + 0.3 * (1 - toNext / (2 * bar))
    }
    return 1
  }

  /** called by the clock for each step it schedules (k counts from bar 1) */
  step(k: number, time: number, dur: number): void {
    const song = this.song
    if (!song) return
    if (this.mode === 'loop') {
      const sec = currentSection(song)
      if (sec.steps <= 0) return
      const pos = k % sec.steps
      if (pos === 0 && k > 0) this.releaseHeld(time - 0.002)
      this.play(sec.id, pos, time, dur, [])
      return
    }
    const seg = this.segmentAt(k)
    if (!seg) {
      if (k === this.length && k > 0) { this.releaseHeld(time); this.onEnd(time) }
      return
    }
    const local = (k - seg.start) % seg.section.steps
    if (local === 0 && k > 0) this.releaseHeld(time - 0.002)
    if (k === seg.start) this.arrive(seg, time)
    const f = this.factorAt(k)
    for (const l of seg.section.layers) this.volume(l.pack, l.volume * f, time)
    const i = this.segs.indexOf(seg)
    const next = this.segs[i + 1]
    if (next?.placement.enter === 'build') { // a snare roll growing through the last bar
      const toNext = next.start - k
      if (toNext <= this.barSteps) {
        const g = 1 - toNext / this.barSteps
        for (let sub = 0; sub < 2; sub++) this.fx('snare', 0.25 + 0.7 * g, time + (sub * dur) / 2)
      }
    }
    this.play(seg.section.id, local, time, dur, seg.placement.muted)
  }

  /** the first beat of a placement: cymbals and drums for a hit, a gentle crash after a build */
  private arrive(seg: Segment, time: number): void {
    const e = seg.placement.enter
    if (e === 'hit') { this.fx('crash', 0.95, time); this.fx('bass-drum', 1, time); this.fx('timpani', 0.9, time) }
    if (e === 'build') { this.fx('crash', 0.85, time); this.fx('bass-drum', 0.9, time) }
    if (e === 'drop') this.fx('bass-drum', 0.95, time)
  }

  private fx(pack: string, dyn: number, time: number): void {
    if (this.sampler.isLoaded(pack)) this.sampler.noteOn(pack, pack === 'timpani' ? 38 : 60, dyn, false, time)
  }

  private play(section: number, pos: number, time: number, dur: number, muted: number[]): void {
    for (const r of this.ready.get(section) ?? []) {
      if (this.silenced.has(r.layer.id) || muted.includes(r.layer.id) || !this.sampler.isLoaded(r.layer.pack)) continue
      const { pack, role, level } = r.layer
      if (pos === 0 && role === 'chords') this.sampler.setPackDyn(pack, level, time)
      for (const e of r.buckets.get(pos) ?? []) {
        const t = time + (e.s - pos) * dur
        const key = `${pack}|${'n' in e ? e.n : ''}`
        if (e.k === 'on') { this.sampler.noteOn(pack, e.n, e.d, e.lg, t); this.held.add(key) }
        else if (e.k === 'off') { this.sampler.noteOff(pack, e.n, t); this.held.delete(key) }
        else if (e.k === 'dyn' && role === 'melody') { this.sampler.setPackDyn(pack, e.v, t); this.bowPacks.add(pack) }
        else if (e.k === 'sus') this.sampler.setSustain(e.on, t)
      }
    }
  }

  private volume(pack: string, v: number, time: number): void {
    const last = this.sentVol.get(pack)
    if (last !== undefined && Math.abs(last - v) < 0.005) return
    this.sentVol.set(pack, v)
    this.sampler.setPackVol(pack, v, time)
  }

  private restoreVolumes(): void {
    this.sentVol.clear()
    for (const sec of this.song?.sections ?? []) for (const l of sec.layers) this.sampler.setPackVol(l.pack, l.volume)
  }

  /** stop every note playback started (now, or at an audio-clock time) and give the bow back */
  stop(time?: number): void {
    this.releaseHeld(time)
    for (const p of this.bowPacks) this.sampler.setPackDyn(p, null, time)
    this.bowPacks.clear()
    this.sampler.setSustain(false, time)
    if (time === undefined) this.restoreVolumes()
  }

  private releaseHeld(time?: number): void {
    for (const key of this.held) {
      const [pack, n] = key.split('|')
      this.sampler.noteOff(pack, Number(n), time)
    }
    this.held.clear()
  }
}
