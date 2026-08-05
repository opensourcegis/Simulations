import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

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

function serveGamesInDev() {
  const gamesRoot = path.resolve('games');
  const prefix = '/Simulations/games';

  return {
    name: 'serve-games-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith(`${prefix}/`) && url !== prefix) return next();

        const rel = decodeURIComponent(url.slice(prefix.length).replace(/^\//, ''));
        const target = rel
          ? path.join(gamesRoot, rel.endsWith('/') ? path.join(rel, 'index.html') : rel)
          : path.join(gamesRoot, 'index.html');

        if (!target.startsWith(gamesRoot) || !existsSync(target)) return next();

        const file = statSync(target).isDirectory() ? path.join(target, 'index.html') : target;
        if (!existsSync(file)) return next();

        res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: '/Simulations/',
  plugins: [react(), copyGames(), serveGamesInDev()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react';
        },
      },
    },
  },
});
