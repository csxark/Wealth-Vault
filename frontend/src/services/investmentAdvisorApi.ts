import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL;

// Types
export interface RiskProfile {
  id: string;
  userId: string;
  riskScore: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  investmentHorizon: 'short' | 'medium' | 'long';
  investmentExperience: 'beginner' | 'intermediate' | 'advanced';
  annualIncome: string;
  netWorth: string;
  liquidAssets: string;
  emergencyFundMonths: number;
  primaryGoal: 'growth' | 'income' | 'preservation' | 'balanced';
  retirementAge?: number;
  targetRetirementAmount?: string;
  monthlyInvestmentCapacity: string;
  hasDebt: boolean;
  debtAmount: string;
  hasDependents: boolean;
  dependentCount: number;
  hasOtherIncome: boolean;
  otherIncomeMonthly: string;
  understandsMarketVolatility: boolean;
  canAffordLosses: boolean;
  maxLossTolerance: string;
  assessmentDate: string;
  lastUpdated: string;
  isActive: boolean;
  metadata: Record<string, any>;
}

export interface RiskProfileWithAnalysis extends RiskProfile {
  hasProfile: boolean;
  message?: string;
  userContext?: {
    id: string;
    firstName: string;
    lastName: string;
    ageGroup: string;
    monthlyIncome: string;
  };
  analysis?: {
    score: number;
    tolerance: string;
    recommendation: {
      allocation: {
        stocks: number;
        bonds: number;
        cash: number;
        alternatives: number;
      };
      description: string;
      suitableFor: string;
    };
    factors: Array<{
      factor: string;
      contribution: number;
      reason: string;
    }>;
  };
}

export interface InvestmentRecommendation {
  id: string;
  userId: string;
  portfolioId?: string;
  type: 'buy' | 'sell' | 'hold' | 'diversify' | 'rebalance';
  symbol?: string;
  name?: string;
  reasoning: string;
  expectedReturn?: number;
  riskLevel: 'low' | 'medium' | 'high';
  confidence: number;
  timeHorizon: 'short' | 'medium' | 'long';
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'dismissed' | 'implemented';
  createdAt: string;
  expiresAt?: string;
}

export interface MarketInsight {
  id: string;
  title: string;
  summary: string;
  category: 'stocks' | 'bonds' | 'crypto' | 'economy' | 'sector';
  sentiment: 'bullish' | 'bearish' | 'neutral';
  source: string;
  publishedAt: string;
  relatedSymbols: string[];
  impact: 'high' | 'medium' | 'low';
}

export interface RiskAssessmentQuestion {
  id: string;
  question: string;
  type: 'select' | 'number' | 'boolean';
  options?: Array<{ value: string | number; label: string }>;
  placeholder?: string;
  yesLabel?: string;
  noLabel?: string;
}

export interface AllocationComparison {
  currentAllocation: Record<string, number>;
  recommendedAllocation: Record<string, number>;
  comparisons: Array<{
    assetClass: string;
    current: number;
    recommended: number;
    difference: number;
    status: 'balanced' | 'overweight' | 'underweight';
  }>;
  rebalancingNeeded: boolean;
  riskTolerance: string;
  overallRecommendation: {
    action: 'maintain' | 'rebalance';
    message: string;
    priority: 'high' | 'medium' | 'low';
  };
}

// API functions
const apiRequest = async <T>(endpoint: string, options: { method?: string; data?: unknown } = {}): Promise<T> => {
  const token = localStorage.getItem('authToken');
  
  const response = await axios({
    url: `${API_BASE_URL}${endpoint}`,
    method: options.method || 'GET',
    data: options.data,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  
  return response.data;
};

// Investment Advisor API
export const investmentAdvisorAPI = {
  // Get personalized recommendations
  getRecommendations: async (portfolioId?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (portfolioId) params.append('portfolioId', portfolioId);
    if (limit) params.append('limit', limit.toString());
    
    return apiRequest<{ success: boolean; data: InvestmentRecommendation[] }>(
      `/investments/advisor/recommendations?${params.toString()}`
    );
  },

  // Get portfolio analysis
  getPortfolioAnalysis: async (portfolioId?: string) => {
    const params = portfolioId ? `?portfolioId=${portfolioId}` : '';
    return apiRequest<{ success: boolean; data: unknown }>(
      `/investments/advisor/portfolio-analysis${params}`
    );
  },

  // Get user's risk profile
  getRiskProfile: async () => {
    return apiRequest<{ success: boolean; data: RiskProfileWithAnalysis }>(
      '/investments/advisor/risk-profile'
    );
  },

  // Create or update risk profile
  updateRiskProfile: async (profileData: Partial<RiskProfile>) => {
    return apiRequest<{ success: boolean; message: string; data: RiskProfile }>(
      '/investments/advisor/risk-profile',
      { method: 'POST', data: profileData }
    );
  },

  // Get risk assessment questions
  getRiskAssessmentQuestions: async () => {
    return apiRequest<{ success: boolean; data: RiskAssessmentQuestion[] }>(
      '/investments/advisor/risk-assessment/questions'
    );
  },

  // Calculate risk score without saving
  calculateRiskScore: async (answers: Record<string, unknown>) => {
    return apiRequest<{ success: boolean; data: {
      score: number;
      riskTolerance: string;
      factors: Array<{ factor: string; contribution: number; reason: string }>;
      recommendation: unknown;
    } }>(
      '/investments/advisor/risk-assessment/calculate',
      { method: 'POST', data: answers }
    );
  },

  // Compare current allocation with recommended
  compareAllocation: async (allocation: Record<string, number>) => {
    return apiRequest<{ success: boolean; data: AllocationComparison }>(
      '/investments/advisor/compare-allocation',
      { method: 'POST', data: { allocation } }
    );
  },

  // Get market insights
  getMarketInsights: async () => {
    return apiRequest<{ success: boolean; data: MarketInsight[] }>(
      '/investments/advisor/market-insights'
    );
  },
};

export default investmentAdvisorAPI;
