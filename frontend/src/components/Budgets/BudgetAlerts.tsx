import React, { useState, useEffect } from 'react';
import { Bell, AlertTriangle, CheckCircle, X, Settings, Plus } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';

interface BudgetAlert {
  id: string;
  threshold: number;
  period: string;
  triggeredAt: string | null;
  metadata: any;
  category: {
    id: string;
    name: string;
    color: string;
  };
  vault?: {
    id: string;
    name: string;
  };
}

interface BudgetRule {
  id: string;
  name: string;
  description?: string;
  ruleType: 'percentage' | 'amount' | 'frequency';
  condition: any;
  threshold: number;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  notificationType: 'email' | 'push' | 'in_app';
  isActive: boolean;
  lastTriggered?: string;
  metadata: any;
  createdAt: string;
  category: {
    id: string;
    name: string;
    color: string;
  };
}

export const BudgetAlerts: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [rules, setRules] = useState<BudgetRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    categoryId: '',
    ruleType: 'percentage' as const,
    threshold: 80,
    period: 'monthly' as const,
    notificationType: 'email' as const,
  });

  useEffect(() => {
    loadAlertsAndRules();
  }, []);

  const loadAlertsAndRules = async () => {
    try {
      setLoading(true);
      const [alertsResponse, rulesResponse] = await Promise.all([
        axios.get('/api/budget-alerts'),
        axios.get('/api/budget-alerts/rules')
      ]);

      setAlerts(alertsResponse.data.data);
      setRules(rulesResponse.data.data);
    } catch (error) {
      console.error('Failed to load budget alerts:', error);
      showToast('Failed to load budget alerts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      await axios.post(`/api/budget-alerts/${alertId}/dismiss`);
      setAlerts(prev => prev.filter(alert => alert.id !== alertId));
      showToast('Alert dismissed', 'success');
    } catch (error) {
      console.error('Failed to dismiss alert:', error);
      showToast('Failed to dismiss alert', 'error');
    }
  };

  const createRule = async () => {
    try {
      await axios.post('/api/budget-alerts/rules', newRule);
      setShowCreateRule(false);
      setNewRule({
        name: '',
        description: '',
        categoryId: '',
        ruleType: 'percentage',
        threshold: 80,
        period: 'monthly',
        notificationType: 'email',
      });
      loadAlertsAndRules();
      showToast('Budget rule created', 'success');
    } catch (error) {
      console.error('Failed to create rule:', error);
      showToast('Failed to create budget rule', 'error');
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this budget rule?')) return;

    try {
      await axios.delete(`/api/budget-alerts/rules/${ruleId}`);
      loadAlertsAndRules();
      showToast('Budget rule deleted', 'success');
    } catch (error) {
      console.error('Failed to delete rule:', error);
      showToast('Failed to delete budget rule', 'error');
    }
  };

  const testAlert = async () => {
    // For testing - this would normally be triggered by expense creation
    try {
      await axios.post('/api/budget-alerts/test', {
        categoryId: 'test-category-id',
        amount: 100
      });
      showToast('Test alert triggered', 'success');
      loadAlertsAndRules();
    } catch (error) {
      console.error('Test failed:', error);
      showToast('Test failed', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Bell className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Budget Alerts
          </h2>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowCreateRule(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Create Rule</span>
          </button>
          <button
            onClick={testAlert}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Test Alert
          </button>
        </div>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
            Active Alerts ({alerts.length})
          </h3>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Budget Alert: {alert.category.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {alert.threshold}% threshold reached for {alert.period}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="flex items-center space-x-1 px-3 py-1 text-sm bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                  <span>Dismiss</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget Rules */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <Settings className="h-5 w-5 text-blue-500 mr-2" />
          Budget Rules ({rules.length})
        </h3>

        {rules.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              No budget rules configured yet.
            </p>
            <button
              onClick={() => setShowCreateRule(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Your First Rule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {rule.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {rule.category.name} • {rule.ruleType} • {rule.threshold}
                      {rule.ruleType === 'percentage' ? '%' : ''} • {rule.period} • {rule.notificationType}
                    </p>
                    {rule.lastTriggered && (
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        Last triggered: {new Date(rule.lastTriggered).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="flex items-center space-x-1 px-3 py-1 text-sm bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Rule Modal */}
      {showCreateRule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Create Budget Rule
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  placeholder="e.g., Monthly Budget Alert"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Category ID
                </label>
                <input
                  type="text"
                  value={newRule.categoryId}
                  onChange={(e) => setNewRule(prev => ({ ...prev, categoryId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  placeholder="Category ID"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Rule Type
                  </label>
                  <select
                    value={newRule.ruleType}
                    onChange={(e) => setNewRule(prev => ({ ...prev, ruleType: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="amount">Amount</option>
                    <option value="frequency">Frequency</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Threshold
                  </label>
                  <input
                    type="number"
                    value={newRule.threshold}
                    onChange={(e) => setNewRule(prev => ({ ...prev, threshold: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Period
                  </label>
                  <select
                    value={newRule.period}
                    onChange={(e) => setNewRule(prev => ({ ...prev, period: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notification
                  </label>
                  <select
                    value={newRule.notificationType}
                    onChange={(e) => setNewRule(prev => ({ ...prev, notificationType: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  >
                    <option value="email">Email</option>
                    <option value="push">Push</option>
                    <option value="in_app">In-App</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowCreateRule(false)}
                className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createRule}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};