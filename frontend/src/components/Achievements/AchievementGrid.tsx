import React, { useState, useEffect } from 'react';
import AchievementBadge from './AchievementBadge';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLoading } from '../../context/LoadingContext';

interface Achievement {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  points: number;
  criteria: any;
  rarity: string;
}

interface UserAchievement {
  id: string;
  achievementId: string;
  userId: string;
  unlockedAt: string;
  progress: number;
  achievement: Achievement;
}

interface AchievementProgress {
  achievementId: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  points: number;
  criteria: any;
  rarity: string;
  progress: number;
  isUnlocked: boolean;
  unlockedAt?: string;
}

interface AchievementGridProps {
  showProgress?: boolean;
  maxItems?: number;
  filter?: 'unlocked' | 'locked' | 'all';
  className?: string;
}

const AchievementGrid: React.FC<AchievementGridProps> = ({
  showProgress = true,
  maxItems,
  filter = 'all',
  className = ''
}) => {
  const [achievements, setAchievements] = useState<AchievementProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const { setLoading: setGlobalLoading } = useLoading();

  useEffect(() => {
    loadAchievements();
  }, []);

  const loadAchievements = async () => {
    try {
      setLoading(true);
      const [userAchievementsRes, progressRes] = await Promise.all([
        api.achievements.getUserAchievements(),
        api.achievements.getAchievementProgress()
      ]);

      if (userAchievementsRes.success && progressRes.success) {
        // Merge user achievements with progress data
        const userAchievementsMap = new Map(
          userAchievementsRes.data.map((ua: UserAchievement) => [ua.achievementId, ua])
        );

        const mergedAchievements = progressRes.data.map((progress: AchievementProgress) => ({
          ...progress,
          isUnlocked: userAchievementsMap.has(progress.achievementId),
          unlockedAt: userAchievementsMap.get(progress.achievementId)?.unlockedAt
        }));

        setAchievements(mergedAchievements);
      }
    } catch (error) {
      console.error('Failed to load achievements:', error);
      showToast('Failed to load achievements', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredAchievements = achievements.filter(achievement => {
    switch (filter) {
      case 'unlocked':
        return achievement.isUnlocked;
      case 'locked':
        return !achievement.isUnlocked;
      default:
        return true;
    }
  });

  const displayAchievements = maxItems
    ? filteredAchievements.slice(0, maxItems)
    : filteredAchievements;

  if (loading) {
    return (
      <div className={`grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4 ${className}`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="w-16 h-16 bg-gray-200 rounded-full animate-pulse" />
        ))}
      </div>
    );
  }

  if (displayAchievements.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-gray-500">
          {filter === 'unlocked' ? 'No achievements unlocked yet!' :
           filter === 'locked' ? 'All achievements unlocked!' :
           'No achievements available.'}
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4 ${className}`}>
      {displayAchievements.map((achievement) => (
        <AchievementBadge
          key={achievement.achievementId}
          achievement={{
            id: achievement.achievementId,
            name: achievement.name,
            description: achievement.description,
            category: achievement.category,
            icon: achievement.icon,
            points: achievement.points,
            criteria: achievement.criteria,
            rarity: achievement.rarity
          }}
          userAchievement={achievement.isUnlocked ? {
            id: achievement.unlockedAt || '',
            achievementId: achievement.achievementId,
            userId: '',
            unlockedAt: achievement.unlockedAt || '',
            progress: achievement.progress,
            achievement: {
              id: achievement.achievementId,
              name: achievement.name,
              description: achievement.description,
              category: achievement.category,
              icon: achievement.icon,
              points: achievement.points,
              criteria: achievement.criteria,
              rarity: achievement.rarity
            }
          } : undefined}
          showProgress={showProgress && !achievement.isUnlocked}
        />
      ))}
    </div>
  );
};

export default AchievementGrid;
