// Service Worker for Antrean Puskesmas PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle messages from the client pages to show notifications even when minimized
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, data } = event.data;
    const options = {
      body: body || 'Silakan cek status nomor antrean Anda.',
      icon: icon || '/icon.svg',
      badge: '/icon.svg',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'antrean-call',
      renotify: true,
      requireInteraction: true,
      data: data || {},
    };

    event.waitUntil(
      self.registration.showNotification(title || 'Panggilan Antrean!', options)
    );
  }
});

// Handle push notification
self.addEventListener('push', (event) => {
  let data = { title: 'Panggilan Antrean Puskesmas!', body: 'Nomor antrean Anda sedang dipanggil.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'antrean-call',
    renotify: true,
    requireInteraction: true,
    data: data,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Focus or open app on notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
