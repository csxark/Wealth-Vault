import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  BarChart3,
  Plus,
  RefreshCw,
  Target,
  AlertTriangle,
  Grid3x3,
  Receipt,
  Activity
} from 'lucide-react';
import { investmentsAPI, Portfolio, Investment } from '../../services/api';

interface PortfolioDashboardProps {
  portfolioId?: string;
}

const PortfolioDashboard: React.FC<PortfolioDashboardProps> = ({ portfolioId }) => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingPrices, setUpdatingPrices] = useState(false);

  useEffect(() => {
    loadPortfolios();
  }, []);

  useEffect(() => {
    if (portfolioId) {
      loadPortfolioSummary(portfolioId);
    } else if (portfolios.length > 0) {
      loadPortfolioSummary(portfolios[0].id);
    }
  }, [portfolioId, portfolios]);

  const loadPortfolios = async () => {
    try {
      const response = await investmentsAPI.portfolios.getAll();
      setPortfolios(response.data);
    } catch (error) {
      console.error('Error loading portfolios:', error);
    }
  };

  const loadPortfolioSummary = async (id: string) => {
    try {
      setLoading(true);
      const response = await investmentsAPI.portfolios.getSummary(id);
      setSelectedPortfolio(response.data.portfolio);
      setInvestments(response.data.investments);
    } catch (error) {
      console.error('Error loading portfolio summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePrices = async () => {
    if (!selectedPortfolio) return;

    try {
      setUpdatingPrices(true);
      await investmentsAPI.portfolios.updatePrices(selectedPortfolio.id);
      // Reload portfolio data
      await loadPortfolioSummary(selectedPortfolio.id);
    } catch (error) {
      console.error('Error updating prices:', error);
    } finally {
      setUpdatingPrices(false);
    }
  };

  const formatCurrency = (amount: string | number, currency: string = 'USD') => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(numAmount);
  };

  const formatPercent = (value: string | number) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return `${numValue >= 0 ? '+' : ''}${numValue.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!selectedPortfolio) {
    return (
      <div className="text-center py-12">
        <PieChart className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No portfolios found</h3>
        <p className="mt-1 text-sm text-gray-500">Create your first portfolio to get started.</p>
        <div className="mt-6">
          <button className="bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 transition flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>Create Portfolio</span>
          </button>
        </div>
      </div>
    );
  }

  const totalValue = parseFloat(selectedPortfolio.totalValue);
  const totalCost = parseFloat(selectedPortfolio.totalCost);
  const totalGainLoss = parseFloat(selectedPortfolio.totalGainLoss);
  const totalGainLossPercent = parseFloat(selectedPortfolio.totalGainLossPercent);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{selectedPortfolio.name}</h1>
          <p className="text-gray-600">{selectedPortfolio.description}</p>
        </div>
        <div className="flex space-x-2">
          <button
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            onClick={updatePrices}
            disabled={updatingPrices}
          >
            <RefreshCw className={`h-4 w-4 ${updatingPrices ? 'animate-spin' : ''}`} />
            <span>Update Prices</span>
          </button>
          <button className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>Add Investment</span>
          </button>
        </div>
      </div>

      {/* Portfolio Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Total Value</h3>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </div>
          <div className="pt-2">
            <div className="text-2xl font-bold">{formatCurrency(totalValue, selectedPortfolio.currency)}</div>
            <p className="text-xs text-gray-500">
              {investments.length} investments
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Total Cost</h3>
            <Target className="h-4 w-4 text-gray-500" />
          </div>
          <div className="pt-2">
            <div className="text-2xl font-bold">{formatCurrency(totalCost, selectedPortfolio.currency)}</div>
            <p className="text-xs text-gray-500">
              Initial investment
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Total Return</h3>
            {totalGainLoss >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </div>
          <div className="pt-2">
            <div className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalGainLoss, selectedPortfolio.currency)}
            </div>
            <p className={`text-xs ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercent(totalGainLossPercent)}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-white/20 dark:border-slate-800/50 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Risk Level</h3>
            <AlertTriangle className="h-4 w-4 text-gray-500" />
          </div>
          <div className="pt-2">
            <div className="text-2xl font-bold capitalize">{selectedPortfolio.riskTolerance}</div>
            <p className="text-xs text-gray-500">
              {selectedPortfolio.investmentStrategy || 'No strategy set'}
            </p>
          </div>
        </div>
      </div>

      {/* Portfolio Content */}
      <Tabs defaultValue="investments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="investments">Investments</TabsTrigger>
          <TabsTrigger value="allocation">Allocation</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="investments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Investment Holdings</CardTitle>
              <CardDescription>
                Your current investment positions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {investments.map((investment) => {
                  const marketValue = parseFloat(investment.marketValue || '0');
                  const unrealizedGainLoss = parseFloat(investment.unrealizedGainLoss || '0');
                  const unrealizedGainLossPercent = parseFloat(investment.unrealizedGainLossPercent || '0');

                  return (
                    <div key={investment.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium">{investment.symbol}</h3>
                          <Badge variant="secondary">{investment.type}</Badge>
                          <Badge variant="outline">{investment.assetClass}</Badge>
                        </div>
                        <p className="text-sm text-gray-600">{investment.name}</p>
                        <div className="flex items-center space-x-4 mt-2 text-sm">
                          <span>Quantity: {parseFloat(investment.quantity).toFixed(4)}</span>
                          <span>Avg Cost: {formatCurrency(investment.averageCost, investment.currency)}</span>
                          <span>Market Value: {formatCurrency(marketValue, investment.currency)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-medium ${unrealizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(unrealizedGainLoss, investment.currency)}
                        </div>
                        <div className={`text-sm ${unrealizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatPercent(unrealizedGainLossPercent)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Asset Allocation</CardTitle>
              <CardDescription>
                Breakdown of your portfolio by asset class
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* This would be populated with actual allocation data */}
                <div className="text-center py-8 text-gray-500">
                  <PieChart className="mx-auto h-12 w-12 mb-4" />
                  <p>Allocation chart will be displayed here</p>
                  <p className="text-sm">Data will be loaded from portfolio analytics</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Overview</CardTitle>
              <CardDescription>
                Historical performance and analytics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* This would be populated with performance charts */}
                <div className="text-center py-8 text-gray-500">
                  <BarChart3 className="mx-auto h-12 w-12 mb-4" />
                  <p>Performance charts will be displayed here</p>
                  <p className="text-sm">Data will be loaded from portfolio analytics</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PortfolioDashboard;
