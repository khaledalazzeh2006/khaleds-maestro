/**
 * Keys, scales, maqamat, note spelling, chords and drones.
 * Pitches are in semitones and may be fractional: 0.5 is a quarter tone (the half-flat of the maqamat).
 */

export type Family = 'free' | 'scale' | 'maqam'
type ChordSet = 'major' | 'minor' | 'free' | 'drones'

export interface Scale {
  id: string; name: string; family: Family
  steps: number[]            // semitones above the tonic, one octave
  letters?: number[]         // letter offset of each degree (spelling); 7-note scales default to 0..6
  chords: ChordSet
  tonicShift?: number        // Sikah sits a quarter tone below its letter (E half-flat)
  ghammaz?: number           // the maqam's second pillar (degree index), offered as a drone
  hint: string
}

export const SCALES: Scale[] = [
  { id: 'free', name: 'All 12 notes', family: 'free', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], chords: 'free',
    hint: 'Every key is a semitone. Nothing is locked, so anything you play is yours to keep or fix.' },
  { id: 'major', name: 'Major', family: 'scale', steps: [0, 2, 4, 5, 7, 9, 11], chords: 'major', hint: 'Bright and open.' },
  { id: 'minor', name: 'Minor', family: 'scale', steps: [0, 2, 3, 5, 7, 8, 10], chords: 'minor', hint: 'The natural minor: dark and singing.' },
  { id: 'harmonic', name: 'Harmonic minor', family: 'scale', steps: [0, 2, 3, 5, 7, 8, 11], chords: 'minor', hint: 'Minor with a raised 7th — the eastern-sounding leap near the top.' },
  { id: 'dorian', name: 'Dorian', family: 'scale', steps: [0, 2, 3, 5, 7, 9, 10], chords: 'minor', hint: 'Minor with a hopeful raised 6th.' },
  { id: 'phrygian', name: 'Phrygian', family: 'scale', steps: [0, 1, 3, 5, 7, 8, 10], chords: 'minor', hint: 'Minor with a dark half step above the tonic, close to Kurd.' },
  { id: 'mixolydian', name: 'Mixolydian', family: 'scale', steps: [0, 2, 4, 5, 7, 9, 10], chords: 'major', hint: 'Major with a relaxed lowered 7th.' },
  { id: 'penta-major', name: 'Major pentatonic', family: 'scale', steps: [0, 2, 4, 7, 9], letters: [0, 1, 2, 4, 5], chords: 'major', hint: 'Five notes, no wrong turns. Great for first improvising.' },
  { id: 'penta-minor', name: 'Minor pentatonic', family: 'scale', steps: [0, 3, 5, 7, 10], letters: [0, 2, 3, 4, 6], chords: 'minor', hint: 'Five notes, soulful and safe.' },
  { id: 'rast', name: 'Rast', family: 'maqam', steps: [0, 2, 3.5, 5, 7, 9, 10.5], chords: 'drones', ghammaz: 4, hint: 'The mother maqam: proud and warm, with two quarter tones.' },
  { id: 'bayati', name: 'Bayati', family: 'maqam', steps: [0, 1.5, 3, 5, 7, 8, 10], chords: 'drones', ghammaz: 3, hint: 'Tender and earthy; the 2nd is a quarter tone low.' },
  { id: 'saba', name: 'Saba', family: 'maqam', steps: [0, 1.5, 3, 4, 7, 8, 10], chords: 'drones', ghammaz: 2, hint: 'The sad maqam: the 4th leans down, the 2nd is a quarter tone low.' },
  { id: 'hijaz', name: 'Hijaz', family: 'maqam', steps: [0, 1, 4, 5, 7, 8, 10], chords: 'drones', ghammaz: 3, hint: 'The wide leap between the 2nd and 3rd — the sound of the desert.' },
  { id: 'kurd', name: 'Kurd', family: 'maqam', steps: [0, 1, 3, 5, 7, 8, 10], chords: 'drones', ghammaz: 3, hint: 'Gentle and longing, no quarter tones.' },
  { id: 'nahawand', name: 'Nahawand', family: 'maqam', steps: [0, 2, 3, 5, 7, 8, 11], chords: 'drones', ghammaz: 4, hint: 'Romantic, close to harmonic minor.' },
  { id: 'ajam', name: 'Ajam', family: 'maqam', steps: [0, 2, 4, 5, 7, 9, 11], chords: 'drones', ghammaz: 4, hint: 'Bright and festive, like a major scale.' },
  { id: 'sikah', name: 'Sikah', family: 'maqam', steps: [0, 1.5, 3.5, 5.5, 7, 8.5, 10.5], chords: 'drones', tonicShift: -0.5, ghammaz: 2,
    hint: 'Starts on a quarter-tone note itself; mystical and floating.' },
]
export const scaleById = (id: string): Scale => SCALES.find((s) => s.id === id) ?? SCALES[2]

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]

