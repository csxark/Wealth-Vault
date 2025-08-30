import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { AuthForm } from './components/Auth/AuthForm';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { ErrorBoundary } from './components/Layout/ErrorBoundary';
import Dashboard from './components/Dashboard/Dashboard';
import { Coach } from './components/Coach/Coach';
import { Goals } from './components/Goals/Goals';
import { DataImport } from './components/Import/DataImport';
import { Profile } from './components/Profile/Profile';
import { TestDB } from './components/TestDB';

function App() {
  const { user, loading } = useAuth();
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 flex items-center justify-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-xl">
          <div className="animate-pulse flex space-x-4">
            <div className="rounded-full bg-slate-200 dark:bg-slate-700 h-12 w-12"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  const renderActiveComponent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'coach':
        return <Coach />;
      case 'goals':
        return <Goals />;
      case 'import':
        return <DataImport />;
      case 'profile':
        return <Profile />;
      case 'testdb':
        return <TestDB />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        
        <div className="flex">
          <Sidebar 
            activeTab={activeTab} 
            onTabChange={(tab) => {
              setActiveTab(tab);
              setSidebarOpen(false);
            }} 
            isOpen={sidebarOpen}
          />
          
          {sidebarOpen && (
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          
          <main className="flex-1 md:ml-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {renderActiveComponent()}
            </div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;