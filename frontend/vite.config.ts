import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsConfigPaths from 'vite-tsconfig-paths';

const espHost = 'esp-lift2.arpa';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: `https://${espHost}/`,
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: `wss://${espHost}/`,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tsConfigPaths(),
  ],
});
