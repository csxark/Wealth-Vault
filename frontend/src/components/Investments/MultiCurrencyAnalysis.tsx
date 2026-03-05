import React, { useState, useEffect } from 'react';
import { Globe, TrendingUp, TrendingDown, Shield, AlertTriangle } from 'lucide-react';

interface CurrencyAllocation {
  currency: string;
  percent: number;
  valueInBaseCurrency: number;
  volatility: number;
}

interface HedgingRecommendation {
  currency: string;
  exposure: number;
  volatility: number;
  recommendation: string;
  suggestedHedge: string;
  hedgePercent: number;
}

interface MultiCurrencyAnalysisProps {
  userId: string;
}

const MultiCurrencyAnalysis: React.FC<MultiCurrencyAnalysisProps> = ({ userId }) => {
  const [analysis, setAnalysis] = useState<any>(null);
  const [exposure, setExposure] = useState<any>(null);
  const [hedgingStrategy, setHedgingStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'analysis' | 'exposure' | 'hedging'>('analysis');

  useEffect(() => {
    loadMultiCurrencyData();
  }, [userId]);

  const loadMultiCurrencyData = async () => {
    try {
      setLoading(true);

      // Fetch portfolio analysis
      const analysisResponse = await fetch('/api/rebalancing/multi-currency/analysis', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });

      if (analysisResponse.ok) {
        const data = await analysisResponse.json();
        setAnalysis(data.data.analysis);
      }

      // Fetch currency exposure
      const exposureResponse = await fetch('/api/rebalancing/multi-currency/exposure', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });

      if (exposureResponse.ok) {
        const data = await exposureResponse.json();
        setExposure(data.data.exposure);
      }

      // Fetch hedging strategy
      const hedgeResponse = await fetch('/api/rebalancing/multi-currency/hedging-strategy', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });

      if (hedgeResponse.ok) {
        const data = await hedgeResponse.json();
        setHedgingStrategy(data.data.strategy);
      }
    } catch (error) {
      console.error('Error loading multi-currency data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getVolatilityColor = (volatility: number) => {
    if (volatility > 0.1) return 'text-red-600 bg-red-50';
    if (volatility > 0.08) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getVolatilityBadge = (volatility: number) => {
    if (volatility > 0.1) return 'bg-red-100 text-red-800';
    if (volatility > 0.08) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  if (loading) {
    return <div className="animate-pulse">Loading multi-currency analysis...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-6">
        <div className="flex items-center mb-3">
          <Globe className="w-6 h-6 text-purple-600 mr-3" />
          <h2 className="text-2xl font-bold text-gray-900">Multi-Currency Portfolio Analysis</h2>
        </div>
        <p className="text-gray-700">Analyze your portfolio across multiple currencies and optimize currency exposure</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('analysis')}
          className={`px-4 py-2 font-medium ${activeTab === 'analysis' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Currency Analysis
        </button>
        <button
          onClick={() => setActiveTab('exposure')}
          className={`px-4 py-2 font-medium ${activeTab === 'exposure' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Exposure
        </button>
        <button
          onClick={() => setActiveTab('hedging')}
          className={`px-4 py-2 font-medium ${activeTab === 'hedging' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Hedging Strategy
        </button>
      </div>

      {/* Analysis Tab */}
      {activeTab === 'analysis' && analysis && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Portfolio by Currency</h3>
            <div className="text-2xl font-bold text-purple-900 mb-2">
              ${analysis.totalPortfolioValue?.toFixed(2) || '0'}
            </div>
            <p className="text-sm text-gray-600 mb-4">Base Currency: {analysis.baseCurrency}</p>

            <div className="space-y-3">
              {Object.entries(analysis.currencyAllocations || {}).map(([currency, data]: any) => (
                <div key={currency} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <span className="font-semibold text-gray-900">{currency}</span>
                      <span className={`ml-2 inline-block text-xs font-semibold px-2.5 py-0.5 rounded ${getVolatilityBadge(data.volatility || 0)}`}>
                        Vol: {((data.volatility || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900">
                      {data.percent?.toFixed(1) || '0'}%
                    </span>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full"
                      style={{ width: `${Math.min(data.percent || 0, 100)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                    <div>
                      <span className="text-gray-600">Value:</span>
                      <p className="font-medium">${data.valueInBaseCurrency?.toFixed(2) || '0'}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Holdings:</span>
                      <p className="font-medium">{data.holdings?.length || 0} assets</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Exposure Tab */}
      {activeTab === 'exposure' && exposure && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Currency Exposure Summary</h3>

            {exposure.hedgingNeeded && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-start">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
                <p className="text-yellow-800">
                  High concentration in non-base currencies. Consider hedging to manage currency risk.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {exposure.currencies?.map((curr: CurrencyAllocation) => (
                <div key={curr.currency} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center">
                    <span className="font-semibold text-gray-900 w-12">{curr.currency}</span>
                    <div className="ml-4">
                      <div className="w-48 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${curr.percent > 40 ? 'bg-red-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(curr.percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{curr.percent.toFixed(1)}%</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Vol: {(curr.volatility * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hedging Strategy Tab */}
      {activeTab === 'hedging' && hedgingStrategy && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <Shield className="w-5 h-5 text-blue-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Hedging Recommendations</h3>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Total Exposures: {hedgingStrategy.totalExposure} | High Volatility: {hedgingStrategy.highVolatilityCurrencies}
            </p>

            {hedgingStrategy.recommendations?.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No hedging recommendations at this time</p>
              </div>
            ) : (
              <div className="space-y-3">
                {hedgingStrategy.recommendations?.map((rec: HedgingRecommendation) => (
                  <div
                    key={rec.currency}
                    className={`p-4 border rounded-lg ${
                      rec.recommendation === 'CONSIDER_HEDGE'
                        ? 'bg-orange-50 border-orange-200'
                        : 'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-900">{rec.currency}</span>
                      <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded ${
                        rec.recommendation === 'CONSIDER_HEDGE'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {rec.recommendation}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Exposure:</span>
                        <p className="font-medium">{rec.exposure.toFixed(1)}%</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Volatility:</span>
                        <p className="font-medium">{(rec.volatility * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Suggested:</span>
                        <p className="font-medium">{rec.suggestedHedge}</p>
                      </div>
                    </div>

                    {rec.recommendation === 'CONSIDER_HEDGE' && (
                      <p className="text-xs text-gray-700 mt-2">
                        Hedge {rec.hedgePercent.toFixed(0)}% of exposure using {rec.suggestedHedge}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiCurrencyAnalysis;
