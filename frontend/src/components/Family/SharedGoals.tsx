import React, { useState, useEffect } from 'react';
import { Target, Plus, TrendingUp, Calendar, DollarSign } from 'lucide-react';

interface SharedGoalsProps {
  vaultId: string;
  vaultName: string;
}

interface Goal {
  id: string;
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  deadline: string;
  status: 'active' | 'completed' | 'paused';
  progress: number;
}

const SharedGoals: React.FC<SharedGoalsProps> = ({ vaultId, vaultName }) => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    // Mock data - replace with actual API call
    const mockGoals: Goal[] = [
      {
        id: '1',
        title: 'Family Vacation Fund',
        description: 'Saving for our summer vacation',
        targetAmount: 5000,
        currentAmount: 2500,
        currency: 'USD',
        deadline: '2024-07-01',
        status: 'active',
        progress: 50,
      },
      {
        id: '2',
        title: 'Emergency Fund',
        description: '6 months of expenses',
        targetAmount: 15000,
        currentAmount: 8000,
        currency: 'USD',
        deadline: '2024-12-31',
        status: 'active',
        progress: 53,
      },
    ];

    setTimeout(() => {
      setGoals(mockGoals);
      setLoading(false);
    }, 1000);
  }, [vaultId]);

  const handleContribute = (goalId: string) => {
    // Mock contribution - replace with actual API call
    alert('Contribution feature coming soon!');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'active': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'paused': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
            Shared Goals - {vaultName}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Work together towards common financial goals
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all duration-200 flex items-center"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Goal
        </button>
      </div>

      {/* Goals Grid */}
      {goals.length === 0 ? (
        <div className="text-center py-12">
          <Target className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-800 dark:text-white mb-2">
            No shared goals yet
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Create your first shared goal to start collaborating with family members
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all duration-200"
          >
            Create First Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map((goal) => (
            <div
              key={goal.id}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">
                    {goal.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {goal.description}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(goal.status)}`}>
                  {goal.status}
                </span>
              </div>

              {/* Progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Progress
                  </span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {goal.progress}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${goal.progress}%` }}
                  ></div>
                </div>
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Current
                  </p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-white">
                    ${goal.currentAmount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Target
                  </p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-white">
                    ${goal.targetAmount.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Deadline */}
              <div className="flex items-center text-sm text-slate-600 dark:text-slate-400 mb-4">
                <Calendar className="mr-1 h-4 w-4" />
                Due: {new Date(goal.deadline).toLocaleDateString()}
              </div>

              {/* Actions */}
              <button
                onClick={() => handleContribute(goal.id)}
                className="w-full px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all duration-200 flex items-center justify-center"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Contribute
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {goals.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
            Goal Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-600 mb-1">
                {goals.length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Total Goals
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 mb-1">
                {goals.filter(g => g.status === 'active').length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Active Goals
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 mb-1">
                ${goals.reduce((sum, g) => sum + g.currentAmount, 0).toLocaleString()}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Total Saved
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedGoals;
