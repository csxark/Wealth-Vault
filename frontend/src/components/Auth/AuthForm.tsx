"use client";



import * as React from "react";

import { useState, useEffect } from "react";

import { useNavigate } from "react-router-dom";

import {

  Vault, User, Mail, Eye, EyeOff, Shield, TrendingUp, CheckCircle,

} from "lucide-react";

import { useAuth } from "../../hooks/useAuth";

import { ProfileSetup } from "./ProfileSetup";

import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

import type { UserProfile } from "../../types";



/**

 * Local Button component to resolve 'Cannot find name Button' error

 */

interface ButtonProps {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

const Button = ({ children, className, disabled, ...props }: ButtonProps) => (

  <button

    disabled={disabled}

    className={`flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}

    {...props}

  >

    {children}

  </button>

);



const GlobalStyles = () => (

  <style>{`

    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    body {

        font-family: 'Inter', sans-serif;

        margin: 0;

        overflow: hidden;

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

        0% { transform: translateY(0px) rotate(var(--tw-rotate, 0deg)); }

        50% { transform: translateY(-20px) rotate(var(--tw-rotate, 0deg)); }

        100% { transform: translateY(0px) rotate(var(--tw-rotate, 0deg)); }

    }

    .animate-blob {

      animation: animate-blob 7s infinite;

    }

    @keyframes animate-blob {

      0%, 100% { transform: translate(0px, 0px) scale(1); }

      33% { transform: translate(30px, -50px) scale(1.1); }

      66% { transform: translate(-20px, 20px) scale(0.9); }

    }

    .custom-scroll::-webkit-scrollbar { width: 8px; }

    .custom-scroll::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.5); border-radius: 10px; }

