import { Vault, Menu, User, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ThemeToggle } from '../Navbar/ThemeToggle';

interface HeaderProps {
  onMenuToggle: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
  const { user, signOut } = useAuth();
  // useTheme is now used inside ThemeToggle, but we might need it for other things if we used to use isDark
  // In this file, isDark was only used for the button. So we don't need it here anymore if we replace the button.

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
            <ThemeToggle />
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
