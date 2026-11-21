export interface PhraseNote { id: number; name: string; dyn: number }

/** The last notes you played, bigger when played harder. */
export function Phrase({ notes }: { notes: PhraseNote[] }): React.JSX.Element {
  return (
    <section className="phrase" aria-label="Last phrase">
      <span className="eyebrow">Last phrase</span>
      <div className="phrase-notes" aria-live="off">
        {notes.length === 0 && <span className="phrase-empty">Play a few notes and they appear here.</span>}
        {notes.map((n) => (
          <span key={n.id} style={{ fontSize: Math.round(14 + n.dyn * 30), opacity: 0.45 + n.dyn * 0.55 }}>{n.name}</span>
        ))}
      </div>
    </section>
  )
}
