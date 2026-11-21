/**
 * Drum patterns: one row per drum, one cell per sixteenth note of the bar (0 off, 1 hit, 2 accent).
 * Arabic rhythms are written with dum (low, deep), tak (high, dry) and ka (soft, high).
 */
import { METERS } from '../audio/transport'

export interface Drum { id: string; pack: string; name: string; key: string; code: string; color: string }
export const DRUMS: Drum[] = [
  { id: 'bd', pack: 'bass-drum', name: 'Bass drum', key: '1', code: 'Digit1', color: '#C9A36A' },
  { id: 'dum', pack: 'tumba', name: 'Dum (tumba)', key: '2', code: 'Digit2', color: '#E8933F' },
  { id: 'tak', pack: 'conga', name: 'Tak (conga)', key: '3', code: 'Digit3', color: '#F2B272' },
  { id: 'ka', pack: 'quinto', name: 'Ka (quinto)', key: '4', code: 'Digit4', color: '#F4EADB' },
  { id: 'riq', pack: 'tambourine', name: 'Riq (tambourine)', key: '5', code: 'Digit5', color: '#d98aa8' }
]

export type Pattern = Record<string, number[]>

export interface Preset { id: string; name: string; family: 'Arabic' | 'Odd meters' | 'Western'; meter: number; hits: Record<string, [number, number][]> }

const m = (sig: string, groups: string): number => METERS.findIndex((x) => x.sig === sig && x.groups.join('+') === groups)
/** [sixteenth, strength] */
const at = (...xs: (number | [number, number])[]): [number, number][] => xs.map((x) => (Array.isArray(x) ? x : [x, 1]))

export const PRESETS: Preset[] = [
  { id: 'maqsum', name: 'Maqsum', family: 'Arabic', meter: m('4/4', '2+2+2+2'),
    hits: { dum: at([0, 2], [8, 2]), bd: at(0, 8), tak: at(2, 6, [12, 2]), ka: at(10, 14), riq: at(0, 2, 4, 6, 8, 10, 12, 14) } },
  { id: 'baladi', name: 'Baladi', family: 'Arabic', meter: m('4/4', '2+2+2+2'),
    hits: { dum: at([0, 2], [2, 2], [8, 2]), bd: at(0, 2, 8), tak: at(6, [12, 2]), ka: at(10, 14), riq: at(0, 4, 8, 12) } },
  { id: 'saidi', name: "Sa'idi", family: 'Arabic', meter: m('4/4', '2+2+2+2'),
    hits: { dum: at([0, 2], [6, 2], [8, 2]), bd: at(0, 6, 8), tak: at(2, [12, 2]), ka: at(14), riq: at(0, 4, 8, 12) } },
  { id: 'wahda', name: 'Wahda', family: 'Arabic', meter: m('4/4', '2+2+2+2'),
    hits: { dum: at([0, 2]), bd: at(0), tak: at(6, [12, 2]), ka: at(10, 14), riq: at(0, 4, 8, 12) } },
  { id: 'samai', name: "Sama'i thaqil", family: 'Arabic', meter: m('10/8', '3+3+2+2'),
    hits: { dum: at([0, 2], [10, 2], [12, 2]), bd: at(0, 10, 12), tak: at([6, 2], 14), ka: at(3, 16, 18), riq: at(0, 6, 10, 14) } },
  { id: 'dawr', name: 'Dawr hindi (7/8)', family: 'Arabic', meter: m('7/8', '3+2+2'),
    hits: { dum: at([0, 2], [6, 2]), bd: at(0, 6), tak: at(4, [10, 2]), ka: at(2, 12), riq: at(0, 6, 10) } },
  { id: 'karsilama', name: 'Karsilama (9/8)', family: 'Arabic', meter: m('9/8', '2+2+2+3'),
    hits: { dum: at([0, 2], [8, 2]), bd: at(0, 8), tak: at(4, [12, 2], 14, 16), ka: at(2, 6, 10), riq: at(0, 4, 8, 12) } },
  { id: 'yanni78', name: 'Yanni 7/8 groove', family: 'Odd meters', meter: m('7/8', '2+2+3'),
    hits: { bd: at([0, 2], 8), dum: at(8), tak: at([4, 2], [12, 2]), ka: at(2, 6, 10), riq: at(0, 2, 4, 6, 8, 10, 12) } },
  { id: 'odd58', name: 'Driving 5/8', family: 'Odd meters', meter: m('5/8', '3+2'),
    hits: { bd: at([0, 2]), dum: at(6), tak: at([6, 2]), ka: at(2, 4, 8), riq: at(0, 2, 4, 6, 8) } },
  { id: 'odd98', name: 'Dance 9/8', family: 'Odd meters', meter: m('9/8', '2+2+2+3'),
    hits: { bd: at([0, 2], 8), tak: at([4, 2], [12, 2]), ka: at(14, 16), riq: at(0, 2, 4, 6, 8, 10, 12, 14, 16) } },
  { id: 'pop', name: 'Steady 4/4', family: 'Western', meter: m('4/4', '2+2+2+2'),
    hits: { bd: at([0, 2], [8, 2], 10), tak: at([4, 2], [12, 2]), riq: at(0, 2, 4, 6, 8, 10, 12, 14) } },
  { id: 'waltz', name: 'Waltz 3/4', family: 'Western', meter: m('3/4', '2+2+2'),
    hits: { bd: at([0, 2]), tak: at(4, 8), riq: at(4, 8) } },
  { id: 'sway68', name: 'Sway 6/8', family: 'Western', meter: m('6/8', '3+3'),
    hits: { bd: at([0, 2]), dum: at(6), tak: at([6, 2]), riq: at(0, 2, 4, 6, 8, 10) } }
]

export function emptyPattern(steps: number): Pattern {
  return Object.fromEntries(DRUMS.map((d) => [d.id, new Array(steps * 2).fill(0)]))
}

export function presetPattern(p: Preset): Pattern {
  const steps = METERS[p.meter].groups.reduce((a, b) => a + b, 0)
  const pat = emptyPattern(steps)
  for (const [drum, hits] of Object.entries(p.hits)) for (const [i, v] of hits) if (i < steps * 2) pat[drum][i] = v
  return pat
}

/** Keep a pattern when the meter changes: cut it or pad it with silence. */
export function fitPattern(p: Pattern, steps: number): Pattern {
  const n = steps * 2
  return Object.fromEntries(DRUMS.map((d) => {
    const row = p[d.id] ?? []
    return [d.id, Array.from({ length: n }, (_, i) => row[i] ?? 0)]
  }))
}

export interface DrumPlayer { noteOn(id: string, midi: number, dyn: number, legato?: boolean, time?: number): void; isLoaded(id: string): boolean }
export interface DrumState { on: boolean; pattern: Pattern; muted: Record<string, boolean> }

/** play the drum pattern for clock step k (both sixteenths of it); f is the transition loudness 0..1 */
export function scheduleDrums(p: DrumPlayer, k: number, time: number, dur: number, steps: number, st: DrumState, f: number): void {
  if (!st.on || f < 0.05) return
  const pos = k % steps
  for (let sub = 0; sub < 2; sub++) {
    for (const x of DRUMS) {
      const v = st.pattern[x.id]?.[pos * 2 + sub] ?? 0
      if (v && !st.muted[x.id] && p.isLoaded(x.pack)) p.noteOn(x.pack, 60, (v === 2 ? 0.95 : 0.62) * (0.6 + 0.4 * f), false, time + (sub * dur) / 2)
    }
  }
}
