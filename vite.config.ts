import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // Ensure VITE_API_URL is unset/blank for same-origin web build and mode strings like "production" are never inlined
  const rawApiUrl = process.env.VITE_API_URL || '';
  const effectiveApiUrl =
    rawApiUrl === 'production' || rawApiUrl === 'development' || !rawApiUrl.startsWith('http')
      ? ''
      : rawApiUrl;

  return {
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(effectiveApiUrl),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      target: 'es2022',
      minify: 'esbuild' as const,
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            icons: ['lucide-react'],
            motion: ['motion']
          }
        }
      }
    }
  };
});
