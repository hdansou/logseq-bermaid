import { defineConfig } from 'vite'
import logseqSafeDevPlugin from './vite-logseq-safe-plugin'

export default defineConfig({
  plugins: [logseqSafeDevPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    minify: 'terser',
    sourcemap: false,
  },
  server: {
    port: 8080,
  },
})
