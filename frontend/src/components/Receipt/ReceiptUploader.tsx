import React, { useState, useRef } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

/**
 * Receipt Uploader Component
 * Handles receipt image upload and OCR processing
 * Issue #639: Smart Expense Categorization & Merchant Recognition
 */
const ReceiptUploader = ({ expenseId, onUploadComplete }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('receipt', file);
      if (expenseId) {
        formData.append('expenseId', expenseId);
      }

      const response = await fetch('/api/smart-categorization/receipts/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      onUploadComplete?.(data.data);
      setSelectedFile(null);
      setPreview(null);
    }
  });

  const handleFileSelect = (file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a JPG, PNG, or PDF file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setSelectedFile(file);

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const isProcessing = uploadMutation.isPending;
  const isSuccess = uploadMutation.isSuccess;
  const isError = uploadMutation.isError;
  const extractedData = uploadMutation.data?.data?.extractedData;

  return (
    <div className="w-full">
      {!selectedFile && !isSuccess && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400'
          }`}
        >
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-lg font-medium text-gray-900 mb-1">
            Drag and drop receipt here
          </p>
          <p className="text-sm text-gray-600 mb-4">
            or click to select from your computer
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Supported formats: JPG, PNG, PDF (max 5MB)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Browse Files
          </button>
        </div>
      )}

      {selectedFile && !isSuccess && (
        <div className="space-y-4">
          {preview && (
            <div className="relative w-full max-h-64 bg-gray-100 rounded-lg overflow-hidden">
              <img
                src={preview}
                alt="Receipt preview"
                className="w-full h-full object-contain"
              />
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setPreview(null);
                }}
                className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full hover:bg-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
            <p className="text-xs text-gray-600 mt-1">
              {(selectedFile.size / 1024).toFixed(2)} KB
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleUpload}
              disabled={isProcessing}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
            >
              {isProcessing && <Loader className="w-4 h-4 animate-spin" />}
              {isProcessing ? 'Processing...' : 'Upload & Extract'}
            </button>
            <button
              onClick={() => {
                setSelectedFile(null);
                setPreview(null);
              }}
              disabled={isProcessing}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          {isError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-900">Upload failed</p>
                <p className="text-xs text-red-800">
                  {uploadMutation.error?.message}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {isSuccess && extractedData && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <div>
              <p className="font-medium text-green-900">Receipt processed successfully</p>
              <p className="text-sm text-green-800">
                Confidence: {((uploadMutation.data?.data?.confidence || 0) * 100).toFixed(0)}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {extractedData.merchant && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 font-medium">Merchant</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  {extractedData.merchant}
                </p>
              </div>
            )}

            {extractedData.amount && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 font-medium">Amount</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  {extractedData.currency} {extractedData.amount.toFixed(2)}
                </p>
              </div>
            )}

            {extractedData.date && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 font-medium">Date</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  {new Date(extractedData.date).toLocaleDateString()}
                </p>
              </div>
            )}

            {extractedData.tax && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 font-medium">Tax</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  {extractedData.currency} {extractedData.tax.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setSelectedFile(null);
              setPreview(null);
              uploadMutation.reset();
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Upload Another Receipt
          </button>
        </div>
      )}
    </div>
  );
};

export default ReceiptUploader;
