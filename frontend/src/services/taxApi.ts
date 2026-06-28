import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface TaxCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  categoryType: 'deduction' | 'credit' | 'exemption';
  irsReference: string | null;
  isActive: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface TaxDeductibleExpense {
  id: string;
  amount: string;
  currency: string;
  description: string;
  date: string;
  taxYear: number;
  taxNotes: string | null;
  category: {
    id: string;
    name: string;
    color: string;
    icon: string;
  } | null;
  taxCategory: {
    id: string;
    code: string;
    name: string;
    categoryType: string;
    irsReference: string | null;
  } | null;
}

export interface TaxSummary {
  taxYear: number;
  summary: {
    totalDeductions: number;
    totalExpenses: number;
    currency: string;
  };
  deductionsByCategory: Array<{
    taxCategoryId: string | null;
    categoryCode: string | null;
    categoryName: string | null;
    categoryType: string | null;
    totalAmount: string;
    count: string;
    irsReference: string | null;
  }>;
  potentialDeductions: Array<{
    id: string;
    amount: string;
    description: string;
    date: string;
    category: {
      id: string;
      name: string;
    } | null;
  }>;
  generatedAt: string;
}

export interface TaxReport {
  id: string;
  userId: string;
  taxYear: number;
  reportType: string;
  format: string;
  url: string;
  totalDeductions: string;
  totalCredits: string;
  status: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface TaxSuggestion {
  expenseId: string;
  description: string;
  amount: string;
  suggestedCategory: string;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
}

export const taxApi = {
  // Tax Categories
  getTaxCategories: async (filters?: { type?: string; activeOnly?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.activeOnly !== undefined) params.append('activeOnly', String(filters.activeOnly));
    
    const response = await api.get(`/tax/categories?${params.toString()}`);
    return response.data;
  },

  getTaxCategory: async (id: string) => {
    const response = await api.get(`/tax/categories/${id}`);
    return response.data;
  },

  // Tax Deductions
  getTaxDeductions: async (params?: {
    taxYear?: number;
    categoryId?: string;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.taxYear) searchParams.append('taxYear', String(params.taxYear));
    if (params?.categoryId) searchParams.append('categoryId', params.categoryId);
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.limit) searchParams.append('limit', String(params.limit));
    
    const response = await api.get(`/tax/deductions?${searchParams.toString()}`);
    return response.data;
  },

  // Tax Summary
  getTaxSummary: async (taxYear?: number) => {
    const params = new URLSearchParams();
    if (taxYear) params.append('taxYear', String(taxYear));
    
    const response = await api.get(`/tax/summary?${params.toString()}`);
    return response.data;
  },

  // Potential Deductions
  getPotentialDeductions: async (taxYear?: number) => {
    const params = new URLSearchParams();
    if (taxYear) params.append('taxYear', String(taxYear));
    
    const response = await api.get(`/tax/potential-deductions?${params.toString()}`);
    return response.data;
  },

  // Mark Expense as Tax Deductible
  markAsDeductible: async (
    expenseId: string,
    data: {
      taxCategoryId?: string;
      taxYear?: number;
      taxNotes?: string;
    }
  ) => {
    const response = await api.post(`/tax/expenses/${expenseId}/mark-deductible`, data);
    return response.data;
  },

  // Remove Tax Deductible Status
  removeDeductibleStatus: async (expenseId: string) => {
    const response = await api.post(`/tax/expenses/${expenseId}/remove-deductible`);
    return response.data;
  },

  // Bulk Update
  bulkUpdateTaxStatus: async (data: {
    expenseIds: string[];
    taxCategoryId?: string;
    taxYear?: number;
    isTaxDeductible?: boolean;
  }) => {
    const response = await api.post('/tax/bulk-update', data);
    return response.data;
  },

  // Tax Suggestions
  getTaxSuggestions: async (taxYear?: number) => {
    const params = new URLSearchParams();
    if (taxYear) params.append('taxYear', String(taxYear));
    
    const response = await api.get(`/tax/suggestions?${params.toString()}`);
    return response.data;
  },

  // Tax Reports
  generateReport: async (data: {
    taxYear: number;
    reportType: 'summary' | 'detailed' | 'schedule_c' | 'schedule_a';
    format: 'pdf' | 'excel' | 'csv';
  }) => {
    const response = await api.post('/tax/reports', data);
    return response.data;
  },

  getTaxReports: async (params?: { taxYear?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.taxYear) searchParams.append('taxYear', String(params.taxYear));
    if (params?.limit) searchParams.append('limit', String(params.limit));
    
    const response = await api.get(`/tax/reports?${searchParams.toString()}`);
    return response.data;
  },

  getTaxReport: async (id: string) => {
    const response = await api.get(`/tax/reports/${id}`);
    return response.data;
  },

  // Export Tax Data
  exportTaxData: async (taxYear: number, format: 'json' | 'csv' = 'json') => {
    const response = await api.get(`/tax/export/${taxYear}?format=${format}`, {
      responseType: format === 'csv' ? 'blob' : 'json',
    });
    return response.data;
  },
};

export default taxApi;
