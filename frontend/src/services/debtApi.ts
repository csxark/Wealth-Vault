import api from './api';

export type DebtType = 'credit_card' | 'student_loan' | 'car_loan' | 'mortgage' | 'personal_loan' | 'medical' | 'other';
export type DebtStatus = 'active' | 'paid_off' | 'defaulted' | 'in_collection';

export interface Debt {
  id: string;
  userId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  type: DebtType;
  lender: string | null;
  originalBalance: string;
  currentBalance: string;
  interestRate: number;
  minimumPayment: string;
  dueDate: string | null;
  startDate: string;
  estimatedPayoffDate: string | null;
  isPriority: boolean;
  status: DebtStatus;
  currency: string;
  accountNumber: string | null;
  notes: string | null;
  tags: string[];
  metadata: {
    totalPaid: number;
    totalInterestPaid: number;
    paymentCount: number;
    lastPaymentDate: string | null;
    interestCompounding: 'daily' | 'monthly' | 'yearly';
    autopayEnabled: boolean;
  };
  category?: {
    name: string;
    color: string;
    icon: string;
  };
  payments?: DebtPayment[];
  createdAt: string;
  updatedAt: string;
}

export interface DebtPayment {
  id: string;
  debtId: string;
  userId: string;
  amount: string;
  principalAmount: string | null;
  interestAmount: string | null;
  paymentDate: string;
  paymentMethod: string;
  isExtraPayment: boolean;
  notes: string | null;
  metadata: {
    balanceBefore: string;
    balanceAfter: string;
    confirmationNumber: string | null;
  };
  debt?: {
    name: string;
    type: DebtType;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PayoffStrategy {
  strategy: 'snowball' | 'avalanche';
  monthsToPayoff: number;
  payoffDate: string;
  totalInterest: number;
  totalPayments: number;
  payoffOrder: {
    debtId: string;
    name: string;
    paidOffMonth: number;
    totalPaid: number;
  }[];
  simulation: {
    month: number;
    totalBalance: number;
    totalInterest: number;
    payments: number;
  }[];
  monthlyPayment: number;
}

export interface PayoffStrategies {
  snowball: PayoffStrategy;
  avalanche: PayoffStrategy;
  recommendation: {
    method: 'snowball' | 'avalanche';
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  };
  comparison: {
    interestSavings: number;
    timeDifference: number;
    fasterMethod: 'snowball' | 'avalanche';
  };
}

export interface DebtAnalytics {
  summary: {
    totalDebts: number;
    activeDebts: number;
    paidOffDebts: number;
    totalOriginalBalance: number;
    totalCurrentBalance: number;
    totalPaid: number;
    totalInterestPaid: number;
    progressPercentage: number;
    averageInterestRate: number;
    totalMonthlyPayments: number;
  };
  byType: {
    type: string;
    count: number;
    balance: number;
    original: number;
    progress: number;
  }[];
  recentPayments: DebtPayment[];
}

export const debtApi = {
  // Get all debts
  getDebts: async (filters?: {
    status?: string;
    type?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<Debt[]> => {
    const response = await api.get('/debts', { params: filters });
    return response.data.data;
  },

  // Get debt by ID
  getDebt: async (id: string): Promise<Debt> => {
    const response = await api.get(`/debts/${id}`);
    return response.data.data;
  },

  // Create new debt
  createDebt: async (data: Partial<Debt>): Promise<Debt> => {
    const response = await api.post('/debts', data);
    return response.data.data;
  },

  // Update debt
  updateDebt: async (id: string, data: Partial<Debt>): Promise<Debt> => {
    const response = await api.put(`/debts/${id}`, data);
    return response.data.data;
  },

  // Delete debt
  deleteDebt: async (id: string): Promise<void> => {
    await api.delete(`/debts/${id}`);
  },

  // Get debt analytics
  getAnalytics: async (): Promise<DebtAnalytics> => {
    const response = await api.get('/debts/analytics');
    return response.data.data;
  },

  // Get payoff strategies
  getPayoffStrategies: async (extraPayment?: number): Promise<PayoffStrategies> => {
    const response = await api.get('/debts/payoff-strategies', { 
      params: { extraPayment } 
    });
    return response.data.data;
  },

  // Get payment history for a debt
  getPaymentHistory: async (debtId: string): Promise<DebtPayment[]> => {
    const response = await api.get(`/debts/${debtId}/payments`);
    return response.data.data;
  },

  // Record a payment
  recordPayment: async (debtId: string, data: {
    amount: number;
    paymentDate?: string;
    paymentMethod?: string;
    isExtraPayment?: boolean;
    notes?: string;
    principalAmount?: number;
    interestAmount?: number;
  }): Promise<{ payment: DebtPayment; debt: Debt }> => {
    const response = await api.post(`/debts/${debtId}/payments`, data);
    return response.data.data;
  }
};

export default debtApi;
