import React, { useState, useEffect } from 'react';
import { BarChart, PieChart, Calendar, IndianRupee, TrendingUp, Activity } from 'lucide-react';
import SpendingChart from './SpendingChart';
import { SafeSpendZone } from './SafeSpendZone';
import { CategoryDetails } from './CategoryDetails';
import AddExpenseButton from './AddExpenseButton';
import type { SpendingData, Transaction, CategoryDetails as CategoryDetailsType } from '../../types';

const Dashboard: React.FC = () => {
  const [chartType, setChartType] = useState<'doughnut' | 'bar'>('doughnut');
  const [timeRange, setTimeRange] = useState('month');
  const [spendingData, setSpendingData] = useState<SpendingData>({
    safe: 24500,
    impulsive: 6800,
    anxious: 3200
  });
  // Array format for SpendingChart
  const spendingChartData = [
    { label: 'Safe', value: spendingData.safe },
    { label: 'Impulsive', value: spendingData.impulsive },
    { label: 'Anxious', value: spendingData.anxious }
  ];
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
    <div className="space-y-8 px-2 sm:px-6 md:px-12 lg:px-24 py-8 bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-3xl font-extrabold text-cyan-700 dark:text-cyan-400 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-base">Track your spending patterns and financial wellbeing</p>
        </div>
        <div className="flex flex-col justify-center items-center sm:items-end">
          <AddExpenseButton className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:from-cyan-600 hover:to-blue-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2" onClick={function (): void {
            throw new Error('Function not implemented.');
          } } />
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-cyan-200 dark:border-cyan-700 dark:bg-slate-800 dark:text-white rounded-xl text-base focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
          </select>
          
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-gradient-to-br from-white via-cyan-50 to-blue-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8 flex items-center gap-4 hover:scale-[1.03] transition-transform">
              <div className="bg-cyan-100 dark:bg-cyan-900 p-4 rounded-xl flex items-center justify-center">
                <Icon className={`h-8 w-8 ${stat.color}`} />
              </div>
              <div>
                <p className="text-base font-medium text-cyan-700 dark:text-cyan-400 mb-1">{stat.name}</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8">
          <div className="flex justify-center items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-2 shadow-sm w-fit">
            <button
              onClick={() => setChartType('doughnut')}
              className={`flex items-center justify-center p-2 rounded-lg transition-all min-w-[40px] ${
                chartType === 'doughnut' 
                  ? 'bg-white dark:bg-slate-700 shadow text-cyan-600 dark:text-cyan-400' 
                  : 'text-slate-600 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300'
              }`}
            >
              <PieChart className="h-5 w-5" />
            </button>
            <button
              onClick={() => setChartType('bar')}
              className={`flex items-center justify-center p-2 rounded-lg transition-all min-w-[40px] ${
                chartType === 'bar' 
                  ? 'bg-white dark:bg-slate-700 shadow text-cyan-600 dark:text-cyan-400' 
                  : 'text-slate-600 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300'
              }`}
            >
              <BarChart className="h-5 w-5" />
            </button>
          </div>
          <h3 className="text-xl font-bold text-cyan-700 dark:text-cyan-400 mb-6">Spending Trends</h3>
          <SpendingChart data={spendingChartData} chartType={chartType} />
        </div>
        <SafeSpendZone data={spendingData} monthlyBudget={monthlyBudget} />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8 mt-6">
        <h3 className="text-xl font-bold text-cyan-700 dark:text-cyan-400 mb-6">Category Breakdown</h3>
        {/* <CategoryDetails categoryData={categoryDetails} /> */}
      </div>
    </div>
  );
};

export default Dashboard;