import React, { useState } from 'react';
import { TrendingUp, TrendingDown, IndianRupee } from 'lucide-react';
import type { CategoryDetails, Transaction } from '../../types';
import AddExpenseButton from './AddExpenseButton';

interface CategoryDetailsProps {
  categoryData: CategoryDetails[];
}

const CategoryDetails: React.FC<CategoryDetailsProps> = ({ categoryData }) => {
  // Local state to manage expenses per category
  const [localData, setLocalData] = useState<CategoryDetails[]>(categoryData);
  const [showModal, setShowModal] = useState(false);
  const [modalCategory, setModalCategory] = useState<'safe' | 'impulsive' | 'anxious' | ''>('');
  const [form, setForm] = useState<{ amount: string; desc: string; date: string }>({
    amount: '',
    desc: '',
    date: '',
  });

  const openModal = (category: 'safe' | 'impulsive' | 'anxious') => {
    setModalCategory(category);
    setShowModal(true);
    setForm({ amount: '', desc: '', date: '' });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !modalCategory) return;
    setLocalData((prev) => prev.map((cat) => {
      if (cat.category === modalCategory) {
        const newExpense: Transaction = {
          id: Math.random().toString(36).substr(2, 9),
          user_id: 'local',
          amount: parseFloat(form.amount),
          description: form.desc,
          category: modalCategory,
          date: form.date || new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
        };
        const updatedTransactions = [...cat.transactions, newExpense];
        const updatedAmount = cat.amount + newExpense.amount;
        return {
          ...cat,
          transactions: updatedTransactions,
          amount: updatedAmount,
          topExpenses: updatedTransactions
            .map((t) => ({ description: t.description, amount: t.amount, date: t.date }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 3),
        };
      }
      return cat;
    }));
    setShowModal(false);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'safe': return 'text-green-600 dark:text-green-400';
      case 'impulsive': return 'text-amber-600 dark:text-amber-400';
      case 'anxious': return 'text-red-600 dark:text-red-400';
      default: return 'text-slate-600 dark:text-slate-400';
    }
  };

  const getCategoryBg = (category: string) => {
    switch (category) {
      case 'safe': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'impulsive': return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
      case 'anxious': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default: return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'safe': return TrendingUp;
      case 'impulsive': return TrendingDown;
      case 'anxious': return TrendingDown;
      default: return TrendingUp;
    }
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'safe': return 'Safe Spending';
      case 'impulsive': return 'Impulsive Spending';
      case 'anxious': return 'Anxious Spending';
      default: return 'Unknown';
    }
  };

  const getCategoryDescription = (category: string) => {
    switch (category) {
      case 'safe': return 'Essential expenses and planned purchases';
      case 'impulsive': return 'Spontaneous and entertainment purchases';
      case 'anxious': return 'Emergency and stress-driven expenses';
      default: return '';
    }
  };

  return (
    <div className="space-y-4">
      {localData.map((data) => {
        const Icon = getCategoryIcon(data.category);
        return (
          <div
            key={data.category}
            className={`border rounded-xl p-6 ${getCategoryBg(data.category)}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Icon className={`h-6 w-6 mr-3 ${getCategoryColor(data.category)}`} />
                <div>
                  <h3 className={`text-lg font-semibold ${getCategoryColor(data.category)}`}>{getCategoryTitle(data.category)}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{getCategoryDescription(data.category)}</p>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${getCategoryColor(data.category)}`}>₹{data.amount.toLocaleString()}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">{data.percentage.toFixed(1)}% of total</div>
                <AddExpenseButton onClick={() => openModal(data.category)} />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>Transactions: {data.transactions.length}</span>
                <span>Avg: ₹{data.transactions.length > 0 ? (data.amount / data.transactions.length).toFixed(0) : '0'}</span>
              </div>
              {data.topExpenses.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Top Expenses</h4>
                  <div className="space-y-2">
                    {data.topExpenses.slice(0, 3).map((expense, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center">
                          <IndianRupee className="h-3 w-3 mr-1 text-slate-400" />
                          <span className="text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{expense.description}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`font-medium ${getCategoryColor(data.category)}`}>₹{expense.amount.toLocaleString()}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(expense.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Modal for adding expense */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-80">
            <h3 className="text-lg font-semibold mb-2">Add Expense</h3>
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <input
                type="number"
                name="amount"
                value={form.amount}
                onChange={handleChange}
                placeholder="Amount"
                className="border p-2 rounded"
                required
              />
              <input
                type="text"
                name="desc"
                value={form.desc}
                onChange={handleChange}
                placeholder="Description"
                className="border p-2 rounded"
              />
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="border p-2 rounded"
              />
              <div className="flex gap-2 mt-2">
                <button type="submit" className="bg-green-500 text-white px-3 py-1 rounded">Save</button>
                <button type="button" className="bg-gray-300 px-3 py-1 rounded" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryDetails;