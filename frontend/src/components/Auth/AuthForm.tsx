import React, { useState } from 'react';
import { Vault, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ProfileSetup } from './ProfileSetup';
import type { UserProfile } from '../../types';

export const AuthForm: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  
  const { signUp, signIn, loading } = useAuth();

  const handleProfileComplete = async (profileData: UserProfile) => {
    try {
      // Double-check email availability before final registration
      const checkResponse = await fetch('http://localhost:5001/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (checkResponse.status !== 401) {
        setError('This email is already registered. Please use a different email.');
        setShowProfileSetup(false);
        return;
      }

      // Extract first and last name from full name
      const nameParts = profileData.full_name.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || firstName;

      // Register the user with the complete profile data
      const result = await signUp(email, password, firstName, lastName);
      
      if (!result.success) {
        const errorMessage = result.error === 'User with this email already exists' 
          ? 'This email is already registered. Please use a different email or sign in.'
          : result.error || 'Registration failed';
        setError(errorMessage);
        setShowProfileSetup(false);
      } else {
        // Redirect to dashboard after successful registration
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      const errorMessage = err.message === 'User with this email already exists'
        ? 'This email is already registered. Please use a different email or sign in.'
        : err.message || 'Registration failed';
      setError(errorMessage);
      setShowProfileSetup(false);
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      if (isSignUp) {
        // Try to sign in first to check if the email exists
        try {
          const response = await fetch('http://localhost:5001/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          });
          
          if (response.status === 401) {
            // Email doesn't exist, proceed with registration
            setNewUserEmail(email);
            setShowProfileSetup(true);
          } else {
            setError('An account with this email already exists. Please sign in or use a different email.');
          }
        } catch (err) {
          // If server error or network error, assume email is available
          setNewUserEmail(email);
          setShowProfileSetup(true);
        }
      } else {
        // For sign in, proceed with authentication
        const result = await signIn(email, password);
        if (!result.success) {
          setError(result.error || 'Login failed');
        } else {
          // Redirect to dashboard after successful login
          window.location.href = '/dashboard';
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    }
  };

  if (showProfileSetup) {
    return <ProfileSetup onComplete={handleProfileComplete} userEmail={newUserEmail} />;
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-blue-900 to-cyan-600 px-8 py-6 text-center">
          <div className="bg-white/20 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Vault className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Wealth-Vault</h1>
          <p className="text-cyan-100 text-sm mt-1">Financial Wellbeing Platform</p>
        </div>

        <div className="p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              {isSignUp ? 'Start your financial wellness journey' : 'Sign in to your account'}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-900 to-cyan-600 text-white py-3 px-4 rounded-lg font-medium hover:from-blue-800 hover:to-cyan-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};