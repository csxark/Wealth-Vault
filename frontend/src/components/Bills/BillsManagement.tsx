import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Calendar, 
  Bell, 
  CreditCard, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Sparkles,
  Search,
  Filter
} from 'lucide-react';
import { billApi, Bill, PaymentSuggestion } from '../../services/billApi';
import { formatCurrency, formatDate, daysUntil } from '../../utils/formatters';
import BillCard from './BillCard';
import BillForm from './BillForm';
import BillDetectionModal from './BillDetectionModal';
import PaymentScheduler from './PaymentScheduler';

const BillsManagement: React.FC = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [upcomingBills, setUpcomingBills] = useState<Bill[]>([]);
  const [suggestions, setSuggestions] = useState<PaymentSuggestion[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDetection, setShowDetection] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadBills();
  }, [filter]);

  async function loadBills() {
    try {
      setLoading(true);
      const [allBills, upcoming, paymentSuggestions, stats] = await Promise.all([
        billApi.getBills({ 
          status: filter === 'all' ? undefined : filter,
          sortBy: 'dueDate',
          sortOrder: 'asc'
        }),
        billApi.getUpcomingBills(30),
        billApi.getPaymentSuggestions(),
        billApi.getAnalytics('monthly')
      ]);

      setBills(allBills);
      setUpcomingBills(upcoming);
      setSuggestions(paymentSuggestions);
      setAnalytics(stats);
    } catch (error) {
      console.error('Error loading bills:', error);
    } finally {
      setLoading(false);
    }
  }


  const handleCreateBill = async (billData: Partial<Bill>) => {
    try {
      await billApi.createBill(billData);
      setShowForm(false);
      loadBills();
    } catch (error) {
      console.error('Error creating bill:', error);
    }
  };

  const handlePayBill = async (billId: string) => {
    try {
      await billApi.payBill(billId);
      loadBills();
    } catch (error) {
      console.error('Error paying bill:', error);
    }
  };

  const handleSchedulePayment = (bill: Bill) => {
    setSelectedBill(bill);
    setShowScheduler(true);
  };

  const handleToggleSmartSchedule = async (billId: string, enabled: boolean) => {
    try {
      await billApi.toggleSmartSchedule(billId, enabled);
      loadBills();
    } catch (error) {
      console.error('Error toggling smart schedule:', error);
    }
  };

  const filteredBills = bills.filter(bill => 
    bill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bill.payee?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const overdueCount = bills.filter(b => b.status === 'overdue').length;
  const pendingCount = bills.filter(b => b.status === 'pending').length;
  const totalMonthly = analytics?.summary?.totalMonthly || 0;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Bill Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track, schedule, and optimize your bill payments
          </p>
        </div>

        <div className="flex gap-3 mt-4 md:mt-0">
          <button
            onClick={() => setShowDetection(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Auto-Detect
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Bill
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Monthly Bills</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(totalMonthly)}
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{pendingCount}</p>
            </div>
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Overdue</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{overdueCount}</p>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Smart Scheduled</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {bills.filter(b => b.smartScheduleEnabled).length}
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>
      </div>


      {/* Upcoming Bills Alert */}
      {upcomingBills.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 rounded-xl p-6 mb-8 border border-blue-100 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upcoming Bills</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {upcomingBills.slice(0, 3).map(bill => (
              <div key={bill.id} className="bg-white dark:bg-slate-700 rounded-lg p-4 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{bill.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Due {formatDate(bill.dueDate)}
                    </p>
                  </div>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(parseFloat(bill.amount))}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handlePayBill(bill.id)}
                    className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Pay Now
                  </button>
                  <button
                    onClick={() => handleSchedulePayment(bill)}
                    className="flex-1 py-2 bg-gray-100 dark:bg-slate-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-slate-500 transition-colors"
                  >
                    Schedule
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Smart Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-slate-800 dark:to-slate-800 rounded-xl p-6 mb-8 border border-green-100 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Smart Payment Suggestions</h2>
          </div>
          <div className="space-y-3">
            {suggestions.slice(0, 2).map(suggestion => (
              <div key={suggestion.billId} className="bg-white dark:bg-slate-700 rounded-lg p-4 shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{suggestion.billName}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{suggestion.reasoning}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Suggested Date</p>
                  <p className="font-semibold text-green-600 dark:text-green-400">
                    {formatDate(suggestion.suggestedPaymentDate)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex gap-2">
          {(['all', 'pending', 'overdue', 'paid'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
          <input
            type="text"
            placeholder="Search bills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-800 dark:text-white dark:placeholder-gray-400"
          />
        </div>
      </div>


      {/* Bills List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
        </div>
      ) : filteredBills.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No bills found</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {searchTerm ? 'Try adjusting your search' : 'Add your first bill to get started'}
          </p>
        </div>
      ) : (

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBills.map(bill => (
            <BillCard
              key={bill.id}
              bill={bill}
              onPay={() => handlePayBill(bill.id)}
              onSchedule={() => handleSchedulePayment(bill)}
              onToggleSmartSchedule={(enabled) => handleToggleSmartSchedule(bill.id, enabled)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <BillForm
          onClose={() => setShowForm(false)}
          onSubmit={handleCreateBill}
        />
      )}

      {showDetection && (
        <BillDetectionModal
          onClose={() => setShowDetection(false)}
          onDetect={loadBills}
        />
      )}

      {showScheduler && selectedBill && (
        <PaymentScheduler
          bill={selectedBill}
          suggestions={suggestions.find(s => s.billId === selectedBill.id)}
          onClose={() => {
            setShowScheduler(false);
            setSelectedBill(null);
          }}
          onSchedule={loadBills}
        />
      )}
    </div>
  );
};

export default BillsManagement;
