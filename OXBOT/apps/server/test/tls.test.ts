// Taurus's own certificate authority for the phone (owner, November 2, 2026): made once, private files, a server
// certificate that verifies for this Mac's Wi-Fi address, and an authority that can't vouch for any real website.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { localTls } from '../src/tls.ts';

test('the authority is made once, its files are private, and the server certificate verifies for the Wi-Fi address', () => {
  const home = mkdtempSync(join(tmpdir(), 'taurus-tls-'));
  const first = localTls(home, 'Example-Mac.local', ['192.168.1.20']);
  const again = localTls(home, 'Example-Mac.local', ['192.168.1.20']);
  assert.equal(again.fingerprint, first.fingerprint);
  assert.equal(again.cert, first.cert);
  assert.equal(statSync(join(home, 'tls')).mode & 0o777, 0o700);
  for (const file of ['ca.key', 'ca.crt', 'server.key', 'server.crt']) assert.equal(statSync(join(home, 'tls', file)).mode & 0o777, 0o600);
  const dir = join(home, 'tls');
  assert.match(execFileSync('openssl', ['verify', '-CAfile', 'ca.crt', 'server.crt'], { cwd: dir, encoding: 'utf8' }), /server\.crt: OK/);
  assert.match(execFileSync('openssl', ['x509', '-in', 'server.crt', '-noout', '-ext', 'subjectAltName'], { cwd: dir, encoding: 'utf8' }), /DNS:example-mac\.local, IP Address:192\.168\.1\.20/);

  // A new Wi-Fi address gets a new server certificate from the same authority.
  const moved = localTls(home, 'Example-Mac.local', ['10.0.0.8']);
  assert.equal(moved.fingerprint, first.fingerprint);
  assert.notEqual(moved.cert, first.cert);
});

test('the authority cannot vouch for a real website', () => {
  const home = mkdtempSync(join(tmpdir(), 'taurus-tls-'));
  localTls(home, 'example-mac', ['192.168.1.20']);
  const dir = join(home, 'tls');
  writeFileSync(join(dir, 'evil.cnf'), '[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=example.com\n[ext]\nsubjectAltName=DNS:example.com\nextendedKeyUsage=serverAuth\n');
  const run = (args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  run(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'evil.key']);
  run(['req', '-new', '-key', 'evil.key', '-config', 'evil.cnf', '-out', 'evil.csr']);
  run(['x509', '-req', '-in', 'evil.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-set_serial', '7', '-days', '30', '-extfile', 'evil.cnf', '-extensions', 'ext', '-out', 'evil.crt']);
  assert.throws(() => run(['verify', '-CAfile', 'ca.crt', 'evil.crt']), /permitted subtree violation/);
});
