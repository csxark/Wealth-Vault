import { useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { User } from '../types';

// Helper function to sync theme preference to localStorage
const syncThemePreference = (user: User) => {
  if (user?.preferences?.theme) {
    const themeMode = user.preferences.theme;
    localStorage.setItem('themeMode', themeMode);
    console.log('[useAuth] Theme preference synced from backend:', themeMode);
  }
};

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  // Effect to sync theme when user changes
  useEffect(() => {
    if (user) {
      syncThemePreference(user);
    }
  }, [user]);

  useEffect(() => {
    // Check current session
    const checkSession = async () => {
      try {
        // Check if we have a token in localStorage
        const token = localStorage.getItem('authToken');
        console.log('[useAuth] Checking session, token:', token);
        
        if (token) {
          // Check if it's a dev bypass token
          if (token === 'dev-mock-token-123') {
            // Use the stored mock user without backend validation
            const storedUser = localStorage.getItem('user');
            console.log('[useAuth] Dev token detected, storedUser:', storedUser);
            if (storedUser) {
              const parsedUser = JSON.parse(storedUser);
              console.log('[useAuth] Setting dev user:', parsedUser);
              setUser(parsedUser);
              // Sync theme preference for dev user
              syncThemePreference(parsedUser);
              setLoading(false);
              return;
            }
          }
          
          // Try to get user profile from backend
          console.log('[useAuth] Fetching profile from backend');
          const response = await authAPI.getProfile();
          if (response.success && response.data.user) {
            console.log('[useAuth] Backend profile success:', response.data.user);
            setUser(response.data.user);
            // Sync theme preference
            syncThemePreference(response.data.user);
          } else {
            // Token might be invalid, remove it
            console.log('[useAuth] Invalid token, removing');
            localStorage.removeItem('authToken');
          }
        } else {
          console.log('[useAuth] No token found');
        }
      } catch (error) {
        console.error('[useAuth] Error checking session:', error);
        // Don't remove dev mock token on error
        const token = localStorage.getItem('authToken');
        if (token === 'dev-mock-token-123') {
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            console.log('[useAuth] Error but dev token present, using mock user');
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            // Sync theme preference for dev user
            syncThemePreference(parsedUser);
            setLoading(false);
            return;
          }
        }
        // Remove invalid token
        localStorage.removeItem('authToken');
      } finally {
        console.log('[useAuth] Setting loading to false');
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    setLoading(true);
    try {
      const result = await authAPI.register({
        email,
        password,
        firstName,
        lastName
      });
      
      if (result.success && result.data.user) {
        setUser(result.data.user);
        localStorage.setItem('authToken', result.data.token);
        showToast('Account created successfully! Welcome to Wealth Vault.', 'success');
        return { success: true, user: result.data.user };
      } else {
        showToast('Registration failed. Please try again.', 'error');
        return { success: false, error: 'Registration failed' };
      }
    } catch (error: unknown) {
      const err = error as Error;
      showToast(err.message || 'Registration failed. Please try again.', 'error');
      return { success: false, error: err.message || 'Registration failed' };
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await authAPI.login({ email, password });
      
      if (result.success && result.data.user) {
        setUser(result.data.user);
        localStorage.setItem('authToken', result.data.token);
        showToast('Welcome back! Successfully logged in.', 'success');
        return { success: true, user: result.data.user };
      } else {
        showToast('Login failed. Please check your credentials.', 'error');
        return { success: false, error: 'Login failed' };
      }
    } catch (error: unknown) {
      const err = error as Error;
      showToast(err.message || 'Login failed. Please try again.', 'error');
      return { success: false, error: err.message || 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      localStorage.removeItem('authToken');
      setLoading(false);
    }
  };

  const updateProfile = async (profileData: Partial<User>) => {
    try {
      const result = await authAPI.updateProfile(profileData);
      if (result.success && result.data.user) {
        setUser(result.data.user);
        showToast('Profile updated successfully!', 'success');
        return { success: true, user: result.data.user };
      } else {
        showToast('Profile update failed. Please try again.', 'error');
        return { success: false, error: 'Profile update failed' };
      }
    } catch (error: unknown) {
      const err = error as Error;
      showToast(err.message || 'Profile update failed. Please try again.', 'error');
      return { success: false, error: err.message || 'Profile update failed' };
    }
  };

  return {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile
  };
};