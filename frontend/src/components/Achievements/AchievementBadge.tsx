import React from 'react';
import { Trophy, Star, Award, Target, TrendingUp, Calendar, DollarSign, PiggyBank } from 'lucide-react';

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

interface AchievementBadgeProps {
  achievement: Achievement;
  userAchievement?: UserAchievement;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
  className?: string;
}

const getIcon = (iconName: string, size: number = 20) => {
  const iconProps = { size, className: 'text-current' };

  switch (iconName) {
    case 'trophy':
      return <Trophy {...iconProps} />;
    case 'star':
      return <Star {...iconProps} />;
    case 'award':
      return <Award {...iconProps} />;
    case 'target':
      return <Target {...iconProps} />;
    case 'trending-up':
      return <TrendingUp {...iconProps} />;
    case 'calendar':
      return <Calendar {...iconProps} />;
    case 'dollar-sign':
      return <DollarSign {...iconProps} />;
    case 'piggy-bank':
      return <PiggyBank {...iconProps} />;
    default:
      return <Award {...iconProps} />;
  }
};

const getRarityColor = (rarity: string) => {
  switch (rarity) {
    case 'legendary':
      return 'from-yellow-400 to-orange-500';
    case 'epic':
      return 'from-purple-500 to-pink-500';
    case 'rare':
      return 'from-blue-500 to-cyan-500';
    case 'uncommon':
      return 'from-green-500 to-emerald-500';
    default:
      return 'from-gray-400 to-gray-500';
  }
};

const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  achievement,
  userAchievement,
  size = 'md',
  showProgress = false,
  className = ''
}) => {
  const isUnlocked = !!userAchievement;
  const progress = userAchievement?.progress || 0;
  const maxProgress = achievement.criteria?.target || 1;
  const progressPercentage = Math.min((progress / maxProgress) * 100, 100);

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20'
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24
  };

  return (
    <div className={`relative group ${className}`}>
      <div
        className={`
          ${sizeClasses[size]} rounded-full flex items-center justify-center
          ${isUnlocked
            ? `bg-gradient-to-br ${getRarityColor(achievement.rarity)} shadow-lg`
            : 'bg-gray-200 border-2 border-gray-300'
          }
          transition-all duration-200 hover:scale-105 cursor-pointer
        `}
        title={`${achievement.name}: ${achievement.description}`}
      >
        <div className={isUnlocked ? 'text-white' : 'text-gray-500'}>
          {getIcon(achievement.icon, iconSizes[size])}
        </div>
      </div>

      {/* Progress indicator for locked achievements */}
      {showProgress && !isUnlocked && (
        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
          <div className="w-8 h-1 bg-gray-300 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
        <div className="font-semibold">{achievement.name}</div>
        <div className="text-gray-300 text-xs">{achievement.description}</div>
        <div className="text-yellow-400 text-xs mt-1">{achievement.points} points</div>
        {showProgress && !isUnlocked && (
          <div className="text-blue-400 text-xs mt-1">
            Progress: {progress}/{maxProgress}
          </div>
        )}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  );
};

export default AchievementBadge;
