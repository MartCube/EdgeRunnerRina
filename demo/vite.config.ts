// Builds the same site as one self-contained HTML fragment, for sharing a preview
// without a deploy. Images and audio are loaded by relative URL next to the page.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  base: './',
  publicDir: false,
  plugins: [vue(), viteSingleFile()],
  resolve: { alias: { '~': fileURLToPath(new URL('../app', import.meta.url)) } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
})
