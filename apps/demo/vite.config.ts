import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

// The demo reads the library from its sources (the `source` export condition), so edits to the
// library show at once; `bun run build` in packages/editor produces what a host installs.
export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['source', ...defaultClientConditions] },
  server: { port: 5179, strictPort: true },
  preview: { port: 5179, strictPort: true },
})
