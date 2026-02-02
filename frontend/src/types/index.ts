// User interface matching backend User model
export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  dateOfBirth?: string;
  phoneNumber?: string;
  currency: string;
  monthlyIncome: number;
  monthlyBudget: number;
  emergencyFund: number;
  isActive: boolean;
  lastLogin: string;
  preferences: {
    notifications: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
    theme: 'light' | 'dark' | 'auto';
    language: string;
  };
  createdAt: string;
  updatedAt: string;
  // Virtual fields
  fullName?: string;
  netWorth?: number;
}

export interface Expense {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  description: string;
  category: string;
  subcategory?: string;
  date: string;
  paymentMethod: string;
  location?: {
    name?: string;
    address?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  tags?: string[];
  receipt?: {
    imageUrl?: string;
    ocrData?: {
      merchant?: string;
      total?: number;
      items?: Array<{
        name: string;
        price: number;
        quantity: number;
      }>;
    };
  };
  isRecurring: boolean;
  recurringPattern?: {
    frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;
    endDate?: string;
  };
  notes?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  _id: string;
  user: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  type: 'expense' | 'income' | 'both';
  isDefault: boolean;
  isActive: boolean;
  parentCategory?: string;
  subcategories?: string[];
  budget: {
    monthly: number;
    yearly: number;
  };
  spendingLimit: number;
  priority: number;
  metadata: {
    usageCount: number;
    lastUsed?: string;
    averageAmount: number;
  };
  createdAt: string;
  updatedAt: string;
  // Virtual fields
  totalBudget?: number;
  isOverBudget?: boolean;
}

// Spending category type for consistency
export type SpendingCategory = 'safe' | 'impulsive' | 'anxious';

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  isCompleted: boolean;
  completedDate?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  // Virtual fields
  progressPercentage?: number;
  remainingAmount?: number;
  daysRemaining?: number;
  isOverdue?: boolean;
}

export interface Goal {
  _id: string;
  user: string;
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  type: 'savings' | 'purchase' | 'debt' | 'investment' | 'other';
  deadline: string;
  milestones?: Array<{
    amount: number;
    date: string;
    description: string;
    isCompleted: boolean;
  }>;
  contributions: Array<{
    amount: number;
    date: string;
    description?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  // Virtual fields
  progressPercentage?: number;
  remainingAmount?: number;
  daysRemaining?: number;
  isOverdue?: boolean;
  isCompleted?: boolean;
}

export interface ChatMessage {
  _id: string;
  content: string;
  isUser: boolean;
  timestamp: string;
  expenseId?: string;
}

export interface SpendingData {
  [categoryId: string]: number;
}

// New interface for expense form data
export interface ExpenseFormData {
  amount: number;
  category: SpendingCategory;
  description: string;
  merchantName?: string;
  upiId?: string;
}

export interface CategoryDetails {
  category: SpendingCategory;
  amount: number;
  percentage: number;
  expenses: Expense[];
  topExpenses: { description: string; amount: number; date: string }[];
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  occupation?: string;
  monthlyIncome: number;
  financialGoals?: string;
  full_name?: string; // For legacy compatibility
  currency?: string;
  monthlyBudget?: number;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    items: T[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  };
  message?: string;
}

// Auth types
export interface AuthResponse {
  success: boolean;
  data: {
    user: User;
    token: string;
  };
  message?: string;
}

export interface RecurringExpense {
  id: string;
  userId: string;
  categoryId: string;
  category?: {
    name: string;
    color: string;
    icon: string;
  };
  name: string;
  description: string;
  amount: number;
  currency: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  startDate: string;
  endDate?: string;
  nextDueDate: string;
  lastGeneratedDate?: string;
  isActive: boolean;
  isPaused: boolean;
  paymentMethod: string;
  tags?: string[];
  notes?: string;
  metadata?: {
    totalGenerated: number;
    lastAmount: number;
    createdBy: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RecurringExpenseFormData {
  category: string;
  name: string;
  description: string;
  amount: number;
  currency?: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  startDate: string;
  endDate?: string;
  paymentMethod?: string;
  tags?: string[];
  notes?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  currency?: string;
  monthlyIncome?: number;
  monthlyBudget?: number;
}

// Transaction interface for CSV import functionality
export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: SpendingCategory;
  date: string;
  created_at: string;
}
