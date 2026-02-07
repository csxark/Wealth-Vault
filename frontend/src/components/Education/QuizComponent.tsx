import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { ArrowLeft, Clock, CheckCircle, XCircle, Trophy } from 'lucide-react';
import { educationAPI } from '../../services/api';

interface QuizComponentProps {
  quizId: string;
  onBack: () => void;
}

interface Quiz {
  id: string;
  contentId: string;
  title: string;
  description: string;
  questions: Array<{
    id: string;
    question: string;
    options: string[];
    correctAnswer: number;
  }>;
  passingScore: number;
  timeLimit?: number;
  maxAttempts: number;
  alreadyPassed?: boolean;
}

interface QuizAttempt {
  id: string;
  score: number;
  passed: boolean;
  timeTaken?: number;
  completedAt?: string;
}

const QuizComponent: React.FC<QuizComponentProps> = ({ quizId, onBack }) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [result, setResult] = useState<QuizAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    loadQuiz();
  }, [quizId]);

  useEffect(() => {
    if (quiz?.timeLimit && !showResults) {
      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = quiz.timeLimit! * 60 - elapsed;
        setTimeLeft(remaining > 0 ? remaining : 0);

        if (remaining <= 0) {
          handleSubmitQuiz();
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [quiz, showResults, startTime]);

  const loadQuiz = async () => {
    try {
      setLoading(true);
      const response = await educationAPI.getQuiz(quizId);
      setQuiz(response.data.quiz);

      if (response.data.quiz.timeLimit) {
        setTimeLeft(response.data.quiz.timeLimit * 60);
      }
    } catch (error) {
      console.error('Error loading quiz:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionIndex: number, answerIndex: number) => {
    setAnswers(prev => ({
      ...prev,
      [questionIndex.toString()]: answerIndex
    }));
  };

  const handleNext = () => {
    if (currentQuestion < (quiz?.questions.length || 0) - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!quiz) return;

    try {
      setSubmitting(true);
      const timeTaken = Math.floor((Date.now() - startTime) / 1000 / 60); // minutes

      const response = await educationAPI.submitQuizAttempt(quiz.id, {
        answers,
        timeTaken
      });

      setResult(response.data.result);
      setShowResults(true);
    } catch (error) {
      console.error('Error submitting quiz:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Quiz not found.</p>
        <Button onClick={onBack} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  if (quiz.alreadyPassed) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Education
          </Button>
        </div>

        <Card>
          <CardContent className="p-8 text-center">
            <Trophy className="w-16 h-16 text-yellow-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Quiz Already Passed!</h2>
            <p className="text-gray-600">
              You have already successfully completed this quiz. Great job!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showResults && result) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Education
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">
              {result.passed ? (
                <div className="flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600 mr-2" />
                  Quiz Passed!
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-600 mr-2" />
                  Quiz Failed
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="mb-6">
              <div className="text-4xl font-bold mb-2">
                {result.score}%
              </div>
              <div className="text-gray-600">
                Passing score: {result.passingScore}%
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Time taken:</span>
                  <br />
                  {result.timeTaken ? `${result.timeTaken} minutes` : 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Status:</span>
                  <br />
                  <Badge className={result.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                    {result.passed ? 'Passed' : 'Failed'}
                  </Badge>
                </div>
              </div>
            </div>

            {!result.passed && result.attemptId && (
              <div className="text-sm text-gray-600 mb-4">
                You can try again. You have {result.maxAttempts - 1} attempts remaining.
              </div>
            )}

            <div className="flex space-x-4 justify-center">
              <Button onClick={onBack}>
                Back to Education
              </Button>
              {!result.passed && (
                <Button
                  onClick={() => {
                    setShowResults(false);
                    setCurrentQuestion(0);
                    setAnswers({});
                    setResult(null);
                  }}
                  variant="outline"
                >
                  Try Again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQ = quiz.questions[currentQuestion];
  const progress = ((currentQuestion + 1) / quiz.questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Education
        </Button>

        {timeLeft !== null && (
          <div className="flex items-center text-sm text-gray-600">
            <Clock className="w-4 h-4 mr-1" />
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Question {currentQuestion + 1} of {quiz.questions.length}</span>
            <span className="text-sm text-gray-600">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Quiz Content */}
      <Card>
        <CardHeader>
          <CardTitle>{quiz.title}</CardTitle>
          <p className="text-gray-600">{quiz.description}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Question */}
            <div>
              <h3 className="text-lg font-medium mb-4">
                {currentQ.question}
              </h3>

              {/* Options */}
              <div className="space-y-3">
                {currentQ.options.map((option, index) => (
                  <label
                    key={index}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                      answers[currentQuestion.toString()] === index
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestion}`}
                      value={index}
                      checked={answers[currentQuestion.toString()] === index}
                      onChange={() => handleAnswerSelect(currentQuestion, index)}
                      className="mr-3"
                    />
                    <span className="text-sm">{option}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t">
              <Button
                onClick={handlePrevious}
                disabled={currentQuestion === 0}
                variant="outline"
              >
                Previous
              </Button>

              <div className="flex space-x-2">
                {currentQuestion === quiz.questions.length - 1 ? (
                  <Button
                    onClick={handleSubmitQuiz}
                    disabled={submitting || Object.keys(answers).length !== quiz.questions.length}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {submitting ? 'Submitting...' : 'Submit Quiz'}
                  </Button>
                ) : (
                  <Button
                    onClick={handleNext}
                    disabled={answers[currentQuestion.toString()] === undefined}
                  >
                    Next
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QuizComponent;
