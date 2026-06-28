import React, { useState, useEffect } from 'react';
import { AlertCircle, TrendingDown, Leaf, Calendar, DollarSign, CheckCircle2 } from 'lucide-react';

interface TaxLot {
  id: string;
  assetSymbol: string;
  quantity: number;
  costBasis: number;
  currentValue: number;
  unrealizedGain: number;
  daysHeld: number;
  isLongTerm: boolean;
  canBeHarvested: boolean;
  harvestValue: number;
}

interface HarvestingOpportunity {
  lotId: string;
  assetSymbol: string;
  harvestValue: number;
  daysHeld: number;
  replacementAssets: string[];
  recommendation: string;
}

interface TaxLossHarvestingProps {
  userId: string;
}

const TaxLossHarvesting: React.FC<TaxLossHarvestingProps> = ({ userId }) => {
  const [opportunities, setOpportunities] = useState<HarvestingOpportunity[]>([]);
  const [yearEndStrategy, setYearEndStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunities, setSelectedOpportunities] = useState<Set<string>>(new Set());
  const [estimatedTaxSavings, setEstimatedTaxSavings] = useState(0);

  useEffect(() => {
    loadHarvestingData();
  }, [userId]);

  const loadHarvestingData = async () => {
    try {
      setLoading(true);
      
      // Fetch harvesting opportunities
      const response = await fetch('/api/rebalancing/harvesting/opportunities', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setOpportunities(data.data.opportunities);
      }

      // Fetch year-end strategy
      const strategyResponse = await fetch('/api/rebalancing/harvesting/year-end-strategy', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      
      if (strategyResponse.ok) {
        const data = await strategyResponse.json();
        setYearEndStrategy(data.data.strategy);
      }
    } catch (error) {
      console.error('Error loading tax-loss harvesting data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOpportunity = (lotId: string) => {
    const newSelected = new Set(selectedOpportunities);
    if (newSelected.has(lotId)) {
      newSelected.delete(lotId);
    } else {
      newSelected.add(lotId);
    }
    setSelectedOpportunities(newSelected);

    // Calculate total tax savings
    const total = opportunities
      .filter(op => newSelected.has(op.lotId))
      .reduce((sum, op) => sum + op.harvestValue * 0.35, 0); // 35% combined tax rate

    setEstimatedTaxSavings(total);
  };

  const handleExecuteHarvest = async () => {
    if (selectedOpportunities.size === 0) return;

    // Here, call the API to execute the harvest
    console.log('Executing harvest for lots:', Array.from(selectedOpportunities));
  };

  if (loading) {
    return <div className="animate-pulse">Loading tax-loss harvesting opportunities...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-center mb-3">
          <Leaf className="w-6 h-6 text-green-600 mr-3" />
          <h2 className="text-2xl font-bold text-gray-900">Tax-Loss Harvesting</h2>
        </div>
        <p className="text-gray-700">Automatically identify and execute tax-loss harvesting trades to offset capital gains</p>
      </div>

      {yearEndStrategy && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Year-End Strategy</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Realized Gains/Losses</p>
              <p className="text-2xl font-bold text-blue-900">
                ${yearEndStrategy.currentYearSummary?.netGains?.toFixed(2) || '0'}
              </p>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Recommended Harvest</p>
              <p className="text-2xl font-bold text-green-900">
                ${yearEndStrategy.harvestingStrategy?.recommendedHarvest?.toFixed(2) || '0'}
              </p>
            </div>
            
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Estimated Tax Savings</p>
              <p className="text-2xl font-bold text-purple-900">
                ${yearEndStrategy.harvestingStrategy?.estimatedTaxSavings?.toFixed(2) || '0'}
              </p>
            </div>
            
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Total Harvestable</p>
              <p className="text-2xl font-bold text-orange-900">
                ${yearEndStrategy.harvestingStrategy?.totalHarvestable?.toFixed(2) || '0'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Opportunities List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Harvesting Opportunities</h3>
          <span className="text-sm text-gray-600">{opportunities.length} found</span>
        </div>

        <div className="space-y-3">
          {opportunities.map((opp) => (
            <div
              key={opp.lotId}
              className="flex items-start p-4 border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedOpportunities.has(opp.lotId)}
                onChange={() => handleSelectOpportunity(opp.lotId)}
                className="mt-1 mr-4 w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              
              <div className="flex-1">
                <div className="flex items-center mb-2">
                  <span className="font-semibold text-gray-900">{opp.assetSymbol}</span>
                  <span className="ml-2 inline-block bg-red-100 text-red-800 text-xs font-semibold px-2.5 py-0.5 rounded">
                    Loss: ${Math.abs(opp.harvestValue).toFixed(2)}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Days Held:</span>
                    <p className="font-medium">{opp.daysHeld} days</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Long-term:</span>
                    <p className="font-medium">{opp.daysHeld >= 365 ? 'Yes' : 'No (short-term)'}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Replacement Assets:</span>
                    <p className="font-medium">{opp.replacementAssets.join(', ')}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Tax Saving:</span>
                    <p className="font-medium text-green-700">${(opp.harvestValue * 0.35).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {opportunities.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
            <p>No tax-loss harvesting opportunities available at this time</p>
          </div>
        )}
      </div>

      {/* Action Summary */}
      {selectedOpportunities.size > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700">
                {selectedOpportunities.size} position(s) selected
              </p>
              <p className="text-lg font-bold text-green-900">
                Est. Tax Savings: ${estimatedTaxSavings.toFixed(2)}
              </p>
            </div>
            <button
              onClick={handleExecuteHarvest}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
            >
              Execute Harvest
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxLossHarvesting;
