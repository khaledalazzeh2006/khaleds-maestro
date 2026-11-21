/**
 * Quality guard: looks at the recorded notes (not the audio) and points at what usually spoils a piece:
 * a sudden jump in loudness with no build-up, two notes a semitone apart held together, a melody buried
 * under the accompaniment, and empty sections in the timeline. Every finding comes with a fix.
 */
import type { Kind } from '../audio/sampler'
import { degree, scaleById, type Key } from './theory'
import { noteSpans, segments, type Ev, type Layer, type Section, type Song } from './song'

export interface Issue {
  id: string
  kind: 'jump' | 'clash' | 'buried' | 'empty'
  title: string
  detail: string
  section: number | null
  bar: number | null
  fixLabel: string | null
  fix: ((s: Song) => Song) | null
}

export interface QualityContext { kindOf: (pack: string) => Kind; barSteps: number; stepSec: number; key: Key; spotDb: number; melodyPack: string | null }

const RANGE: Record<Kind, number> = { sus: 12, shot: 14, piano: 12, perc: 20 }
const db = (p: number): number => 10 * Math.log10(p + 1e-12)

/** loudness (power) of one layer at the middle of every eighth of its section */
function layerPower(l: Layer, steps: number, ctx: QualityContext): Float64Array {
  const out = new Float64Array(steps)
  const take = l.takes[l.active]
  if (!take || l.mute) return out
  const kind = ctx.kindOf(l.pack)
  const spans = noteSpans(take.events, steps)
  const bows = take.events.filter((e): e is Extract<Ev, { k: 'dyn' }> => e.k === 'dyn')
  for (let k = 0; k < steps; k++) {
    const t = k + 0.5
    let bow: number | null = null
    for (const b of bows) { if (b.s <= t) bow = b.v; else break }
    let p = 0
    for (const sp of spans) {
      if (sp.s > t || sp.e <= t) continue
      const dd = kind === 'sus' && l.role === 'melody' && bow !== null ? bow : sp.d
      let a = 10 ** (((dd - 1) * RANGE[kind]) / 20)
      if (kind !== 'sus') a *= Math.exp(-((t - sp.s) * ctx.stepSec) / 1.2)
      p += a * a
    }
    out[k] = p * l.volume * l.volume
  }
  return out
}

function sectionName(song: Song, id: number): string { return song.sections.find((s) => s.id === id)?.name ?? '?' }

