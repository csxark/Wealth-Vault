import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';

interface UserProgress {
  points: number;
  lifetimePoints: number;
  level: number;
  levelProgress: number;
  pointsToNextLevel: number;
  badges: number;
  currentStreak: number;
  longestStreak: number;
  weeklyPoints: number;
  monthlyPoints: number;
  streaks: { type: string; current: number; longest: number }[];
  recentHistory: { id: string; points: number; actionType: string; description: string; createdAt: string }[];
}

interface Achievement {
  id: string;
  progress: number;
  isCompleted: boolean;
  earnedAt: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  tier: string;
  rewardPoints: number;
}

interface Stats {
  totalAchievements: number;
  earnedAchievements: number;
  lifetimePoints: number;
  completionPercentage: number;
}

interface HealthScore {
  score: number;
  rating: string;
}

const GamificationDashboard: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [progressRes, achievementsRes, statsRes] = await Promise.all([
        api.gamification.getProgress(),
        api.gamification.getAchievements(),
        api.gamification.getStats(),
      ]);

      if (progressRes.success) {
        setProgress(progressRes.data);
      }
      if (achievementsRes.success) {
        setAchievements(achievementsRes.data);
      }
      if (statsRes.success) {
        setStats(statsRes.data);
      }
    } catch (err) {
      console.error('Error fetching gamification data:', err);
      setError('Failed to load gamification data');
    } finally {
      setLoading(false);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'bronze': return 'text-amber-700 bg-amber-100 dark:bg-amber-900';
      case 'silver': return 'text-gray-600 bg-gray-100 dark:bg-gray-700';
      case 'gold': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900';
      case 'platinum': return 'text-purple-600 bg-purple-100 dark:bg-purple-900';
      case 'diamond': return 'text-cyan-500 bg-cyan-100 dark:bg-cyan-900';
      default: return 'text-gray-500 bg-gray-100';
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
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
            🎮 Financial Wellness & Achievements
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Track your progress, earn badges, and level up your financial health!
          </p>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Level and Points Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Current Level</p>
                <p className="text-5xl font-bold mt-2">{progress?.level || 1}</p>
              </div>
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-4xl">⭐</span>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-sm text-blue-100 mb-1">
                <span>{progress?.levelProgress || 0} XP</span>
                <span>{progress?.pointsToNextLevel || 100} XP to next</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-2">
                <div 
                  className="bg-white rounded-full h-2 transition-all"
                  style={{ 
                    width: `${progress ? (progress.levelProgress / progress.pointsToNextLevel) * 100 : 0}%` 
                  }}
                ></div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Total Points</p>
                <p className="text-4xl font-bold mt-2">{progress?.points || 0}</p>
              </div>
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-4xl">🏆</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-purple-200 text-xs">This Week</p>
                <p className="font-semibold">+{progress?.weeklyPoints || 0}</p>
              </div>
              <div>
                <p className="text-purple-200 text-xs">This Month</p>
                <p className="font-semibold">+{progress?.monthlyPoints || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-500 to-amber-700 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-sm">Current Streak</p>
                <p className="text-4xl font-bold mt-2">{progress?.currentStreak || 0} days</p>
              </div>
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-4xl">🔥</span>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-amber-200 text-sm">
                Best streak: {progress?.longestStreak || 0} days
              </p>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🏅</span>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Badges Earned</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{progress?.badges || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Lifetime Points</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{progress?.lifetimePoints || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🎯</span>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Achievements</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats?.earnedAchievements || 0}/{stats?.totalAchievements || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center">
                <span className="text-2xl">❤️</span>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Financial Health</p>
                <p className={`text-2xl font-bold ${getHealthColor(healthScore?.score || 0)}`}>
                  {healthScore?.score || '--'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Achievements Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            🏆 Your Achievements
          </h2>
          
          {achievements.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">
                No achievements yet. Start using the app to earn badges!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {achievements.slice(0, 6).map(achievement => (
                <div 
                  key={achievement.id}
                  className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getTierColor(achievement.tier)}`}>
                    <span className="text-xl">{achievement.icon || '🏅'}</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {achievement.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {achievement.description}
                    </p>
                    <span className={`inline-block mt-1 text-xs px-2 py-1 rounded ${getTierColor(achievement.tier)}`}>
                      +{achievement.rewardPoints} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {achievements.length > 6 && (
            <div className="mt-4 text-center">
              <button className="text-blue-600 dark:text-blue-400 hover:underline">
                View all {achievements.length} achievements →
              </button>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        {progress?.recentHistory && progress.recentHistory.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              📜 Recent Activity
            </h2>
            <div className="space-y-3">
              {progress.recentHistory.slice(0, 5).map(activity => (
                <div 
                  key={activity.id}
                  className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {activity.description}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(activity.createdAt)}
                    </p>
                  </div>
                  <span className="text-green-600 dark:text-green-400 font-semibold">
                    +{activity.points} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GamificationDashboard;
