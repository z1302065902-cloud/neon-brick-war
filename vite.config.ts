import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths — required for the itch.io HTML5 zip, which is served
  // from a sub-path rather than a domain root.
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
