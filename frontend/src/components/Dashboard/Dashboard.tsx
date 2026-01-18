import '../../chartjs-setup';
import React, { useState, useEffect } from 'react';
import {
  PieChart,
  IndianRupee,
  TrendingUp,
  Activity,
  AlertCircle,
  RefreshCw,
  BarChart3,
  Receipt,
  Grid3x3
} from 'lucide-react';
import { Line, Pie } from 'react-chartjs-2';
import { SafeSpendZone } from './SafeSpendZone';
import { CategoryDetails } from './CategoryDetails';
import { TransactionSearch } from './TransactionSearch';
import AddExpenseButton from './AddExpenseButton';
import { DashboardSkeleton } from './DashboardSkeleton';
import type { SpendingData, Expense, CategoryDetails as CategoryDetailsType } from '../../types';
import { expensesAPI } from '../../services/api';
// @ts-ignore - CurrencyConverter is a .jsx file without type declarations
import CurrencyConverter from '../CurrencyConverter';

interface DashboardProps {
  paymentMade?: boolean;
}
export interface SpendingChartProps {
  data: { label: string; value: number }[];
  chartType: 'doughnut' | 'bar';
}

type TabType = 'overview' | 'transactions' | 'analytics' | 'categories';

const Dashboard: React.FC<DashboardProps> = ({ paymentMade }) => {
  // Theme state for dark/light
  const [theme] = useState<'light' | 'dark'>(
    localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  );
  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'dark' : '';
    localStorage.setItem('theme', theme);
  }, [theme]);

  // State hooks
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [timeRange, setTimeRange] = useState('month');
  const [convertedCurrency, setConvertedCurrency] = useState<string | null>(null);
  const [conversionRate, setConversionRate] = useState<number>(1);
  const [spendingData, setSpendingData] = useState<SpendingData>({
    safe: 24500,
    impulsive: 6800,
    anxious: 3200
  });
  const [categoryDetails, setCategoryDetails] = useState<CategoryDetailsType[]>([]);
  const [monthlyBudget] = useState(40000);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);

  // Format amount to Indian Rupee or converted currency
  const formatAmount = (amount: number): string => {
    const convertedAmount = convertedCurrency ? amount * conversionRate : amount;
    const currency = convertedCurrency || 'INR';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(convertedAmount);
  };

  // Function to filter expenses by time range
  const getFilteredExpensesByTimeRange = (allExpenses: Expense[]) => {
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return allExpenses.filter(t => new Date(t.date) >= startDate);
  };

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch expenses from backend and update dashboard state
  useEffect(() => {
    const fetchExpenses = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await expensesAPI.getAll();
        const allExpenses: Expense[] = res.data.expenses || [];
        setExpenses(allExpenses);
        const filteredTransactions = getFilteredExpensesByTimeRange(allExpenses);
        const newSpendingData: SpendingData = { safe: 0, impulsive: 0, anxious: 0 };
        filteredTransactions.forEach(transaction => {
          const cat = transaction.category.toLowerCase();
          if (["safe", "impulsive", "anxious"].includes(cat)) {
            newSpendingData[cat] += Math.abs(transaction.amount);
          }
        });
        setSpendingData(newSpendingData);
        const details: CategoryDetailsType[] = ["safe", "impulsive", "anxious"].map(category => {
          const categoryTransactions = filteredTransactions.filter(t => t.category.toLowerCase() === category);
          const totalAmount = categoryTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
          const totalSpent = newSpendingData.safe + newSpendingData.impulsive + newSpendingData.anxious;
          return {
            category: category as 'safe' | 'impulsive' | 'anxious',
            amount: totalAmount,
            percentage: totalSpent > 0 ? (totalAmount / totalSpent) * 100 : 0,
            expenses: categoryTransactions,
            topExpenses: categoryTransactions
              .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
              .slice(0, 5)
              .map(t => ({ description: t.description, amount: Math.abs(t.amount), date: t.date }))
          };
        });
        setCategoryDetails(details);
      } catch (err) {
        console.error('Failed to fetch expenses:', err);
        setError(err instanceof Error ? err.message : 'Failed to load expenses. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchExpenses();
  }, [paymentMade, timeRange]);

  // Initialize filtered expenses when expenses change
  useEffect(() => {
    setFilteredExpenses(expenses);
  }, [expenses]);

  // --- Analytics ---
  // 1. Spending trend (by day for current month)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyTotals = Array(daysInMonth).fill(0);
  expenses.forEach(exp => {
    const d = new Date(exp.date);
    if (d >= monthStart && d.getMonth() === now.getMonth()) {
      dailyTotals[d.getDate() - 1] += Math.abs(exp.amount);
    }
  });
  const trendData = {
    labels: Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString()),
    datasets: [
      {
        label: 'Daily Spend',
        data: dailyTotals,
        fill: true,
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      },
    ],
  };

  // 2. Top 5 expenses overall
  const top5Expenses = [...expenses]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5);

  // 3. Average daily spend (current month)
  const totalThisMonth = dailyTotals.reduce((a, b) => a + b, 0);
  const avgDailySpend = daysInMonth ? totalThisMonth / daysInMonth : 0;

  // 4. Highest single expense
  const highestExpense = top5Expenses.length > 0 ? Math.abs(top5Expenses[0].amount) : 0;

  // 5. Simple savings rate (budget - spent) / budget
  const savingsRate = monthlyBudget > 0 ? ((monthlyBudget - totalThisMonth) / monthlyBudget) * 100 : 0;

  // 6. Payment method breakdown
  const paymentMethodMap: { [key: string]: number } = {};
  expenses.forEach(exp => {
    if (!paymentMethodMap[exp.paymentMethod]) paymentMethodMap[exp.paymentMethod] = 0;
    paymentMethodMap[exp.paymentMethod] += Math.abs(exp.amount);
  });
  const paymentMethodData = {
    labels: Object.keys(paymentMethodMap),
    datasets: [
      {
        label: 'By Payment Method',
        data: Object.values(paymentMethodMap),
        backgroundColor: ['#06b6d4', '#818cf8', '#f59e42', '#f43f5e', '#10b981', '#fbbf24'],
        borderWidth: 0,
      },
    ],
  };

  // 7. Recent transactions - use filtered expenses
  const recentTransactions = [...filteredExpenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20); // Show up to 20 transactions

  // Card stats array
  const stats = [
    {
      name: 'Total Spent',
      value: formatAmount(spendingData.safe + spendingData.impulsive + spendingData.anxious),
      icon: IndianRupee,
      color: 'text-slate-600 dark:text-slate-400',
      bgGradient: 'from-slate-500 to-slate-600'
    },
    {
      name: 'Safe Spending',
      value: formatAmount(spendingData.safe),
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bgGradient: 'from-green-500 to-emerald-600'
    },
    {
      name: 'Budget Remaining',
      value: formatAmount(Math.max(0, monthlyBudget - (spendingData.safe + spendingData.impulsive + spendingData.anxious))),
      icon: Activity,
      color: 'text-cyan-600 dark:text-cyan-400',
      bgGradient: 'from-cyan-500 to-blue-600'
    }
  ];

  // Handle new expense (responsive update)
  const handleExpenseAdd = (expense: {
    amount: number;
    category: string;
    description?: string;
    merchantName?: string;
    upiId?: string;
  }) => {
    const transaction: Expense = {
      _id: Math.random().toString(36).substr(2, 9),
      user: 'local',
      amount: -expense.amount,
      currency: 'INR',
      description: expense.description || (expense.merchantName ? `Paid to ${expense.merchantName}` : ''),
      category: expense.category.toLowerCase() as 'safe' | 'impulsive' | 'anxious',
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: 'other',
      isRecurring: false,
      status: 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const savedTransactions = localStorage.getItem('transactions');
    const transactions: Expense[] = savedTransactions ? JSON.parse(savedTransactions) : [];
    transactions.push(transaction);
    localStorage.setItem('transactions', JSON.stringify(transactions));
    setExpenses([...transactions]);
    setSpendingData(prev => ({
      ...prev,
      [transaction.category]: prev[transaction.category] + Math.abs(transaction.amount)
    }));
    setCategoryDetails(prev =>
      prev.map(cat => {
        if (cat.category === transaction.category) {
          const newExpenses = [...cat.expenses, transaction];
          return {
            ...cat,
            amount: cat.amount + Math.abs(transaction.amount),
            expenses: newExpenses,
            topExpenses: newExpenses
              .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
              .slice(0, 5)
              .map(t => ({
                description: t.description,
                amount: Math.abs(t.amount),
                date: t.date
              }))
          };
        }
        return cat;
      })
    );
  };

  // Handle currency conversion
  const handleCurrencyConversion = (data: { from: string; to: string; rate: number }) => {
    if (data.from === 'INR' && data.to !== 'INR') {
      setConvertedCurrency(data.to);
      setConversionRate(data.rate);
    } else if (data.from !== 'INR') {
      // If converting from non-INR, first convert to INR rate, then apply
      setConvertedCurrency(data.to);
      setConversionRate(data.rate);
    } else {
      // Reset to INR
      setConvertedCurrency(null);
      setConversionRate(1);
    }
  };

  // Retry handler for failed data fetch
  const handleRetry = () => {
    window.location.reload();
  };

  // Tab configuration
  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: Grid3x3 },
    { id: 'transactions' as TabType, label: 'Transactions', icon: Receipt },
    { id: 'analytics' as TabType, label: 'Analytics', icon: BarChart3 },
    { id: 'categories' as TabType, label: 'Categories', icon: PieChart },
  ];

  // Show loading state
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-red-200 dark:border-red-900 p-6 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>

          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Failed to Load Dashboard
          </h2>

          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {error}
          </p>

          <button
            onClick={handleRetry}
            className="w-full bg-cyan-600 text-white px-4 py-3 rounded-lg hover:bg-cyan-700 transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors">
      <div className="px-4 sm:px-6 lg:px-12 xl:px-24 py-6 sm:py-8">

        {/* Header Section */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-slate-800/50 p-6 sm:p-8 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent mb-2">
                Financial Dashboard
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base">
                Track your spending patterns and financial wellbeing
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <CurrencyConverter onRateChange={handleCurrencyConversion} />

              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="px-4 py-2.5 border border-cyan-200 dark:border-cyan-700 bg-white dark:bg-slate-800 dark:text-white rounded-xl text-sm font-medium focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm transition-all"
              >
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </select>

              <AddExpenseButton
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl hover:from-cyan-600 hover:to-blue-700 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
                onExpenseAdd={handleExpenseAdd}
              />
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mt-8 border-b border-slate-200 dark:border-slate-700">
            <div className="flex gap-1 overflow-x-auto scrollbar-modern">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-2 px-6 py-3 font-medium text-sm rounded-t-xl transition-all duration-300 whitespace-nowrap ${isActive
                      ? 'text-cyan-600 dark:text-cyan-400 bg-gradient-to-b from-cyan-50 to-transparent dark:from-cyan-900/30 dark:to-transparent'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Empty State */}
        {expenses.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-xl border border-cyan-100 dark:border-cyan-900 p-12 text-center max-w-md">
              <div className="text-6xl mb-4">💸</div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">No expenses yet</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Start tracking your spending to get personalized insights and reach your financial goals
              </p>
              <AddExpenseButton
                label="Add your first expense"
                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:from-cyan-600 hover:to-blue-700 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
                onExpenseAdd={handleExpenseAdd}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Tab Content */}
            <div className="space-y-6">

              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Hero Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {stats.map((stat, index) => {
                      const Icon = stat.icon;
                      return (
                        <div
                          key={index}
                          className="group bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-lg hover:shadow-2xl border border-white/20 dark:border-slate-800/50 p-6 sm:p-8 transition-all duration-300 hover:scale-[1.02]"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.bgGradient} shadow-lg`}>
                              <Icon className="h-6 w-6 text-white" />
                            </div>
                          </div>
                          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                            {stat.name}
                          </p>
                          <p className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
                            {stat.value}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Safe Spend Zone & Trend */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <SafeSpendZone
                      monthlyBudget={monthlyBudget}
                      totalSpent={spendingData.safe + spendingData.impulsive + spendingData.anxious}
                      safeSpending={spendingData.safe}
                      formatAmount={formatAmount}
                    />

                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6 sm:p-8">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
                        Spending Trend
                      </h3>
                      <div className="h-64">
                        <Line
                          data={trendData}
                          options={{
                            maintainAspectRatio: false,
                            plugins: {
                              legend: { display: false },
                              tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                padding: 12,
                                titleFont: { size: 14, weight: 700 },
                                bodyFont: { size: 13 },
                              }
                            },
                            scales: {
                              x: {
                                grid: { display: false },
                                ticks: { color: '#94a3b8' }
                              },
                              y: {
                                grid: { color: 'rgba(148, 163, 184, 0.1)' },
                                ticks: { color: '#94a3b8' }
                              }
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/5 dark:to-blue-500/5 backdrop-blur-xl rounded-xl p-5 border border-cyan-200/50 dark:border-cyan-800/50">
                      <div className="text-xs font-medium text-cyan-700 dark:text-cyan-400 mb-1">Avg Daily Spend</div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        {formatAmount(avgDailySpend)}
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-rose-500/10 to-red-500/10 dark:from-rose-500/5 dark:to-red-500/5 backdrop-blur-xl rounded-xl p-5 border border-rose-200/50 dark:border-rose-800/50">
                      <div className="text-xs font-medium text-rose-700 dark:text-rose-400 mb-1">Highest Expense</div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        {formatAmount(highestExpense)}
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 dark:from-green-500/5 dark:to-emerald-500/5 backdrop-blur-xl rounded-xl p-5 border border-green-200/50 dark:border-green-800/50">
                      <div className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Savings Rate</div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        {savingsRate.toFixed(1)}%
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 dark:from-violet-500/5 dark:to-purple-500/5 backdrop-blur-xl rounded-xl p-5 border border-violet-200/50 dark:border-violet-800/50">
                      <div className="text-xs font-medium text-violet-700 dark:text-violet-400 mb-1">Payment Methods</div>
                      <div className="text-xl font-bold text-slate-900 dark:text-white">
                        {Object.keys(paymentMethodMap).length}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Transactions Tab */}
              {activeTab === 'transactions' && (
                <div className="space-y-6 animate-fadeIn">
                  <TransactionSearch
                    expenses={expenses}
                    onFilteredResults={setFilteredExpenses}
                  />

                  <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6 sm:p-8">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                        Recent Transactions
                      </h3>
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {filteredExpenses.length === expenses.length
                          ? `${recentTransactions.length} of ${expenses.length}`
                          : `${recentTransactions.length} of ${filteredExpenses.length} filtered`}
                      </span>
                    </div>
                    <div className="overflow-x-auto scrollbar-modern">
                      {recentTransactions.length > 0 ? (
                        <table className="min-w-full">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Date</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Description</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Method</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {recentTransactions.map(tx => (
                              <tr key={tx._id} className="hover:bg-cyan-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400">
                                  {new Date(tx.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="px-4 py-4 text-sm font-medium text-slate-900 dark:text-white">
                                  {tx.description}
                                </td>
                                <td className="px-4 py-4 text-sm text-right font-semibold text-slate-900 dark:text-white">
                                  {formatAmount(Math.abs(tx.amount))}
                                </td>
                                <td className="px-4 py-4 text-sm">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                                    {tx.paymentMethod}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-center py-12">
                          <Receipt className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                          <p className="text-lg font-medium text-slate-600 dark:text-slate-400 mb-1">No transactions found</p>
                          <p className="text-sm text-slate-500 dark:text-slate-500">Try adjusting your filters</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Analytics Tab */}
              {activeTab === 'analytics' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Spending Trend Chart */}
                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6 sm:p-8 lg:col-span-2">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
                        Monthly Spending Trend
                      </h3>
                      <div className="h-80">
                        <Line
                          data={trendData}
                          options={{
                            maintainAspectRatio: false,
                            plugins: {
                              legend: { display: false },
                              tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                padding: 12,
                                titleFont: { size: 14, weight: 700 },
                                bodyFont: { size: 13 },
                              }
                            },
                            scales: {
                              x: {
                                title: { display: true, text: 'Day of Month', color: '#64748b', font: { size: 12, weight: 'bold' } },
                                grid: { display: false },
                                ticks: { color: '#94a3b8' }
                              },
                              y: {
                                title: { display: true, text: 'Amount (₹)', color: '#64748b', font: { size: 12, weight: 'bold' } },
                                grid: { color: 'rgba(148, 163, 184, 0.1)' },
                                ticks: { color: '#94a3b8' }
                              }
                            }
                          }}
                        />
                      </div>
                    </div>

                    {/* Payment Methods */}
                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6 sm:p-8">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
                        Payment Methods
                      </h3>
                      <div className="h-64 flex items-center justify-center">
                        <Pie
                          data={paymentMethodData}
                          options={{
                            maintainAspectRatio: false,
                            plugins: {
                              legend: {
                                position: 'bottom',
                                labels: {
                                  boxWidth: 12,
                                  padding: 15,
                                  font: { size: 11 },
                                  color: '#64748b'
                                }
                              }
                            }
                          }}
                        />
                      </div>
                    </div>

                    {/* Top 5 Expenses */}
                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6 sm:p-8">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
                        Top 5 Expenses
                      </h3>
                      <ul className="space-y-4">
                        {top5Expenses.map((exp, idx) => (
                          <li key={exp._id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-sm font-bold">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {formatAmount(Math.abs(exp.amount))}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                                {exp.description}
                              </p>
                              <p className="text-xs text-cyan-600 dark:text-cyan-400">
                                {new Date(exp.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Categories Tab */}
              {activeTab === 'categories' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6 sm:p-8">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
                      Spending by Category
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {categoryDetails.map((cat) => (
                        <CategoryDetails
                          key={cat.category}
                          {...cat}
                          formatAmount={formatAmount}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
