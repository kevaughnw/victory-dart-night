import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages: must match repo path (e.g. /victory-dart-night/)
  // Set in CI via GITHUB_PAGES_BASE; use '/' for local dev
  base: process.env.GITHUB_PAGES_BASE || '/',
})
