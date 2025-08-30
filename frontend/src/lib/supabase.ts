import { createClient } from '@supabase/supabase-js';
import type { User, Transaction, Goal, UserProfile } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export const auth = {
  signUp: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin
      }
    });
    return { data, error };
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  }
};

// Database operations for transactions
export const transactions = {
  // Get all transactions for a user
  getAll: async (userId: string) => {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
      
      if (error) {
        console.error('Error fetching transactions:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Exception in transactions.getAll:', error);
      return { data: null, error };
    }
  },

  // Get transactions by category
  getByCategory: async (userId: string, category: string) => {
    try {
      if (!userId || !category) {
        throw new Error('User ID and category are required');
      }

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('category', category)
        .order('date', { ascending: false });
      
      if (error) {
        console.error('Error fetching transactions by category:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Exception in transactions.getByCategory:', error);
      return { data: null, error };
    }
  },

  // Add new transaction
  create: async (transaction: Omit<Transaction, 'id' | 'created_at'>) => {
    try {
      if (!transaction.user_id || !transaction.amount || !transaction.description || !transaction.category) {
        throw new Error('Missing required transaction fields');
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert([{ ...transaction, created_at: new Date().toISOString() }])
        .select()
        .single();
      
      if (error) {
        console.error('Error creating transaction:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Exception in transactions.create:', error);
      return { data: null, error };
    }
  },

  // Update transaction
  update: async (id: string, updates: Partial<Transaction>) => {
    try {
      if (!id) {
        throw new Error('Transaction ID is required');
      }

      const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating transaction:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Exception in transactions.update:', error);
      return { data: null, error };
    }
  },

  // Delete transaction
  delete: async (id: string) => {
    try {
      if (!id) {
        throw new Error('Transaction ID is required');
      }

      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting transaction:', error);
        return { error };
      }

      return { error: null };
    } catch (error) {
      console.error('Exception in transactions.delete:', error);
      return { error };
    }
  }
};

// Database operations for goals
export const goals = {
  // Get all goals for a user
  getAll: async (userId: string) => {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return { data, error };
  },

  // Add new goal
  create: async (goal: Omit<Goal, 'id' | 'created_at' | 'updated_at'>) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('goals')
      .insert([{ ...goal, created_at: now, updated_at: now }])
      .select()
      .single();
    return { data, error };
  },

  // Update goal
  update: async (id: string, updates: Partial<Goal>) => {
    const { data, error } = await supabase
      .from('goals')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return { data, error };
  },

  // Delete goal
  delete: async (id: string) => {
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', id);
    return { error };
  }
};

// Database operations for user profiles
export const profiles = {
  // Get user profile
  get: async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    return { data, error };
  },

  // Create or update user profile
  upsert: async (profile: UserProfile & { id: string }) => {
    const { data, error } = await supabase
      .from('profiles')
      .upsert([profile], { onConflict: 'id' })
      .select()
      .single();
    return { data, error };
  }
};

// Helper function to get spending data by time range
export const getSpendingData = async (userId: string, timeRange: 'week' | 'month' | 'year' = 'month') => {
  const now = new Date();
  let startDate: Date;

  switch (timeRange) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate.toISOString().split('T')[0]) // Use date only, not timestamp
      .lte('date', now.toISOString().split('T')[0])
      .lt('amount', 0); // Only expenses (negative amounts)

    if (error) {
      console.error('Database error in getSpendingData:', error);
      return { data: null, error };
    }

    const spendingData = {
      safe: 0,
      impulsive: 0,
      anxious: 0
    };

    data?.forEach(transaction => {
      const amount = Math.abs(transaction.amount);
      if (transaction.category && spendingData.hasOwnProperty(transaction.category)) {
        spendingData[transaction.category] += amount;
      }
    });

    return { data: spendingData, error: null };
  } catch (error) {
    console.error('Error in getSpendingData:', error);
    return { data: null, error };
  }
};