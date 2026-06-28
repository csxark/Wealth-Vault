/**
 * Recurring Pattern Detector Service
 * Auto-detects recurring transactions from transaction history
 * Uses statistical analysis for confidence scoring and pattern determination
 * 
 * Issue #663: Recurring Transactions & Bill Tracking
 */

const { parseISO, differenceInDays, isSameDay, startOfDay, format, addDays } = require('date-fns');

class RecurringPatternDetector {
    /**
     * Configuration constants
     */
    static CONFIG = {
        MIN_OCCURRENCES: 3,
        MIN_CONFIDENCE_THRESHOLD: 60,
        AMOUNT_VARIANCE_TOLERANCE: 0.05, // 5% tolerance
        TIME_VARIANCE_TOLERANCE_DAYS: 3,
        MERCHANT_MATCH_THRESHOLD: 0.8,
        // Frequency patterns (in days)
        FREQUENCY_PATTERNS: {
            daily: { min: 1, max: 3 },
            weekly: { min: 4, max: 10 },
            biweekly: { min: 11, max: 18 },
            monthly: { min: 19, max: 45 },
            quarterly: { min: 70, max: 100 },
            semiannual: { min: 150, max: 200 },
            annual: { min: 300, max: 400 },
        },
    };

    /**
     * Detect recurring patterns in transaction history
     * @param {Array} transactions - Transaction history to analyze
     * @param {String} userId - User ID for context
     * @param {String} vaultId - Vault ID for context
     * @returns {Array} Array of detected recurring patterns
     */
    static detectRecurringPatterns(transactions, userId, vaultId) {
        if (!transactions || transactions.length < this.CONFIG.MIN_OCCURRENCES) {
            return [];
        }

        const groupedByMerchant = this.groupTransactionsByMerchant(transactions);
        const recurringPatterns = [];

        for (const [merchant, merchantTransactions] of Object.entries(groupedByMerchant)) {
            if (merchantTransactions.length < this.CONFIG.MIN_OCCURRENCES) {
                continue;
            }

            // Sort transactions by date (oldest first)
            merchantTransactions.sort((a, b) => 
                new Date(a.date) - new Date(b.date)
            );

            // Detect pattern for this merchant
            const pattern = this.detectMerchantPattern(merchantTransactions, merchant, userId, vaultId);
            
            if (pattern && pattern.confidenceScore >= this.CONFIG.MIN_CONFIDENCE_THRESHOLD) {
                recurringPatterns.push(pattern);
            }
        }

        return recurringPatterns.sort((a, b) => 
            b.confidenceScore - a.confidenceScore
        );
    }

    /**
     * Group transactions by merchant
     * @private
     */
    static groupTransactionsByMerchant(transactions) {
        const grouped = {};

        for (const tx of transactions) {
            const merchant = tx.merchant || tx.category || 'Unknown';
            if (!grouped[merchant]) {
                grouped[merchant] = [];
            }
            grouped[merchant].push(tx);
        }

        return grouped;
    }

    /**
     * Detect pattern for a specific merchant
     * @private
     */
    static detectMerchantPattern(transactions, merchant, userId, vaultId) {
        // Analyze amounts for consistency
        const amountAnalysis = this.analyzeAmounts(transactions);
        
        // Analyze time intervals between transactions
        const frequencyAnalysis = this.analyzeFrequency(transactions);

        // Calculate overall confidence
        const confidenceScore = this.calculateConfidenceScore(
            transactions,
            amountAnalysis,
            frequencyAnalysis
        );

        if (confidenceScore < this.CONFIG.MIN_CONFIDENCE_THRESHOLD) {
            return null;
        }

        return {
            transactionName: merchant,
            merchant: merchant,
            userId: userId,
            vaultId: vaultId,
            amount: amountAnalysis.averageAmount,
            currency: transactions[0].currency || 'USD',
            category: transactions[0].category,
            frequency: frequencyAnalysis.frequency,
            customFrequencyDays: frequencyAnalysis.averageIntervalDays,
            nextDueDate: this.calculateNextDueDate(
                transactions[transactions.length - 1].date,
                frequencyAnalysis.averageIntervalDays
            ),
            lastPaymentDate: new Date(transactions[transactions.length - 1].date),
            status: 'active',
            detectionMethod: 'auto_detected',
            confidenceScore: confidenceScore,
            amountVariance: amountAnalysis.variance,
            timeVariance: frequencyAnalysis.variance,
            occurrenceCount: transactions.length,
            transactions: transactions.map(t => ({
                id: t.id,
                date: t.date,
                amount: t.amount,
                merchant: t.merchant,
            })),
        };
    }

