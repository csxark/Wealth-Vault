import React from 'react';
import { Shield, TrendingUp, AlertTriangle } from 'lucide-react';

interface SafeSpendZoneProps {
  monthlyBudget: number;
  totalSpent: number;
  safeSpending: number;
}

export const SafeSpendZone: React.FC<SafeSpendZoneProps> = ({ monthlyBudget, totalSpent, safeSpending }) => {
  const safeSpendPercentage = monthlyBudget > 0 ? (safeSpending / monthlyBudget) * 100 : 0;
  const totalSpentPercentage = monthlyBudget > 0 ? (totalSpent / monthlyBudget) * 100 : 0;
  const remainingBudget = Math.max(0, monthlyBudget - totalSpent);

  const getSpendingStatus = () => {
    if (totalSpentPercentage <= 70) return { status: 'safe', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' };
    if (totalSpentPercentage <= 90) return { status: 'caution', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
    return { status: 'danger', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };
  };

  const spendingStatus = getSpendingStatus();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center">
          <Shield className="h-5 w-5 mr-2 text-cyan-600 dark:text-cyan-400" />
          Safe Spend Zone
        </h3>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${spendingStatus.bg} ${spendingStatus.color} ${spendingStatus.border} border`}>
          {spendingStatus.status.toUpperCase()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">₹{safeSpending.toLocaleString()}</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Safe Spending</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">₹{remainingBudget.toLocaleString()}</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Remaining Budget</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{safeSpendPercentage.toFixed(1)}%</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Essential Ratio</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-400">Budget Progress</span>
          <span className="font-medium text-slate-900 dark:text-white">₹{totalSpent.toLocaleString()} / ₹{monthlyBudget.toLocaleString()}</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              totalSpentPercentage <= 70 ? 'bg-green-500' :
              totalSpentPercentage <= 90 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(totalSpentPercentage, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-start space-x-2 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
        {spendingStatus.status === 'safe' ? (
          <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
        )}
        <div className="text-sm">
          <p className="font-medium text-slate-900 dark:text-white">
            {spendingStatus.status === 'safe' 
              ? 'Great job! You\'re in your safe spending zone.'
              : spendingStatus.status === 'caution'
              ? 'Approaching your budget limit. Consider mindful spending.'
              : 'Budget exceeded. Time to pause and reassess your spending.'}
          </p>
        </div>
      </div>
    </div>
  );
};