import React, { useState, useEffect } from 'react';
import { Plus, Target } from 'lucide-react';
import { GoalCard } from './GoalCard';
import { GoalForm } from './GoalForm';
import { useAuth } from '../../hooks/useAuth';
import type { Goal } from '../../types';

export const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>();
  const { user } = useAuth();

  useEffect(() => {
    loadGoals();
  }, [user]);

  const loadGoals = () => {
    const savedGoals = localStorage.getItem(`goals-${user?.id}`);
    if (savedGoals) {
      setGoals(JSON.parse(savedGoals));
    }
  };

  const saveGoals = (updatedGoals: Goal[]) => {
    localStorage.setItem(`goals-${user?.id}`, JSON.stringify(updatedGoals));
    setGoals(updatedGoals);
  };

  const handleSaveGoal = (goalData: Partial<Goal>) => {
    if (editingGoal) {
      // Update existing goal
      const updatedGoals = goals.map(g => 
        g.id === editingGoal.id 
          ? { ...g, ...goalData, updated_at: new Date().toISOString() }
          : g
      );
      saveGoals(updatedGoals);
    } else {
      // Create new goal
      const newGoal: Goal = {
        id: Date.now().toString(),
        user_id: user?.id || '',
        title: goalData.title || '',
        description: goalData.description || '',
        target_amount: goalData.target_amount || 0,
        current_amount: goalData.current_amount || 0,
        target_date: goalData.target_date || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      saveGoals([...goals, newGoal]);
    }
    
    setShowForm(false);
    setEditingGoal(undefined);
  };

  const handleEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setShowForm(true);
  };

  const handleDeleteGoal = (goalId: string) => {
    const updatedGoals = goals.filter(g => g.id !== goalId);
    saveGoals(updatedGoals);
  };

  const totalGoalsValue = goals.reduce((sum, goal) => sum + goal.target_amount, 0);
  const totalProgress = goals.reduce((sum, goal) => sum + goal.current_amount, 0);
  const overallProgress = totalGoalsValue > 0 ? (totalProgress / totalGoalsValue) * 100 : 0;

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
          
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 mb-2">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-600 h-4 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${Math.min(overallProgress, 100)}%` }}
            />
          </div>
          
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {goals.length} active goal{goals.length !== 1 ? 's' : ''} • ₹{(totalGoalsValue - totalProgress).toLocaleString()} remaining
          </div>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="text-center py-12">
          <Target className="h-12 w-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No goals yet</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6">Create your first financial goal to start tracking your progress</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-900 to-cyan-600 text-white rounded-lg hover:from-blue-800 hover:to-cyan-500 transition-all duration-200"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Your First Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={handleEditGoal}
              onDelete={handleDeleteGoal}
            />
          ))}
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