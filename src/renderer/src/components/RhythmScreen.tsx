import { METERS, type ClickMode } from '../audio/transport'
import { DRUMS, PRESETS, type Pattern } from '../music/drums'
import { Wheel } from './Wheel'

export interface DrumSettings { on: boolean; volume: number; pattern: Pattern; muted: Record<string, boolean>; preset: string | null; writeTaps: boolean }
export interface RhythmSettings { tempo: number; meter: number; volume: number; clickMode: ClickMode; countIn: boolean; drums: DrumSettings }

export function RhythmScreen({ set, onChange, onDrums, onMeter, onPreset, onCell, running, current, countIn, onToggle, onTap, lastHit }: {
  set: RhythmSettings; onChange: (p: Partial<RhythmSettings>) => void; onDrums: (p: Partial<DrumSettings>) => void
  onMeter: (i: number) => void; onPreset: (id: string) => void; onCell: (drum: string, cell: number) => void
  running: boolean; current: number | null; countIn: boolean; onToggle: () => void; onTap: () => void; lastHit: string | null
}): React.JSX.Element {
  const m = METERS[set.meter]
  const d = set.drums
  return (
    <div className="main rhythm">
      <aside className="meters" aria-label="Meter and rhythms">
        <span className="eyebrow">Meter</span>
        <div className="meter-grid">
          {METERS.map((x, i) => (
            <button key={i} type="button" className={`meter${i === set.meter ? ' on' : ''}`} aria-pressed={i === set.meter} onClick={() => onMeter(i)}>
              <span className="meter-sig">{x.sig}</span>
              <span className="meter-groups">{x.groups.join('+')}</span>
            </button>
          ))}
        </div>
        {(['Arabic', 'Odd meters', 'Western'] as const).map((fam) => (
          <div key={fam} className="fam">
            <span className="eyebrow">{fam === 'Arabic' ? 'Arabic rhythms' : fam === 'Odd meters' ? 'Odd-meter grooves' : 'Western rhythms'}</span>
            {PRESETS.filter((p) => p.family === fam).map((p) => (
              <button key={p.id} type="button" className={`shelf-item${d.preset === p.id ? ' on' : ''}`} onClick={() => onPreset(p.id)}>
                <span>{p.name}</span><span className="meter-groups">{METERS[p.meter].sig}</span>
              </button>
            ))}
          </div>
        ))}
      </aside>
      <main className="wheelcol">
        <Wheel groups={m.groups} sig={m.sig} current={current} countIn={countIn} onCell={onCell}
          rings={DRUMS.map((x) => ({ id: x.id, color: x.color, cells: d.pattern[x.id] ?? [], muted: !d.on || !!d.muted[x.id] }))} />
        <div className="legend" aria-label="Drums">
          {DRUMS.map((x) => (
            <button key={x.id} type="button" className={`legend-item${d.muted[x.id] ? ' muted' : ''}${lastHit === x.id ? ' hit' : ''}`}
              aria-pressed={!d.muted[x.id]} onClick={() => onDrums({ muted: { ...d.muted, [x.id]: !d.muted[x.id] } })}
              title="Click to mute or unmute this drum in the pattern">
              <i style={{ background: x.color }} /><span className="kbd">{x.key}</span>{x.name}
            </button>
          ))}
        </div>
        <button type="button" className={`bigplay${running ? ' on' : ''}`} onClick={onToggle}>
          {running ? 'Stop' : 'Start'}<span className="kbd">Enter</span>
        </button>
      </main>
      <aside className="side">
        <div className="panel">
          <h2>Drums</h2>
          <label className="check">
            <input type="checkbox" checked={d.on} onChange={(e) => onDrums({ on: e.target.checked })} />
            <span>Play the drum pattern with the clock</span>
          </label>
          <label className="slider">
            <span>Drum volume</span>
            <input type="range" min={0} max={1.5} step={0.01} value={d.volume} onChange={(e) => onDrums({ volume: Number(e.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={d.writeTaps} onChange={(e) => onDrums({ writeTaps: e.target.checked })} />
            <span>Write what I tap into the pattern</span>
          </label>
          <p className="help">Keys 1–5 play the drums live on any screen. With writing on and the clock running, each tap lands on the nearest sixteenth of the bar. Click a dot to cycle it: off, hit, accent.</p>
          <button type="button" className="btn" onClick={() => onDrums({ pattern: Object.fromEntries(DRUMS.map((x) => [x.id, (d.pattern[x.id] ?? []).map(() => 0)])), preset: null })}>Clear the pattern</button>
        </div>
        <div className="panel">
          <h2>Tempo</h2>
          <div className="tempo">
            <button type="button" className="btn small" aria-label="Slower" onClick={() => onChange({ tempo: Math.max(40, set.tempo - 2) })}>−</button>
            <span className="tempo-num">{set.tempo}</span>
            <button type="button" className="btn small" aria-label="Faster" onClick={() => onChange({ tempo: Math.min(240, set.tempo + 2) })}>+</button>
          </div>
          <label className="slider">
            <input type="range" min={40} max={240} value={set.tempo} onChange={(e) => onChange({ tempo: Number(e.target.value) })} aria-label="Tempo" />
          </label>
          <button type="button" className="btn" onClick={onTap}>Tap the tempo</button>
        </div>
        <div className="panel">
          <h2>Metronome</h2>
          <label className="slider">
            <span>Volume</span>
            <input type="range" min={0} max={1} step={0.01} value={set.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} />
          </label>
          <div className="styles" role="radiogroup" aria-label="Which steps click" style={{ marginTop: 0 }}>
            <button type="button" role="radio" aria-checked={set.clickMode === 'all'} onClick={() => onChange({ clickMode: 'all' })}>Every eighth</button>
            <button type="button" role="radio" aria-checked={set.clickMode === 'groups'} onClick={() => onChange({ clickMode: 'groups' })}>Groups only</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={set.countIn} onChange={(e) => onChange({ countIn: e.target.checked })} />
            <span>Count in one bar before starting</span>
          </label>
        </div>
      </aside>
    </div>
  )
}
