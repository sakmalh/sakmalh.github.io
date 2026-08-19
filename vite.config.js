import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works on any static host, including a
  // GitHub Pages project subpath, without further configuration.
  base: './',
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // Keep three.js in its own chunk. Combined with the dynamic import in
        // main.js this means a `none`-tier device never downloads it.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
});
