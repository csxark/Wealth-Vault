import React, { useEffect } from 'react';
import { X, AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { useError } from '../../context/ErrorContext';

interface ErrorToastProps {
  message: string;
  type?: 'error' | 'warning' | 'info' | 'success';
  onClose: () => void;
  autoClose?: boolean;
}

export const ErrorToast: React.FC<ErrorToastProps> = ({ 
  message, 
  type = 'error', 
  onClose,
  autoClose = true 
}) => {
  useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose]);

  const typeStyles = {
    error: {
      bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      icon: AlertCircle,
      iconColor: 'text-red-600 dark:text-red-400',
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-800 dark:text-yellow-200',
      icon: AlertTriangle,
      iconColor: 'text-yellow-600 dark:text-yellow-400',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-200',
      icon: Info,
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    success: {
      bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
      text: 'text-green-800 dark:text-green-200',
      icon: CheckCircle,
      iconColor: 'text-green-600 dark:text-green-400',
    },
  };

  const style = typeStyles[type];
  const Icon = style.icon;

  return (
    <div className={`${style.bg} border ${style.text} px-4 py-3 rounded-xl shadow-lg flex items-start gap-3 animate-slide-down`}>
      <Icon className={`h-5 w-5 ${style.iconColor} flex-shrink-0 mt-0.5`} />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={onClose}
        className={`${style.iconColor} hover:opacity-70 transition-opacity flex-shrink-0`}
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export const ErrorToastContainer: React.FC = () => {
  const { errors, clearError } = useError();

  if (errors.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2 max-w-md">
      {errors.slice(-3).map((error) => (
        <ErrorToast
          key={error.id}
          message={error.message}
          type="error"
          onClose={() => clearError(error.id)}
        />
      ))}
    </div>
  );
};

interface ErrorBoundaryFallbackProps {
  error: Error;
  resetError: () => void;
}

export const ErrorBoundaryFallback: React.FC<ErrorBoundaryFallbackProps> = ({ error, resetError }) => {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="flex flex-col items-center text-center">
          <div className="bg-red-100 dark:bg-red-900/30 rounded-full p-4 mb-4">
            <AlertCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
            Something went wrong
          </h2>
          <p className="text-neutral-600 dark:text-slate-400 mb-6">
            {error.message || 'An unexpected error occurred'}
          </p>
          <div className="flex gap-3 w-full">
            <button
              onClick={resetError}
              className="flex-1 px-4 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-all"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="flex-1 px-4 py-3 bg-neutral-100 dark:bg-slate-700 text-neutral-900 dark:text-white rounded-xl font-medium hover:bg-neutral-200 dark:hover:bg-slate-600 transition-all"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && (
        <div className="bg-neutral-100 dark:bg-slate-800 rounded-full p-4 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-neutral-600 dark:text-slate-400 mb-6 max-w-md">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
