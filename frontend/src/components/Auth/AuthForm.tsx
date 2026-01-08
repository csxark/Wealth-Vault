import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vault, User, Mail, Lock, Eye, EyeOff, Shield, TrendingUp, CheckCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ProfileSetup } from './ProfileSetup';
import type { UserProfile } from '../../types';

// It's recommended to move this to a global CSS file
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    body {
        font-family: 'Inter', sans-serif;
    }
    .glass-panel {
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1);
    }
    .floating-shape {
        animation: float 6s ease-in-out infinite;
    }
    @keyframes float {
        0% { transform: translateY(0px) rotate(var(--tw-rotate)); }
        50% { transform: translateY(-20px) rotate(var(--tw-rotate)); }
        100% { transform: translateY(0px) rotate(var(--tw-rotate)); }
    }
    @keyframes animate-blob {
      0%, 100% { transform: translate(0px, 0px) scale(1); }
      33% { transform: translate(30px, -50px) scale(1.1); }
      66% { transform: translate(-20px, 20px) scale(0.9); }
    }
    .animate-blob {
      animation: animate-blob 7s infinite;
    }
    .animation-delay-2000 { animation-delay: 2s; }
  `}</style>
);

export const AuthForm: React.FC<{ mode?: 'login' | 'register' }> = ({ mode = 'login' }): JSX.Element => {
  const [isSignUp, setIsSignUp] = useState(mode === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [username, setUsername] = useState('');


  const { user, signUp, signIn, loading } = useAuth();
  const navigate = useNavigate();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{9,}$/;
  const usernameRegex = /^[A-Za-z\s]{5,}$/;


  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleProfileComplete = async (profileData: UserProfile) => {
    try {
      const { firstName, lastName } = profileData;
      const result = await signUp(email, password, firstName, lastName);
      
      if (!result.success) {
        setError(result.error || 'Registration failed.');
        setShowProfileSetup(false);
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
      setShowProfileSetup(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');

    if (!email || !password || (isSignUp && !username)) {
      setError('Please fill in all fields.');
      return;
    }

    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (isSignUp) {
      if (!usernameRegex.test(username)) {
        setError(
          'Username must be at least 5 characters and should not contain numbers.'
        );
        return;
      }
    }

    if (!passwordRegex.test(password)) {
      setError(
        'Password must be at least 9 characters and include uppercase, lowercase, number, and special character.'
      );
      return;
    }

    if (isSignUp) {
      setNewUserEmail(email);
      setShowProfileSetup(true);
    } else {
      const result = await signIn(email, password);
      if (!result.success) {
        setError(result.error || 'Login failed.');
      } else {
        navigate('/dashboard');
      }
    }
  };

  if (showProfileSetup) {
    return <ProfileSetup onComplete={handleProfileComplete} userEmail={newUserEmail} />;
  }

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setEmail('');
    setPassword('');
  };

  return (
    <>
      <GlobalStyles />
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center font-body selection:bg-primary selection:text-white transition-colors duration-300">
        <div className="fixed inset-0 z-0 bg-finance-gradient opacity-10 dark:opacity-100 pointer-events-none"></div>
        <div className="fixed top-0 left-0 w-full h-full z-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary rounded-full mix-blend-multiply filter blur-[128px] opacity-20 dark:opacity-10 animate-blob"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 dark:opacity-10 animate-blob animation-delay-2000"></div>
        </div>

        <div className="relative z-10 w-full max-w-[1200px] p-4 md:p-8 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20">
            {/* Left side: Auth Form */}
            <div className="w-full max-w-md">
                <div className="glass-panel bg-white/80 dark:bg-slate-800/60 border border-white/50 dark:border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-3">
                            <Vault className="text-3xl" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                          Wealth Vault
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {isSignUp ? 'Create an account to secure your financial future' : 'Sign in to access your vault'}
                        </p>
                    </div>

                    {error && (
                      <div className="mb-4 p-3 text-center rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
                          <p className="text-sm font-medium">{error}</p>
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {isSignUp && (
                            <div className="space-y-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="name">Full Name</label>
                                <div className="relative">
                                <input value={username} onChange={(e) => setUsername(e.target.value)} className="block w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400" id="name" placeholder="John Doe" type="text" required />
                                    <User className="absolute right-3 top-3 text-gray-400 dark:text-gray-500 text-xl pointer-events-none" />
                                </div>
                            </div>
                        )}
                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="email">Email Address</label>
                            <div className="relative">
                                <input value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400" id="email" placeholder="name@example.com" type="email" required/>
                                <Mail className="absolute right-3 top-3 text-gray-400 dark:text-gray-500 text-xl pointer-events-none" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="password">Password</label>
                            <div className="relative">
                                <input value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400" id="password" placeholder={isSignUp ? "Create a strong password" : "Enter your password"} type={showPassword ? "text" : "password"} required/>
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400 dark:text-gray-500">
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>
                        
                        {isSignUp && (
                          <div className="flex items-start">
                              <div className="flex items-center h-5">
                                  <input className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded dark:bg-slate-900 dark:border-slate-600" id="terms" name="terms" type="checkbox" required/>
                              </div>
                              <div className="ml-3 text-sm">
                                  <label className="font-medium text-gray-700 dark:text-gray-300" htmlFor="terms">I agree to the <a className="text-primary hover:underline" href="#">Terms</a> and <a className="text-primary hover:underline" href="#">Privacy Policy</a></label>
                              </div>
                          </div>
                        )}

                        <div className="pt-2">
                            <button disabled={loading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed" type="submit">
                                {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
                            </button>
                        </div>
                        
                        {isSignUp && (
                          <>
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-200 dark:border-slate-600"></div>
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-2 bg-white/80 dark:bg-slate-800/60 text-gray-500 dark:text-gray-400 backdrop-blur-sm">Or register with</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button className="w-full inline-flex justify-center items-center py-2.5 px-4 border border-gray-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900/50 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200" type="button">
                                    <img alt="Google logo" className="h-5 w-5 mr-2" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAUzI0_NNgqyCAiuVeQBMAX9CybpU2NKpvUEbAMmoUImKeHAYEInrBVd6oQInEBoZL3Mg-NrE53Nexhv6SHXAAktoHJDUKXFhi3H9x8VWenb43GpgadKdvl4q15ymRgpFUbKl8GkU2IXsIbfsWqzlXfgbcbpKsHkjHXm7heKsXQkjpxdKA8ivOYfuV7QNmRAAF3BEFA4qrWtnp1sHBFUUiRoxmL65cawnXKGfmqFmW42tfg5DSLPf_FOotxn1Vbcrdvh0OEibI6qFY"/>
                                    Google
                                </button>
                                <button className="w-full inline-flex justify-center items-center py-2.5 px-4 border border-gray-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900/50 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200" type="button">
                                    <img alt="Apple logo" className="h-5 w-5 mr-2" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA9Wk1IlCtwCTE8VYATQETpe9lP5OYvO8WN_MiQXK5ENx85Ih6cxvfjh81rkQ2n8rBQapfTqsxZuWQsZ32TjvFjauP1X37vjQ2PLObwAgCLgYajP6tbAqC4YNfG1kw1Ti5p46Whh0FBXe9Hg6NFySPOGzIeFr5ZfSZYZ3YMfq5La7GTqK8uwDFzknby5I8AjZIx1QQp0gERFuilYPs5nWQsoRyaewC1DAfkd_r4u3LWmeWtJGOQNRreUV99KxjR9DbdLsDU1VxgPaQ"/>
                                    Apple
                                </button>
                            </div>
                          </>
                        )}
                        
                        <div className="text-center mt-4">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {isSignUp ? "Already have an account?" : "Don't have an account?"}
                                <button type="button" onClick={toggleMode} className="font-medium text-primary hover:text-primary-dark transition-colors ml-1">
                                  {isSignUp ? "Sign In" : "Sign Up"}
                                </button>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
            
            {/* Right side: Decorative Panel */}
            <div className="hidden lg:flex flex-col items-start max-w-lg text-left">
                <div className="mb-6 inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wide">
                    Trusted by 50,000+ Users
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight mb-6">
                    Intelligent platform for <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-500">smarter wealth management</span>
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
                    Experience institutional-grade security with Wealth Vault. Track, analyze, and grow your portfolio with real-time insights and encrypted data protection.
                </p>
                <div className="grid grid-cols-2 gap-6 w-full mb-10">
                    <div className="flex items-start">
                        <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                            <Shield size={20} />
                        </div>
                        <div className="ml-4">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Bank-Grade Security</h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">256-bit encryption for all your data.</p>
                        </div>
                    </div>
                    <div className="flex items-start">
                        <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-primary/20 text-primary">
                            <TrendingUp size={20} />
                        </div>
                        <div className="ml-4">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Real-Time Analytics</h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Live market data and insights.</p>
                        </div>
                    </div>
                </div>
                {/* Floating Devices */}
                <div className="relative w-full h-64 mt-auto">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative w-48 h-full bg-slate-900 border-4 border-slate-700 rounded-3xl shadow-2xl transform -rotate-6 translate-y-4 floating-shape" style={{'--tw-rotate': '-6deg', animationDelay: '0s'} as React.CSSProperties}>
                            <div className="absolute top-0 left-0 right-0 h-6 bg-slate-800 rounded-t-2xl flex justify-center items-center">
                                <div className="w-16 h-1 bg-slate-600 rounded-full"></div>
                            </div>
                            <div className="p-4 pt-8 space-y-3">
                                <div className="h-20 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl border border-primary/20 p-3">
                                    <div className="w-8 h-8 rounded-full bg-primary/20 mb-2"></div>
                                    <div className="w-20 h-2 bg-primary/30 rounded-full"></div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-2 w-full bg-slate-700 rounded-full"></div>
                                    <div className="h-2 w-3/4 bg-slate-700 rounded-full"></div>
                                    <div className="h-2 w-1/2 bg-slate-700 rounded-full"></div>
                                </div>
                            </div>
                            <div className="absolute -right-6 top-10 w-12 h-12 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center animate-bounce">
                                <CheckCircle className="text-primary text-2xl" />
                            </div>
                        </div>
                        <div className="relative w-48 h-full bg-white dark:bg-slate-800 border-4 border-gray-200 dark:border-slate-600 rounded-3xl shadow-xl transform rotate-12 translate-x-10 translate-y-[-20px] z-[-1] floating-shape opacity-80" style={{'--tw-rotate': '12deg', animationDelay: '1s'} as React.CSSProperties}>
                            <div className="absolute top-0 left-0 right-0 h-6 bg-gray-100 dark:bg-slate-700 rounded-t-2xl"></div>
                            <div className="p-4 pt-8 space-y-3">
                                <div className="h-24 bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3 flex flex-col justify-end">
                                    <div className="flex items-end space-x-2 h-12">
                                        <div className="w-4 bg-blue-400 h-[40%] rounded-t-sm"></div>
                                        <div className="w-4 bg-primary h-[80%] rounded-t-sm"></div>
                                        <div className="w-4 bg-blue-300 h-[60%] rounded-t-sm"></div>
                                        <div className="w-4 bg-primary h-[90%] rounded-t-sm"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </>
  );
};
