// Push Notification Hook
// Provides React interface for push notification functionality

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import pushNotificationService from '../services/pushNotificationService';

interface PushNotificationState {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  loading: boolean;
  error: string | null;
}

interface PushNotificationHook extends PushNotificationState {
  requestPermission: () => Promise<{ granted: boolean; permission: NotificationPermission }>;
  subscribe: (vapidPublicKey: string) => Promise<{ success: boolean; error?: string }>;
  unsubscribe: () => Promise<{ success: boolean; error?: string }>;
  sendTestNotification: () => Promise<{ success: boolean; error?: string }>;
  refreshStatus: () => Promise<void>;
}

export const usePushNotifications = (): PushNotificationHook => {
  const { user } = useAuth();
  const [state, setState] = useState<PushNotificationState>({
    supported: false,
    permission: 'default',
    subscribed: false,
    loading: true,
    error: null
  });

  // Initialize push notifications
  const init = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const result = await pushNotificationService.init();

      setState({
        supported: result.supported,
        permission: result.permission,
        subscribed: result.subscribed,
        loading: false,
        error: result.error || null
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize push notifications'
      }));
    }
  }, []);

  // Request permission
  const requestPermission = useCallback(async () => {
    const result = await pushNotificationService.requestPermission();

    setState(prev => ({
      ...prev,
      permission: result.permission
    }));

    return result;
  }, []);

  // Subscribe to notifications
  const subscribe = useCallback(async (vapidPublicKey: string) => {
    if (!user?._id) {
      return { success: false, error: 'User not authenticated' };
    }

    const result = await pushNotificationService.subscribe(vapidPublicKey);

    if (result.success) {
      // Send subscription to server
      const serverResult = await pushNotificationService.sendSubscriptionToServer(user._id);

      if (serverResult.success) {
        setState(prev => ({ ...prev, subscribed: true }));
        return { success: true };
      } else {
        // Unsubscribe locally if server failed
        await pushNotificationService.unsubscribe();
        return { success: false, error: serverResult.error };
      }
    }

    return result;
  }, [user?._id]);

  // Unsubscribe from notifications
  const unsubscribe = useCallback(async () => {
    if (!user?._id) {
      return { success: false, error: 'User not authenticated' };
    }

    const result = await pushNotificationService.unsubscribe();

    if (result.success) {
      // Remove subscription from server
      await pushNotificationService.removeSubscriptionFromServer(user._id);
      setState(prev => ({ ...prev, subscribed: false }));
    }

    return result;
  }, [user?._id]);

  // Send test notification
  const sendTestNotification = useCallback(async () => {
    return await pushNotificationService.sendTestNotification();
  }, []);

  // Refresh status
  const refreshStatus = useCallback(async () => {
    await init();
  }, [init]);

  // Initialize on mount and when user changes
  useEffect(() => {
    init();
  }, [init]);

  // Listen for permission changes
  useEffect(() => {
    const handlePermissionChange = () => {
      setState(prev => ({
        ...prev,
        permission: Notification.permission as NotificationPermission
      }));
    };

    // Some browsers support permission change events
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' }).then((permissionStatus) => {
        permissionStatus.addEventListener('change', handlePermissionChange);
      });
    }

    return () => {
      // Cleanup would go here if needed
    };
  }, []);

  return {
    ...state,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTestNotification,
    refreshStatus
  };
};