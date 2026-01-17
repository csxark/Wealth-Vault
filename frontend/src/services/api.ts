import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { User, Expense, Category, Goal } from '../types';

// Use environment variable for API URL
const API_BASE_URL = import.meta.env.VITE_API_URL;

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      // Check if it's dev bypass token - return mock data without making the request
      if (token === 'dev-mock-token-123') {
        // We'll handle this in the apiRequest function instead
        config.headers['X-Dev-Mode'] = 'true';
      }
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    // Enhanced error logging
    if (error.response) {
      console.error('API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url,
        method: error.config?.method,
        requestData: error.config?.data
      });
    } else if (error.request) {
      console.error('API Network Error:', {
        message: 'No response received',
        url: error.config?.url,
        method: error.config?.method
      });
    } else {
      console.error('API Setup Error:', error.message);
    }

    if (error.response?.status === 401) {
      // Token expired or invalid
      const token = localStorage.getItem('authToken');
      // Don't clear dev bypass token
      if (token !== 'dev-mock-token-123') {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Mock data generator for dev mode
const generateMockExpenses = (count: number = 20): Expense[] => {
  const categories = ['safe', 'impulsive', 'anxious'];
  const paymentMethods = ['cash', 'card', 'upi', 'netbanking'];
  const descriptions = [
    'Groceries', 'Restaurant', 'Movie tickets', 'Shopping', 'Fuel',
    'Electricity bill', 'Internet bill', 'Medicine', 'Books', 'Coffee'
  ];
  
  const expenses: Expense[] = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    
    expenses.push({
      _id: `mock-expense-${i}`,
      user: 'dev-user-001',
      amount: Math.floor(Math.random() * 5000) + 100,
      category: categories[Math.floor(Math.random() * categories.length)] as 'safe' | 'impulsive' | 'anxious',
      description: descriptions[Math.floor(Math.random() * descriptions.length)],
      date: date.toISOString(),
      paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)] as 'cash' | 'card' | 'upi' | 'netbanking',
      createdAt: date.toISOString(),
      updatedAt: date.toISOString()
    });
  }
  
  return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

// Generic API request function with enhanced error handling
const apiRequest = async <T>(endpoint: string, options: any = {}): Promise<T> => {
  // Check if we're in dev mode
  const token = localStorage.getItem('authToken');
  if (token === 'dev-mock-token-123') {
    console.log('[API] Dev mode detected, returning mock data for:', endpoint);
    
    // Return mock data based on endpoint
    if (endpoint === '/expenses' || endpoint.startsWith('/expenses?')) {
      const mockExpenses = generateMockExpenses(30);
      return {
        success: true,
        data: {
          expenses: mockExpenses,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalItems: mockExpenses.length,
            itemsPerPage: 50
          }
        }
      } as T;
    }
    
    if (endpoint === '/auth/profile' || endpoint === '/users/profile') {
      const mockUser = JSON.parse(localStorage.getItem('user') || '{}');
      return {
        success: true,
        data: { user: mockUser }
      } as T;
    }
    
    // Default mock response
    return {
      success: true,
      data: {},
      message: 'Dev mode mock response'
    } as T;
  }
  
  try {
    const response = await api.request({
      url: endpoint,
      ...options,
    });
    return response.data;
  } catch (error: any) {
    // Additional error processing
    if (axios.isAxiosError(error)) {
      // Extract meaningful error message
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'An unknown error occurred';
      
      const errorDetails = {
        message: errorMessage,
        status: error.response?.status,
        endpoint: endpoint,
        method: options.method || 'GET',
        data: options.data
      };

      console.error('API Request Failed:', errorDetails);

      // Create a more informative error object
      const enhancedError = new Error(errorMessage);
      (enhancedError as any).status = error.response?.status;
      (enhancedError as any).response = error.response;
      (enhancedError as any).details = errorDetails;
      
      throw enhancedError;
    }
    
    console.error('Non-Axios Error:', error);
    throw error;
  }
};

