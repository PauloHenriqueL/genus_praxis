import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Caminho base do app. Sempre '/' no deploy full-stack (Railway), onde o
  // Express serve este build. VITE_BASE existe só para hospedagens em subpasta.
  base: process.env.VITE_BASE || '/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/patient-photos': 'http://localhost:3001',
    },
  },
})
