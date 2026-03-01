import api from './api';

export interface Bill {
  id: string;
  userId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  amount: string;
  currency: string;
  frequency: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one_time';
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'scheduled' | 'cancelled';
  autoPay: boolean;
  paymentMethod: string;
  reminderDays: number;
  smartScheduleEnabled: boolean;
  optimalPaymentDate: string | null;
  scheduledPaymentDate: string | null;
  lastPaidDate: string | null;
  payee: string | null;
  payeeAccount: string | null;
  isRecurring: boolean;
  endDate: string | null;
  tags: string[];
  notes: string | null;
  detectedFromExpense: boolean;
  detectionConfidence: number;
  sourceExpenseIds: string[];
  cashFlowAnalysis: {
    suggestedDate: string | null;
    confidence: number;
    reason: string | null;
  };
  metadata: {
    lastReminderSent: string | null;
    reminderCount: number;
    paymentHistory: any[];
    lateFeeAmount: number;
    gracePeriodDays: number;
  };
  category?: {
    name: string;
    color: string;
    icon: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BillDetection {
  isPotentialBill: boolean;
  billName: string;
  amount: string;
  frequency: string;
  category: string;
  averageInterval: number;
  transactionCount: number;
  firstDate: string;
  lastDate: string;
  nextDueDate: string;
  categoryId: string | null;
  confidence: number;
  expenseIds: string[];
}

export interface PaymentSuggestion {
  billId: string;
  billName: string;
  amount: string;
  dueDate: string;
  daysUntilDue: number;
  suggestedPaymentDate: string;
  alternativeDates: string[];
  cashFlowStatus: 'healthy' | 'tight' | 'unknown';
  reasoning: string;
}

export interface BillAnalytics {
  summary: {
    totalMonthly: number;
    totalAnnual: number;
    count: number;
    pending: number;
    paid: number;
    overdue: number;
  };
  byCategory: {
    categoryName: string;
    total: number;
    count: number;
  }[];
}

export const billApi = {
  // Get all bills
  getBills: async (filters?: {
    status?: string;
    categoryId?: string;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
  }): Promise<Bill[]> => {
    const response = await api.get('/bills', { params: filters });
    return response.data.data;
  },

  // Get upcoming bills
  getUpcomingBills: async (days?: number): Promise<Bill[]> => {
    const response = await api.get('/bills/upcoming', { params: { days } });
    return response.data.data;
  },

  // Get bill by ID
  getBill: async (id: string): Promise<Bill> => {
    const response = await api.get(`/bills/${id}`);
    return response.data.data;
  },

  // Create new bill
  createBill: async (data: Partial<Bill>): Promise<Bill> => {
    const response = await api.post('/bills', data);
    return response.data.data;
  },

  // Update bill
  updateBill: async (id: string, data: Partial<Bill>): Promise<Bill> => {
    const response = await api.put(`/bills/${id}`, data);
    return response.data.data;
  },

  // Delete bill
  deleteBill: async (id: string): Promise<void> => {
    await api.delete(`/bills/${id}`);
  },

  // Mark bill as paid
  payBill: async (id: string, paidDate?: string): Promise<Bill> => {
    const response = await api.post(`/bills/${id}/pay`, { paidDate });
    return response.data.data;
  },

  // Schedule payment
  schedulePayment: async (id: string, scheduledDate: string): Promise<Bill> => {
    const response = await api.post(`/bills/${id}/schedule`, { scheduledDate });
    return response.data.data;
  },

  // Toggle smart scheduling
  toggleSmartSchedule: async (id: string, enabled: boolean): Promise<{ bill: Bill; suggestions: PaymentSuggestion | null }> => {
    const response = await api.post(`/bills/${id}/smart-schedule`, { enabled });
    return {
      bill: response.data.data,
      suggestions: response.data.suggestions
    };
  },

  // Detect potential bills from transactions
  detectBills: async (months?: number): Promise<BillDetection[]> => {
    const response = await api.get('/bills/detect', { params: { months } });
    return response.data.data;
  },

  // Create bills from detections
  createFromDetections: async (detections: BillDetection[]): Promise<Bill[]> => {
    const response = await api.post('/bills/detect', { detections });
    return response.data.data;
  },

  // Get payment suggestions
  getPaymentSuggestions: async (billId?: string): Promise<PaymentSuggestion[]> => {
    const response = await api.get('/bills/suggestions', { params: { billId } });
    return response.data.data;
  },

  // Get bill analytics
  getAnalytics: async (period?: string): Promise<BillAnalytics> => {
    const response = await api.get('/bills/analytics', { params: { period } });
    return response.data.data;
  }
};

export default billApi;