// Auth API
export const authAPI = {
  // Register new user
  register: async (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    currency?: string;
    monthlyIncome?: number;
    monthlyBudget?: number;
  }) => {
    // Validate required fields before making request
    if (!userData.email || !userData.password || !userData.firstName || !userData.lastName) {
      throw new Error('Email, password, first name, and last name are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      throw new Error('Please enter a valid email address');
    }

    // Validate password length
    if (userData.password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    console.log('Registering user with data:', {
      ...userData,
      password: '[HIDDEN]' // Don't log the actual password
    });

    return apiRequest<{ success: boolean; data: { user: User; token: string } }>('/auth/register', {
      method: 'POST',
      data: userData,
    });
  },

  // Login user
  login: async (credentials: { email: string; password: string }) => {
    // Validate required fields
    if (!credentials.email || !credentials.password) {
      throw new Error('Email and password are required');
    }

    console.log('Logging in user:', { email: credentials.email });

    return apiRequest<{ success: boolean; data: { user: User; token: string } }>('/auth/login', {
      method: 'POST',
      data: credentials,
    });
  },

  // Get current user profile
  getProfile: async () => {
    return apiRequest<{ success: boolean; data: { user: User } }>('/auth/me');
  },

  // Update user profile
  updateProfile: async (profileData: Partial<User>) => {
    return apiRequest<{ success: boolean; data: { user: User } }>('/auth/profile', {
      method: 'PUT',
      data: profileData,
    });
  },

  // Change password
  changePassword: async (passwords: { currentPassword: string; newPassword: string }) => {
    if (!passwords.currentPassword || !passwords.newPassword) {
      throw new Error('Current password and new password are required');
    }

    if (passwords.newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long');
    }

    return apiRequest<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'PUT',
      data: passwords,
    });
  },

  // Refresh token
  refreshToken: async () => {
    return apiRequest<{ success: boolean; data: { token: string } }>('/auth/refresh', {
      method: 'POST',
    });
  },

  // Logout
  logout: async () => {
    return apiRequest<{ success: boolean; message: string }>('/auth/logout', {
      method: 'POST',
    });
  },
};

// Expenses API
export const expensesAPI = {
  // Get all expenses
  getAll: async (params?: {
    page?: number;
    limit?: number;
    category?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
    paymentMethod?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  }) => {
    return apiRequest<{
      success: boolean;
      data: {
        expenses: Expense[];
        pagination: {
          currentPage: number;
          totalPages: number;
          totalItems: number;
          itemsPerPage: number;
        };
      };
    }>('/expenses', {
      method: 'GET',
      params,
    });
  },

  // Get expense by ID
  getById: async (id: string) => {
    return apiRequest<{ success: boolean; data: { expense: Expense } }>(`/expenses/${id}`);
  },

  // Create new expense
  create: async (expenseData: Omit<Expense, '_id' | 'user' | 'createdAt' | 'updatedAt'>) => {
    return apiRequest<{ success: boolean; data: { expense: Expense } }>('/expenses', {
      method: 'POST',
      data: expenseData,
    });
  },

  // Update expense
  update: async (id: string, expenseData: Partial<Expense>) => {
    return apiRequest<{ success: boolean; data: { expense: Expense } }>(`/expenses/${id}`, {
      method: 'PUT',
      data: expenseData,
    });
  },

  // Delete expense
  delete: async (id: string) => {
    return apiRequest<{ success: boolean; message: string }>(`/expenses/${id}`, {
      method: 'DELETE',
    });
  },

  // Get expense statistics
  getStats: async (params?: { startDate?: string; endDate?: string }) => {
    return apiRequest<{
      success: boolean;
      data: {
        summary: { total: number; count: number };
        byCategory: Array<{
          categoryName: string;
          categoryColor: string;
          total: number;
          count: number;
        }>;
      };
    }>('/expenses/stats/summary', {
      method: 'GET',
      params,
    });
  },
};

// Categories API
export const categoriesAPI = {
  // Get all categories
  getAll: async (params?: { type?: string; isActive?: boolean }) => {
    return apiRequest<{
      success: boolean;
      count: number;
      data: { categories: Category[] };
    }>('/categories', {
      method: 'GET',
      params,
    });
  },

  // Get category by ID
  getById: async (id: string) => {
    return apiRequest<{ success: boolean; data: { category: Category } }>(`/categories/${id}`);
  },

  // Create new category
  create: async (categoryData: Omit<Category, '_id' | 'user' | 'createdAt' | 'updatedAt' | 'metadata'>) => {
    return apiRequest<{ success: boolean; data: { category: Category } }>('/categories', {
      method: 'POST',
      data: categoryData,
    });
  },

  // Update category
  update: async (id: string, categoryData: Partial<Category>) => {
    return apiRequest<{ success: boolean; data: { category: Category } }>(`/categories/${id}`, {
      method: 'PUT',
      data: categoryData,
    });
  },

  // Delete category
  delete: async (id: string) => {
    return apiRequest<{ success: boolean; message: string }>(`/categories/${id}`, {
      method: 'DELETE',
    });
  },

  // Get category usage statistics
  getUsageStats: async () => {
    return apiRequest<{
      success: boolean;
      data: { categories: Array<Category & { isOverBudget: boolean }> };
    }>('/categories/stats/usage');
  },
};

