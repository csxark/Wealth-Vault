/**
 * Alert Notification Service
 * Generates and manages alerts for recurring bills, subscriptions, and payment issues
 * Supports multiple notification channels and escalation
 * 
 * Issue #663: Recurring Transactions & Bill Tracking
 */

const { parseISO, differenceInDays, addDays, format, startOfDay } = require('date-fns');

class AlertNotificationService {
    /**
     * Alert Types
     */
    static ALERT_TYPE = {
        BILL_UPCOMING: 'upcoming',         // Bill due soon
        BILL_OVERDUE: 'overdue',           // Bill past due date
        DUPLICATE_DETECTED: 'duplicate',   // Possible duplicate detected
        PAYMENT_FAILED: 'payment_failed',  // Payment attempt failed
        PAYMENT_SKIPPED: 'payment_skipped',// Payment was skipped
        SUBSCRIPTION_RENEWAL: 'renewal',   // Subscription renewing soon
        SUBSCRIPTION_ISSUE: 'subscription_issue',
        AUTO_DETECTED: 'auto_detected',    // New pattern auto-detected
        ACCOUNT_VERIFICATION: 'account_verification',
    };

    /**
     * Alert Severity Levels
     */
    static SEVERITY = {
        CRITICAL: 'critical',  // Requires immediate action (overdue 30+ days)
        HIGH: 'high',          // Needs attention soon (overdue 7-30 days)
        MEDIUM: 'medium',      // Should address (due in 1-7 days)
        LOW: 'low',            // FYI (due in 8+ days, auto-detected)
    };

    /**
     * Allowed notification channels
     */
    static CHANNELS = {
        EMAIL: 'email',
        PUSH: 'push',
        SMS: 'sms',
        IN_APP: 'in_app',
    };

    /**
     * Generate alerts for a bill
     * @param {Object} bill - Bill to generate alert for
     * @param {Object} recurringTransaction - Parent recurring transaction
     * @returns {Array} Generated alerts
     */
    static generateBillAlerts(bill, recurringTransaction) {
        const alerts = [];
        const today = startOfDay(new Date());
        const dueDate = startOfDay(parseISO(bill.dueDate));
        const daysTilDue = differenceInDays(dueDate, today);

        // Don't generate alerts for already handled bills
        if (bill.status === 'paid' || bill.status === 'skipped') {
            return alerts;
        }

        // Overdue alert
        if (daysTilDue < 0) {
            const daysOverdue = Math.abs(daysTilDue);
            alerts.push({
                userId: bill.userId,
                vaultId: bill.vaultId,
                recurringTransactionId: bill.recurringTransactionId,
                alertType: this.ALERT_TYPE.BILL_OVERDUE,
                severity: daysOverdue > 30 ? this.SEVERITY.CRITICAL :
                          daysOverdue > 7 ? this.SEVERITY.HIGH :
                          this.SEVERITY.MEDIUM,
                message: `Bill from ${recurringTransaction.merchant} is ${daysOverdue} day(s) overdue. Amount: $${bill.amount}`,
                dueDate: bill.dueDate,
                billAmount: bill.amount,
                isRead: false,
                isResolved: false,
                createdAt: new Date(),
            });
        }

        // Upcoming bill alert
        else if (daysTilDue <= 7 && daysTilDue > 0) {
            alerts.push({
                userId: bill.userId,
                vaultId: bill.vaultId,
                recurringTransactionId: bill.recurringTransactionId,
                alertType: this.ALERT_TYPE.BILL_UPCOMING,
                severity: daysTilDue <= 3 ? this.SEVERITY.HIGH :
                          daysTilDue <= 5 ? this.SEVERITY.MEDIUM :
                          this.SEVERITY.LOW,
                message: `Bill from ${recurringTransaction.merchant} due in ${daysTilDue} day(s). Amount: $${bill.amount}`,
                dueDate: bill.dueDate,
                billAmount: bill.amount,
                isRead: false,
                isResolved: false,
                createdAt: new Date(),
            });
        }

        return alerts;
    }

