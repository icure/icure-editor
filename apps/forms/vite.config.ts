import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

// Like the demo, the forms example reads the library from its sources (the `source` export
// condition). Its own port, so it never meets the demo's server.
export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['source', ...defaultClientConditions] },
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
})