// ------------------------------------------------------------------ sudden jumps
function jumps(song: Song, ctx: QualityContext): Issue[] {
  const segs = segments(song)
  if (!segs.length) return []
  const per = new Map<number, Map<number, Float64Array>>() // section -> layer -> power
  for (const sec of song.sections) per.set(sec.id, new Map(sec.layers.map((l) => [l.id, layerPower(l, sec.steps, ctx)])))
  const total = segs[segs.length - 1].start + segs[segs.length - 1].len
  const power = new Float64Array(total)
  const who: { seg: number; layers: Map<number, number> }[] = new Array(total)
  segs.forEach((g, gi) => {
    const next = segs[gi + 1]
    for (let k = g.start; k < g.start + g.len; k++) {
      const local = (k - g.start) % g.section.steps
      let f = 1
      if (g.placement.enter === 'fade' && k - g.start < 2 * ctx.barSteps) f = (k - g.start) / (2 * ctx.barSteps)
      if (next && next.placement.enter === 'drop' && next.start - k <= ctx.barSteps / 2) f = 0
      if (next && next.placement.enter === 'build' && next.start - k <= 2 * ctx.barSteps) f = 0.7 + 0.3 * (1 - (next.start - k) / (2 * ctx.barSteps))
      const layers = new Map<number, number>()
      let p = 0
      for (const l of g.section.layers) {
        if (g.placement.muted.includes(l.id)) continue
        const v = (per.get(g.section.id)?.get(l.id)?.[local] ?? 0) * f * f
        layers.set(l.id, v)
        p += v
      }
      power[k] = p
      who[k] = { seg: gi, layers }
    }
  })
  const top = Math.max(...Array.from(power, db))
  const w = Math.max(2, Math.round(1.5 / ctx.stepSec))
  const out: Issue[] = []
  for (let k = w; k < total; k++) {
    const now = db(power[k])
    if (now < top - 30) continue
    let before = Infinity
    for (let j = k - w; j < k; j++) before = Math.min(before, db(power[j]))
    if (now - before <= 6) continue
    const g = segs[who[k].seg]
    const atStart = k - g.start < 2
    if (atStart && g.placement.enter !== 'none') { k += w; continue } // a chosen entrance is fine
    const name = g.section.name
    const bar = Math.floor((k - g.start) / ctx.barSteps) % Math.max(1, g.section.steps / ctx.barSteps) + 1
    const rise = Math.round(now - before)
    if (atStart) {
      const pid = g.placement.id
      out.push({ id: `jump-p${pid}`, kind: 'jump', section: g.section.id, bar: 1,
        title: rise > 18 ? `${name} jumps in much louder` : `${name} jumps in ${rise} dB louder`,
        detail: `The music gets much louder all at once where ${name} starts, with nothing preparing it. Let it grow over the two bars before it.`,
        fixLabel: 'Add a build-up before it',
        fix: (s) => ({ ...s, arrangement: s.arrangement.map((p) => (p.id === pid ? { ...p, enter: 'build' } : p)) }) })
    } else {
      // the layer that grew the most is the one to tame
      let worst: number | null = null, grow = 0
      for (const [id, v] of who[k].layers) {
        const old = who[k - w]?.layers.get(id) ?? 0
        if (v - old > grow) { grow = v - old; worst = id }
      }
      const l = g.section.layers.find((x) => x.id === worst)
      const cut = Math.min(9, rise - 4)
      out.push({ id: `jump-s${g.section.id}-b${bar}`, kind: 'jump', section: g.section.id, bar,
        title: `Sudden jump in ${name}, bar ${bar}`,
        detail: `It gets ${rise > 18 ? 'much' : `${rise} dB`} louder within a second and a half${l ? `, mostly from ${l.name}` : ''}. A rise this quick sounds like a mistake unless it builds.`,
        fixLabel: l ? `Lower ${l.name} by ${cut} dB` : null,
        fix: l ? (s) => ({ ...s, sections: s.sections.map((sec) => (sec.id === g.section.id ? { ...sec, layers: sec.layers.map((x) => (x.id === l.id ? { ...x, volume: x.volume * 10 ** (-cut / 20) } : x)) } : sec)) }) : null })
    }
    k += w
  }
  return out
}

// ------------------------------------------------------------------ clashing notes
interface Span { s: number; e: number; n: number; layer: Layer }

function clashes(song: Song, ctx: QualityContext): Issue[] {
  const out: Issue[] = []
  const scale = scaleById(ctx.key.scale)
  const inKey = new Set(Array.from({ length: scale.steps.length }, (_, i) => (((ctx.key.tonic + degree(ctx.key, i).semis) % 12) + 12) % 12))
  for (const sec of song.sections) {
    const spans: Span[] = sec.layers.filter((l) => !l.mute && l.takes[l.active])
      .flatMap((l) => noteSpans(l.takes[l.active].events, sec.steps).map((x) => ({ ...x, layer: l })))
    const seen = new Set<string>()
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const a = spans[i], b = spans[j]
        if (a.layer.id === b.layer.id) continue
        if (a.n % 1 || b.n % 1) continue // quarter tones are the maqam's colour, not a clash
        const overlap = Math.min(a.e, b.e) - Math.max(a.s, b.s)
        if (overlap < 1) continue // passing notes shorter than an eighth are fine
        const iv = Math.abs(a.n - b.n) % 12
        if (iv !== 1 && iv !== 11) continue
        // move the melody note (or the one that came in later)
        const mover = a.layer.role === 'melody' && b.layer.role !== 'melody' ? a : b.layer.role === 'melody' && a.layer.role !== 'melody' ? b : (a.s >= b.s ? a : b)
        const other = mover === a ? b : a
        const bar = Math.floor(Math.max(a.s, b.s) / ctx.barSteps) + 1
        const id = `clash-${sec.id}-${mover.layer.id}-${mover.s.toFixed(2)}-${mover.n}`
        if (seen.has(id)) continue
        seen.add(id)
        const around = spans.filter((x) => x.layer.id !== mover.layer.id && x.s < mover.e && x.e > mover.s).map((x) => x.n)
        let target: number | null = null
        for (const d of [1, -1, 2, -2, 3, -3]) {
          const c = mover.n + d
          if (!inKey.has(((c % 12) + 12) % 12)) continue
          if (around.some((x) => [1, 11].includes(Math.abs(c - x) % 12))) continue
          target = c
          break
        }
        out.push({ id, kind: 'clash', section: sec.id, bar,
          title: `Clash in ${sec.name}, bar ${bar}`,
          detail: `${mover.layer.name} holds ${name(mover.n)} while ${other.layer.name} holds ${name(other.n)}: a semitone apart, they rub.`,
          fixLabel: target !== null ? `Move ${mover.layer.name}'s note to ${name(target)}` : null,
          fix: target !== null ? (s) => moveNote(s, sec.id, mover.layer.id, mover.s, mover.n, target!) : null })
        if (out.length > 40) return out
      }
    }
  }
  return out
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
function name(n: number): string { return NAMES[((Math.round(n) % 12) + 12) % 12] + (Math.floor(Math.round(n) / 12) - 1) }

