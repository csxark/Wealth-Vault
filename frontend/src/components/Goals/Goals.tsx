import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Target } from 'lucide-react';
import { GoalCard } from './GoalCard';
import { GoalForm } from './GoalForm';
import { useAuth } from '../../hooks/useAuth';
import { goalsAPI } from '../../services/api';
import { useLoading } from '../../context/LoadingContext';
import type { Goal } from '../../types';

export const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>();
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { withLoading } = useLoading();

  useEffect(() => {
    if (user) {
      loadGoals();
    }
  }, [user, loadGoals]);

  const loadGoals = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await withLoading(goalsAPI.getAll(), 'Loading goals...');
      if (response.success && response.data.goals) {
        setGoals(response.data.goals);
      } else {
        setGoals([]);
      }
    } catch { 
      setGoals([]); // Ensure goals is always an array
    }
    finally { setLoading(false); }
  }, [user]);

  const handleSaveGoal = async (goalData: Partial<Goal>) => {
    if (!user) return;
    try {
      if (editingGoal) {
        const response = await withLoading(goalsAPI.update(editingGoal._id, goalData), 'Updating goal...');
        console.log('Update response:', response);
        if (!response.success) {
          console.error('Failed to update goal:', response);
          return;
        }
      } else {
        const deadline = goalData.deadline || goalData.targetDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        console.log('Creating goal with data:', {
          title: goalData.title || '',
          description: goalData.description || '',
          targetAmount: goalData.targetAmount || 0,
          currentAmount: goalData.currentAmount ?? 0,
          type: 'savings',
          priority: 'medium',
          status: 'active',
          targetDate: deadline,
          deadline: deadline,
          contributions: goalData.contributions ?? [],
        });
        const response = await withLoading(goalsAPI.create({
          title: goalData.title || '',
          description: goalData.description || '',
          targetAmount: goalData.targetAmount || 0,
          currentAmount: goalData.currentAmount ?? 0,
          type: 'savings',
          priority: 'medium',
          status: 'active',
          targetDate: deadline,
          deadline: deadline,
          contributions: goalData.contributions ?? [],
        }), 'Creating goal...');
        console.log('Create response:', response);
        if (!response.success) {
          console.error('Failed to create goal:', response);
          return;
        }
      }
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
      const response = await withLoading(goalsAPI.delete(goalId), 'Deleting goal...');
      if (response.success) await loadGoals();
    } catch { /* Silent */ }
  };

  const totalGoalsValue = (goals || []).reduce((sum, goal) => sum + goal.targetAmount, 0);
  const totalProgress = (goals || []).reduce((sum, goal) => sum + goal.currentAmount, 0);
  const overallProgress = totalGoalsValue > 0 ? (totalProgress / totalGoalsValue) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin h-10 w-10 border-4 border-gray-200 dark:border-gray-800 rounded-full border-b-cyan-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-950 px-2 sm:px-6 md:px-12 lg:px-24 py-8 transition-all">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-cyan-700 dark:text-cyan-400">Financial Goals</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Track your progress towards financial milestones</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl shadow hover:from-cyan-600 hover:to-blue-700 transition"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Goal
          </button>
        </div>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <SummaryCard
            icon={<Target className="h-6 w-6 text-cyan-600" />}
            label="Total Goals"
            value={goals.length}
          />
          <SummaryCard
            icon={<Target className="h-6 w-6 text-green-500" />}
            label="Target Value"
            value={`₹${totalGoalsValue.toLocaleString()}`}
          />
          <SummaryCard
            icon={<Target className="h-6 w-6 text-purple-600" />}
            label="Overall Progress"
            value={`${overallProgress.toFixed(1)}%`}
          />
        </div>
        {/* Empty State */}
        {goals.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-12 flex flex-col items-center text-center border border-cyan-100 dark:border-cyan-900">
            <Target className="h-10 w-10 text-gray-400 mb-3" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No goals yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Start by creating your first financial goal</p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-cyan-600 text-white px-4 py-2 rounded-lg shadow hover:bg-cyan-700 transition"
            >
              Create First Goal
            </button>
          </div>
        ) : (
          // Goals Grid
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {goals.map(goal => (
              <GoalCard
                key={goal._id}
                goal={goal}
                onEdit={handleEditGoal}
                onDelete={handleDeleteGoal}
              />
            ))}
          </div>
        )}

        {/* Goal Form Modal */}
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
    </div>
  );
};

// Single Summary Card Component for minimalist look
function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow flex items-center gap-4 p-6 border border-cyan-100 dark:border-cyan-900">
      <div className="bg-cyan-100 dark:bg-cyan-900 p-3 rounded-xl">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-300">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

export default Goals;
