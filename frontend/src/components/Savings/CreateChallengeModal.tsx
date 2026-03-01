import React, { useState } from 'react';
import { X, Trophy, Users, Target, Calendar } from 'lucide-react';

interface CreateChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateChallenge: (challengeData: any) => void;
}

const CreateChallengeModal: React.FC<CreateChallengeModalProps> = ({
  isOpen,
  onClose,
  onCreateChallenge,
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'personal' as 'personal' | 'community',
    targetAmount: '',
    duration: '30', // days
    startDate: new Date().toISOString().split('T')[0],
    rules: {
      minParticipants: 1,
      maxParticipants: null,
      allowLateJoin: false,
      progressTracking: 'automatic' as 'automatic' | 'manual',
    },
    rewards: {
      completionBadge: true,
      leaderboardBonus: false,
      customRewards: [],
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const challengeData = {
        ...formData,
        targetAmount: parseFloat(formData.targetAmount),
        duration: parseInt(formData.duration),
        endDate: new Date(
          new Date(formData.startDate).getTime() + (parseInt(formData.duration) * 24 * 60 * 60 * 1000)
        ).toISOString().split('T')[0],
      };

      await onCreateChallenge(challengeData);
      onClose();

      // Reset form
      setFormData({
        title: '',
        description: '',
        type: 'personal',
        targetAmount: '',
        duration: '30',
        startDate: new Date().toISOString().split('T')[0],
        rules: {
          minParticipants: 1,
          maxParticipants: null,
          allowLateJoin: false,
          progressTracking: 'automatic',
        },
        rewards: {
          completionBadge: true,
          leaderboardBonus: false,
          customRewards: [],
        },
      });
    } catch (error) {
      console.error('Error creating challenge:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleRulesChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      rules: {
        ...prev.rules,
        [field]: value,
      },
    }));
  };

  const handleRewardsChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      rewards: {
        ...prev.rewards,
        [field]: value,
      },
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-500" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Create Savings Challenge
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Close modal"
              aria-label="Close modal"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Basic Information
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Challenge Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="e.g., Save $500 this month"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="Describe your savings challenge..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Challenge Type
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => handleInputChange('type', e.target.value as 'personal' | 'community')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      aria-label="Challenge type"
                    >
                      <option value="personal">Personal</option>
                      <option value="community">Community</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Target Amount ($) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="0.01"
                      value={formData.targetAmount}
                      onChange={(e) => handleInputChange('targetAmount', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      placeholder="500.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Start Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) => handleInputChange('startDate', e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Duration (days) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="365"
                      value={formData.duration}
                      onChange={(e) => handleInputChange('duration', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Rules */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Challenge Rules
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allowLateJoin"
                    checked={formData.rules.allowLateJoin}
                    onChange={(e) => handleRulesChange('allowLateJoin', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-cyan-600 focus:ring-cyan-500 dark:bg-gray-700"
                  />
                  <label htmlFor="allowLateJoin" className="text-sm text-gray-700 dark:text-gray-300">
                    Allow participants to join after challenge starts
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Progress Tracking
                  </label>
                  <select
                    value={formData.rules.progressTracking}
                    onChange={(e) => handleRulesChange('progressTracking', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  >
                    <option value="automatic">Automatic (from round-ups and manual entries)</option>
                    <option value="manual">Manual (participants report progress)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Rewards */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Rewards & Incentives
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="completionBadge"
                    checked={formData.rewards.completionBadge}
                    onChange={(e) => handleRewardsChange('completionBadge', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-cyan-600 focus:ring-cyan-500 dark:bg-gray-700"
                  />
                  <label htmlFor="completionBadge" className="text-sm text-gray-700 dark:text-gray-300">
                    Award completion badge
                  </label>
                </div>

                {formData.type === 'community' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="leaderboardBonus"
                      checked={formData.rewards.leaderboardBonus}
                      onChange={(e) => handleRewardsChange('leaderboardBonus', e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600 text-cyan-600 focus:ring-cyan-500 dark:bg-gray-700"
                    />
                    <label htmlFor="leaderboardBonus" className="text-sm text-gray-700 dark:text-gray-300">
                      Special rewards for top 3 finishers
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create Challenge'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateChallengeModal;
