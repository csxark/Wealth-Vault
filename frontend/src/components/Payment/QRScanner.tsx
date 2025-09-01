import React, { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';

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
  const scannerRef = useRef<QrScanner | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null); // null = not requested yet

  // Request permission on button click
  const requestPermission = () => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(() => {
        setHasPermission(true);
      })
      .catch(() => {
        setHasPermission(false);
        if (onScanError) {
          onScanError('Camera permission denied. Please allow camera access to scan QR codes.');
        }
      });
  };

  useEffect(() => {
    if (!videoRef.current || hasPermission !== true) return;

    // Initialize and start scanner
    if (!scannerRef.current) {
      scannerRef.current = new QrScanner(
        videoRef.current,
        (result) => {
          handleQRCode(result.data);
        },
        {
          preferredCamera: 'environment',
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 5,
          returnDetailedScanResult: true,
        }
      );
    }

    if (scannerRef.current) {
      // QrScanner does not have isScanning() in all versions; just call start safely
      scannerRef.current.start().catch((err) => {
        if (onScanError) onScanError(err.message || 'Failed to start camera');
      });
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.destroy();
        scannerRef.current = null;
      }
    };
  }, [hasPermission, onScanError]);

  const handleQRCode = (decodedText: string) => {
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
      onScanSuccess(upiData);
    } catch (error) {
      if (onScanError) {
        onScanError((error as Error).message);
      }
    }
  };

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
