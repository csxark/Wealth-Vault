/**
 * Duplicate Subscription Detector Service
 * Identifies and flags potential duplicate subscriptions
 * Uses multiple detection algorithms for accurate duplicate identification
 * 
 * Issue #663: Recurring Transactions & Bill Tracking
 */

class DuplicateDetector {
    /**
     * Duplicate confirmation statuses
     */
    static STATUS = {
        PENDING_REVIEW: 'pending_review',
        CONFIRMED_DUPLICATE: 'confirmed',
        FALSE_ALARM: 'false_alarm',
        RESOLVED: 'resolved',
    };

    /**
     * Detection thresholds
     */
    static THRESHOLDS = {
        MERCHANT_SIMILARITY: 0.80,        // 80% merchant name match
        AMOUNT_TOLERANCE: 0.05,           // 5% amount difference
        FREQUENCY_MATCH: true,            // Must be same frequency
        TIME_WINDOW_DAYS: 3,              // Within 3 days
        MIN_CONFIDENCE: 65,               // Min 65% confidence
    };

    /**
     * Detect duplicate subscriptions from recurring transactions
     * @param {Array} recurringTransactions - All recurring transactions
     * @param {Object} options - Detection options
     * @returns {Array} Detected duplicates
     */
    static detectDuplicates(recurringTransactions, options = {}) {
        const {
            merchantSimilarityThreshold = this.THRESHOLDS.MERCHANT_SIMILARITY,
            amountTolerancePercent = this.THRESHOLDS.AMOUNT_TOLERANCE,
            frequencyMatch = this.THRESHOLDS.FREQUENCY_MATCH,
            timeWindowDays = this.THRESHOLDS.TIME_WINDOW_DAYS,
            minConfidence = this.THRESHOLDS.MIN_CONFIDENCE,
        } = options;

        const duplicates = [];
        const checked = new Set();

        for (let i = 0; i < recurringTransactions.length; i++) {
            for (let j = i + 1; j < recurringTransactions.length; j++) {
                const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
                if (checked.has(key)) continue;
                checked.add(key);

                const duplicate = this.comparePair(
                    recurringTransactions[i],
                    recurringTransactions[j],
                    {
                        merchantSimilarityThreshold,
                        amountTolerancePercent,
                        frequencyMatch,
                        timeWindowDays,
                        minConfidence,
                    }
                );

                if (duplicate) {
                    duplicates.push(duplicate);
                }
            }
        }

        return duplicates.sort((a, b) => b.confidenceScore - a.confidenceScore);
    }

    /**
     * Compare two transactions for duplication
     * @private
     */
    static comparePair(trans1, trans2, options) {
        const {
            merchantSimilarityThreshold,
            amountTolerancePercent,
            frequencyMatch,
            timeWindowDays,
            minConfidence,
        } = options;

        const comparison = {
            transaction1Id: trans1.id,
            transaction2Id: trans2.id,
            transaction1Name: trans1.transactionName,
            transaction2Name: trans2.transactionName,
            reasons: [],
            scores: {},
        };

        // Check merchant similarity
        const merchantScore = this.calculateMerchantSimilarity(
            trans1.merchant || trans1.transactionName,
            trans2.merchant || trans2.transactionName
        );
        comparison.scores.merchant = merchantScore;

        if (merchantScore < merchantSimilarityThreshold) {
            return null; // Not similar enough merchants
        }

        // Check amount similarity
        const amountScore = this.calculateAmountSimilarity(
            parseFloat(trans1.amount),
            parseFloat(trans2.amount),
            amountTolerancePercent
        );
        comparison.scores.amount = amountScore;

        // Check frequency match
        if (frequencyMatch && trans1.frequency !== trans2.frequency) {
            return null; // Different frequencies, likely not duplicates
        }
        comparison.scores.frequency = trans1.frequency === trans2.frequency ? 100 : 0;

        // Check time proximity
        const timeScore = this.calculateTimeProximity(
            trans1.nextDueDate || new Date(),
            trans2.nextDueDate || new Date()
        );
        comparison.scores.time = timeScore;

        // Calculate overall confidence
        const confidenceScore = this.calculateDuplicateConfidence(comparison.scores);
        comparison.confidenceScore = confidenceScore;

        if (confidenceScore < minConfidence) {
            return null;
        }

        // Determine which is primary (the one to keep)
        comparison.primaryId = this.determinePrimary(trans1, trans2);
        comparison.secondaryId = comparison.primaryId === trans1.id ? trans2.id : trans1.id;

        // Generate reason
        const reason = this.generateDuplicateReason(comparison, trans1, trans2);
        comparison.reason = reason;

        return comparison;
    }

