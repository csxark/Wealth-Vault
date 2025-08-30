import type { Transaction } from '../types';

export const generateMockTransactions = (userId: string): Transaction[] => {
  const mockTransactions: Transaction[] = [
    {
      id: '1',
      user_id: userId,
      amount: -455.50,
      description: 'Grocery Store - Weekly Shopping',
      category: 'safe',
      date: '2024-01-15T10:30:00Z',
      created_at: '2024-01-15T10:30:00Z'
    },
    {
      id: '2',
      user_id: userId,
      amount: -47.50,
      description: 'Coffee Shop - Morning Latte',
      category: 'impulsive',
      date: '2024-01-16T08:15:00Z',
      created_at: '2024-01-16T08:15:00Z'
    },
    {
      id: '3',
      user_id: userId,
      amount: -8500.00,
      description: 'Rent Payment',
      category: 'safe',
      date: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '4',
      user_id: userId,
      amount: -1250.00,
      description: 'Emergency Car Repair',
      category: 'anxious',
      date: '2024-01-18T14:20:00Z',
      created_at: '2024-01-18T14:20:00Z'
    },
    {
      id: '5',
      user_id: userId,
      amount: -899.99,
      description: 'Online Shopping - Impulse Buy',
      category: 'impulsive',
      date: '2024-01-20T19:45:00Z',
      created_at: '2024-01-20T19:45:00Z'
    },
    {
      id: '6',
      user_id: userId,
      amount: 30000.00,
      description: 'Salary Deposit',
      category: 'safe',
      date: '2024-01-01T09:00:00Z',
      created_at: '2024-01-01T09:00:00Z'
    }
  ];

  return mockTransactions;
};

export const initializeMockData = (userId: string) => {
  // Only add mock data if no transactions exist
  const existingTransactions = localStorage.getItem('transactions');
  if (!existingTransactions) {
    const mockTransactions = generateMockTransactions(userId);
    localStorage.setItem('transactions', JSON.stringify(mockTransactions));
  }
};