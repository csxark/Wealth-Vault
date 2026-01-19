import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import QRScanner, { UPIData } from '../Payment/QRScanner';

interface QRExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseAdd: (expense: {
    amount: number;
    category: string;
    description?: string;
    merchantName?: string;
    upiId?: string;
  }) => void;
}

const CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Bills',
  'Entertainment',
  'Health',
  'Others'
] as const;

type Category = typeof CATEGORIES[number];

interface ExpenseFormData {
  amount: string;
  category: Category;
  description: string;
}

const QRExpenseModal: React.FC<QRExpenseModalProps> = ({
  isOpen,
  onClose,
  onExpenseAdd,
}) => {
  const [scannedData, setScannedData] = useState<UPIData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ExpenseFormData>({
    amount: '',
    category: 'Others',
    description: '',
  });

  const handleScanSuccess = (data: UPIData) => {
    setScannedData(data);
    setError(null);
    // If amount is provided in QR, set it
    if (data.am) {
      setFormData(prev => ({ ...prev, amount: data.am || '' }));
    }
  };

  const handleScanError = (error: string) => {
    setError(error);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    // Create expense object
    const expense = {
      amount,
      category: formData.category,
      description: formData.description,
      merchantName: scannedData?.pn,
      upiId: scannedData?.pa,
    };

    // Submit expense
    onExpenseAdd(expense);

    // Generate and open UPI payment link if QR was scanned
    if (scannedData) {
      const params = new URLSearchParams();
      params.append('pa', scannedData.pa);
      params.append('pn', scannedData.pn);
      params.append('am', formData.amount);
      params.append('cu', 'INR');
      params.append('tn', `${formData.category}: ${formData.description}`);

      const upiUrl = `upi://pay?${params.toString()}`;
      window.location.href = upiUrl;
    }

    // Close modal
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4" 
      style={{ 
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)'
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 relative border border-slate-200 dark:border-slate-800 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Add Expense</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {!scannedData ? (
          <>
            <p className="mb-4 text-gray-600 dark:text-slate-400">
              Scan a UPI QR code to auto-fill merchant details
            </p>
            <QRScanner
              onScanSuccess={handleScanSuccess}
              onScanError={handleScanError}
            />
            <button
              onClick={() => setScannedData({ pa: '', pn: '' })}
              className="mt-4 w-full bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition"
            >
              Skip QR Scan
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {scannedData.pn && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Merchant
                </label>
                <p className="mt-1 text-gray-900 dark:text-white font-medium">{scannedData.pn}</p>
              </div>
            )}

            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                Amount (₹)
              </label>
              <input
                type="number"
                id="amount"
                required
                min="1"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="mt-1 block w-full rounded-lg border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 px-4 py-2"
              />
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                Category
              </label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as Category })}
                className="mt-1 block w-full rounded-lg border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 px-4 py-2"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                Description
              </label>
              <input
                type="text"
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 block w-full rounded-lg border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 px-4 py-2"
              />
            </div>

            <div className="flex space-x-4 pt-2">
              <button
                type="submit"
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-4 py-2.5 rounded-lg shadow-lg hover:shadow-xl hover:from-cyan-600 hover:to-blue-700 transition-all font-semibold"
              >
                {scannedData.pa ? 'Pay & Save' : 'Save Expense'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300 px-4 py-2.5 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-700 transition font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default QRExpenseModal;
