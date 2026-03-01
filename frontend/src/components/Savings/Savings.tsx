import React, { useState, useEffect } from 'react';
import { Plus, Trophy } from 'lucide-react';
import SavingsSettings from './SavingsSettings';
import RoundUpHistory from './RoundUpHistory';
import SavingsChallengeCard from './SavingsChallengeCard';
import ChallengeLeaderboard from './ChallengeLeaderboard';
import CreateChallengeModal from './CreateChallengeModal';

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

interface LeaderboardEntry {
  participantId: string;
  userId: string;
  userName: string;
  userLastName: string;
  currentProgress: number;
  joinedAt: string;
  status: 'active' | 'completed' | 'withdrawn';
}

const Savings: React.FC = () => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [userParticipatingChallenges, setUserParticipatingChallenges] = useState<Set<string>>(new Set());
  const [userProgress, setUserProgress] = useState<Map<string, number>>(new Map());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [leaderboardChallenge, setLeaderboardChallenge] = useState<{
    id: string;
    title: string;
    leaderboard: LeaderboardEntry[];
    targetAmount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChallenges();
  }, []);

  const loadChallenges = async () => {
    try {
      const response = await fetch('/api/savings/challenges');
      if (response.ok) {
        const data = await response.json();
        setChallenges(data.data || []);

        // Determine which challenges user is participating in
        const participating = new Set<string>();
        const progress = new Map<string, number>();

        // For now, we'll assume user is not participating in any challenges
        // In a real implementation, you'd check participation status from the API
        setUserParticipatingChallenges(participating);
        setUserProgress(progress);
      }
    } catch (error) {
      console.error('Error loading challenges:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChallenge = async (challengeData: any) => {
    try {
      const response = await fetch('/api/savings/challenges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(challengeData),
      });

      if (response.ok) {
        await loadChallenges(); // Reload challenges
      } else {
        throw new Error('Failed to create challenge');
      }
    } catch (error) {
      console.error('Error creating challenge:', error);
      throw error;
    }
  };

  const handleJoinChallenge = async (challengeId: string) => {
    try {
      const response = await fetch(`/api/savings/challenges/${challengeId}/join`, {
        method: 'POST',
      });

      if (response.ok) {
        setUserParticipatingChallenges(prev => new Set([...prev, challengeId]));
        await loadChallenges(); // Reload to get updated participant counts
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to join challenge');
      }
    } catch (error) {
      console.error('Error joining challenge:', error);
      alert('Failed to join challenge');
    }
  };

  const handleViewLeaderboard = async (challengeId: string) => {
    try {
      const challenge = challenges.find(c => c.id === challengeId);
      if (!challenge) return;

      const response = await fetch(`/api/savings/challenges/${challengeId}/leaderboard`);
      if (response.ok) {
        const data = await response.json();
        setLeaderboardChallenge({
          id: challengeId,
          title: challenge.title,
          leaderboard: data.data || [],
          targetAmount: challenge.targetAmount,
        });
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-950 px-2 sm:px-6 md:px-12 lg:px-24 py-8 transition-all">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-cyan-700 dark:text-cyan-400">
                Savings & Challenges
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Automatically save the difference when you spend and participate in gamified savings challenges.
              </p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Challenge
            </button>
          </div>
        </div>

        {/* Savings Round-Up Section */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Savings Round-Up
            </h2>
          </div>
          <div className="mb-8">
            <SavingsSettings />
          </div>
          <RoundUpHistory />
        </div>

        {/* Challenges Section */}
        <div>
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Savings Challenges
            </h2>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mx-auto"></div>
              <p className="text-gray-500 dark:text-gray-400 mt-2">Loading challenges...</p>
            </div>
          ) : challenges.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No challenges yet
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Be the first to create a savings challenge and motivate others to save!
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Create Your First Challenge
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {challenges.map((challenge) => (
                <SavingsChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  onJoin={handleJoinChallenge}
                  onViewLeaderboard={handleViewLeaderboard}
                  isParticipating={userParticipatingChallenges.has(challenge.id)}
                  userProgress={userProgress.get(challenge.id) || 0}
                />
              ))}
            </div>
          )}
        </div>

        {/* Modals */}
        <CreateChallengeModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreateChallenge={handleCreateChallenge}
        />

        {leaderboardChallenge && (
          <ChallengeLeaderboard
            challengeId={leaderboardChallenge.id}
            challengeTitle={leaderboardChallenge.title}
            leaderboard={leaderboardChallenge.leaderboard}
            targetAmount={leaderboardChallenge.targetAmount}
            onClose={() => setLeaderboardChallenge(null)}
          />
        )}
      </div>
    </div>
  );
};

export default Savings;
