import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

function copyGames() {
  return {
    name: 'copy-games',
    closeBundle() {
      const source = path.resolve('games');
      const destination = path.resolve('dist/games');
      fs.cpSync(source, destination, { recursive: true });
    },
  };
}

export default defineConfig({
  base: '/Simulations/',
  plugins: [react(), copyGames()],
});
