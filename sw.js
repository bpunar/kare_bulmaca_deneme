// Bulmaca Masası çevrimdışı önbellek (otomatik üretilir: claude/yayin_uret.py). Sürüm 2026-10-25-g105.
const ONBELLEK = "bulmaca-2026-10-25-g105-e71f9176-deneme";
const DOSYALAR = ["./", "index.html", "bulmaca.js?v=2026-10-25-g105", "veri/kelime_web.json", "manifest.webmanifest", "favicon.svg", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "yazitipleri/fonts.css", "yazitipleri/fraunces-latin-500.woff2", "yazitipleri/fraunces-latin-ext-500.woff2", "yazitipleri/ibm-plex-mono-latin-500.woff2", "yazitipleri/ibm-plex-mono-latin-600.woff2", "yazitipleri/ibm-plex-mono-latin-700.woff2", "yazitipleri/ibm-plex-mono-latin-ext-500.woff2", "yazitipleri/ibm-plex-mono-latin-ext-600.woff2", "yazitipleri/ibm-plex-mono-latin-ext-700.woff2", "yazitipleri/karla-latin-400.woff2", "yazitipleri/karla-latin-ext-400.woff2"];

self.addEventListener("install", (olay) => {
  olay.waitUntil(caches.open(ONBELLEK).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (olay) => {
  olay.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a.startsWith("bulmaca-") && a !== ONBELLEK).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (olay) => {
  const istek = olay.request;
  if (istek.method !== "GET" || new URL(istek.url).origin !== self.location.origin) return;
  if (istek.mode === "navigate") {
    // sayfa: önce ağ (yeni sürüm hemen görünsün), ağ yoksa önbellek
    olay.respondWith(
      fetch(istek)
        .then((yanit) => { const kopya = yanit.clone(); caches.open(ONBELLEK).then((c) => c.put("index.html", kopya)); return yanit; })
        .catch(() => caches.match("index.html").then((y) => y || caches.match("./")))
    );
    return;
  }
  // diğer dosyalar: önce önbellek (sürümlü adres olduğundan güvenli), yoksa ağ
  olay.respondWith(
    caches.match(istek).then((y) => y || fetch(istek).then((yanit) => {
      if (yanit.ok) { const kopya = yanit.clone(); caches.open(ONBELLEK).then((c) => c.put(istek, kopya)); }
      return yanit;
    }))
  );
});