/** change one note of the active take (its note-on at step s and its note-off) */
function moveNote(song: Song, section: number, layer: number, s: number, from: number, to: number): Song {
  return { ...song, sections: song.sections.map((sec) => sec.id !== section ? sec : { ...sec, layers: sec.layers.map((l) => {
    if (l.id !== layer) return l
    const take = l.takes[l.active]
    let open = false
    const events = take.events.map((e) => {
      if (e.k === 'on' && e.n === from && Math.abs(e.s - s) < 1e-6) { open = true; return { ...e, n: to } }
      if (open && e.k === 'off' && e.n === from) { open = false; return { ...e, n: to } }
      return e
    })
    return { ...l, takes: l.takes.map((t, i) => (i === l.active ? { ...t, events } : t)) }
  }) }) }
}

// ------------------------------------------------------------------ buried melody
function buried(song: Song, ctx: QualityContext): Issue[] {
  const out: Issue[] = []
  for (const sec of song.sections) {
    const mel = sec.layers.filter((l) => l.role === 'melody' && !l.mute && l.takes[l.active])
    const rest = sec.layers.filter((l) => !mel.includes(l) && !l.mute && l.takes[l.active])
    if (!mel.length || !rest.length) continue
    for (const m of mel) {
      const mp = layerPower(m, sec.steps, ctx)
      const others = rest.map((l) => layerPower(l, sec.steps, ctx))
      let lead = 0, back = 0, n = 0
      for (let k = 0; k < sec.steps; k++) {
        if (mp[k] <= 0) continue
        lead += mp[k]
        back += Math.max(...others.map((o) => o[k]))
        n++
      }
      if (n < sec.steps * 0.2) continue
      const boost = m.pack === ctx.melodyPack ? ctx.spotDb : 0 // the spotlight already lifts it
      const gap = db(lead / n) + boost - db(back / n)
      if (gap >= 3) continue
      const need = Math.min(9, Math.ceil(5 - gap))
      out.push({ id: `buried-${sec.id}-${m.id}`, kind: 'buried', section: sec.id, bar: null,
        title: `${m.name} is buried in ${sec.name}`,
        detail: `The melody is only ${Math.round(gap)} dB above the loudest accompaniment. A lead should sit clearly on top (about 5–8 dB) so its own sound stays clear.`,
        fixLabel: `Raise ${m.name} by ${need} dB`,
        fix: (s) => ({ ...s, sections: s.sections.map((x) => (x.id !== sec.id ? x : { ...x, layers: x.layers.map((l) => (l.id === m.id ? { ...l, volume: Math.min(1.5, l.volume * 10 ** (need / 20)) } : l)) })) }) })
    }
  }
  return out
}

// ------------------------------------------------------------------ empty placements
function empties(song: Song): Issue[] {
  return song.arrangement.filter((p) => !(song.sections.find((s) => s.id === p.section)?.steps)).map((p) => ({
    id: `empty-${p.id}`, kind: 'empty' as const, section: p.section, bar: null,
    title: `${sectionName(song, p.section)} is on the timeline but empty`,
    detail: 'Nothing is recorded in it yet, so the song skips it. Record into it, or take it off the timeline.',
    fixLabel: 'Take it off the timeline',
    fix: (s: Song) => ({ ...s, arrangement: s.arrangement.filter((x) => x.id !== p.id) })
  }))
}

export function checkSong(song: Song, ctx: QualityContext): Issue[] {
  const hasMusic = song.sections.some((s: Section) => s.steps > 0)
  if (!hasMusic) return []
  return [...jumps(song, ctx), ...clashes(song, ctx), ...buried(song, ctx), ...empties(song)]
}
