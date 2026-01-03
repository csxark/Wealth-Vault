import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vault, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ProfileSetup } from './ProfileSetup';
import type { UserProfile } from '../../types';

export const AuthForm: React.FC = (): JSX.Element => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');

  const { user, signUp, signIn } = useAuth();
  const navigate = useNavigate();

  // Redirect only AFTER successful login/signup
  useEffect(() => {
    if (user && !showProfileSetup) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, showProfileSetup, navigate]);

  // ---------------- PROFILE COMPLETION ----------------
  const handleProfileComplete = async (profileData: UserProfile) => {
    setLoading(true);
    setError('');

    try {
      const result = await signUp(
        newUserEmail,
        password,
        profileData.firstName,
        profileData.lastName
      );

      if (!result.success) {
        setError(result.error || 'Registration failed');
        setShowProfileSetup(false);
        return;
      }

      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      setShowProfileSetup(false);
    } finally {
      setLoading(false);
    }
  };

  // ---------------- FORM SUBMIT ----------------
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

    setLoading(true);

    try {
      if (isSignUp) {
        // Check email availability
        const res = await fetch('http://localhost:5001/api/auth/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = await res.json();

        if (data.exists) {
          setError('This email is already registered. Please sign in.');
          setLoading(false);
          return;
        }

        // New user → show profile setup
        setNewUserEmail(email);
        setShowProfileSetup(true);
      } else {
        // Login flow
        const result = await signIn(email, password);

        if (!result.success) {
          setError(result.error || 'Login failed');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ---------------- PROFILE SETUP SCREEN ----------------
  if (showProfileSetup) {
    return (
      <ProfileSetup
        onComplete={handleProfileComplete}
        userEmail={newUserEmail}
      />
    );
  }

  // ---------------- AUTH UI ----------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-blue-900 to-cyan-600 px-8 py-6 text-center">
          <div className="bg-white/20 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Vault className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">CareerHub</h1>
          <p className="text-cyan-100 text-sm mt-1">
            Your Career Growth Platform
          </p>
        </div>

        <div className="p-8">
          <h2 className="text-2xl font-semibold text-center mb-4">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>

          {error && (
            <div className="bg-red-100 text-red-700 px-4 py-2 rounded mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-gray-400" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 py-3 border rounded-lg"
                required
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 border rounded-lg"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400"
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-900 to-cyan-600 text-white py-3 rounded-lg"
            >
              {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="text-center mt-6">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-cyan-600 font-medium"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
