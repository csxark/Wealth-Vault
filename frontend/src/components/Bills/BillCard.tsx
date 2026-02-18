import React from 'react';
import { 
  Calendar, 
  CreditCard, 
  Bell, 
  Sparkles, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  MoreVertical,
  Trash2,
  Edit
} from 'lucide-react';
import { Bill } from '../../services/billApi';
import { formatCurrency, formatDate, formatDaysUntil, getStatusColor } from '../../utils/formatters';

interface BillCardProps {
  bill: Bill;
  onPay: () => void;
  onSchedule: () => void;
  onToggleSmartSchedule: (enabled: boolean) => void;
}

const BillCard: React.FC<BillCardProps> = ({ 
  bill, 
  onPay, 
  onSchedule, 
  onToggleSmartSchedule 
}) => {
  const daysLeft = formatDaysUntil(bill.dueDate);
  const isOverdue = daysLeft.includes('overdue');
  const isDueSoon = !isOverdue && daysLeft !== '-' && parseInt(daysLeft) <= 3;

  return (
    <div className={`bg-white rounded-xl shadow-sm border-2 transition-all hover:shadow-md ${
      isOverdue ? 'border-red-200' : isDueSoon ? 'border-yellow-200' : 'border-transparent'
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 truncate">{bill.name}</h3>
              {bill.smartScheduleEnabled && (
                <span title="Smart scheduling enabled">
                  <Sparkles className="w-4 h-4 text-green-500" />
                </span>
              )}

              {bill.autoPay && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                  Auto-pay
                </span>
              )}
            </div>
            {bill.payee && (
              <p className="text-sm text-gray-500 mt-0.5">{bill.payee}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button 
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              title="Edit bill"
              aria-label="Edit bill"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button 
              className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
              title="Delete bill"
              aria-label="Delete bill"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

      {/* Amount and Status */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(bill.amount, bill.currency)}
            </p>
            <p className="text-sm text-gray-500">
              {bill.frequency !== 'one_time' ? `${bill.frequency} payment` : 'One-time payment'}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(bill.status)}`}>
            {bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
          </span>
        </div>

        {/* Due Date */}
        <div className="flex items-center gap-2 mb-4">
          <Calendar className={`w-4 h-4 ${isOverdue ? 'text-red-500' : isDueSoon ? 'text-yellow-500' : 'text-gray-400'}`} />
          <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : isDueSoon ? 'text-yellow-600 font-medium' : 'text-gray-600'}`}>
            Due {formatDate(bill.dueDate)} ({daysLeft})
          </span>
        </div>

        {/* Smart Schedule Info */}
        {bill.smartScheduleEnabled && bill.optimalPaymentDate && (
          <div className="bg-green-50 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Smart Suggestion</span>
            </div>
            <p className="text-sm text-green-700">
              Pay on {formatDate(bill.optimalPaymentDate)} for optimal cash flow
            </p>
          </div>
        )}

        {/* Category */}
        {bill.category && (
          <div className="flex items-center gap-2 mb-4">
            <span 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: bill.category.color || '#6B7280' }}
            />
            <span className="text-sm text-gray-600">{bill.category.name}</span>
          </div>
        )}

        {/* Reminder Settings */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Bell className="w-4 h-4" />
          <span>Reminder {bill.reminderDays} days before</span>
        </div>

        {/* Payment Method */}
        {bill.paymentMethod && bill.paymentMethod !== 'other' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <CreditCard className="w-4 h-4" />
            <span className="capitalize">{bill.paymentMethod.replace('_', ' ')}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {bill.status === 'pending' || bill.status === 'overdue' ? (
            <>
              <button
                onClick={onPay}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Pay Now
              </button>
              <button
                onClick={onSchedule}
                className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                Schedule
              </button>
            </>
          ) : bill.status === 'scheduled' ? (
            <div className="flex-1 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg text-center">
              <Clock className="w-4 h-4 inline mr-1" />
              Scheduled for {formatDate(bill.scheduledPaymentDate)}
            </div>
          ) : (
            <div className="flex-1 py-2 bg-green-50 text-green-700 text-sm font-medium rounded-lg text-center">
              <CheckCircle className="w-4 h-4 inline mr-1" />
              Paid on {formatDate(bill.lastPaidDate)}
            </div>
          )}
        </div>

        {/* Smart Schedule Toggle */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-600">Smart Scheduling</span>
            <button
              onClick={() => onToggleSmartSchedule(!bill.smartScheduleEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                bill.smartScheduleEnabled ? 'bg-green-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  bill.smartScheduleEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
          <p className="text-xs text-gray-500 mt-1">
            {bill.smartScheduleEnabled 
              ? 'AI will suggest optimal payment dates based on your cash flow' 
              : 'Enable to get AI-powered payment date suggestions'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BillCard;
