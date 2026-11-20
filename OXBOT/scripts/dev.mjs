// Starts the Taurus server and the web app together. Ctrl-C stops both.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, TAURUS_APP_URL: process.env.TAURUS_APP_URL ?? 'http://127.0.0.1:5173' };
const children = [
  spawn('pnpm', ['--dir', join(root, 'apps/server'), 'dev'], { stdio: 'inherit', env }),
  spawn('pnpm', ['--dir', join(root, 'apps/web'), 'dev'], { stdio: 'inherit', env }),
];
const stop = () => { for (const child of children) child.kill('SIGTERM'); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', code => { if (code) { console.error(`A process exited with ${code}; stopping.`); stop(); process.exitCode = code; } });
