import React, { useState } from 'react';
import { X, DollarSign, Calendar, CheckCircle } from 'lucide-react';
import { Debt } from '../../services/debtApi';
import { formatCurrency } from '../../utils/formatters';

interface PaymentModalProps {
  debt: Debt;
  onClose: () => void;
  onSubmit: (data: {
    amount: number;
    paymentDate: string;
    isExtraPayment: boolean;
    notes: string;
  }) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ debt, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    amount: debt.minimumPayment,
    paymentDate: new Date().toISOString().split('T')[0],
    isExtraPayment: false,
    notes: ''
  });

  const minPayment = parseFloat(debt.minimumPayment);
  const currentBalance = parseFloat(debt.currentBalance);
  const amount = parseFloat(formData.amount) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      amount: parseFloat(formData.amount),
      paymentDate: formData.paymentDate,
      isExtraPayment: amount > minPayment,
      notes: formData.notes
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const presetAmounts = [
    minPayment,
    Math.min(currentBalance, minPayment * 2),
    Math.min(currentBalance, minPayment * 3),
    currentBalance
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Record Payment</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{debt.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Current Balance Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Current Balance</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatCurrency(currentBalance)}
              </span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Minimum Payment</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {formatCurrency(minPayment)}
              </span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Payment Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <DollarSign className="w-5 h-5" />
              </span>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                max={currentBalance}
                required
                className="w-full pl-12 pr-4 py-3 text-lg border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
              />
            </div>
            
            {/* Quick Amount Buttons */}
            <div className="flex gap-2 mt-2 flex-wrap">
              {presetAmounts.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, amount: preset.toString() }))}
                  className="px-3 py-1 text-sm bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                >
                  {preset === currentBalance ? 'Payoff' : formatCurrency(preset)}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Payment Date *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <Calendar className="w-5 h-5" />
              </span>
              <input
                type="date"
                name="paymentDate"
                value={formData.paymentDate}
                onChange={handleChange}
                required
                className="w-full pl-12 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
              />
            </div>
          </div>

          {/* Extra Payment Indicator */}
          {amount > minPayment && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-400">
                Extra payment of {formatCurrency(amount - minPayment)}! This will help you pay off faster.
              </span>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes (Optional)
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              placeholder="e.g., Confirmation number, payment method..."
              className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={amount <= 0 || amount > currentBalance}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentModal;
