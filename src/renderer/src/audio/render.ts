/**
 * Export: plays the piece into an OfflineAudioContext through exactly the same engine, stage, reverb and
 * limiter you hear live, as fast as the computer can, then makes a 24-bit WAV peaking at -1 dBFS.
 */
import { createEngineNode, loadPack, settle, type Manifest } from './sampler'
import { Stage, type Spot, type StageMode } from './stage'
import { FX_PACKS, Playback, type Player } from './playback'
import { scheduleDrums, DRUMS, type DrumState } from '../music/drums'
import { currentSection, segments, type Song } from '../music/song'

export interface RenderOptions {
  song: Song; scope: 'song' | 'section'; times: number
  tempo: number; barSteps: number; drums: DrumState
  mode: StageMode; room: number; spotlight: { group: string | null; db: number }
  spotOf: (group: string) => Spot; levels: Record<string, number>
  groupOf: (id: string, m: Manifest) => string
  onProgress: (label: string, part: number) => void
}

const SR = 48000

export async function renderPiece(o: RenderOptions): Promise<{ wav: ArrayBuffer; seconds: number; peakDb: number }> {
  const stepDur = 60 / o.tempo / 2
  const sec = currentSection(o.song)
  const steps = o.scope === 'song'
    ? segments(o.song).reduce((a, s) => Math.max(a, s.start + s.len), 0)
    : sec.steps * Math.max(1, o.times)
  if (steps <= 0) throw new Error('There is nothing recorded to export yet.')
  const lead = 0.1
  const tail = 4
  const seconds = lead + steps * stepDur + tail
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR)

  const out = ctx.createGain()
  out.gain.value = 0.7
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.1
  out.connect(limiter).connect(ctx.destination)
  const node = await createEngineNode(ctx)
  const stage = new Stage(ctx, node, out)
  stage.setMode(o.mode)
  stage.setRoom(o.room)

  // every instrument the piece needs
  const packs = new Set<string>()
  for (const s of o.scope === 'song' ? o.song.sections : [sec]) for (const l of s.layers) packs.add(l.pack)
  if (o.drums.on) for (const d of DRUMS) packs.add(d.pack)
  if (o.scope === 'song') for (const f of FX_PACKS) packs.add(f)
  const loaded = new Set<string>()
  let i = 0
  for (const id of packs) {
    o.onProgress('Loading instruments', i / packs.size)
    const m = await loadPack(ctx, node, id, () => undefined)
    const g = o.groupOf(id, m)
    node.port.postMessage({ type: 'bus', pack: id, bus: stage.busFor(g) })
    stage.place(g, o.spotOf(g))
    loaded.add(id)
    i++
  }
  for (const [g, db] of Object.entries(o.levels)) stage.setLevel(g, db)
  stage.setSpotlight(o.spotlight.group, o.spotlight.db)

  // the same playback code as live, talking to the offline engine
  const send = (m: object): void => node.port.postMessage(m)
  const player: Player = {
    noteOn: (pack, note, dyn, legato, time) => send({ type: 'on', pack, note, dyn, legato, time }),
    noteOff: (pack, note, time) => send({ type: 'off', pack, note, time }),
    setPackDyn: (pack, value, time) => send({ type: 'packdyn', pack, value, time }),
    setSustain: (on, time) => send({ type: 'sustain', on, time }),
    setPackVol: (pack, value, time) => send({ type: 'packvol', pack, value, time }),
    isLoaded: (id) => loaded.has(id),
    pin: () => undefined
  }
  const pb = new Playback(player)
  pb.mode = o.scope === 'song' ? 'song' : 'loop'
  pb.barSteps = o.barSteps
  pb.set(o.song)
  for (let k = 0; k <= steps; k++) {
    const t = lead + k * stepDur
    if (k < steps) {
      pb.step(k, t, stepDur)
      scheduleDrums(player, k, t, stepDur, o.barSteps, o.drums, pb.factorAt(k))
    } else pb.stop(t)
  }
  await settle(node)
  o.onProgress('Playing it through', 0.5)
  const buf = await ctx.startRendering()
  o.onProgress('Writing the file', 0.95)

  // peak to -1 dBFS
  const L = buf.getChannelData(0), R = buf.getChannelData(1)
  let peak = 0
  for (let j = 0; j < L.length; j++) peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j]))
  const gain = peak > 0 ? 10 ** (-1 / 20) / peak : 1
  return { wav: wav24(L, R, gain), seconds, peakDb: 20 * Math.log10(peak + 1e-12) }
}

function wav24(L: Float32Array, R: Float32Array, gain: number): ArrayBuffer {
  const n = L.length
  const data = n * 2 * 3
  const v = new DataView(new ArrayBuffer(44 + data))
  const w = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + data, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, SR, true)
  v.setUint32(28, SR * 6, true); v.setUint16(32, 6, true); v.setUint16(34, 24, true); w(36, 'data'); v.setUint32(40, data, true)
  let o = 44
  for (let i = 0; i < n; i++) {
    for (const x of [L[i], R[i]]) {
      // TPDF dither, then 24-bit
      const d = (Math.random() - Math.random()) / 8388608
      const q = Math.max(-8388608, Math.min(8388607, Math.round((x * gain + d) * 8388607)))
      v.setUint8(o, q & 255); v.setUint8(o + 1, (q >> 8) & 255); v.setUint8(o + 2, (q >> 16) & 255)
      o += 3
    }
  }
  return v.buffer
}
