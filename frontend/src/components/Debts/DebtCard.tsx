import React from 'react';
import { 
  CreditCard, 
  GraduationCap, 
  Car, 
  Home, 
  Wallet, 
  Heart, 
  MoreHorizontal,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Calendar
} from 'lucide-react';
import { Debt } from '../../services/debtApi';
import { formatCurrency, formatDate, formatPercentage } from '../../utils/formatters';

interface DebtCardProps {
  debt: Debt;
  onEdit: (debt: Debt) => void;
  onDelete: (debtId: string) => void;
  onPayment: (debt: Debt) => void;
}

const debtTypeIcons: Record<string, React.ReactNode> = {
  credit_card: <CreditCard className="w-5 h-5" />,
  student_loan: <GraduationCap className="w-5 h-5" />,
  car_loan: <Car className="w-5 h-5" />,
  mortgage: <Home className="w-5 h-5" />,
  personal_loan: <Wallet className="w-5 h-5" />,
  medical: <Heart className="w-5 h-5" />,
  other: <MoreHorizontal className="w-5 h-5" />
};

const debtTypeLabels: Record<string, string> = {
  credit_card: 'Credit Card',
  student_loan: 'Student Loan',
  car_loan: 'Car Loan',
  mortgage: 'Mortgage',
  personal_loan: 'Personal Loan',
  medical: 'Medical Debt',
  other: 'Other'
};

const DebtCard: React.FC<DebtCardProps> = ({ debt, onEdit, onDelete, onPayment }) => {
  const progress = ((parseFloat(debt.originalBalance) - parseFloat(debt.currentBalance)) / parseFloat(debt.originalBalance)) * 100;
  const isPaidOff = debt.status === 'paid_off';
  
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden ${isPaidOff ? 'opacity-75' : ''}`}>
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isPaidOff ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'} dark:bg-opacity-20`}>
              {debtTypeIcons[debt.type] || debtTypeIcons.other}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{debt.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {debt.lender || debtTypeLabels[debt.type] || 'Debt'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {debt.isPriority && !isPaidOff && (
              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full dark:bg-red-900/30 dark:text-red-400">
                Priority
              </span>
            )}
            {isPaidOff ? (
              <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle className="w-3 h-3" />
                Paid Off
              </span>
            ) : (
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                debt.interestRate > 15 
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                  : debt.interestRate > 8
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}>
                {formatPercentage(debt.interestRate)} APR
              </span>
            )}
          </div>
        </div>

        {/* Balance Info */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Current Balance</p>
            <p className={`text-xl font-bold ${isPaidOff ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
              {formatCurrency(parseFloat(debt.currentBalance))}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Original Balance</p>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
              {formatCurrency(parseFloat(debt.originalBalance))}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">Progress</span>
            <span className="font-medium text-gray-900 dark:text-white">{progress.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${isPaidOff ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        {/* Additional Info */}
        {!isPaidOff && (
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Calendar className="w-4 h-4" />
              <span>Min: {formatCurrency(parseFloat(debt.minimumPayment))}/mo</span>
            </div>
            {debt.estimatedPayoffDate && (
              <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                <TrendingDown className="w-4 h-4" />
                <span>Payoff: {formatDate(debt.estimatedPayoffDate)}</span>
              </div>
            )}
          </div>
        )}

        {/* Payment Stats */}
        {debt.metadata && (debt.metadata.totalPaid > 0 || debt.metadata.paymentCount > 0) && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                {debt.metadata.paymentCount} payment{debt.metadata.paymentCount !== 1 ? 's' : ''} made
              </span>
              <span className="text-gray-700 dark:text-gray-300">
                Total paid: {formatCurrency(debt.metadata.totalPaid)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {!isPaidOff && (
        <div className="px-5 py-3 bg-gray-50 dark:bg-slate-700/50 border-t border-gray-100 dark:border-slate-700 flex gap-2">
          <button
            onClick={() => onPayment(debt)}
            className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Record Payment
          </button>
          <button
            onClick={() => onEdit(debt)}
            className="px-4 py-2 bg-white dark:bg-slate-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg border border-gray-200 dark:border-slate-500 hover:bg-gray-50 dark:hover:bg-slate-500 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(debt.id)}
            className="px-4 py-2 bg-white dark:bg-slate-600 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg border border-gray-200 dark:border-slate-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

export default DebtCard;
