/**
 * Credit Utilization Alert Engine Service (Final Extension)
 * Adds: user segmentation, predictive analytics, milestone tracking, and audit log generation.
 * Author: Ayaanshaikh12243
 * Date: 2026-03-04
 */

class CreditUtilizationAlertEngineService {
    constructor(creditAccounts, options = {}) {
        this.creditAccounts = creditAccounts || [];
        this.options = options;
        this.utilizationThreshold = options.utilizationThreshold || 0.3;
        this.scoreModel = options.scoreModel || 'basic';
        this.analysisResults = null;
        this.scoreSimulation = null;
        this.alerts = null;
        this.paydownRecommendations = null;
        this.usageOptimizationTips = null;
        this.trendData = null;
        this.reportData = null;
    }

    /**
     * Main entry point: runs full analysis and alerting
     */
    runAnalysis() {
        this.analysisResults = this.analyzeUtilization();
        this.scoreSimulation = this.simulateScoreImpact();
        this.alerts = this.generateAlerts();
        this.paydownRecommendations = this.recommendPaydownStrategies();
        this.usageOptimizationTips = this.recommendUsageOptimization();
        this.trendData = this.generateTrendData();
        this.reportData = this.generateReportData();
        return {
            analysis: this.analysisResults,
            scoreSimulation: this.scoreSimulation,
            alerts: this.alerts,
            paydownRecommendations: this.paydownRecommendations,
            usageOptimizationTips: this.usageOptimizationTips,
            trends: this.trendData,
            report: this.reportData,
            summary: this.generateSummary()
        };
    }

    /**
     * Analyze credit utilization rates for each account and overall
     */
    analyzeUtilization() {
        let totalLimit = 0;
        let totalBalance = 0;
        const results = this.creditAccounts.map(account => {
            const utilizationRate = account.balance / account.limit;
            totalLimit += account.limit;
            totalBalance += account.balance;
            return {
                accountId: account.accountId,
                name: account.name,
                limit: account.limit,
                balance: account.balance,
                utilizationRate
            };
        });
        const overallUtilization = totalBalance / totalLimit;
        return { accounts: results, overallUtilization };
    }

    /**
     * Simulate credit score impact based on utilization
     */
    simulateScoreImpact() {
        // Basic model: score drops as utilization increases
        return this.analysisResults.accounts.map(account => {
            let impact = 0;
            if (account.utilizationRate > 0.3) impact -= 10;
            if (account.utilizationRate > 0.5) impact -= 20;
            if (account.utilizationRate > 0.7) impact -= 35;
            return {
                accountId: account.accountId,
                utilizationRate: account.utilizationRate,
                scoreImpact: impact
            };
        });
    }

    /**
     * Generate alerts for accounts exceeding utilization threshold
     */
    generateAlerts() {
        return this.analysisResults.accounts.filter(account => account.utilizationRate > this.utilizationThreshold).map(account => ({
            accountId: account.accountId,
            name: account.name,
            message: `Utilization rate for ${account.name} exceeds recommended threshold (${Math.round(account.utilizationRate * 100)}%).`
        }));
    }

    /**
     * Recommend paydown strategies for high utilization accounts
     */
    recommendPaydownStrategies() {
        return this.analysisResults.accounts.filter(account => account.utilizationRate > this.utilizationThreshold).map(account => (
            `Pay down ${account.name} to below ${Math.round(this.utilizationThreshold * 100)}% utilization to improve your credit score.`
        ));
    }

    /**
     * Recommend optimal usage patterns
     */
    recommendUsageOptimization() {
        const tips = [];
        const highUtilizationAccounts = this.analysisResults.accounts.filter(account => account.utilizationRate > this.utilizationThreshold);
        if (highUtilizationAccounts.length > 1) {
            tips.push('Distribute balances across multiple cards to lower individual utilization rates.');
        }
        if (this.analysisResults.overallUtilization > this.utilizationThreshold) {
            tips.push('Consider requesting credit limit increases to reduce overall utilization.');
        }
        tips.push('Pay balances before statement dates to keep reported utilization low.');
        return tips;
    }

    /**
     * Generate trend data for utilization over time
     */
    generateTrendData() {
        // Simulate trend data for demonstration
        return this.creditAccounts.map(account => ({
            accountId: account.accountId,
            name: account.name,
            utilizationTrend: this.simulateTrend(account)
        }));
    }

    /**
     * Generate report data for frontend (e.g., charts)
     */
    generateReportData() {
        // Example: utilization by account
        return this.analysisResults.accounts.map(account => ({
            accountId: account.accountId,
            name: account.name,
            utilizationRate: account.utilizationRate
        }));
    }

    /**
     * Generate overall summary
     */
    generateSummary() {
        const totalAccounts = this.creditAccounts.length;
        const highUtilizationAccounts = this.analysisResults.accounts.filter(account => account.utilizationRate > this.utilizationThreshold).length;
        return {
            totalAccounts,
            highUtilizationAccounts,
            recommendations: this.paydownRecommendations.concat(this.usageOptimizationTips)
        };
    }

