import React, { useState, useEffect } from 'react';
import { subscriptionTrackerAPI, SubscriptionDashboard as DashboardType } from '../../services/subscriptionTrackerApi';

const SubscriptionDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await subscriptionTrackerAPI.getDashboard();
      if (response.success) {
        setDashboardData(response.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">No subscription data available</p>
      </div>
    );
  }

  const { summary, upcomingRenewals, byCategory, topExpensive } = dashboardData;

  return (
    <div className="p-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white">
          <p className="text-sm opacity-80">Total Subscriptions</p>
          <p className="text-3xl font-bold mt-2">{summary.totalSubscriptions}</p>
        </div>
        
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white">
          <p className="text-sm opacity-80">Monthly Cost</p>
          <p className="text-3xl font-bold mt-2">${summary.totalMonthly.toFixed(2)}</p>
        </div>
        
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white">
          <p className="text-sm opacity-80">Annual Cost</p>
          <p className="text-3xl font-bold mt-2">${summary.totalAnnual.toFixed(2)}</p>
        </div>
        
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-6 text-white">
          <p className="text-sm opacity-80">Avg per Subscription</p>
          <p className="text-3xl font-bold mt-2">${summary.averagePerSubscription.toFixed(2)}</p>
        </div>
      </div>

      {/* Upcoming Renewals */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Upcoming Renewals
        </h3>
        {upcomingRenewals.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No upcoming renewals</p>
        ) : (
          <div className="space-y-3">
            {upcomingRenewals.map((renewal) => (
              <div key={renewal.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{renewal.serviceName}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ${renewal.cost} / {renewal.frequency}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {renewal.daysUntilRenewal} days
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(renewal.renewalDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category Breakdown */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Spending by Category
        </h3>
        {byCategory.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No categories found</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {byCategory.map((category, index) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-gray-900 dark:text-white">{category.categoryName}</p>
                  <span className="text-sm text-gray-500">{category.count}</span>
                </div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  ${category.totalMonthly.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">per month</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Expensive */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Most Expensive
        </h3>
        {topExpensive.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No subscriptions found</p>
        ) : (
          <div className="space-y-3">
            {topExpensive.map((sub: any) => (
              <div key={sub.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{sub.serviceName}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{sub.frequency}</p>
                </div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  ${sub.monthlyAmount?.toFixed(2) || sub.cost}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionDashboard;
