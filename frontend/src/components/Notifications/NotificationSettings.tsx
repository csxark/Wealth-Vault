// Notification Settings Component
// Allows users to manage push notification preferences

import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Settings, TestTube, CheckCircle, XCircle, Loader } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useToast } from '../../context/ToastContext';

interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
}

export const NotificationSettings: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    supported,
    permission,
    subscribed,
    loading,
    error,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTestNotification,
    refreshStatus
  } = usePushNotifications();

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email: true,
    push: false,
    sms: false
  });

  const [saving, setSaving] = useState(false);

  // Load user preferences
  useEffect(() => {
    if (user?.preferences?.notifications) {
      setPreferences(user.preferences.notifications);
    }
  }, [user]);

  // Handle permission request
  const handleRequestPermission = async () => {
    const result = await requestPermission();

    if (result.granted) {
      showToast('Notification permission granted!', 'success');
      // Auto-subscribe after permission granted
      handleSubscribe();
    } else {
      showToast('Notification permission denied', 'error');
    }
  };

  // Handle subscription
  const handleSubscribe = async () => {
    // In a real app, you'd get the VAPID key from environment variables
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BKxQzO7qDsO9sVz8nW8KQyO2Vz8nW8KQyO2Vz8nW8KQyO2Vz8nW8KQyO2Vz8nW8KQyO2Vz8nW8KQyO2Vz8nW8KQyO2Vz8nW8KQ';

    const result = await subscribe(vapidKey);

    if (result.success) {
      showToast('Successfully subscribed to push notifications!', 'success');
      refreshStatus();
    } else {
      showToast(`Failed to subscribe: ${result.error}`, 'error');
    }
  };

  // Handle unsubscription
  const handleUnsubscribe = async () => {
    const result = await unsubscribe();

    if (result.success) {
      showToast('Successfully unsubscribed from push notifications', 'success');
      refreshStatus();
    } else {
      showToast(`Failed to unsubscribe: ${result.error}`, 'error');
    }
  };

  // Handle test notification
  const handleTestNotification = async () => {
    const result = await sendTestNotification();

    if (result.success) {
      showToast('Test notification sent!', 'success');
    } else {
      showToast(`Failed to send test: ${result.error}`, 'error');
    }
  };

  // Save preferences
  const savePreferences = async () => {
    if (!user) return;

    setSaving(true);
    try {
      // In a real app, this would call an API to save preferences
      // For now, we'll just show a success message
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call

      showToast('Notification preferences saved!', 'success');
    } catch (error) {
      showToast('Failed to save preferences', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!supported) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex items-center">
          <BellOff className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2" />
          <div>
            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Push Notifications Not Supported
            </h3>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              Your browser doesn't support push notifications. Try using a modern browser like Chrome, Firefox, or Edge.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Push Notification Status */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            {subscribed ? (
              <CheckCircle className="h-6 w-6 text-green-500 mr-3" />
            ) : (
              <Bell className="h-6 w-6 text-gray-400 mr-3" />
            )}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Push Notifications
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {subscribed ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
          {loading && <Loader className="h-5 w-5 animate-spin text-blue-500" />}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          {/* Permission Status */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Browser Permission
            </span>
            <div className="flex items-center">
              {permission === 'granted' ? (
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
              ) : permission === 'denied' ? (
                <XCircle className="h-4 w-4 text-red-500 mr-2" />
              ) : (
                <div className="h-4 w-4 rounded-full bg-yellow-400 mr-2" />
              )}
              <span className={`text-sm font-medium ${
                permission === 'granted' ? 'text-green-600' :
                permission === 'denied' ? 'text-red-600' :
                'text-yellow-600'
              }`}>
                {permission === 'granted' ? 'Granted' :
                 permission === 'denied' ? 'Denied' :
                 'Not Asked'}
              </span>
            </div>
          </div>

          {/* Subscription Status */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Push Subscription
            </span>
            <div className="flex items-center">
              {subscribed ? (
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
              ) : (
                <XCircle className="h-4 w-4 text-gray-400 mr-2" />
              )}
              <span className={`text-sm font-medium ${
                subscribed ? 'text-green-600' : 'text-gray-500'
              }`}>
                {subscribed ? 'Subscribed' : 'Not Subscribed'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mt-4">
          {permission !== 'granted' && (
            <button
              onClick={handleRequestPermission}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Enable Notifications
            </button>
          )}

          {permission === 'granted' && !subscribed && (
            <button
              onClick={handleSubscribe}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Subscribe to Push
            </button>
          )}

          {subscribed && (
            <button
              onClick={handleUnsubscribe}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Unsubscribe
            </button>
          )}

          {subscribed && (
            <button
              onClick={handleTestNotification}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center"
            >
              <TestTube className="h-4 w-4 mr-2" />
              Test Notification
            </button>
          )}
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center mb-4">
          <Settings className="h-5 w-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Notification Preferences
          </h3>
        </div>

        <div className="space-y-4">
          {Object.entries(preferences).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {getPreferenceDescription(key)}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setPreferences(prev => ({
                    ...prev,
                    [key]: e.target.checked
                  }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <button
            onClick={savePreferences}
            disabled={saving}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
          >
            {saving ? (
              <>
                <Loader className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Preferences'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper function for preference descriptions
function getPreferenceDescription(key: string): string {
  const descriptions: Record<string, string> = {
    budgetAlerts: 'Get notified when you exceed budget limits',
    goalReminders: 'Receive reminders about your financial goals',
    securityAlerts: 'Important security notifications and warnings',
    weeklyReports: 'Weekly summary of your financial activity',
    marketing: 'Promotional offers and new feature announcements'
  };
  return descriptions[key] || '';
}