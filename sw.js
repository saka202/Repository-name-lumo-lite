/* 极简离线缓存 */
const CACHE = 'lumo-lite-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './js/advisor.js',
  './js/detect.js',
  './js/camera.js',
  './js/overlay.js',
  './js/app.js',
  './vendor/face-api.js',
  './vendor/models/tiny_face_detector_model-weights_manifest.json',
  './vendor/models/tiny_face_detector_model.bin',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() =>
      caches.match(e.request).then(hit => hit || caches.match('./index.html'))
    )
  );
});
