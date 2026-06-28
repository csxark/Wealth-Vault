import React from 'react';
import { X, TrendingDown, DollarSign, Calendar, Target } from 'lucide-react';
import { PayoffStrategy } from '../../services/debtApi';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface PayoffTimelineProps {
  strategy: PayoffStrategy;
  onClose: () => void;
}

const PayoffTimeline: React.FC<PayoffTimelineProps> = ({ strategy, onClose }) => {
  // Use strategy properties
  const { payoffDate, monthsToPayoff, totalInterest, totalPayments, simulation, payoffOrder, monthlyPayment } = strategy;
  
  const formatMonths = (months: number) => {

    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (years === 0) return `${remainingMonths}mo`;
    if (remainingMonths === 0) return `${years}y`;
    return `${years}y ${remainingMonths}mo`;
  };

  // Calculate chart data
  const maxBalance = Math.max(...strategy.simulation.map(s => s.totalBalance));
  const chartHeight = 200;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Payoff Timeline</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Visualize your journey to debt freedom
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Payoff Date</span>
              </div>
              <p className="font-bold text-gray-900 dark:text-white">{formatDate(payoffDate)}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Time to Payoff</span>
              </div>
              <p className="font-bold text-gray-900 dark:text-white">{formatMonths(monthsToPayoff)}</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Interest</span>
              </div>
              <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(totalInterest)}</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Payments</span>
              </div>
              <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(totalPayments)}</p>
            </div>

          </div>

          {/* Balance Chart */}
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Balance Over Time</h4>
            <div className="relative h-64">
              {/* Y-axis labels */}
              <div className="absolute left-0 top-0 bottom-8 w-16 flex flex-col justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{formatCurrency(maxBalance)}</span>
                <span>{formatCurrency(maxBalance * 0.5)}</span>
                <span>$0</span>
              </div>
              
              {/* Chart area */}
              <div className="absolute left-20 right-4 top-0 bottom-8">
                <svg className="w-full h-full" viewBox={`0 0 ${strategy.simulation.length} ${chartHeight}`} preserveAspectRatio="none">
                  {/* Grid lines */}
                  {[0, 0.5, 1].map((ratio, i) => (
                    <line
                      key={i}
                      x1="0"
                      y1={chartHeight * ratio}
                      x2={simulation.length}
                      y2={chartHeight * ratio}
                      stroke="currentColor"
                      strokeWidth="0.5"
                      className="text-gray-200 dark:text-slate-600"
                    />
                  ))}
                  
                  {/* Balance line */}
                  <path
                    d={`M 0 ${chartHeight - (simulation[0].totalBalance / maxBalance) * chartHeight} ${simulation.map((point, i) => `L ${i} ${chartHeight - (point.totalBalance / maxBalance) * chartHeight}`).join(' ')}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-blue-500"
                  />
                  
                  {/* Area under curve */}
                  <path
                    d={`M 0 ${chartHeight} L 0 ${chartHeight - (simulation[0].totalBalance / maxBalance) * chartHeight} ${simulation.map((point, i) => `L ${i} ${chartHeight - (point.totalBalance / maxBalance) * chartHeight}`).join(' ')} L ${simulation.length} ${chartHeight} Z`}
                    fill="currentColor"
                    fillOpacity="0.1"
                    className="text-blue-500"
                  />
                  
                  {/* Payoff point marker */}
                  <circle
                    cx={simulation.length - 1}
                    cy={chartHeight}
                    r="4"
                    fill="currentColor"
                    className="text-green-500"
                  />

                </svg>
              </div>
              
              {/* X-axis label */}
              <div className="absolute left-20 right-4 bottom-0 text-center text-xs text-gray-500 dark:text-gray-400">
                {formatMonths(monthsToPayoff)} timeline
              </div>

            </div>
          </div>

          {/* Milestones */}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Payoff Milestones</h4>
            <div className="space-y-3">
              {payoffOrder.map((debt, index) => (

                <div 
                  key={debt.debtId}
                  className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h5 className="font-semibold text-gray-900 dark:text-white">{debt.name}</h5>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                      <span>Paid off in {formatMonths(debt.paidOffMonth)}</span>
                      <span>•</span>
                      <span>Total paid: {formatCurrency(debt.totalPaid)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-green-600 dark:text-green-400">
                      Debt Free!
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Final milestone */}
              <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border-2 border-green-200 dark:border-green-800">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h5 className="font-bold text-gray-900 dark:text-white">All Debts Paid Off!</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Congratulations! You'll be completely debt free by {formatDate(payoffDate)}
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Monthly Breakdown Preview */}
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-5">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Monthly Payment Breakdown</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-slate-600">
                <span className="text-gray-600 dark:text-gray-400">Minimum Payments</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(monthlyPayment)}</span>
              </div>

              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600 dark:text-gray-400">Recommended Extra Payment</span>
                <span className="font-medium text-green-600 dark:text-green-400">+ {formatCurrency(0)}</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg px-3">
                <span className="font-medium text-blue-900 dark:text-blue-300">Total Monthly</span>
                <span className="font-bold text-blue-900 dark:text-blue-300">{formatCurrency(strategy.monthlyPayment)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayoffTimeline;
