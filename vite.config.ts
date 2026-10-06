import { defineConfig } from 'vite'
import { gamePlugin } from './server/plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [gamePlugin()],
  // Listen on all network interfaces so everyone in the office can join.
  server: { host: true, watch: { ignored: ['**/data/**'] } },
  preview: { host: true },
  // three.js alone is ~600 kB; that's fine on a LAN.
  build: { chunkSizeWarningLimit: 1000 },
})
