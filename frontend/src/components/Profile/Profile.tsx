import React, { useState, useEffect } from 'react';
import { User as UserIcon, Phone, Calendar, Briefcase, IndianRupee, Target, Edit3, Save, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { authAPI } from '../../services/api';
import type { User } from '../../types';

export const Profile: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<User>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await authAPI.getProfile();
      if (response.success) {
        setProfile(response.data.user);
        setEditedProfile(response.data.user);
      } else {
        console.error('Error loading profile');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const response = await authAPI.updateProfile(editedProfile);

      if (response.success) {
        setProfile(response.data.user);
        setIsEditing(false);
      } else {
        console.error('Error saving profile');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setEditedProfile(profile);
    }
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
      key: 'firstName' as keyof User,
      label: 'First Name',
      icon: UserIcon,
      type: 'text',
      placeholder: 'Enter your first name'
    },
    {
      key: 'lastName' as keyof User,
      label: 'Last Name',
      icon: UserIcon,
      type: 'text',
      placeholder: 'Enter your last name'
    },
    {
      key: 'phoneNumber' as keyof User,
      label: 'Phone Number',
      icon: Phone,
      type: 'tel',
      placeholder: 'Enter your phone number'
    },
    {
      key: 'dateOfBirth' as keyof User,
      label: 'Date of Birth',
      icon: Calendar,
      type: 'date',
      placeholder: 'Select your date of birth'
    },
    {
      key: 'monthlyIncome' as keyof User,
      label: 'Monthly Income',
      icon: IndianRupee,
      type: 'number',
      placeholder: 'Enter your monthly income'
    },
    {
      key: 'monthlyBudget' as keyof User,
      label: 'Monthly Budget',
      icon: Target,
      type: 'number',
      placeholder: 'Enter your monthly budget'
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-cyan-600 dark:border-cyan-400"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-10 text-center max-w-md w-full border border-cyan-200 dark:border-cyan-700">
          <UserIcon className="h-12 w-12 text-cyan-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Profile not found</h3>
          <p className="text-gray-600 dark:text-gray-300">Unable to load your profile information.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 lg:p-12 transition-colors mt-18">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-cyan-200 dark:border-cyan-700">
        {/* Header */}
        <div className="px-6 py-8 sm:px-12 sm:py-10 border-b border-cyan-200 dark:border-cyan-700 flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-cyan-100 dark:bg-cyan-900 rounded-full flex items-center justify-center">
              <UserIcon className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {profile.firstName} {profile.lastName}
              </h2>
              <p className="text-cyan-600 dark:text-cyan-400 font-medium">{profile.email}</p>
            </div>
          </div>

          <div className="flex space-x-3">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center px-5 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-5 h-5 mr-2" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center px-5 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition"
                >
                  <X className="w-5 h-5 mr-2" />
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center px-5 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition"
              >
                <Edit3 className="w-5 h-5 mr-2" />
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Profile Fields */}
        <div className="px-6 py-8 sm:px-12 sm:py-10 grid grid-cols-1 md:grid-cols-2 gap-8 text-gray-800 dark:text-gray-200">
          {profileFields.map((field) => {
            const Icon = field.icon;
            const value = isEditing
              ? (editedProfile[field.key] as string | number | undefined) ?? ''
              : (profile[field.key] as string | number | undefined) ?? '';

            return (
              <div key={field.key} className="flex flex-col space-y-2">
                <label className="flex items-center text-sm font-medium text-cyan-700 dark:text-cyan-400">
                  <Icon className="w-5 h-5 mr-2" />
                  {field.label}
                </label>
                {isEditing ? (
                  <input
                    type={field.type}
                    value={value}
                    onChange={(e) =>
                      setEditedProfile({
                        ...editedProfile,
                        [field.key]:
                          field.type === 'number'
                            ? e.target.value === ''
                              ? ''
                              : Number(e.target.value)
                            : e.target.value,
                      })
                    }
                    placeholder={field.placeholder}
                    className="px-4 py-2 rounded-lg border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900 text-cyan-900 dark:text-cyan-200 focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition"
                  />
                ) : (
                  <div className="px-4 py-2 bg-cyan-50 dark:bg-cyan-900 rounded-lg border border-cyan-200 dark:border-cyan-700 font-medium break-words">
                    {(field.key === 'monthlyIncome' || field.key === 'monthlyBudget') && value !== ''
                      ? `₹${Number(value).toLocaleString()}`
                      : field.key === 'dateOfBirth' && value
                      ? `${String(value)} (${calculateAge(String(value))} years old)`
                      : String(value) || 'Not specified'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Additional Account Info */}
        <div className="border-t border-cyan-200 dark:border-cyan-700 px-6 py-8 sm:px-12 sm:py-10">
          <h3 className="text-lg font-semibold text-cyan-700 dark:text-cyan-400 mb-6">Account Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-gray-800 dark:text-gray-200">
            <div className="flex flex-col space-y-1">
              <label className="text-sm font-medium text-cyan-600 dark:text-cyan-400">Currency</label>
              <div className="px-4 py-2 bg-cyan-50 dark:bg-cyan-900 rounded-lg border border-cyan-200 dark:border-cyan-700 font-semibold">
                {profile.currency || 'USD'}
              </div>
            </div>
            <div className="flex flex-col space-y-1">
              <label className="text-sm font-medium text-cyan-600 dark:text-cyan-400">Member Since</label>
              <div className="px-4 py-2 bg-cyan-50 dark:bg-cyan-900 rounded-lg border border-cyan-200 dark:border-cyan-700 font-semibold">
                {new Date(profile.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
