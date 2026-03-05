/**
 * Receipt Scanner Component
 * Modal for capturing and scanning receipts using Tesseract.js OCR
 */

import React, { useState, useRef, useCallback } from 'react';
import { useReceiptScanner } from '../../hooks/useReceiptScanner';
import { X, Camera, Upload, RefreshCw, Check, AlertCircle, Loader2 } from 'lucide-react';
import type { ParsedReceiptData } from '../../types/ocr';

interface ReceiptScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: ParsedReceiptData) => void;
}

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [useServerOCR, setUseServerOCR] = useState(false);
  
  const {
    state,
    processImage,
    processWithServer,
    reset,
    selectImage
  } = useReceiptScanner({
    onSuccess: (data) => {
      onSuccess(data);
    },
    onError: (error) => {
      console.error('Receipt scan error:', error);
    }
  });

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await selectImage(file);
    }
  }, [selectImage]);

  const handleProcess = useCallback(async () => {
    if (!state.imagePreview) return;
    
    if (useServerOCR) {
      // Convert to base64 if needed
      let base64 = state.imagePreview;
      if (base64.startsWith('blob:')) {
        const response = await fetch(base64);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = async () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          await processWithServer(base64Data);
        };
        reader.readAsDataURL(blob);
      } else {
        await processWithServer(base64.replace('data:image/', '').split(',')[1] || base64);
      }
    } else {
      await processImage(state.imagePreview);
    }
  }, [state.imagePreview, useServerOCR, processImage, processWithServer]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await selectImage(file);
    }
  }, [selectImage]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Scan Receipt
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* OCR Mode Toggle */}
          <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                OCR Method
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {useServerOCR ? 'Server-side (Google Cloud Vision)' : 'Client-side (Tesseract.js)'}
              </p>
            </div>
            <button
              onClick={() => setUseServerOCR(!useServerOCR)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                useServerOCR ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  useServerOCR ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Image Preview / Drop Zone */}
          <div 
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              state.imagePreview 
                ? 'border-blue-300 dark:border-blue-700' 
                : 'border-gray-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-600'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {state.imagePreview ? (
              <div className="space-y-4">
                <img 
                  src={state.imagePreview} 
                  alt="Receipt preview" 
                  className="max-h-64 mx-auto rounded-lg object-contain"
                />
                <button
                  onClick={() => {
                    reset();
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Remove and select different image
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <Camera className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div>
                  <p className="text-gray-900 dark:text-white font-medium">
                    Drop your receipt here
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    or click to browse files
                  </p>
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    Select File
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Progress / Status */}
          {state.status === 'processing' && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing receipt...</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {state.status === 'error' && state.error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.error}
              </p>
            </div>
          )}

          {/* Success Message */}
          {state.status === 'success' && state.parsedData && (
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  Receipt processed successfully!
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  {state.parsedData.merchant} - ${state.parsedData.amount?.toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleProcess}
            disabled={!state.imagePreview || state.status === 'processing'}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              state.imagePreview && state.status !== 'processing'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 dark:bg-slate-600 text-gray-500 cursor-not-allowed'
            }`}
          >
            {state.status === 'processing' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Scan Receipt
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptScanner;

