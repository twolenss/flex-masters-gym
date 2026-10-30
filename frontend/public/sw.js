// Retires cache-first behavior from earlier versions so local and deployed updates appear immediately.
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => { await self.clients.claim(); await self.registration.unregister(); })());
});
