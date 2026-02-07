import React, { useState, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import axios from 'axios';
import { TrendingUp, AlertTriangle, Target, Calculator } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface ForecastData {
  date: string;
  predictedAmount: number;
  month: string;
  confidenceLower?: number;
  confidenceUpper?: number;
}

interface Forecast {
  forecastId: string;
  predictions: ForecastData[];
  confidenceIntervals: any[];
  accuracy: number;
  metadata: any;
}

export const Forecasting: React.FC = () => {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [simulationInputs, setSimulationInputs] = useState({
    incomeChange: 0,
    expenseAdjustments: [],
    oneTimeExpenses: []
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'forecast' | 'simulation'>('forecast');

  useEffect(() => {
    generateForecast();
  }, []);

  const generateForecast = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/api/budgets/forecast', {
        monthsAhead: 6,
        scenario: 'baseline',
        seasonalAdjustment: true
      });
      setForecast(response.data.data);
    } catch (error) {
      console.error('Error generating forecast:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSimulation = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/api/budgets/forecast/simulation', {
        simulationInputs
      });
      setForecast(response.data.data);
    } catch (error) {
      console.error('Error generating simulation:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartData = forecast ? {
    labels: forecast.predictions.map(p => p.month),
    datasets: [
      {
        label: 'Predicted Expenses',
        data: forecast.predictions.map(p => p.predictedAmount),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      },
      ...(forecast.confidenceIntervals && forecast.confidenceIntervals.length > 0 ? [
        {
          label: 'Confidence Upper',
          data: forecast.confidenceIntervals.map(ci => ci.upperBound),
          borderColor: 'rgba(156, 163, 175, 0.5)',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          pointRadius: 0,
        },
        {
          label: 'Confidence Lower',
          data: forecast.confidenceIntervals.map(ci => ci.lowerBound),
          borderColor: 'rgba(156, 163, 175, 0.5)',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          pointRadius: 0,
          fill: '-1', // Fill to previous dataset
        }
      ] : [])
    ],
  } : null;

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Expense Forecast',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return '$' + value.toFixed(0);
          }
        }
      }
    }
  };

  const addExpenseAdjustment = () => {
    setSimulationInputs(prev => ({
      ...prev,
      expenseAdjustments: [...prev.expenseAdjustments, { category: '', percentage: 0 }]
    }));
  };

  const updateExpenseAdjustment = (index: number, field: string, value: any) => {
    setSimulationInputs(prev => ({
      ...prev,
      expenseAdjustments: prev.expenseAdjustments.map((adj, i) =>
        i === index ? { ...adj, [field]: value } : adj
      )
    }));
  };

  const removeExpenseAdjustment = (index: number) => {
    setSimulationInputs(prev => ({
      ...prev,
      expenseAdjustments: prev.expenseAdjustments.filter((_, i) => i !== index)
    }));
  };

  const addOneTimeExpense = () => {
    setSimulationInputs(prev => ({
      ...prev,
      oneTimeExpenses: [...prev.oneTimeExpenses, { description: '', amount: 0, date: '' }]
    }));
  };

  const updateOneTimeExpense = (index: number, field: string, value: any) => {
    setSimulationInputs(prev => ({
      ...prev,
      oneTimeExpenses: prev.oneTimeExpenses.map((exp, i) =>
        i === index ? { ...exp, [field]: value } : exp
      )
    }));
  };

  const removeOneTimeExpense = (index: number) => {
    setSimulationInputs(prev => ({
      ...prev,
      oneTimeExpenses: prev.oneTimeExpenses.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-blue-600" />
            Budget Forecasting
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            AI-powered predictions for your future expenses
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('forecast')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'forecast'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Expense Forecast
          </button>
          <button
            onClick={() => setActiveTab('simulation')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'simulation'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            What-If Scenarios
          </button>
        </nav>
      </div>

      {activeTab === 'forecast' && (
        <div className="space-y-6">
          {/* Forecast Controls */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Generate Forecast
              </h2>
              <button
                onClick={generateForecast}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                <Calculator className="h-4 w-4" />
                {loading ? 'Generating...' : 'Generate Forecast'}
              </button>
            </div>

            {forecast && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-600" />
                    <span className="text-sm font-medium text-blue-600">Accuracy</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                    {(forecast.accuracy * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Next Month</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                    ${forecast.predictions[0]?.predictedAmount.toFixed(0) || '0'}
                  </p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    <span className="text-sm font-medium text-orange-600">Risk Level</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                    {forecast.accuracy > 0.8 ? 'Low' : forecast.accuracy > 0.6 ? 'Medium' : 'High'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Forecast Chart */}
          {forecast && chartData && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <Line data={chartData} options={chartOptions} />
            </div>
          )}

          {/* Forecast Details */}
          {forecast && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Forecast Details
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Month
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Predicted Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Confidence Range
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {forecast.predictions.map((prediction, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {prediction.month}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                          ${prediction.predictedAmount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                          {forecast.confidenceIntervals[index] ?
                            `$${forecast.confidenceIntervals[index].lowerBound.toFixed(0)} - $${forecast.confidenceIntervals[index].upperBound.toFixed(0)}` :
                            'N/A'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'simulation' && (
        <div className="space-y-6">
          {/* Simulation Controls */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              What-If Scenario Builder
            </h2>

            <div className="space-y-6">
              {/* Income Change */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Income Change (%)
                </label>
                <input
                  type="number"
                  value={simulationInputs.incomeChange}
                  onChange={(e) => setSimulationInputs(prev => ({ ...prev, incomeChange: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="e.g., 10 for 10% increase"
                />
              </div>

              {/* Expense Adjustments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Expense Adjustments
                  </label>
                  <button
                    onClick={addExpenseAdjustment}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    + Add Adjustment
                  </button>
                </div>
                {simulationInputs.expenseAdjustments.map((adjustment, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Category"
                      value={adjustment.category}
                      onChange={(e) => updateExpenseAdjustment(index, 'category', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <input
                      type="number"
                      placeholder="Percentage"
                      value={adjustment.percentage}
                      onChange={(e) => updateExpenseAdjustment(index, 'percentage', parseFloat(e.target.value) || 0)}
                      className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      onClick={() => removeExpenseAdjustment(index)}
                      className="text-red-600 hover:text-red-800 px-2"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* One-time Expenses */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    One-time Expenses
                  </label>
                  <button
                    onClick={addOneTimeExpense}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    + Add Expense
                  </button>
                </div>
                {simulationInputs.oneTimeExpenses.map((expense, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Description"
                      value={expense.description}
                      onChange={(e) => updateOneTimeExpense(index, 'description', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={expense.amount}
                      onChange={(e) => updateOneTimeExpense(index, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <input
                      type="date"
                      value={expense.date}
                      onChange={(e) => updateOneTimeExpense(index, 'date', e.target.value)}
                      className="w-36 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      onClick={() => removeOneTimeExpense(index)}
                      className="text-red-600 hover:text-red-800 px-2"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={generateSimulation}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Calculator className="h-4 w-4" />
                {loading ? 'Running Simulation...' : 'Run Simulation'}
              </button>
            </div>
          </div>

          {/* Simulation Results */}
          {forecast && chartData && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Simulation Results
              </h3>
              <Line data={chartData} options={chartOptions} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
