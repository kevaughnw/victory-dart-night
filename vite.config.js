import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages: base path = repo name (set in CI; '/' for local dev)
  base: process.env.GITHUB_PAGES_BASE || '/',
})
