import React, { useState, useEffect } from 'react';
import SavingsSettings from './SavingsSettings';
import RoundUpHistory from './RoundUpHistory';
import ChallengeCard from './ChallengeCard';
import CreateChallengeModal from './CreateChallengeModal';
import ChallengeLeaderboard from './ChallengeLeaderboard';
import { Plus, Trophy, Target, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

// Mock API functions - replace with actual API calls
const challengesAPI = {
  getPublic: async () => {
    // Mock data - replace with actual API call
    return {
      success: true,
      data: [
        {
          id: '1',
          title: 'Save $500 this month',
          description: 'Join us in saving $500 this month through smart spending habits',
          targetType: 'save_amount',
          targetAmount: '500.00',
          currency: 'USD',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isPublic: true,
          maxParticipants: null,
          metadata: {
            tags: ['savings', 'monthly'],
            difficulty: 'medium',
            category: 'savings'
          },
          creator: {
            id: '1',
            firstName: 'John',
            lastName: 'Doe'
          },
          participantCount: 15
        }
      ]
    };
  },
  getMy: async () => {
    // Mock data - replace with actual API call
    return {
      success: true,
      data: []
    };
  },
  create: async (data: any) => {
    // Mock response - replace with actual API call
    return {
      success: true,
      data: { ...data, id: Date.now().toString() }
    };
  },
  join: async (challengeId: string, targetProgress: number) => {
    // Mock response - replace with actual API call
    return {
      success: true,
      data: {
        id: Date.now().toString(),
        challengeId,
        userId: 'current-user',
        currentProgress: '0',
        targetProgress: targetProgress.toString(),
        status: 'active'
      }
    };
  },
  updateProgress: async (challengeId: string, progressAmount: number) => {
    // Mock response - replace with actual API call
    return {
      success: true,
      data: {
        id: '1',
        challengeId,
        currentProgress: progressAmount.toString(),
        targetProgress: '500.00',
        status: 'active'
      }
    };
  },
  getLeaderboard: async (challengeId: string) => {
    // Mock data - replace with actual API call
    return {
      success: true,
      data: [
        {
          rank: 1,
          userId: '1',
          currentProgress: '450.00',
          targetProgress: '500.00',
          status: 'active',
          progressPercentage: 90,
          user: {
            id: '1',
            firstName: 'Alice',
            lastName: 'Smith',
            profilePicture: null
          }
        }
      ]
    };
  }
};

const Savings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'roundup' | 'challenges'>('roundup');
  const [publicChallenges, setPublicChallenges] = useState<any[]>([]);
  const [myChallenges, setMyChallenges] = useState<any[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<any>(null);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (activeTab === 'challenges') {
      loadChallenges();
    }
  }, [activeTab]);

  const loadChallenges = async () => {
    setLoading(true);
    try {
      const [publicRes, myRes] = await Promise.all([
        challengesAPI.getPublic(),
        challengesAPI.getMy()
      ]);

      if (publicRes.success) {
        setPublicChallenges(publicRes.data);
      }
      if (myRes.success) {
        setMyChallenges(myRes.data);
      }
    } catch (error) {
      console.error('Error loading challenges:', error);
      showToast('Failed to load challenges', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChallenge = async (challengeData: any) => {
    try {
      const response = await challengesAPI.create(challengeData);
      if (response.success) {
        showToast('Challenge created successfully!', 'success');
        loadChallenges();
      }
    } catch (error) {
      console.error('Error creating challenge:', error);
      showToast('Failed to create challenge', 'error');
    }
  };

  const handleJoinChallenge = async (challengeId: string) => {
    try {
      // For demo, use a default target progress
      const targetProgress = 500; // This should come from user input
      const response = await challengesAPI.join(challengeId, targetProgress);
      if (response.success) {
        showToast('Successfully joined challenge!', 'success');
        loadChallenges();
      }
    } catch (error) {
      console.error('Error joining challenge:', error);
      showToast('Failed to join challenge', 'error');
    }
  };

  const handleUpdateProgress = async (challengeId: string) => {
    try {
      // For demo, add some progress
      const progressAmount = 50; // This should come from user input
      const response = await challengesAPI.updateProgress(challengeId, progressAmount);
      if (response.success) {
        showToast('Progress updated successfully!', 'success');
        loadChallenges();
      }
    } catch (error) {
      console.error('Error updating progress:', error);
      showToast('Failed to update progress', 'error');
    }
  };

  const handleViewLeaderboard = async (challenge: any) => {
    try {
      const response = await challengesAPI.getLeaderboard(challenge.id);
      if (response.success) {
        setLeaderboardData(response.data);
        setSelectedChallenge(challenge);
        setIsLeaderboardOpen(true);
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      showToast('Failed to load leaderboard', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-950 px-2 sm:px-6 md:px-12 lg:px-24 py-8 transition-all">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-10">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-cyan-700 dark:text-cyan-400">
              Savings & Challenges
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Automatically save with round-ups and join community challenges to build better financial habits.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 mb-8 border-b">
          <button
            onClick={() => setActiveTab('roundup')}
            className={`pb-2 px-4 font-medium transition-colors ${
              activeTab === 'roundup'
                ? 'border-b-2 border-cyan-500 text-cyan-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Round-Up Savings
          </button>
          <button
            onClick={() => setActiveTab('challenges')}
            className={`pb-2 px-4 font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'challenges'
                ? 'border-b-2 border-cyan-500 text-cyan-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Trophy className="h-4 w-4" />
            Challenges
          </button>
        </div>

        {/* Round-Up Savings Tab */}
        {activeTab === 'roundup' && (
          <>
            {/* Settings Section */}
            <div className="mb-8">
              <SavingsSettings />
            </div>

            {/* History Section */}
            <RoundUpHistory />
          </>
        )}

        {/* Challenges Tab */}
        {activeTab === 'challenges' && (
          <div className="space-y-8">
            {/* My Challenges Section */}
            {myChallenges.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    My Challenges
                  </h2>
                  <button
                    onClick={loadChallenges}
                    className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                    disabled={loading}
                  >
                    <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {myChallenges.map((challenge) => (
                    <ChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      onJoin={handleJoinChallenge}
                      onViewLeaderboard={handleViewLeaderboard}
                      onUpdateProgress={handleUpdateProgress}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Public Challenges Section */}
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Public Challenges
                </h2>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create Challenge
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-500">Loading challenges...</p>
                </div>
              ) : publicChallenges.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {publicChallenges.map((challenge) => (
                    <ChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      onJoin={handleJoinChallenge}
                      onViewLeaderboard={handleViewLeaderboard}
                      onUpdateProgress={handleUpdateProgress}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Target className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No challenges available
                  </h3>
                  <p className="text-gray-500 mb-6">
                    Be the first to create a financial challenge for the community!
                  </p>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    Create Your First Challenge
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modals */}
        <CreateChallengeModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreateChallenge={handleCreateChallenge}
        />

        {selectedChallenge && (
          <ChallengeLeaderboard
            isOpen={isLeaderboardOpen}
            onClose={() => setIsLeaderboardOpen(false)}
            challengeTitle={selectedChallenge.title}
            leaderboard={leaderboardData}
            currency={selectedChallenge.currency}
          />
        )}
      </div>
    </div>
  );
};

export default Savings;
