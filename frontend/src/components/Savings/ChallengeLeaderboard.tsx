import React from 'react';
import { Trophy, Medal, Award, Crown } from 'lucide-react';

interface LeaderboardEntry {
  participantId: string;
  userId: string;
  userName: string;
  userLastName: string;
  currentProgress: number;
  joinedAt: string;
  status: 'active' | 'completed' | 'withdrawn';
}

interface ChallengeLeaderboardProps {
  challengeId: string;
  challengeTitle: string;
  leaderboard: LeaderboardEntry[];
  targetAmount: number;
  onClose: () => void;
}

const ChallengeLeaderboard: React.FC<ChallengeLeaderboardProps> = ({
  challengeId,
  challengeTitle,
  leaderboard,
  targetAmount,
  onClose,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getRankIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="w-5 h-5 flex items-center justify-center text-sm font-medium text-gray-500">#{position}</span>;
    }
  };

  const getRankBadgeColor = (position: number) => {
    switch (position) {
      case 1:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 2:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      case 3:
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const sortedLeaderboard = [...leaderboard].sort((a, b) => b.currentProgress - a.currentProgress);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-500" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Challenge Leaderboard
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {challengeTitle}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Close leaderboard"
              aria-label="Close leaderboard"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {sortedLeaderboard.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                No participants yet. Be the first to join!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedLeaderboard.map((entry, index) => {
                const position = index + 1;
                const progressPercentage = targetAmount > 0
                  ? Math.min((entry.currentProgress / targetAmount) * 100, 100)
                  : 0;

                return (
                  <div
                    key={entry.participantId}
                    className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                      position <= 3
                        ? 'bg-gradient-to-r from-yellow-50 to-transparent border-yellow-200 dark:from-yellow-900/20 dark:border-yellow-800'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-center w-10 h-10">
                      {getRankIcon(position)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {entry.userName} {entry.userLastName}
                        </p>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getRankBadgeColor(position)}`}>
                          #{position}
                        </span>
                        {entry.status === 'completed' && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Completed
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <span>
                          {formatCurrency(entry.currentProgress)} saved
                        </span>
                        <span>
                          {progressPercentage.toFixed(1)}% of target
                        </span>
                      </div>

                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            position === 1 ? 'bg-yellow-500' :
                            position === 2 ? 'bg-gray-400' :
                            position === 3 ? 'bg-amber-500' :
                            'bg-cyan-500'
                          }`}
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Target Amount: <span className="font-medium">{formatCurrency(targetAmount)}</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Rankings update automatically as participants save
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChallengeLeaderboard;
