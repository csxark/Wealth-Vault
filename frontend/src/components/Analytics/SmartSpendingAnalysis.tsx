import React, { useState, useEffect } from 'react';
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Target,
  BarChart3,
  PieChart,
  Calendar,
  DollarSign,
  Shield,
  Zap,
  Heart,
  Lightbulb
} from 'lucide-react';
import { analyticsAPI } from '../../services/api';
import { LoadingSpinner } from '../Loading/LoadingSpinner';
import { useLoading } from '../../context/LoadingContext';

interface SmartSpendingAnalysisProps {
  className?: string;
}

interface AnalysisData {
  status: 'success' | 'insufficient_data';
  patternAnalysis: {
    patterns: {
      safe: { score: number; indicators: string[]; transactions: string[] };
      impulsive: { score: number; indicators: string[]; transactions: string[] };
      anxious: { score: number; indicators: string[]; transactions: string[] };
    };
    dominantPattern: string;
    dominantScore: number;
    patternDistribution: { safe: number; impulsive: number; anxious: number };
  };
  behavioralInsights: Array<{
    type: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    data: any;
  }>;
  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high';
    riskFactors: string[];
    riskScore: number;
    recommendations: string[];
  };
  recommendations: Array<{
    type: string;
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    actions: string[];
  }>;
  totalTransactions: number;
  totalAmount: number;
}

