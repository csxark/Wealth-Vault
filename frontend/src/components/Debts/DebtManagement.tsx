import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  TrendingDown, 
  DollarSign, 
  Target, 
  Zap,
  Calendar,
  CheckCircle,
  Search
} from 'lucide-react';
import { debtApi, Debt, DebtAnalytics, PayoffStrategies, PayoffStrategy } from '../../services/debtApi';
import { formatCurrency } from '../../utils/formatters';
import DebtCard from './DebtCard';
import DebtForm from './DebtForm';
import PaymentModal from './PaymentModal';
import PayoffStrategySelector from './PayoffStrategySelector';
import PayoffTimeline from './PayoffTimeline';

const DebtManagement: React.FC = () => {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [analytics, setAnalytics] = useState<DebtAnalytics | null>(null);
  const [strategies, setStrategies] = useState<PayoffStrategies | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showStrategies, setShowStrategies] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<PayoffStrategy | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'paid_off'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadDebts();
  }, [filter]);

  async function loadDebts() {
    try {
      setLoading(true);
      const [allDebts, stats, payoffStrategies] = await Promise.all([
        debtApi.getDebts({ status: filter === 'all' ? undefined : filter }),
        debtApi.getAnalytics(),
        debtApi.getPayoffStrategies()
      ]);

      setDebts(allDebts);
      setAnalytics(stats);
      setStrategies(payoffStrategies);
    } catch (error) {
      console.error('Error loading debts:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateDebt = async (debtData: Partial<Debt>) => {
    try {
      await debtApi.createDebt(debtData);
      setShowForm(false);
      loadDebts();
    } catch (error) {
      console.error('Error creating debt:', error);
    }
  };

  const handleUpdateDebt = async (debtData: Partial<Debt>) => {
    if (!selectedDebt) return;
    try {
      await debtApi.updateDebt(selectedDebt.id, debtData);
      setShowForm(false);
      setSelectedDebt(null);
      loadDebts();
    } catch (error) {
      console.error('Error updating debt:', error);
    }
  };

  const handleDeleteDebt = async (debtId: string) => {
    if (!confirm('Are you sure you want to delete this debt?')) return;
    try {
      await debtApi.deleteDebt(debtId);
      loadDebts();
    } catch (error) {
      console.error('Error deleting debt:', error);
    }
  };

  const handleRecordPayment = async (data: {
    amount: number;
    paymentDate: string;
    isExtraPayment: boolean;
    notes: string;
  }) => {
    if (!selectedDebt) return;
    try {
      await debtApi.recordPayment(selectedDebt.id, {
        amount: data.amount,
        paymentDate: data.paymentDate,
        isExtraPayment: data.isExtraPayment,
        notes: data.notes
      });
      setShowPayment(false);
      setSelectedDebt(null);
      loadDebts();
    } catch (error) {
      console.error('Error recording payment:', error);
    }
  };

  const handleSelectStrategy = (strategy: 'snowball' | 'avalanche', extraPayment: number) => {
    if (!strategies) return;
    const selected = strategy === 'snowball' ? strategies.snowball : strategies.avalanche;
    setSelectedStrategy(selected);
    setShowStrategies(false);
    setShowTimeline(true);
  };

  const filteredDebts = debts.filter(debt => 
    debt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (debt.lender && debt.lender.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const activeDebts = debts.filter(d => d.status === 'active');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Debt Payoff Tracker</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Track and manage your debts with smart payoff strategies
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowStrategies(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Payoff Strategies
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Debt
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                <DollarSign className="w-5 h-5" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Balance</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(analytics.summary.totalCurrentBalance)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              of {formatCurrency(analytics.summary.totalOriginalBalance)} original
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                <TrendingDown className="w-5 h-5" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Progress</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {analytics.summary.progressPercentage.toFixed(1)}%
            </p>
            <div className="w-full h-2 bg-gray-100 dark:bg-slate-700 rounded-full mt-2">
              <div 
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${Math.min(100, analytics.summary.progressPercentage)}%` }}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Monthly Payments</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(analytics.summary.totalMonthlyPayments)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              minimum payments due
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                <Target className="w-5 h-5" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Active Debts</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {analytics.summary.activeDebts}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {analytics.summary.paidOffDebts} paid off
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2">
          {(['all', 'active', 'paid_off'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {f === 'all' ? 'All Debts' : f === 'active' ? 'Active' : 'Paid Off'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
          <input
            type="text"
            placeholder="Search debts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-800 dark:text-white dark:placeholder-gray-400"
          />
        </div>
      </div>

      {/* Debts Grid */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
        </div>
      ) : filteredDebts.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No debts found</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {searchTerm ? 'Try adjusting your search' : 'Add your first debt to get started'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDebts.map(debt => (
            <DebtCard
              key={debt.id}
              debt={debt}
              onEdit={(debt) => {
                setSelectedDebt(debt);
                setShowForm(true);
              }}
              onDelete={handleDeleteDebt}
              onPayment={(debt) => {
                setSelectedDebt(debt);
                setShowPayment(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Strategy Recommendation Banner */}
      {strategies && activeDebts.length > 0 && (
        <div className="mt-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Recommended Strategy: {strategies.recommendation.method === 'snowball' ? 'Snowball' : 'Avalanche'}
              </h3>
              <p className="text-blue-100 mt-1">
                {strategies.recommendation.reason}
              </p>
            </div>
            <button
              onClick={() => setShowStrategies(true)}
              className="px-6 py-2 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors"
            >
              View Details
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <DebtForm
          debt={selectedDebt}
          onClose={() => {
            setShowForm(false);
            setSelectedDebt(null);
          }}
          onSubmit={selectedDebt ? handleUpdateDebt : handleCreateDebt}
        />
      )}

      {showPayment && selectedDebt && (
        <PaymentModal
          debt={selectedDebt}
          onClose={() => {
            setShowPayment(false);
            setSelectedDebt(null);
          }}
          onSubmit={handleRecordPayment}
        />
      )}

      {showStrategies && strategies && (
        <PayoffStrategySelector
          strategies={strategies}
          onClose={() => setShowStrategies(false)}
          onSelectStrategy={handleSelectStrategy}
        />
      )}

      {showTimeline && selectedStrategy && (
        <PayoffTimeline
          strategy={selectedStrategy}
          onClose={() => {
            setShowTimeline(false);
            setSelectedStrategy(null);
          }}
        />
      )}
    </div>
  );
};

export default DebtManagement;
