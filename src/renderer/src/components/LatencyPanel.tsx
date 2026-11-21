export interface LatencyInfo { inputMs: number | null; baseMs: number; outputMs: number }

export type LatencyMode = 'lowest' | 'safe'

export function LatencyPanel({ info, mode, onMode }: { info: LatencyInfo; mode: LatencyMode; onMode: (m: LatencyMode) => void }): React.JSX.Element {
  const total = (info.inputMs ?? 0) + info.baseMs + info.outputMs
  const known = info.inputMs !== null
  const verdict = !known ? null : total <= 20 ? ['good', 'Feels instant'] : total <= 35 ? ['ok', 'Playable — a little late'] : ['bad', 'Too slow to play well']
  return (
    <div className="panel" aria-label="Latency">
      <h2>Latency</h2>
      <div className="stat"><span>Key press → audio code</span><b>{known ? `${info.inputMs!.toFixed(1)} ms` : 'press a key'}</b></div>
      <div className="stat"><span>Audio buffer</span><b>{info.baseMs.toFixed(1)} ms</b></div>
      <div className="stat"><span>Sound device</span><b>{info.outputMs.toFixed(1)} ms</b></div>
      <div className="stat"><span>Total</span><b>{known ? `${total.toFixed(1)} ms` : '—'}</b></div>
      {verdict && <span className={`verdict ${verdict[0]}`}>{verdict[1]}</span>}
      <div className="styles" role="radiogroup" aria-label="Audio buffer" style={{ marginTop: 0 }}>
        <button type="button" role="radio" aria-checked={mode === 'lowest'} onClick={() => onMode('lowest')}>Lowest delay</button>
        <button type="button" role="radio" aria-checked={mode === 'safe'} onClick={() => onMode('safe')}>Safe</button>
      </div>
      <p className="help">If you hear crackles or dropouts, choose Safe. The app restarts its sound to switch.</p>
      <p className="help">Under 20 ms feels like a real instrument. Bluetooth headphones add 100 ms or more that this panel cannot see, so test with wired headphones or speakers.</p>
    </div>
  )
}
