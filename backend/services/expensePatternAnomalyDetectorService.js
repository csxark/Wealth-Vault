import { and, asc, eq, gte } from 'drizzle-orm';
import db from '../config/db.js';
import { expenses } from '../db/schema.js';

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, decimals = 2) => {
    const factor = 10 ** decimals;
    return Math.round((toNumber(value, 0) + Number.EPSILON) * factor) / factor;
};

const mean = (arr) => (arr.length ? arr.reduce((sum, n) => sum + n, 0) / arr.length : 0);

const stdDev = (arr) => {
    if (arr.length <= 1) return 0;
    const m = mean(arr);
    const variance = arr.reduce((sum, n) => sum + ((n - m) ** 2), 0) / arr.length;
    return Math.sqrt(variance);
};

const median = (arr) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
};

const sensitivityThreshold = (sensitivity) => {
    const normalized = String(sensitivity || 'medium').toLowerCase();
    if (normalized === 'low') return 3.3;
    if (normalized === 'high') return 2.2;
    return 2.8;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function kmeans1D(values, k = 3, iterations = 12) {
    if (!values.length) return { centroids: [], assignments: [] };

    const sorted = [...values].sort((a, b) => a - b);
    const safeK = Math.max(1, Math.min(k, sorted.length));
    const centroids = [];

    for (let i = 0; i < safeK; i += 1) {
        const idx = Math.floor((i / safeK) * (sorted.length - 1));
        centroids.push(sorted[idx]);
    }

    let assignments = new Array(values.length).fill(0);

    for (let iter = 0; iter < iterations; iter += 1) {
        assignments = values.map((v) => {
            let best = 0;
            let bestDistance = Infinity;
            for (let i = 0; i < centroids.length; i += 1) {
                const distance = Math.abs(v - centroids[i]);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = i;
                }
            }
            return best;
        });

        for (let i = 0; i < centroids.length; i += 1) {
            const clusterValues = values.filter((_, idx) => assignments[idx] === i);
            if (clusterValues.length) centroids[i] = mean(clusterValues);
        }
    }

    return { centroids, assignments };
}

class ExpensePatternAnomalyDetectorService {
    async fetchUserExpenses(userId, tenantId, options = {}) {
        const lookbackDays = clamp(Math.round(toNumber(options.lookbackDays, 180)), 30, 730);
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - lookbackDays);

        const conditions = [eq(expenses.userId, userId), gte(expenses.date, fromDate)];
        if (tenantId) conditions.push(eq(expenses.tenantId, tenantId));

