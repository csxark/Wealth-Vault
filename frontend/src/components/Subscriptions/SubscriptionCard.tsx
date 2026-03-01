import React from 'react';
import { CreditCard, Calendar, Edit3, Trash2, AlertTriangle, CheckCircle, Pause, XCircle, ExternalLink } from 'lucide-react';
import type { Subscription } from '../../services/api';

interface SubscriptionCardProps {
  subscription: Subscription;
  onEdit: (subscription: Subscription) => void;
  onDelete: (subscriptionId: string) => void;
  onCancel?: (subscriptionId: string) => void;
}

export const SubscriptionCard: React.FC<SubscriptionCardProps> = ({
  subscription,
  onEdit,
  onDelete,
  onCancel
}) => {
  const getStatusIcon = () => {
    switch (subscription.status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'expired':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <CreditCard className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusColor = () => {
    switch (subscription.status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'expired':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400';
    }
  };

  const getDaysUntilRenewal = () => {
    if (!subscription.nextChargeDate) return null;
    const days = Math.ceil((new Date(subscription.nextChargeDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const daysUntilRenewal = getDaysUntilRenewal();
  const isUrgent = daysUntilRenewal !== null && daysUntilRenewal <= 7 && daysUntilRenewal > 0;
  const isOverdue = daysUntilRenewal !== null && daysUntilRenewal < 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-2 rounded-lg">
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {subscription.serviceName}
            </h3>
            {subscription.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400">{subscription.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor()}`}>
            {getStatusIcon()}
            <span className="ml-1 capitalize">{subscription.status}</span>
          </span>

          <div className="flex space-x-1">
            {subscription.website && (
              <a
                href={subscription.website}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Visit website"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={() => onEdit(subscription)}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Edit subscription"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDelete(subscription.id)}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              aria-label="Delete subscription"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Cost</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              {subscription.currency} {parseFloat(subscription.cost).toLocaleString()}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-1">
                /{subscription.frequency}
              </span>
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Next Charge</p>
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-1 text-slate-400" />
              <span className={`text-sm font-medium ${
                isOverdue ? 'text-red-600 dark:text-red-400' :
                isUrgent ? 'text-orange-600 dark:text-orange-400' :
                'text-slate-900 dark:text-white'
              }`}>
                {subscription.nextChargeDate ?
                  new Date(subscription.nextChargeDate).toLocaleDateString() :
                  'Not set'
                }
              </span>
            </div>
            {daysUntilRenewal !== null && (
              <p className={`text-xs mt-1 ${
                isOverdue ? 'text-red-600 dark:text-red-400' :
                isUrgent ? 'text-orange-600 dark:text-orange-400' :
                'text-slate-500 dark:text-slate-400'
              }`}>
                {isOverdue ? `${Math.abs(daysUntilRenewal)} days overdue` :
                 daysUntilRenewal === 0 ? 'Due today' :
                 daysUntilRenewal === 1 ? 'Due tomorrow' :
                 `${daysUntilRenewal} days left`}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center space-x-4 text-sm text-slate-600 dark:text-slate-400">
            {subscription.category && (
              <div className="flex items-center">
                <div
                  className="w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: subscription.category.color }}
                />
                <span>{subscription.category.name}</span>
              </div>
            )}
            {subscription.paymentMethod && (
              <span>Paid via {subscription.paymentMethod}</span>
            )}
          </div>

          {subscription.status === 'active' && onCancel && (
            <button
              onClick={() => onCancel(subscription.id)}
              className="px-3 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
            >
              Cancel Subscription
            </button>
          )}
        </div>

        {subscription.isTrial && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 mr-2" />
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Free trial ends {subscription.trialEndDate ? new Date(subscription.trialEndDate).toLocaleDateString() : 'soon'}
              </p>
            </div>
          </div>
        )}

        {isUrgent && subscription.status === 'active' && (
          <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mr-2" />
              <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                Renewal coming up! Review your subscription.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
