import React, { useState, useEffect } from 'react';
import { subscriptionTrackerAPI } from '../../services/subscriptionTrackerApi';

const SubscriptionAnalyzer: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const response = await subscriptionTrackerAPI.getAnalyzerReport();
      if (response.success) {
        setReport(response.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load analysis report');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">No analysis data available</p>
      </div>
    );
  }

  const { healthScore, spendingPatterns, categoryDistribution, unusualPatterns, recommendations } = report;

  const getHealthColor = (rating: string) => {
    switch (rating) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-orange-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="p-6">
      {/* Health Score */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Subscription Health Score
        </h3>
        <div className="flex items-center space-x-4 bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
          <div className="text-5xl font-bold text-blue-600 dark:text-blue-400">
            {healthScore.score}
          </div>
          <div>
            <p className={`text-xl font-semibold ${getHealthColor(healthScore.rating)}`}>
              {healthScore.rating.toUpperCase()}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Based on {unusualPatterns?.summary?.totalAnomalies || 0} anomalies detected
            </p>
          </div>
        </div>
        
        {/* Health Factors */}
        {healthScore.factors && healthScore.factors.length > 0 && (
          <div className="mt-4 space-y-2">
            {healthScore.factors.map((factor: any, index: number) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <span className="text-gray-700 dark:text-gray-300">{factor.factor}</span>
                <span className={`font-medium ${factor.impact < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {factor.impact > 0 ? '+' : ''}{factor.impact}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spending Patterns */}
      {spendingPatterns?.pattern && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Spending Trends
          </h3>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Spent</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  ${spendingPatterns.summary?.totalSpent?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Average Monthly</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  ${spendingPatterns.summary?.averageMonthly?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Trend</p>
                <p className={`text-xl font-bold ${spendingPatterns.summary?.trend === 'increasing' ? 'text-red-600' : 'text-green-600'}`}>
                  {spendingPatterns.summary?.trend || 'stable'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Net Change</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  +{spendingPatterns.summary?.totalNew || 0} / -{spendingPatterns.summary?.totalCancelled || 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Distribution */}
      {categoryDistribution?.categories && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Category Distribution
          </h3>
          <div className="space-y-3">
            {categoryDistribution.categories.slice(0, 5).map((category: any, index: number) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {category.name}
                  </span>
                  <span className="text-sm text-gray-500">
                    {category.percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${category.percentage}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  ${category.monthly?.toFixed(2)}/month ({category.count} subscriptions)
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unusual Patterns */}
      {unusualPatterns?.anomalies && unusualPatterns.anomalies.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Unusual Patterns Detected
          </h3>
          <div className="space-y-3">
            {unusualPatterns.anomalies.slice(0, 5).map((anomaly: any, index: number) => (
              <div
                key={index}
                className={`rounded-lg p-4 ${
                  anomaly.severity === 'high'
                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                    : anomaly.severity === 'medium'
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                    : 'bg-gray-50 dark:bg-gray-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {anomaly.serviceName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {anomaly.description}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    anomaly.severity === 'high'
                      ? 'bg-red-100 text-red-800'
                      : anomaly.severity === 'medium'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {anomaly.severity}
                  </span>
                </div>
                {anomaly.recommendation && (
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                    💡 {anomaly.recommendation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Recommendations
          </h3>
          <div className="space-y-3">
            {recommendations.map((rec: any, index: number) => (
              <div key={index} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="font-medium text-gray-900 dark:text-white">{rec.title}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{rec.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionAnalyzer;
