/**
 * Standard MIDI file (type 1) of the piece: one track per instrument, the drums on channel 10, tempo and
 * meter, velocities from how hard you played, the bow as expression (CC 11), the hold pedal (CC 64),
 * and quarter tones as pitch bend (bend range ±2 semitones).
 */
import { DRUMS, type DrumState } from './drums'
import { currentSection, segments, tightened, type Ev, type Song } from './song'

const PPQ = 480
const STEP = PPQ / 2 // an eighth note

const GM: Record<string, number> = {
  'violin-solo': 40, 'violin-solo-trem': 44, 'violin-solo-spic': 40, 'violin-solo-pizz': 45,
  violins: 48, 'violins-trem': 44, 'violins-spic': 48, 'violins-pizz': 45, violas: 41, 'violas-trem': 44, 'violas-spic': 41, 'violas-pizz': 45,
  cellos: 42, 'cellos-trem': 44, 'cellos-spic': 42, 'cellos-pizz': 45, basses: 43, 'basses-spic': 43, 'basses-pizz': 45, harp: 46,
  flute: 73, oboe: 68, clarinet: 71, bassoon: 70, horn: 60, trumpet: 56, trombone: 57, tuba: 58,
  piano: 0, glockenspiel: 9, marimba: 12, xylophone: 13, timpani: 47, 'timpani-roll': 47
}
const GM_DRUM: Record<string, number> = { bd: 36, dum: 64, tak: 63, ka: 62, riq: 54 }

interface Item { tick: number; order: number; bytes: number[] }

export function songToMidi(song: Song, o: { scope: 'song' | 'section'; times: number; tempo: number; sig: string; barSteps: number; drums: DrumState; names: (pack: string) => string }): Uint8Array {
  const sec = currentSection(song)
  const parts = o.scope === 'song'
    ? segments(song).map((g) => ({ start: g.start, len: g.len, section: g.section, muted: g.placement.muted }))
    : [{ start: 0, len: sec.steps * Math.max(1, o.times), section: sec, muted: [] as number[] }]
  const total = parts.reduce((a, p) => Math.max(a, p.start + p.len), 0)
  if (total <= 0) throw new Error('There is nothing recorded to export yet.')

  // one track per instrument (and role), in the order they first appear
  const tracks = new Map<string, { name: string; pack: string; items: Item[]; channel: number }>()
  let nextCh = 0
  const trackFor = (pack: string, role: string): { name: string; pack: string; items: Item[]; channel: number } => {
    const key = `${pack}|${role}`
    let t = tracks.get(key)
    if (!t) {
      if (nextCh === 9) nextCh++
      t = { name: `${o.names(pack)}${role === 'chords' ? ' (chords)' : ''}`, pack, items: [], channel: nextCh++ % 16 }
      tracks.set(key, t)
    }
    return t
  }
  for (const p of parts) {
    for (const l of p.section.layers) {
      if (l.mute || p.muted.includes(l.id) || !l.takes[l.active]) continue
      const t = trackFor(l.pack, l.role)
      const ev: Ev[] = tightened(l.takes[l.active].events, l.tighten)
      for (let rep = 0; rep * p.section.steps < p.len; rep++) {
        const base = p.start + rep * p.section.steps
        for (const e of ev) {
          const tick = Math.round((base + e.s) * STEP)
          const ch = t.channel
          if (e.k === 'on') {
            const n = Math.round(e.n)
            const bend = Math.round((e.n - n) * 4096) + 8192 // ±2 semitones over 0..16383
            t.items.push({ tick, order: 1, bytes: [0xe0 | ch, bend & 127, (bend >> 7) & 127] })
            t.items.push({ tick, order: 2, bytes: [0x90 | ch, n & 127, Math.max(1, Math.min(127, Math.round(20 + e.d * 107)))] })
          } else if (e.k === 'off') {
            t.items.push({ tick, order: 0, bytes: [0x80 | ch, Math.round(e.n) & 127, 64] })
          } else if (e.k === 'dyn') {
            t.items.push({ tick, order: 1, bytes: [0xb0 | ch, 11, Math.round(30 + e.v * 97) & 127] })
          } else if (e.k === 'sus') {
            t.items.push({ tick, order: 1, bytes: [0xb0 | ch, 64, e.on ? 127 : 0] })
          }
        }
      }
    }
  }
  // drums on channel 10
  const drumItems: Item[] = []
  if (o.drums.on) {
    for (let k = 0; k < total; k++) {
      const pos = k % o.barSteps
      for (let sub = 0; sub < 2; sub++) {
        for (const d of DRUMS) {
          const v = o.drums.pattern[d.id]?.[pos * 2 + sub] ?? 0
          if (!v || o.drums.muted[d.id]) continue
          const tick = k * STEP + sub * (STEP / 2)
          drumItems.push({ tick, order: 2, bytes: [0x99, GM_DRUM[d.id], v === 2 ? 115 : 80] })
          drumItems.push({ tick: tick + 60, order: 0, bytes: [0x89, GM_DRUM[d.id], 64] })
        }
      }
    }
  }

  const [num, den] = o.sig.split('/').map(Number)
  const usPerQuarter = Math.round(60_000_000 / o.tempo)
  const head: Item[] = [
    { tick: 0, order: 0, bytes: [0xff, 0x51, 3, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255] },
    { tick: 0, order: 0, bytes: [0xff, 0x58, 4, num, Math.round(Math.log2(den)), 24, 8] },
    ...text(0x03, 'Maestro piece')
  ]
  const chunks = [track(head)]
  for (const t of tracks.values()) {
    const prog = GM[t.pack] ?? 48
    chunks.push(track([...text(0x03, t.name), { tick: 0, order: 0, bytes: [0xc0 | t.channel, prog] },
      { tick: 0, order: 0, bytes: [0xb0 | t.channel, 101, 0] }, { tick: 0, order: 0, bytes: [0xb0 | t.channel, 100, 0] },
      { tick: 0, order: 0, bytes: [0xb0 | t.channel, 6, 2] }, ...t.items])) // pitch-bend range 2 semitones
  }
  if (drumItems.length) chunks.push(track([...text(0x03, 'Drums'), ...drumItems]))

  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (chunks.length >> 8) & 255, chunks.length & 255, (PPQ >> 8) & 255, PPQ & 255]
  return Uint8Array.from([...header, ...chunks.flat()])
}

function text(kind: number, s: string): Item[] {
  const b = Array.from(new TextEncoder().encode(s))
  return [{ tick: 0, order: 0, bytes: [0xff, kind, ...vlq(b.length), ...b] }]
}

function vlq(n: number): number[] {
  const out = [n & 127]
  while ((n >>= 7)) out.unshift((n & 127) | 128)
  return out
}

function track(items: Item[]): number[] {
  const sorted = [...items].sort((a, b) => a.tick - b.tick || a.order - b.order)
  const body: number[] = []
  let last = 0
  for (const it of sorted) {
    body.push(...vlq(Math.max(0, it.tick - last)), ...it.bytes)
    last = Math.max(last, it.tick)
  }
  body.push(0, 0xff, 0x2f, 0)
  const len = body.length
  return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...body]
}
