import React, { useState, useEffect } from 'react';
import { Search, X, Calendar, DollarSign, CreditCard, Filter, ChevronDown } from 'lucide-react';
import type { Expense } from '../../types';

interface TransactionSearchProps {
  expenses: Expense[];
  onFilteredResults: (filtered: Expense[]) => void;
}

interface FilterState {
  searchTerm: string;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  paymentMethods: string[];
}

export const TransactionSearch: React.FC<TransactionSearchProps> = ({
  expenses,
  onFilteredResults
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    dateFrom: '',
    dateTo: '',
    amountMin: '',
    amountMax: '',
    paymentMethods: []
  });

  // Get unique payment methods from expenses
  const availablePaymentMethods = Array.from(
    new Set(expenses.map(exp => exp.paymentMethod))
  ).filter(Boolean);

  // Apply filters whenever they change
  useEffect(() => {
    const filtered = expenses.filter(expense => {
      // Search term filter (description)
      if (filters.searchTerm.trim()) {
        const searchLower = filters.searchTerm.toLowerCase();
        const matchesDescription = expense.description.toLowerCase().includes(searchLower);
        const matchesCategory = expense.category.toLowerCase().includes(searchLower);
        if (!matchesDescription && !matchesCategory) return false;
      }

      // Date range filter
      if (filters.dateFrom) {
        const expenseDate = new Date(expense.date);
        const fromDate = new Date(filters.dateFrom);
        if (expenseDate < fromDate) return false;
      }
      if (filters.dateTo) {
        const expenseDate = new Date(expense.date);
        const toDate = new Date(filters.dateTo);
        toDate.setHours(23, 59, 59, 999); // Include the entire day
        if (expenseDate > toDate) return false;
      }

      // Amount range filter
      const amount = Math.abs(expense.amount);
      if (filters.amountMin && amount < parseFloat(filters.amountMin)) return false;
      if (filters.amountMax && amount > parseFloat(filters.amountMax)) return false;

      // Payment method filter
      if (filters.paymentMethods.length > 0) {
        if (!filters.paymentMethods.includes(expense.paymentMethod)) return false;
      }

      return true;
    });

    onFilteredResults(filtered);
  }, [filters, expenses, onFilteredResults]);

  const handleClearFilters = () => {
    setFilters({
      searchTerm: '',
      dateFrom: '',
      dateTo: '',
      amountMin: '',
      amountMax: '',
      paymentMethods: []
    });
  };

  const togglePaymentMethod = (method: string) => {
    setFilters(prev => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter(m => m !== method)
        : [...prev.paymentMethods, method]
    }));
  };

  const hasActiveFilters = 
    filters.searchTerm || 
    filters.dateFrom || 
    filters.dateTo || 
    filters.amountMin || 
    filters.amountMax || 
    filters.paymentMethods.length > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-cyan-100 dark:border-cyan-900 p-6">
      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-12 pr-12 py-3.5 border border-cyan-200 dark:border-cyan-700 rounded-xl leading-5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-base transition duration-150 ease-in-out"
          placeholder="Search by description or category..."
          value={filters.searchTerm}
          onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
        />
        {filters.searchTerm && (
          <button
            onClick={() => setFilters(prev => ({ ...prev, searchTerm: '' }))}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Advanced Filters Toggle */}
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
        >
          <Filter className="h-4 w-4" />
          Advanced Filters
          <ChevronDown 
            className={`h-4 w-4 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
          />
        </button>
        
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
          >
            <X className="h-4 w-4" />
            Clear All
          </button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="mt-4 space-y-4 animate-slide-down">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date Range */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Calendar className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                Date Range
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                    placeholder="From"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    value={filters.dateTo}
                    onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                    placeholder="To"
                  />
                </div>
              </div>
            </div>

            {/* Amount Range */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <DollarSign className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                Amount Range
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    value={filters.amountMin}
                    onChange={(e) => setFilters(prev => ({ ...prev, amountMin: e.target.value }))}
                    placeholder="Min"
                    min="0"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    value={filters.amountMax}
                    onChange={(e) => setFilters(prev => ({ ...prev, amountMax: e.target.value }))}
                    placeholder="Max"
                    min="0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          {availablePaymentMethods.length > 0 && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <CreditCard className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                Payment Methods
              </label>
              <div className="flex flex-wrap gap-2">
                {availablePaymentMethods.map(method => (
                  <button
                    key={method}
                    onClick={() => togglePaymentMethod(method)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      filters.paymentMethods.includes(method)
                        ? 'bg-cyan-600 text-white shadow-md scale-105'
                        : 'bg-cyan-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-cyan-200 dark:border-cyan-700 hover:bg-cyan-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="pt-4 border-t border-cyan-100 dark:border-cyan-900">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 dark:text-slate-400">Active filters:</span>
                <div className="flex flex-wrap gap-2">
                  {filters.dateFrom && (
                    <span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded-md text-xs">
                      From: {new Date(filters.dateFrom).toLocaleDateString()}
                    </span>
                  )}
                  {filters.dateTo && (
                    <span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded-md text-xs">
                      To: {new Date(filters.dateTo).toLocaleDateString()}
                    </span>
                  )}
                  {filters.amountMin && (
                    <span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded-md text-xs">
                      Min: ₹{filters.amountMin}
                    </span>
                  )}
                  {filters.amountMax && (
                    <span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded-md text-xs">
                      Max: ₹{filters.amountMax}
                    </span>
                  )}
                  {filters.paymentMethods.map(method => (
                    <span key={method} className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded-md text-xs">
                      {method}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
