import { useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import type { User } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session
    const checkSession = async () => {
      try {
        // Check if we have a token in localStorage
        const token = localStorage.getItem('authToken');
        if (token) {
          // Try to get user profile from backend
          const response = await authAPI.getProfile();
          if (response.success && response.data.user) {
            setUser(response.data.user);
          } else {
            // Token might be invalid, remove it
            localStorage.removeItem('authToken');
          }
        }
      } catch (error) {
        console.error('Error checking session:', error);
        // Remove invalid token
        localStorage.removeItem('authToken');
      } finally {
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
        return { success: true, user: result.data.user };
      } else {
        return { success: false, error: 'Registration failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Registration failed' };
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
        return { success: true, user: result.data.user };
      } else {
        return { success: false, error: 'Login failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Login failed' };
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
        return { success: true, user: result.data.user };
      } else {
        return { success: false, error: 'Profile update failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Profile update failed' };
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