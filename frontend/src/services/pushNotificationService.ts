// Push Notification Service
// Handles browser push notification permissions, subscriptions, and sending

class PushNotificationService {
  private registration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;
  private permission: NotificationPermission = 'default';

  constructor() {
    this.registration = null;
    this.subscription = null;
    this.permission = 'default';
  }

  // Initialize the service worker and check permissions
  async init() {
    try {
      // Check if service workers are supported
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service workers not supported');
      }

      // Check if push messaging is supported
      if (!('PushManager' in window)) {
        throw new Error('Push messaging not supported');
      }

      // Register service worker
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('Service Worker registered:', this.registration);

      // Check current permission status
      this.permission = Notification.permission;

      // Get existing subscription
      this.subscription = await this.registration.pushManager.getSubscription();

      return {
        supported: true,
        permission: this.permission,
        subscribed: !!this.subscription
      };
    } catch (error) {
      console.error('Push notification init failed:', error);
      return {
        supported: false,
        permission: 'denied' as NotificationPermission,
        subscribed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Request notification permission from user
  async requestPermission(): Promise<{ granted: boolean; permission: NotificationPermission }> {
    try {
      if (!('Notification' in window)) {
        throw new Error('Notifications not supported');
      }

      const permission = await Notification.requestPermission();
      this.permission = permission;

      return {
        granted: permission === 'granted',
        permission
      };
    } catch (error) {
      console.error('Permission request failed:', error);
      return {
        granted: false,
        permission: 'denied'
      };
    }
  }

  // Subscribe to push notifications
  async subscribe(vapidPublicKey: string) {
    try {
      if (!this.registration) {
        throw new Error('Service worker not registered');
      }

      if (this.permission !== 'granted') {
        throw new Error('Notification permission not granted');
      }

      // Convert VAPID key to Uint8Array
      const applicationServerKey = this.urlB64ToUint8Array(vapidPublicKey);

      // Subscribe
      this.subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      console.log('Push subscription created:', this.subscription);

      return {
        success: true,
        subscription: this.subscription
      };
    } catch (error) {
      console.error('Subscription failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Unsubscribe from push notifications
  async unsubscribe() {
    try {
      if (!this.subscription) {
        return { success: true }; // Already unsubscribed
      }

      const result = await this.subscription.unsubscribe();
      this.subscription = null;

      return {
        success: result
      };
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Send subscription to server
  async sendSubscriptionToServer(userId: string) {
    try {
      if (!this.subscription) {
        throw new Error('No active subscription');
      }

      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          subscription: this.subscription.toJSON()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send subscription to server');
      }

      const result = await response.json();
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Send subscription failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Remove subscription from server
  async removeSubscriptionFromServer(userId: string) {
    try {
      const response = await fetch('/api/notifications/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to remove subscription from server');
      }

      const result = await response.json();
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Remove subscription failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Send a test notification
  async sendTestNotification() {
    try {
      if (!this.registration) {
        throw new Error('Service worker not registered');
      }

      await this.registration.showNotification('Test Notification', {
        body: 'This is a test push notification from Wealth Vault!',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: 'test-notification',
        requireInteraction: false
      });

      return { success: true };
    } catch (error) {
      console.error('Test notification failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get current status
  getStatus() {
    return {
      supported: 'serviceWorker' in navigator && 'PushManager' in window,
      permission: this.permission,
      subscribed: !!this.subscription,
      registration: !!this.registration
    };
  }

  // Utility function to convert VAPID key
  urlB64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

// Create singleton instance
const pushNotificationService = new PushNotificationService();

export default pushNotificationService;