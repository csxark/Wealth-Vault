import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { gamificationApi } from '../services/gamificationApi';
import { Challenge, ChallengeTemplate, UserChallengeStats, ChallengeCategory } from '../services/gamificationApi';

const Challenges: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'browse' | 'my' | 'create' | 'leaderboard'>('browse');
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [myChallenges, setMyChallenges] = useState<Challenge[]>([]);
  const [templates, setTemplates] = useState<ChallengeTemplate[]>([]);
  const [stats, setStats] = useState<UserChallengeStats | null>(null);
  const [categories, setCategories] = useState<ChallengeCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [publicRes, myRes, templatesRes, statsRes, categoriesRes] = await Promise.all([
        gamificationApi.challenges.getPublic({ limit: 20 }),
        gamificationApi.challenges.getMy(),
        gamificationApi.challenges.getTemplates(),
        gamificationApi.challenges.getStats(),
        gamificationApi.challenges.getCategories()
      ]);
      
      setChallenges(publicRes);
      setMyChallenges(myRes);
      setTemplates(templatesRes);
      setStats(statsRes);
      setCategories(categoriesRes);
    } catch (err) {
      console.error('Error fetching challenges:', err);
      setError('Failed to load challenges');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinChallenge = async (challengeId: string, targetProgress: number) => {
    try {
      await gamificationApi.challenges.join(challengeId, targetProgress);
      fetchData();
    } catch (err) {
      console.error('Error joining challenge:', err);
    }
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    try {
      await gamificationApi.challenges.createFromTemplate(templateId);
      fetchData();
      setActiveTab('my');
    } catch (err) {
      console.error('Error creating challenge:', err);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'hard': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      savings: '💰',
      budgeting: '📊',
      emergency_fund: '🛡️',
      debt_payoff: '💳',
      investment: '📈',
    };
    return icons[category] || '🎯';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            🏆 Financial Challenges
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Compete with others, track your progress, and achieve your financial goals!
          </p>
        </div>

        {/* Stats Card */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Joined</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalChallengesJoined}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Completed</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalChallengesCompleted}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Wins</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalWins}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Streak</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.currentStreak}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-gray-700">
          {['browse', 'my', 'create', 'leaderboard'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`pb-2 px-4 font-medium capitalize ${
                activeTab === tab
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab === 'browse' ? 'Browse Challenges' : tab === 'my' ? 'My Challenges' : tab === 'create' ? 'Create' : 'Leaderboard'}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Browse Challenges Tab */}
        {activeTab === 'browse' && (
          <div>
            {/* Category Filter */}
            <div className="mb-6">
              <select
                title="Filter by category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Challenges Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {challenges.map(challenge => (
                <div key={challenge.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
                  <div className="flex items-start justify-between mb-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getDifficultyColor(challenge.metadata?.difficulty || 'medium')}`}>
                      {challenge.metadata?.difficulty || 'medium'}
                    </span>
                    <span className="text-2xl">{getCategoryIcon(challenge.metadata?.category || 'savings')}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {challenge.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                    {challenge.description}
                  </p>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {challenge.participantCount || 0} participants
                    </span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      ${challenge.targetAmount}
                    </span>
                  </div>
                  <button
                    onClick={() => handleJoinChallenge(challenge.id, Number(challenge.targetAmount))}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition"
                  >
                    Join Challenge
                  </button>
                </div>
              ))}
            </div>

            {challenges.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">No challenges available yet. Create one!</p>
              </div>
            )}
          </div>
        )}

        {/* My Challenges Tab */}
        {activeTab === 'my' && (
          <div>
            {myChallenges.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myChallenges.map(challenge => (
                  <div key={challenge.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {challenge.title}
                    </h3>
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500 dark:text-gray-400">Progress</span>
                        <span className="text-gray-900 dark:text-white">{challenge.participation?.currentProgress || 0}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${challenge.participation?.currentProgress || 0}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={`px-2 py-1 rounded ${challenge.participation?.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {challenge.participation?.status || 'active'}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        Ends: {new Date(challenge.endDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">You haven't joined any challenges yet.</p>
                <button
                  onClick={() => setActiveTab('browse')}
                  className="mt-4 text-blue-500 hover:text-blue-600"
                >
                  Browse Challenges →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Create Tab */}
        {activeTab === 'create' && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Start from a Template</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map(template => (
                <div key={template.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-3xl">{template.icon || '🎯'}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getDifficultyColor(template.difficulty)}`}>
                      {template.difficulty}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {template.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                    {template.description}
                  </p>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {template.defaultDurationDays} days
                    </span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      ${template.targetAmount}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCreateFromTemplate(template.id)}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg transition"
                  >
                    Start Challenge
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard Tab */}
        {activeTab === 'leaderboard' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Global Leaderboard</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Top challengers in the community</p>
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">Leaderboard feature coming soon!</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Challenges;

