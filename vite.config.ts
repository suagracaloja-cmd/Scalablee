import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// O Tailwind entra só para o reset base (preflight); todo o estilo do site está em src/rx.css.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
