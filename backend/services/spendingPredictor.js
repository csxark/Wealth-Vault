import db from '../config/db.js';
import { expenses, categories } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

/**
 * Spending Predictor - ML-based spending forecasting
 * Implements various prediction models
 */
class SpendingPredictor {
    constructor() {
        this.MIN_DATA_POINTS = 3;
    }

    /**
     * Analyze historical spending patterns
     */
    async analyzeHistoricalPatterns(userId, categoryId = null) {
        try {
            // Get last 12 months of data
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 12);

            let query = db.select({
                amount: expenses.amount,
                date: expenses.date,
                categoryId: expenses.categoryId
            })
                .from(expenses)
                .where(
                    and(
                        eq(expenses.userId, userId),
                        gte(expenses.date, startDate)
                    )
                )
                .orderBy(expenses.date);

            if (categoryId) {
                query = query.where(eq(expenses.categoryId, categoryId));
            }

            const transactions = await query;

            if (transactions.length < this.MIN_DATA_POINTS) {
                throw new Error(`Insufficient data: need at least ${this.MIN_DATA_POINTS} transactions`);
            }

            // Group by month
            const monthlyData = this.groupByMonth(transactions);

            // Calculate statistics
            const amounts = monthlyData.map(m => m.total);
            const average = this.calculateAverage(amounts);
            const median = this.calculateMedian(amounts);
            const stdDev = this.calculateStdDev(amounts, average);
            const min = Math.min(...amounts);
            const max = Math.max(...amounts);

            // Detect pattern type
            const patternType = this.detectPatternType(monthlyData);

            // Calculate growth rate
            const growthRate = this.calculateGrowthRate(monthlyData);

            // Calculate seasonality
            const seasonality = this.calculateSeasonality(monthlyData);

            // Detect anomalies
            const anomalies = this.detectAnomalies(transactions, average, stdDev);

            return {
                type: patternType,
                frequency: 'monthly',
                average,
                median,
                stdDev,
                min,
                max,
                growthRate,
                seasonality,
                anomalies,
                dataPoints: transactions.length,
                monthlyData
            };
        } catch (error) {
            console.error('Failed to analyze historical patterns:', error);
            throw error;
        }
    }

    /**
     * Group transactions by month
     */
    groupByMonth(transactions) {
        const monthlyMap = {};

        transactions.forEach(txn => {
            const date = new Date(txn.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!monthlyMap[monthKey]) {
                monthlyMap[monthKey] = {
                    month: monthKey,
                    total: 0,
                    count: 0,
                    transactions: []
                };
            }

            monthlyMap[monthKey].total += parseFloat(txn.amount);
            monthlyMap[monthKey].count += 1;
            monthlyMap[monthKey].transactions.push(txn);
        });

        return Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
    }

    /**
     * Calculate average
     */
    calculateAverage(values) {
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    /**
     * Calculate median
     */
    calculateMedian(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }

    /**
     * Calculate standard deviation
     */
    calculateStdDev(values, average) {
        const squaredDiffs = values.map(val => Math.pow(val - average, 2));
        const variance = this.calculateAverage(squaredDiffs);
        return Math.sqrt(variance);
    }

    /**
     * Detect pattern type
     */
    detectPatternType(monthlyData) {
        if (monthlyData.length < 4) return 'irregular';

        const amounts = monthlyData.map(m => m.total);
        const average = this.calculateAverage(amounts);
        const stdDev = this.calculateStdDev(amounts, average);

        // Check for trend
        const growthRate = this.calculateGrowthRate(monthlyData);
        if (Math.abs(growthRate) > 5) {
            return 'trending';
        }

        // Check for seasonality
        const seasonality = this.calculateSeasonality(monthlyData);
        const hasSeasonality = Object.values(seasonality).some(factor =>
            Math.abs(factor - 1.0) > 0.2
        );

        if (hasSeasonality) {
            return 'seasonal';
        }

        // Check for cyclical pattern
        const coefficientOfVariation = (stdDev / average) * 100;
        if (coefficientOfVariation < 15) {
            return 'cyclical';
        }

        return 'irregular';
    }

    /**
     * Calculate growth rate
     */
    calculateGrowthRate(monthlyData) {
        if (monthlyData.length < 2) return 0;

        const firstHalf = monthlyData.slice(0, Math.floor(monthlyData.length / 2));
        const secondHalf = monthlyData.slice(Math.floor(monthlyData.length / 2));

        const firstAvg = this.calculateAverage(firstHalf.map(m => m.total));
        const secondAvg = this.calculateAverage(secondHalf.map(m => m.total));

        return ((secondAvg - firstAvg) / firstAvg) * 100;
    }

    /**
     * Calculate seasonality factors
     */
    calculateSeasonality(monthlyData) {
        const seasonality = {};
        const monthlyAverages = {};

        // Group by month of year
        monthlyData.forEach(data => {
            const month = parseInt(data.month.split('-')[1]);
            if (!monthlyAverages[month]) {
                monthlyAverages[month] = [];
            }
            monthlyAverages[month].push(data.total);
        });

        // Calculate overall average
        const overallAvg = this.calculateAverage(monthlyData.map(m => m.total));

        // Calculate seasonal factors
        for (let month = 1; month <= 12; month++) {
            if (monthlyAverages[month] && monthlyAverages[month].length > 0) {
                const monthAvg = this.calculateAverage(monthlyAverages[month]);
                seasonality[month] = monthAvg / overallAvg;
            } else {
                seasonality[month] = 1.0;
            }
        }

        return seasonality;
    }

    /**
     * Detect anomalies
     */
    detectAnomalies(transactions, average, stdDev) {
        const threshold = average + (2 * stdDev);
        return transactions
            .filter(txn => parseFloat(txn.amount) > threshold)
            .map(txn => ({
                amount: parseFloat(txn.amount),
                date: txn.date,
                deviation: ((parseFloat(txn.amount) - average) / average) * 100
            }));
    }

    /**
     * Predict category spending using selected model
     */
    async predictCategorySpending(userId, categoryId, monthsAhead = 1, modelType = 'arima') {
        try {
            // Analyze historical patterns
            const patterns = await this.analyzeHistoricalPatterns(userId, categoryId);

            let prediction;

            switch (modelType) {
                case 'arima':
                    prediction = this.arimaPredict(patterns, monthsAhead);
                    break;
                case 'moving_average':
                    prediction = this.movingAveragePredict(patterns, monthsAhead);
                    break;
                case 'prophet':
                    prediction = this.prophetPredict(patterns, monthsAhead);
                    break;
                case 'lstm':
                    prediction = this.lstmPredict(patterns, monthsAhead);
                    break;
                default:
                    prediction = this.movingAveragePredict(patterns, monthsAhead);
            }

            return {
                ...prediction,
                modelType,
                basedOnMonths: patterns.monthlyData.length
            };
        } catch (error) {
            console.error('Failed to predict category spending:', error);
            throw error;
        }
    }

    /**
     * ARIMA-based prediction (simplified)
     */
    arimaPredict(patterns, monthsAhead) {
        const { average, growthRate, seasonality, monthlyData } = patterns;

        // Get current month
        const currentMonth = new Date().getMonth() + 1;
        const targetMonth = ((currentMonth + monthsAhead - 1) % 12) + 1;

        // Apply trend
        const trendFactor = 1 + (growthRate / 100) * (monthsAhead / 12);

        // Apply seasonality
        const seasonalFactor = seasonality[targetMonth] || 1.0;

        // Base prediction
        const baseAmount = average * trendFactor * seasonalFactor;

        // Calculate confidence based on data consistency
        const confidence = this.calculateConfidence(patterns);

        // Calculate bounds
        const variance = patterns.stdDev * Math.sqrt(monthsAhead);
        const upperBound = baseAmount + (1.96 * variance); // 95% confidence interval
        const lowerBound = Math.max(0, baseAmount - (1.96 * variance));

        return {
            amount: Math.round(baseAmount * 100) / 100,
            confidence,
            seasonalFactor,
            trendFactor,
            variance,
            upperBound: Math.round(upperBound * 100) / 100,
            lowerBound: Math.round(lowerBound * 100) / 100
        };
    }

    /**
     * Moving Average prediction
     */
    movingAveragePredict(patterns, monthsAhead) {
        const { monthlyData, seasonality } = patterns;

        // Use last 3 months for moving average
        const recentMonths = monthlyData.slice(-3);
        const movingAvg = this.calculateAverage(recentMonths.map(m => m.total));

        // Apply seasonality
        const currentMonth = new Date().getMonth() + 1;
        const targetMonth = ((currentMonth + monthsAhead - 1) % 12) + 1;
        const seasonalFactor = seasonality[targetMonth] || 1.0;

        const baseAmount = movingAvg * seasonalFactor;

        const confidence = Math.min(0.9, 0.6 + (recentMonths.length / 10));

        const stdDev = this.calculateStdDev(recentMonths.map(m => m.total), movingAvg);
        const upperBound = baseAmount + (1.96 * stdDev);
        const lowerBound = Math.max(0, baseAmount - (1.96 * stdDev));

        return {
            amount: Math.round(baseAmount * 100) / 100,
            confidence,
            seasonalFactor,
            trendFactor: 1.0,
            variance: stdDev,
            upperBound: Math.round(upperBound * 100) / 100,
            lowerBound: Math.round(lowerBound * 100) / 100
        };
    }

    /**
     * Prophet-based prediction (simplified)
     */
    prophetPredict(patterns, monthsAhead) {
        const { average, growthRate, seasonality, monthlyData } = patterns;

        // Prophet-like decomposition
        const trend = average * (1 + (growthRate / 100) * (monthsAhead / 12));

        const currentMonth = new Date().getMonth() + 1;
        const targetMonth = ((currentMonth + monthsAhead - 1) % 12) + 1;
        const seasonal = (seasonality[targetMonth] - 1.0) * average;

        const baseAmount = trend + seasonal;

        const confidence = this.calculateConfidence(patterns);

        const variance = patterns.stdDev * Math.sqrt(monthsAhead);
        const upperBound = baseAmount + (1.96 * variance);
        const lowerBound = Math.max(0, baseAmount - (1.96 * variance));

        return {
            amount: Math.round(baseAmount * 100) / 100,
            confidence,
            seasonalFactor: seasonality[targetMonth],
            trendFactor: 1 + (growthRate / 100) * (monthsAhead / 12),
            variance,
            upperBound: Math.round(upperBound * 100) / 100,
            lowerBound: Math.round(lowerBound * 100) / 100
        };
    }

    /**
     * LSTM-based prediction (simplified - placeholder for actual ML model)
     */
    lstmPredict(patterns, monthsAhead) {
        // In production, this would use an actual LSTM model
        // For now, use enhanced ARIMA
        return this.arimaPredict(patterns, monthsAhead);
    }

    /**
     * Calculate confidence score
     */
    calculateConfidence(patterns) {
        const { dataPoints, stdDev, average, type } = patterns;

        let confidence = 0.5;

        // More data = higher confidence
        if (dataPoints >= 12) confidence += 0.2;
        else if (dataPoints >= 6) confidence += 0.1;

        // Lower variance = higher confidence
        const coefficientOfVariation = (stdDev / average) * 100;
        if (coefficientOfVariation < 15) confidence += 0.2;
        else if (coefficientOfVariation < 30) confidence += 0.1;

        // Pattern type affects confidence
        if (type === 'seasonal' || type === 'cyclical') confidence += 0.1;
        else if (type === 'trending') confidence += 0.05;

        return Math.min(0.95, confidence);
    }

    /**
     * Calculate seasonal factors for all months
     */
    async calculateSeasonalFactors(userId, categoryId) {
        const patterns = await this.analyzeHistoricalPatterns(userId, categoryId);
        return patterns.seasonality;
    }

    /**
     * Identify spending trends
     */
    async identifyTrends(userId, categoryId = null) {
        try {
            const patterns = await this.analyzeHistoricalPatterns(userId, categoryId);

            const trends = {
                direction: patterns.growthRate > 5 ? 'increasing' :
                    patterns.growthRate < -5 ? 'decreasing' : 'stable',
                growthRate: patterns.growthRate,
                type: patterns.type,
                confidence: this.calculateConfidence(patterns),
                insights: []
            };

            if (Math.abs(patterns.growthRate) > 10) {
                trends.insights.push({
                    type: 'trend',
                    message: `Spending is ${trends.direction} at ${Math.abs(patterns.growthRate).toFixed(1)}% per year`,
                    severity: Math.abs(patterns.growthRate) > 20 ? 'high' : 'medium'
                });
            }

            if (patterns.type === 'seasonal') {
                const highMonths = Object.entries(patterns.seasonality)
                    .filter(([_, factor]) => factor > 1.2)
                    .map(([month]) => month);

                if (highMonths.length > 0) {
                    trends.insights.push({
                        type: 'seasonality',
                        message: `Higher spending typically occurs in months: ${highMonths.join(', ')}`,
                        severity: 'low'
                    });
                }
            }

            return trends;
        } catch (error) {
            console.error('Failed to identify trends:', error);
            throw error;
        }
    }
}

export default new SpendingPredictor();
