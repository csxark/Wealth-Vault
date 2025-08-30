import React from 'react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import type { CategoryDetails as CategoryDetailsType } from '../../types';

interface CategoryDetailsProps extends CategoryDetailsType {}

export const CategoryDetails: React.FC<CategoryDetailsProps> = ({ 
  category, 
  amount, 
  percentage, 
  transactions, 
  topExpenses 
}) => {
  const getCategoryIcon = () => {
    switch (category) {
      case 'safe':
        return <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case 'impulsive':
        return <TrendingDown className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
      case 'anxious':
        return <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />;
      default:
        return <TrendingUp className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
    }
  };

  const getCategoryColor = () => {
    switch (category) {
      case 'safe':
        return 'text-green-600 dark:text-green-400';
      case 'impulsive':
        return 'text-orange-600 dark:text-orange-400';
      case 'anxious':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-slate-600 dark:text-slate-400';
    }
  };

  const getCategoryLabel = () => {
    switch (category) {
      case 'safe':
        return 'Safe Spending';
      case 'impulsive':
        return 'Impulsive Spending';
      case 'anxious':
        return 'Anxious Spending';
      default:
        return 'Other Spending';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          {getCategoryIcon()}
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {getCategoryLabel()}
          </h3>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${getCategoryColor()}`}>
            ₹{amount.toLocaleString()}
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {percentage.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
        </div>

        {topExpenses.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Top Expenses
            </h4>
            <div className="space-y-2">
              {topExpenses.map((expense, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                    {expense.description}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    ₹{expense.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};