const MARKS: [string, number][] = [['pp', 0.08], ['p', 0.25], ['mp', 0.42], ['mf', 0.58], ['f', 0.75], ['ff', 0.92]]

export function nearestMark(dyn: number): string {
  return MARKS.reduce((a, b) => (Math.abs(b[1] - dyn) < Math.abs(a[1] - dyn) ? b : a))[0]
}

export function Bow({ dyn, onSet }: { dyn: number; onSet: (d: number) => void }): React.JSX.Element {
  const now = nearestMark(dyn)
  return (
    <section className="bow" aria-label="Expression">
      <div className="bow-head">
        <span>Turn the mouse wheel to play softer or harder</span>
        <span className="bow-mark" aria-live="polite">{now}</span>
      </div>
      <div className="bow-art" aria-hidden="true">
        <div className="bow-stick" />
        <div className="bow-frog" />
        <div className="bow-tip" />
        <div className="bow-hair"><div style={{ width: `${Math.round(dyn * 100)}%` }} /></div>
      </div>
      <div className="bow-marks" role="group" aria-label="Dynamics">
        {MARKS.map(([label, v]) => (
          <button key={label} type="button" aria-pressed={label === now} onClick={() => onSet(v)}>{label}</button>
        ))}
      </div>
    </section>
  )
}