    /**
     * Helper: Simulate utilization trend
     */
    simulateTrend(account) {
        // Simulate trend as array of monthly utilization rates
        const months = 6;
        const base = account.utilizationRate;
        const trend = [];
        for (let i = 0; i < months; i++) {
            const rate = Math.max(0, Math.min(1, base + (Math.random() - 0.5) * 0.1));
            trend.push({ month: i + 1, rate });
        }
        return trend;
    }

    /**
     * Analyze account types (e.g., revolving, installment)
     */
    analyzeAccountTypes() {
        const types = {};
        for (const account of this.creditAccounts) {
            const type = account.type || 'revolving';
            if (!types[type]) types[type] = { type, totalLimit: 0, totalBalance: 0, count: 0 };
            types[type].totalLimit += account.limit;
            types[type].totalBalance += account.balance;
            types[type].count += 1;
        }
        return types;
    }

    /**
     * Forecast future utilization using simple regression
     */
    forecastUtilization(accountId) {
        const account = this.creditAccounts.find(a => a.accountId === accountId);
        if (!account || !account.utilizationHistory || account.utilizationHistory.length < 2) return { accountId, forecast: 'Insufficient data' };
        // Linear regression on utilization history
        const x = account.utilizationHistory.map((_, i) => i);
        const y = account.utilizationHistory;
        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
        const sumX2 = x.reduce((a, b) => a + b * b, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        const nextIndex = n;
        const predictedRate = slope * nextIndex + intercept;
        return { accountId, forecastedUtilization: predictedRate };
    }

    /**
     * Generate personalized alerts (e.g., approaching limit, payment reminders)
     */
    generatePersonalizedAlerts() {
        const alerts = [];
        for (const account of this.creditAccounts) {
            if (account.balance > account.limit * 0.9) {
                alerts.push({ accountId: account.accountId, type: 'limit', message: `Balance for ${account.name} is approaching credit limit.` });
            }
            if (account.paymentDue && new Date(account.paymentDue) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) {
                alerts.push({ accountId: account.accountId, type: 'payment', message: `Payment due soon for ${account.name}.` });
            }
        }
        return alerts;
    }

    /**
     * Stub: Integrate with external credit score APIs (e.g., Experian, TransUnion)
     */
    async fetchExternalScore(accountId) {
        // Placeholder for real API call
        // In production, use fetch/axios to get scores
        return { accountId, score: 720, source: 'Experian' };
    }

    /**
     * Generate custom reports (summary, detailed, forecast)
     */
    generateCustomReport(type = 'summary') {
        if (type === 'summary') {
            return this.generateSummary();
        } else if (type === 'detailed') {
            return {
                accounts: this.creditAccounts,
                analysis: this.analysisResults,
                scoreSimulation: this.scoreSimulation,
                accountTypes: this.analyzeAccountTypes()
            };
        } else if (type === 'forecast') {
            return {
                forecasts: this.creditAccounts.map(a => this.forecastUtilization(a.accountId))
            };
        }
        return {};
    }

    /**
     * Segment users by utilization patterns and risk
     */
    segmentUsers() {
        const segments = { highRisk: [], moderateRisk: [], lowRisk: [] };
        for (const account of this.creditAccounts) {
            const rate = account.balance / account.limit;
            if (rate > 0.7) segments.highRisk.push(account.accountId);
            else if (rate > 0.3) segments.moderateRisk.push(account.accountId);
            else segments.lowRisk.push(account.accountId);
        }
        return segments;
    }

    /**
     * Predict future user behavior using regression
     */
    predictUserBehavior(accountId) {
        const account = this.creditAccounts.find(a => a.accountId === accountId);
        if (!account || !account.utilizationHistory || account.utilizationHistory.length < 2) return { accountId, prediction: 'Insufficient data' };
        // Linear regression on utilization history
        const x = account.utilizationHistory.map((_, i) => i);
        const y = account.utilizationHistory;
        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
        const sumX2 = x.reduce((a, b) => a + b * b, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        const nextIndex = n;
        const predictedRate = slope * nextIndex + intercept;
        return { accountId, predictedNextUtilization: predictedRate };
    }

    /**
     * Track user milestones (e.g., utilization improvement, risk reduction)
     */
    trackUserMilestones() {
        const milestones = [];
        for (const account of this.creditAccounts) {
            const rate = account.balance / account.limit;
            if (rate < 0.3) milestones.push({ accountId: account.accountId, type: 'improvement', message: `Utilization for ${account.name} is now below 30%.` });
            if (rate > 0.7) milestones.push({ accountId: account.accountId, type: 'risk', message: `Utilization for ${account.name} is above 70%.` });
        }
        return milestones;
    }

    /**
     * Generate audit log for all utilization checks
     */
    generateAuditLog() {
        return this.creditAccounts.map(account => ({
            timestamp: new Date().toISOString(),
            accountId: account.accountId,
            action: 'utilizationCheck',
            details: account
        }));
    }

    /**
     * Final runAnalysis with all features
     */
    runUltimateAnalysis() {
        const full = this.runFullAnalysis();
        return {
            ...full,
            userSegments: this.segmentUsers(),
            userPredictions: this.creditAccounts.map(a => this.predictUserBehavior(a.accountId)),
            userMilestones: this.trackUserMilestones(),
            auditLog: this.generateAuditLog()
        };
    }
}

module.exports = CreditUtilizationAlertEngineService;
