import React, { useState } from 'react';
import QRScanner, { UPIData } from './QRScanner';
import PaymentForm from './PaymentForm';

const Payment: React.FC = () => {
  const [scannedData, setScannedData] = useState<UPIData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScanSuccess = (data: UPIData) => {
    setScannedData(data);
    setError(null);
  };

  const handleScanError = (error: string) => {
    setError(error);
  };

  const handlePaymentComplete = () => {
    // Reset the form after payment is initiated
    setScannedData(null);
  };

  const handleCancel = () => {
    setScannedData(null);
    setError(null);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Scan & Pay</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {!scannedData ? (
        <>
          <p className="mb-4 text-gray-600">
            Scan any UPI QR code to make a payment
          </p>
          <QRScanner
            onScanSuccess={handleScanSuccess}
            onScanError={handleScanError}
          />
        </>
      ) : (
        <PaymentForm
          upiData={scannedData}
          onPaymentSubmit={handlePaymentComplete}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
};

export default Payment;
