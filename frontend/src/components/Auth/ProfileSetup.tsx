import React, { useState } from 'react';
import { User, Phone, Calendar, Briefcase, IndianRupee, Target, ArrowRight } from 'lucide-react';
import type { UserProfile } from '../../types';

interface ProfileSetupProps {
  onComplete: (profile: UserProfile) => void;
  userEmail: string;
}

const COUNTRY_CODES = [
  { code: '+91', country: 'India', digits: 10 },
  { code: '+1', country: 'USA', digits: 10 },
  { code: '+44', country: 'UK', digits: 10 },
  { code: '+61', country: 'Australia', digits: 9 },
  { code: '+971', country: 'UAE', digits: 9 },
  { code: '+81', country: 'Japan', digits: 10 },
  { code: '+49', country: 'Germany', digits: 11 },
];


export const ProfileSetup: React.FC<ProfileSetupProps> = ({ onComplete, userEmail }) => {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<UserProfile>({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    dateOfBirth: '',
    occupation: '',
    monthlyIncome: 0,
    financialGoals: ''
  });
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0]);

  const nameRegex = /^[A-Za-z\s]+$/;
  const phoneRegex = /^[0-9]+$/;

  const isAdult = (dob: string) => {
    if (!dob) return false;
    const birthDate = new Date(dob);
    const today = new Date();
    const age =
      today.getFullYear() -
      birthDate.getFullYear() -
      (today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate()) ? 1 : 0);
    return age >= 18;
  };

const isOccupationValid = (occupation: string) =>
  occupation.trim().split(/\s+/).length >= 2;

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

  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        return (
          (profile.firstName ?? '').trim().length > 0 &&
          (profile.lastName ?? '').trim().length > 0 &&
          phoneRegex.test(profile.phoneNumber ?? '') &&
          (profile.phoneNumber?.length ?? 0) === countryCode.digits &&
          isAdult(profile.dateOfBirth ?? '')
        );

      case 2:
        return (
          isOccupationValid(profile.occupation ?? '') &&
          (profile.monthlyIncome ?? 0) > 0
        );

      case 3:
        return (profile.financialGoals ?? '').trim().length > 0;

      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-neutral-50 to-neutral-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary-500/5 dark:bg-primary-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary-600/5 dark:bg-primary-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative card-elevated w-full max-w-lg border border-neutral-200/60 dark:border-slate-700/60 animate-scale-in">
        <div className="px-8 py-8 text-center border-b border-neutral-100 dark:border-slate-700/50">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white mb-2">Complete Your Profile</h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400 font-medium mb-6">Step {step} of 3</p>
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                  i <= step ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-8">
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white mb-2">Personal Information</h2>
                <p className="text-sm text-neutral-500 dark:text-slate-400">Tell us about yourself</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2.5">
                  <User className="inline h-4 w-4 mr-1.5" />
                  First Name
                </label>
                <input
                  type="text"
                  value={profile.firstName}
                  onChange={(e) => {
                    if (nameRegex.test(e.target.value) || e.target.value === '') {
                      setProfile({ ...profile, firstName: e.target.value });
                    }
                  }}
                  className="input-modern"
                  placeholder="Enter your first name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2.5">
                  <User className="inline h-4 w-4 mr-1.5" />
                  Last Name
                </label>
                <input
                  type="text"
                  value={profile.lastName}
                  onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                  className="input-modern"
                  placeholder="Enter your last name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2.5">
                  <Phone className="inline h-4 w-4 mr-1.5" />
                  Phone Number
                </label>

                <div className="flex gap-2">
                  {/* Country Code */}
                  <select
                    value={countryCode.code}
                    onChange={(e) =>
                      setCountryCode(
                        COUNTRY_CODES.find(c => c.code === e.target.value)!
                      )
                    }
                    className="input-modern w-28"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.country} ({c.code})
                      </option>
                    ))}
                  </select>

                  {/* Phone Number */}
                  <input
                    type="tel"
                    value={profile.phoneNumber}
                    onChange={(e) => {
                      if (phoneRegex.test(e.target.value) || e.target.value === '') {
                        setProfile({ ...profile, phoneNumber: e.target.value });
                      }
                    }}
                    className="input-modern flex-1"
                    placeholder={`Enter ${countryCode.digits} digit number`}
                    maxLength={countryCode.digits}
                    required
                  />
                </div>

                <p className="text-xs text-neutral-500 mt-1">
                  Must be exactly {countryCode.digits} digits
                </p>
              </div>

              <div>
                <input type="date" value={profile.dateOfBirth} onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })} className="input-modern" required />
                {profile.dateOfBirth && !isAdult(profile.dateOfBirth) && (
                  <p className="text-xs text-red-500 mt-1">
                    You must be at least 18 years old
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white mb-2">Professional Details</h2>
                <p className="text-sm text-neutral-500 dark:text-slate-400">Help us understand your financial situation</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2.5">
                  <Briefcase className="inline h-4 w-4 mr-1.5" />
                  Occupation
                </label>
                <input
                  type="text"
                  value={profile.occupation}
                  onChange={(e) => setProfile({ ...profile, occupation: e.target.value })}
                  className="input-modern"
                  placeholder="Must contain at least 2 words (Software Engineer, Teacher, etc...)."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2.5">
                  <IndianRupee className="inline h-4 w-4 mr-1.5" />
                  Monthly Income
                </label>
                <input
                  type="number"
                  min="0"
                  value={profile.monthlyIncome || ''}
                  onChange={(e) => setProfile({ ...profile, monthlyIncome: parseFloat(e.target.value) || 0 })}
                  className="input-modern"
                  placeholder="50000"
                  required
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white mb-2">Financial Goals</h2>
                <p className="text-sm text-neutral-500 dark:text-slate-400">What do you want to achieve?</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2.5">
                  <Target className="inline h-4 w-4 mr-1.5" />
                  Primary Financial Goals
                </label>
                <textarea
                  value={profile.financialGoals}
                  onChange={(e) => setProfile({ ...profile, financialGoals: e.target.value })}
                  className="input-modern min-h-[120px] resize-none"
                  placeholder="e.g., Build emergency fund, save for house down payment, reduce impulsive spending..."
                  rows={4}
                  required
                />
              </div>

              <div className="bg-neutral-100 dark:bg-slate-700/50 border border-neutral-200 dark:border-slate-600 rounded-xl p-5">
                <h3 className="font-semibold text-neutral-900 dark:text-white mb-3 text-sm tracking-tight">Profile Summary</h3>
                <div className="text-sm text-neutral-600 dark:text-slate-300 space-y-2">
                  <p className="flex justify-between"><span className="text-neutral-500 dark:text-slate-400">Name:</span> <strong>{profile.firstName} {profile.lastName}</strong></p>
                  <p className="flex justify-between"><span className="text-neutral-500 dark:text-slate-400">Email:</span> <strong className="truncate ml-2">{userEmail}</strong></p>
                  <p className="flex justify-between"><span className="text-neutral-500 dark:text-slate-400">Occupation:</span> <strong>{profile.occupation}</strong></p>
                  <p className="flex justify-between"><span className="text-neutral-500 dark:text-slate-400">Monthly Income:</span> <strong>₹{profile.monthlyIncome?.toLocaleString()}</strong></p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-6 border-t border-neutral-100 dark:border-slate-700/50 mt-8">
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="btn-secondary flex-1 h-12"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!isStepValid()}
              className="btn-primary flex-1 h-12 flex items-center justify-center gap-2"
            >
              {step === 3 ? 'Complete Setup' : 'Next'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};