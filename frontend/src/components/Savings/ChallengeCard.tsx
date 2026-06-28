import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, Users, Calendar, Target, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

interface ChallengeCardProps {
  challenge: {
    id: string;
    title: string;
    description: string;
    targetType: 'save_amount' | 'reduce_expense' | 'increase_income';
    targetAmount: string;
    currency: string;
    startDate: string;
    endDate: string;
    maxParticipants?: number;
    metadata: {
      tags: string[];
      difficulty: 'easy' | 'medium' | 'hard';
      category: string;
    };
    creator: {
      id: string;
      firstName: string;
      lastName: string;
    };
    participantCount: number;
    participation?: {
      id: string;
      currentProgress: string;
      targetProgress: string;
      status: string;
      joinedAt: string;
    };
  };
  onJoin?: (challengeId: string) => void;
  onViewLeaderboard?: (challengeId: string) => void;
  onUpdateProgress?: (challengeId: string) => void;
}

const ChallengeCard: React.FC<ChallengeCardProps> = ({
  challenge,
  onJoin,
  onViewLeaderboard,
  onUpdateProgress
}) => {
  const isParticipating = !!challenge.participation;
  const progress = isParticipating
    ? (parseFloat(challenge.participation.currentProgress) / parseFloat(challenge.participation.targetProgress)) * 100
    : 0;

  const getTargetTypeLabel = (type: string) => {
    switch (type) {
      case 'save_amount': return 'Save Money';
      case 'reduce_expense': return 'Reduce Expenses';
      case 'increase_income': return 'Increase Income';
      default: return type;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'hard': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const daysLeft = Math.ceil((new Date(challenge.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  return (
    <Card className="w-full hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold mb-1">{challenge.title}</CardTitle>
            <p className="text-sm text-gray-600 line-clamp-2">{challenge.description}</p>
          </div>
          <Badge className={getDifficultyColor(challenge.metadata.difficulty)}>
            {challenge.metadata.difficulty}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Challenge Details */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-500" />
            <span className="font-medium">{getTargetTypeLabel(challenge.targetType)}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span>{challenge.currency} {parseFloat(challenge.targetAmount).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-orange-500" />
            <span>{daysLeft} days left</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-500" />
            <span>{challenge.participantCount} joined</span>
          </div>
        </div>

        {/* Progress Bar (if participating) */}
        {isParticipating && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Your Progress</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{challenge.currency} {parseFloat(challenge.participation.currentProgress).toLocaleString()}</span>
              <span>Target: {challenge.currency} {parseFloat(challenge.participation.targetProgress).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Tags */}
        {challenge.metadata.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {challenge.metadata.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {!isParticipating ? (
            <Button
              onClick={() => onJoin?.(challenge.id)}
              className="flex-1"
              disabled={challenge.participantCount >= (challenge.maxParticipants || Infinity)}
            >
              {challenge.participantCount >= (challenge.maxParticipants || Infinity) ? 'Full' : 'Join Challenge'}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onUpdateProgress?.(challenge.id)}
                className="flex-1"
              >
                Update Progress
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewLeaderboard?.(challenge.id)}
              >
                <Trophy className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Creator Info */}
        <div className="text-xs text-gray-500 pt-2 border-t">
          Created by {challenge.creator.firstName} {challenge.creator.lastName}
          {isParticipating && (
            <span className="ml-2">
              • Joined {format(new Date(challenge.participation.joinedAt), 'MMM d')}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ChallengeCard;
