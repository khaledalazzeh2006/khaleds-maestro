import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// The built app gets a strict Content-Security-Policy in its page (dev keeps Vite's hot reload working).
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' media:; media-src 'self' media: blob:; worker-src 'self' blob:"

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [
      react(),
      { name: 'maestro-csp', apply: 'build', transformIndexHtml: (html: string) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`) }
    ]
  }
})
