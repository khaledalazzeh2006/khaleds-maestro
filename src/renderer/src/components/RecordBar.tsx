import type { StepInfo } from '../audio/transport'
import type { Song } from '../music/song'

/** On the Play screen: which section you record into, the record button, and where you are while recording. */
export function RecordBar({ song, recording, step, barSteps, onSelect, onRecord }: {
  song: Song; recording: boolean; step: StepInfo | null; barSteps: number; onSelect: (id: number) => void; onRecord: () => void
}): React.JSX.Element {
  const cur = song.sections.find((s) => s.id === song.current) ?? song.sections[0]
  const total = cur.steps ? Math.round(cur.steps / barSteps) : 0
  if (recording) {
    const counting = !step || step.countIn
    const left = step && step.countIn ? barSteps - step.step : barSteps
    const bar = step && !step.countIn ? (total ? (step.bar % total) + 1 : step.bar + 1) : 0
    return (
      <section className={`recbar live${counting ? ' counting' : ''}`} aria-live="polite">
        <span className="rec-dot" aria-hidden="true" />
        <div className="rec-text">
          {counting
            ? <><b>Get ready…</b><span>{left} to go, then play into <em>{cur.name}</em></span></>
            : <><b>Recording {cur.name}</b><span>{total ? `bar ${bar} of ${total} — it stops by itself at the end` : `bar ${bar} — press Finish when you are done`}</span></>}
        </div>
        <button type="button" className="recbtn on" onClick={onRecord}>Finish <span className="kbd">Shift Enter</span></button>
      </section>
    )
  }
  return (
    <section className="recbar" aria-label="Recording">
      <span className="help">Record into</span>
      <div className="chips" role="radiogroup" aria-label="Section">
        {song.sections.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={s.id === cur.id} onClick={() => onSelect(s.id)}>
            {s.name}{s.steps ? '' : ' · empty'}
          </button>
        ))}
      </div>
      <button type="button" className="recbtn" onClick={onRecord}>● Record <span className="kbd">Shift Enter</span></button>
    </section>
  )
}
