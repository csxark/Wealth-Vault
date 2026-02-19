import React, { useState, useEffect } from 'react';
import { Mail, UserPlus, X, Copy, ExternalLink } from 'lucide-react';
import api from '../../services/api';
import { VaultInvite } from '../../types';

interface VaultInvitationProps {
  vaultId: string;
  vaultName: string;
  onClose?: () => void;
}

const VaultInvitation: React.FC<VaultInvitationProps> = ({
  vaultId,
  vaultName,
  onClose
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const [fetchingInvites, setFetchingInvites] = useState(true);
  const [pendingInvites, setPendingInvites] = useState<VaultInvite[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    fetchPendingInvites();
  }, [vaultId]);

  const fetchPendingInvites = async () => {
    try {
      const response = await api.vaults.invites.getPending(vaultId);
      setPendingInvites(response.data);
    } catch (error) {
      console.error('Failed to fetch pending invites:', error);
    } finally {
      setFetchingInvites(false);
    }
  };

  const handleSendInvite = async () => {
    if (!email.trim()) {
      alert('Please enter an email address');
      return;
    }

    setLoading(true);
    try {
      const response = await api.vaults.invites.create(vaultId, {
        email: email.trim(),
        role,
      });

      // Refresh pending invites after sending new invite
      await fetchPendingInvites();

      setInviteLink(`${window.location.origin}/join-vault/${response.data.inviteToken}`);
      setEmail('');
      alert(`Invitation sent to ${email}`);
    } catch (error: any) {
      console.error('Failed to send invitation:', error);
      alert('Failed to send invitation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      alert('Invite link copied to clipboard');
    }
  };

  const cancelInvite = async (inviteId: string) => {
    try {
      await api.vaults.invites.cancel(vaultId, inviteId);
      // Refresh pending invites after cancelling
      await fetchPendingInvites();
      alert('Invitation cancelled');
    } catch (error) {
      console.error('Failed to cancel invitation:', error);
      alert('Failed to cancel invitation. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Invite Form */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center mb-4">
          <UserPlus className="mr-2 h-5 w-5 text-cyan-600" />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white">
            Invite Members to {vaultName}
          </h2>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Email Address
              </label>
              <input
                type="email"
                placeholder="member@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendInvite()}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleSendInvite}
                disabled={loading || !email.trim()}
                className="w-full px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Send Invite
              </button>
            </div>
          </div>

          {inviteLink && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <ExternalLink className="h-4 w-4 text-blue-600 mr-2" />
                  <span className="text-sm text-blue-800 dark:text-blue-200">
                    Invite link generated
                  </span>
                </div>
                <button
                  onClick={copyInviteLink}
                  className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors flex items-center"
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copy Link
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pending Invites */}
      {fetchingInvites ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
            Pending Invitations
          </h3>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600"></div>
          </div>
        </div>
      ) : pendingInvites.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
            Pending Invitations
          </h3>
          <div className="space-y-3">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="font-medium text-slate-800 dark:text-white">{invite.email}</p>
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-1 text-xs bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200 rounded">
                        {invite.role}
                      </span>
                      <span className="text-sm text-gray-500">
                        Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded">
                    {invite.status}
                  </span>
                  <button
                    onClick={() => cancelInvite(invite.id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
          How Invitations Work
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="font-medium text-slate-700 dark:text-slate-300 text-sm">For Members</h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• Can view and add shared expenses</li>
              <li>• Can contribute to shared goals</li>
              <li>• Can participate in expense splitting</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium text-slate-700 dark:text-slate-300 text-sm">For Viewers</h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• Can only view shared finances</li>
              <li>• Cannot add or modify data</li>
              <li>• Read-only access</li>
            </ul>
          </div>
        </div>
      </div>

      {onClose && (
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default VaultInvitation;