    /**
     * Generate alerts for subscription renewals
     * @param {Object} subscription - Subscription to check
     * @param {String} userId - User ID
     * @returns {Object|null} Renewal alert if applicable
     */
    static generateRenewalAlert(subscription, userId) {
        const today = startOfDay(new Date());
        const renewalDate = startOfDay(parseISO(subscription.renewalDate));
        const daysUntilRenewal = differenceInDays(renewalDate, today);

        // Only alert if renewal is within 14 days
        if (daysUntilRenewal > 14 || daysUntilRenewal < 0) {
            return null;
        }

        let severity = this.SEVERITY.LOW;
        let message = '';

        if (daysUntilRenewal < 0) {
            severity = this.SEVERITY.HIGH;
            message = `${subscription.serviceProvider} renewal was ${Math.abs(daysUntilRenewal)} day(s) ago`;
        } else if (daysUntilRenewal === 0) {
            severity = this.SEVERITY.HIGH;
            message = `${subscription.serviceProvider} renewing today`;
        } else if (daysUntilRenewal <= 3) {
            severity = this.SEVERITY.MEDIUM;
            message = `${subscription.serviceProvider} renewing in ${daysUntilRenewal} day(s)`;
        } else if (daysUntilRenewal <= 7) {
            severity = this.SEVERITY.MEDIUM;
            message = `${subscription.serviceProvider} renews in ${daysUntilRenewal} day(s)`;
        } else {
            severity = this.SEVERITY.LOW;
            message = `${subscription.serviceProvider} renewal reminder: renews in ${daysUntilRenewal} day(s)`;
        }

        return {
            userId: userId,
            recurringTransactionId: subscription.recurringTransactionId,
            alertType: this.ALERT_TYPE.SUBSCRIPTION_RENEWAL,
            severity: severity,
            message: message,
            dueDate: subscription.renewalDate,
            billAmount: subscription.estimatedYearlyValue / 12, // Monthly equivalent
            isRead: false,
            isResolved: false,
            createdAt: new Date(),
        };
    }

    /**
     * Generate duplicate detection alert
     * @param {Object} duplicate - Duplicate record from detector
     * @param {String} userId - User ID
     * @param {String} vaultId - Vault ID
     * @returns {Object} Duplicate alert
     */
    static generateDuplicateAlert(duplicate, userId, vaultId) {
        return {
            userId: userId,
            vaultId: vaultId,
            alertType: this.ALERT_TYPE.DUPLICATE_DETECTED,
            severity: this.SEVERITY.HIGH,
            message: `Potential duplicate subscription detected: ${duplicate.reason}. Confidence: ${duplicate.confidenceScore}%`,
            isRead: false,
            isResolved: false,
            createdAt: new Date(),
            duplicateData: {
                primaryId: duplicate.primaryId,
                secondaryId: duplicate.secondaryId,
                confidenceScore: duplicate.confidenceScore,
            },
        };
    }

    /**
     * Generate alert for failed payment
     * @param {Object} bill - Bill with failed payment
     * @param {Object} recurringTransaction - Parent transaction
     * @param {String} userId - User ID
     * @returns {Object} Payment failed alert
     */
    static generatePaymentFailedAlert(bill, recurringTransaction, userId) {
        return {
            userId: userId,
            vaultId: bill.vaultId,
            recurringTransactionId: bill.recurringTransactionId,
            alertType: this.ALERT_TYPE.PAYMENT_FAILED,
            severity: this.SEVERITY.HIGH,
            message: `Payment failed for ${recurringTransaction.merchant}. Amount: $${bill.amount}. Please retry payment.`,
            dueDate: bill.dueDate,
            billAmount: bill.amount,
            isRead: false,
            isResolved: false,
            createdAt: new Date(),
        };
    }

    /**
     * Generate alert for auto-detected transaction
     * @param {Object} pattern - Detected recurring pattern
     * @param {String} userId - User ID
     * @param {String} vaultId - Vault ID
     * @returns {Object} Auto-detection alert
     */
    static generateAutoDetectionAlert(pattern, userId, vaultId) {
        return {
            userId: userId,
            vaultId: vaultId,
            alertType: this.ALERT_TYPE.AUTO_DETECTED,
            severity: pattern.confidenceScore >= 80 ? this.SEVERITY.MEDIUM : this.SEVERITY.LOW,
            message: `Recurring transaction detected: ${pattern.transactionName} - $${pattern.amount} ${pattern.frequency}. Confidence: ${pattern.confidenceScore}%`,
            isRead: false,
            isResolved: false,
            createdAt: new Date(),
            patternData: {
                merchant: pattern.merchant,
                amount: pattern.amount,
                frequency: pattern.frequency,
                confidenceScore: pattern.confidenceScore,
            },
        };
    }

