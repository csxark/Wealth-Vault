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
  const [hasPermission, setHasPermission] = useState<boolean>(false);

  useEffect(() => {
    if (!videoRef.current) return;

    // Request camera permission first
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(() => {
        setHasPermission(true);
        // Create QR Scanner instance
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

        // Start scanning
        scannerRef.current.start().catch((err) => {
          if (onScanError) {
            onScanError(err.message || 'Failed to start camera');
          }
        });
      })
      .catch((err) => {
        if (onScanError) {
          onScanError('Camera permission denied. Please allow camera access to scan QR codes.');
        }
      });

    // Cleanup
    return () => {
      if (scannerRef.current) {
        scannerRef.current.destroy();
      }
    };
  }, [onScanError]);

  const handleQRCode = (decodedText: string) => {
    try {
      let upiData: UPIData;
      
      // Handle both URL and plain text formats
      if (decodedText.startsWith('upi://')) {
        // Parse UPI URL format
        const url = new URL(decodedText);
        if (url.protocol !== 'upi:') {
          throw new Error('Not a valid UPI QR code');
        }

        const searchParams = new URLSearchParams(url.search);
        upiData = {
          pa: searchParams.get('pa') || '',
          pn: searchParams.get('pn') || '',
          am: searchParams.get('am') || undefined,
          tn: searchParams.get('tn') || undefined,
          cu: searchParams.get('cu') || 'INR',
          mc: searchParams.get('mc') || undefined
        };
      } else {
        // Try to parse plain text format (common in some UPI QRs)
        const parts = decodedText.split('&').reduce((acc, part) => {
          const [key, value] = part.split('=');
          acc[key.toLowerCase()] = decodeURIComponent(value);
          return acc;
        }, {} as Record<string, string>);

        upiData = {
          pa: parts.pa || '',
          pn: parts.pn || '',
          am: parts.am,
          tn: parts.tn,
          cu: parts.cu || 'INR',
          mc: parts.mc
        };
      }

      if (!upiData.pa) {
        throw new Error('Invalid UPI QR code: Missing UPI ID');
      }

      // If merchant name is missing, use UPI ID as name
      if (!upiData.pn) {
        upiData.pn = upiData.pa.split('@')[0];
      }

      onScanSuccess(upiData);
    } catch (error) {
      if (onScanError) {
        onScanError((error as Error).message);
      }
    }
  };

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
      <div className="mt-4 text-center text-sm text-gray-600">
        Position the QR code within the frame to scan
      </div>
    </div>
  );
};

export default QRScanner;
