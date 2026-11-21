import { useEffect, useState } from 'react'

/** Version, updates and credits. */
export function About({ update, onClose }: { update: UpdateState | null; onClose: () => void }): React.JSX.Element {
  const [info, setInfo] = useState<{ version: string; packaged: boolean } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    void window.maestro.appInfo().then(setInfo)
    const esc = (e: KeyboardEvent): void => { if (e.code === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  const status = update?.state === 'ready' ? `Version ${update.version} is downloaded and ready.`
    : update?.state === 'downloading' ? `Downloading an update… ${update.percent ?? 0}%`
      : update?.state === 'checking' ? 'Checking for updates…'
        : update?.state === 'none' ? 'You have the newest version.'
          : update?.state === 'error' ? 'Could not reach GitHub to check for updates. It will try again next time.' : msg
  return (
    <div className="modal-back" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="About Maestro" onClick={(e) => e.stopPropagation()}>
        <span className="brand">Maestro</span>
        <p className="lede">Play the orchestra from your computer keyboard. Made by Khaled.</p>
        <div className="stat"><span>Version</span><b>{info?.version ?? '…'}</b></div>
        <p className="help">{status ?? 'Maestro checks for a new version each time it starts and installs it when you close it.'}</p>
        <div className="placement-row">
          {update?.state === 'ready'
            ? <button type="button" className="recbtn" onClick={() => void window.maestro.installUpdate()}>Restart and update</button>
            : <button type="button" className="btn" onClick={() => void window.maestro.checkUpdate().then((s) => setMsg(s.message ?? null))}>Check for updates</button>}
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
        <p className="help small">Sounds: VSCO 2 Community Edition by Versilian Studios (CC0) · Salamander Grand Piano V3 by Alexander Holm (CC-BY 3.0). Fonts: Bodoni Moda, Figtree, IBM Plex Mono (SIL OFL).</p>
      </div>
    </div>
  )
}
