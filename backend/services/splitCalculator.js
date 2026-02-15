/**
 * Split Calculator - Handles complex expense splitting logic
 * Supports equal, percentage, custom, and weighted splits
 */
class SplitCalculator {
    /**
     * Calculate split based on type
     */
    async calculateSplit(totalAmount, splitType, participants) {
        switch (splitType) {
            case 'equal':
                return this.calculateEqualSplit(totalAmount, participants);
            case 'percentage':
                return this.calculatePercentageSplit(totalAmount, participants);
            case 'custom':
                return this.calculateCustomSplit(totalAmount, participants);
            case 'weighted':
                return this.calculateWeightedSplit(totalAmount, participants);
            default:
                throw new Error(`Unsupported split type: ${splitType}`);
        }
    }

    /**
     * Equal split - divide amount equally among participants
     */
    calculateEqualSplit(totalAmount, participants) {
        const participantCount = participants.length;

        if (participantCount === 0) {
            throw new Error('At least one participant is required');
        }

        const amountPerPerson = totalAmount / participantCount;

        // Handle rounding - give remainder to first participant
        const baseAmount = Math.floor(amountPerPerson * 100) / 100;
        const remainder = totalAmount - (baseAmount * participantCount);

        const splitParticipants = participants.map((participant, index) => ({
            userId: participant.userId,
            name: participant.name,
            amount: index === 0 ? baseAmount + remainder : baseAmount,
            percentage: (100 / participantCount).toFixed(2)
        }));

        return {
            type: 'equal',
            totalAmount,
            participants: splitParticipants,
            payeeId: participants[0].userId, // First participant is typically the payer
            creatorId: participants[0].userId
        };
    }

    /**
     * Percentage split - divide based on specified percentages
     */
    calculatePercentageSplit(totalAmount, participants) {
        // Validate percentages sum to 100
        const totalPercentage = participants.reduce((sum, p) =>
            sum + (p.percentage || 0), 0
        );

        if (Math.abs(totalPercentage - 100) > 0.01) {
            throw new Error(`Percentages must sum to 100% (got ${totalPercentage}%)`);
        }

        const splitParticipants = participants.map(participant => {
            const amount = (totalAmount * participant.percentage) / 100;
            return {
                userId: participant.userId,
                name: participant.name,
                amount: Math.round(amount * 100) / 100,
                percentage: participant.percentage
            };
        });

        // Adjust for rounding errors
        const calculatedTotal = splitParticipants.reduce((sum, p) => sum + p.amount, 0);
        const difference = totalAmount - calculatedTotal;

        if (Math.abs(difference) > 0.01) {
            splitParticipants[0].amount += difference;
        }

        return {
            type: 'percentage',
            totalAmount,
            participants: splitParticipants,
            payeeId: participants[0].userId,
            creatorId: participants[0].userId
        };
    }

    /**
     * Custom split - use specified custom amounts
     */
    calculateCustomSplit(totalAmount, participants) {
        // Validate custom amounts sum to total
        const totalCustom = participants.reduce((sum, p) =>
            sum + (p.amount || 0), 0
        );

        if (Math.abs(totalCustom - totalAmount) > 0.01) {
            throw new Error(`Custom amounts must sum to total (got ${totalCustom}, expected ${totalAmount})`);
        }

        const splitParticipants = participants.map(participant => ({
            userId: participant.userId,
            name: participant.name,
            amount: participant.amount,
            percentage: ((participant.amount / totalAmount) * 100).toFixed(2)
        }));

        return {
            type: 'custom',
            totalAmount,
            participants: splitParticipants,
            payeeId: participants[0].userId,
            creatorId: participants[0].userId
        };
    }

    /**
     * Weighted split - divide based on weights (e.g., income, usage)
     */
    calculateWeightedSplit(totalAmount, participants) {
        const totalWeight = participants.reduce((sum, p) =>
            sum + (p.weight || 1), 0
        );

        if (totalWeight === 0) {
            throw new Error('Total weight cannot be zero');
        }

        const splitParticipants = participants.map(participant => {
            const weight = participant.weight || 1;
            const amount = (totalAmount * weight) / totalWeight;
            return {
                userId: participant.userId,
                name: participant.name,
                amount: Math.round(amount * 100) / 100,
                weight,
                percentage: ((weight / totalWeight) * 100).toFixed(2)
            };
        });

        // Adjust for rounding errors
        const calculatedTotal = splitParticipants.reduce((sum, p) => sum + p.amount, 0);
        const difference = totalAmount - calculatedTotal;

        if (Math.abs(difference) > 0.01) {
            splitParticipants[0].amount += difference;
        }

        return {
            type: 'weighted',
            totalAmount,
            participants: splitParticipants,
            payeeId: participants[0].userId,
            creatorId: participants[0].userId
        };
    }

