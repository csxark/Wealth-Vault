import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import {
  BookOpen,
  Play,
  Image,
  Clock,
  CheckCircle,
  TrendingUp,
  Target,
  Award,
  Filter
} from 'lucide-react';
import ContentViewer from './ContentViewer';
import QuizComponent from './QuizComponent';
import { educationAPI } from '../../services/api';

interface EducationContent {
  id: string;
  title: string;
  description: string;
  type: string;
  category: string;
  difficulty: string;
  estimatedReadTime: number;
  relevanceScore: number;
  progress?: {
    status: string;
    progress: number;
    completedAt?: string;
  };
}

interface EducationStats {
  totalContent: number;
  completedContent: number;
  completionRate: number;
  totalQuizzes: number;
  passedQuizzes: number;
  quizPassRate: number;
  averageQuizScore: number;
}

const Education: React.FC = () => {
  const [recommendations, setRecommendations] = useState<EducationContent[]>([]);
  const [stats, setStats] = useState<EducationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    category: '',
    difficulty: ''
  });

  useEffect(() => {
    loadEducationData();
  }, [filters]);

  const loadEducationData = async () => {
    try {
      setLoading(true);
      const [recommendationsResponse, statsResponse] = await Promise.all([
        educationAPI.getRecommendations({
          category: filters.category || undefined,
          difficulty: filters.difficulty || undefined,
          limit: 20
        }),
        educationAPI.getStats()
      ]);

      setRecommendations(recommendationsResponse.data.content);
      setStats(statsResponse.data.stats);
    } catch (error) {
      console.error('Error loading education data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContentClick = (contentId: string) => {
    setSelectedContentId(contentId);
  };

  const handleQuizClick = (quizId: string) => {
    setSelectedQuizId(quizId);
  };

  const handleBack = () => {
    setSelectedContentId(null);
    setSelectedQuizId(null);
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Play className="w-5 h-5" />;
      case 'infographic':
        return <Image className="w-5 h-5" />;
      default:
        return <BookOpen className="w-5 h-5" />;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-100 text-green-800';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800';
      case 'advanced':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      budgeting: 'bg-blue-100 text-blue-800',
      saving: 'bg-green-100 text-green-800',
      investing: 'bg-purple-100 text-purple-800',
      debt: 'bg-red-100 text-red-800',
      credit: 'bg-orange-100 text-orange-800',
      general: 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors.general;
  };

  if (selectedContentId) {
    return <ContentViewer contentId={selectedContentId} onBack={handleBack} />;
  }

  if (selectedQuizId) {
    return <QuizComponent quizId={selectedQuizId} onBack={handleBack} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Financial Education</h1>
          <p className="text-gray-600 mt-1">Learn and improve your financial literacy</p>
        </div>
        <div className="flex items-center space-x-4">
          <Button onClick={loadEducationData} variant="outline">
            <TrendingUp className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <BookOpen className="w-8 h-8 text-blue-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Content Completed</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.completedContent}/{stats.totalContent}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Target className="w-8 h-8 text-green-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.completionRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <CheckCircle className="w-8 h-8 text-purple-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Quizzes Passed</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.passedQuizzes}/{stats.totalQuizzes}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Award className="w-8 h-8 text-yellow-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Avg Quiz Score</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.averageQuizScore.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Categories</option>
                <option value="budgeting">Budgeting</option>
                <option value="saving">Saving</option>
                <option value="investing">Investing</option>
                <option value="debt">Debt Management</option>
                <option value="credit">Credit</option>
                <option value="general">General</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
              <select
                value={filters.difficulty}
                onChange={(e) => setFilters(prev => ({ ...prev, difficulty: e.target.value }))}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Levels</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommended Content */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Recommended for You</h2>

        {recommendations.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No content found</h3>
              <p className="text-gray-600">Try adjusting your filters or check back later for new content.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recommendations.map((content) => (
              <Card key={content.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      {getContentIcon(content.type)}
                      <CardTitle className="text-lg">{content.title}</CardTitle>
                    </div>
                    {content.progress?.status === 'completed' && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                  </div>

                  <div className="flex items-center space-x-2 mt-2">
                    <Badge className={getCategoryColor(content.category)}>
                      {content.category}
                    </Badge>
                    <Badge className={getDifficultyColor(content.difficulty)}>
                      {content.difficulty}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                    {content.description}
                  </p>

                  <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      {content.estimatedReadTime} min
                    </div>
                    <div className="text-xs">
                      Relevance: {content.relevanceScore}%
                    </div>
                  </div>

                  {content.progress && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span>{content.progress.progress}%</span>
                      </div>
                      <Progress value={content.progress.progress} className="h-2" />
                    </div>
                  )}

                  <div className="flex space-x-2">
                    <Button
                      onClick={() => handleContentClick(content.id)}
                      className="flex-1"
                    >
                      {content.progress?.status === 'completed' ? 'Review' : 'Read'}
                    </Button>

                    {/* Placeholder for quiz button - would need to check if quiz exists */}
                    <Button
                      onClick={() => handleQuizClick(content.id)}
                      variant="outline"
                      size="sm"
                    >
                      Quiz
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Education;
