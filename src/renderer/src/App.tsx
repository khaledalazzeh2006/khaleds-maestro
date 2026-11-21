import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sampler, fetchLibrary, packRange, type Manifest } from './audio/sampler'
import { KEY_BY_CODE, noteName, octaveOf } from './audio/keymap'
import { SCALES, bottomRow, degree, droneNotes, keyName, scaleById, scaleNotes, tonicName, voice, type Family, type Key } from './music/theory'
import { Bow } from './components/Bow'
import { Rows, type Cap } from './components/Rows'
import { Phrase, type PhraseNote } from './components/Phrase'
import { LatencyPanel, type LatencyInfo, type LatencyMode } from './components/LatencyPanel'
import { Shelf, Styles, groupPacks, instrumentOf, type Instrument, type SlotName } from './components/Shelf'
import { METERS, TapTempo, Transport, type StepInfo } from './audio/transport'
import { RhythmScreen, type DrumSettings, type RhythmSettings } from './components/RhythmScreen'
import { DRUMS, PRESETS, fitPattern, presetPattern, scheduleDrums } from './music/drums'
import { SongScreen, type SongActions } from './components/SongScreen'
import { RecordBar } from './components/RecordBar'
import { StageScreen, type StageSettings } from './components/StageScreen'
import { layoutById } from './music/layouts'
import { checkSong, type Issue } from './music/quality'
import { ExportPanel, type ExportChoice } from './components/ExportPanel'
import { renderPiece } from './audio/render'
import { songToMidi } from './music/midi'
import { About } from './components/About'
import { Tour } from './components/Tour'
import type { Spot } from './audio/stage'
import { FX_PACKS, Playback, type PlayMode } from './audio/playback'
import { SECTION_NAMES, currentSection, emptySong, finishTake, migrate, type Ev, type Layer, type Role, type Section, type Song } from './music/song'

function loadSong(): Song {
  try { return migrate(JSON.parse(localStorage.getItem('maestro.song') ?? 'null')) } catch { return emptySong() }
}
function saveSong(s: Song): void {
  try { localStorage.setItem('maestro.song', JSON.stringify(s)) } catch { /* storage full or unavailable */ }
}
type Pending = { [K in Ev['k']]: Omit<Extract<Ev, { k: K }>, 's'> }[Ev['k']]

interface Saved { melody: string; chords: string; key: Key; chordLevel: number; bass: boolean; lastScale: Record<Family, string>; rhythm: RhythmSettings; stage: StageSettings }
const DEFAULTS: Saved = { melody: 'violin-solo', chords: 'piano', key: { tonic: 2, scale: 'minor' }, chordLevel: 0.45, bass: true,
  lastScale: { free: 'free', scale: 'minor', maqam: 'bayati' },
  rhythm: { tempo: 120, meter: 4, volume: 0.5, clickMode: 'all', countIn: true,
    drums: { on: false, volume: 1, pattern: presetPattern(PRESETS.find((p) => p.id === 'yanni78')!), muted: {}, preset: 'yanni78', writeTaps: false } },
  stage: { mode: 'speakers', layout: 'concert', room: 0.45, spotlight: true, spotDb: 8, moved: {}, levels: {} } }

function loadSaved(): Saved {
  try {
    const s = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem('maestro.play') ?? '{}') as Partial<Saved>) }
    const old = s.key as Key & { mode?: string } // Phase 3 saved { tonic, mode }
    if (!old.scale) s.key = { tonic: old.tonic, scale: old.mode === 'major' ? 'major' : 'minor' }
    s.rhythm = { ...DEFAULTS.rhythm, ...s.rhythm, drums: { ...DEFAULTS.rhythm.drums, ...(s.rhythm?.drums ?? {}) } }
    s.stage = { ...DEFAULTS.stage, ...(s.stage ?? {}) }
    return s
  } catch { return DEFAULTS }
}
function save(s: Saved): void {
  try { localStorage.setItem('maestro.play', JSON.stringify(s)) } catch { /* storage unavailable */ }
}

/** octave shift that puts the two melody rows (about two octaves from the tonic) where the instrument sounds */
function melodyShift(m: Manifest, k: Key): number {
  const r = packRange(m)
  if (!r) return 0
  const start = 60 + k.tonic
  const mid = (r[0] + r[1]) / 2
  return Math.max(-3, Math.min(2, Math.round((mid - (start + 12)) / 12)))
}
/** the middle of the chord voicings for this instrument */
function chordCenter(m: Manifest): number {
  const r = packRange(m)
  if (!r) return 55
  return Math.max(r[0] + 14, Math.min(r[1] - 10, 55))
}

/** a plain confirm is enough for these: they cannot be undone */
function confirmLose(what: string): boolean { return window.confirm(`${what} Changes you have not saved will be lost.`) }

/** change the section you are editing */
function editSection(song: Song, f: (s: Section) => Section): Song {
  const cur = currentSection(song)
  return { ...song, sections: song.sections.map((x) => (x.id === cur.id ? f(x) : x)) }
}

