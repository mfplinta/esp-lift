import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsConfigPaths from 'vite-tsconfig-paths';

const espHost = '10.0.1.120';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: `http://${espHost}/`,
        secure: false,
      },
      '/ws': {
        target: `ws://${espHost}/`,
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