  `}</style>

);



export const AuthForm: React.FC<{ mode?: "login" | "register" }> = ({ mode = "login" }) => {

  const [isSignUp, setIsSignUp] = useState(mode === "register");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [username, setUsername] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [showProfileSetup, setShowProfileSetup] = useState(false);



  const { user, signUp, signIn, loading } = useAuth();

  const navigate = useNavigate();



  useEffect(() => {

    if (user) navigate("/dashboard", { replace: true });

  }, [user, navigate]);



  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    setError('');

    if (isSignUp) {

      setShowProfileSetup(true);

    } else {

      const result = await signIn(email, password);

      if (!result.success) setError("Invalid credentials");

    }

  };



  if (showProfileSetup) {

    return <ProfileSetup onComplete={(d: UserProfile) => signUp(email, password, d.firstName, d.lastName)} userEmail={email} />;

  }



  const toggleToSignUp = () => setIsSignUp(true);

  const toggleToLogin = () => setIsSignUp(false);



  return (

    <>

      <GlobalStyles />

      <div className="bg-background-light dark:bg-background-dark h-screen overflow-y-auto custom-scroll font-body transition-colors duration-300 relative">

        

        {/* Background Gradients */}

        <div className="fixed inset-0 z-0 bg-finance-gradient opacity-10 dark:opacity-100 pointer-events-none"></div>

        <div className="fixed top-0 left-0 w-full h-full z-0 overflow-hidden pointer-events-none">

          <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary rounded-full blur-[128px] opacity-20 animate-blob"></div>

          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-500 rounded-full blur-[128px] opacity-20 animate-blob" style={{ animationDelay: '2s' }}></div>

        </div>



        <div className="relative z-10 w-full min-h-full flex items-center justify-center p-4 md:p-8 py-20">

          <div className="w-full max-w-[1200px] flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20">

            

            {/* --- SLIDING FORM CARD --- */}

            <div className="w-full max-w-md overflow-hidden glass-panel bg-white/80 dark:bg-slate-800/60 border border-white/50 dark:border-white/10 rounded-3xl p-8 shadow-2xl relative">

              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>

              

              {/* TOP SLIDING TOGGLE (Like second image) */}

              <div className="relative w-full flex bg-gray-100 dark:bg-slate-900/50 rounded-2xl p-1 mb-8">

                <div 

                  className={`absolute top-1 bottom-1 w-1/2 bg-white dark:bg-slate-700 shadow-sm rounded-xl transition-transform duration-500 ease-in-out ${isSignUp ? 'translate-x-[96%]' : 'translate-x-0'}`}

                />

                <button 

                  onClick={toggleToLogin}

                  className={`relative z-10 w-1/2 py-2 text-sm font-bold transition-colors duration-300 ${!isSignUp ? 'text-primary' : 'text-gray-500'}`}

                >

                  Login

                </button>

                <button 

                  onClick={toggleToSignUp}

                  className={`relative z-10 w-1/2 py-2 text-sm font-bold transition-colors duration-300 ${isSignUp ? 'text-primary' : 'text-gray-500'}`}

                >

                  Signup

                </button>

              </div>



              <div className="text-center mb-6">

                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-3">

                  <Vault className="text-3xl" />

                </div>

                <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Wealth Vault</h2>

              </div>



              {/* SLIDING VIEWPORT CONTAINER */}

              <div className="relative w-full overflow-hidden">

                <div 

                  className="flex transition-transform duration-500 ease-in-out" 

                  style={{ transform: `translateX(${isSignUp ? '-100%' : '0%'})` }}

                >

                  {/* --- LOGIN FORM --- */}

                  <div className="w-full shrink-0 pr-4">

                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">Sign in to access your vault</p>

                    <form onSubmit={handleSubmit} className="space-y-5">

                      <div className="space-y-1">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>

                        <div className="relative">

                          <input value={email} onChange={e => setEmail(e.target.value)} className="block w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 focus:ring-2 focus:ring-primary text-gray-900 dark:text-white outline-none" type="email" placeholder="name@example.com" required={!isSignUp} />

                          <Mail className="absolute right-3 top-3 text-gray-400" size={18} />

                        </div>

                      </div>

                      <div className="space-y-1">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>

                        <div className="relative">

                          <input value={password} onChange={e => setPassword(e.target.value)} className="block w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 focus:ring-2 focus:ring-primary text-gray-900 dark:text-white outline-none" type={showPassword ? "text" : "password"} placeholder="••••••••" required={!isSignUp} />

                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>

                        </div>

                      </div>

                      <Button disabled={loading} type="submit" className="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold shadow-lg transition-transform active:scale-95">Unlock Vault</Button>

                    </form>

                    <div className="text-center mt-6">

                        <p className="text-sm text-gray-600">Don't have an account? <button onClick={toggleToSignUp} className="text-primary font-bold hover:underline">Sign Up</button></p>

                    </div>

                  </div>



                  {/* --- SIGN UP FORM --- */}

                  <div className="w-full shrink-0 pl-4">

                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">Create an account to secure your future</p>

                    <form onSubmit={handleSubmit} className="space-y-5">

                      <div className="space-y-1">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>

                        <div className="relative">

                          <input value={username} onChange={e => setUsername(e.target.value)} className="block w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 focus:ring-2 focus:ring-primary text-gray-900 dark:text-white outline-none" type="text" placeholder="John Doe" required={isSignUp} />

                          <User className="absolute right-3 top-3 text-gray-400" size={18} />

                        </div>

                      </div>

                      <div className="space-y-1">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>

                        <div className="relative">

                          <input value={email} onChange={e => setEmail(e.target.value)} className="block w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 focus:ring-2 focus:ring-primary text-gray-900 dark:text-white outline-none" type="email" placeholder="name@example.com" required={isSignUp} />

                          <Mail className="absolute right-3 top-3 text-gray-400" size={18} />

                        </div>

                      </div>

                      <div className="space-y-1">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>

                        <div className="relative">

                          <input value={password} onChange={e => setPassword(e.target.value)} className="block w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-600 focus:ring-2 focus:ring-primary text-gray-900 dark:text-white outline-none" type={showPassword ? "text" : "password"} placeholder="Create password" required={isSignUp} />

                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>

                        </div>

                        <PasswordStrengthMeter password={password} showRequirements={true} />

                      </div>

                      <Button disabled={loading} type="submit" className="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold shadow-lg transition-transform active:scale-95">Create Account</Button>

                    </form>

                    <div className="text-center mt-6">

                        <p className="text-sm text-gray-600">Already have an account? <button onClick={toggleToLogin} className="text-primary font-bold hover:underline">Sign In</button></p>

                    </div>

                  </div>

                </div>

              </div>

            </div>



            {/* --- RIGHT PANEL (DECORATIVE) --- */}

            <div className="hidden lg:flex flex-col items-start max-w-lg text-left">

              <div className="mb-6 inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wide">

                Trusted by 50,000+ Users

              </div>

              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight mb-6">

                Intelligent platform for <br />

                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-500">

                  smarter wealth management

                </span>

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

                    <p className="mt-1 text-sm text-gray-500">256-bit AES encryption.</p>

                  </div>

                </div>

                <div className="flex items-start">

                  <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-primary/20 text-primary">

                    <TrendingUp size={20} />

                  </div>

                  <div className="ml-4">

                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Real-Time Analytics</h3>

                    <p className="mt-1 text-sm text-gray-500">Live market delta synced.</p>

                  </div>

                </div>

              </div>



              {/* Floating Devices Wrapper */}

              <div className="relative w-full h-64 mt-auto">

                <div className="absolute inset-0 flex items-center justify-center">

                  <div className="relative w-48 h-full bg-slate-900 border-4 border-slate-700 rounded-3xl shadow-2xl transform -rotate-6 translate-y-4 floating-shape" style={{ "--tw-rotate": "-6deg" } as React.CSSProperties}>

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

                      </div>

                    </div>

                    <div className="absolute -right-6 top-10 w-12 h-12 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center animate-bounce">

                      <CheckCircle className="text-primary text-2xl" />

                    </div>

                  </div>

                  <div className="relative w-48 h-full bg-white dark:bg-slate-800 border-4 border-gray-200 dark:border-slate-600 rounded-3xl shadow-xl transform rotate-12 translate-x-10 translate-y-[-20px] z-[-1] floating-shape opacity-80" style={{ "--tw-rotate": "12deg" } as React.CSSProperties}>

                    <div className="absolute top-0 left-0 right-0 h-6 bg-gray-100 dark:bg-slate-700 rounded-t-2xl"></div>

                    <div className="p-4 pt-8 space-y-3">

                      <div className="h-24 bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3 flex flex-col justify-end">

                        <div className="flex items-end space-x-2 h-12">

                          <div className="w-4 bg-blue-400 h-[40%] rounded-t-sm"></div>

                          <div className="w-4 bg-primary h-[80%] rounded-t-sm"></div>

                          <div className="w-4 bg-blue-300 h-[60%] rounded-t-sm"></div>

                        </div>

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