import React from 'react';
import { Target, TrendingUp, Calendar, Edit3, Trash2, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import type { Goal, Milestone } from '../../types';
import { MilestoneCard } from './MilestoneCard';

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goalId: string) => void;
  onToggleExpand?: (goalId: string) => void;
  isExpanded?: boolean;
  milestones?: Milestone[];
  onAddMilestone?: (goalId: string) => void;
  onEditMilestone?: (milestone: Milestone) => void;
  onDeleteMilestone?: (goalId: string, milestoneId: string) => void;
  onContributeToMilestone?: (goalId: string, milestoneId: string, amount: number) => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({ goal, onEdit, onDelete }) => {
  const progress = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
  const remainingAmount = goal.targetAmount - goal.currentAmount;
  const daysUntilTarget = Math.ceil((new Date(goal.deadline || goal.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  
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
            onClick={() => onToggleExpand?.(goal._id)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title={isExpanded ? "Collapse milestones" : "Expand milestones"}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onEdit(goal)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Edit goal"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(goal._id)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="Delete goal"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-600 dark:text-slate-400">Progress</span>
          <span className="font-medium text-slate-900 dark:text-white">
            ₹{goal.currentAmount.toLocaleString()} / ₹{goal.targetAmount.toLocaleString()}
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

        {/* Milestones Section */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-slate-900 dark:text-white">Milestones</h4>
              <button
                onClick={() => onAddMilestone?.(goal._id)}
                className="flex items-center px-3 py-1 text-xs bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 transition-colors"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Milestone
              </button>
            </div>

            {milestones && milestones.length > 0 ? (
              <div className="space-y-3">
                {milestones.map((milestone) => (
                  <MilestoneCard
                    key={milestone.id}
                    milestone={milestone}
                    onEdit={() => onEditMilestone?.(milestone)}
                    onDelete={() => onDeleteMilestone?.(goal._id, milestone.id)}
                    onContribute={(amount) => onContributeToMilestone?.(goal._id, milestone.id, amount)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-slate-500 dark:text-slate-400">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No milestones yet</p>
                <p className="text-xs">Break your goal into smaller, achievable steps</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