    /**
     * Validate split rule
     */
    validateSplitRule(splitRule) {
        const errors = [];

        if (!splitRule.type) {
            errors.push('Split type is required');
        }

        if (!splitRule.participants || splitRule.participants.length === 0) {
            errors.push('At least one participant is required');
        }

        if (!splitRule.totalAmount || splitRule.totalAmount <= 0) {
            errors.push('Total amount must be greater than zero');
        }

        // Validate participant amounts sum to total
        const totalParticipantAmount = splitRule.participants.reduce((sum, p) =>
            sum + (p.amount || 0), 0
        );

        if (Math.abs(totalParticipantAmount - splitRule.totalAmount) > 0.01) {
            errors.push(`Participant amounts (${totalParticipantAmount}) must sum to total amount (${splitRule.totalAmount})`);
        }

        // Validate all participants have userId
        const missingUserId = splitRule.participants.some(p => !p.userId);
        if (missingUserId) {
            errors.push('All participants must have a userId');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Optimize settlement path to minimize transactions
     * Uses graph-based algorithm to reduce number of payments
     */
    optimizeSettlementPath(debts) {
        // Build net balance for each person
        const netBalance = {};

        // Calculate net balance for each person
        Object.keys(debts).forEach(payer => {
            if (!netBalance[payer]) netBalance[payer] = 0;

            Object.keys(debts[payer]).forEach(payee => {
                const amount = debts[payer][payee];
                netBalance[payer] -= amount;

                if (!netBalance[payee]) netBalance[payee] = 0;
                netBalance[payee] += amount;
            });
        });

        // Separate creditors and debtors
        const creditors = [];
        const debtors = [];

        Object.keys(netBalance).forEach(person => {
            const balance = netBalance[person];
            if (balance > 0.01) {
                creditors.push({ person, amount: balance });
            } else if (balance < -0.01) {
                debtors.push({ person, amount: -balance });
            }
        });

        // Sort by amount (largest first)
        creditors.sort((a, b) => b.amount - a.amount);
        debtors.sort((a, b) => b.amount - a.amount);

        // Generate optimized transactions
        const optimizedTransactions = [];
        let i = 0, j = 0;

        while (i < creditors.length && j < debtors.length) {
            const creditor = creditors[i];
            const debtor = debtors[j];

            const amount = Math.min(creditor.amount, debtor.amount);

            if (amount > 0.01) {
                optimizedTransactions.push({
                    from: debtor.person,
                    to: creditor.person,
                    amount: Math.round(amount * 100) / 100
                });
            }

            creditor.amount -= amount;
            debtor.amount -= amount;

            if (creditor.amount < 0.01) i++;
            if (debtor.amount < 0.01) j++;
        }

        return optimizedTransactions;
    }

    /**
     * Calculate split for recurring expenses
     */
    calculateRecurringSplit(totalAmount, splitType, participants, frequency) {
        const baseSplit = this.calculateSplit(totalAmount, splitType, participants);

        return {
            ...baseSplit,
            isRecurring: true,
            frequency,
            nextDueDate: this.calculateNextDueDate(frequency)
        };
    }

    /**
     * Calculate next due date for recurring split
     */
    calculateNextDueDate(frequency) {
        const now = new Date();

        switch (frequency) {
            case 'weekly':
                return new Date(now.setDate(now.getDate() + 7));
            case 'biweekly':
                return new Date(now.setDate(now.getDate() + 14));
            case 'monthly':
                return new Date(now.setMonth(now.getMonth() + 1));
            case 'quarterly':
                return new Date(now.setMonth(now.getMonth() + 3));
            case 'yearly':
                return new Date(now.setFullYear(now.getFullYear() + 1));
            default:
                return null;
        }
    }

    /**
     * Suggest optimal split based on participant income
     */
    suggestIncomeBasedSplit(totalAmount, participants) {
        const totalIncome = participants.reduce((sum, p) =>
            sum + (p.income || 0), 0
        );

        if (totalIncome === 0) {
            // Fall back to equal split if no income data
            return this.calculateEqualSplit(totalAmount, participants);
        }

        // Calculate weighted split based on income
        const weightedParticipants = participants.map(p => ({
            ...p,
            weight: p.income || 0
        }));

        return this.calculateWeightedSplit(totalAmount, weightedParticipants);
    }

    /**
     * Calculate split with adjustments (tips, taxes, discounts)
     */
    calculateSplitWithAdjustments(baseAmount, adjustments, splitType, participants) {
        let totalAmount = baseAmount;

        // Apply adjustments
        if (adjustments.tax) {
            totalAmount += (baseAmount * adjustments.tax) / 100;
        }

        if (adjustments.tip) {
            totalAmount += (baseAmount * adjustments.tip) / 100;
        }

        if (adjustments.discount) {
            totalAmount -= adjustments.discount;
        }

        if (adjustments.serviceFee) {
            totalAmount += adjustments.serviceFee;
        }

        return {
            ...this.calculateSplit(totalAmount, splitType, participants),
            adjustments: {
                baseAmount,
                tax: adjustments.tax || 0,
                tip: adjustments.tip || 0,
                discount: adjustments.discount || 0,
                serviceFee: adjustments.serviceFee || 0,
                totalAmount
            }
        };
    }

    /**
     * Calculate itemized split (for restaurant bills, etc.)
     */
    calculateItemizedSplit(items, sharedItems, participants) {
        const participantAmounts = {};

        // Initialize amounts
        participants.forEach(p => {
            participantAmounts[p.userId] = 0;
        });

        // Add individual items
        items.forEach(item => {
            if (item.userId && participantAmounts[item.userId] !== undefined) {
                participantAmounts[item.userId] += item.amount;
            }
        });

        // Split shared items equally
        if (sharedItems && sharedItems.length > 0) {
            const sharedTotal = sharedItems.reduce((sum, item) => sum + item.amount, 0);
            const sharedPerPerson = sharedTotal / participants.length;

            participants.forEach(p => {
                participantAmounts[p.userId] += sharedPerPerson;
            });
        }

        // Build result
        const totalAmount = Object.values(participantAmounts).reduce((sum, amt) => sum + amt, 0);

        const splitParticipants = participants.map(p => ({
            userId: p.userId,
            name: p.name,
            amount: Math.round(participantAmounts[p.userId] * 100) / 100,
            percentage: ((participantAmounts[p.userId] / totalAmount) * 100).toFixed(2)
        }));

        return {
            type: 'itemized',
            totalAmount: Math.round(totalAmount * 100) / 100,
            participants: splitParticipants,
            items,
            sharedItems
        };
    }
}

export default new SplitCalculator();
