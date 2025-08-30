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
  _id: string;
  user: string;
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
<<<<<<< Updated upstream
  category: SpendingCategory;
=======
  category: Category;
>>>>>>> Stashed changes
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
}