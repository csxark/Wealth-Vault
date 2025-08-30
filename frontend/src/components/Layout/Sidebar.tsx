import React from 'react';
import { BarChart3, MessageCircle, Target, Upload, User } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOpen: boolean;
}

const navigation = [
  { id: 'dashboard', name: 'Dashboard', icon: BarChart3 },
  { id: 'coach', name: 'AI Coach', icon: MessageCircle },
  { id: 'goals', name: 'Goals', icon: Target },
  { id: 'import', name: 'Import Data', icon: Upload },
  { id: 'profile', name: 'Profile', icon: User },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, isOpen }) => {
  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:inset-0`}>
      <nav className="mt-8 px-4">
        <div className="space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-900 to-cyan-600 text-white shadow-md'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white hover:shadow-sm'
                }`}
              >
                <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                {item.name}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};