import React, { useState } from 'react';
import { healthAPI } from '../services/api';

const ConnectionTest: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState<Record<string, unknown> | null>(null);

  const testConnection = async () => {
    setStatus('testing');
    setMessage('Testing connection...');
    setDetails(null);

    try {
      const response = await healthAPI.check();
      setStatus('success');
      setMessage('✅ Backend connection successful!');
      setDetails(response);
    } catch (error: unknown) {
      const err = error as Error & { status?: number; details?: unknown };
      setStatus('error');
      setMessage('❌ Backend connection failed');
      setDetails({
        error: err.message,
        status: err.status,
        details: err.details
      });
    }
  };

  const testAuthEndpoint = async () => {
    try {
      const response = await fetch('/api/auth/test', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        setMessage('✅ Auth endpoint accessible');
      } else {
        setMessage(`❌ Auth endpoint error: ${response.status}`);
      }
    } catch (error: unknown) {
      const err = error as Error;
      setMessage(`❌ Auth endpoint failed: ${err.message}`);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">API Connection Test</h2>
      
      <div className="space-y-4">
        <div className="flex space-x-4">
          <button
            onClick={testConnection}
            disabled={status === 'testing'}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {status === 'testing' ? 'Testing...' : 'Test Health Check'}
          </button>
          
          <button
            onClick={testAuthEndpoint}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Test Auth Endpoint
          </button>
        </div>

        {message && (
          <div className={`p-3 rounded ${
            status === 'success' ? 'bg-green-100 text-green-800' :
            status === 'error' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {message}
          </div>
        )}

        {details && (
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">Response Details:</h3>
            <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-6 p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2">Current Configuration:</h3>
          <ul className="text-sm space-y-1">
            <li><strong>Frontend Port:</strong> 3000</li>
            <li><strong>Backend Port:</strong> 5000</li>
            <li><strong>API Base URL:</strong> {import.meta.env.VITE_API_URL || '/api'}</li>
            <li><strong>Proxy Enabled:</strong> Yes</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ConnectionTest;
