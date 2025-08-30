import React, { useState, useEffect } from 'react';
import { BarChart, PieChart, Calendar, IndianRupee, TrendingUp, Activity } from 'lucide-react';
import SpendingChart from './SpendingChart';
import { SafeSpendZone } from './SafeSpendZone';
import { CategoryDetails } from './CategoryDetails';
import AddExpenseButton from './AddExpenseButton';
<<<<<<< Updated upstream
import { useAuth } from '../../hooks/useAuth';
import { transactions, getSpendingData } from '../../lib/supabase';
import type { SpendingData, Transaction, CategoryDetails as CategoryDetailsType, SpendingCategory } from '../../types';
=======
import ConnectionTest from '../ConnectionTest';
import type { SpendingData, Expense, CategoryDetails as CategoryDetailsType } from '../../types';
>>>>>>> Stashed changes

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [chartType, setChartType] = useState<'doughnut' | 'bar'>('doughnut');
<<<<<<< Updated upstream
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
      // Get spending data from Supabase
      const { data: spendingResult, error: spendingError } = await getSpendingData(user.id, timeRange);
      
      if (spendingError) {
        console.error('Error loading spending data:', spendingError);
        // Set default values if there's an error
        setSpendingData({
          safe: 0,
          impulsive: 0,
          anxious: 0
        });
        return;
      }

      if (spendingResult) {
        setSpendingData(spendingResult);
      }

      // Get all transactions for the time range to generate category details
      const { data: allTransactions, error: transactionsError } = await transactions.getAll(user.id);
      
      if (transactionsError) {
        console.error('Error loading transactions:', transactionsError);
        setCategoryDetails([]);
        return;
      }

      if (allTransactions) {
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

        const monthlyTransactions = allTransactions.filter(t => {
          try {
            const transactionDate = new Date(t.date);
            return transactionDate >= startDate && t.amount < 0; // Only expenses
          } catch (error) {
            console.error('Error parsing transaction date:', t.date, error);
            return false;
          }
        });

        // Generate category details
        const details: CategoryDetailsType[] = (['safe', 'impulsive', 'anxious'] as SpendingCategory[]).map(category => {
          const categoryTransactions = monthlyTransactions.filter(t => 
            t.category === category
          );
          const totalAmount = categoryTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
          const totalSpent = spendingData.safe + spendingData.impulsive + spendingData.anxious;
          
          return {
            category,
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
    } catch (error) {
      console.error('Error loading data:', error);
      // Set default values on error
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
=======
  const [timeRange, setTimeRange] = useState('month');
  const [spendingData, setSpendingData] = useState<SpendingData>({});
  // Array format for SpendingChart
  const spendingChartData = Object.entries(spendingData).map(([categoryId, amount]) => ({
    label: categoryId,
    value: amount
  }));
  const [categoryDetails, setCategoryDetails] = useState<CategoryDetailsType[]>([]);
  const [monthlyBudget] = useState(40000);

  useEffect(() => {
    // For now, use mock data until we connect to the backend
    const mockSpendingData: SpendingData = {
      'Food & Dining': 24500,
      'Transportation': 6800,
      'Entertainment': 3200
    };
    
    setSpendingData(mockSpendingData);
    
    // TODO: Replace with actual API call to get expenses by category
    // const fetchExpenses = async () => {
    //   try {
    //     const response = await expensesAPI.getAll({ 
    //       startDate: monthStart.toISOString(),
    //       endDate: now.toISOString()
    //     });
    //     // Process expenses by category
    //   } catch (error) {
    //     console.error('Failed to fetch expenses:', error);
    //   }
    // };
  }, []);
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }
=======
  const handleExpenseAdd = (expense: {
    amount: number;
    category: string;
    description?: string;
    merchantName?: string;
    upiId?: string;
  }) => {
    // TODO: When backend is connected, save expense to database
    // const newExpense: Omit<Expense, '_id' | 'user' | 'createdAt' | 'updatedAt'> = {
    //   amount: expense.amount,
    //   currency: 'INR',
    //   description: expense.description || (expense.merchantName ? `Paid to ${expense.merchantName}` : ''),
    //   category: expense.category,
    //   date: new Date().toISOString(),
    //   paymentMethod: 'digital_wallet',
    //   isRecurring: false,
    //   status: 'completed'
    // };

    // Update spending data
    setSpendingData(prev => ({
      ...prev,
      [expense.category]: (prev[expense.category] || 0) + expense.amount
    }));

    // TODO: When backend is connected, save expense to database
    // try {
    //   await expensesAPI.create(newExpense);
    // } catch (error) {
    //   console.error('Failed to save expense:', error);
    // }
  };
>>>>>>> Stashed changes

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Track your spending and financial health</p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex flex-col sm:flex-row gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as 'week' | 'month' | 'year')}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
          
          <AddExpenseButton 
            onExpenseAdd={handleExpenseAdd}
            label="Add Expense"
            className="bg-gradient-to-r from-blue-900 to-cyan-600 text-white px-4 py-2 rounded-lg hover:from-blue-800 hover:to-cyan-500 transition-all duration-200"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{stat.name}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-lg bg-slate-100 dark:bg-slate-700 ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Spending Overview</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setChartType('doughnut')}
                className={`p-2 rounded ${chartType === 'doughnut' ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}
              >
                <PieChart className="h-4 w-4" />
              </button>
              <button
                onClick={() => setChartType('bar')}
                className={`p-2 rounded ${chartType === 'bar' ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}
              >
                <BarChart className="h-4 w-4" />
              </button>
            </div>
          </div>
          <SpendingChart data={spendingChartData} type={chartType} />
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Safe Spend Zone</h3>
          <SafeSpendZone 
            monthlyBudget={monthlyBudget}
            totalSpent={spendingData.safe + spendingData.impulsive + spendingData.anxious}
            safeSpending={spendingData.safe}
          />
        </div>
      </div>

<<<<<<< Updated upstream
             {/* Category Details */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {categoryDetails.map((category) => (
           <CategoryDetails key={category.category} {...category} />
         ))}
       </div>
=======
      {/* Connection Test Component */}
      <div className="mt-6">
        <ConnectionTest />
      </div>
>>>>>>> Stashed changes
    </div>
  );
};

export default Dashboard;