import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const DevAuthBypass: React.FC = () => {
  const navigate = useNavigate();
  const [bypassed, setBypassed] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('user');
    setIsLoggedIn(!!(token && user));
  }, []);

  const bypassAuth = () => {
    console.log('[DevAuthBypass] Button clicked');
    
    // Create a mock user session for development
    const mockUser = {
      id: 'dev-user-001',
      email: 'dev@test.com',
      firstName: 'Developer',
      lastName: 'Test',
      role: 'user',
      createdAt: new Date().toISOString()
    };

    // Store mock session in localStorage first
    localStorage.setItem('authToken', 'dev-mock-token-123');
    localStorage.setItem('user', JSON.stringify(mockUser));
    
    console.log('[DevAuthBypass] Token set:', localStorage.getItem('authToken'));
    console.log('[DevAuthBypass] User set:', localStorage.getItem('user'));
    
    setBypassed(true);
    
    console.log('[DevAuthBypass] Redirecting to dashboard...');
    // Force a complete page reload to dashboard
    window.location.href = '/dashboard';
  };

  const clearBypass = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setBypassed(false);
    setIsLoggedIn(false);
  };

  // Don't show the button if user is already logged in
  if (isLoggedIn) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-yellow-100 dark:bg-yellow-900 border-2 border-yellow-500 rounded-lg p-4 shadow-lg max-w-xs">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🔧</span>
          <h3 className="font-bold text-yellow-900 dark:text-yellow-100">Dev Mode</h3>
        </div>
        
        {!bypassed ? (
          <button
            onClick={bypassAuth}
            className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded font-semibold transition-all"
          >
            🚀 Bypass Login
          </button>
        ) : (
          <div>
            <p className="text-green-700 dark:text-green-300 text-sm mb-2">✅ Auth bypassed! Redirecting...</p>
            <button
              onClick={clearBypass}
              className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded text-sm"
            >
              Clear Bypass
            </button>
          </div>
        )}
        
        <p className="text-xs text-yellow-800 dark:text-yellow-200 mt-2">
          ⚠️ Development only
        </p>
      </div>
    </div>
  );
};
