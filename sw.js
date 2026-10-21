/* ===== Service Worker: يسمح بالتثبيت والعمل بدون إنترنت ===== */
const CACHE = "pure-audio-v2";
const SHELL = ["./", "index.html", "style.css", "script.js", "manifest.json", "logo.png", "icon.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  // نضيف كل ملف على حدة كي لا يفشل التثبيت إن غاب ملف اختياري مثل qr.png
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.concat(["qr.png"]).map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
// نخدم من الكاش ونحدّثه بالخلفية؛ نتجاهل الطلبات غير GET وطلبات السيرفر الخارجي غير المعتمد
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  const ok = u.origin === location.origin || /(cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname);
  if (!ok) return;
  e.respondWith(caches.match(req).then((cached) => {
    const net = fetch(req).then((res) => {
      if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => cached || (req.mode === "navigate" ? caches.match("index.html") : Response.error()));
    return cached || net;
  }));
});
