export interface User {
  id: string;
  email: string;
  created_at: string;
  full_name?: string;
  phone?: string;
  date_of_birth?: string;
  occupation?: string;
  monthly_income?: number;
  financial_goals?: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: 'safe' | 'impulsive' | 'anxious';
  date: string;
  created_at: string;
  merchant_name?: string;
  upi_id?: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: string;
  transactionId?: string;
}

export interface SpendingData {
  safe: number;
  impulsive: number;
  anxious: number;
}

export interface CategoryDetails {
  category: 'safe' | 'impulsive' | 'anxious';
  amount: number;
  percentage: number;
  transactions: Transaction[];
  topExpenses: { description: string; amount: number; date: string }[];
}

export interface UserProfile {
  full_name: string;
  phone: string;
  date_of_birth: string;
  occupation: string;
  monthly_income: number;
  financial_goals: string;
}