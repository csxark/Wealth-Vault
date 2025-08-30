import { supabase } from './supabase';

// Simple database service for basic CRUD operations

// ===== PROFILES =====
export const profiles = {
  // Get user profile
  get: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error getting profile:', error);
      return { data: null, error };
    }
  },

  // Create or update profile
  save: async (profile: { id: string; full_name?: string; phone?: string; monthly_income?: number }) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert([profile], { onConflict: 'id' })
        .select()
        .single();
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error saving profile:', error);
      return { data: null, error };
    }
  }
};

// ===== TRANSACTIONS =====
export const transactions = {
  // Get all transactions for a user
  getAll: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error getting transactions:', error);
      return { data: null, error };
    }
  },

  // Add new transaction
  add: async (transaction: { user_id: string; amount: number; description: string; category: string; date?: string }) => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert([{ ...transaction, date: transaction.date || new Date().toISOString().split('T')[0] }])
        .select()
        .single();
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error adding transaction:', error);
      return { data: null, error };
    }
  },

  // Delete transaction
  delete: async (id: string) => {
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Error deleting transaction:', error);
      return { error };
    }
  }
};

// ===== GOALS =====
export const goals = {
  // Get all goals for a user
  getAll: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error getting goals:', error);
      return { data: null, error };
    }
  },

  // Add new goal
  add: async (goal: { user_id: string; title: string; target_amount: number; target_date: string }) => {
    try {
      const { data, error } = await supabase
        .from('goals')
        .insert([goal])
        .select()
        .single();
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error adding goal:', error);
      return { data: null, error };
    }
  },

  // Update goal progress
  updateProgress: async (id: string, current_amount: number) => {
    try {
      const { data, error } = await supabase
        .from('goals')
        .update({ current_amount })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error updating goal:', error);
      return { data: null, error };
    }
  },

  // Delete goal
  delete: async (id: string) => {
    try {
      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Error deleting goal:', error);
      return { error };
    }
  }
};

// ===== UTILITY FUNCTIONS =====
export const utils = {
  // Get spending summary for a user
  getSpendingSummary: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('category, amount')
        .eq('user_id', userId)
        .lt('amount', 0); // Only expenses (negative amounts)
      
      if (error) throw error;

      const summary = {
        safe: 0,
        impulsive: 0,
        anxious: 0,
        total: 0
      };

      data?.forEach(t => {
        const amount = Math.abs(t.amount);
        summary[t.category] += amount;
        summary.total += amount;
      });

      return { data: summary, error: null };
    } catch (error) {
      console.error('Error getting spending summary:', error);
      return { data: null, error };
    }
  },

  // Test database connection
  testConnection: async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);
      
      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      console.error('Database connection test failed:', error);
      return { success: false, error };
    }
  }
}; 