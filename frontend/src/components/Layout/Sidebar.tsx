import React from 'react';
import { BarChart3, MessageCircle, Target, Upload, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOpen: boolean;
}

const navigation = [
  { id: 'dashboard', name: 'Dashboard', icon: BarChart3, path: '/dashboard' },
  { id: 'coach', name: 'AI Coach', icon: MessageCircle, path: '/coach' },
  { id: 'goals', name: 'Goals', icon: Target, path: '/goals' },
  { id: 'import', name: 'Import Data', icon: Upload, path: '/import' },
  { id: 'profile', name: 'Profile', icon: User, path: '/profile' },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, isOpen }) => {
  return (
    <div
      className={`fixed inset-y-0 left-0 z-100 w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700
        pt-16
        transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out
        md:translate-x-0 md:static md:inset-0 shadow-lg dark:shadow-black/50`}
    >
      <nav className="mt-10 px-6">
        <div className="space-y-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <Link
                key={item.id}
                to={item.path}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center px-5 py-3 rounded-xl transition-all duration-300
                  ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500 via-blue-400 to-cyan-500 text-white shadow-lg shadow-cyan-400/50 border border-cyan-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-cyan-600 hover:scale-105'
                  }
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-opacity-75`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  className={`mr-4 h-6 w-6 flex-shrink-0 ${
                    isActive ? 'text-white' : 'text-gray-400 dark:text-slate-400'
                  } transition-colors duration-300`}
                  aria-hidden="true"
                />
                <span className="font-semibold text-lg">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
