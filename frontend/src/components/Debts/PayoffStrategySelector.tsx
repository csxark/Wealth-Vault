import React, { useState } from 'react';
import { X, TrendingDown, Zap, Target, DollarSign, Calendar, ArrowRight } from 'lucide-react';
import { PayoffStrategies, PayoffStrategy } from '../../services/debtApi';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface PayoffStrategySelectorProps {
  strategies: PayoffStrategies;
  onClose: () => void;
  onSelectStrategy: (strategy: 'snowball' | 'avalanche', extraPayment: number) => void;
}

const PayoffStrategySelector: React.FC<PayoffStrategySelectorProps> = ({ 
  strategies, 
  onClose, 
  onSelectStrategy 
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<'snowball' | 'avalanche'>(
    strategies.recommendation.method
  );
  const [extraPayment, setExtraPayment] = useState(0);

  const snowball = strategies.snowball;
  const avalanche = strategies.avalanche;
  const comparison = strategies.comparison;

  const formatMonths = (months: number) => {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (years === 0) return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
    if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`;
    return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} mo`;
  };

  const StrategyCard: React.FC<{
    strategy: 'snowball' | 'avalanche';
    data: PayoffStrategy;
    isSelected: boolean;
    onSelect: () => void;
  }> = ({ strategy, data, isSelected, onSelect }) => (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border-2 p-5 transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${strategy === 'snowball' ? 'bg-orange-100 text-orange-600' : 'bg-purple-100 text-purple-600'} dark:bg-opacity-20`}>
            {strategy === 'snowball' ? <Zap className="w-5 h-5" /> : <Target className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white capitalize">
              {strategy} Method
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {strategy === 'snowball' ? 'Pay smallest debts first' : 'Pay highest interest first'}
            </p>
          </div>
        </div>
        {isSelected && (
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 dark:text-gray-400">Time to payoff</span>
          <span className="font-semibold text-gray-900 dark:text-white">{formatMonths(data.monthsToPayoff)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 dark:text-gray-400">Total interest</span>
          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(data.totalInterest)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 dark:text-gray-400">Payoff date</span>
          <span className="font-semibold text-gray-900 dark:text-white">{formatDate(data.payoffDate)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 dark:text-gray-400">Monthly payment</span>
          <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(data.monthlyPayment)}</span>
        </div>
      </div>

      {strategy === 'snowball' && comparison.fasterMethod === 'snowball' && (
        <div className="mt-4 p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-center">
          <span className="text-sm font-medium text-green-700 dark:text-green-400">
            Faster by {formatMonths(Math.abs(comparison.timeDifference))}
          </span>
        </div>
      )}
      {strategy === 'avalanche' && comparison.fasterMethod === 'avalanche' && (
        <div className="mt-4 p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-center">
          <span className="text-sm font-medium text-green-700 dark:text-green-400">
            Saves {formatCurrency(comparison.interestSavings)} in interest
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Payoff Strategy</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Choose the best method to pay off your debts
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
          {/* Recommendation Banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 flex items-start gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
              <TrendingDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-semibold text-blue-900 dark:text-blue-300">
                Recommended: {strategies.recommendation.method === 'snowball' ? 'Snowball' : 'Avalanche'} Method
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                {strategies.recommendation.reason}
              </p>
              <span className="inline-block mt-2 text-xs font-medium px-2 py-1 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-300 rounded-full">
                {strategies.recommendation.confidence} confidence
              </span>
            </div>
          </div>

          {/* Strategy Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            <StrategyCard
              strategy="snowball"
              data={snowball}
              isSelected={selectedStrategy === 'snowball'}
              onSelect={() => setSelectedStrategy('snowball')}
            />
            <StrategyCard
              strategy="avalanche"
              data={avalanche}
              isSelected={selectedStrategy === 'avalanche'}
              onSelect={() => setSelectedStrategy('avalanche')}
            />
          </div>

          {/* Extra Payment Slider */}
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Extra Monthly Payment
              </label>
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {formatCurrency(extraPayment)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2000"
              step="25"
              value={extraPayment}
              onChange={(e) => setExtraPayment(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
              <span>$0</span>
              <span>$500</span>
              <span>$1000</span>
              <span>$1500</span>
              <span>$2000</span>
            </div>
            {extraPayment > 0 && (
              <p className="text-sm text-green-600 dark:text-green-400 mt-3">
                Adding {formatCurrency(extraPayment)}/month will accelerate your payoff!
              </p>
            )}
          </div>

          {/* Payoff Order Preview */}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Payoff Order Preview
            </h4>
            <div className="space-y-2">
              {(selectedStrategy === 'snowball' ? snowball : avalanche).payoffOrder.map((debt, index) => (
                <div 
                  key={debt.debtId}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg"
                >
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-semibold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">{debt.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Paid off in {formatMonths(debt.paidOffMonth)} • Total: {formatCurrency(debt.totalPaid)}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-slate-700">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => onSelectStrategy(selectedStrategy, extraPayment)}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Use {selectedStrategy === 'snowball' ? 'Snowball' : 'Avalanche'} Strategy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayoffStrategySelector;
