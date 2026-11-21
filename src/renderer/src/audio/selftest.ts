/**
 * Offline self-test of the engine (developer tool, opened with #selftest). Renders a scripted
 * performance through the real worklet and returns it as a WAV for analysis.
 */
import { createEngineNode, loadPack, settle } from './sampler'

export interface Step { t: number; type: 'on' | 'off' | 'dyn' | 'sustain' | 'legato'; note?: number; dyn?: number; value?: number; on?: boolean }

export async function renderScript(pack: string, seconds: number, steps: Step[]): Promise<string> {
  const sr = 48000
  const ctx = new OfflineAudioContext(2, Math.round(seconds * sr), sr)
  const node = await createEngineNode(ctx)
  node.connect(ctx.destination)
  await loadPack(ctx, node, pack, () => undefined)
  for (const s of steps) {
    if (s.type === 'legato') node.port.postMessage({ type: 'legato', on: s.on })
    else if (s.type === 'on') node.port.postMessage({ type: 'on', pack, note: s.note, dyn: s.dyn ?? 0.6, time: s.t })
    else if (s.type === 'off') node.port.postMessage({ type: 'off', pack, note: s.note, time: s.t })
    else if (s.type === 'dyn') node.port.postMessage({ type: 'dyn', value: s.value, time: s.t })
    else if (s.type === 'sustain') node.port.postMessage({ type: 'sustain', on: s.on, time: s.t })
  }
  await settle(node)
  const buf = await ctx.startRendering()
  return wavBase64(buf)
}

function wavBase64(buf: AudioBuffer): string {
  const n = buf.length, ch = 2
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2))
  const w = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, buf.sampleRate, true)
  out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data')
  out.setUint32(40, n * ch * 2, true)
  const L = buf.getChannelData(0), R = buf.getChannelData(1)
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true)
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true)
  }
  const bytes = new Uint8Array(out.buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
