import type { PackInfo } from '../audio/sampler'

export interface Instrument { name: string; family: string; styles: { label: string; id: string }[] }
export type SlotName = 'melody' | 'chords'

/** "Solo violin · pizzicato" -> instrument "Solo violin", style "Pizzicato"; plain names are the main style. */
export function groupPacks(packs: PackInfo[]): Instrument[] {
  const out: Instrument[] = []
  for (const p of packs) {
    const [name, style] = p.name.split(' · ')
    let inst = out.find((i) => i.name === name && i.family === p.family)
    if (!inst) { inst = { name, family: p.family, styles: [] }; out.push(inst) }
    const label = style ? style[0].toUpperCase() + style.slice(1) : p.kind === 'sus' ? 'Held' : 'Played'
    inst.styles.push({ label, id: p.id })
  }
  return out
}

export const FAMILIES = ['Strings', 'Woodwinds', 'Brass', 'Keys', 'Percussion']

export function instrumentOf(list: Instrument[], id: string | null): Instrument | null {
  return list.find((i) => i.styles.some((s) => s.id === id)) ?? null
}

export function Shelf({ instruments, melody, chords, active, onPick }: {
  instruments: Instrument[]; melody: string | null; chords: string | null; active: SlotName; onPick: (id: string) => void
}): React.JSX.Element {
  const mel = instrumentOf(instruments, melody)?.name
  const cho = instrumentOf(instruments, chords)?.name
  return (
    <aside className="shelf" aria-label="Instruments">
      <p className="shelf-hint">Pick an instrument for <b>{active === 'melody' ? 'the melody' : 'the bottom row'}</b></p>
      {FAMILIES.map((f) => (
        <div key={f} className="fam">
          <span className="eyebrow">{f}</span>
          {instruments.filter((i) => i.family === f).map((i) => (
            <button key={i.name} type="button" className={`shelf-item${i.name === (active === 'melody' ? mel : cho) ? ' on' : ''}`}
              onClick={() => onPick(i.styles[0].id)}>
              <span>{i.name}</span>
              <span className="dots" aria-hidden="true">
                {i.name === mel && <i className="dot mel" />}
                {i.name === cho && <i className="dot cho" />}
              </span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  )
}

export function Styles({ inst, current, onPick }: { inst: Instrument; current: string; onPick: (id: string) => void }): React.JSX.Element | null {
  if (inst.styles.length < 2) return null
  return (
    <div className="styles" role="radiogroup" aria-label="How to play">
      {inst.styles.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={s.id === current} onClick={() => onPick(s.id)}>{s.label}</button>
      ))}
    </div>
  )
}
