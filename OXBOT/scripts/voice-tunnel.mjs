// The voice tunnel (owner, November 1, 2026): a Cloudflare Tunnel on the owner's own Cloudflare account, so Twilio
// can reach this Mac when the owner calls Taurus. Only the four /api/voice paths pass the tunnel; Cloudflare answers
// 404 to everything else before it reaches the Mac, and the server walls off proxied requests too.
//
//   pnpm voice-tunnel quick                         no domain needed: a free temporary address, saved into Taurus
//   pnpm voice-tunnel setup voice.your-domain.com   with a domain on your Cloudflare account, after `cloudflared tunnel login`
//   pnpm voice-tunnel                               run the named tunnel (keep it open while Taurus should take calls)
//   pnpm voice-tunnel check                         from outside: is only /api/voice reachable?
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const NAME = 'taurus-voice';
const dir = join(homedir(), '.cloudflared');
const config = join(dir, `${NAME}.yml`);
const port = Number(process.env.TAURUS_PORT || 8787);
const cloudflared = (...args) => execFileSync('cloudflared', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const fail = message => { console.error(message); process.exit(1); };

// Exactly the paths Twilio posts to; any other path, query aside, gets Cloudflare's 404.
const rules = hostname => `ingress:
  - ${hostname ? `hostname: ${hostname}\n    ` : ''}path: ^/api/voice/(incoming|pin|turn|confirm)$
    service: http://localhost:${port}
  - service: http_status:404
`;
export const ingress = (hostname, id, credentials) => `tunnel: ${id}\ncredentials-file: ${credentials}\n${rules(hostname)}`;
const local = (path, init) => fetch(`http://localhost:${port}${path}`, init);

function setup(hostname) {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(hostname ?? '')) fail('Give the hostname to use, like: pnpm voice-tunnel setup voice.your-domain.com');
  if (!existsSync(join(dir, 'cert.pem'))) fail('Sign in to Cloudflare first: cloudflared tunnel login');
  const list = () => JSON.parse(cloudflared('tunnel', 'list', '--output', 'json', '--name', NAME) || '[]');
  if (!list().length) cloudflared('tunnel', 'create', NAME);
  const tunnel = list()[0];
  if (!tunnel) fail('Cloudflare did not create the tunnel. Run cloudflared tunnel create taurus-voice to see why.');
  // Points the hostname at this tunnel in your Cloudflare DNS: the one change this step makes to your account.
  cloudflared('tunnel', 'route', 'dns', NAME, hostname);
  writeFileSync(config, ingress(hostname, tunnel.id, join(dir, `${tunnel.id}.json`)), { mode: 0o600 });
  console.log(`Tunnel ${NAME} is ready for https://${hostname}.\nNext: put that address and a PIN in Taurus, Settings, Actions, "Call Taurus from your phone", then run: pnpm voice-tunnel`);
}

function run() {
  if (!existsSync(config)) fail('Set the tunnel up first: pnpm voice-tunnel setup voice.your-domain.com');
  // HTTP/2, not QUIC: this Mac's network blocked QUIC (UDP) when the tunnel was tested on November 1, 2026.
  const child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--protocol', process.env.TAURUS_TUNNEL_PROTOCOL || 'http2', '--config', config, 'run', NAME], { stdio: 'inherit' });
  process.on('SIGINT', () => child.kill('SIGINT'));
  child.on('exit', code => { process.exitCode = code ?? 0; });
}

// No domain: Cloudflare's free quick tunnel. The address changes every time this starts, so it is saved into
// Taurus straight away and printed for Twilio. The same voice-only rule applies at Cloudflare's edge.
async function quick() {
  const health = await local('/api/health').then(r => r.json()).catch(() => null);
  if (health?.app !== 'taurus') fail(`Taurus isn't running on port ${port}. Open the Taurus app (or run pnpm start), then try again.`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${NAME}-quick.yml`);
  writeFileSync(file, rules(), { mode: 0o600 });
  const child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--protocol', process.env.TAURUS_TUNNEL_PROTOCOL || 'http2', '--config', file, '--url', `http://localhost:${port}`], { stdio: ['ignore', 'ignore', 'pipe'] });
  process.on('SIGINT', () => child.kill('SIGINT'));
  child.on('exit', code => { console.log('The tunnel stopped. Calls into Taurus won’t reach this Mac until you run pnpm voice-tunnel quick again.'); process.exitCode = code ?? 0; });
  let address = '', announced = false;
  child.stderr.setEncoding('utf8').on('data', async text => {
    address ||= text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? '';
    if (announced || !address || !/Registered tunnel connection/.test(text)) return;
    announced = true;
    const saved = await local('/api/connectors/voice-in/fields', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-taurus': '1' }, body: JSON.stringify({ values: { TAURUS_VOICE_URL: address } }) });
    if (!saved.ok) console.error(`Couldn’t save the address in Taurus (${saved.status}). Paste ${address} into Settings, Actions, "Call Taurus from your phone".`);
    console.log(`\nTaurus can take calls at ${address}${saved.ok ? ' (saved in Taurus)' : ''}.\n\nIn Twilio, set your number's "A call comes in" webhook to:\n  ${address}/api/voice/incoming   (HTTP POST)\n\nThis address changes whenever this command restarts. Leave this window open; Ctrl-C stops it.\n`);
    await new Promise(r => setTimeout(r, 4000));
    await check(address, false).catch(error => console.error(`Check failed: ${error.message}`));
  });
}

// From outside, through Cloudflare: everything but /api/voice is refused, and an unsigned voice request is refused.
async function check(base, exit = true) {
  const host = base ?? readFileSync(config, 'utf8').match(/hostname: (\S+)/)?.[1];
  if (!host) fail('Give the address to check, or set the tunnel up first.');
  const url = host.startsWith('http') ? host.replace(/\/$/, '') : `https://${host}`;
  const tries = [['GET', '/', 404], ['GET', '/api/dashboard', 404], ['GET', '/api/connectors', 404], ['POST', '/api/approvals', 404], ['POST', '/api/voice/incoming', 403]];
  let ok = true;
  for (const [method, path, want] of tries) {
    const res = await fetch(url + path, { method, headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}, body: method === 'POST' ? 'From=%2B15550000000' : undefined, redirect: 'manual' });
    const pass = res.status === want;
    ok &&= pass;
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${method} ${path} -> ${res.status} (want ${want})`);
  }
  if (!ok && exit) process.exit(1);
}

const [command, arg] = process.argv.slice(2);
if (command === 'quick') await quick();
else if (command === 'setup') setup(arg);
else if (command === 'check') await check(arg);
else if (!command || command === 'run') run();
else fail('Use: pnpm voice-tunnel [quick | setup <hostname> | run | check [address]]');
