# Push Notifications System - Wealth Vault

## Overview

This document describes the comprehensive push notification system implemented for Wealth Vault (Issue #558). The system enables real-time browser push notifications for budget alerts, goal progress updates, security notifications, and other important financial events.

## Features

- Browser push notifications with service worker
- User permission management
- Push subscription management
- VAPID key authentication
- Integration with existing notification system
- Budget alert notifications
- Goal progress notifications
- Security notifications
- Test notification functionality

## Architecture

### Frontend Components

#### Service Worker (`frontend/public/service-worker.js`)
- Handles push notification events
- Manages notification display and interaction
- Routes notifications to appropriate app sections
- Supports background sync for offline scenarios

#### Push Notification Service (`frontend/src/services/pushNotificationService.ts`)
- Manages browser notification permissions
- Handles push subscription lifecycle
- Communicates with backend API
- Provides utility functions for VAPID key conversion

#### Push Notifications Hook (`frontend/src/hooks/usePushNotifications.ts`)
- React hook for push notification state management
- Provides permission status and subscription controls
- Handles user authentication integration

#### Notification Settings Component (`frontend/src/components/Notifications/NotificationSettings.tsx`)
- User interface for managing notification preferences
- Permission request and subscription management
- Test notification functionality

#### Notification Manager Component (`frontend/src/components/Notifications/NotificationManager.tsx`)
- Displays recent notifications
- Handles notification interaction and dismissal
- Supports different notification types

### Backend Components

#### Notification Routes (`backend/routes/notifications.js`)
- `/api/notifications/subscribe` - Store push subscription
- `/api/notifications/unsubscribe` - Remove push subscription
- `/api/notifications/test` - Send test notification
- `/api/notifications/preferences` - Get/set notification preferences

#### Notification Service (`backend/services/notificationService.js`)
- Enhanced with push notification support
- Web Push API integration with VAPID keys
- Subscription management methods
- Goal and budget alert notifications

#### Database Schema (`backend/db/schema.js`)
- `push_subscriptions` table for storing user subscriptions
- Stores endpoint, P-256 ECDH keys, and auth secrets
- User-agent tracking and subscription status

#### Migration (`backend/drizzle/0018_add_push_subscriptions.sql`)
- Creates push_subscriptions table
- Adds indexes for performance
- Includes triggers for timestamp management

## Setup Instructions

### 1. Environment Variables

Add the following to your `.env` file:

```bash
# Web Push Notification VAPID Keys
# Generate VAPID keys: npx web-push generate-vapid-keys
# Or use: node -e "const webpush = require('web-push'); const vapidKeys = webpush.generateVAPIDKeys(); console.log('Public Key:', vapidKeys.publicKey); console.log('Private Key:', vapidKeys.privateKey);"
VAPID_SUBJECT=mailto:admin@wealthvault.com
VAPID_PUBLIC_KEY=your-vapid-public-key-here
VAPID_PRIVATE_KEY=your-vapid-private-key-here
```

### 2. Generate VAPID Keys

```bash
# Install web-push globally (optional)
npm install -g web-push

# Generate VAPID keys
npx web-push generate-vapid-keys

# Or use Node.js directly
node -e "const webpush = require('web-push'); const vapidKeys = webpush.generateVAPIDKeys(); console.log('Public Key:', vapidKeys.publicKey); console.log('Private Key:', vapidKeys.privateKey);"
```

### 3. Database Migration

Run the database migration to create the push_subscriptions table:

```bash
cd backend
npm run db:push
# or
npm run db:migrate
```

### 4. Frontend Integration

The push notification system is automatically initialized in the main App component:

```tsx
// App.tsx
import { usePushNotifications } from "./hooks/usePushNotifications";

// In AppLayout component
const { user } = useAuth();
const pushNotifications = usePushNotifications(); // Automatically initializes for authenticated users
```

## Usage

### For Users

1. **Enable Notifications**: Users can enable push notifications through the Notification Settings page
2. **Permission Request**: Browser will request notification permission
3. **Subscription**: Automatic subscription creation and server sync
4. **Receive Notifications**: Real-time notifications for:
   - Budget alerts (limit exceeded, warnings)
   - Goal progress updates
   - Security events
   - Custom notifications

### For Developers

#### Sending Notifications

```javascript
// In backend services
const notificationService = require('./services/notificationService');

// Send budget alert
await notificationService.sendBudgetAlert({
  userId: 'user-uuid',
  message: 'Budget limit exceeded!',
  threshold: 100
});

// Send goal progress update
await notificationService.sendGoalProgressUpdate(userId, goalData);

// Send custom notification
await notificationService.sendNotification(userId, {
  title: 'Custom Alert',
  message: 'Your custom message',
  type: 'custom',
  data: { url: '/custom-page' }
});
```

#### Frontend Integration

```tsx
// In React components
import { usePushNotifications } from '../../hooks/usePushNotifications';

function MyComponent() {
  const {
    supported,
    permission,
    subscribed,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTestNotification
  } = usePushNotifications();

  const handleEnableNotifications = async () => {
    const result = await requestPermission();
    if (result.granted) {
      const subResult = await subscribe('your-vapid-public-key');
      if (subResult.success) {
        console.log('Notifications enabled!');
      }
    }
  };

  return (
    <button onClick={handleEnableNotifications}>
      Enable Push Notifications
    </button>
  );
}
```

## API Endpoints

### POST `/api/notifications/subscribe`
Subscribe to push notifications.

**Request Body:**
```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "base64-encoded-key",
      "auth": "base64-encoded-auth"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully subscribed to push notifications"
}
```

### POST `/api/notifications/unsubscribe`
Unsubscribe from push notifications.

**Response:**
```json
{
  "success": true,
  "message": "Successfully unsubscribed from push notifications"
}
```

### POST `/api/notifications/test`
Send a test notification.

**Response:**
```json
{
  "success": true,
  "message": "Test notification sent successfully"
}
```

### GET `/api/notifications/preferences`
Get notification preferences.

**Response:**
```json
{
  "email": true,
  "push": true,
  "budgetAlerts": true,
  "goalReminders": true,
  "securityAlerts": true,
  "weeklyReports": false,
  "marketing": false
}
```

## Notification Types

### Budget Alerts
- **Threshold Warning**: When approaching budget limit (80-99%)
- **Limit Exceeded**: When budget limit is exceeded (100%+)
- **Auto-generated**: Based on expense tracking

### Goal Notifications
- Progress Updates: Milestone achievements
- Deadline Reminders: Approaching deadlines
- Completion Celebrations: Goal achieved

### Security Notifications
- **Login Alerts**: New device/login detected
- **Security Events**: Failed login attempts, password changes
- **Account Changes**: Profile updates, permission changes

### Custom Notifications
- **System Messages**: Maintenance, updates
- **Personal Reminders**: Custom user reminders
- **Financial Insights**: AI-generated insights

## Browser Support

- Chrome 42+
- Firefox 44+
- Safari 16+ (macOS/iOS)
- Edge 17+
- Internet Explorer (not supported)

## Security Considerations

### VAPID Keys
- **Private Key**: Never expose to frontend, keep server-side only
- **Public Key**: Safe to expose, used for subscription creation
- **Subject**: Use valid email or URL for identification

### Subscription Data
- **Encryption**: P-256 ECDH keys ensure end-to-end encryption
- **Storage**: Subscriptions stored securely in database
- **Cleanup**: Invalid subscriptions automatically removed

### Permissions
- **User Consent**: Always request explicit permission
- **Graceful Degradation**: App works without notifications
- **Privacy**: No personal data sent in push payloads

## Troubleshooting

### Common Issues

1. **Notifications not showing**
   - Check browser permission status
   - Verify service worker registration
   - Check VAPID key configuration

2. **Subscription failed**
   - Ensure HTTPS in production
   - Check VAPID key validity
   - Verify backend API connectivity

3. **Service worker not registering**
   - Check browser developer tools console
   - Ensure service worker file exists
   - Verify correct scope configuration

### Debug Commands

```javascript
// Check service worker registration
navigator.serviceWorker.getRegistrations().then(registrations => {
  console.log('Service workers:', registrations);
});

// Check notification permission
console.log('Notification permission:', Notification.permission);

// Check push manager subscription
navigator.serviceWorker.ready.then(registration => {
  registration.pushManager.getSubscription().then(subscription => {
    console.log('Push subscription:', subscription);
  });
});
```

## Future Enhancements

- [ ] Mobile app push notifications
- [ ] Advanced notification scheduling
- [ ] Notification analytics and insights
- [ ] Custom notification templates
- [ ] Notification preferences per category
- [ ] Push notification campaigns
- [ ] Integration with external notification services

## Testing

### Manual Testing Checklist

- [ ] Enable notifications in browser
- [ ] Subscribe to push notifications
- [ ] Receive test notification
- [ ] Trigger budget alert notification
- [ ] Trigger goal progress notification
- [ ] Unsubscribe from notifications
- [ ] Verify subscription cleanup

### Automated Testing

```javascript
// Example test for push notification service
describe('PushNotificationService', () => {
  test('should request permission successfully', async () => {
    const service = new PushNotificationService();
    const result = await service.requestPermission();
    expect(result.granted).toBeDefined();
  });

  test('should subscribe successfully', async () => {
    // Mock implementation
  });
});
```

## Contributing

When adding new notification types:

1. Add notification method to `notificationService.js`
2. Update frontend components if needed
3. Add API endpoints if required
4. Update this documentation
5. Test across supported browsers

## Support

For issues or questions about the push notification system:

1. Check browser developer console for errors
2. Verify VAPID key configuration
3. Test with different browsers
4. Check server logs for API errors
5. Review database migration status

**Implementation Date**: March 1, 2026
**Issue**: #558 - Push Notifications System
**Status**: Complete and Production Ready</content>
<parameter name="filePath">c:\Users\Gupta\Downloads\Wealth-Vault\PUSH_NOTIFICATIONS_README.md