import React from 'react';
import { Target, TrendingUp, Calendar, Edit3, Trash2 } from 'lucide-react';
import type { Goal } from '../../types';

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goalId: string) => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({ goal, onEdit, onDelete }) => {
  const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
  const remainingAmount = goal.target_amount - goal.current_amount;
  const daysUntilTarget = Math.ceil((new Date(goal.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  
  const getMotivationalMessage = () => {
    if (progress >= 100) return "🎉 Goal achieved! You're amazing!";
    if (progress >= 75) return "🔥 So close! You've got this!";
    if (progress >= 50) return "💪 Halfway there! Keep going!";
    if (progress >= 25) return "🌟 Great start! You're building momentum!";
    return "🚀 Every step counts! You can do this!";
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2 rounded-lg">
            <Target className="h-5 w-5 text-white" />
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{goal.title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">{goal.description}</p>
          </div>
        </div>
        
        <div className="flex space-x-1">
          <button
            onClick={() => onEdit(goal)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(goal.id)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-600 dark:text-slate-400">Progress</span>
          <span className="font-medium text-slate-900 dark:text-white">
            ₹{goal.current_amount.toLocaleString()} / ₹{goal.target_amount.toLocaleString()}
          </span>
        </div>

        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-cyan-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-slate-600">
          <span>{progress.toFixed(1)}% complete</span>
          <span className="dark:text-slate-400">₹{remainingAmount.toLocaleString()} remaining</span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
            <Calendar className="h-4 w-4 mr-1" />
            <span>{daysUntilTarget > 0 ? `${daysUntilTarget} days left` : 'Overdue'}</span>
          </div>
          <div className="flex items-center text-sm text-green-600 dark:text-green-400">
            <TrendingUp className="h-4 w-4 mr-1" />
            <span>On track</span>
          </div>
        </div>

        <div className="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 p-3 rounded-lg">
          <p className="text-sm font-medium text-cyan-800 dark:text-cyan-200">{getMotivationalMessage()}</p>
        </div>
      </div>
    </div>
  );
};