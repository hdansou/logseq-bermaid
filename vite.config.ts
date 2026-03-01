import { defineConfig } from 'vite'
import logseqSafeDevPlugin from './vite-logseq-safe-plugin'

export default defineConfig({
  plugins: [logseqSafeDevPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    cors: true,
  },
})
