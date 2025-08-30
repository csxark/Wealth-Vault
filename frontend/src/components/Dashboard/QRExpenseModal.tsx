import React, { useState } from 'react';
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Add Expense</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {!scannedData ? (
          <>
            <p className="mb-4 text-gray-600">
              Scan a UPI QR code to auto-fill merchant details
            </p>
            <QRScanner
              onScanSuccess={handleScanSuccess}
              onScanError={handleScanError}
            />
            <button
              onClick={() => setScannedData({ pa: '', pn: '' })}
              className="mt-4 w-full bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 transition"
            >
              Skip QR Scan
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {scannedData.pn && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Merchant
                </label>
                <p className="mt-1 text-gray-900">{scannedData.pn}</p>
              </div>
            )}

            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
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
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700">
                Category
              </label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as Category })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <input
                type="text"
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                className="flex-1 bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 transition"
              >
                {scannedData.pa ? 'Pay & Save' : 'Save Expense'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded shadow hover:bg-gray-400 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default QRExpenseModal;