/** The twelve tonics as musicians spell them. */
export const TONICS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
/** minor-flavoured keys read better with these spellings */
const MINOR_NAME: Record<number, string> = { 1: 'C♯', 6: 'F♯', 8: 'G♯' }

export interface Key { tonic: number; scale: string }

const ACC: Record<string, string> = { '-2': '𝄫', '-1.5': '♭½♭', '-1': '♭', '-0.5': '½♭', '0': '', '0.5': '♯½♭', '1': '♯', '1.5': '♯½♯', '2': '𝄪' }
function accidental(diff: number): string { return ACC[String(diff)] ?? '' }

function tonicLetterName(k: Key): string {
  const sc = scaleById(k.scale)
  return sc.chords === 'minor' && MINOR_NAME[k.tonic] ? MINOR_NAME[k.tonic] : TONICS[k.tonic]
}

function nameAt(letter: number, pc: number): string {
  let diff = pc - LETTER_PC[letter]
  while (diff > 6) diff -= 12
  while (diff < -6) diff += 12
  return LETTERS[letter] + accidental(diff)
}

export function tonicName(k: Key): string { return degree(k, 0).name }
export function keyName(k: Key): string {
  const sc = scaleById(k.scale)
  return sc.family === 'free' ? `${tonicName(k)} · all notes` : sc.family === 'maqam' ? `Maqam ${sc.name} on ${tonicName(k)}` : `${tonicName(k)} ${sc.name.toLowerCase()}`
}

/** Degree i (0-based, may go past one octave): semitones above the tonic and the spelled name. */
export function degree(k: Key, i: number): { semis: number; name: string; quarter: boolean } {
  const sc = scaleById(k.scale)
  const n = sc.steps.length
  const oct = Math.floor(i / n)
  const d = ((i % n) + n) % n
  const shift = sc.tonicShift ?? 0
  const semis = sc.steps[d] + shift + 12 * oct
  const pc = (((k.tonic + shift + sc.steps[d]) % 12) + 12) % 12
  const quarter = pc % 1 !== 0
  if (sc.family === 'free') return { semis, name: spell(k, pc), quarter }
  const letters = sc.letters ?? [0, 1, 2, 3, 4, 5, 6]
  const tl = LETTERS.indexOf(tonicLetterName(k)[0])
  return { semis, name: nameAt((tl + letters[d]) % 7, pc), quarter }
}

/** Spells a semitone pitch class: from the key's own notes, otherwise as a sharpened neighbour. */
export function spell(k: Key, pc: number): string {
  const base: Key = { tonic: k.tonic, scale: scaleById(k.scale).chords === 'major' ? 'major' : 'minor' }
  for (let d = 0; d < 7; d++) {
    const g = degree(base, d)
    if ((((k.tonic + g.semis) % 12) + 12) % 12 === pc) return g.name
  }
  const natural = LETTER_PC.indexOf(pc)
  if (natural >= 0) return LETTERS[natural]
  if (pc === (k.tonic + 11) % 12) { // the raised leading tone: a sharp (C♯ in D minor)
    for (let d = 0; d < 7; d++) {
      const g = degree(base, d)
      if ((((k.tonic + g.semis + 1) % 12) + 12) % 12 === pc) return g.name.endsWith('♭') ? g.name.slice(0, -1) : g.name + '♯'
    }
  }
  for (let d = 0; d < 7; d++) { // otherwise a lowered note of the key (E♭ in D phrygian)
    const g = degree(base, d)
    if ((((k.tonic + g.semis - 1) % 12) + 12) % 12 === pc) return g.name.endsWith('♯') ? g.name.slice(0, -1) : g.name + '♭'
  }
  return TONICS[pc]
}

/** The notes of the scale for display, quarter tones flagged. */
export function scaleNotes(k: Key): { name: string; quarter: boolean }[] {
  const sc = scaleById(k.scale)
  return sc.steps.map((_, i) => degree(k, i))
}

// ------------------------------------------------------------------ the bottom row

export interface Chord { label: string; root: number; tones: number[] } // tones: pitch classes, root first
export interface Drone { label: string; offsets: number[] }              // semitones above the tonic (may be fractional)
export type BottomRow = { kind: 'chords'; chords: Chord[] } | { kind: 'drones'; drones: (Drone | null)[] } // null = off

const M = [0, 4, 7], m = [0, 3, 7], dim = [0, 3, 6], dom7 = [0, 4, 7, 10], min7 = [0, 3, 7, 10], maj7 = [0, 4, 7, 11]

