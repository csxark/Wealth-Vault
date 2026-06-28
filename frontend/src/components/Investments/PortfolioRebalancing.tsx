import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Settings,
  ChevronRight,
  PieChart,
  ArrowRight,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { investmentsAPI, Portfolio, Investment } from '../../services/api';

interface RebalancingAlert {
  id: string;
  portfolioId: string;
  assetClass: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  status: string;
  currentAllocation: number;
  targetAllocation: number;
  drift: number;
  amount: number;
  message: string;
}

interface RebalancingRecommendation {
  id: string;
  type: 'buy' | 'sell' | 'maintain';
  assetClass: string;
  priority: string;
  currentAllocation: number;
  targetAllocation: number;
  drift: number;
  amount: number;
  trades: Array<{
    investmentId?: string;
    symbol?: string;
    name?: string;
    action: string;
    quantity?: number;
    amount: number;
    currentAllocation?: number;
  }>;
  reasoning: string;
  riskAssessment: {
    level: string;
    factors: string[];
  };
  estimatedImpact: {
    portfolioValue: number;
    rebalancingAmount: number;
    percentageOfPortfolio: number;
  };
}

interface PortfolioRebalancingProps {
  portfolioId: string;
  portfolioName?: string;
}

const PortfolioRebalancing: React.FC<PortfolioRebalancingProps> = ({ portfolioId, portfolioName }) => {
  const [alerts, setAlerts] = useState<RebalancingAlert[]>([]);
  const [recommendations, setRecommendations] = useState<RebalancingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'alerts' | 'recommendations' | 'history'>('alerts');
  const [threshold, setThreshold] = useState(5);

  useEffect(() => {
    loadRebalancingData();
  }, [portfolioId, threshold]);

  const loadRebalancingData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load alerts
      const alertsResponse = await investmentsAPI.portfolios.getRebalancingAlerts(portfolioId, threshold);
      if (alertsResponse.success) {
        setAlerts(alertsResponse.data.alerts || []);
      }

      // Load recommendations
      const recsResponse = await investmentsAPI.portfolios.getRebalancingRecommendations(portfolioId, {
        threshold,
        optimizationEnabled: true,
        taxEfficient: false
      });
      if (recsResponse.success) {
        setRecommendations(recsResponse.data.recommendations || []);
      }
    } catch (err) {
      console.error('Error loading rebalancing data:', err);
      setError('Failed to load rebalancing data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-green-600 bg-green-50 border-green-200';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-2 text-gray-600">Analyzing portfolio allocation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <XCircle className="w-5 h-5 text-red-500 mr-2" />
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const hasAlerts = alerts.length > 0;
  const highPriorityCount = alerts.filter(a => a.priority === 'high').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Portfolio Rebalancing</h2>
          <p className="text-sm text-gray-500">
            {portfolioName && `${portfolioName} - `}
            Monitor and maintain your target allocation
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600">Alert Threshold:</label>
          <select
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm"
          >
            <option value={3}>3%</option>
            <option value={5}>5%</option>
            <option value={10}>10%</option>
            <option value={15}>15%</option>
          </select>
          <button
            onClick={loadRebalancingData}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`p-4 rounded-lg border ${hasAlerts ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center">
            <AlertTriangle className={`w-5 h-5 ${hasAlerts ? 'text-yellow-600' : 'text-green-600'} mr-2`} />
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className={`font-semibold ${hasAlerts ? 'text-yellow-700' : 'text-green-700'}`}>
                {hasAlerts ? `${alerts.length} Alert${alerts.length > 1 ? 's' : ''}` : 'Balanced'}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <TrendingUp className="w-5 h-5 text-blue-600 mr-2" />
            <div>
              <p className="text-sm text-gray-600">High Priority</p>
              <p className="font-semibold text-blue-700">{highPriorityCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center">
            <PieChart className="w-5 h-5 text-purple-600 mr-2" />
            <div>
              <p className="text-sm text-gray-600">Recommendations</p>
              <p className="font-semibold text-purple-700">{recommendations.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'alerts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Alerts ({alerts.length})
          </button>
          <button
            onClick={() => setActiveTab('recommendations')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'recommendations'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Recommendations ({recommendations.length})
          </button>
        </nav>
      </div>

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {alerts.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="mt-2 text-gray-600 font-medium">Your portfolio is balanced!</p>
              <p className="text-sm text-gray-500">All allocations are within the {threshold}% threshold</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg border ${getPriorityColor(alert.priority)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start">
                    <AlertTriangle className={`w-5 h-5 mt-0.5 mr-3 ${
                      alert.priority === 'high' ? 'text-red-600' : 
                      alert.priority === 'medium' ? 'text-yellow-600' : 'text-green-600'
                    }`} />
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-gray-900">
                          {alert.assetClass.charAt(0).toUpperCase() + alert.assetClass.slice(1)} Allocation
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadge(alert.priority)}`}>
                          {alert.priority}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                      <div className="flex items-center space-x-4 mt-2 text-sm">
                        <span>Current: <strong>{alert.currentAllocation.toFixed(1)}%</strong></span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span>Target: <strong>{alert.targetAllocation.toFixed(1)}%</strong></span>
                        <span className={alert.drift > 0 ? 'text-red-600' : 'text-green-600'}>
                          Drift: {alert.drift > 0 ? '+' : ''}{alert.drift.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-gray-900">{formatCurrency(Math.abs(alert.amount))}</p>
                    <p className="text-xs text-gray-500">
                      {alert.drift > 0 ? 'Sell' : 'Buy'} Amount
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div className="space-y-4">
          {recommendations.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="mt-2 text-gray-600 font-medium">No recommendations needed</p>
              <p className="text-sm text-gray-500">Your portfolio is well-balanced</p>
            </div>
          ) : (
            recommendations.map((rec) => (
              <div key={rec.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start">
                    {rec.type === 'buy' ? (
                      <TrendingUp className="w-5 h-5 text-green-600 mt-0.5 mr-3" />
                    ) : rec.type === 'sell' ? (
                      <TrendingDown className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-gray-400 mt-0.5 mr-3" />
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-gray-900">
                          {rec.type === 'maintain' ? 'Maintain Portfolio' : 
                           `${rec.type === 'buy' ? 'Buy' : 'Sell'} ${rec.assetClass.charAt(0).toUpperCase() + rec.assetClass.slice(1)}`}
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rec.priority === 'high' ? 'bg-red-100 text-red-800' :
                          rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {rec.priority}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{rec.reasoning}</p>
                      
                      {rec.trades && rec.trades.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">Suggested Trades:</p>
                          <div className="space-y-1">
                            {rec.trades.map((trade, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 rounded px-2 py-1">
                                <span>
                                  {trade.action === 'buy' ? 'Buy' : 'Sell'}: {trade.symbol || trade.assetClass}
                                </span>
                                <span className="font-medium">{formatCurrency(trade.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Risk Assessment */}
                      {rec.riskAssessment && rec.riskAssessment.factors.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-500">Risk Assessment:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {rec.riskAssessment.factors.map((factor, idx) => (
                              <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                {factor}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {rec.type !== 'maintain' && (
                      <>
                        <p className="text-lg font-semibold text-gray-900">{formatCurrency(rec.amount)}</p>
                        <p className="text-xs text-gray-500">
                          {rec.estimatedImpact.percentageOfPortfolio.toFixed(1)}% of portfolio
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                {rec.type !== 'maintain' && (
                  <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end space-x-2">
                    <button className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                      View Details
                    </button>
                    <button className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center">
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Execute
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default PortfolioRebalancing;
