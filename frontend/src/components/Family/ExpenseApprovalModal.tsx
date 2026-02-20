import React, { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, Clock, DollarSign } from 'lucide-react';
import api from '../../services/api';

interface ApprovalRequest {
  id: string;
  expenseId: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  metadata: {
    budgetId?: string;
    amount: number;
    category?: string;
  };
  expense: {
    id: string;
    amount: number;
    description: string;
    categoryId: string;
    date: string;
  };
  requester: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface ExpenseApprovalModalProps {
  vaultId: string;
  approvalId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const ExpenseApprovalModal: React.FC<ExpenseApprovalModalProps> = ({
  vaultId,
  approvalId,
  onSuccess,
  onCancel,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (approvalId) {
      fetchApprovalDetails();
    }
  }, [approvalId]);

  const fetchApprovalDetails = async () => {
    try {
      const response = await api.vaults.expenseApprovals.getPending(vaultId);
      const currentApproval = response.data.find((a: ApprovalRequest) => a.id === approvalId);
      if (currentApproval) {
        setApproval(currentApproval);
      }
    } catch (error) {
      console.error('Failed to fetch approval details:', error);
    }
  };

  const handleApproval = async (approved: boolean) => {
    if (!approval) return;

    setIsLoading(true);
    try {
      if (approved) {
        await api.vaults.expenseApprovals.approve(vaultId, approval.id, notes);
      } else {
        await api.vaults.expenseApprovals.reject(vaultId, approval.id, notes);
      }

      alert(`Expense ${approved ? 'approved' : 'rejected'} successfully!`);
      onSuccess?.();
    } catch (error) {
      alert(`Failed to ${approved ? 'approve' : 'reject'} expense`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!approval) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-black dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6">
          <div className="text-center">Loading approval details...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-black dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-t-xl">
          <h2 className="text-xl font-semibold text-white flex items-center">
            <Clock className="h-5 w-5 mr-2" />
            Expense Approval
          </h2>
          <button
            onClick={onCancel}
            className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-slate-900 dark:text-slate-100">
                {approval.expense.description}
              </h3>
              <span className="text-lg font-semibold text-cyan-600 dark:text-cyan-400">
                ${approval.expense.amount.toFixed(2)}
              </span>
            </div>

            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center">
                <span className="font-medium w-20">Date:</span>
                <span>{new Date(approval.expense.date).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center">
                <span className="font-medium w-20">Category:</span>
                <span>{approval.expense.categoryId}</span>
              </div>
              <div className="flex items-center">
                <span className="font-medium w-20">Requested by:</span>
                <span>{approval.requester.firstName} {approval.requester.lastName}</span>
              </div>
              <div className="flex items-center">
                <span className="font-medium w-20">Requested:</span>
                <span>{new Date(approval.requestedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Approval Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Add any notes about this approval decision..."
              rows={3}
            />
          </div>

          <div className="flex space-x-3">
            <button
              onClick={() => handleApproval(false)}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </button>
            <button
              onClick={() => handleApproval(true)}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
