import React, { useState, useEffect } from 'react';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Target,
  DollarSign,
  BarChart3,
  PieChart,
  RefreshCw,
  Star
} from 'lucide-react';
import { investmentsAPI } from '../../services/api';

interface Recommendation {
  id: string;
  type: 'buy' | 'sell' | 'hold' | 'diversify' | 'rebalance';
  symbol?: string;
  name?: string;
  reasoning: string;
  expectedReturn?: number;
  riskLevel: 'low' | 'medium' | 'high';
  confidence: number;
  timeHorizon: 'short' | 'medium' | 'long';
  priority: 'low' | 'medium' | 'high';
}

interface InvestmentRecommendationsProps {
  portfolioId?: string;
}

const InvestmentRecommendations: React.FC<InvestmentRecommendationsProps> = ({ portfolioId }) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRecommendations();
  }, [portfolioId]);

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await investmentsAPI.advice.getRecommendations();
      setRecommendations(response.data.recommendations || []);
    } catch (error) {
      console.error('Error loading recommendations:', error);
      setError('Failed to load investment recommendations');
    } finally {
      setLoading(false);
    }
  };

  const refreshRecommendations = async () => {
    try {
      setRefreshing(true);
      await loadRecommendations();
    } finally {
      setRefreshing(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'high': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-red-200 bg-red-50';
      case 'medium': return 'border-yellow-200 bg-yellow-50';
      case 'low': return 'border-green-200 bg-green-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'buy': return <TrendingUp className="h-5 w-5 text-green-600" />;
      case 'sell': return <TrendingDown className="h-5 w-5 text-red-600" />;
      case 'hold': return <CheckCircle className="h-5 w-5 text-blue-600" />;
      case 'diversify': return <PieChart className="h-5 w-5 text-purple-600" />;
      case 'rebalance': return <BarChart3 className="h-5 w-5 text-orange-600" />;
      default: return <Lightbulb className="h-5 w-5 text-gray-600" />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Analyzing your portfolio...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Error loading recommendations</h3>
        <p className="mt-1 text-sm text-gray-500">{error}</p>
        <button
          onClick={loadRecommendations}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Brain className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">AI Investment Recommendations</h2>
        </div>
        <button
          onClick={refreshRecommendations}
          disabled={refreshing}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center space-x-2">
            <Target className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium">Active Recommendations</span>
          </div>
          <p className="text-2xl font-bold mt-2">{recommendations.length}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center space-x-2">
            <Star className="h-5 w-5 text-yellow-600" />
            <span className="text-sm font-medium">High Priority</span>
          </div>
          <p className="text-2xl font-bold mt-2">
            {recommendations.filter(r => r.priority === 'high').length}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium">Buy Signals</span>
          </div>
          <p className="text-2xl font-bold mt-2">
            {recommendations.filter(r => r.type === 'buy').length}
          </p>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="space-y-4">
        {recommendations.length === 0 ? (
          <div className="text-center py-12">
            <Brain className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No recommendations available</h3>
            <p className="mt-1 text-sm text-gray-500">
              Add more investments to your portfolio to receive AI-powered recommendations.
            </p>
          </div>
        ) : (
          recommendations.map((recommendation) => (
            <div
              key={recommendation.id}
              className={`border rounded-lg p-6 ${getPriorityColor(recommendation.priority)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  {getTypeIcon(recommendation.type)}
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="font-semibold text-gray-900">
                        {recommendation.type.toUpperCase()}
                        {recommendation.symbol && ` ${recommendation.symbol}`}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(recommendation.riskLevel)}`}>
                        {recommendation.riskLevel} risk
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {recommendation.timeHorizon} term
                      </span>
                    </div>
                    {recommendation.name && (
                      <p className="text-sm text-gray-600 mb-2">{recommendation.name}</p>
                    )}
                    <p className="text-gray-700 mb-3">{recommendation.reasoning}</p>
                    <div className="flex items-center space-x-4 text-sm">
                      {recommendation.expectedReturn !== undefined && (
                        <div className="flex items-center space-x-1">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <span className="text-green-600 font-medium">
                            Expected: {formatPercent(recommendation.expectedReturn)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center space-x-1">
                        <CheckCircle className="h-4 w-4 text-blue-600" />
                        <span className="text-blue-600">
                          Confidence: {recommendation.confidence}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    recommendation.priority === 'high' ? 'bg-red-100 text-red-800' :
                    recommendation.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {recommendation.priority} priority
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">Important Disclaimer</h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                These recommendations are generated by AI and should not be considered as financial advice.
                Always consult with a qualified financial advisor before making investment decisions.
                Past performance does not guarantee future results.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvestmentRecommendations;
