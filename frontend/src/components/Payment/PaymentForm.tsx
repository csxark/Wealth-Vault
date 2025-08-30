import React, { useState } from 'react';
import type { UPIData } from './QRScanner';

interface PaymentFormProps {
  upiData: UPIData;
  onPaymentSubmit: () => void;
  onCancel: () => void;
}

export interface PaymentFormData {
  amount: string;
  category: string;
  description?: string;
}

const CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Bills',
  'Entertainment',
  'Health',
  'Others'
] as const;

const PaymentForm: React.FC<PaymentFormProps> = ({ upiData, onPaymentSubmit, onCancel }) => {
  const [formData, setFormData] = useState<PaymentFormData>({
    amount: '',
    category: CATEGORIES[0],
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    // Generate UPI payment URL
    const upiUrl = generateUPIUrl(upiData, formData);
    
    // List of common UPI apps deep link prefixes
    const upiApps = [
      { name: 'GPay', scheme: 'gpay' },
      { name: 'PhonePe', scheme: 'phonepe' },
      { name: 'Paytm', scheme: 'paytm' },
      { name: 'BHIM', scheme: 'bhim' }
    ];

    // Function to try opening an app
    const tryOpenApp = (url: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const startTime = Date.now();
        const link = document.createElement('a');
        link.href = url;
        
        // Handle case when app opens
        window.addEventListener('blur', function onBlur() {
          window.removeEventListener('blur', onBlur);
          resolve(true);
        });
        
        // Handle case when app doesn't open
        setTimeout(() => {
          if (document.hidden || Date.now() - startTime > 2000) {
            resolve(true);
          } else {
            resolve(false);
          }
        }, 1000);

        link.click();
      });
    };

    // Try to open UPI apps in sequence
    let opened = false;
    for (const app of upiApps) {
      const appUrl = `${app.scheme}://${upiUrl.substring(4)}`; // Replace 'upi:' with app scheme
      opened = await tryOpenApp(appUrl);
      if (opened) break;
    }

    // If no app opened, try the default URL
    if (!opened) {
      window.location.href = upiUrl;
    }
    
    onPaymentSubmit();
  };

  const generateUPIUrl = (upiData: UPIData, formData: PaymentFormData): string => {
    const params = new URLSearchParams();
    
    // Required parameters
    params.append('pa', upiData.pa);
    params.append('pn', encodeURIComponent(upiData.pn));
    params.append('am', formData.amount);
    params.append('cu', upiData.cu || 'INR');
    
    // Optional parameters
    if (upiData.mc) {
      params.append('mc', upiData.mc);
    }
    
    // Combine category and description for transaction note
    const tn = formData.description 
      ? `${formData.category}: ${formData.description}`
      : formData.category;
    params.append('tn', encodeURIComponent(tn));

    // Add mode parameter for better compatibility
    params.append('mode', '00');
    
    // Add purpose for better compatibility
    params.append('purpose', '00');

    return `upi://pay?${params.toString()}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <div className="space-y-2">
        <h2 className="text-xl font-bold">Payment Details</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700">Merchant</label>
          <p className="mt-1 text-gray-900">{upiData.pn}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">UPI ID</label>
          <p className="mt-1 text-gray-900">{upiData.pa}</p>
        </div>
      </div>

      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
          Amount (₹)
        </label>
        <input
          type="number"
          id="amount"
          required
          min="1"
          step="0.01"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-medium text-gray-700">
          Category
        </label>
        <select
          id="category"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Description (Optional)
        </label>
        <input
          type="text"
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <div className="flex space-x-4">
        <button
          type="submit"
          className="flex-1 bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 transition"
        >
          Pay Now
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded shadow hover:bg-gray-400 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export default PaymentForm;
