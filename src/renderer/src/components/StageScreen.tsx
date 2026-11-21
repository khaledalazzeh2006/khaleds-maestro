import { useRef } from 'react'
import type { Spot, StageMode } from '../audio/stage'
import { LAYOUTS } from '../music/layouts'

export interface StageSettings { mode: StageMode; layout: string; room: number; spotlight: boolean; spotDb: number; moved: Record<string, Spot>; levels: Record<string, number> }

/** Top-down stage: you sit at the bottom; drag an instrument to move it. */
export function StageScreen({ set, groups, spotOf, melodyGroup, onChange, onMove, onReset }: {
  set: StageSettings; groups: string[]; spotOf: (g: string) => Spot; melodyGroup: string | null
  onChange: (p: Partial<StageSettings>) => void; onMove: (g: string, p: Spot) => void; onReset: () => void
}): React.JSX.Element {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<string | null>(null)
  const W = 800, H = 560, cx = W / 2, bottom = 470
  const depth = 280 // the front of the stage is nearest you (bottom)
  const toXY = (p: Spot): [number, number] => [cx + p.x * 340, bottom - 80 - p.y * depth]
  const fromEvent = (e: React.PointerEvent): Spot => {
    const r = svg.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const y = ((e.clientY - r.top) / r.height) * H
    return { x: Math.max(-1, Math.min(1, (x - cx) / 340)), y: Math.max(0, Math.min(1, (bottom - 80 - y) / depth)) }
  }
  return (
    <div className="main stage">
      <main className="stagecol">
        <div>
          <span className="eyebrow">Stage</span>
          <h1 className="title small">Where everyone sits</h1>
          <p className="lede">Drag an instrument to move it. Left and right is where you hear it; further back is quieter, softer and has more of the hall.</p>
        </div>
        <svg ref={svg} className="stage-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Stage"
          onPointerMove={(e) => { if (drag.current) onMove(drag.current, fromEvent(e)) }}
          onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}>
          <path d={`M ${cx - 390} ${bottom - 40} A 392 392 0 0 1 ${cx + 390} ${bottom - 40}`} fill="var(--well)" stroke="var(--seam)" />
          {[0.33, 0.66].map((f) => (
            <path key={f} d={`M ${cx - 390 * f} ${bottom - 40} A ${392 * f} ${392 * f} 0 0 1 ${cx + 390 * f} ${bottom - 40}`} fill="none" stroke="#33203A" />
          ))}
          <g transform={`translate(${cx} ${bottom + 20})`} aria-label="You">
            <circle r={22} fill="var(--box)" stroke="var(--rosin)" />
            <circle cx={-24} r={6} fill="var(--rosin)" /><circle cx={24} r={6} fill="var(--rosin)" />
            <path d="M -6 -20 L 0 -30 L 6 -20" fill="var(--rosin)" />
            <text y={50} textAnchor="middle" className="stage-you">You</text>
          </g>
          {groups.map((g) => {
            const [x, y] = toXY(spotOf(g))
            const lead = g === melodyGroup
            return (
              <g key={g} transform={`translate(${x} ${y})`} className="stage-item" style={{ cursor: 'grab' }}
                onPointerDown={(e) => { drag.current = g; (e.target as Element).setPointerCapture?.(e.pointerId) }}>
                <circle r={lead && set.spotlight ? 22 : 16} fill={lead ? 'var(--varnish)' : 'var(--brass)'}
                  style={lead && set.spotlight ? { filter: 'drop-shadow(0 0 14px var(--varnish))' } : undefined} />
                <text y={lead && set.spotlight ? 40 : 34} textAnchor="middle" className="stage-label">{g}</text>
              </g>
            )
          })}
        </svg>
      </main>
      <aside className="side">
        <div className="panel">
          <h2>Listening on</h2>
          <div className="styles" role="radiogroup" aria-label="Listening on" style={{ marginTop: 0 }}>
            <button type="button" role="radio" aria-checked={set.mode === 'headphones'} onClick={() => onChange({ mode: 'headphones' })}>Headphones · 3D</button>
            <button type="button" role="radio" aria-checked={set.mode === 'speakers'} onClick={() => onChange({ mode: 'speakers' })}>Speakers</button>
          </div>
          <p className="help">Headphones · 3D places sounds all around your head (in front, to the side, far away). On speakers it sounds strange, so use Speakers there.</p>
        </div>
        <div className="panel">
          <h2>Layout</h2>
          <div className="chips" role="radiogroup" aria-label="Layout">
            {LAYOUTS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={set.layout === l.id} onClick={() => onChange({ layout: l.id, moved: {} })}>{l.name}</button>
            ))}
          </div>
          <p className="help">{LAYOUTS.find((l) => l.id === set.layout)?.hint}</p>
          <button type="button" className="btn" onClick={onReset} disabled={!Object.keys(set.moved).length}>Put everyone back</button>
        </div>
        <div className="panel">
          <h2>Mix</h2>
          {groups.map((g) => {
            const v = set.levels[g] ?? 0
            return (
              <label key={g} className="mixrow">
                <span>{g}</span>
                <input type="range" min={-18} max={6} step={1} value={v} onChange={(e) => onChange({ levels: { ...set.levels, [g]: Number(e.target.value) } })} aria-label={`${g} level`} />
                <span className="mono">{v > 0 ? '+' : ''}{v} dB</span>
              </label>
            )
          })}
          <button type="button" className="btn" onClick={() => onChange({ levels: {} })} disabled={!Object.keys(set.levels).length}>Level everyone</button>
        </div>
        <div className="panel">
          <h2>Room</h2>
          <label className="slider">
            <span>{set.room < 0.3 ? 'Dry and close' : set.room < 0.7 ? 'Concert hall' : 'Big cathedral'}</span>
            <input type="range" min={0} max={1} step={0.01} value={set.room} onChange={(e) => onChange({ room: Number(e.target.value) })} />
          </label>
        </div>
        <div className="panel">
          <h2>Spotlight</h2>
          <label className="check">
            <input type="checkbox" checked={set.spotlight} onChange={(e) => onChange({ spotlight: e.target.checked })} />
            <span>Lift the melody{melodyGroup ? ` (${melodyGroup})` : ''} above the rest</span>
          </label>
          <label className="slider">
            <span>By {set.spotDb} dB</span>
            <input type="range" min={0} max={12} step={1} value={set.spotDb} onChange={(e) => onChange({ spotDb: Number(e.target.value) })} />
          </label>
          <p className="help">A soloist usually sits about 8 dB above the others: their own sound stays clear while the rest step back.</p>
        </div>
      </aside>
    </div>
  )
}
