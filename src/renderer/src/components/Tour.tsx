import { useState } from 'react'

const STEPS = [
  { title: 'Your keyboard is the orchestra', body: 'The A row and the Q row play the melody, always in tune with the scale on the right. The Z row plays whole chords (or drones in a maqam).' },
  { title: 'The mouse wheel is your bow', body: 'Hold a note and turn the wheel: it swells and fades like a real violin. Start soft, grow, come back. That is where the feeling is.' },
  { title: 'Record part by part', body: 'Press ● Record (Shift + Enter). After one bar of count-in, play. Each recording becomes a layer of the section; record again with other instruments on top.' },
  { title: 'Build the song', body: 'On Song, put the sections in order, choose how each one comes in (build, hit, drop, fade), let the quality guard check it, and export it as audio.' }
]

/** A short welcome the first time Maestro opens. */
export function Tour({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [i, setI] = useState(0)
  const s = STEPS[i]
  return (
    <div className="modal-back" role="presentation">
      <div className="modal tour" role="dialog" aria-modal="true" aria-label="Welcome to Maestro">
        <span className="eyebrow">Welcome · {i + 1} of {STEPS.length}</span>
        <h2 className="title small">{s.title}</h2>
        <p className="lede">{s.body}</p>
        <div className="tour-dots" aria-hidden="true">{STEPS.map((_, j) => <i key={j} className={j === i ? 'on' : ''} />)}</div>
        <div className="placement-row">
          <button type="button" className="btn ghost" onClick={onDone}>Skip</button>
          {i > 0 && <button type="button" className="btn" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" className="recbtn" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : onDone())}>{i < STEPS.length - 1 ? 'Next' : 'Start playing'}</button>
        </div>
      </div>
    </div>
  )
}
