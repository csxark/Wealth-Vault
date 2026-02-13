import React, { useState } from 'react';
import { X, Calendar, Sparkles, TrendingUp, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Bill, PaymentSuggestion, billApi } from '../../services/billApi';
import { formatCurrency, formatDate, daysUntil } from '../../utils/formatters';

interface PaymentSchedulerProps {
  bill: Bill;
  suggestions?: PaymentSuggestion;
  onClose: () => void;
  onSchedule: () => void;
}

const PaymentScheduler: React.FC<PaymentSchedulerProps> = ({ 
  bill, 
  suggestions, 
  onClose, 
  onSchedule 
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    suggestions?.suggestedPaymentDate || bill.dueDate
  );
  const [loading, setLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const handleSchedule = async () => {
    try {
      setLoading(true);
      await billApi.schedulePayment(bill.id, selectedDate);
      onSchedule();
      onClose();
    } catch (error) {
      console.error('Error scheduling payment:', error);
    } finally {
      setLoading(false);
    }
  };

  const daysLeft = daysUntil(bill.dueDate);
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const selectedDaysUntil = daysUntil(selectedDate);

  const getCashFlowColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'tight': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Schedule Payment</h2>
              <p className="text-sm text-gray-500">{bill.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Close"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Bill Summary */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Amount Due</span>
              <span className="text-2xl font-bold text-gray-900">
                {formatCurrency(parseFloat(bill.amount), bill.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Due Date</span>
              <span className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                {formatDate(bill.dueDate)} {isOverdue && '(Overdue)'}
              </span>
            </div>
          </div>

          {/* Smart Suggestion */}
          {suggestions && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 mb-6 border border-green-100">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-gray-900">AI-Powered Suggestion</h3>
                <span className={`ml-auto px-2 py-1 rounded-full text-xs font-medium ${getCashFlowColor(suggestions.cashFlowStatus)}`}>
                  {suggestions.cashFlowStatus === 'healthy' ? 'Healthy Cash Flow' : 
                   suggestions.cashFlowStatus === 'tight' ? 'Tight Cash Flow' : 'Unknown'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="bg-white rounded-lg p-3">
                  <p className="text-sm text-gray-500 mb-1">Suggested Date</p>
                  <p className="text-lg font-semibold text-green-700">
                    {formatDate(suggestions.suggestedPaymentDate)}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-sm text-gray-500 mb-1">Days Until Due</p>
                  <p className="text-lg font-semibold text-gray-700">
                    {suggestions.daysUntilDue} days
                  </p>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 bg-white/50 rounded-lg p-3">
                <TrendingUp className="w-4 h-4 inline mr-1 text-green-600" />
                {suggestions.reasoning}
              </p>

              {suggestions.alternativeDates.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-gray-600 mb-2">Alternative dates:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.alternativeDates.slice(0, 3).map((date, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedDate(date)}
                        className="px-3 py-1 bg-white text-sm text-gray-700 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        {formatDate(date)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Date Picker */}
          <div className="mb-6">
            <label htmlFor="paymentDate" className="block text-sm font-medium text-gray-700 mb-2">
              Select Payment Date
            </label>
            <input
              id="paymentDate"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              aria-label="Select payment date"
            />

            
            {selectedDaysUntil !== null && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                {selectedDaysUntil < 0 ? (
                  <span className="text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    This date is {Math.abs(selectedDaysUntil)} days overdue
                  </span>
                ) : selectedDaysUntil === 0 ? (
                  <span className="text-blue-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Paying today
                  </span>
                ) : (
                  <span className="text-gray-600">
                    {selectedDaysUntil} days before due date
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Cash Flow Warning */}
          {suggestions?.cashFlowStatus === 'tight' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-800">Cash Flow Warning</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    Your cash flow is tight around the suggested payment date. Consider:
                  </p>
                  <ul className="text-sm text-yellow-700 mt-2 list-disc list-inside">
                    <li>Paying closer to the due date</li>
                    <li>Using an alternative payment method</li>
                    <li>Setting up a payment plan if available</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSchedule}
              disabled={loading || !selectedDate}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Schedule Payment
                </>
              )}
            </button>
          </div>

          {/* Enable Smart Schedule Toggle */}
          {!bill.smartScheduleEnabled && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <input
                  id="enableSmartSchedule"
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="enableSmartSchedule" className="cursor-pointer">
                  <span className="text-sm font-medium text-gray-700">Enable Smart Scheduling for this bill</span>
                  <p className="text-xs text-gray-500">
                    Get AI-powered payment date suggestions based on your cash flow
                  </p>
                </label>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default PaymentScheduler;