        return db.query.expenses.findMany({
            where: and(...conditions),
            orderBy: [asc(expenses.date)]
        });
    }

    normalizeExpenses(rawExpenses = []) {
        return (rawExpenses || [])
            .map((item, index) => ({
                id: item.id || `local_${index + 1}`,
                amount: Math.max(0, toNumber(item.amount, 0)),
                date: new Date(item.date),
                categoryId: item.categoryId || item.category || 'uncategorized',
                description: String(item.description || '').trim() || 'Expense'
            }))
            .filter((item) => Number.isFinite(item.amount) && item.amount >= 0 && !Number.isNaN(item.date.getTime()));
    }

    buildSeasonality(expenseRows) {
        const amounts = expenseRows.map((e) => e.amount);
        const overallMean = mean(amounts) || 1;

        const byMonth = {};
        for (const row of expenseRows) {
            const month = row.date.getMonth();
            byMonth[month] = byMonth[month] || [];
            byMonth[month].push(row.amount);
        }

        const monthFactors = {};
        for (let m = 0; m < 12; m += 1) {
            if (!byMonth[m] || byMonth[m].length < 3) {
                monthFactors[m] = 1;
            } else {
                monthFactors[m] = mean(byMonth[m]) / overallMean;
            }
        }

        return { overallMean, monthFactors };
    }

    classifyAnomaly(row, metrics) {
        const { globalScore, categoryScore, seasonalDeviation, amountMedian } = metrics;
        if (seasonalDeviation >= 1.2) return 'seasonal_outlier';
        if (row.amount <= amountMedian * 0.35 && globalScore >= 2.5) return 'sudden_drop';
        if (categoryScore >= 2.8) return 'category_outlier';
        if (globalScore >= 3.2) return 'suspicious_spike';
        return 'pattern_outlier';
    }

    buildAlerts(anomalies, context) {
        if (!anomalies.length) {
            return [{
                type: 'info',
                message: 'No significant expense anomalies detected for the selected period.'
            }];
        }

        const suspiciousCount = anomalies.filter((a) => a.type === 'suspicious_spike').length;
        const seasonalCount = anomalies.filter((a) => a.type === 'seasonal_outlier').length;
        const dropCount = anomalies.filter((a) => a.type === 'sudden_drop').length;

        const alerts = [{
            type: 'warning',
            message: `${anomalies.length} anomalies detected across ${context.transactionCount} expenses.`,
            action: 'Review flagged transactions and confirm expected vs unexpected spending.'
        }];

        if (suspiciousCount > 0) {
            alerts.push({
                type: 'critical',
                message: `${suspiciousCount} transaction(s) look suspicious due to unusual spikes.`,
                action: 'Verify merchant legitimacy and payment method activity immediately.'
            });
        }

        if (seasonalCount > 0) {
            alerts.push({
                type: 'advice',
                message: `${seasonalCount} seasonal outlier(s) detected.`,
                action: 'Adjust category budgets for upcoming seasonal months.'
            });
        }

        if (dropCount > 0) {
            alerts.push({
                type: 'advice',
                message: `${dropCount} sharp spending drop(s) detected.`,
                action: 'Confirm whether reduced activity is intentional or missing transactions.'
            });
        }

        return alerts;
    }

    detect(expenseRows, options = {}) {
        const normalized = this.normalizeExpenses(expenseRows);
        if (normalized.length < 15) {
            return {
                success: true,
                summary: {
                    transactionCount: normalized.length,
                    anomalyCount: 0,
                    message: 'Insufficient data. At least 15 transactions are recommended.'
                },
                anomalies: [],
                alerts: [{
                    type: 'info',
                    message: 'Add more history to improve anomaly detection quality.'
                }]
            };
        }

        const threshold = sensitivityThreshold(options.sensitivity);
        const minAmount = Math.max(0, toNumber(options.minAmount, 0));
        const includeSeasonality = options.includeSeasonality !== false;

        const amounts = normalized.map((r) => r.amount);
        const amountMedian = median(amounts);
        const amountStd = stdDev(amounts) || 1;
        const categoryGroups = normalized.reduce((acc, row) => {
            acc[row.categoryId] = acc[row.categoryId] || [];
            acc[row.categoryId].push(row.amount);
            return acc;
        }, {});

        const seasonality = includeSeasonality ? this.buildSeasonality(normalized) : null;
        const { centroids, assignments } = kmeans1D(amounts, 3, 10);
        const clusterSpread = centroids.map((_, clusterIdx) => {
            const values = amounts.filter((_, i) => assignments[i] === clusterIdx);
            return stdDev(values) || 1;
        });

        const anomalies = [];
        for (let i = 0; i < normalized.length; i += 1) {
            const row = normalized[i];
            if (row.amount < minAmount) continue;

            const globalScore = Math.abs(row.amount - amountMedian) / amountStd;

            const catValues = categoryGroups[row.categoryId] || [];
            const catMean = mean(catValues);
            const catStd = stdDev(catValues) || 1;
            const categoryScore = catValues.length >= 5 ? Math.abs(row.amount - catMean) / catStd : 0;

            let seasonalDeviation = 0;
            if (seasonality) {
                const monthFactor = seasonality.monthFactors[row.date.getMonth()] || 1;
                const expected = Math.max(1, seasonality.overallMean * monthFactor);
                seasonalDeviation = Math.abs(row.amount - expected) / expected;
            }

            const clusterId = assignments[i];
            const distanceFromCluster = Math.abs(row.amount - centroids[clusterId]) / (clusterSpread[clusterId] || 1);

            const score = (globalScore * 0.45) + (categoryScore * 0.25) + (distanceFromCluster * 0.2) + (seasonalDeviation * 2 * 0.1);
            if (score < threshold) continue;

            const type = this.classifyAnomaly(row, {
                globalScore,
                categoryScore,
                seasonalDeviation,
                amountMedian
            });

            const severity = score >= threshold + 1.8
                ? 'high'
                : score >= threshold + 0.7
                    ? 'medium'
                    : 'low';

            anomalies.push({
                expenseId: row.id,
                date: row.date.toISOString(),
                amount: round(row.amount, 2),
                categoryId: row.categoryId,
                description: row.description,
                type,
                severity,
                anomalyScore: round(score, 3),
                diagnostics: {
                    globalScore: round(globalScore, 3),
                    categoryScore: round(categoryScore, 3),
                    clusterDistance: round(distanceFromCluster, 3),
                    seasonalDeviation: round(seasonalDeviation, 3)
                }
            });
        }

        anomalies.sort((a, b) => b.anomalyScore - a.anomalyScore);

        const summary = {
            transactionCount: normalized.length,
            anomalyCount: anomalies.length,
            anomalyRate: round((anomalies.length / normalized.length) * 100, 2),
            averageAmount: round(mean(amounts), 2),
            medianAmount: round(amountMedian, 2),
            stdDevAmount: round(amountStd, 2),
            sensitivity: String(options.sensitivity || 'medium').toLowerCase()
        };

        return {
            success: true,
            summary,
            anomalies,
            alerts: this.buildAlerts(anomalies, summary)
        };
    }

    async detectForUser(userId, tenantId, options = {}) {
        const sourceExpenses = Array.isArray(options.expenses) && options.expenses.length > 0
            ? options.expenses
            : await this.fetchUserExpenses(userId, tenantId, options);

        return this.detect(sourceExpenses, options);
    }
}

export default new ExpensePatternAnomalyDetectorService();