    /**
     * Generate alerts for subscription risks
     * @param {Object} subscription - At-risk subscription
     * @param {String} userId - User ID
     * @returns {Array} Risk alerts
     */
    static generateSubscriptionRiskAlerts(subscription, userId) {
        const alerts = [];

        // Auto-renewal disabled alert
        if (!subscription.autoRenewal) {
            alerts.push({
                userId: userId,
                recurringTransactionId: subscription.recurringTransactionId,
                alertType: this.ALERT_TYPE.SUBSCRIPTION_ISSUE,
                severity: this.SEVERITY.MEDIUM,
                message: `${subscription.serviceProvider} has auto-renewal disabled. Manual renewal required on ${format(parseISO(subscription.renewalDate), 'MMM dd, yyyy')}`,
                isRead: false,
                isResolved: false,
                createdAt: new Date(),
            });
        }

        return alerts;
    }

    /**
     * Filter alerts based on criteria
     * @param {Array} alerts - Alerts to filter
     * @param {Object} criteria - Filter criteria
     * @returns {Array} Filtered alerts
     */
    static filterAlerts(alerts, criteria = {}) {
        const {
            userId = null,
            alertType = null,
            severity = null,
            isRead = null,
            isResolved = null,
            startDate = null,
            endDate = null,
        } = criteria;

        return alerts.filter(alert => {
            if (userId && alert.userId !== userId) return false;
            if (alertType && alert.alertType !== alertType) return false;
            if (severity && alert.severity !== severity) return false;
            if (isRead !== null && alert.isRead !== isRead) return false;
            if (isResolved !== null && alert.isResolved !== isResolved) return false;

            if (startDate || endDate) {
                const alertDate = new Date(alert.createdAt);
                if (startDate && alertDate < new Date(startDate)) return false;
                if (endDate && alertDate > new Date(endDate)) return false;
            }

            return true;
        });
    }

    /**
     * Get alert summary for user
     * @param {Array} alerts - User's alerts
     * @returns {Object} Summary statistics
     */
    static getAlertSummary(alerts) {
        return {
            total: alerts.length,
            unread: alerts.filter(a => !a.isRead).length,
            unresolved: alerts.filter(a => !a.isResolved).length,
            byCritical: alerts.filter(a => a.severity === this.SEVERITY.CRITICAL).length,
            byHigh: alerts.filter(a => a.severity === this.SEVERITY.HIGH).length,
            byMedium: alerts.filter(a => a.severity === this.SEVERITY.MEDIUM).length,
            byLow: alerts.filter(a => a.severity === this.SEVERITY.LOW).length,
            byType: {
                overdue: alerts.filter(a => a.alertType === this.ALERT_TYPE.BILL_OVERDUE).length,
                upcoming: alerts.filter(a => a.alertType === this.ALERT_TYPE.BILL_UPCOMING).length,
                duplicate: alerts.filter(a => a.alertType === this.ALERT_TYPE.DUPLICATE_DETECTED).length,
                paymentFailed: alerts.filter(a => a.alertType === this.ALERT_TYPE.PAYMENT_FAILED).length,
                renewal: alerts.filter(a => a.alertType === this.ALERT_TYPE.SUBSCRIPTION_RENEWAL).length,
                autoDetected: alerts.filter(a => a.alertType === this.ALERT_TYPE.AUTO_DETECTED).length,
            },
        };
    }

    /**
     * Determine notification channels for alert
     * @param {Object} alert - Alert to send
     * @param {Object} userPreferences - User notification preferences
     * @returns {Array} Notification channels
     */
    static determineNotificationChannels(alert, userPreferences = {}) {
        const {
            emailEnabled = true,
            pushEnabled = true,
            smsEnabled = false,
            inAppEnabled = true,
        } = userPreferences;

        const channels = [];

        // Critical and high severity get multiple channels
        if (alert.severity === this.SEVERITY.CRITICAL || alert.severity === this.SEVERITY.HIGH) {
            if (emailEnabled) channels.push(this.CHANNELS.EMAIL);
            if (pushEnabled) channels.push(this.CHANNELS.PUSH);
            if (smsEnabled && alert.severity === this.SEVERITY.CRITICAL) {
                channels.push(this.CHANNELS.SMS); // SMS only for critical
            }
            if (inAppEnabled) channels.push(this.CHANNELS.IN_APP);
        }

        // Medium severity gets email and in-app
        else if (alert.severity === this.SEVERITY.MEDIUM) {
            if (emailEnabled) channels.push(this.CHANNELS.EMAIL);
            if (inAppEnabled) channels.push(this.CHANNELS.IN_APP);
        }

        // Low severity gets in-app only
        else {
            if (inAppEnabled) channels.push(this.CHANNELS.IN_APP);
        }

        return channels.length > 0 ? channels : [this.CHANNELS.IN_APP];
    }

