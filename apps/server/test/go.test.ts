import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// A scratch home before anything loads the store, so a test run never touches (or moves) the owner's real data.
process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-go-'));
process.env.TAURUS_BROKER_URL = '';
const { pageFor } = await import('../src/go.ts');
const { tidy } = await import('../src/instant.ts');

// Every page by voice (November 19, 2026): "hey taurus open the brain map and show me it".
const hash = (said: string) => { const p = pageFor(tidy(said)); return p === 'back' ? 'back' : p?.hash ?? null; };

test('pages open by voice, with or without the wake word', () => {
  assert.equal(hash('Hey Taurus, open the brain map.'), '#brain');
  assert.equal(hash('hey taurus show me my brain'), '#brain');
  assert.equal(hash('Torus, pull up legal'), '#legal');
  assert.equal(hash('open my resume'), '#legal');
  assert.equal(hash('take me to the profile page'), '#profile');
  assert.equal(hash('open settings please'), '#settings');
  assert.equal(hash('show me my routines'), '#schedule');
  assert.equal(hash('go to connections'), '#connections');
  assert.equal(hash('yo taurus take me home'), '#hud');
  assert.deepEqual(pageFor(tidy('open the board view')), { hash: '#hud', name: 'Home' });
  assert.equal(hash('go back'), 'back');
});

test('anything else is left for apps on the Mac and the AI', () => {
  assert.equal(hash('open up my notes app'), null);
  assert.equal(hash('open spotify'), null);
  assert.equal(hash('what is on my brain today'), null);
  assert.equal(hash('show me the weather'), null);
});
