import React, { useState, useEffect, useCallback } from 'react';
import { useLoading } from '../../context/LoadingContext';
import { useToast } from '../../context/ToastContext';
import { expensesAPI, categoriesAPI } from '../../services/api';
import { Expense, Category } from '../../types';
import { ExpenseList } from './ExpenseList';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseFilters } from './ExpenseFilters';
import { Plus, Download, Filter } from 'lucide-react';

interface Filters {
  startDate?: string;
  endDate?: string;
  category?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const Expenses: React.FC = () => {
  const { withLoading } = useLoading();
  const { showToast } = useToast();
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filters, setFilters] = useState<Filters>({
    sortBy: 'date',
    sortOrder: 'desc'
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 20
  });
  const [showFilters, setShowFilters] = useState(false);

  const fetchExpenses = useCallback(async () => {
    try {
      const result = await expensesAPI.getAll({
        page: pagination.currentPage,
        limit: pagination.itemsPerPage,
        ...filters
      });
      
      if (result.success) {
        setExpenses(result.data.expenses);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      showToast('Failed to fetch expenses', 'error');
    }
  }, [pagination.currentPage, pagination.itemsPerPage, filters, showToast]);

  const fetchCategories = useCallback(async () => {
    try {
      const result = await categoriesAPI.getAll();
      if (result.success) {
        setCategories(result.data.categories);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, []);

  useEffect(() => {
    withLoading(async () => {
      await Promise.all([fetchExpenses(), fetchCategories()]);
    }, 'Loading expenses...');
  }, [fetchExpenses, fetchCategories, withLoading]);

  const handleCreateExpense = async (expenseData: Omit<Expense, 'id' | 'userId' | 'created_at' | 'updated_at'>) => {
    try {
      const result = await expensesAPI.create(expenseData);
      if (result.success) {
        showToast('Expense created successfully', 'success');
        setIsFormOpen(false);
        fetchExpenses();
      }
    } catch (error) {
      console.error('Error creating expense:', error);
      showToast('Failed to create expense', 'error');
    }
  };

  const handleUpdateExpense = async (id: string, expenseData: Partial<Expense>) => {
    try {
      const result = await expensesAPI.update(id, expenseData);
      if (result.success) {
        showToast('Expense updated successfully', 'success');
        setEditingExpense(null);
        setIsFormOpen(false);
        fetchExpenses();
      }
    } catch (error) {
      console.error('Error updating expense:', error);
      showToast('Failed to update expense', 'error');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) {
      return;
    }

    try {
      const result = await expensesAPI.delete(id);
      if (result.success) {
        showToast('Expense deleted successfully', 'success');
        fetchExpenses();
      }
    } catch (error) {
      console.error('Error deleting expense:', error);
      showToast('Failed to delete expense', 'error');
    }
  };

  const handleEditClick = (expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleAddNewClick = () => {
    setEditingExpense(null);
    setIsFormOpen(true);
  };

  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  };

  const handleExport = async () => {
    try {
      const response = await expensesAPI.getAll({
        ...filters,
        limit: 1000
      });
      
      if (response.success) {
        const csvContent = convertToCSV(response.data.expenses);
        downloadCSV(csvContent, 'expenses.csv');
        showToast('Expenses exported successfully', 'success');
      }
    } catch (error) {
      console.error('Error exporting expenses:', error);
      showToast('Failed to export expenses', 'error');
    }
  };

  const convertToCSV = (expenses: Expense[]): string => {
    const headers = ['Date', 'Description', 'Amount', 'Currency', 'Category', 'Payment Method', 'Tags', 'Notes'];
    const rows = expenses.map(expense => [
      new Date(expense.date).toLocaleDateString(),
      expense.description,
      expense.amount,
      expense.currency,
      expense.category,
      expense.paymentMethod,
      expense.tags?.join(', ') || '',
      expense.notes || ''
    ]);
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Expense Tracking</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage and track all your expenses in one place
          </p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
              showFilters 
                ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300' 
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-slate-800 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:bg-slate-800 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          
          <button
            onClick={handleAddNewClick}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-6">
          <ExpenseFilters
            filters={filters}
            categories={categories}
            onFilterChange={handleFilterChange}
          />
        </div>
      )}

      {isFormOpen && (
        <div className="mb-6">
          <ExpenseForm
            expense={editingExpense}
            categories={categories}
            onSubmit={editingExpense ? 
              (data) => handleUpdateExpense(editingExpense.id, data) : 
              handleCreateExpense
            }
            onCancel={() => {
              setIsFormOpen(false);
              setEditingExpense(null);
            }}
          />
        </div>
      )}

      <ExpenseList
        expenses={expenses}
        categories={categories}
        pagination={pagination}
        onPageChange={handlePageChange}
        onEdit={handleEditClick}
        onDelete={handleDeleteExpense}
      />
    </div>
  );
};
