import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { User, Expense, Category, Goal, RecurringExpense, RecurringExpenseFormData, BudgetAlert } from '../types';

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
      id: `mock-expense-${i}`,
      userId: 'dev-user-001',
      amount: Math.floor(Math.random() * 5000) + 100,
      currency: 'INR',
      category: categories[Math.floor(Math.random() * categories.length)] as 'safe' | 'impulsive' | 'anxious',
      description: descriptions[Math.floor(Math.random() * descriptions.length)],
      date: date.toISOString(),
      paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)] as 'cash' | 'card' | 'upi' | 'netbanking',
      isRecurring: false,
      status: 'completed',
      created_at: date.toISOString(),
      updated_at: date.toISOString()
    });
  }
  
  return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

// Generic API request function with enhanced error handling
const apiRequest = async <T>(endpoint: string, options: { method?: string; params?: Record<string, unknown>; data?: unknown } = {}): Promise<T> => {
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
    
    // Handle analytics endpoints in dev mode
    if (endpoint.startsWith('/analytics/')) {
      if (endpoint === '/analytics/spending-summary') {
        const mockCategories = [
          { categoryId: '1', categoryName: 'Food & Dining', categoryColor: '#ef4444', categoryIcon: 'utensils', total: 15000, count: 25, avgAmount: 600, percentage: 35 },
          { categoryId: '2', categoryName: 'Transportation', categoryColor: '#3b82f6', categoryIcon: 'car', total: 8000, count: 15, avgAmount: 533, percentage: 18.6 },
          { categoryId: '3', categoryName: 'Shopping', categoryColor: '#10b981', categoryIcon: 'shopping-bag', total: 12000, count: 20, avgAmount: 600, percentage: 27.9 },
          { categoryId: '4', categoryName: 'Entertainment', categoryColor: '#f59e0b', categoryIcon: 'film', total: 5000, count: 10, avgAmount: 500, percentage: 11.6 },
          { categoryId: '5', categoryName: 'Bills & Utilities', categoryColor: '#8b5cf6', categoryIcon: 'receipt', total: 3000, count: 5, avgAmount: 600, percentage: 7 }
        ];

        const mockMonthlyTrend = [
          { month: 'Aug 24', total: 35000, count: 65, date: '2024-08-01T00:00:00.000Z' },
          { month: 'Sep 24', total: 42000, count: 78, date: '2024-09-01T00:00:00.000Z' },
          { month: 'Oct 24', total: 38000, count: 72, date: '2024-10-01T00:00:00.000Z' },
          { month: 'Nov 24', total: 45000, count: 85, date: '2024-11-01T00:00:00.000Z' },
          { month: 'Dec 24', total: 40000, count: 75, date: '2024-12-01T00:00:00.000Z' },
          { month: 'Jan 25', total: 43000, count: 80, date: '2025-01-01T00:00:00.000Z' }
        ];

        return {
          success: true,
          data: {
            period: { start: '2025-01-01T00:00:00.000Z', end: '2025-01-31T23:59:59.999Z', type: 'month' },
            summary: {
              totalAmount: 43000,
              totalCount: 75,
              avgTransaction: 573,
              maxTransaction: 2500,
              minTransaction: 50
            },
            categoryBreakdown: mockCategories,
            monthlyTrend: mockMonthlyTrend,
            topExpenses: [
              { id: '1', amount: 2500, description: 'Grocery Shopping', date: '2025-01-20T00:00:00.000Z', category: { name: 'Food & Dining', color: '#ef4444' } },
              { id: '2', amount: 1800, description: 'Restaurant Dinner', date: '2025-01-18T00:00:00.000Z', category: { name: 'Food & Dining', color: '#ef4444' } },
              { id: '3', amount: 1500, description: 'Fuel', date: '2025-01-15T00:00:00.000Z', category: { name: 'Transportation', color: '#3b82f6' } }
            ],
            paymentMethods: [
              { method: 'card', total: 25000, count: 45, percentage: 58.1 },
              { method: 'upi', total: 15000, count: 25, percentage: 34.9 },
              { method: 'cash', total: 3000, count: 5, percentage: 7 }
            ]
          }
        } as T;
      }

      if (endpoint === '/analytics/spending-patterns') {
        const mockDailyPattern = [];
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          mockDailyPattern.push({
            date: date.toISOString().split('T')[0],
            total: Math.floor(Math.random() * 3000) + 500,
            count: Math.floor(Math.random() * 5) + 1,
            dayOfWeek: date.getDay(),
            dayName: date.toLocaleDateString('en-US', { weekday: 'short' })
          });
        }

        return {
          success: true,
          data: {
            period: {
              current: { start: '2025-01-01T00:00:00.000Z', end: '2025-01-31T23:59:59.999Z' },
              previous: { start: '2024-12-01T00:00:00.000Z', end: '2024-12-31T23:59:59.999Z' },
              type: 'month'
            },
            comparison: {
              current: { totalAmount: 43000, totalCount: 75, avgTransaction: 573 },
              previous: { totalAmount: 40000, totalCount: 70, avgTransaction: 571 },
              changes: {
                totalAmount: { value: 7.5, trend: 'up' },
                totalCount: { value: 7.1, trend: 'up' },
                avgTransaction: { value: 0.4, trend: 'up' }
              }
            },
            dailyPattern: mockDailyPattern,
            insights: {
              highestSpendingDay: mockDailyPattern.reduce((max, day) => day.total > max.total ? day : max, mockDailyPattern[0]),
              averageDailySpending: mockDailyPattern.reduce((sum, day) => sum + day.total, 0) / mockDailyPattern.length,
              spendingFrequency: mockDailyPattern.filter(day => day.count > 0).length
            }
          }
        } as T;
      }

      if (endpoint === '/analytics/export') {
        // Mock export response
        return {
          success: true,
          data: {
            exportInfo: {
              startDate: '2024-10-01T00:00:00.000Z',
              endDate: '2025-01-23T23:59:59.999Z',
              totalRecords: 150,
              exportedAt: new Date().toISOString()
            },
            expenses: generateMockExpenses(150)
          }
        } as T;
      }
    }
    if (endpoint === '/goals' && options.method === 'POST') {
      // Create new goal
      const mockGoals = JSON.parse(localStorage.getItem('mockGoals') || '[]');
      const newGoal = {
        _id: `mock-goal-${Date.now()}`,
        user: 'dev-user-001',
        ...(options.data as object),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockGoals.push(newGoal);
      localStorage.setItem('mockGoals', JSON.stringify(mockGoals));
      return {
        success: true,
        data: { goal: newGoal },
        message: 'Goal created successfully'
      } as T;
    }
    
    if (endpoint === '/goals' || endpoint.startsWith('/goals?')) {
      // Get all goals
      const mockGoals = JSON.parse(localStorage.getItem('mockGoals') || '[]');
      return {
        success: true,
        data: {
          goals: mockGoals,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalItems: mockGoals.length,
            itemsPerPage: 20
          }
        }
      } as T;
    }
    
    if (endpoint.startsWith('/goals/') && options.method === 'PUT') {
      // Update goal
      const goalId = endpoint.split('/')[2];
      const mockGoals = JSON.parse(localStorage.getItem('mockGoals') || '[]');
      const index = mockGoals.findIndex((g: { _id: string }) => g._id === goalId);
      if (index !== -1) {
        mockGoals[index] = { ...mockGoals[index], ...options.data, updatedAt: new Date().toISOString() };
        localStorage.setItem('mockGoals', JSON.stringify(mockGoals));
        return {
          success: true,
          data: { goal: mockGoals[index] },
          message: 'Goal updated successfully'
        } as T;
      }
    }
    
    if (endpoint.startsWith('/goals/') && options.method === 'DELETE') {
      // Delete goal
      const goalId = endpoint.split('/')[2];
      const mockGoals = JSON.parse(localStorage.getItem('mockGoals') || '[]');
      const filtered = mockGoals.filter((g: { _id: string }) => g._id !== goalId);
      localStorage.setItem('mockGoals', JSON.stringify(filtered));
      return {
        success: true,
        message: 'Goal deleted successfully'
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
  } catch (error: unknown) {
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
      const enhancedError = new Error(errorMessage) as Error & {
        status?: number;
        response?: unknown;
        details?: unknown;
      };
      enhancedError.status = error.response?.status;
      enhancedError.response = error.response;
      enhancedError.details = errorDetails;
      
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
  create: async (expenseData: Omit<Expense, 'id' | 'userId' | 'created_at' | 'updated_at'>) => {
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

  // Import expenses from CSV data
  import: async (expensesData: Array<{
    amount: number;
    description: string;
    category: string;
    date?: string;
    paymentMethod?: string;
    location?: string;
    tags?: string[];
    isRecurring?: boolean;
    recurringPattern?: string;
    notes?: string;
    subcategory?: string;
  }>) => {
    return apiRequest<{
      success: boolean;
      message: string;
      data: {
        imported: number;
        errors: number;
        errorDetails: string[];
      };
    }>('/expenses/import', {
      method: 'POST',
      data: { expenses: expensesData },
    });
  },

  // Recurring Expenses API
  recurringExpenses: {
    // Get all recurring expenses
    getAll: async (params?: {
      isActive?: boolean;
      category?: string;
    }) => {
      return apiRequest<{
        success: boolean;
        data: { recurringExpenses: RecurringExpense[] };
      }>('/expenses/recurring', {
        method: 'GET',
        params,
      });
    },

    // Get recurring expense by ID
    getById: async (id: string) => {
      return apiRequest<{ success: boolean; data: { recurringExpense: RecurringExpense } }>(`/expenses/recurring/${id}`);
    },

    // Create new recurring expense
    create: async (recurringExpenseData: RecurringExpenseFormData) => {
      return apiRequest<{ success: boolean; data: { recurringExpense: RecurringExpense } }>('/expenses/recurring', {
        method: 'POST',
        data: recurringExpenseData,
      });
    },

    // Update recurring expense
    update: async (id: string, recurringExpenseData: Partial<RecurringExpenseFormData & { isActive?: boolean; isPaused?: boolean }>) => {
      return apiRequest<{ success: boolean; data: { recurringExpense: RecurringExpense } }>(`/expenses/recurring/${id}`, {
        method: 'PUT',
        data: recurringExpenseData,
      });
    },

    // Delete recurring expense
    delete: async (id: string) => {
      return apiRequest<{ success: boolean; message: string }>(`/expenses/recurring/${id}`, {
        method: 'DELETE',
      });
    },

    // Manually trigger recurring expense generation (for testing)
    triggerGeneration: async () => {
      return apiRequest<{ success: boolean; message: string; data: { generatedExpenses: Expense[] } }>('/expenses/recurring/trigger', {
        method: 'POST',
      });
    },
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
          category: { name: string; color: string; icon?: string } | null;
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

  // Get spending patterns analysis
  getSpendingPatterns: async (params?: {
    period?: 'week' | 'month' | 'quarter' | 'year';
  }) => {
    return apiRequest<{
      success: boolean;
      data: {
        period: {
          current: { start: string; end: string };
          previous: { start: string; end: string };
          type: string;
        };
        comparison: {
          current: {
            totalAmount: number;
            totalCount: number;
            avgTransaction: number;
          };
          previous: {
            totalAmount: number;
            totalCount: number;
            avgTransaction: number;
          };
          changes: {
            totalAmount: { value: number; trend: 'up' | 'down' | 'stable' };
            totalCount: { value: number; trend: 'up' | 'down' | 'stable' };
            avgTransaction: { value: number; trend: 'up' | 'down' | 'stable' };
          };
        };
        dailyPattern: Array<{
          date: string;
          total: number;
          count: number;
          dayOfWeek: number;
          dayName: string;
        }>;
        insights: {
          highestSpendingDay: {
            date: string;
            total: number;
            count: number;
            dayName: string;
          };
          averageDailySpending: number;
          spendingFrequency: number;
        };
      };
    }>('/analytics/spending-patterns', {
      method: 'GET',
      params,
    });
  },

  // Export analytics data
  exportData: async (params?: {
    format?: 'csv' | 'json';
    startDate?: string;
    endDate?: string;
  }) => {
    const token = localStorage.getItem('authToken');

    // Handle dev mode
    if (token === 'dev-mock-token-123') {
      const mockData = generateMockExpenses(100);

      if (params?.format === 'csv') {
        const csvHeader = 'Date,Amount,Currency,Description,Category,Payment Method\n';
        const csvRows = mockData.map(expense =>
          `${expense.date.split('T')[0]},${expense.amount},INR,"${expense.description}","${expense.category}","${expense.paymentMethod}"`
        ).join('\n');

        const csvContent = csvHeader + csvRows;
        const blob = new Blob([csvContent], { type: 'text/csv' });

        // Create a mock response that mimics the fetch API
        return {
          blob: () => Promise.resolve(blob),
          json: () => Promise.resolve({ data: mockData })
        } as Response;
      } else {
        const jsonData = {
          exportInfo: {
            startDate: '2024-10-01T00:00:00.000Z',
            endDate: new Date().toISOString(),
            totalRecords: mockData.length,
            exportedAt: new Date().toISOString()
          },
          expenses: mockData
        };

        return {
          blob: () => Promise.resolve(new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' })),
          json: () => Promise.resolve(jsonData)
        } as Response;
      }
    }

    const queryParams = new URLSearchParams();
    if (params?.format) queryParams.append('format', params.format);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const response = await fetch(`${API_BASE_URL}/analytics/export?${queryParams}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Export failed');
    }

    return response;
  },
};

// Budget Alerts API
export const budgetAlertsAPI = {
  // Get all budget alerts
  getAll: async (params?: {
    page?: number;
    limit?: number;
    categoryId?: string;
    threshold?: number;
    period?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    return apiRequest<{
      success: boolean;
      data: {
        alerts: BudgetAlert[];
        pagination: {
          currentPage: number;
          totalPages: number;
          totalItems: number;
          itemsPerPage: number;
        };
      };
    }>('/budget-alerts', {
      method: 'GET',
      params,
    });
  },

  // Get budget alert by ID
  getById: async (id: string) => {
    return apiRequest<{ success: boolean; data: { alert: BudgetAlert } }>(`/budget-alerts/${id}`);
  },

  // Delete budget alert
  delete: async (id: string) => {
    return apiRequest<{ success: boolean; message: string }>(`/budget-alerts/${id}`, {
      method: 'DELETE',
    });
  },

  // Get budget alerts statistics
  getStats: async () => {
    return apiRequest<{
      success: boolean;
      data: {
        summary: { total: number };
        byThreshold: Array<{ threshold: number; count: number }>;
        byCategory: Array<{ categoryName: string; count: number }>;
      };
    }>('/budget-alerts/stats/summary');
  },

  // Test budget alert triggering
  test: async (data: { categoryId: string; amount: number }) => {
    return apiRequest<{ success: boolean; message: string }>('/budget-alerts/test', {
      method: 'POST',
      data,
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