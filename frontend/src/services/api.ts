import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { User, Expense, Category, Goal } from '../types';

// Use the Vite proxy in development, fallback to direct URL
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  // Enable credentials for CORS
  withCredentials: true,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
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
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Generic API request function with enhanced error handling
const apiRequest = async <T>(endpoint: string, options: any = {}): Promise<T> => {
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

// Export all APIs
export default {
  auth: authAPI,
  expenses: expensesAPI,
  categories: categoriesAPI,
  goals: goalsAPI,
  health: healthAPI,
};