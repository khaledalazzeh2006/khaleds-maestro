import { useState } from 'react'
import { currentSection, noteSpans, segments, type Enter, type Layer, type Placement, type Song } from '../music/song'
import type { PlayMode } from '../audio/playback'
import type { Issue } from '../music/quality'
import { QualityPanel } from './QualityPanel'

const COLORS = ['var(--varnish)', 'var(--brass)', '#d98aa8', '#8fb3d9', '#9fd18b', '#c9a36a']
const SECTION_COLORS = ['#E8933F', '#E9C46A', '#d98aa8', '#8fb3d9', '#9fd18b', '#c9a36a', '#b49be0']
const ENTERS: { id: Enter; label: string; hint: string }[] = [
  { id: 'none', label: 'Straight', hint: 'Just carries on' },
  { id: 'build', label: 'Build', hint: 'The last two bars before it swell up with a snare roll, then a crash' },
  { id: 'hit', label: 'Hit', hint: 'Lands with cymbals, bass drum and timpani' },
  { id: 'drop', label: 'Drop', hint: 'Everything stops for half a bar, then comes back on a bass drum' },
  { id: 'fade', label: 'Fade in', hint: 'Grows from silence over its first two bars' }
]

function Roll({ layer, steps, barSteps, playhead, color }: { layer: Layer; steps: number; barSteps: number; playhead: number | null; color: string }): React.JSX.Element {
  const take = layer.takes[layer.active]
  const spans = take ? noteSpans(take.events, steps) : []
  const lo = Math.min(...spans.map((x) => x.n), 60) - 2
  const hi = Math.max(...spans.map((x) => x.n), 72) + 2
  const W = 1000, H = 90
  const x = (s: number): number => (s / Math.max(1, steps)) * W
  const y = (n: number): number => H - ((n - lo) / (hi - lo)) * H
  return (
    <svg className="roll" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: Math.floor(steps / barSteps) + 1 }, (_, b) => (
        <line key={b} x1={x(b * barSteps)} x2={x(b * barSteps)} y1={0} y2={H} stroke="var(--seam)" strokeWidth={b === 0 ? 0 : 1} vectorEffect="non-scaling-stroke" />
      ))}
      {spans.map((sp, i) => (
        <rect key={i} x={x(sp.s)} y={y(sp.n) - 3} width={Math.max(2, x(sp.e) - x(sp.s))} height={6} rx={2} fill={color} opacity={0.35 + sp.d * 0.65} />
      ))}
      {playhead !== null && <line x1={x(playhead)} x2={x(playhead)} y1={0} y2={H} stroke="var(--ivory)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

export interface SongActions {
  recordIn: (section: number) => void
  listen: (section: number) => void
  changeLayer: (id: number, p: Partial<Layer>) => void
  deleteLayer: (id: number) => void
  undo: () => void
  setMode: (m: PlayMode) => void
  selectSection: (id: number) => void
  addSection: () => void
  duplicateSection: () => void
  renameSection: (name: string) => void
  deleteSection: () => void
  place: (section: number) => void
  changePlacement: (id: number, p: Partial<Placement>) => void
  movePlacement: (id: number, by: number) => void
  removePlacement: (id: number) => void
  newPiece: () => void
  open: () => void
  save: (as: boolean) => void
  toggleExport: () => void
}

export function SongScreen({ song, barSteps, mode, playhead, recording, pieceName, dirty, act, issues, onFix, onIgnore, exportPanel }: {
  song: Song; barSteps: number; mode: PlayMode; playhead: { loop: number | null; song: number | null }
  recording: boolean; pieceName: string; dirty: boolean; act: SongActions
  issues: Issue[]; onFix: (i: Issue) => void; onIgnore: (id: string) => void
  exportPanel: React.ReactNode
}): React.JSX.Element {
  const sec = currentSection(song)
  const [picked, setPicked] = useState<number | null>(null)
  const segs = segments(song)
  const total = segs.length ? segs[segs.length - 1].start + segs[segs.length - 1].len : 0
  const colorOf = (id: number): string => SECTION_COLORS[Math.max(0, song.sections.findIndex((s) => s.id === id)) % SECTION_COLORS.length]
  const pl = song.arrangement.find((p) => p.id === picked) ?? null
  const plSec = pl ? song.sections.find((s) => s.id === pl.section) : null
  const bars = sec.steps ? Math.round(sec.steps / barSteps) : 0

  return (
    <div className="main layers">
      <main className="lanes">
        <div className="lanes-head">
          <div>
            <span className="eyebrow">Your piece</span>
            <h1 className="title small">{pieceName}{dirty ? <span className="dirty" title="Not saved yet"> •</span> : null}</h1>
          </div>
          <div className="lanes-actions">
            <button type="button" className="btn" onClick={act.newPiece}>New</button>
            <button type="button" className="btn" onClick={act.open}>Open… <span className="kbd">Ctrl O</span></button>
            <button type="button" className="btn" onClick={() => act.save(false)}>Save <span className="kbd">Ctrl S</span></button>
            <button type="button" className="btn" onClick={() => act.save(true)}>Save as…</button>
            <button type="button" className="btn fix" onClick={act.toggleExport}>Export…</button>
          </div>
        </div>
        {exportPanel}

        {/* sections */}
        <section className="secs" aria-label="Sections">
          <div className="arr-head">
            <span className="eyebrow">1 · Sections — record each part as its own loop</span>
          </div>
          <div className="sec-row">
            {song.sections.map((s) => (
              <div key={s.id} className={`sec${s.id === sec.id ? ' on' : ''}`} style={{ borderColor: s.id === sec.id ? colorOf(s.id) : undefined }}>
                <button type="button" className="sec-name" onClick={() => act.selectSection(s.id)} title="Edit this section">
                  <b style={{ color: colorOf(s.id) }}>{s.name}</b>
                  <span>{s.steps ? `${Math.round(s.steps / barSteps)} bars · ${s.layers.length} layer${s.layers.length === 1 ? '' : 's'}` : 'empty'}</span>
                </button>
                <div className="sec-actions">
                  <button type="button" className="secbtn rec" onClick={() => act.recordIn(s.id)} disabled={recording} title="Go to Play and record into this section">● Record</button>
                  {s.steps > 0 && <button type="button" className="secbtn" onClick={() => act.listen(s.id)} disabled={recording}>▶ Listen</button>}
                </div>
              </div>
            ))}
            <button type="button" className="btn" onClick={act.addSection} disabled={recording}>+ New section</button>
          </div>
        </section>

        {/* arrangement */}
        <section className="arr" aria-label="Timeline">
          <div className="arr-head">
            <span className="eyebrow">2 · Timeline — put the sections in order</span>
            <div className="styles" role="radiogroup" aria-label="What plays" style={{ marginTop: 0 }}>
              <button type="button" role="radio" aria-checked={mode === 'loop'} onClick={() => act.setMode('loop')}>Loop {sec.name}</button>
              <button type="button" role="radio" aria-checked={mode === 'song'} onClick={() => act.setMode('song')}>Play the whole song</button>
            </div>
          </div>
          <div className="arr-track">
            {song.arrangement.map((p) => {
              const s = song.sections.find((x) => x.id === p.section)
              const seg = segs.find((g) => g.placement.id === p.id)
              const w = seg && total ? (seg.len / total) * 100 : 6
              return (
                <button key={p.id} type="button" className={`block${picked === p.id ? ' on' : ''}${!seg ? ' empty' : ''}`}
                  style={{ flexGrow: Math.max(0.6, w), borderColor: colorOf(p.section) }} onClick={() => setPicked(picked === p.id ? null : p.id)}>
                  {p.enter !== 'none' && <span className="enter">{ENTERS.find((e) => e.id === p.enter)?.label}</span>}
                  <b style={{ color: colorOf(p.section) }}>{s?.name ?? '?'}</b>
                  <span>{p.repeat > 1 ? `× ${p.repeat}` : ''}{!seg ? ' empty' : ''}</span>
                </button>
              )
            })}
            {mode === 'song' && playhead.song !== null && total > 0 && (
              <i className="arr-playhead" style={{ left: `${(playhead.song / total) * 100}%` }} />
            )}
          </div>
          <div className="arr-add">
            <span className="help">Add to the end:</span>
            {song.sections.map((s) => (
              <button key={s.id} type="button" className="btn small-text" onClick={() => act.place(s.id)} style={{ borderColor: colorOf(s.id) }}>+ {s.name}</button>
            ))}
          </div>
          {pl && plSec && (
            <div className="placement">
              <div className="placement-row">
                <b style={{ color: colorOf(pl.section) }}>{plSec.name}</b>
                <span className="help">Repeat</span>
                <button type="button" className="btn small" onClick={() => act.changePlacement(pl.id, { repeat: Math.max(1, pl.repeat - 1) })} aria-label="Fewer repeats">−</button>
                <span className="mono">{pl.repeat}</span>
                <button type="button" className="btn small" onClick={() => act.changePlacement(pl.id, { repeat: Math.min(16, pl.repeat + 1) })} aria-label="More repeats">+</button>
                <button type="button" className="btn small" onClick={() => act.movePlacement(pl.id, -1)} aria-label="Move earlier">←</button>
                <button type="button" className="btn small" onClick={() => act.movePlacement(pl.id, 1)} aria-label="Move later">→</button>
                <button type="button" className="btn danger" onClick={() => { act.removePlacement(pl.id); setPicked(null) }}>Remove</button>
              </div>
              <div className="placement-row">
                <span className="help">How it comes in</span>
                <div className="chips" role="radiogroup" aria-label="How it comes in">
                  {ENTERS.map((e) => (
                    <button key={e.id} type="button" role="radio" aria-checked={pl.enter === e.id} title={e.hint} onClick={() => act.changePlacement(pl.id, { enter: e.id })}>{e.label}</button>
                  ))}
                </div>
              </div>
              <p className="help">{ENTERS.find((e) => e.id === pl.enter)?.hint}</p>
              {plSec.layers.length > 0 && (
                <div className="placement-row">
                  <span className="help">Layers here</span>
                  <div className="chips">
                    {plSec.layers.map((l) => {
                      const on = !pl.muted.includes(l.id)
                      return (
                        <button key={l.id} type="button" role="switch" aria-checked={on}
                          onClick={() => act.changePlacement(pl.id, { muted: on ? [...pl.muted, l.id] : pl.muted.filter((x) => x !== l.id) })}>{l.name}</button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <QualityPanel issues={issues} onFix={onFix} onIgnore={onIgnore} onGo={(id) => { act.selectSection(id); act.setMode('loop') }} />

        <div className="lanes-head">
          <div>
            <label className="rename">
              <span className="eyebrow">4 · Layers of this section</span>
              <input value={sec.name} maxLength={24} onChange={(e) => act.renameSection(e.target.value)} aria-label="Section name" />
            </label>
            <p className="lede">
              {sec.steps
                ? `${bars} bar${bars === 1 ? '' : 's'}. Press ● Record again with the same instruments to try a better take, or pick other instruments on Play to add a new layer.`
                : 'Empty. Press ● Record: you go to Play, hear one bar of count-in, then play. Press ● again to finish.'}
            </p>
          </div>
          <div className="lanes-actions">
            <button type="button" className="btn" onClick={act.undo} disabled={!sec.layers.length || recording}>Undo last take <span className="kbd">Ctrl Z</span></button>
            <button type="button" className="btn" onClick={act.duplicateSection}>Duplicate section</button>
            <button type="button" className="btn danger" onClick={act.deleteSection} disabled={recording || song.sections.length < 2}>Delete section</button>
          </div>
        </div>
        {sec.layers.map((l, i) => {
          const color = COLORS[i % COLORS.length]
          return (
            <section key={l.id} className={`lane${l.mute ? ' muted' : ''}`} aria-label={`Layer ${l.name}`}>
              <div className="lane-info">
                <span className="lane-name">
                  <i style={{ background: color }} />{l.name}<span>{l.role}</span>
                </span>
                <div className="takes" role="radiogroup" aria-label="Takes">
                  {l.takes.map((t, ti) => (
                    <button key={t.id} type="button" role="radio" aria-checked={ti === l.active} onClick={() => act.changeLayer(l.id, { active: ti })}>Take {ti + 1}</button>
                  ))}
                </div>
                <div className="lane-row">
                  <button type="button" className={`ms${l.mute ? ' on' : ''}`} aria-pressed={l.mute} onClick={() => act.changeLayer(l.id, { mute: !l.mute })} title="Mute">M</button>
                  <button type="button" className={`ms${l.solo ? ' on' : ''}`} aria-pressed={l.solo} onClick={() => act.changeLayer(l.id, { solo: !l.solo })} title="Solo: hear only this">S</button>
                  <label className="mini">Volume
                    <input type="range" min={0} max={1.5} step={0.01} value={l.volume} onChange={(e) => act.changeLayer(l.id, { volume: Number(e.target.value) })} />
                  </label>
                  <label className="mini" title="Moves notes part of the way onto the beat, keeping your feel">Timing help {Math.round(l.tighten * 100)}%
                    <input type="range" min={0} max={1} step={0.05} value={l.tighten} onChange={(e) => act.changeLayer(l.id, { tighten: Number(e.target.value) })} />
                  </label>
                  <button type="button" className="ms del" onClick={() => act.deleteLayer(l.id)} title="Delete this layer" aria-label={`Delete ${l.name}`}>×</button>
                </div>
              </div>
              <Roll layer={l} steps={sec.steps} barSteps={barSteps} playhead={mode === 'loop' ? playhead.loop : null} color={color} />
            </section>
          )
        })}
      </main>
    </div>
  )
}
