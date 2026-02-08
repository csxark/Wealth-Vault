import React, { createContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    isDark: boolean;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme');
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
            return saved;
        }
        return 'system';
    });

    const [isDark, setIsDark] = useState<boolean>(() => {
        if (theme === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return theme === 'dark';
    });

    useEffect(() => {
        const root = document.documentElement;
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const applyTheme = () => {
            let activeDarkMode = false;

            if (theme === 'system') {
                activeDarkMode = mediaQuery.matches;
            } else {
                activeDarkMode = theme === 'dark';
            }

            setIsDark(activeDarkMode);

            if (activeDarkMode) {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
        };

        applyTheme();

        const handleChange = () => {
            if (theme === 'system') {
                applyTheme();
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        localStorage.setItem('theme', theme);

        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
            {children}
        </ThemeContext.Provider>
    );
};
