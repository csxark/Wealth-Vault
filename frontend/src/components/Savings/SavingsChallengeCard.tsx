import React from 'react';
import { Trophy, Users, Calendar, Target, TrendingUp } from 'lucide-react';

interface Challenge {
  id: string;
  title: string;
  description: string;
  type: 'personal' | 'community';
  targetAmount: number;
  duration: number;
  startDate: string;
  endDate: string;
  creatorId: string;
  isActive: boolean;
  participantCount?: number;
  currentProgress?: number;
  status?: 'active' | 'completed' | 'withdrawn';
}

interface SavingsChallengeCardProps {
  challenge: Challenge;
  onJoin?: (challengeId: string) => void;
  onViewLeaderboard?: (challengeId: string) => void;
  isParticipating?: boolean;
  userProgress?: number;
}

const SavingsChallengeCard: React.FC<SavingsChallengeCardProps> = ({
  challenge,
  onJoin,
  onViewLeaderboard,
  isParticipating = false,
  userProgress = 0,
}) => {
  const progressPercentage = challenge.targetAmount > 0
    ? Math.min((userProgress / challenge.targetAmount) * 100, 100)
    : 0;

  const daysLeft = Math.ceil(
    (new Date(challenge.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {challenge.title}
            </h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              challenge.type === 'community'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            }`}>
              {challenge.type === 'community' ? 'Community' : 'Personal'}
            </span>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
            {challenge.description}
          </p>
        </div>
        <Trophy className="w-6 h-6 text-yellow-500 flex-shrink-0" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Target: {formatCurrency(challenge.targetAmount)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {daysLeft > 0 ? `${daysLeft} days left` : 'Ended'}
          </span>
        </div>
        {challenge.type === 'community' && (
          <>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {challenge.participantCount || 0} participants
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {formatCurrency(challenge.currentProgress || 0)} saved
              </span>
            </div>
          </>
        )}
      </div>

      {isParticipating && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
            <span>Your Progress</span>
            <span>{formatCurrency(userProgress)} / {formatCurrency(challenge.targetAmount)}</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {progressPercentage.toFixed(1)}% complete
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {!isParticipating ? (
          <button
            onClick={() => onJoin?.(challenge.id)}
            className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Join Challenge
          </button>
        ) : (
          <button
            onClick={() => onViewLeaderboard?.(challenge.id)}
            className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            View Leaderboard
          </button>
        )}
        {challenge.type === 'community' && (
          <button
            onClick={() => onViewLeaderboard?.(challenge.id)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="View Leaderboard"
            aria-label="View Leaderboard"
          >
            <Trophy className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default SavingsChallengeCard;
