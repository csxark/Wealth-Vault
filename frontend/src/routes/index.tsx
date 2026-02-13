import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthForm } from '../components/Auth/AuthForm';
import Dashboard from '../components/Dashboard/Dashboard';
import { Coach } from '../components/Coach/Coach';
import { Goals } from '../components/Goals/Goals';
import { Expenses } from '../components/Expenses/Expenses';
import { DataImport } from '../components/Import/DataImport';

import { Profile } from '../components/Profile/Profile';
import Analytics from '../components/Analytics/Analytics';
import Savings from '../components/Savings/Savings';
import { Forecasting } from '../components/Budgets/Forecasting';
import { useAuth } from '../hooks/useAuth';
import { ProfileSetup } from '../components/Auth/ProfileSetup';
import  Home  from '../components/Home/Home';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 flex items-center justify-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-xl">
          <div className="animate-pulse flex space-x-4">
            <div className="rounded-full bg-slate-200 dark:bg-slate-700 h-12 w-12"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

interface PublicRouteProps {
  children: React.ReactNode;
}

export const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to={(location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard'} replace />;
  }

  return <>{children}</>;
};

export const routes = [
  {
    path: '/',
    element: 
    <PublicRoute>
        <Home />
    </PublicRoute>
  },
  {
    path: '/auth',
    element: (
      <PublicRoute>
        <AuthForm />
      </PublicRoute>
    )
  },
  {
    path: '/profile-setup',
    element: (
      <ProtectedRoute>
        <ProfileSetup />
      </ProtectedRoute>
    )
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    )
  },
  {
    path: '/coach',
    element: (
      <ProtectedRoute>
        <Coach />
      </ProtectedRoute>
    )
  },
  {
    path: '/goals',
    element: (
      <ProtectedRoute>
        <Goals />
      </ProtectedRoute>
    )
  },
  {
    path: '/expenses',
    element: (
      <ProtectedRoute>
        <Expenses />
      </ProtectedRoute>
    )
  },
  {
    path: '/savings',

    element: (
      <ProtectedRoute>
        <Savings />
      </ProtectedRoute>
    )
  },
  {
    path: '/import',
    element: (
      <ProtectedRoute>
        <DataImport />
      </ProtectedRoute>
    )
  },
  {
    path: '/profile',
    element: (
      <ProtectedRoute>
        <Profile />
      </ProtectedRoute>
    )
  },
  {
    path: '/analytics',
    element: (
      <ProtectedRoute>
        <Analytics />
      </ProtectedRoute>
    )
  },
  {
    path: '/forecasting',
    element: (
      <ProtectedRoute>
        <Forecasting />
      </ProtectedRoute>
    )
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
];
