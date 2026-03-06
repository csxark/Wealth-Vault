/**
 * Receipt Scanner Hook
 * Custom hook for client-side OCR using Tesseract.js
 */

import { useState, useCallback, useRef } from 'react';
import Tesseract from 'tesseract.js';
import api from '../services/api';
import type { 
  ReceiptScannerState, 
  ParsedReceiptData, 
  TesseractResult 
} from '../types/ocr';

interface UseReceiptScannerOptions {
  onSuccess?: (data: ParsedReceiptData) => void;
  onError?: (error: string) => void;
}

interface UseReceiptScannerReturn {
  state: ReceiptScannerState;
  processImage: (imageSource: string | File | Blob) => Promise<void>;
  processWithServer: (imageBase64: string, ocrText?: string) => Promise<void>;
  reset: () => void;
  selectImage: (file: File) => Promise<void>;
}

/**
 * Custom hook for receipt scanning with Tesseract.js OCR
 */
export function useReceiptScanner(options: UseReceiptScannerOptions = {}): UseReceiptScannerReturn {
  const { onSuccess, onError } = options;
  
  const [state, setState] = useState<ReceiptScannerState>({
    status: 'idle',
    progress: 0,
    error: null,
    imagePreview: null,
    parsedData: null
  });

  const workerRef = useRef<Tesseract.Worker | null>(null);

  /**
   * Initialize Tesseract worker
   */
  const initializeWorker = useCallback(async () => {
    if (!workerRef.current) {
      workerRef.current = await Tesseract.createWorker('eng', 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') {
            setState(prev => ({
              ...prev,
              progress: Math.round(m.progress * 100)
            }));
          }
        }
      });
    }
    return workerRef.current;
  }, []);

  /**
   * Process image with Tesseract.js (client-side OCR)
   */
  const processImage = useCallback(async (imageSource: string | File | Blob) => {
    try {
      setState(prev => ({
        ...prev,
        status: 'processing',
        progress: 0,
        error: null
      }));

      // Create preview if it's a file
      let imagePreview: string | null = null;
      if (imageSource instanceof File || imageSource instanceof Blob) {
        imagePreview = URL.createObjectURL(imageSource);
      } else {
        imagePreview = imageSource;
      }

      setState(prev => ({ ...prev, imagePreview }));

      // Initialize worker
      const worker = await initializeWorker();

      // Perform OCR
      const result = await worker.recognize(imageSource);
      
      const ocrText = result.data.text;
      const confidence = result.data.confidence;

      if (!ocrText || ocrText.trim().length === 0) {
        throw new Error('No text detected in the image. Please try with a clearer image.');
      }

      // Send to server for parsing and categorization
      const response = await api.post('/expenses/process-receipt-base64', {
        ocrText,
        tesseractData: {
          confidence,
          words: result.data.words?.map((w: { text: string; confidence: number }) => ({
            text: w.text,
            confidence: w.confidence
          }))
        }
      });

      if (response.data.success) {
        setState(prev => ({
          ...prev,
          status: 'success',
          progress: 100,
          parsedData: response.data.data
        }));
        
        onSuccess?.(response.data.data);
      } else {
        throw new Error(response.data.message || 'Failed to parse receipt data');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process receipt';
      
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage
      }));
      
      onError?.(errorMessage);
    }
  }, [initializeWorker, onSuccess, onError]);

  /**
   * Process image with server-side OCR (Google Cloud Vision)
   */
  const processWithServer = useCallback(async (imageBase64: string, _ocrText?: string) => {
    try {
      setState(prev => ({
        ...prev,
        status: 'processing',
        progress: 50,
        error: null,
        imagePreview: imageBase64
      }));

      // Send to server for processing with Google Cloud Vision
      const response = await api.post('/expenses/process-receipt-base64', {
        imageBase64
      });

      if (response.data.success) {
        setState(prev => ({
          ...prev,
          status: 'success',
          progress: 100,
          parsedData: response.data.data
        }));
        
        onSuccess?.(response.data.data);
      } else {
        throw new Error(response.data.message || 'Failed to process receipt on server');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process receipt';
      
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage
      }));
      
      onError?.(errorMessage);
    }
  }, [onSuccess, onError]);

  /**
   * Select and preview image file
   */
  const selectImage = useCallback(async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: 'Please select an image file (JPEG, PNG, or WebP)'
      }));
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: 'Image size must be less than 10MB'
      }));
      return;
    }

    // Create preview
    const imagePreview = URL.createObjectURL(file);
    setState(prev => ({
      ...prev,
      imagePreview,
      status: 'idle',
      error: null
    }));
  }, []);

  /**
   * Reset scanner state
   */
  const reset = useCallback(() => {
    setState({
      status: 'idle',
      progress: 0,
      error: null,
      imagePreview: null,
      parsedData: null
    });
  }, []);

  return {
    state,
    processImage,
    processWithServer,
    reset,
    selectImage
  };
}

export default useReceiptScanner;