    /**
     * Analyze transaction amounts for consistency
     * @private
     */
    static analyzeAmounts(transactions) {
        const amounts = transactions.map(t => parseFloat(t.amount));
        const averageAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
        
        // Calculate variance
        const squaredDiffs = amounts.map(amt => Math.pow(amt - averageAmount, 2));
        const variance = Math.sqrt(
            squaredDiffs.reduce((sum, sq) => sum + sq, 0) / amounts.length
        );
        
        const coefficientOfVariation = variance / averageAmount;
        const isConsistent = coefficientOfVariation <= 0.15; // 15% CV is acceptable

        return {
            averageAmount: parseFloat(averageAmount.toFixed(2)),
            variance: parseFloat(variance.toFixed(2)),
            min: Math.min(...amounts),
            max: Math.max(...amounts),
            isConsistent: isConsistent,
            coefficientOfVariation: parseFloat(coefficientOfVariation.toFixed(4)),
        };
    }

    /**
     * Analyze time intervals between transactions
     * @private
     */
    static analyzeFrequency(transactions) {
        const dates = transactions.map(t => parseISO(t.date));
        const intervals = [];

        for (let i = 1; i < dates.length; i++) {
            const interval = differenceInDays(dates[i], dates[i - 1]);
            intervals.push(interval);
        }

        // Calculate average interval
        const averageInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
        
        // Calculate variance
        const squaredDiffs = intervals.map(int => Math.pow(int - averageInterval, 2));
        const variance = Math.sqrt(
            squaredDiffs.reduce((sum, sq) => sum + sq, 0) / intervals.length
        );

        // Determine frequency pattern
        const frequency = this.determineFrequency(averageInterval);

        return {
            averageIntervalDays: Math.round(averageInterval),
            variance: parseFloat(variance.toFixed(2)),
            intervals: intervals,
            frequency: frequency,
            isRegular: variance <= 7, // Allow up to 7-day variance
        };
    }

    /**
     * Determine frequency category from average interval
     * @private
     */
    static determineFrequency(averageIntervalDays) {
        const patterns = this.CONFIG.FREQUENCY_PATTERNS;

        for (const [freqName, range] of Object.entries(patterns)) {
            if (averageIntervalDays >= range.min && averageIntervalDays <= range.max) {
                return freqName;
            }
        }

        // Default to custom if no pattern matches
        return 'custom';
    }

    /**
     * Calculate confidence score for a detected pattern
     * @private
     */
    static calculateConfidenceScore(transactions, amountAnalysis, frequencyAnalysis) {
        let score = 0;

        // 40 points: Occurrence count (min 3, max at 10+)
        const occurrenceScore = Math.min((transactions.length - 2) / 8 * 40, 40);
        score += occurrenceScore;

        // 30 points: Amount consistency
        const amountScore = Math.max(30 - (amountAnalysis.coefficientOfVariation * 200), 0);
        score += amountScore;

        // 30 points: Frequency regularity
        const frequencyScore = frequencyAnalysis.isRegular ? 30 : 
            Math.max(30 - (frequencyAnalysis.variance / 2), 10);
        score += frequencyScore;

        return Math.round(Math.min(score, 100));
    }

    /**
     * Calculate next due date based on last date and interval
     * @private
     */
    static calculateNextDueDate(lastDate, intervalDays) {
        return addDays(parseISO(lastDate), intervalDays);
    }

    /**
     * Filter and refine detected patterns
     * @param {Array} patterns - Detected patterns to refine
     * @param {Object} options - Filtering options
     * @returns {Array} Refined patterns
     */
    static refinePatterns(patterns, options = {}) {
        const {
            minConfidence = this.CONFIG.MIN_CONFIDENCE_THRESHOLD,
            minOccurrences = this.CONFIG.MIN_OCCURRENCES,
            frequencyFilter = null,
        } = options;

        return patterns.filter(pattern => {
            if (pattern.confidenceScore < minConfidence) return false;
            if (pattern.occurrenceCount < minOccurrences) return false;
            if (frequencyFilter && pattern.frequency !== frequencyFilter) return false;
            return true;
        });
    }

    /**
     * Detect seasonal or annual patterns
     * @param {Array} transactions - Full transaction history
     * @param {String} userId - User ID
     * @returns {Array} Seasonal patterns
     */
    static detectSeasonalPatterns(transactions, userId) {
        if (transactions.length < 12) {
            return []; // Need at least 12 months of data
        }

        // Group transactions by month and day
        const monthlyPatterns = {};
        
        for (const tx of transactions) {
            const date = parseISO(tx.date);
            const month = format(date, 'MM');
            const dayOfMonth = format(date, 'dd');
            const key = `${month}-${dayOfMonth}`;

            if (!monthlyPatterns[key]) {
                monthlyPatterns[key] = {
                    month,
                    dayOfMonth,
                    transactions: [],
                };
            }
            monthlyPatterns[key].transactions.push(tx);
        }

        // Find patterns that occur every year (within tolerance)
        const seasonalPatterns = [];
        for (const [key, pattern] of Object.entries(monthlyPatterns)) {
            const yearsObserved = pattern.transactions.length;
            
            // Consider it seasonal if it occurs at least twice
            if (yearsObserved >= 2) {
                const amountAnalysis = this.analyzeAmounts(pattern.transactions);
                seasonalPatterns.push({
                    type: 'seasonal',
                    month: pattern.month,
                    dayOfMonth: pattern.dayOfMonth,
                    occurrences: yearsObserved,
                    averageAmount: amountAnalysis.averageAmount,
                    transactions: pattern.transactions,
                });
            }
        }

        return seasonalPatterns;
    }