const SmartSpendingAnalysis: React.FC<SmartSpendingAnalysisProps> = ({ className = '' }) => {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('90days');
  const { withLoading } = useLoading();

  useEffect(() => {
    fetchAnalysis();
  }, [timeRange]);

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await withLoading(
        analyticsAPI.getSmartSpendingAnalysis({ timeRange }),
        'Analyzing your spending patterns...'
      );

      if (response.success) {
        setAnalysis(response.data);
      } else {
        setError(response.message || 'Failed to load analysis');
      }
    } catch (err) {
      console.error('Analysis fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load spending analysis');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getPatternIcon = (pattern: string) => {
    switch (pattern) {
      case 'safe': return <Shield className="h-6 w-6 text-green-500" />;
      case 'impulsive': return <Zap className="h-6 w-6 text-orange-500" />;
      case 'anxious': return <Heart className="h-6 w-6 text-red-500" />;
      default: return <Target className="h-6 w-6 text-blue-500" />;
    }
  };

  const getPatternColor = (pattern: string) => {
    switch (pattern) {
      case 'safe': return 'bg-green-50 border-green-200 text-green-800';
      case 'impulsive': return 'bg-orange-50 border-orange-200 text-orange-800';
      case 'anxious': return 'bg-red-50 border-red-200 text-red-800';
      default: return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-red-500 bg-red-50';
      case 'medium': return 'border-orange-500 bg-orange-50';
      case 'low': return 'border-green-500 bg-green-50';
      default: return 'border-gray-500 bg-gray-50';
    }
  };

  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-8 ${className}`}>
        <div className="flex items-center justify-center">
          <LoadingSpinner />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Analyzing your spending patterns...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-8 ${className}`}>
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Analysis Error</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={fetchAnalysis}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!analysis || analysis.status === 'insufficient_data') {
    return (
      <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-8 ${className}`}>
        <div className="text-center">
          <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Insufficient Data</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            We need at least 10 transactions to provide meaningful spending analysis.
            Keep using the app and check back soon!
          </p>
          <div className="text-sm text-gray-500 dark:text-gray-500">
            Current transactions: {analysis?.totalTransactions || 0}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Brain className="h-8 w-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Smart Spending Analysis</h2>
              <p className="text-gray-600 dark:text-gray-400">AI-powered insights into your spending behavior</p>
            </div>
          </div>

          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          >
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
            <option value="6months">Last 6 Months</option>
            <option value="1year">Last Year</option>
          </select>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Transactions</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {analysis.totalTransactions}
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Amount</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {formatCurrency(analysis.totalAmount)}
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Risk Level</span>
            </div>
            <div className={`text-lg font-bold mt-1 capitalize ${
              analysis.riskAssessment.riskLevel === 'high' ? 'text-red-600' :
              analysis.riskAssessment.riskLevel === 'medium' ? 'text-orange-600' : 'text-green-600'
            }`}>
              {analysis.riskAssessment.riskLevel}
            </div>
          </div>
        </div>
      </div>

      {/* Spending Patterns */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <Target className="h-6 w-6 mr-2 text-blue-600" />
          Spending Patterns
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {Object.entries(analysis.patternAnalysis.patterns).map(([pattern, data]) => (
            <div key={pattern} className={`p-4 rounded-lg border-2 ${getPatternColor(pattern)}`}>
              <div className="flex items-center justify-between mb-2">
                {getPatternIcon(pattern)}
                <span className="text-sm font-medium capitalize">{pattern}</span>
              </div>
              <div className="text-2xl font-bold mb-1">{data.score.toFixed(1)}%</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {data.transactions.length} transactions
              </div>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            <span className="font-medium text-blue-800 dark:text-blue-300">Dominant Pattern</span>
          </div>
          <p className="text-blue-700 dark:text-blue-400">
            Your spending is primarily <strong className="capitalize">{analysis.patternAnalysis.dominantPattern}</strong>
            ({analysis.patternAnalysis.dominantScore.toFixed(1)}% of transactions)
          </p>
        </div>
      </div>

      {/* Behavioral Insights */}
      {analysis.behavioralInsights.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Lightbulb className="h-6 w-6 mr-2 text-yellow-600" />
            Behavioral Insights
          </h3>

          <div className="space-y-3">
            {analysis.behavioralInsights.map((insight, index) => (
              <div key={index} className={`p-4 rounded-lg border ${getSeverityColor(insight.severity)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-1">{insight.title}</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{insight.description}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${
                    insight.severity === 'high' ? 'bg-red-100 text-red-800' :
                    insight.severity === 'medium' ? 'bg-orange-100 text-orange-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {insight.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Assessment */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <AlertTriangle className="h-6 w-6 mr-2 text-red-600" />
          Risk Assessment
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Risk Level</span>
                <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${
                  analysis.riskAssessment.riskLevel === 'high' ? 'bg-red-100 text-red-800' :
                  analysis.riskAssessment.riskLevel === 'medium' ? 'bg-orange-100 text-orange-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {analysis.riskAssessment.riskLevel}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    analysis.riskAssessment.riskLevel === 'high' ? 'bg-red-500' :
                    analysis.riskAssessment.riskLevel === 'medium' ? 'bg-orange-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${analysis.riskAssessment.riskScore}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Risk Score: {analysis.riskAssessment.riskScore}/100
              </div>
            </div>

            {analysis.riskAssessment.riskFactors.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Risk Factors</h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  {analysis.riskAssessment.riskFactors.map((factor, index) => (
                    <li key={index} className="flex items-center">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Recommendations</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              {analysis.riskAssessment.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Personalized Recommendations */}
      {analysis.recommendations.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Lightbulb className="h-6 w-6 mr-2 text-green-600" />
            Personalized Recommendations
          </h3>

          <div className="space-y-4">
            {analysis.recommendations.map((rec, index) => (
              <div key={index} className={`p-4 rounded-lg border-2 ${getPriorityColor(rec.priority)}`}>
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-gray-900 dark:text-white">{rec.title}</h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${
                    rec.priority === 'high' ? 'bg-red-100 text-red-800' :
                    rec.priority === 'medium' ? 'bg-orange-100 text-orange-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {rec.priority} priority
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{rec.description}</p>

                <div>
                  <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Suggested Actions:</h5>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    {rec.actions.map((action, actionIndex) => (
                      <li key={actionIndex} className="flex items-start">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2 mt-2 flex-shrink-0"></span>
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartSpendingAnalysis;