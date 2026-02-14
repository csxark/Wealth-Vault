import { useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

export type ThemeMode = 'light' | 'dark' | 'auto';

export const useTheme = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('themeMode');
    return (saved as ThemeMode) || 'auto';
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('themeMode');
    if (saved === 'light') return false;
    if (saved === 'dark') return true;
    // For 'auto' mode, check system preference
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Check system theme preference
  useEffect(() => {
    if (themeMode === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setIsDark(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [themeMode]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('themeMode', themeMode);
  }, [isDark, themeMode]);

  // Toggle between light and dark (for quick toggle button)
  const toggleTheme = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

  // Set specific theme mode
  const setTheme = useCallback(async (mode: ThemeMode) => {
    setThemeMode(mode);
    
    if (mode === 'auto') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(systemDark);
    } else {
      setIsDark(mode === 'dark');
    }

    // Sync with backend
    try {
      await authAPI.updateProfile({
        preferences: {
          theme: mode
        } as any
      });
      console.log('[useTheme] Theme preference synced to backend:', mode);
    } catch (error) {
      console.error('[useTheme] Failed to sync theme to backend:', error);
    }
  }, []);

  // Get the effective theme (resolves 'auto' to actual value)
  const effectiveTheme = themeMode === 'auto' ? (isDark ? 'dark' : 'light') : themeMode;

  return {
    isDark,
    themeMode,
    effectiveTheme,
    toggleTheme,
    setTheme,
    isAuto: themeMode === 'auto',
    isLight: themeMode === 'light',
    isDarkMode: themeMode === 'dark'
  };
};
