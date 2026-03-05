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

// Challenge Types
export interface Challenge {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  targetType: 'save_amount' | 'reduce_expense' | 'increase_income';
  targetAmount: number;
  targetCategoryId?: string;
  currency: string;
  startDate: string;
  endDate: string;
  isPublic: boolean;
  maxParticipants?: number;
  status: 'active' | 'completed' | 'cancelled';
  metadata: {
    tags: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    category: string;
  };
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  participantCount?: number;
}

export interface ChallengeParticipant {
  id: string;
  challengeId: string;
  userId: string;
  currentProgress: number;
  targetProgress: number;
  status: 'active' | 'completed' | 'withdrawn';
  joinedAt: string;
  lastUpdated: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
  rank?: number;
  progressPercentage?: number;
}

export interface ChallengeComment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
}

export interface ChallengeCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface ChallengeTemplate {
  id: string;
  title: string;
  description: string;
  targetType: string;
  targetAmount: number;
  defaultDurationDays: number;
  difficulty: string;
  category: string;
  icon?: string;
  isActive: boolean;
}

export interface UserChallengeStats {
  userId: string;
  totalChallengesJoined: number;
  totalChallengesCompleted: number;
  totalChallengesCreated: number;
  totalWins: number;
  bestStreak: number;
  currentStreak: number;
  totalPointsEarned: number;
  averageFinishPosition: number;
  totalPoints?: number;
  level?: number;
}

export interface ChallengeInvitation {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
  challenge: {
    id: string;
    title: string;
    description: string;
    targetType: string;
    targetAmount: number;
    endDate: string;
  };
  inviter: {
    id: string;
    firstName: string;
    lastName: string;
  };
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

  // Challenge API methods
  challenges: {
    // Get public challenges
    getPublic: async (params?: {
      category?: string;
      difficulty?: string;
      limit?: number;
      offset?: number;
    }): Promise<Challenge[]> => {
      const response = await api.get('/challenges/public', { params });
      return response.data.data;
    },

    // Get user's active challenges
    getMy: async (): Promise<Challenge[]> => {
      const response = await api.get('/challenges/my');
      return response.data.data;
    },

    // Get challenge by ID
    getById: async (id: string): Promise<Challenge> => {
      const response = await api.get(`/challenges/${id}`);
      return response.data.data;
    },

    // Create new challenge
    create: async (data: {
      title: string;
      description?: string;
      targetType: string;
      targetAmount: number;
      targetCategoryId?: string;
      startDate?: string;
      endDate: string;
      isPublic?: boolean;
      maxParticipants?: number;
      difficulty?: string;
      category?: string;
    }): Promise<Challenge> => {
      const response = await api.post('/challenges', data);
      return response.data.data;
    },

    // Join a challenge
    join: async (id: string, targetProgress: number): Promise<ChallengeParticipant> => {
      const response = await api.post(`/challenges/${id}/join`, { targetProgress });
      return response.data.data;
    },

    // Update progress
    updateProgress: async (id: string, progressAmount: number): Promise<ChallengeParticipant> => {
      const response = await api.post(`/challenges/${id}/progress`, { progressAmount });
      return response.data.data;
    },

    // Get challenge leaderboard
    getLeaderboard: async (id: string): Promise<ChallengeParticipant[]> => {
      const response = await api.get(`/challenges/${id}/leaderboard`);
      return response.data.data;
    },

    // Get global leaderboard
    getGlobalLeaderboard: async (params?: {
      limit?: number;
      timeframe?: 'all' | 'weekly' | 'monthly';
    }): Promise<any[]> => {
      const response = await api.get('/challenges/global-leaderboard', { params });
      return response.data.data;
    },

    // Get challenge categories
    getCategories: async (): Promise<ChallengeCategory[]> => {
      const response = await api.get('/challenges/categories');
      return response.data.data;
    },

    // Get challenge templates
    getTemplates: async (params?: {
      category?: string;
      difficulty?: string;
    }): Promise<ChallengeTemplate[]> => {
      const response = await api.get('/challenges/templates', { params });
      return response.data.data;
    },

    // Create challenge from template
    createFromTemplate: async (templateId: string, overrides?: {
      title?: string;
      description?: string;
      targetAmount?: number;
      difficulty?: string;
      isPublic?: boolean;
      maxParticipants?: number;
    }): Promise<Challenge> => {
      const response = await api.post(`/challenges/from-template/${templateId}`, overrides || {});
      return response.data.data;
    },

    // Get user's challenge statistics
    getStats: async (): Promise<UserChallengeStats> => {
      const response = await api.get('/challenges/stats');
      return response.data.data;
    },

    // Get challenge comments
    getComments: async (id: string): Promise<ChallengeComment[]> => {
      const response = await api.get(`/challenges/${id}/comments`);
      return response.data.data;
    },

    // Add comment
    addComment: async (id: string, content: string): Promise<ChallengeComment> => {
      const response = await api.post(`/challenges/${id}/comments`, { content });
      return response.data.data;
    },

    // Like a challenge
    like: async (id: string): Promise<void> => {
      await api.post(`/challenges/${id}/like`);
    },

    // Unlike a challenge
    unlike: async (id: string): Promise<void> => {
      await api.delete(`/challenges/${id}/like`);
    },

    // Get likes count and status
    getLikes: async (id: string): Promise<{ likeCount: number; isLiked: boolean }> => {
      const response = await api.get(`/challenges/${id}/likes`);
      return response.data.data;
    },

    // Get challenge activity
    getActivity: async (id: string): Promise<any[]> => {
      const response = await api.get(`/challenges/${id}/activity`);
      return response.data.data;
    },

    // Invite friend to challenge
    invite: async (id: string, inviteeId: string): Promise<void> => {
      await api.post(`/challenges/${id}/invite`, { inviteeId });
    },

    // Get user's challenge invitations
    getInvitations: async (): Promise<ChallengeInvitation[]> => {
      const response = await api.get('/challenges/invitations');
      return response.data.data;
    },

    // Respond to invitation
    respondToInvitation: async (invitationId: string, accept: boolean): Promise<void> => {
      await api.post(`/challenges/invitations/${invitationId}/respond`, { accept });
    },

    // Get recommended challenges
    getRecommended: async (): Promise<Challenge[]> => {
      const response = await api.get('/challenges/recommended');
      return response.data.data;
    },

    // Calculate automatic progress
    calculateProgress: async (id: string, startDate?: string, endDate?: string): Promise<void> => {
      await api.post(`/challenges/${id}/calculate-progress`, { startDate, endDate });
    },
  },
};

export default gamificationApi;
