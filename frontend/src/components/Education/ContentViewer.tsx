import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { ArrowLeft, CheckCircle, Clock, BookOpen } from 'lucide-react';
import { educationAPI } from '../../services/api';

interface ContentViewerProps {
  contentId: string;
  onBack: () => void;
}

interface EducationContent {
  id: string;
  title: string;
  description: string;
  content: string;
  type: string;
  category: string;
  difficulty: string;
  estimatedReadTime: number;
}

interface UserProgress {
  status: string;
  progress: number;
  timeSpent: number;
  completedAt: string;
}

const ContentViewer: React.FC<ContentViewerProps> = ({ contentId, onBack }) => {
  const [content, setContent] = useState<EducationContent | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeSpent, setTimeSpent] = useState(0);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    loadContent();
    // Start timer
    const timer = setInterval(() => {
      setTimeSpent(Math.floor((Date.now() - startTime) / 1000 / 60)); // minutes
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, [contentId]);

  const loadContent = async () => {
    try {
      setLoading(true);
      const response = await educationAPI.getContent(contentId);
      setContent(response.data.content);

      // Load progress
      const progressResponse = await educationAPI.getProgress();
      const userProgress = progressResponse.data.progress.find(
        (p: any) => p.contentId === contentId
      );
      setProgress(userProgress || null);

    } catch (error) {
      console.error('Error loading content:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProgressUpdate = async (newProgress: number, completed = false) => {
    try {
      const updateData: any = {
        progress: newProgress,
        timeSpent: timeSpent
      };

      if (completed) {
        updateData.completed = true;
        updateData.status = 'completed';
        updateData.completedAt = new Date().toISOString();
      }

      await educationAPI.updateProgress(contentId, updateData);

      // Update local state
      setProgress(prev => ({
        ...prev,
        status: completed ? 'completed' : 'in_progress',
        progress: newProgress,
        timeSpent: timeSpent,
        completedAt: completed ? new Date().toISOString() : prev?.completedAt
      }));

    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  const handleComplete = () => {
    handleProgressUpdate(100, true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Content not found.</p>
        <Button onClick={onBack} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Education
        </Button>

        <div className="flex items-center space-x-2">
          <Badge variant="outline">{content.category}</Badge>
          <Badge variant="outline">{content.difficulty}</Badge>
          <div className="flex items-center text-sm text-gray-600">
            <Clock className="w-4 h-4 mr-1" />
            {content.estimatedReadTime} min read
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {progress && (
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Reading Progress</span>
            <span className="text-sm text-gray-600">{progress.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            ></div>
          </div>

          <div className="flex items-center justify-between mt-2 text-sm text-gray-600">
            <span>Time spent: {timeSpent} min</span>
            {progress.status === 'completed' && (
              <div className="flex items-center text-green-600">
                <CheckCircle className="w-4 h-4 mr-1" />
                Completed
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{content.title}</CardTitle>
          <p className="text-gray-600">{content.description}</p>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none">
            {/* Render content based on type */}
            {content.type === 'article' && (
              <div
                className="whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: content.content }}
              />
            )}

            {content.type === 'video' && (
              <div className="aspect-video">
                <iframe
                  src={content.content}
                  className="w-full h-full rounded-lg"
                  allowFullScreen
                />
              </div>
            )}

            {content.type === 'infographic' && (
              <div className="text-center">
                <img
                  src={content.content}
                  alt={content.title}
                  className="max-w-full h-auto rounded-lg"
                />
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t">
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => handleProgressUpdate(Math.min((progress?.progress || 0) + 25, 100))}
                variant="outline"
              >
                Mark 25% Complete
              </Button>
              <Button
                onClick={() => handleProgressUpdate(Math.min((progress?.progress || 0) + 50, 100))}
                variant="outline"
              >
                Mark 50% Complete
              </Button>
            </div>

            {(!progress || progress.status !== 'completed') && (
              <Button onClick={handleComplete} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 mr-2" />
                Mark as Completed
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContentViewer;
