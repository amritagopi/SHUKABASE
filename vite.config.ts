import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 5173,
      host: '0.0.0.0',
      watch: {
        ignored: ['**/public/books/**', '**/src-tauri/**', '**/.git/**', '**/node_modules/**']
      }
    },
    optimizeDeps: {
      entries: ['index.html', 'src/**/*.{ts,tsx}'],
      exclude: ['vitest', '@testing-library/jest-dom', '@testing-library/react', 'jsdom']
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.SHUKABASE_LANG': JSON.stringify(process.env.SHUKABASE_LANG || 'all'),
      'process.env.SHUKABASE_DATA_ID': JSON.stringify(process.env.SHUKABASE_DATA_ID)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