// Goals API
export const goalsAPI = {
  // Get all goals
  getAll: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    priority?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    return apiRequest<{
      success: boolean;
      data: {
        goals: Goal[];
        pagination: {
          currentPage: number;
          totalPages: number;
          totalItems: number;
          itemsPerPage: number;
        };
      };
    }>('/goals', {
      method: 'GET',
      params,
    });
  },

  // Get goal by ID
  getById: async (id: string) => {
    return apiRequest<{ success: boolean; data: { goal: Goal } }>(`/goals/${id}`);
  },

  // Create new goal
  create: async (goalData: Omit<Goal, '_id' | 'user' | 'createdAt' | 'updatedAt' | 'metadata' | 'isCompleted' | 'progressPercentage' | 'remainingAmount' | 'daysRemaining' | 'isOverdue'>) => {
    return apiRequest<{ success: boolean; data: { goal: Goal } }>('/goals', {
      method: 'POST',
      data: goalData,
    });
  },

  // Update goal
  update: async (id: string, goalData: Partial<Goal>) => {
    return apiRequest<{ success: boolean; data: { goal: Goal } }>(`/goals/${id}`, {
      method: 'PUT',
      data: goalData,
    });
  },

  // Delete goal
  delete: async (id: string) => {
    return apiRequest<{ success: boolean; message: string }>(`/goals/${id}`, {
      method: 'DELETE',
    });
  },

  // Add contribution to goal
  contribute: async (id: string, contribution: { amount: number; description?: string }) => {
    return apiRequest<{ success: boolean; data: { goal: Goal } }>(`/goals/${id}/contribute`, {
      method: 'POST',
      data: contribution,
    });
  },

  // Get goals summary
  getSummary: async () => {
    return apiRequest<{
      success: boolean;
      data: {
        summary: {
          total: number;
          active: number;
          completed: number;
          paused: number;
          cancelled: number;
          totalTarget: number;
          totalCurrent: number;
          overallProgress: number;
        };
      };
    }>('/goals/stats/summary');
  },
};

// Health check
export const healthAPI = {
  check: async () => {
    return apiRequest<{ status: string; message: string; timestamp: string }>('/health');
  },
};

// Analytics API
export const analyticsAPI = {
  // Get spending summary analytics
  getSpendingSummary: async (params?: {
    startDate?: string;
    endDate?: string;
    period?: 'month' | 'quarter' | 'year';
  }) => {
    return apiRequest<{
      success: boolean;
      data: {
        period: { start: string; end: string; type: string };
        summary: {
          totalAmount: number;
          totalCount: number;
          avgTransaction: number;
          maxTransaction: number;
          minTransaction: number;
        };
        categoryBreakdown: Array<{
          categoryId: string;
          categoryName: string;
          categoryColor: string;
          categoryIcon: string;
          total: number;
          count: number;
          avgAmount: number;
          percentage: number;
        }>;
        monthlyTrend: Array<{
          month: string;
          total: number;
          count: number;
          date: string;
        }>;
        topExpenses: Array<{
          id: string;
          amount: number;
          description: string;
          date: string;
          category: any;
        }>;
        paymentMethods: Array<{
          method: string;
          total: number;
          count: number;
          percentage: number;
        }>;
      };
    }>('/analytics/spending-summary', {
      method: 'GET',
      params,
    });
  },

  // Get category trends
  getCategoryTrends: async (params?: {
    categoryId?: string;
    months?: number;
  }) => {
    return apiRequest<{
      success: boolean;
      data: {
        trends: Array<{
          month: string;
          date: string;
          categories: Array<{
            categoryId: string;
            categoryName: string;
            total: number;
            count: number;
          }>;
        }>;
      };
    }>('/analytics/category-trends', {
      method: 'GET',
      params,
    });
  },
};

// Export all APIs
export default {
  auth: authAPI,
  expenses: expensesAPI,
  categories: categoriesAPI,
  goals: goalsAPI,
  analytics: analyticsAPI,
  health: healthAPI,
};