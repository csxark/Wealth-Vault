import React, { useState, useEffect } from 'react';
import { subscriptionTrackerAPI, DetectionResult } from '../../services/subscriptionTrackerApi';

const SubscriptionDetection: React.FC = () => {
  const [detections, setDetections] = useState<DetectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(6);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    detectSubscriptions();
  }, [months]);

  const detectSubscriptions = async () => {
    try {
      setLoading(true);
      const response = await subscriptionTrackerAPI.detectPotentialSubscriptions(months);
      if (response.success) {
        setDetections(response.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to detect subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const createFromDetection = async (detection: any) => {
    try {
      setCreating(detection.serviceName);
      await subscriptionTrackerAPI.createFromDetection({
        serviceName: detection.serviceName,
        averageAmount: detection.averageAmount,
        suggestedFrequency: detection.suggestedFrequency,
        expenseIds: detection.expenseIds,
        confidence: detection.confidence
      });
      // Refresh the list
      detectSubscriptions();
    } catch (err: any) {
      setError(err.message || 'Failed to create subscription');
    } finally {
      setCreating(null);
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

  if (!detections) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">No detection data available</p>
      </div>
    );
  }

  const { detections: detectionList, summary } = detections;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.5) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="p-6">
      {/* Summary */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Detected Subscriptions
          </h3>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Detected</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalDetections}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <p className="text-sm text-green-600 dark:text-green-400">High Confidence</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.highConfidence}</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">Medium Confidence</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{summary.mediumConfidence}</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <p className="text-sm text-blue-600 dark:text-blue-400">Potential Monthly</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">${summary.totalPotentialMonthly.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Detection List */}
      <div>
        <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-4">
          Potential Subscriptions Found
        </h4>
        
        {detectionList.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No potential subscriptions detected</p>
        ) : (
          <div className="space-y-3">
            {detectionList.map((detection, index) => (
              <div
                key={index}
                className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {detection.serviceName}
                      </p>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getConfidenceColor(detection.confidence)}`}>
                        {Math.round(detection.confidence * 100)}% confidence
                      </span>
                      {detection.isExisting && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                          Already tracked
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Amount</p>
                        <p className="font-medium text-gray-900 dark:text-white">${detection.averageAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Frequency</p>
                        <p className="font-medium text-gray-900 dark:text-white">{detection.frequency}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Occurrences</p>
                        <p className="font-medium text-gray-900 dark:text-white">{detection.occurrenceCount}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Pattern</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {detection.isRecurring ? '✓ Recurring' : '✗ Not recurring'}
                        </p>
                      </div>
                    </div>

                    {detection.knownMatch && (
                      <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                        Category: {detection.knownMatch}
                      </p>
                    )}
                  </div>

                  {!detection.isExisting && detection.confidence >= 0.5 && (
                    <button
                      onClick={() => createFromDetection(detection)}
                      disabled={creating === detection.serviceName}
                      className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {creating === detection.serviceName ? 'Adding...' : 'Add'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionDetection;
