import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageFor } from '../src/go.ts';
import { tidy } from '../src/instant.ts';

// Every page by voice (November 19, 2026): "hey taurus open the brain map and show me it".
const hash = (said: string) => { const p = pageFor(tidy(said)); return p === 'back' ? 'back' : p?.hash ?? null; };

test('pages open by voice, with or without the wake word', () => {
  assert.equal(hash('Hey Taurus, open the brain map.'), '#brain');
  assert.equal(hash('hey taurus show me my brain'), '#brain');
  assert.equal(hash('Torus, pull up ProFinder'), '#profinder');
  assert.equal(hash('take me to the profile page'), '#profile');
  assert.equal(hash('open settings please'), '#settings');
  assert.equal(hash('show me my routines'), '#schedule');
  assert.equal(hash('go to connections'), '#connections');
  assert.equal(hash('yo taurus take me home'), '#hud');
  assert.equal(hash('go back'), 'back');
});

test('anything else is left for apps on the Mac and the AI', () => {
  assert.equal(hash('open up my notes app'), null);
  assert.equal(hash('open spotify'), null);
  assert.equal(hash('what is on my brain today'), null);
  assert.equal(hash('show me the weather'), null);
});
