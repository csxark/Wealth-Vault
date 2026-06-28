// Service Worker for Push Notifications
// This service worker handles push notifications and background sync

const CACHE_NAME = 'wealth-vault-v1';
const API_BASE_URL = '/api';

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/static/js/bundle.js',
        '/static/css/main.css',
        '/manifest.json'
      ]).catch((error) => {
        console.log('Service Worker: Cache addAll failed:', error);
      });
    })
  );
  // Force activation
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients
      return self.clients.claim();
    })
  );
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received', event);

  if (!event.data) {
    console.log('Service Worker: Push notification without data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('Service Worker: Push data:', data);

    const options = {
      body: data.body || 'You have a new notification',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      image: data.image,
      data: {
        url: data.url || '/',
        type: data.type || 'general',
        id: data.id
      },
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
      silent: data.silent || false,
      tag: data.tag || 'wealth-vault-notification',
      renotify: data.renotify || true,
      vibrate: data.vibrate || [200, 100, 200]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Wealth Vault', options)
    );
  } catch (error) {
    console.error('Service Worker: Error processing push data:', error);
    // Fallback notification
    event.waitUntil(
      self.registration.showNotification('Wealth Vault', {
        body: 'You have a new notification',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: 'wealth-vault-notification'
      })
    );
  }
});

// Notification click event - handle user interaction
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event);

  const notification = event.notification;
  const data = notification.data || {};

  notification.close();

  // Handle action clicks
  if (event.action) {
    console.log('Service Worker: Action clicked:', event.action);

    switch (event.action) {
      case 'view':
        event.waitUntil(
          clients.openWindow(data.url || '/')
        );
        break;
      case 'dismiss':
        // Just close the notification (already done above)
        break;
      default:
        // Custom action handling
        event.waitUntil(
          clients.openWindow(data.url || '/')
        );
    }
  } else {
    // Default click behavior
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        const url = data.url || '/';

        // Check if there's already a window open with this URL
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }

        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

// Background sync for offline notifications
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);

  if (event.tag === 'notification-sync') {
    event.waitUntil(syncNotifications());
  }
});

// Function to sync notifications when back online
async function syncNotifications() {
  try {
    // Get stored notifications from IndexedDB or similar
    const notifications = await getStoredNotifications();

    for (const notification of notifications) {
      // Send notification to server or process locally
      await processStoredNotification(notification);
    }

    // Clear stored notifications
    await clearStoredNotifications();
  } catch (error) {
    console.error('Service Worker: Error syncing notifications:', error);
  }
}

// Helper functions for notification storage (would use IndexedDB in production)
async function getStoredNotifications() {
  // Implementation would use IndexedDB
  return [];
}

async function processStoredNotification(notification) {
  // Implementation would send to server
  console.log('Processing stored notification:', notification);
}

async function clearStoredNotifications() {
  // Implementation would clear IndexedDB
  console.log('Clearing stored notifications');
}

// Message event - handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: '1.0.0' });
  }
});

// Periodic background task (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'notification-check') {
      event.waitUntil(checkForNewNotifications());
    }
  });
}

async function checkForNewNotifications() {
  try {
    // Check for new notifications from server
    const response = await fetch(`${API_BASE_URL}/notifications/check`);
    if (response.ok) {
      const data = await response.json();
      if (data.notifications && data.notifications.length > 0) {
        // Show notifications
        for (const notification of data.notifications) {
          self.registration.showNotification(notification.title, {
            body: notification.body,
            icon: '/icon-192x192.png',
            tag: 'wealth-vault-notification'
          });
        }
      }
    }
  } catch (error) {
    console.error('Service Worker: Error checking notifications:', error);
  }
}