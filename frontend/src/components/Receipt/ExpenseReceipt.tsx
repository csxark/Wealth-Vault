import React from 'react';
import { QRCodeGenerator } from '../Payment/QRCodeGenerator';
import { Receipt, Calendar, CreditCard, MapPin, Tag } from 'lucide-react';
import type { Expense } from '../../types';

interface ExpenseReceiptProps {
  expense: Expense;
  onClose: () => void;
}

export const ExpenseReceipt: React.FC<ExpenseReceiptProps> = ({ expense, onClose }) => {
  // Generate QR code data for the expense
  const generateQRData = (expense: Expense): string => {
    const qrData = {
      type: 'expense',
      id: expense.id,
      amount: Math.abs(expense.amount),
      currency: expense.currency,
      description: expense.description,
      category: expense.category,
      date: expense.date,
      paymentMethod: expense.paymentMethod,
      merchant: expense.receipt?.ocrData?.merchant || 'N/A',
      location: expense.location?.name || 'N/A',
      tags: expense.tags?.join(', ') || 'N/A',
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(qrData);
  };

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const qrData = generateQRData(expense);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Receipt className="h-8 w-8" />
              <div>
                <h2 className="text-xl font-bold">Expense Receipt</h2>
                <p className="text-cyan-100 text-sm">Transaction Details</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="p-6 space-y-4">
          {/* Amount */}
          <div className="text-center py-4">
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {formatAmount(Math.abs(expense.amount))}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {expense.currency}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <Receipt className="h-5 w-5 text-cyan-600" />
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Description</div>
                <div className="font-medium text-slate-900 dark:text-white">{expense.description}</div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="h-5 w-5 rounded-full bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center">
                <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">
                  {expense.category.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Category</div>
                <div className="font-medium text-slate-900 dark:text-white capitalize">{expense.category}</div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Calendar className="h-5 w-5 text-cyan-600" />
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Date</div>
                <div className="font-medium text-slate-900 dark:text-white">
                  {new Date(expense.date).toLocaleDateString('en-IN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <CreditCard className="h-5 w-5 text-cyan-600" />
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Payment Method</div>
                <div className="font-medium text-slate-900 dark:text-white capitalize">
                  {expense.paymentMethod}
                </div>
              </div>
            </div>

            {expense.location?.name && (
              <div className="flex items-center space-x-3">
                <MapPin className="h-5 w-5 text-cyan-600" />
                <div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Location</div>
                  <div className="font-medium text-slate-900 dark:text-white">{expense.location.name}</div>
                </div>
              </div>
            )}

            {expense.tags && expense.tags.length > 0 && (
              <div className="flex items-center space-x-3">
                <Tag className="h-5 w-5 text-cyan-600" />
                <div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Tags</div>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {expense.tags.join(', ')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* QR Code */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Digital Receipt QR Code
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Scan to verify and store digitally
              </p>
            </div>
            <div className="flex justify-center">
              <QRCodeGenerator
                data={qrData}
                size={150}
                className="border border-slate-200 dark:border-slate-700 rounded-lg p-2"
              />
            </div>
            <p className="text-xs text-center text-slate-500 dark:text-slate-500 mt-2">
              ID: {expense.id}
            </p>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              onClick={() => window.print()}
              className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Print Receipt
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};