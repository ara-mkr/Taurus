import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, defaults, never, type HandsSettings } from '../src/hands-policy';

// Helpers in other apps (owner, November 5, 2026; docs/19-computer-use.md): the rules every step passes, and the real
// taurus-hands program asked only things that touch nothing (no picture of the screen, no mouse, no keys).
const here = dirname(fileURLToPath(import.meta.url));
const on: HandsSettings = { ...defaults, on: true };
const win = { x: 100, y: 100, w: 800, h: 600 };

test('the owner’s first choices: Canva and Notes may act, Chrome may only be looked at, acting starts switched off', () => {
  expect(defaults).toEqual({ on: false, act: ['Canva', 'Notes'], look: ['Google Chrome'], chrome: false });
  expect(check('press', { app: 'Notes', id: 1 }, defaults)).toMatch(/switched off/);
  expect(check('press', { app: 'Notes', id: 1 }, on)).toBe('');
  expect(check('press', { app: 'notes', id: 1 }, on)).toBe('');
  expect(check('tree', { app: 'Google Chrome' }, on)).toBe('');
  expect(check('click', { app: 'Google Chrome', x: 200, y: 200 }, on, win)).toMatch(/isn’t on your list of apps helpers may act in/);
  expect(check('tree', { app: 'Mail' }, on)).toMatch(/isn’t on your list/);
  expect(check('look', {}, on)).toBe('');
  expect(check('look', { app: 'Mail' }, on)).toMatch(/may look at/);
});

test('password managers, settings, terminals, money apps and Taurus itself are never touched, whatever the list says', () => {
  const everything: HandsSettings = { on: true, act: ['1Password', 'System Settings', 'Terminal', 'Chase Mobile', 'Coinbase', 'Taurus', 'Keychain Access'], look: ['Bitwarden'], chrome: false };
  for (const app of everything.act) expect(check('press', { app, id: 0 }, everything), app).toMatch(/never works in/);
  expect(check('tree', { app: 'Bitwarden' }, everything)).toMatch(/isn’t on your list/);
  expect(never('Robinhood')).toBe(true);
  expect(never('Canva')).toBe(false);
});

test('pointing steps land only inside the app’s own window, and only after it has been read', () => {
  expect(check('click', { app: 'Canva', x: 300, y: 300 }, on)).toMatch(/Read Canva first/);
  expect(check('click', { app: 'Canva', x: 300, y: 300 }, on, win)).toBe('');
  expect(check('click', { app: 'Canva', x: 50, y: 300 }, on, win)).toMatch(/outside Canva’s window/);
  expect(check('drag', { app: 'Canva', x: 300, y: 300, toX: 2000, toY: 300 }, on, win)).toMatch(/outside/);
  expect(check('ask', { screen: true }, on)).toMatch(/can’t ask/);
  expect(check('shell', { app: 'Canva' }, on)).toMatch(/can’t shell/);
});

test('taurus-hands answers on stdin and refuses what it must, without touching the screen', () => {
  const binary = join(here, '../dist/taurus-hands');
  test.skip(process.platform !== 'darwin' || !existsSync(binary), 'taurus-hands is built on a Mac by scripts/bundle.mjs');
  const input = [
    { id: 1, verb: 'status', args: {} }, { id: 2, verb: 'apps', args: {} }, { id: 3, verb: 'shell', args: { cmd: 'ls' } },
    { id: 4, verb: 'tree', args: { app: 'No Such App Here' } }, { id: 5, verb: 'tree', args: {} },
  ].map(r => JSON.stringify(r)).join('\n') + '\n';
  const replies = execFileSync(binary, { input, encoding: 'utf8', timeout: 15_000 }).trim().split('\n').map(l => JSON.parse(l));
  expect(replies.map(r => r.id)).toEqual([1, 2, 3, 4, 5]);
  expect(Object.keys(replies[0].data).sort()).toEqual(['accessibility', 'screen', 'secureInput']);
  expect(Array.isArray(replies[1].data.apps)).toBe(true);
  expect(replies[1].data.apps.some((a: { bundle: string }) => a.bundle === 'com.apple.Terminal' || a.bundle === 'com.1password.1password')).toBe(false);
  expect(replies[2]).toEqual({ id: 3, ok: false, error: 'No verb called shell.' });
  expect(replies[3]).toEqual({ id: 4, ok: false, error: 'No Such App Here isn\'t open.' });
  expect(replies[4]).toEqual({ id: 5, ok: false, error: 'Say which app.' });
});
