import React, { useState, useEffect } from 'react';
import { expensesAPI, categoriesAPI } from '../../services/api';
import { useLoading } from '../../context/LoadingContext';
import { useToast } from '../../context/ToastContext';
import type { UPIData } from './QRScanner';

interface PaymentFormProps {
  upiData: UPIData;
  onPaymentSubmit: () => void;
  onCancel: () => void;
}

export interface PaymentFormData {
  amount: string;
  category: string;
  description?: string;
}

interface Category {
  _id: string;
  name: string;
  color: string;
  icon: string;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ upiData, onPaymentSubmit, onCancel }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<PaymentFormData>({
    amount: '',
    category: '',
    description: '',
  });

  const { withLoading } = useLoading();
  const { showToast } = useToast();

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await withLoading(categoriesAPI.getAll(), 'Loading categories...');
        setCategories(response.data.categories);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    // 1. Find the category ID from the backend
    let categoryId = '';
    try {
      const catRes = await withLoading(categoriesAPI.getAll(), 'Finding category...');
      const categories = catRes.data.categories;
      const found = categories.find((cat: Category) => cat.name === formData.category);
      if (!found) {
        showToast('Selected category not found. Please try again.', 'error');
        return;
      }
      categoryId = found._id;
    } catch {
      showToast('Failed to fetch categories. Please try again.', 'error');
      return;
    }

    // 2. Prepare expense data for backend
    const expensePayload = {
      amount: parseFloat(formData.amount),
      description: formData.description || '',
      category: categoryId,
      paymentMethod: 'digital_wallet',
      currency: 'INR',
      date: new Date().toISOString(),
      isRecurring: false,
      status: 'completed',
    };

    try {
      await withLoading(expensesAPI.create(expensePayload), 'Saving expense...');
      showToast('Payment recorded successfully!', 'success');
    } catch {
      showToast('Failed to save payment. Please try again.', 'error');
      return;
    }

    // Continue with UPI logic
    const upiUrl = generateUPIUrl(upiData, formData);
    const upiApps = [
      { name: 'GPay', scheme: 'tez' },
      { name: 'PhonePe', scheme: 'phonepe' },
      { name: 'Paytm', scheme: 'paytmmp' },
      { name: 'BHIM', scheme: 'upi' }
    ];
    const tryOpenApp = (url: string, scheme: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const startTime = Date.now();
        const link = document.createElement('a');
        
        // For mobile devices
        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          link.href = url;
        } else {
          // For desktop, try to use intent:// URL for better compatibility
          const intentUrl = `intent:${url}#Intent;scheme=${scheme};package=com.${scheme}.android;end;`;
          link.href = intentUrl;
        }
        
        const onBlurHandler = () => {
          window.removeEventListener('blur', onBlurHandler);
          resolve(true);
        };
        
        window.addEventListener('blur', onBlurHandler);
        
        setTimeout(() => {
          window.removeEventListener('blur', onBlurHandler);
          if (document.hidden || Date.now() - startTime > 2000) {
            resolve(true);
          } else {
            resolve(false);
          }
        }, 1500);
        
        link.click();
      });
    };
    let opened = false;
    for (const app of upiApps) {
      const appUrl = `${app.scheme}://${upiUrl.substring(4)}`;
      opened = await tryOpenApp(appUrl, app.scheme);
      if (opened) break;
    }
    if (!opened) {
      // If no app could be opened, show a fallback
      const fallbackMessage = `No UPI app found. Please use one of these apps: ${upiApps.map(app => app.name).join(', ')}`;
      alert(fallbackMessage);
      
      // Create a QR code or copyable text for manual handling
      const upiDetails = document.createElement('div');
      upiDetails.innerHTML = `
        <div style="padding: 16px; background: #f5f5f5; border-radius: 8px; margin-top: 16px;">
          <p>UPI Details:</p>
          <p>UPI ID: ${upiData.pa}</p>
          <p>Name: ${upiData.pn}</p>
          <p>Amount: ₹${formData.amount}</p>
          <button onclick="navigator.clipboard.writeText('${upiData.pa}')">Copy UPI ID</button>
        </div>
      `;
      document.body.appendChild(upiDetails);
    }
    onPaymentSubmit();
  };

  const generateUPIUrl = (upiData: UPIData, formData: PaymentFormData): string => {
    const params = new URLSearchParams();

    params.append('pa', upiData.pa);
    params.append('pn', encodeURIComponent(upiData.pn));
    params.append('am', formData.amount);
    params.append('cu', upiData.cu || 'INR');

    if (upiData.mc) {
      params.append('mc', upiData.mc);
    }

    const tn = formData.description 
      ? `${formData.category}: ${formData.description}`
      : formData.category;
    params.append('tn', encodeURIComponent(tn));

    params.append('mode', '00');
    params.append('purpose', '00');

    return `upi://pay?${params.toString()}`;
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-lg mx-auto p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-lg space-y-6 sm:px-10 sm:py-8"
      noValidate
      autoComplete="off"
    >
      <div>
        <h2 className="text-2xl font-semibold text-cyan-700 dark:text-cyan-400 mb-5 text-center sm:text-left">
          Payment Details
        </h2>

        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Merchant</label>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{upiData.pn}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">UPI ID</label>
            <p className="text-lg font-mono font-semibold text-gray-900 dark:text-gray-100 break-words">{upiData.pa}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="amount"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Amount (₹)
          </label>
          <input
            id="amount"
            type="number"
            required
            min="1"
            step="0.01"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            className="mt-1 block w-full rounded-xl border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900 text-cyan-900 dark:text-cyan-200 shadow-sm placeholder-cyan-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-50 transition"
            placeholder="Enter amount"
          />
        </div>

        <div>
          <label
            htmlFor="category"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Category
          </label>
          <select
            id="category"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="mt-1 block w-full rounded-xl border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900 text-cyan-900 dark:text-cyan-200 shadow-sm placeholder-cyan-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-50 transition"
          >
            {loading ? (
              <option value="">Loading categories...</option>
            ) : categories.length > 0 ? (
              categories.map((category) => (
                <option key={category._id} value={category.name}>
                  {category.name}
                </option>
              ))
            ) : (
              <option value="">No categories available</option>
            )}
          </select>
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Description (Optional)
          </label>
          <input
            id="description"
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="mt-1 block w-full rounded-xl border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900 text-cyan-900 dark:text-cyan-200 shadow-sm placeholder-cyan-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-50 transition"
            placeholder="Add a note for this transaction"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:justify-end pt-6 border-t border-cyan-200 dark:border-cyan-700">
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto px-6 py-2 rounded-xl border border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-800 transition font-semibold"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="w-full sm:w-auto px-6 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-700 hover:to-blue-700 focus:ring-4 focus:ring-cyan-400 focus:ring-opacity-50 transition font-semibold"
        >
          Pay Now
        </button>
      </div>
    </form>
  );
};

export default PaymentForm;
