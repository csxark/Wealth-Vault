import React, { useState, useEffect } from 'react';
import {
  Shield,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Target,
  DollarSign,
  BarChart3,
  PieChart,
  RefreshCw,
  User,
  Clock,
  Activity
} from 'lucide-react';
import { investmentAdvisorAPI, RiskProfileWithAnalysis, RiskAssessmentQuestion } from '../../services/investmentAdvisorApi';

interface RiskProfileAnalyzerProps {
  onComplete?: (profile: RiskProfileWithAnalysis) => void;
}

const RiskProfileAnalyzer: React.FC<RiskProfileAnalyzerProps> = ({ onComplete }) => {
  const [questions, setQuestions] = useState<RiskAssessmentQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingProfile, setExistingProfile] = useState<RiskProfileWithAnalysis | null>(null);
  const [previewResult, setPreviewResult] = useState<{
    score: number;
    riskTolerance: string;
  } | null>(null);

  useEffect(() => {
    loadQuestions();
    loadExistingProfile();
  }, []);

  const loadQuestions = async () => {
    try {
      const response = await investmentAdvisorAPI.getRiskAssessmentQuestions();
      setQuestions(response.data);
    } catch (error) {
      console.error('Error loading questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadExistingProfile = async () => {
    try {
      const response = await investmentAdvisorAPI.getRiskProfile();
      if (response.data.hasProfile) {
        setExistingProfile(response.data);
      }
    } catch (error) {
      console.error('Error loading existing profile:', error);
    }
  };

  const handleAnswer = (questionId: string, value: unknown) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handlePreview = async () => {
    try {
      const response = await investmentAdvisorAPI.calculateRiskScore(answers);
      setPreviewResult({
        score: response.data.score,
        riskTolerance: response.data.riskTolerance
      });
    } catch (error) {
      console.error('Error calculating preview:', error);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await investmentAdvisorAPI.updateRiskProfile(answers);
      const profile = response.data;
      setExistingProfile(profile);
      if (onComplete) {
        onComplete(profile);
      }
    } catch (error) {
      console.error('Error saving risk profile:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatRiskScore = (score: number) => {
    if (score >= 70) return { label: 'Aggressive', color: 'text-red-600', bg: 'bg-red-100' };
    if (score >= 40) return { label: 'Moderate', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { label: 'Conservative', color: 'text-green-600', bg: 'bg-green-100' };
  };

  const getRiskIcon = (tolerance: string) => {
    switch (tolerance) {
      case 'aggressive': return <TrendingUp className="h-8 w-8 text-red-600" />;
      case 'moderate': return <Activity className="h-8 w-8 text-yellow-600" />;
      default: return <Shield className="h-8 w-8 text-green-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading risk assessment...</span>
      </div>
    );
  }

  // Show existing profile if available
  if (existingProfile?.hasProfile && !answers.age) {
    const riskInfo = formatRiskScore(existingProfile.analysis?.score || 0);
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Your Risk Profile</h2>
          <button
            onClick={() => setExistingProfile(null)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            Retake Assessment
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Risk Score Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Risk Score</h3>
              {getRiskIcon(existingProfile.analysis?.tolerance || 'moderate')}
            </div>
            <div className="text-5xl font-bold text-gray-900 mb-2">
              {existingProfile.analysis?.score || 0}
              <span className="text-lg text-gray-500 font-normal">/100</span>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${riskInfo.bg} ${riskInfo.color}`}>
              {riskInfo.label}
            </span>
          </div>

          {/* Recommended Allocation Card */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Recommended Allocation</h3>
              <PieChart className="h-6 w-6 text-green-600" />
            </div>
            <div className="space-y-3">
              {existingProfile.analysis?.recommendation?.allocation && Object.entries(
                existingProfile.analysis.recommendation.allocation
              ).map(([asset, percentage]) => (
                <div key={asset} className="flex items-center justify-between">
                  <span className="text-gray-700 capitalize">{asset}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">
                      {percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Risk Factors */}
        {existingProfile.analysis?.factors && existingProfile.analysis.factors.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Factors</h3>
            <div className="space-y-2">
              {existingProfile.analysis.factors.map((factor, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-gray-700">{factor.reason}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-500">
                    +{factor.contribution} points
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {existingProfile.analysis?.recommendation && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">Profile Description</h4>
            <p className="text-blue-800">
              {existingProfile.analysis.recommendation.description}
            </p>
            <p className="text-blue-700 mt-2 text-sm">
              <strong>Suitable for:</strong> {existingProfile.analysis.recommendation.suitableFor}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Assessment form
  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Risk Assessment</h2>
        <p className="text-gray-600">
          Answer these questions to help us understand your investment risk tolerance.
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      {currentQuestion && (
        <div className="mb-6">
          <label className="block text-lg font-medium text-gray-900 mb-4">
            {currentQuestion.question}
          </label>

          {currentQuestion.type === 'select' && currentQuestion.options && (
            <div className="space-y-2">
              {currentQuestion.options.map((option) => (
                <button
                  key={String(option.value)}
                  onClick={() => handleAnswer(currentQuestion.id, option.value)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    answers[currentQuestion.id] === option.value
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {currentQuestion.type === 'number' && (
            <input
              type="number"
              value={String(answers[currentQuestion.id] || '')}
              onChange={(e) => handleAnswer(currentQuestion.id, parseFloat(e.target.value) || 0)}
              placeholder={currentQuestion.placeholder}
              className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-600 focus:outline-none"
            />
          )}

          {currentQuestion.type === 'boolean' && (
            <div className="flex space-x-4">
              <button
                onClick={() => handleAnswer(currentQuestion.id, true)}
                className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                  answers[currentQuestion.id] === true
                    ? 'border-green-600 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-600" />
                <span className="block text-center font-medium">{currentQuestion.yesLabel}</span>
              </button>
              <button
                onClick={() => handleAnswer(currentQuestion.id, false)}
                className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                  answers[currentQuestion.id] === false
                    ? 'border-red-600 bg-red-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-red-600" />
                <span className="block text-center font-medium">{currentQuestion.noLabel}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
          disabled={currentQuestionIndex === 0}
          className="px-6 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-400"
        >
          Previous
        </button>

        <div className="space-x-2">
          {currentQuestionIndex < questions.length - 1 ? (
            <button
              onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
              disabled={!answers[questions[currentQuestionIndex]?.id]}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
            >
              Next
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={handlePreview}
                disabled={Object.keys(answers).length < 5}
                className="px-6 py-2 border-2 border-blue-600 text-blue-600 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-50"
              >
                Preview
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || Object.keys(answers).length < 5}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 flex items-center"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Complete Assessment'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Preview Result */}
      {previewResult && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-2">Preview Result</h4>
          <div className="flex items-center space-x-4">
            <div className="text-3xl font-bold text-gray-900">
              {previewResult.score}/100
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              previewResult.riskTolerance === 'aggressive' ? 'bg-red-100 text-red-800' :
              previewResult.riskTolerance === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              {previewResult.riskTolerance.charAt(0).toUpperCase() + previewResult.riskTolerance.slice(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskProfileAnalyzer;
