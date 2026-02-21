import apiRequest from './api';

// Types for Subscription Tracker API
export interface SubscriptionDashboard {
  summary: {
    totalSubscriptions: number;
    totalMonthly: number;
    totalAnnual: number;
    averagePerSubscription: number;
  };
  upcomingRenewals: Array<{
    id: string;
    serviceName: string;
    cost: string;
    frequency: string;
    monthlyAmount: number;
    renewalDate: string;
    daysUntilRenewal: number;
  }>;
  recentSubscriptions: any[];
  byCategory: Array<{
    categoryName: string;
    color: string;
    icon: string;
    totalMonthly: number;
    totalAnnual: number;
    count: number;
  }>;
  trialEnding: any[];
  spendingByDay: Record<string, number>;
  topExpensive: any[];
}

export interface HealthScore {
  score: number;
  rating: string;
  factors: Array<{
    name: string;
    impact: number;
    message: string;
  }>;
  recommendations: string[];
  summary: {
    totalSubscriptions: number;
    activeTrials: number;
    autoRenewals: number;
    duplicates: number;
  };
}

export interface SubscriptionCalendar {
  year: number;
  month: number;
  totalProjected: number;
  calendar: Array<{
    day: number;
    items: any[];
  }>;
}

export interface SubscriptionForecast {
  forecast: Array<{
    month: string;
    date: string;
    total: number;
    subscriptionCount: number;
    subscriptions: any[];
  }>;
  summary: {
    totalSixMonths: number;
    averageMonthly: number;
    highestMonth: any;
    lowestMonth: any;
  };
}

export interface Detection {
  serviceName: string;
  description: string;
  isSubscription: boolean;
  confidence: number;
  averageAmount: number;
  amountVariance: number;
  frequency: string;
  occurrenceCount: number;
  firstDate: string;
  lastDate: string;
  expenseIds: string[];
  isConsistentAmount: boolean;
  isRecurring: boolean;
  knownMatch: string | null;
  isExisting: boolean;
  suggestedCategory: string;
  suggestedFrequency: string;
}

export interface DetectionResult {
  detections: Detection[];
  summary: {
    totalDetections: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    totalPotentialMonthly: number;
    totalPotentialAnnual: number;
  };
}

export interface AnalyzerReport {
  generatedAt: string;
  healthScore: {
    score: number;
    rating: string;
    factors: Array<{
      factor: string;
      impact: number;
    }>;
  };
  spendingPatterns: any;
  categoryDistribution: any;
  paymentMethods: any;
  unusualPatterns: any;
  recommendations: any[];
}

export interface OptimizationRecommendation {
  subscriptionId: string;
  serviceName: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  potentialMonthlySavings: number;
  action: string;
}

// Subscription Tracker API
export const subscriptionTrackerAPI = {
  // Dashboard
  getDashboard: async () => {
    return apiRequest<{ success: boolean; data: SubscriptionDashboard }>(
      '/subscription-tracker/dashboard',
      { method: 'GET' }
    );
  },

  // Health Score
  getHealthScore: async () => {
    return apiRequest<{ success: boolean; data: HealthScore }>(
      '/subscription-tracker/health-score',
      { method: 'GET' }
    );
  },

  // Calendar
  getCalendar: async (year: number, month: number) => {
    return apiRequest<{ success: boolean; data: SubscriptionCalendar }>(
      `/subscription-tracker/calendar/${year}/${month}`,
      { method: 'GET' }
    );
  },

  // Forecast
  getForecast: async (months: number = 6) => {
    return apiRequest<{ success: boolean; data: SubscriptionForecast }>(
      '/subscription-tracker/forecast',
      { method: 'GET', params: { months } }
    );
  },

  // Insights
  getInsights: async () => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/insights',
      { method: 'GET' }
    );
  },

  // Compare periods
  comparePeriods: async (
    period1Start: string,
    period1End: string,
    period2Start: string,
    period2End: string
  ) => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/compare',
      {
        method: 'GET',
        params: { period1Start, period1End, period2Start, period2End },
      }
    );
  },

  // Export
  exportData: async (format: 'json' | 'csv' = 'json') => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/export',
      { method: 'GET', params: { format } }
    );
  },

  // Analyzer - Spending Patterns
  getSpendingPatterns: async (months: number = 6) => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/analyzer/spending-patterns',
      { method: 'GET', params: { months } }
    );
  },

  // Analyzer - Category Distribution
  getCategoryDistribution: async () => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/analyzer/category-distribution',
      { method: 'GET' }
    );
  },

  // Analyzer - Payment Methods
  getPaymentMethods: async () => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/analyzer/payment-methods',
      { method: 'GET' }
    );
  },

  // Analyzer - Unusual Patterns
  getUnusualPatterns: async () => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/analyzer/unusual-patterns',
      { method: 'GET' }
    );
  },

  // Analyzer - Full Report
  getAnalyzerReport: async () => {
    return apiRequest<{ success: boolean; data: AnalyzerReport }>(
      '/subscription-tracker/analyzer/report',
      { method: 'GET' }
    );
  },

  // Detection - Detect potential subscriptions
  detectPotentialSubscriptions: async (months: number = 6) => {
    return apiRequest<{ success: boolean; data: DetectionResult }>(
      '/subscription-tracker/detect',
      { method: 'GET', params: { months } }
    );
  },

  // Detection - Stats
  getDetectionStats: async () => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/detection-stats',
      { method: 'GET' }
    );
  },

  // Detection - Create from detection
  createFromDetection: async (data: {
    serviceName: string;
    averageAmount: number;
    suggestedFrequency: string;
    categoryId?: string;
    expenseIds?: string[];
    confidence?: number;
  }) => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/create-from-detection',
      { method: 'POST', data }
    );
  },

  // Detection - Recommendations
  getRecommendations: async () => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/recommendations',
      { method: 'GET' }
    );
  },

  // Optimization - Recommendations
  getOptimizationRecommendations: async () => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/optimization/recommendations',
      { method: 'GET' }
    );
  },

  // Optimization - Trends
  getOptimizationTrends: async (months: number = 6) => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/optimization/trends',
      { method: 'GET', params: { months } }
    );
  },

  // Optimization - Savings Summary
  getSavingsSummary: async () => {
    return apiRequest<{ success: boolean; data: any }>(
      '/subscription-tracker/optimization/savings-summary',
      { method: 'GET' }
    );
  },
};

export default subscriptionTrackerAPI;
