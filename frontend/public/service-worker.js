const CACHE_NAME = 'wealth-vault-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/*',
  '/src/*',
];

// Install event - cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, falling back to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request because it's a one-time use stream
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest)
          .then(response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response because it's a one-time use stream
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // Don't cache if the URL contains certain patterns
                if (!event.request.url.includes('/api/')) {
                  cache.put(event.request, responseToCache);
                }
              });

            return response;
          })
          .catch(() => {
            // If both cache and network fail, return a fallback
            return new Response('Offline. Please check your connection.');
          });
      })
  );
});

// Push notification event handler
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch (error) {
      console.error('[SW] Error parsing push data:', error);
      data = { title: 'Wealth Vault', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || data.message || 'You have a new notification',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/icon-192x192.png',
    image: data.image,
    data: data.data || {},
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false,
    tag: data.tag || 'wealth-vault-notification',
    renotify: data.renotify !== false,
    vibrate: data.vibrate || [200, 100, 200],
    timestamp: Date.now()
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Wealth Vault', options)
      .then(() => {
        console.log('[SW] Notification displayed');
      })
      .catch(error => {
        console.error('[SW] Error showing notification:', error);
      })
  );
});

// Notification click event handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);

  event.notification.close();

  const notificationData = event.notification.data || {};
  let url = '/';

  // Determine URL based on notification type and data
  if (notificationData.url) {
    url = notificationData.url;
  } else if (notificationData.goalId) {
    url = '/goals';
  } else if (notificationData.subId) {
    url = '/subscriptions';
  } else if (notificationData.type === 'budget_alert') {
    url = '/budgets';
  } else if (notificationData.type === 'security') {
    url = '/security';
  }

  // Handle action clicks
  if (event.action) {
    switch (event.action) {
      case 'view':
        // Open the relevant page
        break;
      case 'dismiss':
        // Just close, no action needed
        return;
      default:
        // Custom action handling
        console.log('[SW] Custom action:', event.action);
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Check if there's already a window/tab open with the target URL
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }

        // If no suitable window is found, open a new one
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
      .catch(error => {
        console.error('[SW] Error handling notification click:', error);
      })
  );
});

// Background sync for offline notifications
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'background-notification-sync') {
    event.waitUntil(
      // Handle any pending notifications that couldn't be sent while offline
      handlePendingNotifications()
    );
  }
});

// Message event handler for communication with the main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: '1.0.0' });
  }
});

// Handle pending notifications (for offline scenarios)
async function handlePendingNotifications() {
  try {
    // Check for any cached notifications that need to be processed
    const cache = await caches.open('notification-cache');
    const keys = await cache.keys();

    for (const request of keys) {
      try {
        const response = await cache.match(request);
        if (response) {
          // Process the cached notification
          console.log('[SW] Processing cached notification');
          // Implementation would depend on your specific caching strategy
        }
      } catch (error) {
        console.error('[SW] Error processing cached notification:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Error in background sync:', error);
  }
}