import { useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  // Backwards compatibility with existing code that expects toggleTheme
  const toggleTheme = () => {
    context.setTheme(context.theme === 'dark' ? 'light' : 'dark');
  };

  return { ...context, toggleTheme };
};
