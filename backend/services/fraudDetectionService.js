// Real-Time Fraud Detection System
// Issue #889: Monitor activity, detect anomalies, trigger alerts/blocks

class FraudDetectionService {
    constructor() {
        this.alerts = [];
        this.blockedAccounts = new Set();
        this.cases = [];
        this.amountThreshold = 10000;
        this.frequencyThreshold = 10;
        this.mlModel = null; // Replace with real ML model integration
        this.externalFraudAPIs = [];
        this.userProfiles = {};
        this.deviceProfiles = {};
        this.logHistory = [];
    }

    /**
     * Monitor account activity and detect suspicious transactions
     * @param {Array} transactions - [{ accountId, amount, date, type, location, deviceId }]
     * @returns {Array} Detected anomalies
     */
    monitorTransactions(transactions) {
        const anomalies = [];
        for (const tx of transactions) {
            if (this.isSuspicious(tx)) {
                anomalies.push(tx);
                this.triggerAlert(tx);
                if (this.shouldBlock(tx)) {
                    this.blockAccount(tx.accountId);
                }
            }
        }
        return anomalies;
    }

    /**
     * Advanced anomaly detection (rule-based, ML, statistical)
     */
    isSuspicious(tx) {
        // Rule-based checks
        if (tx.amount > this.amountThreshold) return true;
        if (tx.type === 'withdrawal' && tx.amount > 5000) return true;
        if (tx.location && tx.location !== 'home' && tx.amount > 2000) return true;
        // Statistical anomaly: z-score (stub)
        if (this.userProfiles[tx.accountId]) {
            const avg = this.userProfiles[tx.accountId].avgAmount || 1000;
            const std = this.userProfiles[tx.accountId].stdAmount || 500;
            if (std > 0 && Math.abs(tx.amount - avg) / std > 3) return true;
        }
        // ML model stub (replace with real prediction)
        if (this.mlModel && this.mlModel.predict(tx) > 0.8) return true;
        // Device risk scoring
        if (this.deviceProfiles[tx.deviceId] && this.deviceProfiles[tx.deviceId].riskScore > 0.7) return true;
        return false;
    }

    /**
     * Trigger alert and notification for suspicious transaction
     */
    triggerAlert(tx) {
        const alert = {
            accountId: tx.accountId,
            date: tx.date,
            amount: tx.amount,
            type: tx.type,
            location: tx.location,
            deviceId: tx.deviceId,
            message: 'Suspicious transaction detected',
            notified: false,
        };
        this.alerts.push(alert);
        this.sendNotification(alert);
        this.log('Alert triggered', alert);
        this.openCase(alert);
    }

    /**
     * Send real-time notification (stub)
     */
    sendNotification(alert) {
        alert.notified = true;
        // Integrate with notification system or external service
    }

    /**
     * Open fraud case for review
     */
    openCase(alert) {
        this.cases.push({
            caseId: `CASE-${Date.now()}-${alert.accountId}`,
            alert,
            status: 'open',
            openedAt: new Date().toISOString(),
            reviewHistory: [],
        });
    }

    /**
     * Decide if account should be blocked
     */
    shouldBlock(tx) {
        // Example: block if amount > $20,000 or repeated suspicious activity
        if (tx.amount > 20000) return true;
        const recentAlerts = this.alerts.filter(a => a.accountId === tx.accountId && new Date(a.date) > new Date(Date.now() - 24*60*60*1000));
        if (recentAlerts.length > this.frequencyThreshold) return true;
        return false;
    }

    /**
     * Block account
     */
    blockAccount(accountId) {
        this.blockedAccounts.add(accountId);
    }

    /**
     * Integrate with audit logs
     */
    auditLogIntegration(auditLogs) {
        // Example: scan audit logs for suspicious events
        const suspicious = auditLogs.filter(log => log.eventType === 'unauthorized_access' || log.eventType === 'failed_login');
        suspicious.forEach(log => this.log('Audit log anomaly', log));
        return suspicious;
    }

    /**
     * Integrate with external fraud databases/APIs (stub)
     */
    async externalFraudCheck(tx) {
        // Stub: Replace with real API calls
        for (const api of this.externalFraudAPIs) {
            // await api.check(tx)
        }
        return false;
    }

    /**
     * Get alerts for review
     */
    getAlerts() {
        return this.alerts;
    }

    /**
     * Get open fraud cases
     */
    getOpenCases() {
        return this.cases.filter(c => c.status === 'open');
    }

    /**
     * Review and close fraud case
     */
    closeCase(caseId, reviewer, notes) {
        const caseObj = this.cases.find(c => c.caseId === caseId);
        if (caseObj) {
            caseObj.status = 'closed';
            caseObj.closedAt = new Date().toISOString();
            caseObj.reviewHistory.push({ reviewer, notes, closedAt: caseObj.closedAt });
        }
    }

    /**
     * Get blocked accounts
     */
    getBlockedAccounts() {
        return Array.from(this.blockedAccounts);
    }

    /**
     * Visualization helper for fraud trends
     */
    getFraudTrendData() {
        // Example: group alerts by day
        const trend = {};
        for (const alert of this.alerts) {
            const day = alert.date.slice(0,10);
            trend[day] = (trend[day] || 0) + 1;
        }
        return trend;
    }

    /**
     * Logging utility
     */
    log(message, data = null) {
        this.logHistory.push({ message, data, timestamp: new Date().toISOString() });
        if (data) {
            console.log(`[FraudDetectionService] ${message}`, data);
        } else {
            console.log(`[FraudDetectionService] ${message}`);
        }
    }

    /**
     * Extended unit test
     */
    static extendedTest() {
        const service = new FraudDetectionService();
        service.userProfiles = {
            'A1': { avgAmount: 1000, stdAmount: 500 },
            'A2': { avgAmount: 600, stdAmount: 200 },
        };
        service.deviceProfiles = {
            'D1': { riskScore: 0.8 },
            'D2': { riskScore: 0.2 },
        };
        const mockTx = [
            { accountId: 'A1', amount: 12000, date: '2026-03-05', type: 'withdrawal', location: 'foreign', deviceId: 'D1' },
            { accountId: 'A2', amount: 500, date: '2026-03-05', type: 'deposit', location: 'home', deviceId: 'D2' },
            { accountId: 'A1', amount: 25000, date: '2026-03-05', type: 'transfer', location: 'home', deviceId: 'D1' },
            { accountId: 'A2', amount: 5000, date: '2026-03-05', type: 'withdrawal', location: 'home', deviceId: 'D2' },
        ];
        const anomalies = service.monitorTransactions(mockTx);
        const auditLogs = [
            { eventType: 'unauthorized_access', accountId: 'A1', date: '2026-03-05' },
            { eventType: 'login', accountId: 'A2', date: '2026-03-05' },
        ];
        const suspiciousLogs = service.auditLogIntegration(auditLogs);
        const trend = service.getFraudTrendData();
        service.closeCase(service.cases[0].caseId, 'reviewer1', 'Confirmed fraud, account blocked');
        return {
            anomalies,
            alerts: service.getAlerts(),
            blocked: service.getBlockedAccounts(),
            suspiciousLogs,
            openCases: service.getOpenCases(),
            trend,
            logHistory: service.logHistory,
        };
    }
}

// --- Unit Test Example ---
if (require.main === module) {
    console.log('FraudDetectionService Extended Test Output:');
    const extResult = FraudDetectionService.extendedTest();
    console.dir(extResult, { depth: null });
}

export { FraudDetectionService };
