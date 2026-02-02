import React, { useMemo, useState, useEffect } from 'react';
import { RotateCcw, Calendar, TrendingUp, AlertCircle, Edit, Trash2, Plus, Settings } from 'lucide-react';
import type { Expense, RecurringExpense } from '../../types';
import { expensesAPI } from '../../services/api';
import { RecurringExpenseForm } from './RecurringExpenseForm';

interface RecurringExpensesProps {
  expenses: Expense[];
  formatAmount: (amount: number) => string;
  onEditExpense?: (expense: Expense) => void;
  onDeleteExpense?: (expenseId: string) => void;
}

export const RecurringExpenses: React.FC<RecurringExpensesProps> = ({
  expenses,
  formatAmount,
  onEditExpense,
  onDeleteExpense
}) => {
  // Filter recurring expenses
  const recurringExpenses = useMemo(() => {
    return expenses.filter(expense => expense.isRecurring);
  }, [expenses]);

  // Calculate next occurrence for each recurring expense
  const getNextOccurrence = (expense: Expense) => {
    if (!expense.recurringPattern) return null;

    const { frequency, interval = 1, endDate } = expense.recurringPattern;
    const lastDate = new Date(expense.date);
    const now = new Date();

    // If end date is set and we've passed it, return null
    if (endDate && new Date(endDate) < now) return null;

    let nextDate = new Date(lastDate);

    // Calculate next occurrence based on frequency
    switch (frequency) {
      case 'daily':
        while (nextDate <= now) {
          nextDate.setDate(nextDate.getDate() + interval);
        }
        break;
      case 'weekly':
        while (nextDate <= now) {
          nextDate.setDate(nextDate.getDate() + (7 * interval));
        }
        break;
      case 'monthly':
        while (nextDate <= now) {
          nextDate.setMonth(nextDate.getMonth() + interval);
        }
        break;
      case 'yearly':
        while (nextDate <= now) {
          nextDate.setFullYear(nextDate.getFullYear() + interval);
        }
        break;
      default:
        return null;
    }

    // Check if we've exceeded the end date
    if (endDate && nextDate > new Date(endDate)) return null;

    return nextDate;
  };

  // Get frequency display text
  const getFrequencyText = (pattern: Expense['recurringPattern']) => {
    if (!pattern) return '';
    const { frequency, interval = 1 } = pattern;
    const intervalText = interval === 1 ? '' : ` (${interval})`;
    return `${frequency}${intervalText}`;
  };

  // Group recurring expenses by status
  const groupedExpenses = useMemo(() => {
    const active = [];
    const completed = [];

    for (const expense of recurringExpenses) {
      const nextOccurrence = getNextOccurrence(expense);
      if (nextOccurrence) {
        active.push({ ...expense, nextOccurrence });
      } else {
        completed.push(expense);
      }
    }

    // Sort active by next occurrence date
    active.sort((a, b) => a.nextOccurrence!.getTime() - b.nextOccurrence!.getTime());

    return { active, completed };
  }, [recurringExpenses]);

  const { active, completed } = groupedExpenses;

  return (
    <div className="space-y-6">
      {/* Active Recurring Expenses */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <RotateCcw className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                Active Recurring Expenses
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {active.length} active recurring expenses
              </p>
            </div>
          </div>
        </div>

        {active.length > 0 ? (
          <div className="space-y-4">
            {active.map((expense) => (
              <div
                key={expense._id}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-cyan-100 dark:bg-cyan-900 rounded-lg">
                    <TrendingUp className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-900 dark:text-white">
                      {expense.description}
                    </h4>
                    <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <RotateCcw className="h-3 w-3" />
                        {getFrequencyText(expense.recurringPattern)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Next: {expense.nextOccurrence!.toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-lg font-semibold text-slate-900 dark:text-white">
                    {formatAmount(Math.abs(expense.amount))}
                  </span>

                  <div className="flex items-center gap-2">
                    {onEditExpense && (
                      <button
                        onClick={() => onEditExpense(expense)}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg transition-colors"
                        title="Edit expense"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    )}
                    {onDeleteExpense && (
                      <button
                        onClick={() => onDeleteExpense(expense._id)}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete expense"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <RotateCcw className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-lg font-medium text-slate-600 dark:text-slate-400 mb-1">
              No active recurring expenses
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500">
              Create a recurring expense to see it here
            </p>
          </div>
        )}
      </div>

      {/* Completed Recurring Expenses */}
      {completed.length > 0 && (
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <AlertCircle className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Completed Recurring Expenses
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {completed.length} completed recurring expenses
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {completed.map((expense) => (
              <div
                key={expense._id}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 opacity-75"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-900 dark:text-white">
                      {expense.description}
                    </h4>
                    <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <RotateCcw className="h-3 w-3" />
                        {getFrequencyText(expense.recurringPattern)}
                      </span>
                      <span className="text-slate-500 dark:text-slate-500">
                        Completed
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-lg font-semibold text-slate-900 dark:text-white">
                    {formatAmount(Math.abs(expense.amount))}
                  </span>

                  <div className="flex items-center gap-2">
                    {onEditExpense && (
                      <button
                        onClick={() => onEditExpense(expense)}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg transition-colors"
                        title="Edit expense"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    )}
                    {onDeleteExpense && (
                      <button
                        onClick={() => onDeleteExpense(expense._id)}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete expense"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
