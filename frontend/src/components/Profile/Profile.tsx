import React, { useState, useEffect, useCallback } from 'react';
import { 
  User as UserIcon, 
  Phone, 
  Calendar, 
  IndianRupee, 
  Target, 
  Edit3, 
  Save, 
  X,
  Mail,
  Shield,
  TrendingUp,
  Wallet,
  AlertCircle,
  CheckCircle,
  Clock,
  Award
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { authAPI } from '../../services/api';
import { useLoading } from '../../context/LoadingContext';
import type { User } from '../../types';

// Mock dev profile with complete data
const DEV_PROFILE: User = {
  _id: 'dev-user-001',
  email: 'dev@test.com',
  firstName: 'Fintech',
  lastName: 'Dev',
  profilePicture: undefined,
  dateOfBirth: '1995-06-15',
  phoneNumber: '+91 98765 43210',
  currency: 'INR',
  monthlyIncome: 150000,
  monthlyBudget: 100000,
  emergencyFund: 500000,
  isActive: true,
  lastLogin: new Date().toISOString(),
  preferences: {
    notifications: {
      email: true,
      push: true,
      sms: false
    },
    theme: 'dark',
    language: 'en'
  },
  createdAt: '2024-01-15T00:00:00.000Z',
  updatedAt: new Date().toISOString(),
  fullName: 'Fintech Dev',
  netWorth: 1250000
};

export const Profile: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<User>>({});
  const [loading, setLoading] = useState(true);
  const { withLoading } = useLoading();
  const [saving, setSaving] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user, loadProfile]);

  const loadProfile = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Check if in dev mode
      const token = localStorage.getItem('authToken');
      const isDevToken = token === 'dev-mock-token-123';
      setIsDevMode(isDevToken);

      if (isDevToken) {
        // Use dev profile
        setProfile(DEV_PROFILE);
        setEditedProfile(DEV_PROFILE);
        setLoading(false);
        return;
      }

      // Load real profile from backend
      const response = await withLoading(authAPI.getProfile(), 'Loading profile...');
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
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    // In dev mode, just update local state
    if (isDevMode) {
      setProfile(editedProfile as User);
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      const response = await withLoading(authAPI.updateProfile(editedProfile), 'Saving profile...');

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: profile?.currency || 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || 'U';
  };

  const getMembershipDuration = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const months = (now.getFullYear() - created.getFullYear()) * 12 + now.getMonth() - created.getMonth();
    
    if (months < 1) return 'New member';
    if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
    const years = Math.floor(months / 12);
    return `${years} year${years > 1 ? 's' : ''}`;
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-cyan-400 font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 p-4 flex items-center justify-center">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl p-10 text-center max-w-md w-full border border-cyan-500/20">
          <div className="bg-cyan-500/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-cyan-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Profile not found</h3>
          <p className="text-slate-400">Unable to load your profile information.</p>
        </div>
      </div>
    );
  }

  const savingsRate = profile.monthlyIncome > 0 ? ((profile.monthlyIncome - profile.monthlyBudget) / profile.monthlyIncome) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Dev Mode Badge */}
        {isDevMode && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-yellow-400" />
              <div>
                <p className="text-yellow-400 font-semibold">Development Mode Active</p>
                <p className="text-yellow-400/70 text-sm">You're viewing a mock developer profile</p>
              </div>
            </div>
          </div>
        )}

        {/* Header Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-cyan-500/20 overflow-hidden">
          {/* Background Pattern */}
          <div className="h-32 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzA2YjZkNCIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] opacity-30"></div>
          </div>
          
          <div className="px-6 sm:px-8 pb-8 -mt-16 relative">
            {/* Profile Avatar */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 mb-6">
              <div className="relative">
                <div className="w-32 h-32 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-2xl flex items-center justify-center shadow-xl border-4 border-slate-800">
                  <span className="text-4xl font-bold text-white">
                    {getInitials(profile.firstName, profile.lastName)}
                  </span>
                </div>
                <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-2 border-4 border-slate-800 shadow-lg">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
              </div>
              
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
                  {profile.firstName} {profile.lastName}
                </h1>
                <div className="flex items-center justify-center sm:justify-start gap-2 text-cyan-400 mb-3">
                  <Mail className="h-4 w-4" />
                  <span className="font-medium">{profile.email}</span>
                </div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm text-slate-400">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>Member for {getMembershipDuration(profile.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Award className="h-4 w-4" />
                    <span className="text-cyan-400 font-medium">Active User</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-600 hover:to-blue-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-5 h-5" />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-700 text-white font-semibold hover:bg-slate-600 transition-all"
                    >
                      <X className="w-5 h-5" />
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-600 hover:to-blue-600 transition-all shadow-lg"
                  >
                    <Edit3 className="w-5 h-5" />
                    Edit Profile
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Financial Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6 border border-cyan-500/20 hover:border-cyan-500/40 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="bg-green-500/10 p-3 rounded-lg">
                <IndianRupee className="h-6 w-6 text-green-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Income</span>
            </div>
            <p className="text-2xl font-bold text-white mb-1">{formatCurrency(profile.monthlyIncome)}</p>
            <p className="text-sm text-slate-400">Monthly</p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6 border border-cyan-500/20 hover:border-cyan-500/40 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="bg-blue-500/10 p-3 rounded-lg">
                <Target className="h-6 w-6 text-blue-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Budget</span>
            </div>
            <p className="text-2xl font-bold text-white mb-1">{formatCurrency(profile.monthlyBudget)}</p>
            <p className="text-sm text-slate-400">Monthly</p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6 border border-cyan-500/20 hover:border-cyan-500/40 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="bg-purple-500/10 p-3 rounded-lg">
                <Wallet className="h-6 w-6 text-purple-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Emergency Fund</span>
            </div>
            <p className="text-2xl font-bold text-white mb-1">{formatCurrency(profile.emergencyFund)}</p>
            <p className="text-sm text-slate-400">Saved</p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6 border border-cyan-500/20 hover:border-cyan-500/40 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="bg-cyan-500/10 p-3 rounded-lg">
                <TrendingUp className="h-6 w-6 text-cyan-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Savings Rate</span>
            </div>
            <p className="text-2xl font-bold text-white mb-1">{savingsRate.toFixed(1)}%</p>
            <p className="text-sm text-slate-400">Of income</p>
          </div>
        </div>

        {/* Personal Information */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-cyan-500/20 overflow-hidden">
          <div className="px-6 sm:px-8 py-6 border-b border-slate-700/50">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <UserIcon className="h-6 w-6 text-cyan-400" />
              Personal Information
            </h2>
          </div>
          
          <div className="px-6 sm:px-8 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {profileFields.map((field) => {
              const Icon = field.icon;
              const value = isEditing
                ? (editedProfile[field.key] as string | number | undefined) ?? ''
                : (profile[field.key] as string | number | undefined) ?? '';

              return (
                <div key={field.key} className="group">
                  <label className="flex items-center gap-2 text-sm font-semibold text-cyan-400 mb-2 uppercase tracking-wider">
                    <Icon className="w-4 h-4" />
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
                      className="w-full px-4 py-3 rounded-xl border border-cyan-500/30 bg-slate-900/50 text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
                    />
                  ) : (
                    <div className="px-4 py-3 bg-slate-900/30 rounded-xl border border-slate-700/50 text-white font-medium group-hover:border-cyan-500/30 transition-all">
                      {(field.key === 'monthlyIncome' || field.key === 'monthlyBudget') && value !== ''
                        ? formatCurrency(Number(value))
                        : field.key === 'dateOfBirth' && value
                        ? `${String(value).split('T')[0]} (${calculateAge(String(value))} years old)`
                        : String(value) || <span className="text-slate-500">Not specified</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Account Details */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-cyan-500/20 overflow-hidden">
          <div className="px-6 sm:px-8 py-6 border-b border-slate-700/50">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Shield className="h-6 w-6 text-cyan-400" />
              Account Information
            </h2>
          </div>
          
          <div className="px-6 sm:px-8 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="group">
              <label className="flex items-center gap-2 text-sm font-semibold text-cyan-400 mb-2 uppercase tracking-wider">
                <IndianRupee className="w-4 h-4" />
                Currency
              </label>
              <div className="px-4 py-3 bg-slate-900/30 rounded-xl border border-slate-700/50 text-white font-bold text-lg group-hover:border-cyan-500/30 transition-all">
                {profile.currency || 'INR'}
              </div>
            </div>

            <div className="group">
              <label className="flex items-center gap-2 text-sm font-semibold text-cyan-400 mb-2 uppercase tracking-wider">
                <Calendar className="w-4 h-4" />
                Member Since
              </label>
              <div className="px-4 py-3 bg-slate-900/30 rounded-xl border border-slate-700/50 text-white font-medium group-hover:border-cyan-500/30 transition-all">
                {new Date(profile.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>

            <div className="group">
              <label className="flex items-center gap-2 text-sm font-semibold text-cyan-400 mb-2 uppercase tracking-wider">
                <Clock className="w-4 h-4" />
                Last Active
              </label>
              <div className="px-4 py-3 bg-slate-900/30 rounded-xl border border-slate-700/50 text-white font-medium group-hover:border-cyan-500/30 transition-all">
                {new Date(profile.lastLogin).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
