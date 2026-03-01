import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

export const ThemeToggle: React.FC = () => {
    const { theme, setTheme } = useTheme();

    return (
        <div className="relative group">
            <button
                className="p-2.5 rounded-xl text-neutral-600 dark:text-slate-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-slate-700 transition-all flex items-center justify-center"
                aria-label="Toggle theme"
            >
                {theme === 'dark' && <Moon className="h-5 w-5" />}
                {theme === 'light' && <Sun className="h-5 w-5" />}
                {theme === 'system' && <Laptop className="h-5 w-5" />}
            </button>

            {/* Dropdown */}
            <div className="absolute right-0 mt-2 w-36 py-2 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-neutral-200 dark:border-slate-700 transform opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 origin-top-right z-50 invisible group-hover:visible">
                <button
                    onClick={() => setTheme('light')}
                    className={`w-full px-4 py-2 text-sm text-left flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-slate-700/50 transition-colors ${theme === 'light' ? 'text-primary-600 font-medium' : 'text-neutral-600 dark:text-slate-300'
                        }`}
                >
                    <Sun className="h-4 w-4" />
                    Light
                </button>
                <button
                    onClick={() => setTheme('dark')}
                    className={`w-full px-4 py-2 text-sm text-left flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-slate-700/50 transition-colors ${theme === 'dark' ? 'text-primary-600 font-medium' : 'text-neutral-600 dark:text-slate-300'
                        }`}
                >
                    <Moon className="h-4 w-4" />
                    Dark
                </button>
                <button
                    onClick={() => setTheme('system')}
                    className={`w-full px-4 py-2 text-sm text-left flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-slate-700/50 transition-colors ${theme === 'system' ? 'text-primary-600 font-medium' : 'text-neutral-600 dark:text-slate-300'
                        }`}
                >
                    <Laptop className="h-4 w-4" />
                    System
                </button>
            </div>
        </div>
    );
};
