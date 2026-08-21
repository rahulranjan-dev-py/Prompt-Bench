import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite bundles this config with esbuild before loading it, so ESM syntax works
// here even though package.json has no "type": "module".
export default defineConfig({
  plugins: [react()],

  // THE most important setting in this file. A packaged Electron app loads the
  // UI over file://, not http://. Vite's default base of '/' emits asset URLs
  // like "/assets/index-abc.js", which resolve to C:\assets\... under file://
  // and produce a silent blank white window. './' emits relative URLs instead.
  base: './',

  server: {
    port: 5173,
    // Without strictPort, a port clash makes Vite quietly slide to 5174 while
    // electron/main.js is still hardcoded to 5173 -> blank window in dev.
    // Failing loudly is better than a mystery.
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Keeps the DevTools stack traces in a built app pointing at your real .jsx.
    sourcemap: true,
  },
});
