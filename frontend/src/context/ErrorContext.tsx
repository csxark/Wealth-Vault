import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface AppError {
  message: string;
  code?: string;
  status?: number;
  timestamp: number;
  id: string;
}

interface ErrorContextType {
  errors: AppError[];
  currentError: AppError | null;
  showError: (message: string, code?: string, status?: number) => void;
  clearError: (id: string) => void;
  clearAllErrors: () => void;
  handleApiError: (error: Error | unknown) => void;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

export const useError = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
};

interface ErrorProviderProps {
  children: ReactNode;
}

export const ErrorProvider: React.FC<ErrorProviderProps> = ({ children }) => {
  const [errors, setErrors] = useState<AppError[]>([]);
  const [currentError, setCurrentError] = useState<AppError | null>(null);

  const showError = useCallback((message: string, code?: string, status?: number) => {
    const error: AppError = {
      message,
      code,
      status,
      timestamp: Date.now(),
      id: `error-${Date.now()}-${Math.random()}`,
    };

    setErrors((prev) => [...prev, error]);
    setCurrentError(error);

    // Auto-dismiss error after 5 seconds
    setTimeout(() => {
      clearError(error.id);
    }, 5000);
  }, []);

  const clearError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((err) => err.id !== id));
    setCurrentError((prev) => (prev?.id === id ? null : prev));
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors([]);
    setCurrentError(null);
  }, []);

  const handleApiError = useCallback((error: Error | unknown) => {
    let errorMessage = 'An unexpected error occurred';
    let errorCode: string | undefined;
    let errorStatus: number | undefined;

    if (error?.response) {
      // API error with response
      errorMessage = error.response.data?.message || 
                    error.response.data?.error || 
                    error.message || 
                    `Server error: ${error.response.status}`;
      errorCode = error.response.data?.code;
      errorStatus = error.response.status;
    } else if (error?.request) {
      // Network error
      errorMessage = 'Network error. Please check your connection.';
      errorCode = 'NETWORK_ERROR';
    } else if (error?.message) {
      // Other errors
      errorMessage = error.message;
    }

    showError(errorMessage, errorCode, errorStatus);
  }, [showError]);

  const value: ErrorContextType = {
    errors,
    currentError,
    showError,
    clearError,
    clearAllErrors,
    handleApiError,
  };

  return (
    <ErrorContext.Provider value={value}>
      {children}
    </ErrorContext.Provider>
  );
};
