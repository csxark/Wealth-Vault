import React, { useState, useEffect } from 'react';
import { Plus, Target } from 'lucide-react';
import { GoalCard } from './GoalCard';
import { GoalForm } from './GoalForm';
import { useAuth } from '../../hooks/useAuth';
import { goalsAPI } from '../../services/api';
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
      const response = await goalsAPI.getAll();
      if (response.success) {
        setGoals(response.data.goals);
      } else {
        console.error('Error loading goals');
      }
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
        const response = await goalsAPI.update(editingGoal._id, goalData);
        if (!response.success) {
          console.error('Error updating goal');
          return;
        }
      } else {
        // Create new goal
        const response = await goalsAPI.create({
          title: goalData.title || '',
          description: goalData.description || '',
          targetAmount: goalData.targetAmount || 0,
          currency: 'INR',
          type: 'savings',
          priority: 'medium',
          deadline: goalData.deadline || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          isPublic: false
        });
        
        if (!response.success) {
          console.error('Error creating goal');
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
      const response = await goalsAPI.delete(goalId);
      if (!response.success) {
        console.error('Error deleting goal');
        return;
      }
      
      // Reload goals
      await loadGoals();
    } catch (error) {
      console.error('Error deleting goal:', error);
    }
  };

  const totalGoalsValue = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const totalProgress = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const overallProgress = totalGoalsValue > 0 ? (totalProgress / totalGoalsValue) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Financial Goals</h1>
          <p className="text-gray-600">Track your progress towards financial milestones</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Target className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Goals</p>
                <p className="text-2xl font-bold text-gray-900">{goals.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Target className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Target Value</p>
                <p className="text-2xl font-bold text-gray-900">₹{totalGoalsValue.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Target className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Overall Progress</p>
                <p className="text-2xl font-bold text-gray-900">{overallProgress.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Add Goal Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add New Goal
          </button>
        </div>

        {/* Goals Grid */}
        {goals.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No goals yet</h3>
            <p className="text-gray-600 mb-4">Start by creating your first financial goal</p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Your First Goal
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {goals.map((goal) => (
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