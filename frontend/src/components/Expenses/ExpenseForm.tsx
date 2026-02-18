import React, { useState, useEffect } from 'react';
import { Expense, Category } from '../../types';
import { X, Calendar, DollarSign, Tag, FileText, CreditCard, MapPin, Calculator, Receipt } from 'lucide-react';
import { taxApi, TaxCategory } from '../../services/taxApi';


interface ExpenseFormProps {
  expense: Expense | null;
  categories: Category[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({
  expense,
  categories,
  onSubmit,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    currency: 'USD',
    categoryId: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    location: '',
    tags: '',
    notes: '',
    isRecurring: false,
    isTaxDeductible: false,
    taxCategoryId: '',
    taxNotes: ''
  });

  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);


  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchTaxCategories();
  }, []);

  useEffect(() => {
    if (expense) {
      setFormData({
        description: expense.description || '',
        amount: expense.amount?.toString() || '',
        currency: expense.currency || 'USD',
        categoryId: expense.category || '',
        date: expense.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        paymentMethod: expense.paymentMethod || 'cash',
        location: expense.location?.name || '',
        tags: expense.tags?.join(', ') || '',
        notes: expense.notes || '',
        isRecurring: expense.isRecurring || false,
        isTaxDeductible: (expense as any).isTaxDeductible || false,
        taxCategoryId: (expense as any).taxCategoryId || '',
        taxNotes: (expense as any).taxNotes || ''
      });
    }
  }, [expense]);

  const fetchTaxCategories = async () => {
    try {
      const result = await taxApi.getTaxCategories({ activeOnly: true });
      if (result.success) {
        setTaxCategories(result.data);
      }
    } catch (error) {
      console.error('Error fetching tax categories:', error);
    }
  };


  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Valid amount is required';
    }
    
    if (!formData.categoryId) {
      newErrors.categoryId = 'Category is required';
    }
    
    if (!formData.date) {
      newErrors.date = 'Date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    const submitData: any = {
      description: formData.description,
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      categoryId: formData.categoryId,
      date: new Date(formData.date).toISOString(),
      paymentMethod: formData.paymentMethod,
      location: formData.location ? { name: formData.location } : undefined,
      tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
      notes: formData.notes,
      isRecurring: formData.isRecurring
    };

    // Add tax-related fields if marked as deductible
    if (formData.isTaxDeductible) {
      submitData.isTaxDeductible = true;
      submitData.taxCategoryId = formData.taxCategoryId || null;
      submitData.taxYear = new Date(formData.date).getFullYear();
      submitData.taxNotes = formData.taxNotes || null;
    }


    onSubmit(submitData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
    
    // Clear error when field is edited
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const paymentMethods = [
    { value: 'cash', label: 'Cash' },
    { value: 'card', label: 'Credit/Debit Card' },
    { value: 'upi', label: 'UPI' },
    { value: 'netbanking', label: 'Net Banking' },
    { value: 'wallet', label: 'Digital Wallet' },
    { value: 'other', label: 'Other' }
  ];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {expense ? 'Edit Expense' : 'Add New Expense'}
        </h2>
        <button
          onClick={onCancel}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <FileText className="inline h-4 w-4 mr-2" />
            Description *
          </label>
          <input
            type="text"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="What did you spend on?"
            className={`w-full px-4 py-2 rounded-lg border ${
              errors.description 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                : 'border-gray-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-200'
            } bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-opacity-50 transition-colors`}
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description}</p>
          )}
        </div>

        {/* Amount and Currency */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <DollarSign className="inline h-4 w-4 mr-2" />
              Amount *
            </label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0"
              className={`w-full px-4 py-2 rounded-lg border ${
                errors.amount 
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                  : 'border-gray-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-200'
              } bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-opacity-50 transition-colors`}
            />
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Currency
            </label>
            <select
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:ring-opacity-50 transition-colors"
            >
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
              <option value="INR">INR - Indian Rupee</option>
              <option value="JPY">JPY - Japanese Yen</option>
              <option value="CAD">CAD - Canadian Dollar</option>
              <option value="AUD">AUD - Australian Dollar</option>
            </select>
          </div>
        </div>

        {/* Category and Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Tag className="inline h-4 w-4 mr-2" />
              Category *
            </label>
            <select
              name="categoryId"
              value={formData.categoryId}
              onChange={handleChange}
              className={`w-full px-4 py-2 rounded-lg border ${
                errors.categoryId 
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                  : 'border-gray-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-200'
              } bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-opacity-50 transition-colors`}
            >
              <option value="">Select a category</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p className="mt-1 text-sm text-red-600">{errors.categoryId}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Calendar className="inline h-4 w-4 mr-2" />
              Date *
            </label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className={`w-full px-4 py-2 rounded-lg border ${
                errors.date 
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                  : 'border-gray-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-200'
              } bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-opacity-50 transition-colors`}
            />
            {errors.date && (
              <p className="mt-1 text-sm text-red-600">{errors.date}</p>
            )}
          </div>
        </div>

        {/* Payment Method and Location */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <CreditCard className="inline h-4 w-4 mr-2" />
              Payment Method
            </label>
            <select
              name="paymentMethod"
              value={formData.paymentMethod}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:ring-opacity-50 transition-colors"
            >
              {paymentMethods.map(method => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <MapPin className="inline h-4 w-4 mr-2" />
              Location
            </label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="Where was this expense made?"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:ring-opacity-50 transition-colors"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tags
          </label>
          <input
            type="text"
            name="tags"
            value={formData.tags}
            onChange={handleChange}
            placeholder="Enter tags separated by commas (e.g., food, dinner, friends)"
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:ring-opacity-50 transition-colors"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Notes
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            placeholder="Add any additional notes about this expense..."
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:ring-opacity-50 transition-colors resize-none"
          />
        </div>

        {/* Recurring Checkbox */}
        <div className="flex items-center">
          <input
            type="checkbox"
            name="isRecurring"
            checked={formData.isRecurring}
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
            This is a recurring expense
          </label>
        </div>

        {/* Tax Deductible Section */}
        <div className="border-t border-gray-200 dark:border-slate-700 pt-6 mt-6">
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              name="isTaxDeductible"
              checked={formData.isTaxDeductible}
              onChange={handleChange}
              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
            />
            <label className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              <Receipt className="inline h-4 w-4 mr-1" />
              This expense is tax deductible
            </label>
          </div>

          {formData.isTaxDeductible && (
            <div className="space-y-4 pl-6 border-l-2 border-green-200 dark:border-green-800">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calculator className="inline h-4 w-4 mr-2" />
                  Tax Category
                </label>
                <select
                  name="taxCategoryId"
                  value={formData.taxCategoryId}
                  onChange={handleChange}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:ring-opacity-50 transition-colors"
                >
                  <option value="">Select a tax category</option>
                  {taxCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.code} - {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tax Notes
                </label>
                <textarea
                  name="taxNotes"
                  value={formData.taxNotes}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Add any tax-related notes (e.g., receipt number, business purpose)..."
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:ring-opacity-50 transition-colors resize-none"
                />
              </div>
            </div>
          )}
        </div>


        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {expense ? 'Update Expense' : 'Add Expense'}
          </button>
        </div>
      </form>
    </div>
  );
};
