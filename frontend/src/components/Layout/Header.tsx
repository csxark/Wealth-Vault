import React, { useState, useRef, useEffect } from 'react';
import { Vault, Menu, User, LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTheme, ThemeMode } from '../../hooks/useTheme';

interface HeaderProps {
  onMenuToggle: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
  const { user, signOut } = useAuth();
  const { isDark, toggleTheme, themeMode, setTheme, isAuto, isLight, isDarkMode } = useTheme();
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  const handleThemeChange = async (mode: ThemeMode) => {
    await setTheme(mode);
    setShowThemeMenu(false);
  };

  // Close theme menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setShowThemeMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getThemeIcon = () => {
    if (themeMode === 'auto') return <Monitor className="h-5 w-5" />;
    return isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />;
  };

  const getThemeLabel = () => {
    switch (themeMode) {
      case 'auto': return 'Auto';
      case 'light': return 'Light';
      case 'dark': return 'Dark';
      default: return 'Auto';
    }
  };

  return (
    <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl shadow-sm border-b border-neutral-200/60 dark:border-slate-700/60 absolute top-0 z-40 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-4">
            <button
              onClick={onMenuToggle}
              className="p-2.5 rounded-xl text-neutral-600 dark:text-slate-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-slate-700 transition-all md:hidden"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="bg-neutral-900 dark:bg-white p-2 rounded-xl transition-transform hover:scale-105">
                <Vault className="h-5 w-5 text-white dark:text-neutral-900" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
                Wealth Vault
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Toggle Dropdown */}
            <div className="relative" ref={themeMenuRef}>
              <button
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="p-2.5 rounded-xl text-neutral-600 dark:text-slate-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-slate-700 transition-all flex items-center gap-2"
                title={`Current theme: ${getThemeLabel()}`}
                aria-label={`Current theme: ${getThemeLabel()}. Click to change.`}
              >
                {getThemeIcon()}
              </button>

              {/* Theme Dropdown Menu */}
              {showThemeMenu && (
                <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-neutral-200 dark:border-slate-700 py-1 z-50">
                  <button
                    onClick={() => handleThemeChange('auto')}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm hover:bg-neutral-100 dark:hover:bg-slate-700 transition-colors ${
                      isAuto ? 'text-primary-500 font-medium' : 'text-neutral-700 dark:text-slate-300'
                    }`}
                  >
                    <Monitor className="h-4 w-4" />
                    Auto
                    {isAuto && <span className="ml-auto text-primary-500">✓</span>}
                  </button>
                  <button
                    onClick={() => handleThemeChange('light')}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm hover:bg-neutral-100 dark:hover:bg-slate-700 transition-colors ${
                      isLight ? 'text-primary-500 font-medium' : 'text-neutral-700 dark:text-slate-300'
                    }`}
                  >
                    <Moon className="h-4 w-4" />
                    Light
                    {isLight && <span className="ml-auto text-primary-500">✓</span>}
                  </button>
                  <button
                    onClick={() => handleThemeChange('dark')}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm hover:bg-neutral-100 dark:hover:bg-slate-700 transition-colors ${
                      isDarkMode ? 'text-primary-500 font-medium' : 'text-neutral-700 dark:text-slate-300'
                    }`}
                  >
                    <Sun className="h-4 w-4" />
                    Dark
                    {isDarkMode && <span className="ml-auto text-primary-500">✓</span>}
                  </button>
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-100 dark:bg-slate-700 text-sm text-neutral-700 dark:text-slate-300">
              <User className="h-4 w-4" />
              <span className="max-w-[150px] truncate font-medium">{user?.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2.5 rounded-xl text-neutral-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
