import React, { useState, useEffect } from 'react';
import { BarChart, PieChart, Calendar, IndianRupee, TrendingUp, Activity } from 'lucide-react';
import SpendingChart from './SpendingChart';

import { SafeSpendZone } from './SafeSpendZone';
import { CategoryDetails } from './CategoryDetails';
import type { SpendingData, Transaction, CategoryDetails as CategoryDetailsType } from '../../types';

export const Dashboard: React.FC = () => {
  const [chartType, setChartType] = useState<'doughnut' | 'bar'>('doughnut');
  const [timeRange, setTimeRange] = useState('month');
  const [spendingData, setSpendingData] = useState<SpendingData>({
    safe: 24500,
    impulsive: 6800,
    anxious: 3200
  });
  const [categoryDetails, setCategoryDetails] = useState<CategoryDetailsType[]>([]);
  const [monthlyBudget] = useState(40000);

  useEffect(() => {
    // Load transactions from localStorage
    const savedTransactions = localStorage.getItem('transactions');
    if (savedTransactions) {
      const transactions: Transaction[] = JSON.parse(savedTransactions);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const monthlyTransactions = transactions.filter(t => 
        new Date(t.date) >= monthStart
      );

      const newSpendingData: SpendingData = {
        safe: 0,
        impulsive: 0,
        anxious: 0
      };

      monthlyTransactions.forEach(transaction => {
        if (transaction.amount > 0) return; // Only count expenses
        const amount = Math.abs(transaction.amount);
        newSpendingData[transaction.category] += amount;
      });

      setSpendingData(newSpendingData);
      
      // Generate category details
      const details: CategoryDetailsType[] = ['safe', 'impulsive', 'anxious'].map(category => {
        const categoryTransactions = monthlyTransactions.filter(t => 
          t.category === category && t.amount < 0
        );
        const totalAmount = categoryTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const totalSpent = newSpendingData.safe + newSpendingData.impulsive + newSpendingData.anxious;
        
        return {
          category: category as 'safe' | 'impulsive' | 'anxious',
          amount: totalAmount,
          percentage: totalSpent > 0 ? (totalAmount / totalSpent) * 100 : 0,
          transactions: categoryTransactions,
          topExpenses: categoryTransactions
            .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
            .slice(0, 5)
            .map(t => ({
              description: t.description,
              amount: Math.abs(t.amount),
              date: t.date
            }))
        };
      });
      
      setCategoryDetails(details);
    }
  }, []);

  const stats = [
    {
      name: 'Total Spent',
      value: `₹${(spendingData.safe + spendingData.impulsive + spendingData.anxious).toLocaleString()}`,
      icon: IndianRupee,
      color: 'text-slate-600 dark:text-slate-400'
    },
    {
      name: 'Safe Spending',
      value: `₹${spendingData.safe.toLocaleString()}`,
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400'
    },
    {
      name: 'Budget Remaining',
      value: `₹${Math.max(0, monthlyBudget - (spendingData.safe + spendingData.impulsive + spendingData.anxious)).toLocaleString()}`,
      icon: Activity,
      color: 'text-cyan-600 dark:text-cyan-400'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-1">Track your spending patterns and financial wellbeing</p>
        </div>
        
        <div className="flex items-center space-x-2 mt-4 sm:mt-0">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
          </select>
          
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            <button
              onClick={() => setChartType('doughnut')}
              className={`p-2 rounded-md transition-all ${
                chartType === 'doughnut' 
                  ? 'bg-white dark:bg-slate-600 shadow-sm text-cyan-600 dark:text-cyan-400' 
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <PieChart className="h-4 w-4" />
            </button>
            <button
              onClick={() => setChartType('bar')}
              className={`p-2 rounded-md transition-all ${
                chartType === 'bar' 
                  ? 'bg-white dark:bg-slate-600 shadow-sm text-cyan-600 dark:text-cyan-400' 
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center">
                <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-lg">
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">{stat.name}</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Spending Trends</h3>
          <SpendingChart
            data={[
              { label: 'Safe', value: spendingData.safe },
              { label: 'Impulsive', value: spendingData.impulsive },
              { label: 'Anxious', value: spendingData.anxious }
            ]}
            chartType={chartType}
          />
        </div>

        <SafeSpendZone data={spendingData} monthlyBudget={monthlyBudget} />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Category Breakdown</h3>
        <CategoryDetails categoryData={categoryDetails} />
      </div>
    </div>
  );
};