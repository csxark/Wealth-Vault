import React, { useState, useEffect } from 'react';
import { PiggyBank, TrendingUp, Calendar, DollarSign, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';

interface RoundUpRecord {
  id: string;
  expenseId: string;
  goalId: string;
  originalAmount: string;
  roundedAmount: string;
  roundUpAmount: string;
  currency: string;
  status: string;
  transferDate: string | null;
  createdAt: string;
  goal: {
    title: string;
    type: string;
  };
  expense: {
    description: string;
    amount: string;
    date: string;
  };
}

interface RoundUpStats {
  totalRoundUps: number;
  totalAmount: number;
  averageRoundUp: number;
}

const RoundUpHistory: React.FC = () => {
  const [roundups, setRoundups] = useState<RoundUpRecord[]>([]);
  const [stats, setStats] = useState<RoundUpStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const { user } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (user) {
      loadRoundUps();
      loadStats();
    }
  }, [user, page]);

  const loadRoundUps = async () => {
    try {
      const response = await fetch(`/api/savings/roundups?page=${page}&limit=20`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (page === 1) {
          setRoundups(data.data);
        } else {
          setRoundups(prev => [...prev, ...data.data]);
        }
        setHasMore(data.data.length === 20);
      }
    } catch (error) {
      console.error('Failed to load round-up history:', error);
      showToast('Failed to load round-up history', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/savings/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to load round-up stats:', error);
    }
  };

  const formatCurrency = (amount: string, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'transferred':
        return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-400';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-400';
      case 'failed':
        return 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-400';
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-900 dark:text-gray-400';
    }
  };

  if (loading && page === 1) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading round-up history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 border border-cyan-100 dark:border-cyan-900">
            <div className="flex items-center gap-4">
              <div className="bg-cyan-100 dark:bg-cyan-900 p-3 rounded-xl">
                <PiggyBank className="h-6 w-6 text-cyan-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-300">Total Round-Ups</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalRoundUps}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 border border-cyan-100 dark:border-cyan-900">
            <div className="flex items-center gap-4">
              <div className="bg-green-100 dark:bg-green-900 p-3 rounded-xl">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-300">Total Saved</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(stats.totalAmount.toString())}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 border border-cyan-100 dark:border-cyan-900">
            <div className="flex items-center gap-4">
              <div className="bg-purple-100 dark:bg-purple-900 p-3 rounded-xl">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-300">Average Round-Up</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(stats.averageRoundUp.toString())}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Round-Up History */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-cyan-100 dark:border-cyan-900">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-cyan-700 dark:text-cyan-400 flex items-center gap-2">
            <PiggyBank className="h-5 w-5" />
            Round-Up History
          </h2>
        </div>

        <div className="p-6">
          {roundups.length === 0 ? (
            <div className="text-center py-12">
              <PiggyBank className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No round-ups yet</h3>
              <p className="text-gray-500 dark:text-gray-400">
                Your round-up savings will appear here once you start making expenses.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {roundups.map((roundup) => (
                <div
                  key={roundup.id}
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-cyan-100 dark:bg-cyan-900 p-2 rounded-lg">
                      <PiggyBank className="h-5 w-5 text-cyan-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {roundup.expense.description}
                      </h4>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(roundup.expense.date)}
                        </span>
                        <span>Saved to: {roundup.goal.title}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold text-green-600 dark:text-green-400">
                      +{formatCurrency(roundup.roundUpAmount, roundup.currency)}
                    </div>
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(roundup.status)}`}>
                      {roundup.status.charAt(0).toUpperCase() + roundup.status.slice(1)}
                    </div>
                  </div>
                </div>
              ))}

              {hasMore && (
                <div className="text-center pt-4">
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition"
                  >
                    Load More
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoundUpHistory;