export default function App(): React.JSX.Element {
  const [latencyMode] = useState<LatencyMode>(() => {
    try { return localStorage.getItem('maestro.latency') === 'safe' ? 'safe' : 'lowest' } catch { return 'lowest' }
  })
  const changeLatency = useCallback((m: LatencyMode) => {
    if (m === latencyMode) return
    try { localStorage.setItem('maestro.latency', m) } catch { /* keep the current mode */ }
    location.reload()
  }, [latencyMode])
  const engine = useRef<Sampler | null>(null)
  if (!engine.current) engine.current = new Sampler(latencyMode)
  const sampler = engine.current
  if (location.hash === '#selftest') (window as unknown as Record<string, unknown>).maestroSampler = sampler // developer checks only
  const clock = useRef<Transport | null>(null)
  if (!clock.current) clock.current = new Transport(sampler.ctx)
  const transport = clock.current
  const tapper = useRef(new TapTempo())
  const [screen, setScreen] = useState<'play' | 'rhythm' | 'layers' | 'stage'>('play')
  const [groups, setGroups] = useState<string[]>([])
  useEffect(() => { sampler.onGroup = () => setGroups(sampler.groups()) }, [sampler])
  const player = useRef<Playback | null>(null)
  if (!player.current) player.current = new Playback(sampler)
  const playback = player.current
  const [song, setSongState] = useState<Song>(loadSong)
  const songRef = useRef(song)
  const setSong = useCallback((f: (s: Song) => Song) => {
    setSongState((old) => { const n = f(old); songRef.current = n; saveSong(n); playback.set(n); return n })
    setDirty(true)
  }, [playback])
  const [mode, setModeState] = useState<PlayMode>('loop')
  const [piece, setPiece] = useState<{ name: string; path: string | null }>(() => {
    try { return JSON.parse(localStorage.getItem('maestro.piece') ?? 'null') ?? { name: 'Untitled piece', path: null } } catch { return { name: 'Untitled piece', path: null } }
  })
  const [dirty, setDirty] = useState(false)
  useEffect(() => { try { localStorage.setItem('maestro.piece', JSON.stringify(piece)) } catch { /* ignore */ } }, [piece])
  const [recording, setRecording] = useState(false)
  const rec = useRef<{ on: boolean; melody: Ev[]; chords: Ev[] }>({ on: false, melody: [], chords: [] })
  const undoStack = useRef<{ section: number; layer: number; created: boolean }[]>([])
  const [step, setStep] = useState<StepInfo | null>(null)
  const [running, setRunning] = useState(false)

  const [saved, setSaved] = useState<Saved>(loadSaved)
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [active, setActive] = useState<SlotName>('melody')
  const [packs, setPacks] = useState<{ melody: Manifest | null; chords: Manifest | null }>({ melody: null, chords: null })
  const [progress, setProgress] = useState<{ melody: number; chords: number }>({ melody: 0, chords: 0 })
  const [error, setError] = useState<string | null>(null)
  const [dyn, setDyn] = useState(0.58)
  const [melOct, setMelOct] = useState(0)
  const [pressed, setPressed] = useState<Set<string>>(new Set())
  const [sustain, setSustain] = useState(false)
  const [legato, setLegato] = useState(true)
  const [phrase, setPhrase] = useState<PhraseNote[]>([])
  const [lat, setLat] = useState<LatencyInfo>({ inputMs: null, baseMs: 0, outputMs: 0 })

  // everything the key handlers read lives in one ref so the handlers never go stale
  const live = useRef({ saved, packs, dyn, melOct, legato })
  live.current = { saved, packs, dyn, melOct, legato }
  const sounding = useRef(new Map<string, { pack: string; midi: number }>()) // melody key -> note
  const chordHeld = useRef<{ code: string; notes: number[]; pack: string } | null>(null)
  const drone = useRef<{ code: string; notes: number[]; pack: string } | null>(null)
  const [droneCode, setDroneCode] = useState<string | null>(null)
  const lastVoicing = useRef<number[] | null>(null)
  const phraseId = useRef(0)

  const update = useCallback((patch: Partial<Saved>) => {
    setSaved((s) => { const n = { ...s, ...patch }; save(n); return n })
  }, [])

  // ---------------------------------------------------------------- the clock
  useEffect(() => {
    const r = saved.rhythm
    transport.tempo = r.tempo
    transport.meter = METERS[r.meter] ?? METERS[4]
    transport.volume = r.volume
    transport.clickMode = r.clickMode
    transport.countIn = r.countIn
  }, [saved.rhythm, transport])
  useEffect(() => {
    transport.onStep = setStep
    transport.onSchedule = (k, t, d) => {
      playback.step(k, t, d)
      scheduleDrums(sampler, k, t, d, transport.steps, live.current.saved.rhythm.drums, playback.factorAt(k))
    }
    playback.set(songRef.current)
    return () => transport.stop()
  }, [transport, playback])

  // ---------------------------------------------------------------- recording
  const capture = useCallback((role: Role, e: Pending) => {
    if (!rec.current.on) return
    const pos = transport.positionAt(sampler.ctx.currentTime)
    if (pos < -0.5) return // played during the count-in, too early to keep
    rec.current[role].push({ ...e, s: Math.max(0, pos) } as Ev)
  }, [sampler, transport])

  const finishRecording = useCallback((steps: number) => {
    const r = rec.current
    if (!r.on) return
    r.on = false
    setRecording(false)
    playback.silenced.clear()
    const { saved: sv } = live.current
    const got = { melody: r.melody, chords: r.chords } // the state update below runs later: keep our own copy
    const old = songRef.current // built outside the state updater so the undo history is written once
    let nextId = old.nextId
    const cur = currentSection(old)
    const sec: Section = { ...cur, steps: cur.steps || steps, layers: [...cur.layers] }
    for (const role of ['melody', 'chords'] as Role[]) {
      const events = got[role]
      if (!events.some((e) => e.k === 'on')) continue
      const pack = role === 'melody' ? sv.melody : sv.chords
      const take = { id: nextId++, events: finishTake(events, sec.steps) }
      const at = sec.layers.findIndex((l) => l.role === role && l.pack === pack) // same instrument here: a new take of it
      if (at >= 0) {
        const l = sec.layers[at]
        sec.layers[at] = { ...l, takes: [...l.takes, take], active: l.takes.length }
        undoStack.current.push({ section: sec.id, layer: l.id, created: false })
      } else {
        const m = sampler.manifest(pack)
        const layer: Layer = { id: nextId++, role, pack, name: m?.name ?? pack, takes: [take], active: 0, mute: false, solo: false,
          volume: 1, tighten: 0.3, level: sv.chordLevel }
        sec.layers.push(layer)
        undoStack.current.push({ section: sec.id, layer: layer.id, created: true })
      }
    }
    setSong(() => ({ ...old, nextId, sections: old.sections.map((x) => (x.id === sec.id ? sec : x)) }))
    rec.current = { on: false, melody: [], chords: [] }
  }, [playback, sampler, setSong])

  const barSteps = METERS[saved.rhythm.meter].groups.reduce((a, b) => a + b, 0)
  playback.barSteps = barSteps
  const stopAll = useCallback(() => {
    if (rec.current.on) {
      const pos = transport.positionAt(sampler.ctx.currentTime)
      const s = currentSection(songRef.current).steps || Math.max(transport.steps, Math.ceil(pos / transport.steps) * transport.steps)
      finishRecording(s)
    }
    transport.stop()
    playback.stop()
    setRunning(false)
    const { saved: sv } = live.current
    if (sv.chords !== sv.melody) sampler.setPackDyn(sv.chords, sv.chordLevel)
  }, [transport, playback, sampler, finishRecording])

  const stopAllRef = useRef(stopAll)
  stopAllRef.current = stopAll
  const toggleClock = useCallback(() => {
    if (transport.running) stopAll()
    else { transport.start(); setRunning(true) }
  }, [transport, stopAll])

  const toggleRecord = useCallback(() => {
    if (rec.current.on) { // finish, keep playing the loop
      const pos = transport.positionAt(sampler.ctx.currentTime)
      const s = currentSection(songRef.current).steps || Math.max(transport.steps, Math.ceil(pos / transport.steps) * transport.steps)
      finishRecording(s)
      return
    }
    if (transport.running) { transport.stop(); playback.stop() }
    playback.mode = 'loop' // you always record into the section you are editing
    setModeState('loop')
    rec.current = { on: true, melody: [], chords: [] }
    { // the instruments you play now: their old takes in this section stay silent while you record a new one
      const sv = live.current.saved
      const cur = currentSection(songRef.current)
      playback.silenced = new Set(cur.layers.filter((l) => (l.role === 'melody' && l.pack === sv.melody) || (l.role === 'chords' && l.pack === sv.chords)).map((l) => l.id))
    }
    const keepCount = transport.countIn
    transport.countIn = true
    transport.start()
    transport.countIn = keepCount
    setRunning(true)
    setRecording(true)
  }, [transport, playback, sampler, finishRecording])

  const toggleRecordRef = useRef(toggleRecord)
  toggleRecordRef.current = toggleRecord

  // a recording over an existing loop ends by itself after one pass
  useEffect(() => {
    const steps = currentSection(song).steps
    if (!recording || !step || step.countIn || !steps) return
    if (transport.positionAt(sampler.ctx.currentTime) >= steps - 0.02) finishRecording(steps)
  }, [step, recording, song, transport, sampler, finishRecording])

  const undo = useCallback(() => {
    const u = undoStack.current.pop()
    setSong((old) => {
      const sid = u?.section ?? currentSection(old).id
      return { ...old, sections: old.sections.map((sec) => {
        if (sec.id !== sid) return sec
        let layers = sec.layers
        const dropTake = (l: Layer): Layer => ({ ...l, takes: l.takes.slice(0, -1), active: l.takes.length - 2 })
        if (u) layers = u.created ? layers.filter((l) => l.id !== u.layer) : layers.map((l) => (l.id === u.layer && l.takes.length > 1 ? dropTake(l) : l))
        else if (layers.length) { const last = layers[layers.length - 1]; layers = last.takes.length > 1 ? [...layers.slice(0, -1), dropTake(last)] : layers.slice(0, -1) }
        return { ...sec, layers, steps: layers.length ? sec.steps : 0 }
      }) }
    })
  }, [setSong])

  // ---------------------------------------------------------------- the whole song
  const setMode = useCallback((m: PlayMode) => {
    if (rec.current.on) return
    if (transport.running) { transport.stop(); playback.stop(); setRunning(false) }
    playback.mode = m
    setModeState(m)
  }, [transport, playback])
  useEffect(() => {
    playback.onEnd = (time) => { // the arrangement finished: stop when its last note has had time to ring
      window.setTimeout(() => { if (playback.mode === 'song') stopAllRef.current() }, Math.max(0, (time - sampler.ctx.currentTime) * 1000) + 1500)
    }
  }, [playback, sampler])
  useEffect(() => {
    sampler.pin(FX_PACKS, 'fx')
    for (const p of FX_PACKS) void sampler.load(p, () => undefined, FX_PACKS)
  }, [sampler])

  const projectJson = useCallback((): string => {
    const { saved: sv } = live.current
    return JSON.stringify({ app: 'Maestro', version: 2, song: songRef.current,
      settings: { key: sv.key, rhythm: sv.rhythm, stage: sv.stage, melody: sv.melody, chords: sv.chords, chordLevel: sv.chordLevel, bass: sv.bass } })
  }, [])
  const savePiece = useCallback(async (as: boolean) => {
    const r = await window.maestro.savePiece(projectJson(), as ? null : piece.path, piece.name)
    if (r) { setPiece({ name: r.name, path: r.path }); setDirty(false) }
  }, [projectJson, piece])
  const loadProject = useCallback((data: string, name: string, path: string | null) => {
    const o = JSON.parse(data) as { app?: string; song?: unknown; settings?: Partial<Saved> }
    if (o.app !== 'Maestro') throw new Error('This file is not a Maestro piece.')
    stopAllRef.current()
    undoStack.current = []
    const song = migrate(o.song)
    setSong(() => song)
    if (o.settings) {
      const st = o.settings
      update({ ...(st.key ? { key: st.key } : {}), ...(st.rhythm ? { rhythm: { ...DEFAULTS.rhythm, ...st.rhythm, drums: { ...DEFAULTS.rhythm.drums, ...st.rhythm.drums } } } : {}),
        ...(typeof st.chordLevel === 'number' ? { chordLevel: st.chordLevel } : {}), ...(st.stage ? { stage: { ...DEFAULTS.stage, ...st.stage } } : {}), ...(typeof st.bass === 'boolean' ? { bass: st.bass } : {}) })
      if (st.melody) pickRef.current(st.melody, 'melody')
      if (st.chords) pickRef.current(st.chords, 'chords')
    }
    setPiece({ name, path })
    setDirty(false)
  }, [setSong, update])
  const openPiece = useCallback(async () => {
    if (dirty && !confirmLose('Open another piece?')) return
    const r = await window.maestro.openPiece()
    if (!r) return
    try { loadProject(r.data, r.name, r.path) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [dirty, loadProject])
  const newPiece = useCallback(() => {
    if (dirty && !confirmLose('Start a new piece?')) return
    stopAllRef.current()
    undoStack.current = []
    setSong(() => emptySong())
    setPiece({ name: 'Untitled piece', path: null })
    setDirty(false)
  }, [dirty, setSong])

  const songActions: SongActions = {
    changeLayer: (id, p) => setSong((sg) => editSection(sg, (sec) => ({ ...sec, layers: sec.layers.map((l) => (l.id === id ? { ...l, ...p } : l)) }))),
    deleteLayer: (id) => { setSong((sg) => editSection(sg, (sec) => { const layers = sec.layers.filter((l) => l.id !== id); return { ...sec, layers, steps: layers.length ? sec.steps : 0 } })) },
    undo,
    setMode,
    selectSection: (id) => { if (rec.current.on) return; setSong((sg) => ({ ...sg, current: id })) },
    recordIn: (id) => { if (rec.current.on) return; songRef.current = { ...songRef.current, current: id }; setSong((sg) => ({ ...sg, current: id })); setScreen('play'); window.setTimeout(() => toggleRecordRef.current(), 50) },
    listen: (id) => {
      if (rec.current.on) return
      songRef.current = { ...songRef.current, current: id }
      setSong((sg) => ({ ...sg, current: id }))
      if (transport.running) { transport.stop(); playback.stop() }
      playback.mode = 'loop'
      setModeState('loop')
      window.setTimeout(() => { transport.start(); setRunning(true) }, 50)
    },
    addSection: () => {
      if (rec.current.on) return
        setSong((sg) => {
        const used = new Set(sg.sections.map((x) => x.name))
        const name = SECTION_NAMES.find((n) => !used.has(n)) ?? `Section ${sg.sections.length + 1}`
        const id = sg.nextId
        return { ...sg, nextId: id + 2, current: id, sections: [...sg.sections, { id, name, steps: 0, layers: [] }],
          arrangement: [...sg.arrangement, { id: id + 1, section: id, repeat: 1, muted: [], enter: 'none' }] }
      })
    },
    duplicateSection: () => setSong((sg) => {
      const cur = currentSection(sg)
      let id = sg.nextId
      const sid = id++
      const layers = cur.layers.map((l) => ({ ...l, id: id++, takes: l.takes.map((t) => ({ ...t, id: id++ })) }))
      return { ...sg, nextId: id, current: sid, sections: [...sg.sections, { id: sid, name: `${cur.name} 2`.slice(0, 24), steps: cur.steps, layers }] }
    }),
    renameSection: (name) => setSong((sg) => editSection(sg, (sec) => ({ ...sec, name }))),
    deleteSection: () => {
      const cur = currentSection(songRef.current)
      if (songRef.current.sections.length < 2 || !window.confirm(`Delete the section "${cur.name}" and its layers?`)) return
      setSong((sg) => {
        const sections = sg.sections.filter((x) => x.id !== cur.id)
        return { ...sg, sections, current: sections[0].id, arrangement: sg.arrangement.filter((p) => p.section !== cur.id) }
      })
    },
    place: (section) => setSong((sg) => ({ ...sg, nextId: sg.nextId + 1, arrangement: [...sg.arrangement, { id: sg.nextId, section, repeat: 1, muted: [], enter: 'none' }] })),
    changePlacement: (id, p) => setSong((sg) => ({ ...sg, arrangement: sg.arrangement.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
    movePlacement: (id, by) => setSong((sg) => {
      const a = [...sg.arrangement]
      const i = a.findIndex((x) => x.id === id)
      const j = i + by
      if (i < 0 || j < 0 || j >= a.length) return sg
      ;[a[i], a[j]] = [a[j], a[i]]
      return { ...sg, arrangement: a }
    }),
    removePlacement: (id) => setSong((sg) => ({ ...sg, arrangement: sg.arrangement.filter((x) => x.id !== id) })),
    newPiece,
    open: () => void openPiece(),
    save: (as) => void savePiece(as),
    toggleExport: () => setExportOpen((x) => !x)
  }
  const setRhythm = useCallback((p: Partial<RhythmSettings>) => {
    setSaved((s) => { const n = { ...s, rhythm: { ...s.rhythm, ...p } }; save(n); return n })
  }, [])
  const setDrums = useCallback((p: Partial<DrumSettings>) => {
    setSaved((s) => { const n = { ...s, rhythm: { ...s.rhythm, drums: { ...s.rhythm.drums, ...p } } }; save(n); return n })
  }, [])
  const setMeter = useCallback((i: number) => {
    const steps = METERS[i].groups.reduce((a, b) => a + b, 0)
    setSaved((s) => { const n = { ...s, rhythm: { ...s.rhythm, meter: i, drums: { ...s.rhythm.drums, pattern: fitPattern(s.rhythm.drums.pattern, steps), preset: null } } }; save(n); return n })
  }, [])
  const setPreset = useCallback((id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    setSaved((s) => { const n = { ...s, rhythm: { ...s.rhythm, meter: p.meter, drums: { ...s.rhythm.drums, pattern: presetPattern(p), preset: id, on: true } } }; save(n); return n })
  }, [])
  const toggleCell = useCallback((drum: string, cell: number) => {
    setSaved((s) => {
      const row = [...(s.rhythm.drums.pattern[drum] ?? [])]
      row[cell] = ((row[cell] ?? 0) + 1) % 3
      const n = { ...s, rhythm: { ...s.rhythm, drums: { ...s.rhythm.drums, pattern: { ...s.rhythm.drums.pattern, [drum]: row }, preset: null } } }
      save(n)
      return n
    })
  }, [])
  // the drums are small: load them once and keep them
  useEffect(() => {
    sampler.pin(DRUMS.map((d) => d.pack), 'drums')
    for (const d of DRUMS) void sampler.load(d.pack, () => undefined, DRUMS.map((x) => x.pack)).then(() => sampler.setPackVol(d.pack, live.current.saved.rhythm.drums.volume))
  }, [sampler])
  useEffect(() => { for (const d of DRUMS) sampler.setPackVol(d.pack, saved.rhythm.drums.volume) }, [saved.rhythm.drums.volume, sampler])
  const [lastHit, setLastHit] = useState<string | null>(null)
  const hitDrum = useCallback((id: string) => {
    const dr = DRUMS.find((x) => x.id === id)!
    const dyn = live.current.dyn
    sampler.noteOn(dr.pack, 60, dyn, false)
    setLastHit(id)
    window.setTimeout(() => setLastHit((h) => (h === id ? null : h)), 140)
    const set = live.current.saved.rhythm.drums
    if (set.writeTaps && transport.running) {
      const pos = transport.positionAt(sampler.ctx.currentTime)
      if (pos < 0) return
      const len = transport.steps * 2
      const cell = Math.round(pos * 2) % len
      setSaved((s) => {
        const row = [...(s.rhythm.drums.pattern[id] ?? new Array(len).fill(0))]
        row[cell] = dyn > 0.75 ? 2 : 1
        const n = { ...s, rhythm: { ...s.rhythm, drums: { ...s.rhythm.drums, on: true, preset: null, pattern: { ...s.rhythm.drums.pattern, [id]: row } } } }
        save(n)
        return n
      })
    }
  }, [sampler, transport])

  const tap = useCallback(() => {
    const t = tapper.current.tap()
    if (t) setRhythm({ tempo: Math.max(40, Math.min(240, t)) })
  }, [setRhythm])

  // ---------------------------------------------------------------- loading
  const loadSlot = useCallback((slot: SlotName, id: string) => {
    setError(null)
    setProgress((p) => ({ ...p, [slot]: 0 }))
    const other = slot === 'melody' ? live.current.saved.chords : live.current.saved.melody
    sampler.load(id, (d, t) => setProgress((p) => ({ ...p, [slot]: d / t })), [id, other])
      .then((m) => {
        if (live.current.saved[slot] !== id) return
        setPacks((p) => ({ ...p, [slot]: m }))
        setProgress((p) => ({ ...p, [slot]: 1 }))
        if (slot === 'melody') setMelOct(melodyShift(m, live.current.saved.key))
        const { melody, chords, chordLevel } = live.current.saved
        if (chords !== melody) sampler.setPackDyn(chords, chordLevel)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [sampler])

  useEffect(() => {
    fetchLibrary()
      .then((list) => {
        setInstruments(groupPacks(list))
        const ids = new Set(list.map((p) => p.id))
        const s = live.current.saved
        const melody = ids.has(s.melody) ? s.melody : DEFAULTS.melody
        const chords = ids.has(s.chords) ? s.chords : DEFAULTS.chords
        update({ melody, chords })
        live.current.saved = { ...s, melody, chords }
        loadSlot('melody', melody)
        loadSlot('chords', chords) // loads in the background while you already play the melody
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [loadSlot, update])

  // recorded layers need their instruments loaded, whatever you play live
  useEffect(() => {
    const { melody, chords } = live.current.saved
    for (const sec of song.sections) for (const l of sec.layers) if (!sampler.isLoaded(l.pack)) void sampler.load(l.pack, () => undefined, [melody, chords]).then(() => playback.set(songRef.current))
  }, [song.sections, sampler, playback])

  const pick = useCallback((id: string, slot: SlotName = active) => {
    if (live.current.saved[slot] === id) return
    releaseAll()
    if (slot === 'chords' && live.current.saved.chords !== live.current.saved.melody) sampler.setPackDyn(live.current.saved.chords, null)
    update({ [slot]: id } as Partial<Saved>)
    live.current.saved = { ...live.current.saved, [slot]: id }
    setPacks((p) => ({ ...p, [slot]: null }))
    lastVoicing.current = null
    loadSlot(slot, id)
  }, [active, loadSlot, sampler, update])
  const pickRef = useRef(pick)
  pickRef.current = pick

  // ---------------------------------------------------------------- what each key plays
  const melodyNote = useCallback((row: 'high' | 'low', index: number): number => {
    const { saved: s, melOct: o } = live.current
    const i = index + (row === 'high' ? scaleById(s.key.scale).steps.length : 0)
    return 60 + s.key.tonic + degree(s.key, i).semis + 12 * o
  }, [])
  const chordNotes = useCallback((index: number): number[] => {
    const { saved: s, packs: p } = live.current
    const row = bottomRow(s.key)
    if (row.kind !== 'chords') return []
    const ch = row.chords[index]
    const center = p.chords ? chordCenter(p.chords) : 55
    const notes = voice(ch, center, lastVoicing.current, s.bass)
    const pack = s.chords
    return notes.filter((n) => sampler.canPlay(pack, n))
  }, [sampler])

  const setDynamic = useCallback((d: number) => {
    const v = Math.min(1, Math.max(0, d))
    live.current.dyn = v
    setDyn(v)
    sampler.setDyn(v)
    capture('melody', { k: 'dyn', v })
  }, [sampler, capture])

  function stopDrone(): void {
    const d = drone.current
    if (d) for (const n of d.notes) { sampler.noteOff(d.pack, n); capture('chords', { k: 'off', n }) }
    drone.current = null
    setDroneCode(null)
  }

  function releaseAll(): void {
    sampler.allOff()
    sounding.current.clear()
    chordHeld.current = null
    drone.current = null
    setDroneCode(null)
    setPressed(new Set())
    setSustain(false)
  }

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.repeat) { e.preventDefault(); if (!rec.current.on) undo(); return }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS' && !e.repeat) { e.preventDefault(); void savePiece(e.shiftKey); return }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO' && !e.repeat) { e.preventDefault(); void openPiece(); return }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && e.shiftKey) { e.preventDefault(); if (!e.repeat) toggleRecord(); return }
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT' && e.code !== 'Space') return
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { sampler.setSustain(true); setSustain(true); capture('melody', { k: 'sus', on: true }) } return }
      if (e.repeat) { if (KEY_BY_CODE.has(e.code)) e.preventDefault(); return }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); toggleClock(); return }
      const drumKey = DRUMS.find((x) => x.code === e.code)
      if (drumKey) { e.preventDefault(); hitDrum(drumKey.id); return }
      if (e.code === 'Backquote') { e.preventDefault(); const v = !live.current.legato; setLegato(v); sampler.setLegato(v); return }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault()
        setMelOct((o) => Math.max(-3, Math.min(3, o + (e.code === 'ArrowRight' ? 1 : -1))))
        return
      }
      const k = KEY_BY_CODE.get(e.code)
      if (!k) return
      e.preventDefault()
      const { saved: s, packs: p } = live.current
      const t0 = e.timeStamp
      if (k.row === 'chord' && bottomRow(s.key).kind === 'drones') { // drones latch: press once, they keep sounding
        const row = bottomRow(s.key)
        if (row.kind !== 'drones' || !p.chords) return
        const d = row.drones[k.index]
        const same = drone.current?.code === e.code
        stopDrone()
        if (!d || same) return
        const notes = droneNotes(s.key, d, chordCenter(p.chords)).filter((n) => sampler.canPlay(s.chords, n))
        for (const n of notes) { sampler.noteOn(s.chords, n, s.chordLevel, false); capture('chords', { k: 'on', n, d: s.chordLevel, lg: false }) }
        drone.current = { code: e.code, notes, pack: s.chords }
        setDroneCode(e.code)
      } else if (k.row === 'chord') {
        if (!p.chords) return
        const notes = chordNotes(k.index)
        const prev = chordHeld.current
        const keep = new Set(prev && prev.pack === s.chords ? prev.notes : [])
        if (prev) for (const n of prev.notes) if (!notes.includes(n)) { sampler.noteOff(prev.pack, n); capture('chords', { k: 'off', n }) }
        for (const n of notes) if (!keep.has(n)) { sampler.noteOn(s.chords, n, s.chordLevel, false); capture('chords', { k: 'on', n, d: s.chordLevel, lg: false }) }
        chordHeld.current = { code: e.code, notes, pack: s.chords }
        lastVoicing.current = notes
        setPressed((x) => { const n = new Set(x); if (prev) n.delete(prev.code); n.add(e.code); return n })
      } else {
        if (!p.melody) return
        const midi = melodyNote(k.row, k.index)
        if (!sampler.canPlay(s.melody, midi)) return
        sampler.noteOn(s.melody, midi, live.current.dyn)
        capture('melody', { k: 'on', n: midi, d: live.current.dyn, lg: live.current.legato })
        sounding.current.set(e.code, { pack: s.melody, midi })
        const name = degree(s.key, k.index + (k.row === 'high' ? scaleById(s.key.scale).steps.length : 0)).name + octaveOf(Math.round(midi))
        setPhrase((ph) => [...ph, { id: ++phraseId.current, name, dyn: live.current.dyn }].slice(-8))
        setPressed((x) => new Set(x).add(e.code))
      }
      const l = sampler.latency()
      setLat({ inputMs: performance.now() - t0, baseMs: l.base * 1000, outputMs: l.output * 1000 })
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') { e.preventDefault(); sampler.setSustain(false); setSustain(false); capture('melody', { k: 'sus', on: false }); return }
      const held = chordHeld.current
      if (held && held.code === e.code) {
        for (const n of held.notes) { sampler.noteOff(held.pack, n); capture('chords', { k: 'off', n }) }
        chordHeld.current = null
        setPressed((x) => { const n = new Set(x); n.delete(e.code); return n })
        return
      }
      const s = sounding.current.get(e.code)
      if (s) {
        sampler.noteOff(s.pack, s.midi)
        capture('melody', { k: 'off', n: s.midi })
        sounding.current.delete(e.code)
      }
      setPressed((x) => { if (!x.has(e.code)) return x; const n = new Set(x); n.delete(e.code); return n })
    }
    const wheel = (e: WheelEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('.shelf, .side')) return // scrolling the side lists is not bowing
      setDynamic(live.current.dyn - e.deltaY * 0.0006)
    }
    const blur = (): void => releaseAll()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('wheel', wheel)
      window.removeEventListener('blur', blur)
    }
  }, [sampler, setDynamic, chordNotes, melodyNote, toggleClock, toggleRecord, undo, capture, hitDrum, savePiece, openPiece])

  // ---------------------------------------------------------------- the stage
  const spotOf = useCallback((g: string): Spot => saved.stage.moved[g] ?? layoutById(saved.stage.layout).place(g), [saved.stage])
  const melodyGroup = packs.melody ? sampler.groupOf(saved.melody, packs.melody) : null
  useEffect(() => {
    const st = sampler.stage
    if (!st) return
    for (const g of groups) st.place(g, spotOf(g))
    st.setMode(saved.stage.mode)
    st.setSpotlight(saved.stage.spotlight ? melodyGroup : null, saved.stage.spotDb)
    for (const g of groups) st.setLevel(g, saved.stage.levels[g] ?? 0)
  }, [groups, spotOf, saved.stage.mode, saved.stage.spotlight, saved.stage.spotDb, saved.stage.levels, melodyGroup, sampler])
  useEffect(() => { sampler.stage?.setRoom(saved.stage.room) }, [saved.stage.room, groups.length > 0, sampler])
  const setStage = useCallback((p: Partial<StageSettings>) => {
    setSaved((s) => { const n = { ...s, stage: { ...s.stage, ...p } }; save(n); return n })
  }, [])

  // ---------------------------------------------------------------- quality guard
  const [ignored, setIgnored] = useState<Set<string>>(new Set())
  const issues = useMemo<Issue[]>(() => checkSong(song, {
    kindOf: (p) => sampler.manifest(p)?.kind ?? 'sus', barSteps, stepSec: 60 / saved.rhythm.tempo / 2, key: saved.key,
    spotDb: saved.stage.spotlight ? saved.stage.spotDb : 0, melodyPack: saved.melody
  }).filter((i) => !ignored.has(i.id)), [song, barSteps, saved.rhythm.tempo, saved.key, saved.stage.spotlight, saved.stage.spotDb, saved.melody, sampler, ignored, groups])

  // ---------------------------------------------------------------- export
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ label: string; part: number } | null>(null)
  const [exportDone, setExportDone] = useState<string | null>(null)
  const doExport = useCallback(async (c: ExportChoice) => {
    const sv = live.current.saved
    const meter = METERS[sv.rhythm.meter]
    const name = c.what === 'song' ? piece.name : `${piece.name} - ${currentSection(songRef.current).name}`
    setExporting(true)
    setExportDone(null)
    try {
      if (c.format === 'mid') {
        const bytes = songToMidi(songRef.current, { scope: c.what, times: c.times, tempo: sv.rhythm.tempo, sig: meter.sig, barSteps,
          drums: sv.rhythm.drums, names: (p) => sampler.manifest(p)?.name ?? p })
        const r = await window.maestro.exportFile(bytes.buffer as ArrayBuffer, name, 'mid')
        setExportDone(r ? `Saved: ${r.path}` : null)
      } else {
        const { wav, seconds } = await renderPiece({ song: songRef.current, scope: c.what, times: c.times, tempo: sv.rhythm.tempo, barSteps,
          drums: sv.rhythm.drums, mode: c.sound, room: sv.stage.room,
          spotlight: { group: sv.stage.spotlight ? melodyGroup : null, db: sv.stage.spotDb }, spotOf, levels: sv.stage.levels,
          groupOf: (id, m) => sampler.groupOf(id, m), onProgress: (label, part) => setExportProgress({ label, part }) })
        setExportProgress(null)
        const r = await window.maestro.exportFile(wav, name, 'wav')
        setExportDone(r ? `Saved ${Math.round(seconds)} s of audio: ${r.path}` : null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }, [piece.name, barSteps, sampler, melodyGroup, spotOf])
  if (location.hash === '#selftest') (window as unknown as Record<string, unknown>).maestroExport = { renderPiece, songToMidi, live, songRef, spotOf, melodyGroup, barSteps, sampler }

  // ---------------------------------------------------------------- app: updates, about, first run, opening files
  const [appUpdate, setAppUpdate] = useState<UpdateState | null>(null)
  const [about, setAbout] = useState(false)
  const [tour, setTour] = useState(() => { try { return !localStorage.getItem('maestro.toured') } catch { return false } })
  useEffect(() => { window.maestro.onUpdate(setAppUpdate) }, [])
  const openPath = useCallback(async (path: string) => {
    try { const r = await window.maestro.readPiece(path); loadProject(r.data, r.name, r.path) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [loadProject])
  const openPathRef = useRef(openPath)
  openPathRef.current = openPath
  useEffect(() => {
    void window.maestro.pendingPiece().then((p) => { if (p) void openPathRef.current(p) })
    window.maestro.onOpenFile((p) => void openPathRef.current(p))
  }, [])

  // ---------------------------------------------------------------- what the screen shows
  const melInst = instrumentOf(instruments, saved.melody)
  const choInst = instrumentOf(instruments, saved.chords)
  const caps = useMemo(() => {
    const n = scaleById(saved.key.scale).steps.length
    const mk = (row: 'high' | 'low'): Cap[] => Array.from({ length: 10 }, (_, i) => {
      const g = degree(saved.key, i + (row === 'high' ? n : 0))
      const midi = 60 + saved.key.tonic + g.semis + 12 * melOct
      return { label: g.name + octaveOf(Math.round(midi)), playable: !packs.melody || sampler.canPlay(saved.melody, midi), quarter: g.quarter }
    })
    const br = bottomRow(saved.key)
    const chords: Cap[] = br.kind === 'chords'
      ? br.chords.map((c) => ({ label: c.label, playable: true }))
      : br.drones.map((d) => ({ label: d ? d.label : 'Off', playable: true }))
    return { high: mk('high'), low: mk('low'), chords }
  }, [saved.key, saved.melody, melOct, packs.melody, sampler])

  const melRange = packs.melody ? packRange(packs.melody) : null
  const loadingMel = !packs.melody
  const setKey = (key: Key): void => {
    releaseAll()
    lastVoicing.current = null
    const fam = scaleById(key.scale).family
    update({ key, lastScale: { ...saved.lastScale, [fam]: key.scale } })
    if (packs.melody) setMelOct(melodyShift(packs.melody, key))
  }
  const shiftKey = (step: number): void => setKey({ ...saved.key, tonic: (saved.key.tonic + step + 12) % 12 })
  const family = scaleById(saved.key.scale).family
  const pressedAll = droneCode ? new Set([...pressed, droneCode]) : pressed
  const isDrones = bottomRow(saved.key).kind === 'drones'

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Maestro</span>
        <nav className="tabs" aria-label="Screens">
          <button type="button" aria-current={screen === 'play' ? 'page' : undefined} onClick={() => setScreen('play')}>Play</button>
          <button type="button" aria-current={screen === 'rhythm' ? 'page' : undefined} onClick={() => setScreen('rhythm')}>Rhythm</button>
          <button type="button" aria-current={screen === 'layers' ? 'page' : undefined} onClick={() => setScreen('layers')}>Song{issues.length ? <span className="badge">{issues.length}</span> : null}</button>
          <button type="button" aria-current={screen === 'stage' ? 'page' : undefined} onClick={() => setScreen('stage')}>Stage</button>
        </nav>
        <div className="right">
          <div className="transport">
            <button type="button" className={`roundbtn rec${recording ? ' on' : ''}`} aria-label={recording ? 'Finish recording' : 'Record'} onClick={toggleRecord} title="Shift + Enter">
              <span className="dot" />
            </button>
            <button type="button" className={`roundbtn${running ? ' on' : ''}`} aria-label={running ? 'Stop the metronome' : 'Start the metronome'} onClick={toggleClock} title="Enter">
              {running ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" /></svg>
                : <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>}
            </button>
            <button type="button" className="chip" onClick={() => setScreen('rhythm')} title="Tempo and meter">
              <b>{saved.rhythm.tempo}</b><span>tempo</span><i className="sep" aria-hidden="true" />
              <b>{METERS[saved.rhythm.meter].sig}</b><span>{METERS[saved.rhythm.meter].groups.join('+')}</span>
            </button>
            <span className="beats" aria-hidden="true">
              {Array.from({ length: METERS[saved.rhythm.meter].groups.reduce((x, y) => x + y, 0) }, (_, i) => (
                <i key={i} className={`${transport.accent(i) > 0 ? 'head' : ''}${step?.step === i ? (step.countIn ? ' count' : ' now') : ''}`} />
              ))}
            </span>
          </div>
          <span className="chip"><b>{keyName(saved.key)}</b></span>
          <button type="button" className="chip" aria-pressed={legato} onClick={() => { setLegato(!legato); sampler.setLegato(!legato) }}
            title="Smooth joins between held notes (key: `)">Legato <b>{legato ? 'on' : 'off'}</b></button>
          <span className="chip">Hold <b style={{ color: sustain ? 'var(--varnish)' : undefined }}>{sustain ? 'on' : 'off'}</b></span>
          <button type="button" className="iconbtn" aria-label="About Maestro and updates" onClick={() => setAbout(true)}>i</button>
        </div>
      </header>
      {about && <About update={appUpdate} onClose={() => setAbout(false)} />}
      {tour && <Tour onDone={() => { setTour(false); try { localStorage.setItem('maestro.toured', '1') } catch { /* fine */ } }} />}
      {appUpdate?.state === 'ready' && !about && (
        <div className="toast" role="status">Maestro {appUpdate.version} is ready
          <button type="button" className="recbtn" onClick={() => void window.maestro.installUpdate()}>Restart and update</button>
        </div>
      )}
      {screen === 'layers' && (
        <SongScreen song={song} barSteps={barSteps} mode={mode} recording={recording}
          pieceName={piece.name} dirty={dirty} act={songActions}
          issues={issues} onFix={(i) => { if (i.fix) setSong(i.fix) }} onIgnore={(id) => setIgnored((x) => new Set(x).add(id))}
          exportPanel={exportOpen ? <ExportPanel sectionName={currentSection(song).name} hasSong={song.sections.some((x) => x.steps > 0) && song.arrangement.length > 0}
            busy={exporting} progress={exportProgress} done={exportDone} onExport={(c) => void doExport(c)} onClose={() => setExportOpen(false)} /> : null}
          playhead={{
            loop: step && !step.countIn && currentSection(song).steps ? ((step.bar * barSteps + step.step) % currentSection(song).steps) : null,
            song: step && !step.countIn ? step.bar * barSteps + step.step : null
          }} />
      )}
      {screen === 'stage' && (
        <StageScreen set={saved.stage} groups={groups} spotOf={spotOf} melodyGroup={melodyGroup} onChange={setStage}
          onMove={(g, p) => setStage({ moved: { ...saved.stage.moved, [g]: p } })} onReset={() => setStage({ moved: {} })} />
      )}
      {screen === 'rhythm' && (
        <RhythmScreen set={saved.rhythm} onChange={setRhythm} onDrums={setDrums} onMeter={setMeter} onPreset={setPreset} onCell={toggleCell}
          running={running} current={step?.step ?? null} countIn={!!step?.countIn} onToggle={toggleClock} onTap={tap} lastHit={lastHit} />
      )}
      <div className="main play" hidden={screen !== 'play'}>
        <Shelf instruments={instruments} melody={saved.melody} chords={saved.chords} active={active} onPick={(id) => pick(id)} />
        <main className="stagecol">
          <div className={`slot-head${active === 'melody' ? ' active' : ''}`}>
            <button type="button" className="eyebrow slot-tab" aria-pressed={active === 'melody'} onClick={() => setActive('melody')}>
              Melody · you are playing
            </button>
            <h1 className="title">{melInst?.name ?? 'Loading…'}</h1>
            <p className="lede">
              {error ?? (loadingMel
                ? `Tuning up… ${Math.round(progress.melody * 100)}%`
                : melRange
                  ? `Plays from ${noteName(melRange[0])} to ${noteName(melRange[1])}. ${packs.melody?.kind === 'sus' ? 'Hold a key and turn the wheel to swell or fade the note.' : 'Each key press plays one stroke.'}`
                  : 'Every key plays this sound.')}
            </p>
            {loadingMel && !error && <div className="bar" style={{ marginTop: 14, maxWidth: 420 }}><div style={{ width: `${progress.melody * 100}%` }} /></div>}
            {melInst && <Styles inst={melInst} current={saved.melody} onPick={(id) => pick(id, 'melody')} />}
          </div>
          <RecordBar song={song} recording={recording} step={step} barSteps={barSteps} onRecord={toggleRecord}
            onSelect={(id) => songActions.selectSection(id)} />
          <Bow dyn={dyn} onSet={setDynamic} />
          <Rows high={caps.high} low={caps.low} chords={caps.chords} pressed={pressedAll} bottomName={isDrones ? 'Drones' : 'Chords'} />
          <Phrase notes={phrase} />
        </main>
        <aside className="side">
          <div className="panel">
            <h2>Scale</h2>
            <div className="styles" role="radiogroup" aria-label="How the keys are tuned" style={{ marginTop: 0 }}>
              {(['free', 'scale', 'maqam'] as const).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={family === f}
                  onClick={() => setKey({ ...saved.key, scale: saved.lastScale[f] })}>{f === 'free' ? 'Free' : f === 'scale' ? 'Scale' : 'Maqam'}</button>
              ))}
            </div>
            <div className="keypick">
              <button type="button" className="btn small" aria-label="Down a semitone" onClick={() => shiftKey(-1)}>−</button>
              <span className="keyname">{tonicName(saved.key)}</span>
              <button type="button" className="btn small" aria-label="Up a semitone" onClick={() => shiftKey(1)}>+</button>
            </div>
            {family !== 'free' && (
              <div className="chips" role="radiogroup" aria-label={family === 'maqam' ? 'Maqam' : 'Scale'}>
                {SCALES.filter((x) => x.family === family).map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={saved.key.scale === x.id}
                    onClick={() => setKey({ ...saved.key, scale: x.id })}>{x.name}</button>
                ))}
              </div>
            )}
            <div className="scale-notes" aria-label="Notes of the scale">
              {scaleNotes(saved.key).map((x, i) => <span key={i} className={x.quarter ? 'q' : ''}>{x.name}</span>)}
            </div>
            <p className="help">{scaleById(saved.key.scale).hint}{scaleNotes(saved.key).some((x) => x.quarter) ? ' Gold notes are quarter tones (½♭ = a quarter tone flat).' : ''}
              {isDrones ? ' The bottom row holds drones: press once and they keep sounding, press again or Off to stop.' : ''}</p>
          </div>
          <div className={`panel${active === 'chords' ? ' active' : ''}`}>
            <h2>{isDrones ? 'Drones' : 'Chords'}</h2>
            <div className="stat"><span>Instrument</span><b>{choInst?.name ?? '—'}</b></div>
            {!packs.chords && <div className="bar"><div style={{ width: `${progress.chords * 100}%` }} /></div>}
            {choInst && <Styles inst={choInst} current={saved.chords} onPick={(id) => pick(id, 'chords')} />}
            <button type="button" className="btn" aria-pressed={active === 'chords'} onClick={() => setActive(active === 'chords' ? 'melody' : 'chords')}>
              {active === 'chords' ? 'Done choosing' : `Change ${isDrones ? 'drone' : 'chord'} instrument`}
            </button>
            <label className="slider">
              <span>{isDrones ? 'Drone' : 'Chord'} loudness</span>
              <input type="range" min={0} max={1} step={0.01} value={saved.chordLevel}
                onChange={(e) => { const v = Number(e.target.value); update({ chordLevel: v }); if (saved.chords !== saved.melody) sampler.setPackDyn(saved.chords, v) }} />
            </label>
            {!isDrones && <label className="check">
              <input type="checkbox" checked={saved.bass} onChange={(e) => update({ bass: e.target.checked })} />
              <span>Add the root below (bass note)</span>
            </label>}
          </div>
          <div className="panel">
            <h2>Keys</h2>
            <div className="hint"><span>Melody</span><span>Q row · A row</span></div>
            <div className="hint"><span>{isDrones ? 'Drones' : 'Chords'}</span><span>Z X C V …</span></div>
            <div className="hint"><span>Hold the sound</span><span>Space</span></div>
            <div className="hint"><span>Melody octave</span><span>← →</span></div>
            <div className="hint"><span>Softer / harder</span><span>Mouse wheel</span></div>
            <div className="hint"><span>Legato on / off</span><span>`</span></div>
            <div className="hint"><span>Metronome start / stop</span><span>Enter</span></div>
            <div className="hint"><span>Record / finish</span><span>Shift + Enter</span></div>
            <div className="hint"><span>Drums</span><span>1 2 3 4 5</span></div>
            <div className="hint"><span>Undo last take</span><span>Ctrl + Z</span></div>
            <div className="hint"><span>Save / open</span><span>Ctrl + S / O</span></div>
          </div>
          <LatencyPanel info={lat} mode={latencyMode} onMode={changeLatency} />
          <p className="help">{[packs.melody?.credit, packs.chords?.credit].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ')}</p>
        </aside>
      </div>
    </div>
  )
}
