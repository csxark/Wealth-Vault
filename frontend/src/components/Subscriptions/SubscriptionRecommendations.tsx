import React, { useState, useEffect } from 'react';
import { subscriptionTrackerAPI } from '../../services/subscriptionTrackerApi';

const SubscriptionRecommendations: React.FC = () => {
  const [recommendations, setRecommendations] = useState<any>(null);
  const [optimization, setOptimization] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'recommendations' | 'optimization'>('recommendations');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [recResponse, optResponse] = await Promise.all([
        subscriptionTrackerAPI.getRecommendations(),
        subscriptionTrackerAPI.getOptimizationRecommendations()
      ]);

      if (recResponse.success) {
        setRecommendations(recResponse.data);
      }
      if (optResponse.success) {
        setOptimization(optResponse.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load recommendations');
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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'cancel': return '❌';
      case 'downgrade': return '⬇️';
      case 'review': return '👀';
      case 'downgrade-frequency': return '📅';
      default: return '💡';
    }
  };

  return (
    <div className="p-6">
      {/* Tabs */}
      <div className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('recommendations')}
          className={`pb-2 px-1 ${
            activeTab === 'recommendations'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Detection Recommendations
        </button>
        <button
          onClick={() => setActiveTab('optimization')}
          className={`pb-2 px-1 ${
            activeTab === 'optimization'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Cost Optimization
        </button>
      </div>

      {/* Detection Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div>
          {recommendations?.recommendations?.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No recommendations available</p>
          ) : (
            <>
              {/* Potential Savings Summary */}
              {recommendations?.totalPotentialSavings && (
                <div className="mb-6 grid grid-cols-2 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <p className="text-sm text-green-600 dark:text-green-400">Potential Monthly Savings</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      ${recommendations.totalPotentialSavings.monthly?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <p className="text-sm text-blue-600 dark:text-blue-400">Potential Annual Savings</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      ${recommendations.totalPotentialSavings.annual?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                </div>
              )}

              {/* Recommendations List */}
              <div className="space-y-4">
                {recommendations?.recommendations?.map((rec: any, index: number) => (
                  <div
                    key={index}
                    className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {rec.serviceName}
                          </h4>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            {Math.round(rec.confidence * 100)}% confidence
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {rec.reason}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-sm">
                          <span className="text-gray-500 dark:text-gray-400">
                            ${rec.estimatedMonthly?.toFixed(2)}/month
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            ${rec.estimatedAnnual?.toFixed(2)}/year
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            {rec.frequency}
                          </span>
                        </div>
                      </div>
                      <button
                        className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        onClick={() => {
                          // Handle add subscription
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Optimization Tab */}
      {activeTab === 'optimization' && (
        <div>
          {optimization?.recommendations?.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No optimization recommendations available</p>
          ) : (
            <>
              {/* Summary */}
              <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <p className="text-sm text-red-600 dark:text-red-400">Potential Monthly Savings</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    ${optimization?.totalPotentialMonthlySavings?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                  <p className="text-sm text-orange-600 dark:text-orange-400">Potential Annual Savings</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    ${optimization?.totalPotentialAnnualSavings?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <p className="text-sm text-blue-600 dark:text-blue-400">Recommendations</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {optimization?.recommendations?.length || 0}
                  </p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <p className="text-sm text-purple-600 dark:text-purple-400">Unused Subscriptions</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {optimization?.summary?.unusedCount || 0}
                  </p>
                </div>
              </div>

              {/* Recommendations List */}
              <div className="space-y-4">
                {optimization?.recommendations?.map((rec: any, index: number) => (
                  <div
                    key={index}
                    className={`rounded-lg p-4 border ${
                      rec.severity === 'high' 
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        : rec.severity === 'medium'
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{getActionIcon(rec.action)}</span>
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {rec.title}
                          </h4>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getSeverityColor(rec.severity)}`}>
                            {rec.severity}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          {rec.message}
                        </p>
                        
                        {rec.potentialMonthlySavings > 0 && (
                          <div className="mt-2 flex items-center gap-4 text-sm">
                            <span className="font-medium text-green-600 dark:text-green-400">
                              Save ${rec.potentialMonthlySavings?.toFixed(2)}/month
                            </span>
                          </div>
                        )}

                        {rec.action && (
                          <div className="mt-3 flex gap-2">
                            {rec.action === 'cancel' && (
                              <button className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700">
                                Cancel Subscription
                              </button>
                            )}
                            {rec.action === 'downgrade' && (
                              <button className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700">
                                Downgrade Plan
                              </button>
                            )}
                            {rec.action === 'review' && (
                              <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                                Review Options
                              </button>
                            )}
                            <button className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-500">
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SubscriptionRecommendations;
