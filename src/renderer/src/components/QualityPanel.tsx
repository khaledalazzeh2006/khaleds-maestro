import type { Issue } from '../music/quality'

const ICON: Record<Issue['kind'], string> = { jump: '↗', clash: '≠', buried: '◐', empty: '○' }

/** The quality guard's findings, each with a fix you can apply in one click. */
export function QualityPanel({ issues, onFix, onIgnore, onGo }: {
  issues: Issue[]; onFix: (i: Issue) => void; onIgnore: (id: string) => void; onGo: (section: number) => void
}): React.JSX.Element {
  return (
    <section className="qg" aria-label="Quality guard">
      <div className="arr-head">
        <span className="eyebrow">3 · Quality guard — {issues.length ? `${issues.length} thing${issues.length === 1 ? '' : 's'} to look at` : 'all clear'}</span>
      </div>
      {issues.length === 0 && <p className="help">No sudden jumps, no clashing notes, the melody sits on top. Keep going.</p>}
      <div className="qg-list">
        {issues.map((i) => (
          <article key={i.id} className={`qg-card ${i.kind}`}>
            <span className="qg-icon" aria-hidden="true">{ICON[i.kind]}</span>
            <div className="qg-body">
              <b>{i.title}</b>
              <p>{i.detail}</p>
              <div className="qg-actions">
                {i.fix && i.fixLabel && <button type="button" className="btn fix" onClick={() => onFix(i)}>{i.fixLabel}</button>}
                {i.section !== null && <button type="button" className="btn" onClick={() => onGo(i.section!)}>Show me</button>}
                <button type="button" className="btn ghost" onClick={() => onIgnore(i.id)}>It's on purpose</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
