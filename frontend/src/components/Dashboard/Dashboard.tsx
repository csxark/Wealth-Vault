import React, { useState, useEffect } from 'react';
import { BarChart, PieChart, Calendar, IndianRupee, TrendingUp, Activity } from 'lucide-react';
import SpendingChart from './SpendingChart';
import { Line, Pie } from 'react-chartjs-2';
import { SafeSpendZone } from './SafeSpendZone';
import { CategoryDetails } from './CategoryDetails';
import AddExpenseButton from './AddExpenseButton';
import type { SpendingData, Expense, CategoryDetails as CategoryDetailsType } from '../../types';
import { expensesAPI } from '../../services/api';

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

  // Fetch expenses from backend and update dashboard state
  useEffect(() => {
    const fetchExpenses = async () => {
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
        // Optionally handle error
      }
    };
    fetchExpenses();
  }, [paymentMade]);

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

  // 7. Recent transactions (last 10)
  const recentTransactions = [...expenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  // Card stats array
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

  // Handle new expense (responsive update)
  const handleExpenseAdd = async (expense: {
    amount: number;
    category: string;
    description?: string;
    merchantName?: string;
    upiId?: string;
  }) => {
    try {
    
      // Create the expense through the API
      const response = await expensesAPI.create({
        amount: Math.abs(expense.amount),
        category: expense.category,
        description: expense.description || expense.category,
        merchantName: expense.merchantName,
        upiId: expense.upiId
      });

      if (!response.success) {
        console.error('Error adding expense:');
        return;
      }

      setExpenses(prev => [...prev]);
    } catch (error) {
      console.error('Error adding expense:', error);
    }
  };

  return (
    <div className="space-y-8 px-2 sm:px-6 md:px-12 lg:px-24 py-8 
      bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 min-h-screen transition-colors mt-8">
      {/* Responsive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 
        bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-cyan-700 dark:text-cyan-400 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-base">Track your spending patterns and financial wellbeing</p>
        </div>
        <div className="flex flex-row items-center justify-end gap-6">
          <AddExpenseButton
            className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:from-cyan-600 hover:to-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
            onExpenseAdd={handleExpenseAdd}
          />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-cyan-200 dark:border-cyan-700 dark:bg-slate-800 dark:text-white rounded-xl text-base focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm ml-2"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
          </select>
        </div>
      </div>
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
              <div>
                <p className="text-base font-medium text-cyan-700 dark:text-cyan-400 mb-1">{stat.name}</p>
                <p className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>
      {/* Analytical Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8">
          <h3 className="text-xl font-bold text-cyan-700 dark:text-cyan-400 mb-6">Spending Trend (This Month)</h3>
          <Line data={trendData} options={{ plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'Day' } }, y: { title: { display: true, text: 'Amount (₹)' } } } }} />
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-cyan-50 dark:bg-cyan-900/30 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Daily Spend</div>
              <div className="text-lg font-bold text-cyan-700 dark:text-cyan-400">₹{avgDailySpend.toFixed(0)}</div>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-900/30 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Highest Expense</div>
              <div className="text-lg font-bold text-rose-600 dark:text-rose-400">₹{highestExpense.toLocaleString()}</div>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-900/30 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Savings Rate</div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">{savingsRate.toFixed(1)}%</div>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-900/30 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Payment Methods</div>
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
        />
      </div>

      {/* Top 5 Expenses & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8">
          <h3 className="text-xl font-bold text-cyan-700 dark:text-cyan-400 mb-6">Top 5 Expenses</h3>
          <ul className="divide-y divide-cyan-100 dark:divide-cyan-900">
            {top5Expenses.map((exp) => (
              <li key={exp._id} className="py-3 flex flex-col">
                <span className="font-semibold text-slate-900 dark:text-white">₹{Math.abs(exp.amount).toLocaleString()}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{exp.description}</span>
                <span className="text-xs text-cyan-600 dark:text-cyan-400">{new Date(exp.date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8">
          <h3 className="text-xl font-bold text-cyan-700 dark:text-cyan-400 mb-6">Recent Transactions</h3>
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th className="px-2 py-1 text-left">Date</th>
                <th className="px-2 py-1 text-left">Description</th>
                <th className="px-2 py-1 text-right">Amount</th>
                <th className="px-2 py-1 text-left">Method</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map(tx => (
                <tr key={tx._id} className="border-b border-cyan-50 dark:border-cyan-900">
                  <td className="px-2 py-1">{new Date(tx.date).toLocaleDateString()}</td>
                  <td className="px-2 py-1">{tx.description}</td>
                  <td className="px-2 py-1 text-right">₹{Math.abs(tx.amount).toLocaleString()}</td>
                  <td className="px-2 py-1">{tx.paymentMethod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Responsive Category Breakdown */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-8 mt-6">
        <h3 className="text-xl font-bold text-cyan-700 dark:text-cyan-400 mb-6">Category Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {categoryDetails.map((cat) => (
            <CategoryDetails key={cat.category} {...cat} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
