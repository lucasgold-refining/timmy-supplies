const CACHE = 'timmy-supplies-v1';
const CORE = ['./', './index.html', './manifest.json'];
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './fonts/manrope-400-800.woff2'];
// Same update model as Ledger: open instantly from cache, refresh index.html in the background,
// and show "New version ready · Tap to update" when it changed. A new worker waits until that tap.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))
    .then(() => Promise.all(ASSETS.filter(u => !CORE.includes(u)).map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))));
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'skip-waiting') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function tell(msg) { (await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })).forEach(c => c.postMessage(msg)); }
async function page(e) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('./index.html');
  const oldCopy = cached ? cached.clone() : null;
  const refresh = fetch('./index.html', { cache: 'no-cache' }).then(async r => {
    if (!r.ok) return r;
    const fresh = await r.clone().text(), old = oldCopy ? await oldCopy.text() : null;
    if (fresh !== old) { await cache.put('./index.html', r.clone()); if (old !== null) setTimeout(() => tell({ type: 'index-updated' }), 1000); }
    return r;
  });
  if (cached) { e.waitUntil(refresh.catch(() => {})); return cached; }
  return refresh.catch(() => caches.match('./'));
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (new URL(req.url).pathname.includes('/data/')) return; // link-import files: always from the network
  if (req.mode === 'navigate') { e.respondWith(page(e)); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
