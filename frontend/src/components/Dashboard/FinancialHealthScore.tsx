import React, { useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { TrendingUp, TrendingDown, Minus, Heart, Target, PiggyBank, CreditCard, AlertTriangle, Activity } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface FinancialHealthScore {
  id: string;
  overallScore: number;
  rating: string;
  dtiScore: number;
  savingsRateScore: number;
  volatilityScore: number;
  emergencyFundScore: number;
  budgetAdherenceScore: number;
  goalProgressScore: number;
  metrics: {
    monthlyIncome: number;
    monthlyExpenses: number;
    savingsRate: number;
    dti: number;
    emergencyFundMonths: number;
    budgetUtilization: number;
    goalCompletionRate: number;
    expenseVolatility: number;
  };
  recommendation: string;
  insights: string[];
  cashFlowPrediction: {
    nextMonth: number;
    trend: string;
    confidence: number;
  };
  periodStart: string;
  periodEnd: string;
  calculatedAt: string;
}

const FinancialHealthScore: React.FC = () => {
  const [score, setScore] = useState<FinancialHealthScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchFinancialHealthScore();
  }, []);

  const fetchFinancialHealthScore = async () => {
    try {
      setLoading(true);
      const response = await api.get('/financial-health');
      setScore(response.data.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching financial health score:', err);
      setError('Failed to load financial health score');
      showToast('Failed to load financial health score', 'error');
    } finally {
      setLoading(false);
    }
  };

  const recalculateScore = async () => {
    try {
      setLoading(true);
      const response = await api.post('/financial-health/recalculate');
      setScore(response.data.data);
      setError(null);
      showToast('Financial health score updated successfully', 'success');
    } catch (err) {
      console.error('Error recalculating financial health score:', err);
      setError('Failed to recalculate score');
      showToast('Failed to update financial health score', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10B981'; // green
    if (score >= 60) return '#3B82F6'; // blue
    if (score >= 40) return '#F59E0B'; // yellow
    return '#EF4444'; // red
  };

  const getRatingIcon = (rating: string) => {
    switch (rating?.toLowerCase()) {
      case 'excellent':
        return <Heart className="w-6 h-6 text-green-500" />;
      case 'good':
        return <TrendingUp className="w-6 h-6 text-blue-500" />;
      case 'fair':
        return <Minus className="w-6 h-6 text-yellow-500" />;
      case 'poor':
        return <TrendingDown className="w-6 h-6 text-orange-500" />;
      case 'very poor':
        return <AlertTriangle className="w-6 h-6 text-red-500" />;
      default:
        return <Minus className="w-6 h-6 text-gray-500" />;
    }
  };

  const getGaugeData = (score: number) => {
    const remaining = 100 - score;
    return {
      datasets: [{
        data: [score, remaining],
        backgroundColor: [getScoreColor(score), '#E5E7EB'],
        borderWidth: 0,
        cutout: '70%',
      }],
    };
  };

  const getGaugeOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
      },
    },
  });

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !score) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Score</h3>
          <p className="text-gray-600 mb-4">{error || 'No financial health score available'}</p>
          <button
            onClick={fetchFinancialHealthScore}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Heart className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">Financial Health Score</h2>
        </div>
        <button
          onClick={recalculateScore}
          disabled={loading}
          className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Score Gauge */}
        <div className="flex flex-col items-center">
          <div className="relative w-32 h-32 mb-4">
            <Doughnut data={getGaugeData(score.overallScore)} options={getGaugeOptions()} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold text-gray-900">{score.overallScore}</div>
              <div className="text-sm text-gray-500">out of 100</div>
            </div>
          </div>
          <div className="flex items-center space-x-2 mb-2">
            {getRatingIcon(score.rating)}
            <span className="text-lg font-semibold text-gray-900">{score.rating}</span>
          </div>
          <p className="text-sm text-gray-600 text-center max-w-xs">{score.recommendation}</p>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Score Breakdown</h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <PiggyBank className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-700">Savings Rate</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{score.savingsRateScore}/100</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-gray-700">Debt-to-Income</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{score.dtiScore}/100</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Target className="w-4 h-4 text-purple-500" />
                <span className="text-sm text-gray-700">Budget Adherence</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{score.budgetAdherenceScore}/100</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                <span className="text-sm text-gray-700">Goal Progress</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{score.goalProgressScore}/100</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Heart className="w-4 h-4 text-red-500" />
                <span className="text-sm text-gray-700">Emergency Fund</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{score.emergencyFundScore}/100</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-orange-500" />
                <span className="text-sm text-gray-700">Expense Stability</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{score.volatilityScore}/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Key Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              ${score.metrics.monthlyIncome.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Monthly Income</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              ${score.metrics.monthlyExpenses.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Monthly Expenses</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${score.metrics.savingsRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {score.metrics.savingsRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Savings Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {score.metrics.emergencyFundMonths.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">Emergency Months</div>
          </div>
        </div>
      </div>

      {/* Insights */}
      {score.insights && score.insights.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Insights</h3>
          <ul className="space-y-2">
            {score.insights.map((insight, index) => (
              <li key={index} className="flex items-start space-x-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                <span className="text-sm text-gray-700">{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Last Updated */}
      <div className="mt-6 pt-6 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-500">
          Last updated: {new Date(score.calculatedAt).toLocaleDateString()} at{' '}
          {new Date(score.calculatedAt).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};

export default FinancialHealthScore;
