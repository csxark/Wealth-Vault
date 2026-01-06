import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  loadingMessage: string;
  startLoading: (message?: string) => void;
  stopLoading: () => void;
  withLoading: <T>(promise: Promise<T>, message?: string) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

interface LoadingProviderProps {
  children: ReactNode;
}

export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading...');
  const [loadingCount, setLoadingCount] = useState(0);

  const startLoading = useCallback((message: string = 'Loading...') => {
    setLoadingCount((prev) => prev + 1);
    setLoadingMessage(message);
    setIsLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    setLoadingCount((prev) => {
      const newCount = Math.max(0, prev - 1);
      if (newCount === 0) {
        setIsLoading(false);
      }
      return newCount;
    });
  }, []);

  const withLoading = useCallback(
    async <T,>(promise: Promise<T>, message: string = 'Loading...'): Promise<T> => {
      startLoading(message);
      try {
        const result = await promise;
        return result;
      } finally {
        stopLoading();
      }
    },
    [startLoading, stopLoading]
  );

  const value: LoadingContextType = {
    isLoading,
    loadingMessage,
    startLoading,
    stopLoading,
    withLoading,
  };

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
};
