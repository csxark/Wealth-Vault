import React, { useState, useEffect, useRef } from 'react';
import { X, Receipt, Calendar, CreditCard, MapPin, Tag, RotateCcw, Clock, Upload } from 'lucide-react';
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

  const [receiptData, setReceiptData] = useState<{
    file: File | null;
    preview: string | null;
    processed: boolean;
    extractedData: {
      amount: number;
      merchant: string;
      date: string;
      description: string;
      suggestedCategory: string;
    } | null;
  }>({
    file: null,
    preview: null,
    processed: false,
    extractedData: null
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Receipt upload handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        setReceiptData({
          file,
          preview: e.target?.result as string,
          processed: false,
          extractedData: null
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReceiptUpload = async () => {
    if (!receiptData.file) return;

    try {
      const formData = new FormData();
      formData.append('receipt', receiptData.file);

      const response = await fetch('/api/expenses/upload-receipt', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        setReceiptData(prev => ({
          ...prev,
          processed: true,
          extractedData: result.data
        }));

        // Auto-fill form with extracted data
        if (result.data) {
          setFormData(prev => ({
            ...prev,
            amount: result.data.amount?.toString() || prev.amount,
            description: result.data.description || prev.description,
            date: result.data.date ? new Date(result.data.date).toISOString().split('T')[0] : prev.date
          }));
        }
      } else {
        alert('Failed to process receipt. Please try again.');
      }
    } catch (error) {
      console.error('Error uploading receipt:', error);
      alert('Error processing receipt. Please try again.');
    }
  };

  const clearReceipt = () => {
    setReceiptData({
      file: null,
      preview: null,
      processed: false,
      extractedData: null
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
          {/* Receipt Upload Section */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center">
                <Receipt className="h-4 w-4 mr-2" />
                Receipt OCR (Optional)
              </h3>
              {receiptData.file && (
                <button
                  type="button"
                  onClick={clearReceipt}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Clear
                </button>
              )}
            </div>

            {!receiptData.file ? (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="receipt-upload"
                />
                <label
                  htmlFor="receipt-upload"
                  className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:border-cyan-500 dark:hover:border-cyan-400 transition-colors"
                >
                  <Upload className="h-6 w-6 text-slate-400 mb-2" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    Click to upload receipt image
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                    PNG, JPG up to 10MB
                  </span>
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <img
                    src={receiptData.preview || ''}
                    alt="Receipt preview"
                    className="w-16 h-16 object-cover rounded-lg border border-slate-300 dark:border-slate-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {receiptData.file.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(receiptData.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  {!receiptData.processed && (
                    <button
                      type="button"
                      onClick={handleReceiptUpload}
                      className="px-3 py-1 bg-cyan-600 text-white text-xs rounded hover:bg-cyan-500 transition-colors"
                    >
                      Process
                    </button>
                  )}
                </div>

                {receiptData.processed && receiptData.extractedData && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <div className="flex items-center mb-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                      <span className="text-sm font-medium text-green-800 dark:text-green-200">
                        OCR Complete
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-600 dark:text-slate-400">Amount:</span>
                        <span className="ml-1 font-medium">₹{receiptData.extractedData.amount}</span>
                      </div>
                      <div>
                        <span className="text-slate-600 dark:text-slate-400">Merchant:</span>
                        <span className="ml-1 font-medium">{receiptData.extractedData.merchant}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-600 dark:text-slate-400">Suggested Category:</span>
                        <span className="ml-1 font-medium">{receiptData.extractedData.suggestedCategory}</span>
                      </div>
                    </div>
                  </div>
                )}

                {receiptData.processed && !receiptData.extractedData && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
                      <span className="text-sm text-yellow-800 dark:text-yellow-200">
                        Could not extract data from receipt. Please fill manually.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

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
