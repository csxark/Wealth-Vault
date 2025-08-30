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
<<<<<<< Updated upstream
  createdAt: string;
  updatedAt: string;
  // Virtual fields
  fullName?: string;
  netWorth?: number;
}

export interface Expense {
  _id: string;
  user: string;
=======
  fullName?: string; // Virtual field
  netWorth?: number; // Virtual field
  createdAt: string;
  updatedAt: string;
}

// Category interface matching backend Category model
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
  totalBudget?: number; // Virtual field
  isOverBudget?: boolean; // Virtual field
  createdAt: string;
  updatedAt: string;
}

// Expense interface matching backend Expense model
export interface Expense {
  _id: string;
  user: string;
  amount: number;
  currency: string;
  description: string;
  category: string;
  subcategory?: string;
  date: string;
  paymentMethod: 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'digital_wallet' | 'check' | 'other';
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
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: string;
  };
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  metadata?: {
    appVersion?: string;
    deviceInfo?: string;
    importSource?: string;
  };
  formattedAmount?: string; // Virtual field
  monthYear?: { month: number; year: number }; // Virtual field
  createdAt: string;
  updatedAt: string;
}

// Goal interface matching backend Goal model
export interface Goal {
  _id: string;
  user: string;
  title: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  type: 'savings' | 'debt_payoff' | 'investment' | 'purchase' | 'emergency_fund' | 'other';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  deadline: string;
  startDate: string;
  completedDate?: string;
  milestones?: Array<{
    amount: number;
    description?: string;
    achieved: boolean;
    achievedDate?: string;
  }>;
  recurringContribution?: {
    amount: number;
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
    nextContributionDate?: string;
  };
  category?: string;
  tags?: string[];
  notes?: string;
  isPublic: boolean;
  metadata: {
    lastContribution?: string;
    totalContributions: number;
    averageContribution: number;
    streakDays: number;
  };
  progressPercentage?: number; // Virtual field
  remainingAmount?: number; // Virtual field
  daysRemaining?: number; // Virtual field
  isOverdue?: boolean; // Virtual field
  isCompleted?: boolean; // Virtual field
  formattedTargetAmount?: string; // Virtual field
  formattedCurrentAmount?: string; // Virtual field
  formattedRemainingAmount?: string; // Virtual field
  createdAt: string;
  updatedAt: string;
}

// Legacy types for backward compatibility
export interface Transaction {
  id: string;
  user_id: string;
>>>>>>> Stashed changes
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
  createdAt: string;
  updatedAt: string;
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

<<<<<<< Updated upstream
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

=======
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  occupation?: string;
  monthlyIncome: number;
  financialGoals?: string;
=======
  full_name: string;
  phone: string;
  date_of_birth: string;
  occupation: string;
  monthly_income: number;
  financial_goals: string;
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
}

// Auth types
export interface AuthResponse {
  success: boolean;
  data: {
    user: User;
    token: string;
  };
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
>>>>>>> Stashed changes
}