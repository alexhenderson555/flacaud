self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Do NOT cache /api/stream/ because <audio> tags rely on HTTP 206 Partial Content
  // and byte-range requests which are notoriously broken when proxied through a Service Worker.
  // The browser natively caches media streams anyway.
  if (url.pathname.startsWith('/api/stream/')) {
    return; // Pass through to network natively
  }
});
