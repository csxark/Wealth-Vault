import React, { useState } from 'react';
import { User, Phone, Calendar, Briefcase, IndianRupee, Target, ArrowRight } from 'lucide-react';
import type { UserProfile } from '../../types';

interface ProfileSetupProps {
  onComplete: (profile: UserProfile) => void;
  userEmail: string;
}

export const ProfileSetup: React.FC<ProfileSetupProps> = ({ onComplete, userEmail }) => {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<UserProfile>({
    full_name: '',
    phone: '',
    date_of_birth: '',
    occupation: '',
    monthly_income: 0,
    financial_goals: ''
  });

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      onComplete(profile);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return profile.full_name.trim() && profile.phone.trim() && profile.date_of_birth;
      case 2:
        return profile.occupation.trim() && profile.monthly_income > 0;
      case 3:
        return profile.financial_goals.trim();
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-900 to-cyan-600 px-8 py-6 text-center">
          <h1 className="text-2xl font-bold text-white">Complete Your Profile</h1>
          <p className="text-cyan-100 text-sm mt-1">Step {step} of 3</p>
          <div className="mt-4 flex space-x-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded-full ${
                  i <= step ? 'bg-white' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-8">
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Personal Information</h2>
                <p className="text-slate-600 dark:text-slate-300 mt-1">Tell us about yourself</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <User className="inline h-4 w-4 mr-1" />
                  Full Name
                </label>
                <input
                  type="text"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="Enter your full name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <Phone className="inline h-4 w-4 mr-1" />
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="+91 98765 43210"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={profile.date_of_birth}
                  onChange={(e) => setProfile({ ...profile, date_of_birth: e.target.value })}
                  className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Professional Details</h2>
                <p className="text-slate-600 dark:text-slate-300 mt-1">Help us understand your financial situation</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <Briefcase className="inline h-4 w-4 mr-1" />
                  Occupation
                </label>
                <input
                  type="text"
                  value={profile.occupation}
                  onChange={(e) => setProfile({ ...profile, occupation: e.target.value })}
                  className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="Software Engineer, Teacher, etc."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <IndianRupee className="inline h-4 w-4 mr-1" />
                  Monthly Income
                </label>
                <input
                  type="number"
                  min="0"
                  value={profile.monthly_income || ''}
                  onChange={(e) => setProfile({ ...profile, monthly_income: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="50000"
                  required
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Financial Goals</h2>
                <p className="text-slate-600 dark:text-slate-300 mt-1">What do you want to achieve?</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <Target className="inline h-4 w-4 mr-1" />
                  Primary Financial Goals
                </label>
                <textarea
                  value={profile.financial_goals}
                  onChange={(e) => setProfile({ ...profile, financial_goals: e.target.value })}
                  className="w-full px-3 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="e.g., Build emergency fund, save for house down payment, reduce impulsive spending..."
                  rows={4}
                  required
                />
              </div>

              <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg p-4">
                <h3 className="font-medium text-cyan-900 dark:text-cyan-100 mb-2">Profile Summary</h3>
                <div className="text-sm text-cyan-800 dark:text-cyan-200 space-y-1">
                  <p><strong>Name:</strong> {profile.full_name}</p>
                  <p><strong>Email:</strong> {userEmail}</p>
                  <p><strong>Occupation:</strong> {profile.occupation}</p>
                  <p><strong>Monthly Income:</strong> ₹{profile.monthly_income?.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-3 pt-6">
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!isStepValid()}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-900 to-cyan-600 text-white rounded-lg hover:from-blue-800 hover:to-cyan-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {step === 3 ? 'Complete Setup' : 'Next'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};