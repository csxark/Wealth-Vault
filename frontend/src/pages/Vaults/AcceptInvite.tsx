import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import api from '../../services/api';

const AcceptInvite: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vaultName, setVaultName] = useState<string>('');

  // Extract vault name from URL params if available
  useEffect(() => {
    const name = searchParams.get('vault');
    if (name) {
      setVaultName(decodeURIComponent(name));
    }
  }, [searchParams]);

  const handleAcceptInvite = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      await api.vaults.invites.accept(token);
      setAccepted(true);
      toast({
        title: 'Success',
        description: 'You have successfully joined the vault!',
      });
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError?.response?.data?.message || 'Failed to accept invitation. The invite may be expired or invalid.';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-600 to-cyan-300 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white dark:bg-slate-800 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-blue-600 dark:text-blue-300" />
          </div>
          <CardTitle className="text-2xl text-gray-900 dark:text-white">
            Vault Invitation
          </CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            {vaultName ? `You've been invited to join "${vaultName}"` : 'You\'ve been invited to join a vault'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {!accepted && !error && (
            <div className="text-center space-y-4">
              <p className="text-gray-700 dark:text-gray-300">
                Joining this vault will give you access to shared financial data and collaborative budgeting features.
              </p>

              <div className="bg-blue-50 dark:bg-slate-700 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">What you'll get:</h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• Access to shared budgets and expenses</li>
                  <li>• Collaborative financial planning</li>
                  <li>• Real-time updates from other members</li>
                  <li>• Secure data sharing within the vault</li>
                </ul>
              </div>

              <Button
                onClick={handleAcceptInvite}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                size="lg"
              >
                {loading ? (
                  'Accepting...'
                ) : (
                  <>
                    Accept Invitation
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          )}

          {accepted && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-300" />
              </div>
              <h3 className="text-xl font-semibold text-green-900 dark:text-green-100">
                Welcome to the vault!
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                You have successfully joined {vaultName ? `"${vaultName}"` : 'the vault'}.
                You can now access shared budgets and collaborate with other members.
              </p>
              <Button
                onClick={() => navigate('/vaults')}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                Go to My Vaults
              </Button>
            </div>
          )}

          {error && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-600 dark:text-red-300" />
              </div>
              <h3 className="text-xl font-semibold text-red-900 dark:text-red-100">
                Invitation Error
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                {error}
              </p>
              <div className="space-y-2">
                <Button
                  onClick={() => navigate('/vaults')}
                  variant="outline"
                  className="w-full"
                >
                  Go to My Vaults
                </Button>
                <Button
                  onClick={() => window.location.reload()}
                  variant="ghost"
                  className="w-full text-gray-600 dark:text-gray-400"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvite;