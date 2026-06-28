import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { authAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface MFAStatus {
  enabled: boolean;
  hasRecoveryCodes: boolean;
  recoveryCodesCount: number;
}

interface MFASetupData {
  secret: string;
  otpauth_url: string;
  qr_code: string;
}

export const MFASection: React.FC = () => {
  const [mfaStatus, setMfaStatus] = useState<MFAStatus | null>(null);
  const [setupData, setSetupData] = useState<MFASetupData | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupStep, setSetupStep] = useState<'status' | 'setup' | 'verify'>('status');

  const { showToast } = useToast();

  useEffect(() => {
    loadMFAStatus();
  }, []);

  const loadMFAStatus = async () => {
    try {
      const response = await authAPI.getMFAStatus();
      if (response.success) {
        setMfaStatus(response.data);
      }
    } catch (error) {
      console.error('Error loading MFA status:', error);
    }
  };

  const handleSetupMFA = async () => {
    setLoading(true);
    try {
      const response = await authAPI.setupMFA();
      if (response.success) {
        setSetupData(response.data);
        setSetupStep('setup');
        showToast('MFA setup initiated. Scan the QR code with your authenticator app.', 'success');
      }
    } catch (error) {
      console.error('Error setting up MFA:', error);
      showToast('Failed to setup MFA. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMFA = async () => {
    if (!verificationToken || verificationToken.length !== 6) {
      showToast('Please enter a valid 6-digit token.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.verifyMFA(verificationToken);
      if (response.success) {
        setSetupStep('status');
        setSetupData(null);
        setVerificationToken('');
        await loadMFAStatus();
        showToast('MFA has been successfully enabled!', 'success');
      }
    } catch (error) {
      console.error('Error verifying MFA:', error);
      showToast('Invalid token. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableMFA = async () => {
    const password = prompt('Please enter your password to disable MFA:');
    if (!password) return;

    setLoading(true);
    try {
      const response = await authAPI.disableMFA(password);
      if (response.success) {
        await loadMFAStatus();
        showToast('MFA has been disabled.', 'success');
      }
    } catch (error) {
      console.error('Error disabling MFA:', error);
      showToast('Failed to disable MFA. Please check your password.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateRecoveryCodes = async () => {
    if (!confirm('This will invalidate all existing recovery codes. Are you sure?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.regenerateRecoveryCodes();
      if (response.success) {
        setRecoveryCodes(response.data.codes);
        setShowRecoveryCodes(true);
        showToast('Recovery codes regenerated. Please save them securely!', 'warning');
      }
    } catch (error) {
      console.error('Error regenerating recovery codes:', error);
      showToast('Failed to regenerate recovery codes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadRecoveryCodes = async () => {
    try {
      const response = await authAPI.getRecoveryCodes();
      if (response.success) {
        setRecoveryCodes(response.data.codes);
        setShowRecoveryCodes(true);
      }
    } catch (error) {
      console.error('Error loading recovery codes:', error);
      showToast('Failed to load recovery codes.', 'error');
    }
  };

  if (!mfaStatus) {
    return (
      <div className="animate-pulse">
        <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900/70 backdrop-blur-xl rounded-2xl shadow-2xl
      border border-slate-200 dark:border-cyan-500/20 overflow-hidden">

      <div className="px-6 sm:px-8 py-6 border-b border-slate-200 dark:border-slate-700/50">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <Shield className="h-6 w-6 text-cyan-500 dark:text-cyan-400" />
          Security Settings
        </h2>
      </div>

      <div className="px-6 sm:px-8 py-8 space-y-6">
        {setupStep === 'status' && (
          <>
            {/* MFA Status */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${mfaStatus.enabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  {mfaStatus.enabled ? (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Two-Factor Authentication
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {mfaStatus.enabled ? 'Enabled' : 'Not enabled'}
                  </p>
                </div>
              </div>

              {!mfaStatus.enabled ? (
                <button
                  onClick={handleSetupMFA}
                  disabled={loading}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Setting up...' : 'Enable MFA'}
                </button>
              ) : (
                <button
                  onClick={handleDisableMFA}
                  disabled={loading}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Disabling...' : 'Disable MFA'}
                </button>
              )}
            </div>

            {/* Recovery Codes */}
            {mfaStatus.enabled && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-cyan-500" />
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        Recovery Codes
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {mfaStatus.hasRecoveryCodes
                          ? `${mfaStatus.recoveryCodesCount} codes available`
                          : 'No recovery codes generated'
                        }
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={loadRecoveryCodes}
                      className="px-3 py-2 text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded-lg font-medium transition-colors"
                    >
                      View Codes
                    </button>
                    <button
                      onClick={handleRegenerateRecoveryCodes}
                      disabled={loading}
                      className="px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {showRecoveryCodes && recoveryCodes.length > 0 && (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
                        Warning: Save these recovery codes securely!
                      </h4>
                      <button
                        onClick={() => setShowRecoveryCodes(false)}
                        className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400"
                      >
                        Close
                      </button>
                    </div>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                      These codes can be used to access your account if you lose your authenticator device.
                      Each code can only be used once.
                    </p>
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                      {recoveryCodes.map((code, index) => (
                        <div key={index} className="bg-white dark:bg-slate-800 p-2 rounded border">
                          {code}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {setupStep === 'setup' && setupData && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Set up Two-Factor Authentication
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.)
              </p>
            </div>

            <div className="flex justify-center">
              <div className="p-4 bg-white rounded-xl border-2 border-slate-200 dark:border-slate-700">
                <img
                  src={setupData.qr_code}
                  alt="MFA QR Code"
                  className="w-48 h-48"
                />
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                Or enter this code manually:
              </p>
              <code className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded font-mono text-sm">
                {setupData.secret}
              </code>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Enter the 6-digit code from your app:
              </label>
              <input
                type="text"
                value={verificationToken}
                onChange={(e) => setVerificationToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600
                  bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-center text-lg font-mono
                  focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                placeholder="000000"
                maxLength={6}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSetupStep('status')}
                className="flex-1 px-4 py-3 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyMFA}
                disabled={loading || verificationToken.length !== 6}
                className="flex-1 px-4 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};