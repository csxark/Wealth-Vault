import React, { useState, useEffect } from 'react';
import { Zap, BarChart3, TrendingUp, AlertCircle } from 'lucide-react';

interface Scenario {
  name: string;
  threshold: number;
  maxSlippage: number;
  prioritizeTaxLoss: boolean;
  description: string;
}

interface RebalancingScenario {
  name: string;
  moves: any[];
  estimatedCost: number;
  totalValue: number;
  costPercent: number;
  expectedDriftReduction: number;
  efficiency: number;
  recommendation: string;
}

interface RebalancingOptimizationProps {
  allocationId: string;
  userId: string;
}

const RebalancingOptimization: React.FC<RebalancingOptimizationProps> = ({ allocationId, userId }) => {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('Moderate');
  const [loading, setLoading] = useState(true);
  const [scenarioResults, setScenarioResults] = useState<Record<string, RebalancingScenario>>({});
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    loadScenarios();
  }, [allocationId]);

  const loadScenarios = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/rebalancing/optimization/scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ allocationId }),
      });

      if (response.ok) {
        const data = await response.json();
        setScenarios(data.data.scenarios);

        // Load efficiency scores for each scenario
        for (const scenario of data.data.scenarios) {
          await loadScenarioEfficiency(scenario.name);
        }
      }
    } catch (error) {
      console.error('Error loading scenarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadScenarioEfficiency = async (scenarioName: string) => {
    try {
      const response = await fetch('/api/rebalancing/optimization/efficiency', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          allocationId,
          scenarioName,
          moves: [], // In production, would include actual moves
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setScenarioResults((prev) => ({
          ...prev,
          [scenarioName]: data.data.efficiency,
        }));
      }
    } catch (error) {
      console.error('Error loading scenario efficiency:', error);
    }
  };

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency > 10) return 'bg-green-100 text-green-800';
    if (efficiency > 5) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'RECOMMEND':
        return 'bg-green-50 border-green-200';
      case 'ACCEPTABLE':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  if (loading) {
    return <div className="animate-pulse">Loading optimization scenarios...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-center mb-3">
          <Zap className="w-6 h-6 text-blue-600 mr-3" />
          <h2 className="text-2xl font-bold text-gray-900">Rebalancing Optimization</h2>
        </div>
        <p className="text-gray-700">Compare different rebalancing strategies and choose the best fit for your needs</p>
      </div>

      {/* Scenario Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenarios.map((scenario) => {
          const efficiency = scenarioResults[scenario.name];
          const isSelected = selectedScenario === scenario.name;

          return (
            <div
              key={scenario.name}
              onClick={() => setSelectedScenario(scenario.name)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{scenario.name}</h3>
              <p className="text-sm text-gray-600 mb-3">{scenario.description}</p>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Drift Threshold:</span>
                  <span className="font-medium">{(scenario.threshold * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Max Slippage:</span>
                  <span className="font-medium">{(scenario.maxSlippage * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tax Loss Priority:</span>
                  <span className="font-medium">{scenario.prioritizeTaxLoss ? 'Yes' : 'No'}</span>
                </div>
              </div>

              {efficiency && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded ${getEfficiencyColor(efficiency.efficiencyScore)}`}>
                    Efficiency: {efficiency.efficiencyScore.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed Analysis */}
      {scenarioResults[selectedScenario] && (
        <div className={`border-2 rounded-lg p-6 ${getRecommendationColor(scenarioResults[selectedScenario].recommendation)}`}>
          <div className="flex items-start mb-4">
            <BarChart3 className="w-6 h-6 text-blue-600 mr-3 mt-1" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedScenario} Scenario Analysis
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Detailed breakdown of expected outcome for this strategy
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Estimated Cost</p>
              <p className="text-2xl font-bold text-gray-900">
                ${scenarioResults[selectedScenario]?.totalEstimatedCost?.toFixed(2) || '0'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {scenarioResults[selectedScenario]?.averageCostPercent?.toFixed(2) || '0'}% of portfolio value
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Projected Drift Reduction</p>
              <p className="text-2xl font-bold text-green-600">
                {scenarioResults[selectedScenario]?.driftReduction?.toFixed(2) || '0'}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Current: {scenarioResults[selectedScenario]?.currentDrift?.toFixed(2) || '0'}% → 
                Target: {scenarioResults[selectedScenario]?.projectedDrift?.toFixed(2) || '0'}%
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Efficiency Score</p>
              <p className="text-2xl font-bold text-blue-600">
                {scenarioResults[selectedScenario]?.efficiencyScore?.toFixed(2) || '0'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Drift reduction vs. cost ratio
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Total Moves</p>
              <p className="text-2xl font-bold text-gray-900">
                {scenarioResults[selectedScenario]?.moveCount || '0'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Trades required
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-300">
            <div className="flex items-center">
              <span className={`inline-block text-sm font-bold px-3 py-1 rounded-lg ${
                scenarioResults[selectedScenario]?.recommendation === 'RECOMMEND'
                  ? 'bg-green-100 text-green-800'
                  : scenarioResults[selectedScenario]?.recommendation === 'ACCEPTABLE'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
              }`}>
                {scenarioResults[selectedScenario]?.recommendation || 'SKIP'}
              </span>
              <p className="text-sm text-gray-700 ml-3">
                This scenario is {
                  scenarioResults[selectedScenario]?.recommendation === 'RECOMMEND'
                    ? 'strongly recommended'
                    : scenarioResults[selectedScenario]?.recommendation === 'ACCEPTABLE'
                      ? 'acceptable'
                      : 'not recommended'
                } for execution
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-3">
        <button
          onClick={() => setShowValidation(true)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
        >
          Validate Moves
        </button>
        <button
          className="px-6 py-2 bg-white border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-semibold"
        >
          Export Analysis
        </button>
      </div>

      {/* Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
        <AlertCircle className="w-5 h-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold">Optimization Tips:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Conservative scenario minimizes costs but may leave some drift</li>
            <li>Moderate scenario provides balanced approach (recommended)</li>
            <li>Aggressive scenario maintains precise allocations at higher cost</li>
            <li>Tax-Optimized scenario prioritizes tax efficiency</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default RebalancingOptimization;
