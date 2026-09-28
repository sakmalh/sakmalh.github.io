import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works on any static host, including a
  // GitHub Pages project subpath, without further configuration.
  base: './',
  build: {
    target: 'es2020',
    // three.js alone is ~500 kB minified (126 kB gzipped); it is lazy-loaded.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Keep three.js in its own chunk. Combined with the dynamic import in
        // main.js, a browser without WebGL never downloads it.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
});
