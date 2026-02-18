import React, { useState } from 'react';
import { X, Sparkles, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { billApi, BillDetection } from '../../services/billApi';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface BillDetectionModalProps {
  onClose: () => void;
  onDetect: () => void;
}

const BillDetectionModal: React.FC<BillDetectionModalProps> = ({ onClose, onDetect }) => {
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detections, setDetections] = useState<BillDetection[]>([]);
  const [selectedDetections, setSelectedDetections] = useState<Set<number>>(new Set());
  const [months, setMonths] = useState(6);
  const [error, setError] = useState<string | null>(null);

  const handleDetect = async () => {
    try {
      setDetecting(true);
      setError(null);
      const detected = await billApi.detectBills(months);
      setDetections(detected);
    } catch (err) {
      setError('Failed to detect bills. Please try again.');
      console.error('Detection error:', err);
    } finally {
      setDetecting(false);
    }
  };

  const toggleSelection = (index: number) => {
    const newSelected = new Set(selectedDetections);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedDetections(newSelected);
  };

  const handleCreateBills = async () => {
    if (selectedDetections.size === 0) return;

    try {
      setLoading(true);
      const selectedDetectionsList = Array.from(selectedDetections).map(i => detections[i]);
      await billApi.createFromDetections(selectedDetectionsList);
      onDetect();
      onClose();
    } catch (err) {
      setError('Failed to create bills. Please try again.');
      console.error('Create error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600 bg-green-100';
    if (confidence >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-orange-600 bg-orange-100';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Auto-Detect Bills</h2>
              <p className="text-sm text-gray-500">Analyze your transactions to find recurring bills</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Close"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

        </div>

        <div className="p-6">
          {/* Configuration */}
          {detections.length === 0 && !detecting && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Analyze transactions from last:
              </label>
              <div className="flex gap-2">
                {[3, 6, 12].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMonths(m)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      months === m
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {m} months
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Detect Button */}
          {detections.length === 0 && !detecting && (
            <button
              onClick={handleDetect}
              className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              Start Detection
            </button>
          )}

          {/* Loading State */}
          {detecting && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Analyzing your transaction history...</p>
              <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {/* Results */}
          {detections.length > 0 && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Found <span className="font-semibold">{detections.length}</span> potential bills
                </p>
                <p className="text-sm text-gray-500">
                  {selectedDetections.size} selected
                </p>
              </div>

              <div className="space-y-3 mb-6">
                {detections.map((detection, index) => (
                  <div
                    key={index}
                    onClick={() => toggleSelection(index)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedDetections.has(index)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedDetections.has(index)
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}>
                        {selectedDetections.has(index) && (
                          <CheckCircle className="w-3 h-3 text-white" />
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-semibold text-gray-900">{detection.billName}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(detection.confidence)}`}>
                            {detection.confidence}% match
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-2">
                          <div>
                            <span className="text-gray-500">Amount:</span>{' '}
                            <span className="font-medium">{formatCurrency(parseFloat(detection.amount))}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Frequency:</span>{' '}
                            <span className="font-medium capitalize">{detection.frequency}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Transactions:</span>{' '}
                            <span className="font-medium">{detection.transactionCount}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Next Due:</span>{' '}
                            <span className="font-medium">{formatDate(detection.nextDueDate)}</span>
                          </div>
                        </div>
                        
                        <div className="text-xs text-gray-500">
                          Based on {detection.transactionCount} transactions from {formatDate(detection.firstDate)} to {formatDate(detection.lastDate)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDetections([]);
                    setSelectedDetections(new Set());
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Scan Again
                </button>
                <button
                  onClick={handleCreateBills}
                  disabled={selectedDetections.size === 0 || loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create {selectedDetections.size} Bill{selectedDetections.size !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* No Results */}
          {detections.length === 0 && !detecting && !error && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>How it works:</strong> Our AI analyzes your transaction history to identify recurring payments like utilities, rent, subscriptions, and other bills. Select the time period above and click "Start Detection" to begin.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillDetectionModal;
