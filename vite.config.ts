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
    // Sourcemaps are ~6 MB — larger than the entire game. They are worth having for local
    // debugging and must never ship: the itch zip goes from 3.5 MB to 9.1 MB with them.
    sourcemap: process.env.VITE_SOURCEMAP === '1',
    chunkSizeWarningLimit: 4000,
  },
});
