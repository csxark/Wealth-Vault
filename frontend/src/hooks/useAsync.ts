import { useCallback } from 'react';
import { useLoading } from '../context/LoadingContext';
import { useError } from '../context/ErrorContext';

interface UseAsyncOptions<T = unknown> {
  loadingMessage?: string;
  onSuccess?: (data: T) => void;
  onError?: (error: Error | unknown) => void;
  showErrorToast?: boolean;
}

export const useAsync = () => {
  const { withLoading } = useLoading();
  const { handleApiError, showError } = useError();

  const execute = useCallback(
    async <T,>(
      asyncFunction: () => Promise<T>,
      options: UseAsyncOptions = {}
    ): Promise<T | null> => {
      const {
        loadingMessage = 'Loading...',
        onSuccess,
        onError,
        showErrorToast = true,
      } = options;

      try {
        const result = await withLoading(asyncFunction(), loadingMessage);
        
        if (onSuccess) {
          onSuccess(result);
        }
        
        return result;
      } catch (error: unknown) {
        if (showErrorToast) {
          handleApiError(error);
        }
        
        if (onError) {
          onError(error);
        }
        
        return null;
      }
    },
    [withLoading, handleApiError]
  );

  return { execute, showError };
};