export function bottomRow(k: Key): BottomRow {
  const sc = scaleById(k.scale)
  if (sc.chords === 'drones') {
    const t = degree(k, 0).name
    const g = sc.ghammaz ?? 4
    const at = (i: number): { semis: number; name: string } => degree(k, i)
    const fifth = at(4), fourth = at(3), gh = at(g)
    return { kind: 'drones', drones: [
      { label: t, offsets: [0] },
      { label: `${t} + ${fifth.name}`, offsets: [0, fifth.semis] },
      { label: `${t} + 8ve`, offsets: [0, 12] },
      { label: `Low ${t}`, offsets: [-12] },
      { label: gh.name, offsets: [gh.semis] },
      { label: `${t} + ${gh.name}`, offsets: [0, gh.semis] },
      { label: fourth.name, offsets: [fourth.semis] },
      { label: fifth.name, offsets: [fifth.semis] },
      { label: `${t} ${fifth.name} ${t}`, offsets: [-12, fifth.semis - 12, 0] },
      null
    ] }
  }
  const t = k.tonic
  const mk = (rootSemis: number, intervals: number[], suffix: string): Chord => {
    const root = (t + rootSemis) % 12
    return { label: spell(k, root) + suffix, root, tones: intervals.map((x) => (root + x) % 12) }
  }
  if (sc.chords === 'major') {
    return { kind: 'chords', chords: [mk(0, M, ''), mk(5, M, ''), mk(7, M, ''), mk(9, m, 'm'), mk(2, m, 'm'), mk(4, m, 'm'),
      sc.id === 'mixolydian' ? mk(10, M, '') : mk(11, dim, '°'), mk(0, maj7, 'maj7'), mk(5, maj7, 'maj7'), mk(7, dom7, '7')] }
  }
  if (sc.chords === 'minor') {
    return { kind: 'chords', chords: [mk(0, m, 'm'), mk(5, m, 'm'), mk(7, M, ''), mk(8, M, ''), mk(10, M, ''), mk(3, M, ''),
      sc.id === 'dorian' ? mk(5, M, '') : sc.id === 'phrygian' ? mk(1, M, '') : mk(2, dim, '°'),
      mk(0, min7, 'm7'), mk(5, min7, 'm7'), mk(7, dom7, '7')] }
  }
  // free: both colours of the tonic and its neighbours
  return { kind: 'chords', chords: [mk(0, m, 'm'), mk(5, m, 'm'), mk(7, M, ''), mk(8, M, ''), mk(10, M, ''), mk(3, M, ''),
    mk(0, M, ''), mk(5, M, ''), mk(7, m, 'm'), mk(2, dim, '°')] }
}

/**
 * Places a chord close to the previous one (the smallest total movement), around `center`,
 * with the root added below as a bass note when `bass` is set.
 */
export function voice(ch: Chord, center: number, prev: number[] | null, bass: boolean): number[] {
  const n = ch.tones.length
  let best: number[] = []
  let bestCost = Infinity
  for (let inv = 0; inv < n; inv++) {
    const order = [...ch.tones.slice(inv), ...ch.tones.slice(0, inv)]
    for (let low = center - 7; low <= center + 5; low++) {
      if (((low % 12) + 12) % 12 !== order[0]) continue
      const notes = [low]
      for (let j = 1; j < n; j++) {
        let x = notes[j - 1] + 1
        while (((x % 12) + 12) % 12 !== order[j]) x++
        notes.push(x)
      }
      const mean = notes.reduce((a, b) => a + b, 0) / n
      let cost = Math.abs(mean - (center + 4)) * 0.4
      if (prev && prev.length) {
        const p = [...prev].sort((a, b) => a - b).slice(-n)
        cost = notes.reduce((acc, x, j) => acc + Math.abs(x - (p[Math.min(j, p.length - 1)] ?? x)), 0) + cost * 0.5
      }
      if (cost < bestCost) { bestCost = cost; best = notes }
    }
  }
  if (bass) { // the root about an octave and a bit below the middle, always under the chord
    let b = center - 14
    while (((b % 12) + 12) % 12 !== ch.root) b++
    if (b - (center - 14) > 6) b -= 12
    while (b >= best[0]) b -= 12
    best = [b, ...best]
  }
  return best
}

/** Where a drone sits: its tonic in the octave just below the chord middle. */
export function droneNotes(k: Key, d: Drone, center: number): number[] {
  const t = k.tonic + (scaleById(k.scale).tonicShift ?? 0)
  let base = t
  while (base < center - 12) base += 12
  while (base >= center) base -= 12
  return d.offsets.map((o) => base + o)
}
