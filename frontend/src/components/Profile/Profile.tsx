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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <UserIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Profile not found</h3>
            <p className="text-gray-600">Unable to load your profile information.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
          <p className="text-gray-600">Manage your personal information and preferences</p>
        </div>

        <div className="bg-white rounded-lg shadow">
          {/* Profile Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <UserIcon className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {profile.firstName} {profile.lastName}
                  </h2>
                  <p className="text-gray-600">{profile.email}</p>
                </div>
              </div>
              
              <div className="flex space-x-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                  >
                    <Edit3 className="h-4 w-4 mr-2" />
                    Edit Profile
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Profile Fields */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {profileFields.map((field) => {
                const Icon = field.icon;
                const value = isEditing 
                  ? (editedProfile[field.key] as string || '')
                  : (profile[field.key] as string || '');
                
                return (
                  <div key={field.key} className="space-y-2">
                    <label className="flex items-center text-sm font-medium text-gray-700">
                      <Icon className="h-4 w-4 mr-2" />
                      {field.label}
                    </label>
                    
                    {isEditing ? (
                      <input
                        type={field.type}
                        value={value}
                        onChange={(e) => setEditedProfile({
                          ...editedProfile,
                          [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value
                        })}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-gray-50 rounded-lg">
                        {field.key === 'monthlyIncome' || field.key === 'monthlyBudget' 
                          ? `₹${(Number(value) || 0).toLocaleString()}`
                          : field.key === 'dateOfBirth' && value
                            ? `${value} (${calculateAge(value as string)} years old)`
                            : value || 'Not specified'
                        }
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Additional Information */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Currency</label>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg">
                    {profile.currency || 'USD'}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Member Since</label>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg">
                    {new Date(profile.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};