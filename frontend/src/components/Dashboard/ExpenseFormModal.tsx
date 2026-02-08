import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Receipt, Calendar, CreditCard, MapPin, Tag, RotateCcw, Clock } from 'lucide-react';
import type { Expense } from '../../types';
import { expenseFormSchema, type ExpenseFormData } from '../../schemas/validationSchemas';

interface ExpenseFormModalProps {
  expense?: Expense;
  onSave: (expenseData: Partial<Expense>) => void;
  onCancel: () => void;
}

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({ expense, onSave, onCancel }) => {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      amount: '',
      description: '',
      category: 'safe',
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'card',
      location: '',
      tags: '',
      notes: '',
      isRecurring: false,
      recurringFrequency: 'monthly',
      recurringInterval: '1',
      recurringEndDate: '',
    },
  });

  const isRecurring = watch('isRecurring');
  const recurringFrequency = watch('recurringFrequency');
  const recurringInterval = watch('recurringInterval');
  const recurringEndDate = watch('recurringEndDate');

  useEffect(() => {
    if (expense) {
      reset({
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
        recurringEndDate: expense.recurringPattern?.endDate?.split('T')[0] || '',
      });
    }
  }, [expense, reset]);

  const onFormSubmit = (data: ExpenseFormData) => {
    const expenseData: Partial<Expense> = {
      amount: parseFloat(data.amount),
      description: data.description,
      category: data.category,
      date: data.date,
      paymentMethod: data.paymentMethod,
      currency: 'INR',
      isRecurring: data.isRecurring,
      status: 'completed',
    };

    // Add optional fields if they have values
    if (data.location?.trim()) {
      expenseData.location = { name: data.location.trim() };
    }

    if (data.tags?.trim()) {
      expenseData.tags = data.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag);
    }

    if (data.notes?.trim()) {
      expenseData.notes = data.notes.trim();
    }

    // Add recurring pattern if recurring is enabled
    if (data.isRecurring) {
      expenseData.recurringPattern = {
        frequency: data.recurringFrequency,
        interval: parseInt(data.recurringInterval) || 1,
      };

      if (data.recurringEndDate) {
        expenseData.recurringPattern.endDate = data.recurringEndDate;
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

        <form onSubmit={handleSubmit(onFormSubmit)} className="p-6 space-y-4">
          {/* Amount and Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                {...register('amount')}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-slate-700 dark:text-white ${errors.amount ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                  }`}
                placeholder="0.00"
              />
              {errors.amount && (
                <p className="mt-1 text-sm text-red-500">{errors.amount.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Receipt className="inline h-4 w-4 mr-1" />
                Description
              </label>
              <input
                type="text"
                {...register('description')}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-slate-700 dark:text-white ${errors.description ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                  }`}
                placeholder="e.g., Grocery shopping"
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-500">{errors.description.message}</p>
              )}
            </div>
          </div>

          {/* Category and Payment Method */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Category
              </label>
              <select
                {...register('category')}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-slate-700 dark:text-white ${errors.category ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                  }`}
              >
                <option value="safe">Safe Spending</option>
                <option value="impulsive">Impulsive Spending</option>
                <option value="anxious">Anxious Spending</option>
              </select>
              {errors.category && (
                <p className="mt-1 text-sm text-red-500">{errors.category.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <CreditCard className="inline h-4 w-4 mr-1" />
                Payment Method
              </label>
              <select
                {...register('paymentMethod')}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-slate-700 dark:text-white ${errors.paymentMethod ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                  }`}
              >
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="netbanking">Net Banking</option>
                <option value="other">Other</option>
              </select>
              {errors.paymentMethod && (
                <p className="mt-1 text-sm text-red-500">{errors.paymentMethod.message}</p>
              )}
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
                {...register('date')}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-slate-700 dark:text-white ${errors.date ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                  }`}
              />
              {errors.date && (
                <p className="mt-1 text-sm text-red-500">{errors.date.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <MapPin className="inline h-4 w-4 mr-1" />
                Location (Optional)
              </label>
              <input
                type="text"
                {...register('location')}
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
                {...register('tags')}
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
                {...register('notes')}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-slate-700 dark:text-white ${errors.notes ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                  }`}
                placeholder="Additional notes..."
              />
              {errors.notes && (
                <p className="mt-1 text-sm text-red-500">{errors.notes.message}</p>
              )}
            </div>
          </div>

          {/* Recurring Expense Section */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="flex items-center space-x-3 mb-4">
              <input
                type="checkbox"
                id="isRecurring"
                {...register('isRecurring')}
                className="w-4 h-4 text-cyan-600 bg-slate-100 border-slate-300 rounded focus:ring-cyan-500 dark:focus:ring-cyan-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
              />
              <label htmlFor="isRecurring" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center">
                <RotateCcw className="h-4 w-4 mr-1" />
                Make this a recurring expense
              </label>
            </div>

            {isRecurring && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      <Clock className="inline h-4 w-4 mr-1" />
                      Frequency
                    </label>
                    <select
                      {...register('recurringFrequency')}
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
                      {...register('recurringInterval')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-slate-700 dark:text-white ${errors.recurringInterval ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                        }`}
                      placeholder="1"
                    />
                    {errors.recurringInterval && (
                      <p className="mt-1 text-sm text-red-500">{errors.recurringInterval.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      End Date (Optional)
                    </label>
                    <input
                      type="date"
                      {...register('recurringEndDate')}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="text-sm text-slate-600 dark:text-slate-400">
                  This expense will repeat {recurringInterval === '1' ? '' : `every ${recurringInterval} `}{recurringFrequency}
                  {recurringInterval === '1' ? '' : 's'}
                  {recurringEndDate && ` until ${new Date(recurringEndDate).toLocaleDateString()}`}.
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
