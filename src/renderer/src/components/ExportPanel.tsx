import { useState } from 'react'

export interface ExportChoice { what: 'song' | 'section'; times: number; sound: 'headphones' | 'speakers'; format: 'wav' | 'mid' }

/** Export the piece as a WAV (exactly the sound you hear) or a MIDI file (the notes, for other programs). */
export function ExportPanel({ sectionName, hasSong, busy, progress, done, onExport, onClose }: {
  sectionName: string; hasSong: boolean; busy: boolean; progress: { label: string; part: number } | null; done: string | null
  onExport: (c: ExportChoice) => void; onClose: () => void
}): React.JSX.Element {
  const [c, setC] = useState<ExportChoice>({ what: hasSong ? 'song' : 'section', times: 2, sound: 'speakers', format: 'wav' })
  const set = (p: Partial<ExportChoice>): void => setC((x) => ({ ...x, ...p }))
  return (
    <section className="exportp" aria-label="Export">
      <div className="arr-head"><span className="eyebrow">Export</span><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
      <div className="placement-row">
        <span className="help">What</span>
        <div className="chips" role="radiogroup" aria-label="What to export">
          <button type="button" role="radio" aria-checked={c.what === 'song'} disabled={!hasSong} onClick={() => set({ what: 'song' })}>The whole song</button>
          <button type="button" role="radio" aria-checked={c.what === 'section'} onClick={() => set({ what: 'section' })}>{sectionName} only</button>
        </div>
        {c.what === 'section' && <>
          <span className="help">played</span>
          <button type="button" className="btn small" onClick={() => set({ times: Math.max(1, c.times - 1) })} aria-label="Fewer times">−</button>
          <span className="mono">{c.times}×</span>
          <button type="button" className="btn small" onClick={() => set({ times: Math.min(16, c.times + 1) })} aria-label="More times">+</button>
        </>}
      </div>
      <div className="placement-row">
        <span className="help">Format</span>
        <div className="chips" role="radiogroup" aria-label="Format">
          <button type="button" role="radio" aria-checked={c.format === 'wav'} onClick={() => set({ format: 'wav' })}>Audio (WAV)</button>
          <button type="button" role="radio" aria-checked={c.format === 'mid'} onClick={() => set({ format: 'mid' })}>MIDI notes</button>
        </div>
        {c.format === 'wav' && <>
          <span className="help">for</span>
          <div className="chips" role="radiogroup" aria-label="Listening on">
            <button type="button" role="radio" aria-checked={c.sound === 'speakers'} onClick={() => set({ sound: 'speakers' })}>Speakers (stereo)</button>
            <button type="button" role="radio" aria-checked={c.sound === 'headphones'} onClick={() => set({ sound: 'headphones' })}>Headphones (3D)</button>
          </div>
        </>}
      </div>
      <p className="help">{c.format === 'wav'
        ? 'The audio is made with the same instruments, stage, room and mix you hear now, at studio quality (24-bit, 48 kHz), loudest moment at −1 dB.'
        : 'MIDI keeps only the notes, how hard you played them, the bow and the pedal, one track per instrument, for other music programs. Quarter tones become pitch bends.'}</p>
      <div className="placement-row">
        <button type="button" className="recbtn" disabled={busy} onClick={() => onExport(c)}>{busy ? 'Exporting…' : 'Export'}</button>
        {progress && <div className="exp-progress"><span>{progress.label}</span><div className="bar"><div style={{ width: `${Math.round(progress.part * 100)}%` }} /></div></div>}
        {done && !busy && <span className="help">{done}</span>}
      </div>
    </section>
  )
}
