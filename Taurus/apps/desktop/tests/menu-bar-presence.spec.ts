import { _electron as electron, expect, test } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a hidden dashboard displays real stream helpers on its own display and clears them when reopened', async () => {
  const home = mkdtempSync(join(tmpdir(), 'taurus-tray-presence-'));
  const streams = new Set<ServerResponse>();
  const swarm = { id: 'fixture', state: 'running', width: 800, height: 1000, helpers: [
    { id: 'fixture-helper', n: 1, name: 'Scout', colour: '#A9D6FF', state: 'working', moves: 1, doing: 'reading example.com', host: 'example.com', title: 'Fictional test page', point: { x: 400, y: 300 } },
  ] };
  const server = createServer((req, res) => {
    if (req.url === '/api/health') { res.setHeader('Content-Type', 'application/json'); res.end('{"app":"taurus"}'); }
    else if (req.url?.endsWith('/stream')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(': test\n\n');
      if (req.url === '/api/swarm/stream') res.write(`event: swarm\ndata: ${JSON.stringify(swarm)}\n\n`);
      streams.add(res); res.on('close', () => streams.delete(res));
    } else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Taurus isolated test</title><p>Fictional local dashboard</p>'); }
  });
  await new Promise<void>(resolve => server.listen(8844, '127.0.0.1', resolve));
  writeFileSync(join(home, 'desktop.json'), JSON.stringify({ notch: { on: false }, swarmScreens: true }));
  const app = await electron.launch({ args: [join(import.meta.dirname, '../dist/main.mjs')], env: { ...process.env, TAURUS_HOME: home, TAURUS_PORT: '8844', TAURUS_BROKER_URL: '' } });
  try {
    const dashboard = await app.firstWindow();
    await dashboard.waitForLoadState('load');
    // Wait for ready-to-show before closing; otherwise the startup callback legitimately shows it again.
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http:'))?.isVisible())).toBe(true);
    const overlaysOnMain = () => app.evaluate(({ BrowserWindow, screen }) => {
      const main = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http:'))!;
      const display = screen.getDisplayMatching(main.getBounds());
      return BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().endsWith('overlay.html') && screen.getDisplayMatching(w.getBounds()).id === display.id).map(w => ({ visible: w.isVisible(), focusable: w.isFocusable() }));
    });
    await expect.poll(() => streams.size).toBeGreaterThanOrEqual(2);
    expect(await overlaysOnMain()).toEqual([]);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http:'))!.close());
    await expect.poll(overlaysOnMain).toEqual([{ visible: true, focusable: false }]);
    await expect.poll(async () => {
      for (const page of app.windows().filter(p => p.url().endsWith('overlay.html'))) if (await page.locator('[data-helper="fixture-helper"]').count()) return true;
      return false;
    }).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http:'))!.show());
    await expect.poll(overlaysOnMain).toEqual([]);
  } finally {
    await app.close(); for (const res of streams) res.end(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(home, { recursive: true, force: true });
  }
});
