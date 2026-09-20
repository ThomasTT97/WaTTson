
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      proxy: {
        '/api/intervals-proxy': {
          target: 'https://intervals.icu',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/intervals-proxy/, '')
        }
      }
    },
    define: {
      // Polyfill process.env.GEMINI_API_KEY for the @google/genai SDK
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''),
      // Polyfill INTERVALS_API_KEY so we can skip the login screen if set in Cloudflare
      'process.env.INTERVALS_API_KEY': JSON.stringify(env.INTERVALS_API_KEY || ''),
      'process.env.NODE_ENV': JSON.stringify(mode)
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
