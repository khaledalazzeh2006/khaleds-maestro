/**
 * A song is a loop of whole bars and the layers recorded over it. Times are in eighth-note steps from
 * the start of bar 1, so changing the tempo keeps everything in place.
 */

export type Ev =
  | { s: number; k: 'on'; n: number; d: number; lg: boolean } // note on: step, note, dyn, legato
  | { s: number; k: 'off'; n: number }
  | { s: number; k: 'dyn'; v: number }                         // the bow
  | { s: number; k: 'sus'; on: boolean }                       // hold pedal

export type Role = 'melody' | 'chords'

export interface Take { id: number; events: Ev[] }
export interface Layer {
  id: number; role: Role; pack: string; name: string
  takes: Take[]; active: number            // index of the take that plays
  mute: boolean; solo: boolean; volume: number
  tighten: number                          // 0..1, how far notes move toward the grid
  level: number                            // fixed loudness for the chord row (chords layers)
}
/** A section is one loop with its own layers (Intro, Verse, Chorus …). steps 0 = nothing recorded yet. */
export interface Section { id: number; name: string; steps: number; layers: Layer[] }
/** How the music arrives at a placement of a section on the timeline. */
export type Enter = 'none' | 'build' | 'hit' | 'drop' | 'fade'
export interface Placement { id: number; section: number; repeat: number; muted: number[]; enter: Enter }
export interface Song { version: 2; sections: Section[]; arrangement: Placement[]; current: number; nextId: number }

export const SECTION_NAMES = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Solo', 'Outro']

export function emptySong(): Song {
  return { version: 2, sections: [{ id: 1, name: 'Intro', steps: 0, layers: [] }], arrangement: [{ id: 2, section: 1, repeat: 1, muted: [], enter: 'none' }], current: 1, nextId: 3 }
}

/** Phase 6 kept one loop: it becomes the first section. */
export function migrate(raw: unknown): Song {
  const o = raw as Partial<Song> & { steps?: number; layers?: Layer[] }
  if (!o || typeof o !== 'object') return emptySong()
  if (o.version === 2 && Array.isArray(o.sections) && o.sections.length) return o as Song
  if (Array.isArray(o.layers)) {
    const id = (o.nextId ?? 1) + 1
    return { version: 2, sections: [{ id, name: 'Intro', steps: o.steps ?? 0, layers: o.layers }],
      arrangement: [{ id: id + 1, section: id, repeat: 1, muted: [], enter: 'none' }], current: id, nextId: id + 2 }
  }
  return emptySong()
}

export const sectionOf = (song: Song, id: number): Section | undefined => song.sections.find((x) => x.id === id)
export const currentSection = (song: Song): Section => sectionOf(song, song.current) ?? song.sections[0]

export interface Segment { start: number; len: number; placement: Placement; section: Section; index: number }
/** The arrangement laid out in steps; sections with nothing recorded take no time. */
export function segments(song: Song): Segment[] {
  const out: Segment[] = []
  let start = 0
  song.arrangement.forEach((p, index) => {
    const section = sectionOf(song, p.section)
    if (!section || section.steps <= 0) return
    const len = section.steps * Math.max(1, p.repeat)
    out.push({ start, len, placement: p, section, index })
    start += len
  })
  return out
}

/**
 * Gentle timing help: each note moves part of the way to the nearest step on the grid (eighths, or
 * sixteenths for fast notes), keeping its length, so the feel of the playing stays.
 */
export function tightened(events: Ev[], amount: number, grid = 0.5): Ev[] {
  if (amount <= 0) return events
  const out: Ev[] = []
  const shift = new Map<number, number>() // note -> shift of its open note-on
  for (const e of events) {
    if (e.k === 'on') {
      const target = Math.round(e.s / grid) * grid
      const ds = (target - e.s) * amount
      shift.set(e.n, ds)
      out.push({ ...e, s: e.s + ds })
    } else if (e.k === 'off') {
      out.push({ ...e, s: e.s + (shift.get(e.n) ?? 0) })
      shift.delete(e.n)
    } else out.push(e)
  }
  return out.sort((a, b) => a.s - b.s)
}

/** Closes notes still held at the end of a recording and keeps everything inside the loop. */
export function finishTake(events: Ev[], steps: number): Ev[] {
  const open = new Set<number>()
  const out: Ev[] = []
  for (const e of [...events].sort((a, b) => a.s - b.s)) {
    if (e.s >= steps) continue
    if (e.k === 'on') open.add(e.n)
    if (e.k === 'off') { if (!open.has(e.n)) continue; open.delete(e.n) }
    out.push({ ...e, s: Math.max(0, e.s) })
  }
  const end = steps - 0.05
  for (const n of open) out.push({ s: end, k: 'off', n })
  if (out.some((e) => e.k === 'sus' && e.on)) out.push({ s: end, k: 'sus', on: false })
  return out
}

/** For drawing: notes of a take as bars (start, end, pitch). */
export function noteSpans(events: Ev[], steps: number): { s: number; e: number; n: number; d: number }[] {
  const open = new Map<number, { s: number; d: number }>()
  const out: { s: number; e: number; n: number; d: number }[] = []
  for (const ev of events) {
    if (ev.k === 'on') open.set(ev.n, { s: ev.s, d: ev.d })
    else if (ev.k === 'off') {
      const o = open.get(ev.n)
      if (o) { out.push({ s: o.s, e: ev.s, n: ev.n, d: o.d }); open.delete(ev.n) }
    }
  }
  for (const [n, o] of open) out.push({ s: o.s, e: steps, n, d: o.d })
  return out
}
