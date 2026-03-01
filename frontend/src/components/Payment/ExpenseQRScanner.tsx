import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { CameraOff, X, CheckCircle } from 'lucide-react';

interface ExpenseQRScannerProps {
  onScanSuccess: (expenseData: ExpenseQRData) => void;
  onScanError?: (error: string) => void;
  onClose: () => void;
}

export interface ExpenseQRData {
  type: 'expense';
  id?: string;
  amount: number;
  currency: string;
  description: string;
  category: string;
  date: string;
  paymentMethod: string;
  merchant?: string;
  location?: string;
  tags?: string;
  timestamp?: string;
}

const ExpenseQRScanner: React.FC<ExpenseQRScannerProps> = ({
  onScanSuccess,
  onScanError,
  onClose
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ExpenseQRData | null>(null);
  const [error, setError] = useState<string>('');

  // Request camera permission
  const requestPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setHasPermission(true);
      setError('');
    } catch (error) {
      setHasPermission(false);
      setError('Camera permission denied. Please allow camera access to scan QR codes.');
      if (onScanError) {
        onScanError('Camera permission denied. Please allow camera access to scan QR codes.');
      }
    }
  };

  const startScanning = useCallback(async () => {
    if (!videoRef.current || hasPermission !== true) return;

    try {
      setIsScanning(true);
      setError('');

      // Initialize ZXing reader
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;

      // Get available video devices
      const videoDevices = await BrowserMultiFormatReader.listVideoInputDevices();

      if (videoDevices.length === 0) {
        throw new Error('No camera devices found');
      }

      // Use the back camera if available
      const backCamera = videoDevices.find((device: MediaDeviceInfo) =>
        device.label.toLowerCase().includes('back') ||
        device.label.toLowerCase().includes('rear')
      );

      const selectedDeviceId = backCamera?.deviceId || videoDevices[0].deviceId;

      // Start decoding
      await codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            try {
              const qrData = JSON.parse(result.getText());

              // Validate that this is expense data
              if (qrData.type === 'expense') {
                setScanResult(qrData);
                setIsScanning(false);
                // Stop scanning by clearing the reader
                if (codeReaderRef.current) {
                  codeReaderRef.current = null;
                }
              } else {
                setError('Invalid QR code. Please scan an expense receipt QR code.');
              }
            } catch (parseError) {
              setError('Invalid QR code format. Please scan a valid expense receipt QR code.');
            }
          }

          if (err && !(err instanceof Error && err.name === 'NotFoundException')) {
            console.error('QR scan error:', err);
          }
        }
      );

    } catch (error) {
      console.error('Error starting QR scanner:', error);
      setError('Failed to start camera. Please try again.');
      setIsScanning(false);
    }
  }, [hasPermission, onScanError]);

  const stopScanning = useCallback(() => {
    if (codeReaderRef.current) {
      // Clear the reader reference to stop scanning
      codeReaderRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const handleConfirmScan = () => {
    if (scanResult) {
      onScanSuccess(scanResult);
      onClose();
    }
  };

  const handleRetry = () => {
    setScanResult(null);
    setError('');
    startScanning();
  };

  useEffect(() => {
    if (hasPermission === true && !scanResult) {
      startScanning();
    }

    return () => {
      stopScanning();
    };
  }, [hasPermission, scanResult, startScanning, stopScanning]);

  useEffect(() => {
    // Request permission on mount
    requestPermission();
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Scan Expense QR Code
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {hasPermission === null && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Requesting camera permission...</p>
            </div>
          )}

          {hasPermission === false && (
            <div className="text-center py-8">
              <CameraOff className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <button
                onClick={requestPermission}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {hasPermission === true && !scanResult && (
            <div className="space-y-4">
              <div className="relative">
                <video
                  ref={videoRef}
                  className="w-full h-64 bg-black rounded-lg"
                  playsInline
                  muted
                />
                {isScanning && (
                  <div className="absolute inset-0 border-2 border-blue-500 rounded-lg pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                      <div className="w-32 h-32 border-2 border-white rounded-lg opacity-50"></div>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Position the QR code within the frame
                </p>
                <button
                  onClick={stopScanning}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Stop Scanning
                </button>
              </div>
            </div>
          )}

          {scanResult && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center mb-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span className="font-medium text-green-800 dark:text-green-300">
                    QR Code Scanned Successfully
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Amount:</span>
                    <span className="font-medium">{scanResult.currency} {scanResult.amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Description:</span>
                    <span className="font-medium">{scanResult.description}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Category:</span>
                    <span className="font-medium">{scanResult.category}</span>
                  </div>
                  {scanResult.merchant && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Merchant:</span>
                      <span className="font-medium">{scanResult.merchant}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleConfirmScan}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Use This Data
                </button>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Scan Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpenseQRScanner;