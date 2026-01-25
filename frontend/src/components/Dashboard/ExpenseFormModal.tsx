import React, { useState, useEffect } from 'react';
import { X, Receipt, Calendar, CreditCard, MapPin, Tag, RotateCcw, Clock } from 'lucide-react';
import type { Expense } from '../../types';

interface ExpenseFormModalProps {
  expense?: Expense;
  onSave: (expenseData: Partial<Expense>) => void;
  onCancel: () => void;
}

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({ expense, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    category: 'safe' as 'safe' | 'impulsive' | 'anxious',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'card' as 'cash' | 'card' | 'upi' | 'netbanking' | 'other',
    location: '',
    tags: '',
    notes: '',
    isRecurring: false,
    recurringFrequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
    recurringInterval: '1',
    recurringEndDate: ''
  });

  useEffect(() => {
    if (expense) {
      setFormData({
        amount: Math.abs(expense.amount).toString(),
        description: expense.description,
        category: expense.category as 'safe' | 'impulsive' | 'anxious',
        date: expense.date.split('T')[0],
        paymentMethod: expense.paymentMethod as 'cash' | 'card' | 'upi' | 'netbanking' | 'other',
        location: expense.location?.name || '',
        tags: expense.tags?.join(', ') || '',
        notes: expense.notes || '',
        isRecurring: expense.isRecurring,
        recurringFrequency: expense.recurringPattern?.frequency || 'monthly',
        recurringInterval: expense.recurringPattern?.interval?.toString() || '1',
        recurringEndDate: expense.recurringPattern?.endDate?.split('T')[0] || ''
      });
    }
  }, [expense]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const expenseData: Partial<Expense> = {
      amount: parseFloat(formData.amount),
      description: formData.description,
      category: formData.category,
      date: formData.date,
      paymentMethod: formData.paymentMethod,
      currency: 'INR',
      isRecurring: formData.isRecurring,
      status: 'completed'
    };

    // Add optional fields if they have values
    if (formData.location.trim()) {
      expenseData.location = { name: formData.location.trim() };
    }

    if (formData.tags.trim()) {
      expenseData.tags = formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }

    if (formData.notes.trim()) {
      expenseData.notes = formData.notes.trim();
    }

    // Add recurring pattern if recurring is enabled
    if (formData.isRecurring) {
      expenseData.recurringPattern = {
        frequency: formData.recurringFrequency,
        interval: parseInt(formData.recurringInterval) || 1
      };

      if (formData.recurringEndDate) {
        expenseData.recurringPattern.endDate = formData.recurringEndDate;
      }
    }

    onSave(expenseData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-black dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-t-xl">
          <h2 className="text-xl font-semibold text-white">
            {expense ? 'Edit Expense' : 'Add New Expense'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Amount and Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Receipt className="inline h-4 w-4 mr-1" />
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., Grocery shopping"
                required
              />
            </div>
          </div>

          {/* Category and Payment Method */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as 'safe' | 'impulsive' | 'anxious' })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="safe">Safe Spending</option>
                <option value="impulsive">Impulsive Spending</option>
                <option value="anxious">Anxious Spending</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <CreditCard className="inline h-4 w-4 mr-1" />
                Payment Method
              </label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as 'cash' | 'card' | 'upi' | 'netbanking' | 'other' })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="netbanking">Net Banking</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Date and Location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Calendar className="inline h-4 w-4 mr-1" />
                Date
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <MapPin className="inline h-4 w-4 mr-1" />
                Location (Optional)
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., Local Market"
              />
            </div>
          </div>

          {/* Tags and Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Tag className="inline h-4 w-4 mr-1" />
                Tags (Optional)
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., food, monthly"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Notes (Optional)
              </label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Additional notes..."
              />
            </div>
          </div>

          {/* Recurring Expense Section */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="flex items-center space-x-3 mb-4">
              <input
                type="checkbox"
                id="isRecurring"
                checked={formData.isRecurring}
                onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                className="w-4 h-4 text-cyan-600 bg-slate-100 border-slate-300 rounded focus:ring-cyan-500 dark:focus:ring-cyan-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
              />
              <label htmlFor="isRecurring" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center">
                <RotateCcw className="h-4 w-4 mr-1" />
                Make this a recurring expense
              </label>
            </div>

            {formData.isRecurring && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      <Clock className="inline h-4 w-4 mr-1" />
                      Frequency
                    </label>
                    <select
                      value={formData.recurringFrequency}
                      onChange={(e) => setFormData({ ...formData, recurringFrequency: e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly' })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Interval
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.recurringInterval}
                      onChange={(e) => setFormData({ ...formData, recurringInterval: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      placeholder="1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      End Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={formData.recurringEndDate}
                      onChange={(e) => setFormData({ ...formData, recurringEndDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="text-sm text-slate-600 dark:text-slate-400">
                  This expense will repeat {formData.recurringInterval === '1' ? '' : `every ${formData.recurringInterval} `}{formData.recurringFrequency}
                  {formData.recurringInterval === '1' ? '' : 's'}
                  {formData.recurringEndDate && ` until ${new Date(formData.recurringEndDate).toLocaleDateString()}`}.
                </div>
              </div>
            )}
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all duration-200"
            >
              {expense ? 'Update Expense' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
