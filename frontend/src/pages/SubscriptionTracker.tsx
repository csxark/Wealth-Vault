import React, { useState, useEffect } from 'react';
import { subscriptionTrackerAPI } from '../services/subscriptionTrackerApi';
import { useTheme } from '../hooks/useTheme';

// Components
import SubscriptionDashboard from '../components/Subscriptions/SubscriptionDashboard';
import SubscriptionAnalyzer from '../components/Subscriptions/SubscriptionAnalyzer';
import SubscriptionDetection from '../components/Subscriptions/SubscriptionDetection';
import SubscriptionRecommendations from '../components/Subscriptions/SubscriptionRecommendations';

type TabType = 'dashboard' | 'analyzer' | 'detection' | 'recommendations';

const SubscriptionTracker: React.FC = () => {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initial data fetch would happen here
    setLoading(false);
  }, []);

  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: '📊' },
    { id: 'analyzer' as TabType, label: 'Analyzer', icon: '📈' },
    { id: 'detection' as TabType, label: 'Detection', icon: '🔍' },
    { id: 'recommendations' as TabType, label: 'Recommendations', icon: '💡' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <SubscriptionDashboard />;
      case 'analyzer':
        return <SubscriptionAnalyzer />;
      case 'detection':
        return <SubscriptionDetection />;
      case 'recommendations':
        return <SubscriptionRecommendations />;
      default:
        return <SubscriptionDashboard />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Subscription Tracker & Analyzer
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Monitor, analyze, and optimize your recurring expenses
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }
                `}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default SubscriptionTracker;
