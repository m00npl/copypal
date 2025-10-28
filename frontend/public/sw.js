// Empty service worker to prevent Vite/Workbox issues
// This disables any automatic service worker registration

self.addEventListener('install', () => {
  // Skip waiting and immediately activate
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up any old caches and take control of all clients immediately
  event.waitUntil(self.clients.claim());
});

// Don't handle any fetch events - just pass through
self.addEventListener('fetch', (event) => {
  // Do nothing, just pass the request through
});