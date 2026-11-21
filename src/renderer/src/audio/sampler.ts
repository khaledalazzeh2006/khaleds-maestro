/**
 * Main-thread side of the playing engine: loads packs, hands the recordings to the audio thread as
 * 16-bit audio, and sends notes, the bow, the sustain pedal and legato to it.
 */
import workletUrl from './engine.worklet.ts?worker&url'
import { Stage } from './stage'

export type Kind = 'sus' | 'shot' | 'piano' | 'perc'
export interface Loop { start: number; end: number; xfade: number; quality: number }
export interface Region { root: number; layer: number; rr: number; file: string; tune: number; gain: number; length: number; rms?: number; loop?: Loop }
export interface Manifest {
  id: string; name: string; family: string; kind: Kind; layers: number; credit: string
  release?: number; legatoSkip?: number; pitchRoot?: number | null; level?: number; regions: Region[]
}
export interface PackInfo { id: string; name: string; family: string; kind: Kind }

const BASE = 'media://local/'
/** extra loudness range the bow adds on top of the recorded layers, in dB */
const DYN_RANGE: Record<Kind, number> = { sus: 12, shot: 14, piano: 12, perc: 20 }

export async function fetchLibrary(): Promise<PackInfo[]> {
  const res = await fetch(`${BASE}library.json`)
  if (!res.ok) throw new Error('The sound library was not found in resources/samples.')
  return ((await res.json()) as { packs: PackInfo[] }).packs
}

