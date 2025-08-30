import React, { useState, useEffect } from 'react';
import { User, Phone, Calendar, Briefcase, IndianRupee, Target, Edit3, Save, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { UserProfile } from '../../types';

export const Profile: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile>({
    full_name: '',
    phone: '',
    date_of_birth: '',
    occupation: '',
    monthly_income: 0,
    financial_goals: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<UserProfile>(profile);

  useEffect(() => {
    // Load profile from localStorage
    const savedProfile = localStorage.getItem(`profile-${user?.id}`);
    if (savedProfile) {
      const profileData = JSON.parse(savedProfile);
      setProfile(profileData);
      setEditedProfile(profileData);
    }
  }, [user]);

  const handleSave = () => {
    localStorage.setItem(`profile-${user?.id}`, JSON.stringify(editedProfile));
    setProfile(editedProfile);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedProfile(profile);
    setIsEditing(false);
  };

  const calculateAge = (birthDate: string) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const profileFields = [
    {
      key: 'full_name' as keyof UserProfile,
      label: 'Full Name',
      icon: User,
      type: 'text',
      placeholder: 'Enter your full name'
    },
    {
      key: 'phone' as keyof UserProfile,
      label: 'Phone Number',
      icon: Phone,
      type: 'tel',
      placeholder: '+91 98765 43210'
    },
    {
      key: 'date_of_birth' as keyof UserProfile,
      label: 'Date of Birth',
      icon: Calendar,
      type: 'date',
      placeholder: ''
    },
    {
      key: 'occupation' as keyof UserProfile,
      label: 'Occupation',
      icon: Briefcase,
      type: 'text',
      placeholder: 'Software Engineer, Teacher, etc.'
    },
    {
      key: 'monthly_income' as keyof UserProfile,
      label: 'Monthly Income',
      icon: IndianRupee,
      type: 'number',
      placeholder: '50000'
    }
  ];

  return (
    <div className="space-y-10 p-6 pt-16">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profile</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Manage your personal information and preferences</p>
        </div>
        
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-900 to-cyan-600 text-white rounded-lg hover:from-blue-800 hover:to-cyan-500 transition-all duration-200"
          >
            <Edit3 className="h-4 w-4 mr-2" />
            Edit Profile
          </button>
        ) : (
          <div className="mt-4 sm:mt-0 flex space-x-2">
            <button
              onClick={handleCancel}
              className="inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-900 to-cyan-600 text-white rounded-lg hover:from-blue-800 hover:to-cyan-500 transition-all duration-200"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Personal Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {profileFields.map((field) => {
                const Icon = field.icon;
                const value = isEditing ? editedProfile[field.key] : profile[field.key];
                
                return (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      <Icon className="inline h-4 w-4 mr-1" />
                      {field.label}
                    </label>
                    {isEditing ? (
                      <input
                        type={field.type}
                        value={value || ''}
                        onChange={(e) => setEditedProfile({
                          ...editedProfile,
                          [field.key]: field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                        })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white">
                        {field.key === 'monthly_income' && value 
                          ? `₹${(value as number).toLocaleString()}`
                          : value || 'Not provided'
                        }
                        {field.key === 'date_of_birth' && value && (
                          <span className="text-slate-500 dark:text-slate-400 ml-2">
                            (Age: {calculateAge(value as string)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Target className="inline h-4 w-4 mr-1" />
                Financial Goals
              </label>
              {isEditing ? (
                <textarea
                  value={editedProfile.financial_goals}
                  onChange={(e) => setEditedProfile({ ...editedProfile, financial_goals: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="Describe your financial goals..."
                  rows={3}
                />
              ) : (
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white">
                  {profile.financial_goals || 'No goals specified'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Account Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                <div className="text-slate-900 dark:text-white">{user?.email}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Member Since</label>
                <div className="text-slate-900 dark:text-white">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 border border-cyan-200 dark:border-cyan-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-cyan-900 dark:text-cyan-100 mb-2">Financial Health Score</h3>
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-2">85/100</div>
              <div className="text-sm text-cyan-800 dark:text-cyan-200">Excellent financial habits!</div>
            </div>
            <div className="mt-4 space-y-2 text-xs text-cyan-700 dark:text-cyan-300">
              <div className="flex justify-between">
                <span>Safe Spending</span>
                <span className="font-medium">92%</span>
              </div>
              <div className="flex justify-between">
                <span>Goal Progress</span>
                <span className="font-medium">78%</span>
              </div>
              <div className="flex justify-between">
                <span>Budget Adherence</span>
                <span className="font-medium">85%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};