import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Writes the build hash and the list of built files into dist/sw.js, so each build gets its own shell cache.
function stampServiceWorker(): Plugin {
  let files: string[] = [];
  let outDir = 'dist';
  return {
    name: 'taurus-service-worker', apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    generateBundle(_options, bundle) { files = Object.keys(bundle).filter(f => f !== 'index.html' && !f.endsWith('.map')).map(f => `/${f}`); },
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      if (!existsSync(sw)) return;
      const shell = [...files, '/manifest.webmanifest', '/mark.svg', '/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-512-maskable.png'].sort();
      const source = readFileSync(sw, 'utf8');
      const hash = createHash('sha256').update(shell.join('\n')).update(source).update(readFileSync(join(outDir, 'index.html'))).digest('hex').slice(0, 12);
      writeFileSync(sw, source.replace("const BUILD = 'dev';", `const BUILD = '${hash}';`).replace('const SHELL = [];', `const SHELL = ${JSON.stringify(shell)};`));
    },
  };
}

// The server's port; TAURUS_PORT lets a second copy run beside one already on 8787.
const apiPort = Number(process.env.TAURUS_PORT || 8787);

export default defineConfig({ plugins: [react(), stampServiceWorker()], server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, headers: { host: `localhost:${apiPort}` } } } } });
