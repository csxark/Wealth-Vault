import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

interface QRScannerProps {
  onScanSuccess: (upiData: UPIData) => void;
  onScanError?: (error: string) => void;
}

export interface UPIData {
  pa: string;  // UPI ID
  pn: string;  // Payee Name
  am?: string; // Amount (optional)
  tn?: string; // Transaction Note (optional)
  cu?: string; // Currency (optional)
  mc?: string; // Merchant Code (optional)
}

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onScanError }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Request permission on button click
  const requestPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setHasPermission(true);
    } catch (error) {
      setHasPermission(false);
      if (onScanError) {
        onScanError('Camera permission denied. Please allow camera access to scan QR codes.');
      }
    }
  };

  const startScanning = useCallback(async () => {
    if (!videoRef.current || hasPermission !== true) return;

    try {
      setIsScanning(true);

      // Initialize ZXing reader
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;

      // Get available video devices
      const videoDevices = await codeReader.listVideoInputDevices();
      const selectedDevice = videoDevices.find(device =>
        device.label.toLowerCase().includes('back') ||
        device.label.toLowerCase().includes('environment')
      ) || videoDevices[0];

      if (!selectedDevice) {
        throw new Error('No camera device found');
      }

      // Start decoding
      await codeReader.decodeFromVideoDevice(
        selectedDevice.deviceId,
        videoRef.current,
        (result, error) => {
          if (result) {
            handleQRCode(result.getText());
          }
          if (error) {
            console.warn('QR scan error:', error);
          }
        }
      );
    } catch (error) {
      console.error('Error starting QR scanner:', error);
      if (onScanError) {
        onScanError('Failed to start camera. Please try again.');
      }
      setIsScanning(false);
    }
  }, [hasPermission, onScanError]);

  const stopScanning = useCallback(async () => {
    if (codeReaderRef.current) {
      try {
        await codeReaderRef.current.reset();
        codeReaderRef.current = null;
      } catch (error) {
        console.error('Error stopping scanner:', error);
      }
    }
    setIsScanning(false);
  }, []);

  useEffect(() => {
    if (hasPermission === true && !isScanning) {
      startScanning();
    }

    return () => {
      stopScanning();
    };
  }, [hasPermission, isScanning, startScanning, stopScanning]);

  const handleQRCode = useCallback((decodedText: string) => {
    // Parse UPI QR code (format: upi://pay?pa=...&pn=...&am=...&tn=...)
    try {
      if (!decodedText.startsWith('upi://pay?')) {
        throw new Error('Not a valid UPI QR code');
      }
      const params = new URLSearchParams(decodedText.replace('upi://pay?', ''));
      const upiData: UPIData = {
        pa: params.get('pa') || '',
        pn: params.get('pn') || '',
        am: params.get('am') || undefined,
        tn: params.get('tn') || undefined,
        cu: params.get('cu') || undefined,
        mc: params.get('mc') || undefined,
      };
      if (!upiData.pa || !upiData.pn) {
        throw new Error('Missing UPI ID or Payee Name');
      }
      // Stop scanning after successful scan
      stopScanning();
      onScanSuccess(upiData);
    } catch (error) {
      if (onScanError) {
        onScanError((error as Error).message);
      }
    }
  }, [onScanSuccess, onScanError, stopScanning]);

  if (hasPermission === null) {
    // Permission not requested yet
    return (
      <div className="w-full max-w-md mx-auto p-4 text-center bg-gray-50 rounded-lg dark:bg-gray-900">
        <p className="mb-4 text-gray-700 dark:text-gray-300">
          To scan a QR code, this app needs access to your camera.
        </p>
        <button
          onClick={requestPermission}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Allow Camera Access
        </button>
      </div>
    );
  }

  if (hasPermission === false) {
    // Permission denied
    return (
      <div className="w-full max-w-md mx-auto p-4 text-center bg-red-50 rounded-lg dark:bg-red-900">
        <p className="text-red-700 dark:text-red-400">
          Camera permission denied. Please enable camera access in your browser settings to scan QR codes.
        </p>
      </div>
    );
  }

  // Permission granted - show camera preview
  return (
    <div className="w-full max-w-md mx-auto">
      <video 
        ref={videoRef} 
        className="w-full rounded-lg"
        style={{ 
          maxHeight: '70vh',
          objectFit: 'cover'
        }}
      />
      <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
        Position the QR code within the frame to scan
      </div>
    </div>
  );
};

export default QRScanner;
