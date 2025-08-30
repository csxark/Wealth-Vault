import React, { useState, useEffect } from 'react';
import { BarChart, PieChart, Calendar, IndianRupee, TrendingUp, Activity } from 'lucide-react';
import SpendingChart from './SpendingChart';
import { SafeSpendZone } from './SafeSpendZone';
import { CategoryDetails } from './CategoryDetails';
import AddExpenseButton from './AddExpenseButton';
import { useAuth } from '../../hooks/useAuth';
import { expensesAPI } from '../../services/api';
import type { SpendingData, CategoryDetails as CategoryDetailsType, SpendingCategory } from '../../types';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [chartType, setChartType] = useState<'doughnut' | 'bar'>('doughnut');
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');
  const [spendingData, setSpendingData] = useState<SpendingData>({
    safe: 0,
    impulsive: 0,
    anxious: 0
  });
  const [categoryDetails, setCategoryDetails] = useState<CategoryDetailsType[]>([]);
  const [monthlyBudget] = useState(40000);
  const [loading, setLoading] = useState(true);

  // Array format for SpendingChart
  const spendingChartData = [
    { label: 'Safe', value: spendingData.safe },
    { label: 'Impulsive', value: spendingData.impulsive },
    { label: 'Anxious', value: spendingData.anxious }
  ];

  useEffect(() => {
    if (user) {
      loadSpendingData();
    }
  }, [user, timeRange]);

  const loadSpendingData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Calculate date range
      const now = new Date();
      let startDate: Date;

      switch (timeRange) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      // Get expenses from API
      const response = await expensesAPI.getAll({
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        limit: 1000 // Get all expenses for the period
      });

      if (response.success) {
        const expenses = response.data.expenses;
        
        // Calculate spending by category
        const spending: SpendingData = {
          safe: 0,
          impulsive: 0,
          anxious: 0
        };

        // Group expenses by category and calculate totals
        expenses.forEach(expense => {
          // Map expense categories to spending categories
          // This is a simplified mapping - you may need to adjust based on your category structure
          const category = expense.category.toLowerCase();
          if (category.includes('food') || category.includes('groceries') || category.includes('dining')) {
            spending.safe += expense.amount;
          } else if (category.includes('entertainment') || category.includes('shopping') || category.includes('luxury')) {
            spending.impulsive += expense.amount;
          } else {
            spending.anxious += expense.amount;
          }
        });

        setSpendingData(spending);

        // Generate category details
        const details: CategoryDetailsType[] = (['safe', 'impulsive', 'anxious'] as SpendingCategory[]).map(category => {
          const categoryExpenses = expenses.filter(expense => {
            const expenseCategory = expense.category.toLowerCase();
            if (category === 'safe') {
              return expenseCategory.includes('food') || expenseCategory.includes('groceries') || expenseCategory.includes('dining');
            } else if (category === 'impulsive') {
              return expenseCategory.includes('entertainment') || expenseCategory.includes('shopping') || expenseCategory.includes('luxury');
            } else {
              return !expenseCategory.includes('food') && !expenseCategory.includes('groceries') && 
                     !expenseCategory.includes('dining') && !expenseCategory.includes('entertainment') && 
                     !expenseCategory.includes('shopping') && !expenseCategory.includes('luxury');
            }
          });

          const total = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);
          const percentage = spendingData.safe + spendingData.impulsive + spendingData.anxious > 0 
            ? (total / (spendingData.safe + spendingData.impulsive + spendingData.anxious)) * 100 
            : 0;

          // Get top expenses for this category
          const topExpenses = categoryExpenses
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5)
            .map(expense => ({
              description: expense.description,
              amount: expense.amount,
              date: expense.date
            }));

          return {
            category,
            amount: total,
            percentage,
            transactions: [], // Legacy field - not used in new structure
            topExpenses
          };
        });

        setCategoryDetails(details);
      }
    } catch (error) {
      console.error('Error loading spending data:', error);
      // Set default values if there's an error
      setSpendingData({
        safe: 0,
        impulsive: 0,
        anxious: 0
      });
      setCategoryDetails([]);
    } finally {
      setLoading(false);
    }
  };

<<<<<<< Updated upstream
  const handleExpenseAdd = async (expense: {
    amount: number;
    category: string;
    description?: string;
    merchantName?: string;
    upiId?: string;
  }) => {
    if (!user) return;

    try {
      // Map the expense category to our spending categories
      let mappedCategory: SpendingCategory = 'safe';
      
      // Simple mapping logic - you can customize this based on your needs
      if (['Food', 'Transport', 'Bills'].includes(expense.category)) {
        mappedCategory = 'safe';
      } else if (['Shopping', 'Entertainment'].includes(expense.category)) {
        mappedCategory = 'impulsive';
      } else {
        mappedCategory = 'anxious';
      }

      // Create transaction in Supabase
      const { error } = await transactions.create({
        user_id: user.id,
        amount: -Math.abs(expense.amount), // Negative for expenses
        description: expense.description || expense.category,
        category: mappedCategory,
        date: new Date().toISOString(),
        merchant_name: expense.merchantName,
        upi_id: expense.upiId
      });

      if (error) {
        console.error('Error adding expense:', error);
        return;
      }

      // Reload spending data
      await loadSpendingData();
    } catch (error) {
      console.error('Error adding expense:', error);
    }
  };

  const totalSpent = Object.values(spendingData).reduce((sum, amount) => sum + amount, 0);
  
  const stats = [
    {
      name: 'Total Spent',
      value: `₹${totalSpent.toLocaleString()}`,
      icon: IndianRupee,
      color: 'text-slate-600 dark:text-slate-400'
    },
    {
      name: 'Top Category',
      value: Object.entries(spendingData).sort(([,a], [,b]) => b - a)[0]?.[0] || 'None',
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400'
    },
    {
      name: 'Budget Remaining',
      value: `₹${Math.max(0, monthlyBudget - totalSpent).toLocaleString()}`,
      icon: Activity,
      color: 'text-cyan-600 dark:text-cyan-400'
    }
  ];
=======
  const totalSpending = spendingData.safe + spendingData.impulsive + spendingData.anxious;
  const remainingBudget = monthlyBudget - totalSpending;
  const spendingPercentage = (totalSpending / monthlyBudget) * 100;
>>>>>>> Stashed changes

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user?.firstName || 'User'}!</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <IndianRupee className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Spending</p>
                <p className="text-2xl font-bold text-gray-900">₹{totalSpending.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Remaining Budget</p>
                <p className="text-2xl font-bold text-gray-900">₹{remainingBudget.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Activity className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Budget Used</p>
                <p className="text-2xl font-bold text-gray-900">{spendingPercentage.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Time Range</p>
                <p className="text-2xl font-bold text-gray-900 capitalize">{timeRange}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Chart Type:</label>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setChartType('doughnut')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    chartType === 'doughnut'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <PieChart className="h-4 w-4 inline mr-1" />
                  Doughnut
                </button>
                <button
                  onClick={() => setChartType('bar')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    chartType === 'bar'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <BarChart className="h-4 w-4 inline mr-1" />
                  Bar
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Time Range:</label>
              <div className="flex bg-gray-100 rounded-lg p-1">
                {(['week', 'month', 'year'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      timeRange === range
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {range.charAt(0).toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Spending Chart */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Spending Overview</h2>
              <SpendingChart data={spendingChartData} type={chartType} />
            </div>
          </div>

          {/* Safe Spend Zone */}
          <div className="lg:col-span-1">
            <SafeSpendZone
              totalSpending={totalSpending}
              monthlyBudget={monthlyBudget}
              spendingPercentage={spendingPercentage}
            />
          </div>
        </div>

        {/* Category Details */}
        <div className="mt-8">
          <CategoryDetails details={categoryDetails} />
        </div>

        {/* Add Expense Button */}
        <AddExpenseButton onExpenseAdded={loadSpendingData} />
      </div>
    </div>
  );
};

export default Dashboard;