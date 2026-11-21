import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bodoni-moda/wght-italic.css'
import '@fontsource-variable/figtree'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/tokens.css'
import './styles/app.css'
import App from './App'

if (location.hash === '#selftest') {
  void import('./audio/selftest').then((t) => { (window as unknown as Record<string, unknown>).maestroSelfTest = t })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
