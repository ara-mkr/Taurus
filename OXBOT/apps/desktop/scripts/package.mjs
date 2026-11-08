// Packages OXBOT for each platform, then proves the package holds code and assets only.
//   node scripts/package.mjs            mac, win and linux
//   node scripts/package.mjs mac win    just those
// After each platform its app.asar and web folder are searched for secrets; any match fails the build.
// Unpacked folders are then removed to save disk, except release/mac-arm64/OXBOT.app.
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(here, 'release');
const platforms = process.argv.slice(2).length ? process.argv.slice(2) : ['mac', 'win', 'linux'];
if (!existsSync(join(here, '../web/dist/index.html'))) throw new Error('Build the web app first: pnpm --dir apps/web build');

// The server's own code names ~/.oxbot, .env and refresh_token, so plain words would always match.
// These patterns match the things that must never ship: files from those places and secret-shaped values.
const owner = (process.env.OXBOT_OWNER_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const patterns = [
  ['an OpenAI or Anthropic key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/],
  ['an AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['a Slack token', /\bxox[abprs]-[0-9A-Za-z-]{10,}/],
  ['a stored refresh_token', /"refresh_token"\s*:\s*"[^"]{8,}"/],
  ['a stored access_token', /"access_token"\s*:\s*"[^"]{8,}"/],
  ['a personal email address', /[\w.+-]+@(?:gmail|googlemail|icloud|me|mac|outlook|hotmail|live|yahoo|proton|protonmail)\.(?:com|me)\b/i],
];
function localIdentity() {
  if (process.platform !== 'darwin') return undefined;
  try { return execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }).includes('"OXBOT Local"') ? 'OXBOT Local' : undefined; }
  catch { return undefined; }
}
const badPath = /(^|\/)(\.oxbot|\.env(\.[^/]*)?|secrets\.json|tokens\.json|pairing\.json)(\/|$)/;

// asar: [4: 4][4: header pickle size][pickle: [4: payload size][4: json length][json]] then file data.
function* asarFiles(file) {
  const fd = openSync(file, 'r');
  try {
    const head = Buffer.alloc(8); readSync(fd, head, 0, 8, 0);
    const headerSize = head.readUInt32LE(4);
    const pickle = Buffer.alloc(headerSize); readSync(fd, pickle, 0, headerSize, 8);
    const index = JSON.parse(pickle.subarray(8, 8 + pickle.readUInt32LE(4)).toString());
    const base = 8 + headerSize;
    function* walk(node, prefix) {
      for (const [name, entry] of Object.entries(node.files ?? {})) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (entry.files) yield* walk(entry, path);
        else if (!entry.link && !entry.unpacked) {
          const data = Buffer.alloc(entry.size); readSync(fd, data, 0, entry.size, base + Number(entry.offset));
          yield [path, data];
        }
      }
    }
    yield* walk(index, '');
  } finally { closeSync(fd); }
}
function* folderFiles(dir, prefix = '') {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name), path = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) yield* folderFiles(full, path); else yield [path, readFileSync(full)];
  }
}
function scan(label, files) {
  const problems = [];
  let count = 0;
  for (const [path, data] of files) {
    count++;
    if (badPath.test(path)) problems.push(`${label}: ${path} is a private file`);
    const text = data.toString('latin1');
    for (const [what, re] of patterns) { const m = text.match(re); if (m) problems.push(`${label}: ${path} contains ${what} (${m[0].slice(0, 12)}…)`); }
    for (const email of owner) if (text.toLowerCase().includes(email)) problems.push(`${label}: ${path} contains the owner's email`);
  }
  return { problems, count };
}
function findAll(dir, name, depth = 6) {
  if (depth < 0 || !existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = join(dir, e.name);
    if (e.name === name) return [full];
    return e.isDirectory() && !e.name.endsWith('.asar') ? findAll(full, name, depth - 1) : [];
  });
}

const flags = { mac: '--mac', win: '--win', linux: '--linux' };
const failures = [];
for (const platform of platforms) {
  if (!flags[platform]) throw new Error(`Unknown platform ${platform}; use mac, win or linux`);
  console.log(`\n== Packaging for ${platform}`);
  // With the owner's "OXBOT Local" certificate (scripts/signing-cert.sh), macOS keeps Screen Recording and Accessibility
  // across builds; without it, builds stay signed ad hoc as before.
  const identity = platform === 'mac' ? localIdentity() : undefined;
  try { execFileSync(join(here, 'node_modules/.bin/electron-builder'), [flags[platform], '--config', 'electron-builder.json', '--publish', 'never', ...(identity ? [`-c.mac.identity=${identity}`] : [])], { cwd: here, stdio: 'inherit' }); }
  catch { failures.push(`${platform}: electron-builder failed (see the output above)`); continue; }
  const unpacked = readdirSync(release).filter(n => statSync(join(release, n)).isDirectory() && n.startsWith(platform));
  for (const dir of unpacked) {
    for (const asar of findAll(join(release, dir), 'app.asar')) {
      const r = scan(relative(release, asar), asarFiles(asar));
      const names = [...asarFiles(asar)].map(([p]) => p).filter(p => !p.startsWith('dist/') && p !== 'package.json');
      if (names.length) r.problems.push(`${relative(release, asar)}: unexpected files ${names.join(', ')}`);
      console.log(`Checked ${relative(release, asar)}: ${r.count} files, ${r.problems.length ? 'PROBLEMS' : 'clean'}`);
      failures.push(...r.problems);
      const web = join(dirname(asar), 'web');
      if (existsSync(web)) { const w = scan(relative(release, web), folderFiles(web)); console.log(`Checked ${relative(release, web)}: ${w.count} files, ${w.problems.length ? 'PROBLEMS' : 'clean'}`); failures.push(...w.problems); }
    }
    if (dir !== 'mac-arm64') rmSync(join(release, dir), { recursive: true, force: true });
  }
}
for (const name of existsSync(release) ? readdirSync(release) : []) {
  const full = join(release, name);
  if (statSync(full).isFile() && /\.(dmg|zip|exe|AppImage|deb)$/.test(name)) console.log(`${name}  ${(statSync(full).size / 1048576).toFixed(1)} MB`);
}
if (failures.length) { console.error(`\nPackage check failed:\n${failures.join('\n')}`); process.exit(1); }
console.log('\nPackage check passed: code and assets only.');