    /**
     * Calculate merchant name similarity
     * @private
     */
    static calculateMerchantSimilarity(merchant1, merchant2) {
        const m1 = merchant1.toLowerCase().trim();
        const m2 = merchant2.toLowerCase().trim();

        // Exact match
        if (m1 === m2) return 100;

        // Partial match
        if (m1.includes(m2) || m2.includes(m1)) {
            return 85;
        }

        // Levenshtein distance-based similarity
        const similarity = this.calculateStringSimilarity(m1, m2);
        return Math.round(similarity * 100);
    }

    /**
     * Calculate amount similarity
     * @private
     */
    static calculateAmountSimilarity(amount1, amount2, tolerancePercent) {
        const diff = Math.abs(amount1 - amount2);
        const avg = (amount1 + amount2) / 2;
        const percentDiff = (diff / avg) * 100;

        if (percentDiff <= tolerancePercent * 100) {
            return 100;
        } else if (percentDiff <= tolerancePercent * 200) {
            return 80;
        } else if (percentDiff <= tolerancePercent * 400) {
            return 50;
        }

        return 0;
    }

    /**
     * Calculate time proximity score
     * @private
     */
    static calculateTimeProximity(date1, date2, windowDays = 3) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffMs = Math.abs(d1 - d2);
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays <= windowDays) {
            return 100;
        } else if (diffDays <= windowDays * 2) {
            return 70;
        } else if (diffDays <= windowDays * 4) {
            return 40;
        }

        return 0;
    }

    /**
     * Calculate overall duplicate confidence score
     * @private
     */
    static calculateDuplicateConfidence(scores) {
        // Weights for different factors
        const weights = {
            merchant: 0.40,      // 40% merchant match
            amount: 0.35,        // 35% amount match
            frequency: 0.15,     // 15% frequency match
            time: 0.10,          // 10% time proximity
        };

        let totalScore = 0;

        for (const [factor, weight] of Object.entries(weights)) {
            const score = scores[factor] || 0;
            totalScore += (score / 100) * weight;
        }

        return Math.round(totalScore * 100);
    }

    /**
     * Determine which transaction is the primary (to keep)
     * @private
     */
    static determinePrimary(trans1, trans2) {
        // Prefer higher confidence score
        if (trans1.confidenceScore && trans2.confidenceScore) {
            if (trans1.confidenceScore !== trans2.confidenceScore) {
                return trans1.confidenceScore > trans2.confidenceScore ? trans1.id : trans2.id;
            }
        }

        // Prefer the one with earlier creation date
        const date1 = new Date(trans1.createdAt);
        const date2 = new Date(trans2.createdAt);

        return date1 < date2 ? trans1.id : trans2.id;
    }

    /**
     * Generate explanation for duplicate detection
     * @private
     */
    static generateDuplicateReason(comparison, trans1, trans2) {
        const reasons = [];

        if (comparison.scores.merchant >= 80) {
            reasons.push(`Same merchant/service: "${trans1.merchant}" and "${trans2.merchant}"`);
        }

        if (comparison.scores.amount === 100) {
            reasons.push(`Identical amounts: $${trans1.amount}`);
        } else if (comparison.scores.amount >= 70) {
            reasons.push(`Very similar amounts: ${trans1.amount} vs ${trans2.amount}`);
        }

        if (comparison.scores.frequency === 100) {
            reasons.push(`Same frequency: ${trans1.frequency}`);
        }

        return reasons.join(' • ');
    }

    /**
     * Filter duplicate pairs to find consolidated set
     * Handles chains of duplicates (A~B, B~C = A,B,C all duplicates)
     * @param {Array} duplicates - Array of duplicate pairs
     * @returns {Array} Consolidated duplicate groups
     */
    static consolidateDuplicateGroups(duplicates) {
        const groups = new Map();
        const seen = new Set();

        for (const dup of duplicates) {
            const primary = dup.primaryId;
            const secondary = dup.secondaryId;

            // Find which group(s) contain these IDs
            let primaryGroup = null;
            let secondaryGroup = null;

            for (const [id, group] of groups) {
                if (group.has(primary)) primaryGroup = group;
                if (group.has(secondary)) secondaryGroup = group;
            }

            // Merge groups if necessary
            if (primaryGroup && secondaryGroup && primaryGroup !== secondaryGroup) {
                for (const id of secondaryGroup) {
                    primaryGroup.add(id);
                }
                groups.delete(secondaryGroup);
            } else if (primaryGroup) {
                primaryGroup.add(secondary);
            } else if (secondaryGroup) {
                secondaryGroup.add(primary);
            } else {
                const newGroup = new Set([primary, secondary]);
                groups.set(newGroup, newGroup);
            }
        }

        // Convert to array format
        const consolidatedGroups = [];
        for (const group of groups.keys()) {
            if (group.size > 1) {
                consolidatedGroups.push({
                    ids: Array.from(group),
                    size: group.size,
                    primaryId: Array.from(group)[0], // First ID is primary
                });
            }
        }

        return consolidatedGroups;
    }

    /**
     * Detect duplicates by category similarity
     * Useful for finding subscriptions of same type
     * @param {Array} recurringTransactions - Transactions to analyze
     * @returns {Array} Potentially duplicate categories
     */
    static detectDuplicatesByCategory(recurringTransactions) {
        const categoryMap = {};

        for (const trans of recurringTransactions) {
            const category = trans.category || 'uncategorized';
            if (!categoryMap[category]) {
                categoryMap[category] = [];
            }
            categoryMap[category].push(trans);
        }

        const potentialDuplicates = [];

        for (const [category, trans] of Object.entries(categoryMap)) {
            if (trans.length > 1) {
                // Check for amount similarities within category
                for (let i = 0; i < trans.length; i++) {
                    for (let j = i + 1; j < trans.length; j++) {
                        const amountSimilarity = this.calculateAmountSimilarity(
                            parseFloat(trans[i].amount),
                            parseFloat(trans[j].amount),
                            0.10 // 10% tolerance for category-based detection
                        );

                        if (amountSimilarity > 70) {
                            potentialDuplicates.push({
                                category: category,
                                transaction1: trans[i],
                                transaction2: trans[j],
                                amountSimilarity: amountSimilarity,
                                detectionMethod: 'category_based',
                            });
                        }
                    }
                }
            }
        }

        return potentialDuplicates;
    }

    /**
     * Detect potential duplicate accounts/alt services
     * @param {Array} recurringTransactions - Transactions to analyze
     * @returns {Array} Potential account duplicates
     */
    static detectAccountDuplicates(recurringTransactions) {
        // Group by similar merchants
        const merchantGroups = {};

        for (const trans of recurringTransactions) {
            const merchant = this.normalizeMerchant(trans.merchant || trans.transactionName);
            
            if (!merchantGroups[merchant]) {
                merchantGroups[merchant] = [];
            }
            merchantGroups[merchant].push(trans);
        }

        const accountDuplicates = [];

        for (const [merchant, trans] of Object.entries(merchantGroups)) {
            if (trans.length > 1) {
                // Check if different frequencies or amounts suggest different account tiers
                const uniqueFrequencies = new Set(trans.map(t => t.frequency));
                const uniqueAmounts = new Set(trans.map(t => t.amount));

                if (uniqueFrequencies.size === 1 && uniqueAmounts.size > 1) {
                    // Same frequency, different amounts = likely different plans
                    accountDuplicates.push({
                        merchant: merchant,
                        transactionCount: trans.length,
                        transactions: trans,
                        type: 'different_plans',
                        message: 'Multiple subscription tiers detected for same service',
                    });
                } else if (uniqueFrequencies.size > 1) {
                    // Different frequencies = likely duplicate accounts
                    accountDuplicates.push({
                        merchant: merchant,
                        transactionCount: trans.length,
                        transactions: trans,
                        type: 'different_frequencies',
                        message: 'Potentially multiple accounts for the same service',
                    });
                }
            }
        }

        return accountDuplicates;
    }

    /**
     * Normalize merchant name for comparison
     * @private
     */
    static normalizeMerchant(merchant) {
        return merchant
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[®™©]/g, '');
    }

    /**
     * Calculate string similarity using Levenshtein distance
     * @private
     */
    static calculateStringSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        if (longer.length === 0) return 1.0;

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Levenshtein distance calculation
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
     * Create duplicate record
     * @param {string} primaryId - Primary transaction ID
     * @param {string} duplicateId - Duplicate transaction ID
     * @param {number} confidenceScore - Confidence this is a duplicate
     * @param {string} reason - Reason for flagging
     * @returns {Object} Duplicate record
     */
    static createDuplicateRecord(primaryId, duplicateId, confidenceScore, reason) {
        return {
            primaryRecurringId: primaryId,
            duplicateRecurringId: duplicateId,
            confidenceScore: Math.min(100, Math.max(0, confidenceScore)),
            reason: reason || '',
            status: this.STATUS.PENDING_REVIEW,
            createdAt: new Date(),
        };
    }

    /**
     * Merge duplicate transactions
     * @param {Object} primary - Primary transaction to keep
     * @param {Object} duplicate - Duplicate transaction to merge
     * @returns {Object} Merged transaction
     */
    static mergeDuplicates(primary, duplicate) {
        // Prefer data from primary
        return {
            ...primary,
            notes: (primary.notes || '') + 
                   (primary.notes && duplicate.notes ? '; ' : '') + 
                   (duplicate.notes || ''),
            mergedWith: [duplicate.id],
            mergedAt: new Date(),
        };
    }

    /**
     * Get duplicate statistics
     * @param {Array} recurringTransactions - All transactions
     * @returns {Object} Duplicate statistics
     */
    static getDuplicateStatistics(recurringTransactions) {
        const duplicates = this.detectDuplicates(recurringTransactions);
        const accountDups = this.detectAccountDuplicates(recurringTransactions);

        return {
            totalTransactions: recurringTransactions.length,
            potentialDuplicatePairs: duplicates.length,
            potentialAccountDuplicates: accountDups.length,
            estimatedDuplicateAmount: duplicates.reduce((sum, dup) => {
                // Count each secondary transaction's amount
                return sum + parseFloat(dup.transaction2Name?.amount || 0);
            }, 0),
            highConfidenceDuplicates: duplicates.filter(d => d.confidenceScore >= 80).length,
            duplicateDistribution: this.getDuplicateDistribution(duplicates),
        };
    }

    /**
     * Get distribution of duplicates
     * @private
     */
    static getDuplicateDistribution(duplicates) {
        const distribution = {
            highConfidence: duplicates.filter(d => d.confidenceScore >= 80).length,
            mediumConfidence: duplicates.filter(d => d.confidenceScore >= 65 && d.confidenceScore < 80).length,
        };

        return distribution;
    }
}

module.exports = DuplicateDetector;
