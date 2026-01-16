import '../../chartjs-setup';
import React, { useState, useEffect } from 'react';
import {
  PieChart,
  IndianRupee,
  TrendingUp,
  Activity,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Line, Pie } from 'react-chartjs-2';
import { SafeSpendZone } from './SafeSpendZone';
import { CategoryDetails } from './CategoryDetails';
import { TransactionSearch } from './TransactionSearch';
import AddExpenseButton from './AddExpenseButton';
import { LoadingSpinner } from '../Loading/LoadingSpinner';
import { DashboardSkeleton } from './DashboardSkeleton';
import type { SpendingData, Expense, CategoryDetails as CategoryDetailsType } from '../../types';
import { expensesAPI } from '../../services/api';
import CurrencyConverter from '../CurrencyConverter.jsx';

interface DashboardProps {
  paymentMade?: boolean;
}
export interface SpendingChartProps {
  data: { label: string; value: number }[];
  chartType: 'doughnut' | 'bar';
}

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
  const [timeRange, setTimeRange] = useState('month');
  const [spendingData, setSpendingData] = useState<SpendingData>({
    safe: 24500,
    impulsive: 6800,
    anxious: 3200
  });
  const [categoryDetails, setCategoryDetails] = useState<CategoryDetailsType[]>([]);
  const [monthlyBudget] = useState(40000);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  
  // Format amount to Indian Rupee
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
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
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthlyTransactions = allExpenses.filter(t => new Date(t.date) >= monthStart);
        const newSpendingData: SpendingData = { safe: 0, impulsive: 0, anxious: 0 };
        monthlyTransactions.forEach(transaction => {
          const cat = transaction.category.toLowerCase();
          if (["safe", "impulsive", "anxious"].includes(cat)) {
            newSpendingData[cat] += Math.abs(transaction.amount);
          }
        });
        setSpendingData(newSpendingData);
        const details: CategoryDetailsType[] = ["safe", "impulsive", "anxious"].map(category => {
          const categoryTransactions = monthlyTransactions.filter(t => t.category.toLowerCase() === category);
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
  }, [paymentMade]);

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
        fill: false,
        borderColor: '#06b6d4',
        backgroundColor: '#06b6d4',
        tension: 0.3,
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
      color: 'text-slate-600 dark:text-slate-400'
    },
    {
      name: 'Safe Spending',
      value: formatAmount(spendingData.safe),
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400'
    },
    {
      name: 'Budget Remaining',
      value: formatAmount(Math.max(0, monthlyBudget - (spendingData.safe + spendingData.impulsive + spendingData.anxious))),
      icon: Activity,
      color: 'text-cyan-600 dark:text-cyan-400'
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

  // Retry handler for failed data fetch
  const handleRetry = () => {
    window.location.reload();
  };

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
    <div className="space-y-8 px-2 sm:px-6 md:px-12 lg:px-24 py-8
      bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 min-h-screen transition-colors mt-8">
      {/* Responsive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6
        bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="dashboard-heading text-cyan-700 dark:text-cyan-400 tracking-tight">
            Dashboard
          </h1>
          <p className="dashboard-label mt-2">
            Track your spending patterns and financial wellbeing
          </p>
        </div>
        <div className="flex flex-row items-center justify-end gap-6">
          <AddExpenseButton
            className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-xl shadow-lg hover:from-cyan-600 hover:to-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
            onExpenseAdd={handleExpenseAdd}
          />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-cyan-200 dark:border-cyan-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm font-medium focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm ml-2"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
          </select>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6
  bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 border">

  <div>
    <h1 className="dashboard-heading text-cyan-700 dark:text-cyan-400">
      Dashboard
    </h1>
    <p className="dashboard-label mt-2">
      Track your spending patterns and financial wellbeing
    </p>
  </div>

  <CurrencyConverter
    onRateChange={(data) => setCurrency(data)}
  />
</div>

      </div>

      {/* Empty State - Show when no expenses */}
      {expenses.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-12 text-center max-w-md">
            <div className="text-6xl mb-4">💸</div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">No expenses yet</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Start tracking your spending to get personalized insights and reach your financial goals
            </p>
            <AddExpenseButton
              label="Add your first expense"
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:from-cyan-600 hover:to-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
              onExpenseAdd={handleExpenseAdd}
            />
          </div>
        </div>
      ) : (
        <>
      {/* Responsive Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index}
              className="bg-gradient-to-br from-white via-cyan-50 to-blue-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8 flex items-center gap-4 hover:scale-[1.03] transition-transform">
              <div className="bg-cyan-100 dark:bg-cyan-900 p-4 rounded-xl flex items-center justify-center">
                <Icon className={`h-8 w-8 ${stat.color}`} />
              </div>
              <div className="flex-1">
                <p className="dashboard-label text-cyan-700 dark:text-cyan-400 mb-1 font-medium">
                  {stat.name}
                </p>
                <p className="dashboard-value text-2xl md:text-3xl text-slate-900 dark:text-white">
                  {stat.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {/* Analytical Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8">
          <h3 className="dashboard-subheading text-cyan-700 dark:text-cyan-400 mb-6">
            Spending Trend (This Month)
          </h3>
          <Line data={trendData} options={{ plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'Day' } }, y: { title: { display: true, text: 'Amount (₹)' } } } }} />
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-cyan-50 dark:bg-cyan-900/30 rounded-xl p-4">
              <div className="dashboard-label">Avg Daily Spend</div>
              <div className="dashboard-value text-lg text-cyan-700 dark:text-cyan-400">
                {formatAmount(avgDailySpend)}
              </div>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-900/30 rounded-xl p-4">
              <div className="dashboard-label">Highest Expense</div>
              <div className="dashboard-value text-lg text-rose-600 dark:text-rose-400">
                {formatAmount(highestExpense)}
              </div>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-900/30 rounded-xl p-4">
              <div className="dashboard-label">Savings Rate</div>
              <div className="dashboard-value text-lg text-green-600 dark:text-green-400">
                {savingsRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-900/30 rounded-xl p-4">
              <div className="dashboard-label">Payment Methods</div>
              <div className="h-32 flex items-center">
                <PieChart className="h-6 w-6 inline-block mr-2 text-cyan-600" />
                <Pie data={paymentMethodData} options={{ plugins: { legend: { display: true } } }} />
              </div>
            </div>
          </div>
        </div>
       <SafeSpendZone
          monthlyBudget={monthlyBudget}
          totalSpent={spendingData.safe + spendingData.impulsive + spendingData.anxious}
          safeSpending={spendingData.safe}
          formatAmount={formatAmount} // pass function
        />
      </div>

      {/* Top 5 Expenses & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8">
          <h3 className="dashboard-subheading text-cyan-700 dark:text-cyan-400 mb-6">
            Top 5 Expenses
          </h3>
          <ul className="divide-y divide-cyan-100 dark:divide-cyan-900">
            {top5Expenses.map((exp) => (
              <li key={exp._id} className="py-3 flex flex-col">
                <span className="dashboard-value text-slate-900 dark:text-white">
                  {formatAmount(Math.abs(exp.amount))}
                </span>
                <span className="dashboard-label mt-1">
                  {exp.description}
                </span>
                <span className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">
                  {new Date(exp.date).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-6">
          {/* Transaction Search Component */}
          <TransactionSearch 
            expenses={expenses}
            onFilteredResults={setFilteredExpenses}
          />
          
          {/* Recent Transactions Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="dashboard-subheading text-cyan-700 dark:text-cyan-400">
              Recent Transactions
            </h3>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {filteredExpenses.length === expenses.length 
                ? `${recentTransactions.length} of ${expenses.length}` 
                : `${recentTransactions.length} of ${filteredExpenses.length} filtered`}
            </span>
          </div>
          <div className="overflow-x-auto">
            {recentTransactions.length > 0 ? (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="dashboard-label">
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map(tx => (
                    <tr key={tx._id} className="border-b border-cyan-50 dark:border-cyan-900 hover:bg-cyan-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-3 py-2 dashboard-label">
                        {new Date(tx.date).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-slate-900 dark:text-white">
                        {tx.description}
                      </td>
                      <td className="px-3 py-2 text-right dashboard-value text-slate-900 dark:text-white">
                        {formatAmount(Math.abs(tx.amount))}
                      </td>
                      <td className="px-3 py-2 dashboard-label">
                        {tx.paymentMethod}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                <p className="text-lg mb-2">No transactions found</p>
                <p className="text-sm">Try adjusting your filters</p>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
      {/* Responsive Category Breakdown */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8 mt-6">
        <h3 className="dashboard-subheading text-cyan-700 dark:text-cyan-400 mb-6">
          Category Breakdown
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {categoryDetails.map((cat) => (
            <CategoryDetails 
              key={cat.category} 
              {...cat} 
              formatAmount={formatAmount} 
            />
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default Dashboard;
