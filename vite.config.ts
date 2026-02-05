
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Polyfill process.env.API_KEY for the @google/genai SDK
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
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
