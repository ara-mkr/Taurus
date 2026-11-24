// HTTPS between your phone and this Mac (owner, November 2, 2026: "Yes, set up HTTPS"). Plain http on Wi-Fi could be
// read by anyone on the same network, so Taurus makes its own certificate authority, which the phone trusts once, and
// signs a certificate for this Mac's Wi-Fi addresses with it.
//
// The authority is limited by name constraints to private addresses (10/8, 172.16/12, 192.168/16) and .local names,
// so even if its key were stolen it could not stand in for any real website. Its key never leaves ~/.taurus/tls, readable
// only by you. Keys are ECDSA P-256; the server certificate lasts 397 days (Apple's limit for servers is 825) and is
// reissued when it nears expiry or the Mac's Wi-Fi address changes. openssl does the signing: Node can't issue X.509.
import { execFileSync } from 'node:child_process';
import { X509Certificate, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LocalTls { key: string; cert: string; ca: string; caDer: Buffer; fingerprint: string }

const write = (file: string, text: string) => { writeFileSync(file, text, { mode: 0o600 }); chmodSync(file, 0o600); };

function openssl(args: string[], dir: string) {
  execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
}

function makeAuthority(dir: string, host: string) {
  write(join(dir, 'ca.cnf'), [
    '[req]', 'distinguished_name = dn', 'prompt = no', '[dn]', `CN = Taurus on ${host}`, 'O = Taurus (this Mac only)',
    '[ext]', 'basicConstraints = critical, CA:TRUE, pathlen:0', 'keyUsage = critical, keyCertSign, cRLSign', 'subjectKeyIdentifier = hash',
    'nameConstraints = critical, permitted;IP:10.0.0.0/255.0.0.0, permitted;IP:172.16.0.0/255.240.0.0, permitted;IP:192.168.0.0/255.255.0.0, permitted;DNS:local',
    '',
  ].join('\n'));
  openssl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ca.key'], dir);
  chmodSync(join(dir, 'ca.key'), 0o600);
  openssl(['req', '-x509', '-new', '-key', 'ca.key', '-sha256', '-days', '1825', '-config', 'ca.cnf', '-extensions', 'ext', '-set_serial', `0x${randomBytes(16).toString('hex')}`, '-out', 'ca.crt'], dir);
  chmodSync(join(dir, 'ca.crt'), 0o600);
}

function makeServer(dir: string, host: string, ips: string[]) {
  const names = [`DNS:${host}.local`, ...ips.map(ip => `IP:${ip}`)];
  write(join(dir, 'server.cnf'), [
    '[req]', 'distinguished_name = dn', 'prompt = no', '[dn]', `CN = ${host}.local`,
    '[ext]', 'basicConstraints = critical, CA:FALSE', 'keyUsage = critical, digitalSignature', 'extendedKeyUsage = serverAuth',
    `subjectAltName = ${names.join(', ')}`, 'authorityKeyIdentifier = keyid', '',
  ].join('\n'));
  openssl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'server.key'], dir);
  chmodSync(join(dir, 'server.key'), 0o600);
  openssl(['req', '-new', '-key', 'server.key', '-config', 'server.cnf', '-out', 'server.csr'], dir);
  openssl(['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-set_serial', `0x${randomBytes(16).toString('hex')}`,
    '-days', '397', '-sha256', '-extfile', 'server.cnf', '-extensions', 'ext', '-out', 'server.crt'], dir);
  chmodSync(join(dir, 'server.crt'), 0o600);
  rmSync(join(dir, 'server.csr'), { force: true });
}

// Whether the certificate on disk still covers this Mac today.
function stillGood(file: string, host: string, ips: string[]) {
  if (!existsSync(file)) return false;
  try {
    const cert = new X509Certificate(readFileSync(file));
    if (Date.parse(cert.validTo) - Date.now() < 30 * 86_400_000) return false;
    const alt = cert.subjectAltName ?? '';
    return alt.includes(`DNS:${host}.local`) && ips.every(ip => alt.includes(`IP Address:${ip}`));
  } catch { return false; }
}

export function localTls(home: string, hostname: string, ips: string[]): LocalTls {
  const dir = join(home, 'tls');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const host = hostname.toLowerCase().replace(/\.local$/, '').replace(/[^a-z0-9-]/g, '-') || 'taurus';
  const caFile = join(dir, 'ca.crt');
  let fresh = false;
  if (!existsSync(caFile) || !existsSync(join(dir, 'ca.key')) || Date.parse(new X509Certificate(readFileSync(caFile)).validTo) - Date.now() < 30 * 86_400_000) { makeAuthority(dir, host); fresh = true; }
  if (fresh || !stillGood(join(dir, 'server.crt'), host, ips)) makeServer(dir, host, ips);
  const ca = readFileSync(caFile, 'utf8');
  const x = new X509Certificate(ca);
  return { key: readFileSync(join(dir, 'server.key'), 'utf8'), cert: readFileSync(join(dir, 'server.crt'), 'utf8'), ca, caDer: x.raw, fingerprint: x.fingerprint256 };
}
