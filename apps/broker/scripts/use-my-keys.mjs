// Copies an OAuth app's keys that this Mac's Taurus already has into the sign-in service,
// straight from ~/.taurus (or .env) to Cloudflare. The values are never printed.
// Usage: pnpm --dir apps/broker use-my-keys google   (or microsoft, strava, whoop, oura)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const names = { google: 'GOOGLE', microsoft: 'MICROSOFT', strava: 'STRAVA', whoop: 'WHOOP', oura: 'OURA' };
const provider = process.argv[2];
if (!names[provider]) { console.error(`Say which: ${Object.keys(names).join(', ')}`); process.exit(1); }

const here = dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(join(here, '../../../.env')); } catch { /* .env is optional */ }
let saved = {};
try { saved = JSON.parse(readFileSync(join(process.env.TAURUS_HOME ?? join(homedir(), '.taurus'), 'secrets.json'), 'utf8')); } catch { /* nothing saved yet */ }

for (const key of [`${names[provider]}_CLIENT_ID`, `${names[provider]}_CLIENT_SECRET`]) {
  const value = process.env[key] || saved[key];
  if (!value) { console.error(`${key} is not saved in Taurus yet. Add it on the Connections page first.`); process.exit(1); }
  const result = spawnSync('npx', ['-y', 'wrangler@4.151.0', 'secret', 'put', key], { cwd: join(here, '..'), input: value, encoding: 'utf8' });
  if (result.status !== 0) { console.error(`Could not save ${key}:\n${(result.stderr || result.stdout).replaceAll(value, '[hidden]')}`); process.exit(1); }
  console.log(`Saved ${key} to the Taurus sign-in service.`);
}
console.log(`Done. Every Taurus will offer "Sign in with ${provider[0].toUpperCase()}${provider.slice(1)}" within 10 minutes.`);
