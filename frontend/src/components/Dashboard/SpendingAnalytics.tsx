import React, { useMemo } from 'react';
import { Pie, Bar, Line } from 'react-chartjs-2';
import { TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import type { Expense } from '../../types';

interface SpendingAnalyticsProps {
  expenses: Expense[];
  formatAmount: (amount: number) => string;
}

const SpendingAnalytics: React.FC<SpendingAnalyticsProps> = ({ expenses, formatAmount }) => {
  const analytics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Current month expenses
    const currentMonthExpenses = expenses.filter(exp => {
      const expDate = new Date(exp.date);
      return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
    });
    
    // Previous month expenses for comparison
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevMonthExpenses = expenses.filter(exp => {
      const expDate = new Date(exp.date);
      return expDate.getMonth() === prevMonth && expDate.getFullYear() === prevYear;
    });
    
    // Category-wise spending
    const categorySpending = currentMonthExpenses.reduce((acc, exp) => {
      const category = exp.category || 'Other';
      acc[category] = (acc[category] || 0) + Math.abs(exp.amount);
      return acc;
    }, {} as Record<string, number>);
    
    // Previous month category spending for comparison
    const prevCategorySpending = prevMonthExpenses.reduce((acc, exp) => {
      const category = exp.category || 'Other';
      acc[category] = (acc[category] || 0) + Math.abs(exp.amount);
      return acc;
    }, {} as Record<string, number>);
    
    // Top categories
    const topCategories = Object.entries(categorySpending)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    // Monthly trend (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - i, 1);
      const monthExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate.getMonth() === date.getMonth() && expDate.getFullYear() === date.getFullYear();
      });
      const total = monthExpenses.reduce((sum, exp) => sum + Math.abs(exp.amount), 0);
      monthlyTrend.push({
        month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        amount: total
      });
    }
    
    return {
      categorySpending,
      prevCategorySpending,
      topCategories,
      monthlyTrend,
      currentTotal: Object.values(categorySpending).reduce((sum, val) => sum + val, 0),
      prevTotal: Object.values(prevCategorySpending).reduce((sum, val) => sum + val, 0)
    };
  }, [expenses]);
  
  // Chart data
  const pieChartData = {
    labels: analytics.topCategories.map(([category]) => category),
    datasets: [{
      data: analytics.topCategories.map(([, amount]) => amount),
      backgroundColor: [
        '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'
      ],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };
  
  const barChartData = {
    labels: Object.keys(analytics.categorySpending),
    datasets: [{
      label: 'Current Month',
      data: Object.values(analytics.categorySpending),
      backgroundColor: '#06b6d4',
      borderRadius: 4
    }]
  };
  
  const trendChartData = {
    labels: analytics.monthlyTrend.map(item => item.month),
    datasets: [{
      label: 'Monthly Spending',
      data: analytics.monthlyTrend.map(item => item.amount),
      borderColor: '#06b6d4',
      backgroundColor: 'rgba(6, 182, 212, 0.1)',
      fill: true,
      tension: 0.4
    }]
  };
  
  const monthlyChange = analytics.prevTotal > 0 
    ? ((analytics.currentTotal - analytics.prevTotal) / analytics.prevTotal) * 100 
    : 0;
  
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-cyan-100 dark:border-cyan-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">This Month</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatAmount(analytics.currentTotal)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-cyan-600" />
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-cyan-100 dark:border-cyan-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Monthly Change</p>
              <div className="flex items-center gap-2">
                <p className={`text-2xl font-bold ${monthlyChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {monthlyChange >= 0 ? '+' : ''}{monthlyChange.toFixed(1)}%
                </p>
                {monthlyChange >= 0 ? 
                  <TrendingUp className="h-5 w-5 text-red-600" /> : 
                  <TrendingDown className="h-5 w-5 text-green-600" />
                }
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-cyan-100 dark:border-cyan-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Categories</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {Object.keys(analytics.categorySpending).length}
              </p>
            </div>
            <Calendar className="h-8 w-8 text-cyan-600" />
          </div>
        </div>
      </div>
      
      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Distribution Pie Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-cyan-100 dark:border-cyan-900">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Category Distribution
          </h3>
          <div className="h-64 flex items-center justify-center">
            <Pie 
              data={pieChartData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom' as const,
                    labels: {
                      padding: 20,
                      usePointStyle: true
                    }
                  }
                }
              }}
            />
          </div>
        </div>
        
        {/* Category Comparison Bar Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-cyan-100 dark:border-cyan-900">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Category Breakdown
          </h3>
          <div className="h-64">
            <Bar 
              data={barChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: function(value) {
                        return '₹' + value.toLocaleString();
                      }
                    }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>
      
      {/* Monthly Trend */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-cyan-100 dark:border-cyan-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          6-Month Spending Trend
        </h3>
        <div className="h-64">
          <Line 
            data={trendChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    callback: function(value) {
                      return '₹' + value.toLocaleString();
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>
      
      {/* Top Categories List */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-cyan-100 dark:border-cyan-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Top Spending Categories
        </h3>
        <div className="space-y-3">
          {analytics.topCategories.map(([category, amount], index) => {
            const prevAmount = analytics.prevCategorySpending[category] || 0;
            const change = prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : 0;
            const percentage = (amount / analytics.currentTotal) * 100;
            
            return (
              <div key={category} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pieChartData.datasets[0].backgroundColor[index] }}></div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white capitalize">{category}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{percentage.toFixed(1)}% of total</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900 dark:text-white">{formatAmount(amount)}</p>
                  {prevAmount > 0 && (
                    <p className={`text-sm ${change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SpendingAnalytics;