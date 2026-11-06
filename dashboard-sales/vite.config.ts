import { defineConfig, loadEnv } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import { nitro } from 'nitro/vite';

export default defineConfig(({ mode, command }) => {
  // Keep secrets on the server; only VITE_* are exposed by Vite to the browser.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
  return {
    plugins: [
      tsConfigPaths(),
      tailwindcss(),
      tanstackStart({ server: { entry: 'server' } }),
      react(),
      ...(command === 'build' ? [nitro({ preset: 'node-server' })] : []),
    ],
    resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-query'] },
  };
});
