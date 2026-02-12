import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Medal, Award, Target } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  currentProgress: string;
  targetProgress: string;
  status: string;
  progressPercentage: number;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
  };
}

interface ChallengeLeaderboardProps {
  isOpen: boolean;
  onClose: () => void;
  challengeTitle: string;
  leaderboard: LeaderboardEntry[];
  currency: string;
}

const ChallengeLeaderboard: React.FC<ChallengeLeaderboardProps> = ({
  isOpen,
  onClose,
  challengeTitle,
  leaderboard,
  currency
}) => {
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-lg font-bold text-gray-500">#{rank}</span>;
    }
  };

  const getRankBadgeColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 2:
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 3:
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'active':
        return <Badge className="bg-blue-100 text-blue-800">Active</Badge>;
      case 'withdrawn':
        return <Badge className="bg-red-100 text-red-800">Withdrawn</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {challengeTitle} - Leaderboard
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {leaderboard.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No participants yet</p>
            </div>
          ) : (
            leaderboard.map((entry) => (
              <Card key={entry.userId} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <div className="flex items-center justify-center w-10">
                        {getRankIcon(entry.rank)}
                      </div>

                      {/* User Info */}
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            src={entry.user.profilePicture}
                            alt={`${entry.user.firstName} ${entry.user.lastName}`}
                          />
                          <AvatarFallback>
                            {entry.user.firstName[0]}{entry.user.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {entry.user.firstName} {entry.user.lastName}
                          </p>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(entry.status)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Progress Info */}
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {currency} {parseFloat(entry.currentProgress).toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        of {currency} {parseFloat(entry.targetProgress).toLocaleString()}
                      </div>
                      <div className="text-xs font-medium text-blue-600">
                        {entry.progressPercentage.toFixed(1)}% complete
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          entry.rank === 1 ? 'bg-yellow-500' :
                          entry.rank === 2 ? 'bg-gray-400' :
                          entry.rank === 3 ? 'bg-amber-500' :
                          'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(entry.progressPercentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {leaderboard.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium mb-2">How Rankings Work</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Rankings are based on progress percentage towards your personal target</li>
              <li>• Ties are broken by who reached their progress first</li>
              <li>• Only active participants are shown on the leaderboard</li>
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ChallengeLeaderboard;
