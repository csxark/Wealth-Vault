import React from 'react';
import { Target, Edit3, Trash2, Plus } from 'lucide-react';
import type { Milestone } from '../../types';

interface MilestoneCardProps {
  milestone: Milestone;
  onEdit: () => void;
  onDelete: () => void;
  onContribute: (amount: number) => void;
}

export const MilestoneCard: React.FC<MilestoneCardProps> = ({ 
  milestone, 
  onEdit, 
  onDelete,
  onContribute 
}) => {
  const progress = milestone.targetAmount > 0 
    ? (milestone.currentAmount / milestone.targetAmount) * 100 
    : 0;
  
  const isCompleted = milestone.isCompleted || progress >= 100;

  return (
    <div className={`bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border ${
      isCompleted 
        ? 'border-green-200 dark:border-green-700/50' 
        : 'border-slate-200 dark:border-slate-600'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center">
          <div className={`p-1.5 rounded-md ${
            isCompleted 
              ? 'bg-green-100 dark:bg-green-900/30' 
              : 'bg-cyan-100 dark:bg-cyan-900/30'
          }`}>
            <Target className={`h-4 w-4 ${
              isCompleted 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-cyan-600 dark:text-cyan-400'
            }`} />
          </div>
          <div className="ml-2">
            <h5 className="text-sm font-medium text-slate-900 dark:text-white">{milestone.title}</h5>
            {milestone.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{milestone.description}</p>
            )}
          </div>
        </div>
        
        <div className="flex space-x-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-md transition-colors"
            aria-label="Edit milestone"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            aria-label="Delete milestone"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 dark:text-slate-400">Progress</span>
          <span className="font-medium text-slate-700 dark:text-slate-300">
            ₹{milestone.currentAmount.toLocaleString()} / ₹{milestone.targetAmount.toLocaleString()}
          </span>
        </div>

        <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ease-out ${
              isCompleted 
                ? 'bg-green-500' 
                : 'bg-gradient-to-r from-cyan-500 to-blue-600'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {progress.toFixed(1)}% complete
          </span>
          
          {!isCompleted && (
            <button
              onClick={() => {
                const amount = prompt('Enter contribution amount:');
                if (amount && !isNaN(Number(amount))) {
                  onContribute(Number(amount));
                }
              }}
              className="flex items-center px-2 py-1 text-xs bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded-md hover:bg-cyan-200 dark:hover:bg-cyan-900/50 transition-colors"
            >
              <Plus className="h-3 w-3 mr-1" />
              Contribute
            </button>
          )}
          
          {isCompleted && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              ✓ Completed
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
