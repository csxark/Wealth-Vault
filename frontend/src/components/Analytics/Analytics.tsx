import React, { useState, useEffect } from 'react';
import { BarChart3, PieChart, Calendar, Filter } from 'lucide-react';
import SpendingAnalytics from '../Dashboard/SpendingAnalytics';
import { LoadingSpinner } from '../Loading/LoadingSpinner';
import type { Expense } from '../../types';
import { expensesAPI } from '../../services/api';

const Analytics: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('6months');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Format amount to Indian Rupee
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Fetch expenses
  useEffect(() => {
    const fetchExpenses = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const res = await expensesAPI.getAll({
          limit: 1000, // Get more data for analytics
          sortBy: 'date',
          sortOrder: 'desc'
        });
        setExpenses(res.data.expenses || []);
      } catch (err) {
        console.error('Failed to fetch expenses:', err);
        setError(err instanceof Error ? err.message : 'Failed to load expenses');
      } finally {
        setIsLoading(false);
      }
    };

    fetchExpenses();
  }, []);

  // Filter expenses based on time range
  const filteredExpenses = React.useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case '1month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case '3months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        break;
      case '6months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        break;
      case '1year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    }

    let filtered = expenses.filter(exp => new Date(exp.date) >= startDate);
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(exp => exp.category === selectedCategory);
    }

    return filtered;
  }, [expenses, timeRange, selectedCategory]);

  // Get unique categories for filter
  const categories = React.useMemo(() => {
    const uniqueCategories = [...new Set(expenses.map(exp => exp.category))];
    return uniqueCategories.filter(Boolean);
  }, [expenses]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-red-200 dark:border-red-900 p-6 text-center">
          <div className="text-red-600 dark:text-red-400 text-xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Failed to Load Analytics
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-cyan-600 text-white px-4 py-3 rounded-lg hover:bg-cyan-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-cyan-700 dark:text-cyan-400 flex items-center gap-3">
                <BarChart3 className="h-8 w-8" />
                Spending Analytics
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                Comprehensive insights into your spending patterns and trends
              </p>
            </div>
            
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="px-3 py-2 border border-cyan-200 dark:border-cyan-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="1month">Last Month</option>
                  <option value="3months">Last 3 Months</option>
                  <option value="6months">Last 6 Months</option>
                  <option value="1year">Last Year</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 border border-cyan-200 dark:border-cyan-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="all">All Categories</option>
                  {categories.map(category => (
                    <option key={category} value={category} className="capitalize">
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Content */}
        {filteredExpenses.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-12 text-center">
            <PieChart className="h-16 w-16 text-slate-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
              No Data Available
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              No expenses found for the selected time range and filters.
            </p>
            <button
              onClick={() => {
                setTimeRange('1year');
                setSelectedCategory('all');
              }}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-xl shadow-lg hover:from-cyan-600 hover:to-blue-700 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <SpendingAnalytics 
            expenses={filteredExpenses} 
            formatAmount={formatAmount}
          />
        )}
      </div>
    </div>
  );
};

export default Analytics;
