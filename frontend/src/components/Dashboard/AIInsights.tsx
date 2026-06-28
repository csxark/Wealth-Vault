import React, { useEffect, useState } from 'react';
import { Brain, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLoading } from '../../context/LoadingContext';

interface InsightsData {
  insights: string;
  generatedAt: string;
  dataSummary: {
    expenseCount: number;
    investmentCount: number;
    savingsGoalCount: number;
  };
}

const AIInsights: React.FC = () => {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const { setLoading } = useLoading();

  const fetchInsights = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/insights');
      setInsights(response.data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to load AI insights';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const parseInsights = (insightsText: string) => {
    // Simple parsing to extract sections
    const sections = insightsText.split('\n\n');
    return sections.map((section, index) => ({
      id: index,
      content: section.trim(),
      type: section.toLowerCase().includes('spending') ? 'spending' :
            section.toLowerCase().includes('investment') ? 'investment' :
            section.toLowerCase().includes('savings') ? 'savings' :
            section.toLowerCase().includes('recommendation') ? 'recommendation' : 'general'
    }));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'spending': return <TrendingUp className="w-5 h-5 text-blue-500" />;
      case 'investment': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'savings': return <Lightbulb className="w-5 h-5 text-purple-500" />;
      case 'recommendation': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      default: return <Brain className="w-5 h-5 text-gray-500" />;
    }
  };

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Brain className="w-6 h-6 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-900">AI Financial Insights</h3>
        </div>
        <div className="text-center py-8">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchInsights}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Brain className="w-6 h-6 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">AI Financial Insights</h3>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  const parsedInsights = parseInsights(insights.insights);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Brain className="w-6 h-6 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">AI Financial Insights</h3>
        </div>
        <button
          onClick={fetchInsights}
          className="px-3 py-1 text-sm bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        Based on {insights.dataSummary.expenseCount} expenses, {insights.dataSummary.investmentCount} investments, and {insights.dataSummary.savingsGoalCount} savings goals
      </div>

      <div className="space-y-4">
        {parsedInsights.map((section) => (
          <div key={section.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
            {getIcon(section.type)}
            <div className="flex-1">
              <p className="text-gray-800 text-sm leading-relaxed">{section.content}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-gray-500 text-right">
        Generated on {new Date(insights.generatedAt).toLocaleString()}
      </div>
    </div>
  );
};

export default AIInsights;
