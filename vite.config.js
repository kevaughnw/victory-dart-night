import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use relative paths so it works on GitHub Pages at any path (e.g. /repo-name/)
  base: './',
})
