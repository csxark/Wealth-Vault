import api from './api';

// Types for gamification
export interface AchievementDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  pointsRequired: number;
  criteria: {
    type: string;
    value: number;
    metric: string;
  };
  rewardPoints: number;
  rewardBadge: boolean;
  isActive: boolean;
  displayOrder: number;
}

export interface UserAchievement {
  id: string;
  progress: number;
  isCompleted: boolean;
  earnedAt: string;
  completedAt: string;
  achievementId: string;
  code: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  tier: string;
  rewardPoints: number;
}

export interface UserProgress {
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
  streaks: {
    type: string;
    current: number;
    longest: number;
  }[];
  recentHistory: {
    id: string;
    points: number;
    actionType: string;
    description: string;
    createdAt: string;
  }[];
}

export interface UserStats {
  totalAchievements: number;
  earnedAchievements: number;
  lifetimePoints: number;
  pointsByAction: {
    actionType: string;
    total: number;
  }[];
  achievementsByTier: {
    tier: string;
    count: number;
  }[];
  completionPercentage: number;
}

export interface GamificationDashboard {
  progress: UserProgress;
  achievements: UserAchievement[];
  availableAchievements: AchievementDefinition[];
  stats: UserStats;
  healthScore: {
    score: number;
    rating: string;
  } | null;
}

// API functions
export const gamificationApi = {
  // Get user achievements
  getAchievements: async (): Promise<UserAchievement[]> => {
    const response = await api.get('/achievements');
    return response.data.data;
  },

  // Get achievement progress
  getProgress: async (): Promise<UserProgress> => {
    const response = await api.get('/achievements/progress');
    return response.data.data;
  },

  // Get available achievements
  getAvailableAchievements: async (): Promise<AchievementDefinition[]> => {
    const response = await api.get('/achievements/available');
    return response.data.data;
  },

  // Get achievement statistics
  getStats: async (): Promise<UserStats> => {
    const response = await api.get('/achievements/stats');
    return response.data.data;
  },

  // Get gamification dashboard
  getDashboard: async (): Promise<GamificationDashboard> => {
    const response = await api.get('/achievements/dashboard');
    return response.data.data;
  },

  // Manually trigger achievement check
  checkAchievements: async (): Promise<AchievementDefinition[]> => {
    const response = await api.post('/achievements/check');
    return response.data.data;
  },
};

export default gamificationApi;