    /**
     * Score a pattern quality
     * @param {Object} pattern - Pattern to score
     * @returns {Object} Detailed scoring breakdown
     */
    static scorePattern(pattern) {
        const scores = {
            occurrence: Math.min((pattern.occurrenceCount - 2) / 8 * 100, 100),
            amountConsistency: pattern.amountVariance < 50 ? 100 : 
                Math.max(100 - (pattern.amountVariance / 5), 0),
            timeConsistency: pattern.timeVariance < 5 ? 100 : 
                Math.max(100 - (pattern.timeVariance * 10), 0),
            categorization: pattern.category ? 80 : 40,
        };

        const weights = {
            occurrence: 0.25,
            amountConsistency: 0.35,
            timeConsistency: 0.25,
            categorization: 0.15,
        };

        const totalScore = Object.keys(scores).reduce((sum, key) => {
            return sum + (scores[key] * weights[key]);
        }, 0);

        return {
            totalScore: Math.round(totalScore),
            breakdown: scores,
            weights: weights,
        };
    }

    /**
     * Get pattern insights and recommendations
     * @param {Object} pattern - Pattern to analyze
     * @returns {Object} Insights and recommendations
     */
    static getPatternInsights(pattern) {
        const insights = [];

        // Amount stability insights
        if (pattern.amountVariance < 10) {
            insights.push({
                type: 'amount',
                severity: 'info',
                message: 'Very consistent amounts - excellent for budgeting',
            });
        } else if (pattern.amountVariance > 100) {
            insights.push({
                type: 'amount',
                severity: 'warning',
                message: `High amount variance (${pattern.amountVariance.toFixed(2)}) - amounts vary significantly`,
            });
        }

        // Frequency insights
        if (pattern.timeVariance > 10) {
            insights.push({
                type: 'frequency',
                severity: 'warning',
                message: `Irregular timing - dates vary by up to ${pattern.timeVariance.toFixed(1)} days`,
            });
        }

        // Confidence insights
        if (pattern.confidenceScore < 70) {
            insights.push({
                type: 'confidence',
                severity: 'caution',
                message: 'Moderate confidence - review pattern manually to confirm',
            });
        }

        // Frequency-based insights
        if (pattern.frequency === 'annual') {
            insights.push({
                type: 'frequency',
                severity: 'info',
                message: 'Annual charge - ensure sufficient balance near due date',
            });
        } else if (pattern.frequency === 'daily') {
            insights.push({
                type: 'frequency',
                severity: 'info',
                message: 'Daily recurring charge - may indicate subscription or standing order',
            });
        }

        return insights;
    }

    /**
     * Compare patterns for similarity (for duplicate detection prep)
     * @param {Object} pattern1 - First pattern
     * @param {Object} pattern2 - Second pattern
     * @returns {number} Similarity score 0-100
     */
    static comparePatternSimilarity(pattern1, pattern2) {
        let similarity = 0;

        // Merchant similarity (30%)
        const merchantSimilar = this.stringSimilarity(
            pattern1.merchant, 
            pattern2.merchant
        );
        similarity += merchantSimilar * 0.3;

        // Amount similarity (40%) - within 10% is very similar
        const amountDiff = Math.abs(pattern1.amount - pattern2.amount) / 
            ((pattern1.amount + pattern2.amount) / 2);
        const amountSimilar = Math.max(100 - (amountDiff * 500), 0);
        similarity += (amountSimilar / 100) * 0.4;

        // Frequency similarity (30%)
        const frequencySimilar = pattern1.frequency === pattern2.frequency ? 1 : 0;
        similarity += frequencySimilar * 0.3;

        return Math.round(similarity * 100);
    }

    /**
     * Calculate string similarity (Levenshtein distance)
     * @private
     */
    static stringSimilarity(str1, str2) {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();

        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;

        if (longer.length === 0) return 1.0;

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Calculate Levenshtein distance for string similarity
     * @private
     */
    static levenshteinDistance(s1, s2) {
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }

    /**
     * Export detected patterns for external use
     * @param {Array} patterns - Patterns to export
     * @returns {Object} Export-formatted data
     */
    static exportPatterns(patterns) {
        return {
            exportDate: new Date().toISOString(),
            patternCount: patterns.length,
            totalRecurringAmount: patterns.reduce((sum, p) => sum + p.amount, 0),
            averageConfidence: patterns.length > 0 ?
                Math.round(patterns.reduce((sum, p) => sum + p.confidenceScore, 0) / patterns.length) :
                0,
            patterns: patterns.map(p => ({
                merchant: p.merchant,
                amount: p.amount,
                frequency: p.frequency,
                confidence: p.confidenceScore,
                occurrences: p.occurrenceCount,
                nextDue: p.nextDueDate,
            })),
        };
    }
}

module.exports = RecurringPatternDetector;
