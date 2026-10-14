import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// Em desenvolvimento, /api e /uploads são encaminhados para o Apache (XAMPP)
const BACKEND = process.env.BACKEND_URL || 'http://localhost/cloudimidia'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        tv: resolve(__dirname, 'tv.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true, rewrite: (p) => new URL(BACKEND).pathname + p },
      '/uploads': { target: BACKEND, changeOrigin: true, rewrite: (p) => new URL(BACKEND).pathname + p },
    },
  },
})
