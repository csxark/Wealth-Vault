import React from 'react';
import { TrendingUp, TrendingDown, IndianRupee, Calendar } from 'lucide-react';
import type { CategoryDetails } from '../../types';

interface CategoryDetailsProps {
  categoryData: CategoryDetails[];
}

export const CategoryDetails: React.FC<CategoryDetailsProps> = ({ categoryData }) => {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'safe': return 'text-green-600 dark:text-green-400';
      case 'impulsive': return 'text-amber-600 dark:text-amber-400';
      case 'anxious': return 'text-red-600 dark:text-red-400';
      default: return 'text-slate-600 dark:text-slate-400';
    }
  };

  const getCategoryBg = (category: string) => {
    switch (category) {
      case 'safe': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'impulsive': return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
      case 'anxious': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default: return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'safe': return TrendingUp;
      case 'impulsive': return TrendingDown;
      case 'anxious': return TrendingDown;
      default: return TrendingUp;
    }
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'safe': return 'Safe Spending';
      case 'impulsive': return 'Impulsive Spending';
      case 'anxious': return 'Anxious Spending';
      default: return 'Unknown';
    }
  };

  const getCategoryDescription = (category: string) => {
    switch (category) {
      case 'safe': return 'Essential expenses and planned purchases';
      case 'impulsive': return 'Spontaneous and entertainment purchases';
      case 'anxious': return 'Emergency and stress-driven expenses';
      default: return '';
    }
  };

  return (
    <div className="space-y-4">
      {categoryData.map((data) => {
        const Icon = getCategoryIcon(data.category);
        
        return (
          <div
            key={data.category}
            className={`border rounded-xl p-6 ${getCategoryBg(data.category)}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Icon className={`h-6 w-6 mr-3 ${getCategoryColor(data.category)}`} />
                <div>
                  <h3 className={`text-lg font-semibold ${getCategoryColor(data.category)}`}>
                    {getCategoryTitle(data.category)}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {getCategoryDescription(data.category)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${getCategoryColor(data.category)}`}>
                  ₹{data.amount.toLocaleString()}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  {data.percentage.toFixed(1)}% of total
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>Transactions: {data.transactions.length}</span>
                <span>Avg: ₹{data.transactions.length > 0 ? (data.amount / data.transactions.length).toFixed(0) : '0'}</span>
              </div>

              {data.topExpenses.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Top Expenses</h4>
                  <div className="space-y-2">
                    {data.topExpenses.slice(0, 3).map((expense, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center">
                          <IndianRupee className="h-3 w-3 mr-1 text-slate-400" />
                          <span className="text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                            {expense.description}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`font-medium ${getCategoryColor(data.category)}`}>
                            ₹{expense.amount.toLocaleString()}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(expense.date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};