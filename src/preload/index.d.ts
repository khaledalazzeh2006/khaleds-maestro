export {}
declare global {
  interface UpdateState { state: 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'; version?: string; percent?: number; message?: string }
  interface Window {
    maestro: {
      platform: string
      versions: { electron: string; chrome: string }
      savePiece: (data: string, path: string | null, name: string) => Promise<{ path: string; name: string } | null>
      openPiece: () => Promise<{ path: string; name: string; data: string } | null>
      pendingPiece: () => Promise<string | null>
      readPiece: (path: string) => Promise<{ path: string; name: string; data: string }>
      onOpenFile: (cb: (path: string) => void) => void
      exportFile: (data: ArrayBuffer, name: string, kind: 'wav' | 'mid') => Promise<{ path: string } | null>
      appInfo: () => Promise<{ version: string; packaged: boolean }>
      checkUpdate: () => Promise<UpdateState>
      installUpdate: () => Promise<void>
      onUpdate: (cb: (s: UpdateState) => void) => void
    }
  }
}
