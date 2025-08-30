import React, { useState, useEffect } from 'react';
import { Plus, Target } from 'lucide-react';
import { GoalCard } from './GoalCard';
import { GoalForm } from './GoalForm';
import { useAuth } from '../../hooks/useAuth';
import { goals } from '../../lib/supabase';
import type { Goal } from '../../types';

export const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>();
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadGoals();
    }
  }, [user]);

  const loadGoals = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await goals.getAll(user.id);
      if (error) {
        console.error('Error loading goals:', error);
        return;
      }
      setGoals(data || []);
    } catch (error) {
      console.error('Error loading goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGoal = async (goalData: Partial<Goal>) => {
    if (!user) return;

    try {
      if (editingGoal) {
        // Update existing goal
        const { error } = await goals.update(editingGoal.id, goalData);
        if (error) {
          console.error('Error updating goal:', error);
          return;
        }
      } else {
        // Create new goal
        const { error } = await goals.create({
          user_id: user.id,
          title: goalData.title || '',
          description: goalData.description || '',
          target_amount: goalData.target_amount || 0,
          current_amount: goalData.current_amount || 0,
          target_date: goalData.target_date || ''
        });
        
        if (error) {
          console.error('Error creating goal:', error);
          return;
        }
      }
      
      // Reload goals
      await loadGoals();
      setShowForm(false);
      setEditingGoal(undefined);
    } catch (error) {
      console.error('Error saving goal:', error);
    }
  };

  const handleEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setShowForm(true);
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      const { error } = await goals.delete(goalId);
      if (error) {
        console.error('Error deleting goal:', error);
        return;
      }
      
      // Reload goals
      await loadGoals();
    } catch (error) {
      console.error('Error deleting goal:', error);
    }
  };

  const totalGoalsValue = goals.reduce((sum, goal) => sum + goal.target_amount, 0);
  const totalProgress = goals.reduce((sum, goal) => sum + goal.current_amount, 0);
  const overallProgress = totalGoalsValue > 0 ? (totalProgress / totalGoalsValue) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-slate-200 dark:bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Financial Goals</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Track your progress and stay motivated</p>
        </div>
        
        <button
          onClick={() => setShowForm(true)}
          className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-900 to-cyan-600 text-white rounded-lg hover:from-blue-800 hover:to-cyan-500 transition-all duration-200 transform hover:scale-105"
        >
          <Plus className="h-5 w-5 mr-2" />
          New Goal
        </button>
      </div>

      {goals.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center">
              <Target className="h-5 w-5 mr-2 text-cyan-600 dark:text-cyan-400" />
              Overall Progress
            </h3>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{overallProgress.toFixed(1)}%</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">₹{totalProgress.toLocaleString()} saved</div>
            </div>
          </div>
          
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-cyan-500 to-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(overallProgress, 100)}%` }}
            />
          </div>
          
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-600 dark:text-slate-400">Total Goal Value:</span>
              <span className="ml-2 font-semibold text-slate-900 dark:text-white">₹{totalGoalsValue.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Remaining:</span>
              <span className="ml-2 font-semibold text-slate-900 dark:text-white">₹{(totalGoalsValue - totalProgress).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onEdit={() => handleEditGoal(goal)}
            onDelete={() => handleDeleteGoal(goal.id)}
          />
        ))}
      </div>

      {goals.length === 0 && !loading && (
        <div className="text-center py-12">
          <Target className="h-16 w-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No goals yet</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6">Create your first financial goal to get started</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-900 to-cyan-600 text-white rounded-lg hover:from-blue-800 hover:to-cyan-500 transition-all duration-200"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Goal
          </button>
        </div>
      )}

      {showForm && (
        <GoalForm
          goal={editingGoal}
          onSave={handleSaveGoal}
          onCancel={() => {
            setShowForm(false);
            setEditingGoal(undefined);
          }}
        />
      )}
    </div>
  );
};