// OXBOT's service worker. It keeps only the app shell (the page, scripts, styles and icons) so a phone can
// say "Can't reach your Mac" when the Mac is off. It never handles /api/: no personal data on the phone's disk.
// Registered only in a secure context (this Mac at localhost); a phone on plain Wi-Fi http never gets it.
const BUILD = 'dev'; // vite.config.ts writes the build hash here, so a new build replaces the old cache.
const SHELL = []; // ...and the list of built files.
const CACHE = `oxbot-shell-${BUILD}`;
const isShell = path => path === '/' || /\.(?:js|css|png|svg|webmanifest|html)$/.test(path);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', ...SHELL])).catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('oxbot-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const offline = () => new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>OXBOT</title>'
  + '<body style="font:17px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:22vh 28px;background:#07080A;color:#ECEBE6">'
  + '<h1 style="font-size:28px;margin:0 0 12px">Can’t reach your Mac.</h1><p style="color:#A3A29B">OXBOT runs on your Mac; open it there, then pull to retry.</p>'
  + '<p><a href="/" style="color:#ECEBE6">Try again</a></p>',
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
);

async function remember(key, response) {
  if (!response.ok || response.type !== 'basic') return;
  const cache = await caches.open(CACHE);
  await cache.put(key, response);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Leave the API, other origins and anything but GET to the network, untouched and never stored.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // The page: fresh from the Mac when it answers, the saved shell when it doesn't.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request)
      .then(response => { event.waitUntil(remember('/', response.clone())); return response; })
      .catch(async () => (await caches.match('/', { cacheName: CACHE })) ?? offline()));
    return;
  }
  if (!isShell(url.pathname)) return;
  // Built files have the hash in their name, so a saved copy is always right. In development, the network first.
  const hashed = BUILD !== 'dev' && url.pathname.startsWith('/assets/');
  event.respondWith(hashed
    ? caches.match(request, { cacheName: CACHE }).then(hit => hit ?? fetch(request).then(response => { event.waitUntil(remember(request, response.clone())); return response; }))
    : fetch(request).then(response => { event.waitUntil(remember(request, response.clone())); return response; })
      .catch(async () => (await caches.match(request, { cacheName: CACHE })) ?? Response.error()));
});