    /**
     * Mark alert as read
     * @param {Object} alert - Alert to mark
     * @returns {Object} Updated alert
     */
    static markAsRead(alert) {
        return {
            ...alert,
            isRead: true,
            readAt: new Date(),
        };
    }

    /**
     * Mark alert as resolved
     * @param {Object} alert - Alert to resolve
     * @param {String} action - Action taken to resolve
     * @returns {Object} Updated alert
     */
    static markAsResolved(alert, action = null) {
        return {
            ...alert,
            isResolved: true,
            resolvedAt: new Date(),
            resolvedAction: action,
        };
    }

    /**
     * Get escalation path for alert
     * Returns recommended actions based on alert type and severity
     * @param {Object} alert - Alert to escalate
     * @returns {Array} Escalation steps
     */
    static getEscalationPath(alert) {
        const escalations = {
            [this.ALERT_TYPE.BILL_OVERDUE]: [
                {
                    level: 1,
                    action: 'Mark payment as pending',
                    days: 0,
                },
                {
                    level: 2,
                    action: 'Send payment reminder',
                    days: 7,
                },
                {
                    level: 3,
                    action: 'Flag for manual review',
                    days: 14,
                },
                {
                    level: 4,
                    action: 'Escalate to collections',
                    days: 30,
                },
            ],
            [this.ALERT_TYPE.PAYMENT_FAILED]: [
                {
                    level: 1,
                    action: 'Retry payment automatically',
                    days: 1,
                },
                {
                    level: 2,
                    action: 'Send payment failure notification',
                    days: 0,
                },
                {
                    level: 3,
                    action: 'Request manual payment confirmation',
                    days: 2,
                },
                {
                    level: 4,
                    action: 'Suspend service access',
                    days: 5,
                },
            ],
            [this.ALERT_TYPE.DUPLICATE_DETECTED]: [
                {
                    level: 1,
                    action: 'Request user confirmation',
                    days: 0,
                },
                {
                    level: 2,
                    action: 'Send duplicate alert reminder',
                    days: 3,
                },
                {
                    level: 3,
                    action: 'Flag for manual investigation',
                    days: 7,
                },
            ],
        };

        return escalations[alert.alertType] || [];
    }

    /**
     * Batch generate alerts for all bills and subscriptions
     * @param {Array} bills - Bills to process
     * @param {Array} recurringTransactions - Recurring transactions
     * @param {Array} subscriptions - Subscriptions
     * @param {String} userId - User ID
     * @param {String} vaultId - Vault ID
     * @returns {Array} All generated alerts
     */
    static generateBatchAlerts(bills, recurringTransactions, subscriptions, userId, vaultId) {
        const alerts = [];

        // Generate bill alerts
        for (const bill of bills) {
            const recurring = recurringTransactions.find(r => r.id === bill.recurringTransactionId);
            if (recurring) {
                alerts.push(...this.generateBillAlerts(bill, recurring));
            }
        }

        // Generate subscription renewal alerts
        for (const subscription of subscriptions) {
            const renewalAlert = this.generateRenewalAlert(subscription, userId);
            if (renewalAlert) {
                alerts.push(renewalAlert);
            }
        }

        return alerts;
    }

    /**
     * Export alerts to JSON
     * @param {Array} alerts - Alerts to export
     * @returns {string} JSON export
     */
    static exportToJSON(alerts) {
        return JSON.stringify({
            exportDate: new Date().toISOString(),
            alertCount: alerts.length,
            alerts: alerts.map(alert => ({
                ...alert,
                createdAt: alert.createdAt.toISOString(),
            })),
        }, null, 2);
    }

    /**
     * Export alerts to CSV
     * @param {Array} alerts - Alerts to export
     * @returns {string} CSV export
     */
    static exportToCSV(alerts) {
        const headers = ['Created', 'Type', 'Severity', 'Message', 'Status'];
        const rows = alerts.map(alert => [
            format(parseISO(alert.createdAt), 'yyyy-MM-dd HH:mm'),
            alert.alertType,
            alert.severity,
            alert.message,
            alert.isResolved ? 'Resolved' : alert.isRead ? 'Read' : 'Unread',
        ]);

        return [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
    }
}

module.exports = AlertNotificationService;
