import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vault, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ProfileSetup } from './ProfileSetup';
import type { UserProfile } from '../../types';

export const AuthForm: React.FC<{}> = (): JSX.Element => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');

  const { user, signUp, signIn, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleProfileComplete = async (profileData: UserProfile) => {
    try {
      // Check email availability before final registration
      const checkResponse = await fetch('http://localhost:5001/api/auth/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const checkResult = await checkResponse.json();
      if (checkResult.exists) {
        setError('This email is already registered. Please use a different email.');
        setShowProfileSetup(false);
        return;
      }


  // Use firstName and lastName directly from profileData
  const firstName = profileData.firstName;
  const lastName = profileData.lastName;

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
  navigate('/dashboard');
      }
    } catch (err: any) {
      const errorMessage = err.message === 'User with this email already exists'
        ? 'This email is already registered. Please use a different email or sign in.'
        : err.message || 'Registration failed';
      setError(errorMessage);
      setShowProfileSetup(false);
    }
  };
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
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
        // Check if email exists before proceeding with registration
        try {
          const checkEmailResponse = await fetch('http://localhost:5001/api/auth/check-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
          });

          const checkResult = await checkEmailResponse.json();
          if (!checkResult.exists) {
            // Email doesn't exist, proceed with registration
            setNewUserEmail(email);
            setShowProfileSetup(true);
          } else {
            setError('This email is already registered. Please use a different email or sign in.');
            return;
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
          navigate('/dashboard');
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
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-neutral-50 to-neutral-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle background pattern/orbs - Modern minimalist */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary-500/5 dark:bg-primary-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary-600/5 dark:bg-primary-600/10 rounded-full blur-3xl"></div>
      </div>

      {/* Main auth card with modern minimalist design */}
      <div className="relative w-full max-w-[480px] animate-scale-in">
        <div className="card-elevated overflow-hidden border border-neutral-200/60 dark:border-slate-700/60">
          {/* Simplified minimal header */}
          <div className="px-8 py-10 text-center border-b border-neutral-100 dark:border-slate-700/50">
            <div className="inline-flex items-center justify-center w-14 h-14 mb-5 rounded-2xl bg-neutral-900 dark:bg-white">
              <Vault className="h-7 w-7 text-white dark:text-neutral-900" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white mb-1.5">
              Wealth Vault
            </h1>
            <p className="text-sm text-neutral-500 dark:text-slate-400 font-medium">
              Smart financial wellness, simplified
            </p>
          </div>

          {/* Form content area */}
          <div className="px-8 py-8">
            {/* Dynamic heading with smooth transition */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white mb-2">
                {isSignUp ? 'Get Started' : 'Welcome Back'}
              </h2>
              <p className="text-sm text-neutral-500 dark:text-slate-400">
                {isSignUp 
                  ? 'Create your account to track spending patterns and reach your financial goals' 
                  : 'Sign in to continue your financial wellness journey'}
              </p>
            </div>

            {/* Modern error alert */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 animate-slide-down">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center mt-0.5">
                    <span className="text-red-600 dark:text-red-400 text-xs font-bold">!</span>
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-300 flex-1 leading-relaxed">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* Modern form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2.5">
                  Email
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400 dark:text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-modern pl-12"
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-neutral-700 dark:text-slate-300 mb-2.5">
                  Password
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400 dark:text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-modern pl-12 pr-12"
                    placeholder={isSignUp ? 'Create a strong password' : 'Enter your password'}
                    required
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-neutral-400 dark:text-slate-500 hover:text-neutral-600 dark:hover:text-slate-300 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {isSignUp && password && (
                  <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">
                    {password.length < 6 ? 'Password must be at least 6 characters' : '✓ Password strength: Good'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-6 h-12 text-[15px] font-semibold"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Processing...
                  </span>
                ) : (
                  isSignUp ? 'Create Account' : 'Sign In'
                )}
              </button>
            </form>

            {/* Toggle auth mode with modern styling */}
            <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-slate-700/50 text-center">
              <p className="text-sm text-neutral-600 dark:text-slate-400 mb-2">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
              </p>
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError('');
                  setEmail('');
                  setPassword('');
                }}
                className="text-sm font-semibold text-neutral-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                {isSignUp ? 'Sign in instead' : 'Create free account'}
              </button>
            </div>
          </div>
        </div>

        {/* Trust indicator - Modern minimalist */}
        <div className="mt-8 text-center">
          <p className="text-xs text-neutral-400 dark:text-slate-500 flex items-center justify-center gap-2">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Secure & encrypted • Your data is protected
          </p>
        </div>
      </div>
    </div>
  );
};