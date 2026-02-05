
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Polyfill process.env.API_KEY for the @google/genai SDK
      // Use fallback to empty string to prevent JSON.stringify(undefined)
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      'process.env.NODE_ENV': JSON.stringify(mode)
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
