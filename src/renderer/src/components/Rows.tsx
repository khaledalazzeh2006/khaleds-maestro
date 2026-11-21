import { CHORD_ROW, HIGH_ROW, LOW_ROW } from '../audio/keymap'

export interface Cap { label: string; playable: boolean; quarter?: boolean }

function Row({ name, keys, caps, pressed, chord, indent }: {
  name: string; keys: [string, string][]; caps: Cap[]; pressed: Set<string>; chord?: boolean; indent: number
}): React.JSX.Element {
  return (
    <div className="keyrow" style={{ paddingLeft: indent }}>
      <span className="label">{name}</span>
      {keys.map(([code, k], i) => (
        <div key={code} className={`keycap${chord ? ' chord' : ''}${caps[i]?.quarter ? ' quarter' : ''}${pressed.has(code) ? ' on' : ''}${caps[i]?.playable === false ? ' off' : ''}`}
          aria-label={`${k} plays ${caps[i]?.label ?? ''}`}>
          <span className="k">{k}</span><span className="n" style={(caps[i]?.label.length ?? 0) > 4 ? { fontSize: 12 } : undefined}>{caps[i]?.label}</span>
        </div>
      ))}
    </div>
  )
}

export function Rows({ high, low, chords, pressed, bottomName }: { high: Cap[]; low: Cap[]; chords: Cap[]; pressed: Set<string>; bottomName: string }): React.JSX.Element {
  return (
    <section className="keys" aria-label="Keyboard map">
      <Row name="Melody high" keys={HIGH_ROW} caps={high} pressed={pressed} indent={0} />
      <Row name="Melody low" keys={LOW_ROW} caps={low} pressed={pressed} indent={18} />
      <Row name={bottomName} keys={CHORD_ROW} caps={chords} pressed={pressed} chord indent={44} />
    </section>
  )
}