/** Shared by the live engine and the offline self-test. */
export async function loadPack(ctx: BaseAudioContext, node: AudioWorkletNode, id: string,
  onProgress: (done: number, total: number) => void, cancelled: () => boolean = () => false): Promise<Manifest> {
  const res = await fetch(`${BASE}${id}/manifest.json`)
  if (!res.ok) throw new Error(`The sound pack "${id}" was not found in resources/samples.`)
  const m = (await res.json()) as Manifest
  node.port.postMessage({ type: 'pack', pack: id, kind: m.kind, layers: m.layers, release: m.release ?? 0.3,
    legatoSkip: m.legatoSkip ?? 0, pitchRoot: m.pitchRoot ?? null, dynRange: DYN_RANGE[m.kind] })
  let done = 0
  const queue = [...m.regions]
  const worker = async (): Promise<void> => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      if (cancelled()) return
      const data = await (await fetch(`${BASE}${id}/${r.file}`)).arrayBuffer()
      const buf = await ctx.decodeAudioData(data)
      const sr = buf.sampleRate
      const L = toInt16(buf.getChannelData(0))
      const R = buf.numberOfChannels > 1 ? toInt16(buf.getChannelData(1)) : L.slice()
      let loopStart = 0, loopEnd = 0, xf = 0
      if (r.loop) {
        loopStart = Math.round(r.loop.start * sr)
        loopEnd = Math.min(L.length - 4, Math.round(r.loop.end * sr))
        xf = Math.min(Math.round(r.loop.xfade * sr), loopStart, Math.floor((loopEnd - loopStart) / 2))
        if (loopEnd - loopStart < sr) loopEnd = 0
      }
      node.port.postMessage({ type: 'region', pack: id, region: { root: r.root, layer: r.layer, rr: r.rr, tune: r.tune, gain: r.gain * (m.level ?? 1), rms: r.rms ?? 0,
        L, R, len: L.length, loopStart, loopEnd, xf } }, [L.buffer, R.buffer])
      onProgress(++done, m.regions.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return m
}

function toInt16(x: Float32Array): Int16Array {
  const y = new Int16Array(x.length)
  for (let i = 0; i < x.length; i++) {
    const v = x[i] * 32767
    y[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : Math.round(v)
  }
  return y
}

/** outputs of the engine: one per stage position (instrument group); output 0 is the centre */
export const BUSES = 12

export async function createEngineNode(ctx: BaseAudioContext): Promise<AudioWorkletNode> {
  await ctx.audioWorklet.addModule(workletUrl)
  return new AudioWorkletNode(ctx, 'maestro-engine', { numberOfInputs: 0, numberOfOutputs: BUSES, outputChannelCount: new Array(BUSES).fill(2) })
}

/** Resolves once the audio thread has handled every message sent before it. */
export function settle(node: AudioWorkletNode): Promise<void> {
  const id = Math.random()
  return new Promise((resolve) => {
    const on = (e: MessageEvent): void => {
      if (e.data?.type === 'pong' && e.data.id === id) { node.port.removeEventListener('message', on); resolve() }
    }
    node.port.addEventListener('message', on)
    node.port.start()
    node.port.postMessage({ type: 'ping', id })
  })
}

/** Range a pack can really play, or null for unpitched percussion. */
export function packRange(m: Manifest): [number, number] | null {
  if (m.kind === 'perc') return m.pitchRoot != null ? [Math.round(m.pitchRoot) - 6, Math.round(m.pitchRoot) + 7] : null
  const roots = m.regions.map((r) => r.root)
  return [Math.min(...roots) - 2, Math.max(...roots) + 2]
}

const KEEP = 4 // packs kept in memory, so switching back is instant

export class Sampler {
  readonly ctx: AudioContext
  private node: AudioWorkletNode | null = null
  private ready: Promise<void>
  private packs = new Map<string, Manifest>()
  private loading = new Map<string, Promise<Manifest>>()
  private used: string[] = [] // most recent last
  stage: Stage | null = null
  /** which stage group an instrument belongs to (its instrument name; all drums together) */
  groupOf: (id: string, m: Manifest) => string = (_id, m) => (m.family === 'Percussion' ? 'Drums' : m.name.split(' · ')[0])
  onGroup: (group: string) => void = () => undefined
  private pins = new Map<string, string[]>() // packs recorded layers and the drums need: never dropped
  private get pinned(): Set<string> { return new Set([...this.pins.values()].flat()) }

  /** lowest: the smallest buffer the system allows; safe: a bigger buffer if the sound crackles */
  constructor(mode: 'lowest' | 'safe' = 'lowest') {
    this.ctx = new AudioContext({ latencyHint: mode === 'lowest' ? 0 : 'interactive' })
    const out = this.ctx.createGain()
    out.gain.value = 0.7
    const limiter = this.ctx.createDynamicsCompressor() // a safety net for big chords, not a sound
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.1
    out.connect(limiter).connect(this.ctx.destination)
    this.ready = createEngineNode(this.ctx).then((n) => { this.stage = new Stage(this.ctx, n, out); this.node = n })
  }

  manifest(id: string): Manifest | null { return this.packs.get(id) ?? null }
  /** stage groups of every loaded instrument */
  groups(): string[] { return [...new Set([...this.packs.entries()].map(([id, m]) => this.groupOf(id, m)))] }

  /** Loads a pack (or returns it if already loaded). `inUse` are packs that must not be dropped. */
  async load(id: string, onProgress: (done: number, total: number) => void, inUse: string[] = []): Promise<Manifest> {
    this.touch(id)
    const have = this.packs.get(id)
    if (have) { onProgress(1, 1); return have }
    const pending = this.loading.get(id)
    if (pending) return pending
    const job = (async () => {
      await this.ready
      const m = await loadPack(this.ctx, this.node!, id, onProgress)
      this.packs.set(id, m)
      const group = this.groupOf(id, m)
      if (this.stage) this.node!.port.postMessage({ type: 'bus', pack: id, bus: this.stage.busFor(group) })
      this.onGroup(group)
      this.loading.delete(id)
      this.evict([...inUse, id])
      return m
    })()
    this.loading.set(id, job)
    return job
  }

  private touch(id: string): void { this.used = [...this.used.filter((x) => x !== id), id] }

  /** packs that must stay loaded (the instruments of recorded layers) */
  pin(ids: string[], group = 'layers'): void { this.pins.set(group, ids) }

  private evict(keep: string[]): void {
    while (this.packs.size > KEEP + this.pinned.size) {
      const victim = this.used.find((x) => this.packs.has(x) && !keep.includes(x) && !this.pinned.has(x))
      if (!victim) return
      this.packs.delete(victim)
      this.used = this.used.filter((x) => x !== victim)
      this.node?.port.postMessage({ type: 'drop', pack: victim })
    }
  }

  range(id: string): [number, number] | null {
    const m = this.packs.get(id)
    return m ? packRange(m) : null
  }

  canPlay(id: string, midi: number): boolean {
    const m = this.packs.get(id)
    if (!m) return false
    const r = packRange(m)
    return r === null || (midi >= r[0] && midi <= r[1])
  }

  noteOn(id: string, midi: number, dyn: number, legato?: boolean, time?: number): void {
    if (!this.node || !this.canPlay(id, midi)) return
    if (this.ctx.state !== 'running') void this.ctx.resume()
    this.node.port.postMessage({ type: 'on', pack: id, note: midi, dyn, legato, time })
  }

  noteOff(id: string, midi: number, time?: number): void { this.node?.port.postMessage({ type: 'off', pack: id, note: midi, time }) }
  /** loudness of one instrument (1 = as calibrated) */
  setPackVol(id: string, vol: number, time?: number): void { this.node?.port.postMessage({ type: 'packvol', pack: id, value: vol, time }) }
  /** notes the engine is asked to play at a given audio-clock time */
  isLoaded(id: string): boolean { return this.packs.has(id) }
  /** the bow: moves the loudness and tone of every held note that follows it */
  setDyn(dyn: number): void { this.node?.port.postMessage({ type: 'dyn', value: dyn }) }
  /** a fixed level for one instrument (null: follow the bow) */
  setPackDyn(id: string, value: number | null, time?: number): void { this.node?.port.postMessage({ type: 'packdyn', pack: id, value, time }) }
  setSustain(on: boolean, time?: number): void { this.node?.port.postMessage({ type: 'sustain', on, time }) }
  setLegato(on: boolean): void { this.node?.port.postMessage({ type: 'legato', on }) }
  allOff(): void { this.node?.port.postMessage({ type: 'alloff' }) }

  latency(): { base: number; output: number } {
    const c = this.ctx as AudioContext & { outputLatency?: number }
    return { base: c.baseLatency ?? 0, output: c.outputLatency ?? 0 }
  }
}
