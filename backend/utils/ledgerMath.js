/**
 * Ledger Math Utilities
 * Precise financial calculations for split expenses and debt settlement
 */

/**
 * Calculate equal splits for an expense
 * @param {number} amount - Total expense amount
 * @param {number} memberCount - Number of members splitting
 * @returns {Object} Split details
 */
export function calculateEqualSplit(amount, memberCount) {
    if (memberCount <= 0) {
        throw new Error('Member count must be greater than 0');
    }
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Amount must be a positive number');
    }

    const perPerson = Math.floor((amountNum * 100) / memberCount) / 100;
    const remainder = Math.round((amountNum - (perPerson * memberCount)) * 100) / 100;

    return {
        perPerson,
        remainder,
        total: amountNum
    };
}

/**
 * Calculate percentage-based splits
 * @param {number} amount - Total expense amount
 * @param {Array} percentages - Array of {userId, percentage}
 * @returns {Array} Split allocations
 */
export function calculatePercentageSplit(amount, percentages) {
    const amountNum = parseFloat(amount);
    
    const totalPercentage = percentages.reduce((sum, p) => sum + parseFloat(p.percentage), 0);
    
    if (Math.abs(totalPercentage - 100) > 0.01) {
        throw new Error(`Percentages must sum to 100. Current sum: ${totalPercentage}`);
    }

    const splits = percentages.map(p => {
        const splitAmount = Math.round((amountNum * parseFloat(p.percentage)) / 100 * 100) / 100;
        return {
            userId: p.userId,
            percentage: parseFloat(p.percentage),
            amount: splitAmount
        };
    });

    // Handle rounding errors by adjusting the largest split
    const totalSplit = splits.reduce((sum, s) => sum + s.amount, 0);
    const diff = Math.round((amountNum - totalSplit) * 100) / 100;
    
    if (diff !== 0) {
        const largestSplit = splits.reduce((max, s) => s.amount > max.amount ? s : max);
        largestSplit.amount = Math.round((largestSplit.amount + diff) * 100) / 100;
    }

    return splits;
}

/**
 * Calculate exact amount splits
 * @param {number} totalAmount - Total expense amount
 * @param {Array} exactSplits - Array of {userId, amount}
 * @returns {Array} Validated splits
 */
export function calculateExactSplit(totalAmount, exactSplits) {
    const totalNum = parseFloat(totalAmount);
    const splitSum = exactSplits.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    
    if (Math.abs(totalNum - splitSum) > 0.01) {
        throw new Error(`Exact splits must sum to total amount. Total: ${totalNum}, Sum: ${splitSum}`);
    }

    return exactSplits.map(s => ({
        userId: s.userId,
        amount: Math.round(parseFloat(s.amount) * 100) / 100
    }));
}

/**
 * Simplify debts using graph-based algorithm (minimize transactions)
 * @param {Array} balances - Array of {userId, balance}
 * @returns {Array} Simplified transactions [{from, to, amount}]
 */
export function simplifyDebts(balances) {
    // Filter out zero balances and round to 2 decimals
    const nonZeroBalances = balances
        .map(b => ({
            userId: b.userId,
            balance: Math.round(parseFloat(b.balance) * 100) / 100
        }))
        .filter(b => Math.abs(b.balance) > 0.01);

    if (nonZeroBalances.length === 0) {
        return [];
    }

    // Separate creditors (positive balance = owed money) and debtors (negative = owes money)
    const creditors = nonZeroBalances.filter(b => b.balance > 0).sort((a, b) => b.balance - a.balance);
    const debtors = nonZeroBalances.filter(b => b.balance < 0).sort((a, b) => a.balance - b.balance);

    const transactions = [];
    let i = 0; // creditors index
    let j = 0; // debtors index

    while (i < creditors.length && j < debtors.length) {
        const creditor = creditors[i];
        const debtor = debtors[j];

        const amount = Math.min(creditor.balance, Math.abs(debtor.balance));
        const roundedAmount = Math.round(amount * 100) / 100;

        if (roundedAmount > 0.01) {
            transactions.push({
                from: debtor.userId,
                to: creditor.userId,
                amount: roundedAmount
            });
        }

        creditor.balance = Math.round((creditor.balance - amount) * 100) / 100;
        debtor.balance = Math.round((debtor.balance + amount) * 100) / 100;

        if (Math.abs(creditor.balance) < 0.01) i++;
        if (Math.abs(debtor.balance) < 0.01) j++;
    }

    return transactions;
}

/**
 * Calculate net balances for a vault from debt transactions
 * @param {Array} debtTransactions - Array of debt transactions
 * @param {Array} memberIds - Array of member user IDs
 * @returns {Object} Balance map {userId: balance}
 */
export function calculateNetBalances(debtTransactions, memberIds) {
    const balances = {};
    
    // Initialize all members with 0 balance
    memberIds.forEach(id => {
        balances[id] = 0;
    });

    // Process unsettled debt transactions
    debtTransactions
        .filter(dt => !dt.isSettled)
        .forEach(dt => {
            const amount = parseFloat(dt.amount);
            
            // Person who paid gets credit (positive balance)
            if (balances[dt.paidById] !== undefined) {
                balances[dt.paidById] = Math.round((balances[dt.paidById] + amount) * 100) / 100;
            }
            
            // Person who owes gets debit (negative balance)
            if (balances[dt.owedById] !== undefined) {
                balances[dt.owedById] = Math.round((balances[dt.owedById] - amount) * 100) / 100;
            }
        });

    return balances;
}

/**
 * Calculate who owes whom in a vault
 * @param {Object} balances - Balance map {userId: balance}
 * @returns {Array} Detailed breakdown [{userId, owes: [{to, amount}], owed: [{from, amount}]}]
 */
export function calculateOwedBreakdown(balances) {
    const simplified = simplifyDebts(
        Object.entries(balances).map(([userId, balance]) => ({ userId, balance }))
    );

    const breakdown = {};
    
    // Initialize breakdown for all users
    Object.keys(balances).forEach(userId => {
        breakdown[userId] = {
            userId,
            netBalance: balances[userId],
            owes: [], // Money they need to pay
            owed: []  // Money they will receive
        };
    });

    // Fill in the simplified transactions
    simplified.forEach(transaction => {
        // Debtor owes this amount
        breakdown[transaction.from].owes.push({
            to: transaction.to,
            amount: transaction.amount
        });
        
        // Creditor is owed this amount
        breakdown[transaction.to].owed.push({
            from: transaction.from,
            amount: transaction.amount
        });
    });

    return Object.values(breakdown);
}

/**
 * Validate settlement amount against outstanding debt
 * @param {number} settlementAmount - Amount being settled
 * @param {number} outstandingDebt - Total debt between two users
 * @returns {boolean} Whether settlement is valid
 */
export function validateSettlement(settlementAmount, outstandingDebt) {
    const amount = parseFloat(settlementAmount);
    const debt = Math.abs(parseFloat(outstandingDebt));
    
    return amount > 0 && amount <= debt + 0.01; // Allow 1 cent tolerance
}

/**
 * Calculate total owed/owing for a user
 * @param {Array} simplifiedTransactions - Output from simplifyDebts
 * @param {string} userId - User ID to calculate for
 * @returns {Object} {totalOwed, totalOwing}
 */
export function calculateUserTotals(simplifiedTransactions, userId) {
    let totalOwed = 0;
    let totalOwing = 0;

    simplifiedTransactions.forEach(t => {
        if (t.to === userId) {
            totalOwed += t.amount;
        }
        if (t.from === userId) {
            totalOwing += t.amount;
        }
    });

    return {
        totalOwed: Math.round(totalOwed * 100) / 100,
        totalOwing: Math.round(totalOwing * 100) / 100,
        netBalance: Math.round((totalOwed - totalOwing) * 100) / 100
    };
}

/**
 * Calculate settlement priority (who should pay first)
 * @param {Array} simplifiedTransactions - Simplified transactions
 * @returns {Array} Transactions sorted by priority (largest amounts first)
 */
export function calculateSettlementPriority(simplifiedTransactions) {
    return simplifiedTransactions
        .sort((a, b) => b.amount - a.amount)
        .map((t, index) => ({
            ...t,
            priority: index + 1,
            urgency: t.amount > 100 ? 'high' : t.amount > 50 ? 'medium' : 'low'
        }));
}

/**
 * Round to 2 decimal places for currency
 * @param {number} amount - Amount to round
 * @returns {number} Rounded amount
 */
export function roundCurrency(amount) {
    return Math.round(parseFloat(amount) * 100) / 100;
}

/**
 * Safely add currency amounts
 * @param {...number} amounts - Amounts to add
 * @returns {number} Sum
 */
export function addCurrency(...amounts) {
    const sum = amounts.reduce((total, amount) => {
        return total + parseFloat(amount || 0);
    }, 0);
    return roundCurrency(sum);
}

/**
 * Safely subtract currency amounts
 * @param {number} a - First amount
 * @param {number} b - Second amount
 * @returns {number} Difference
 */
export function subtractCurrency(a, b) {
    return roundCurrency(parseFloat(a || 0) - parseFloat(b || 0));
}

export default {
    calculateEqualSplit,
    calculatePercentageSplit,
    calculateExactSplit,
    simplifyDebts,
    calculateNetBalances,
    calculateOwedBreakdown,
    validateSettlement,
    calculateUserTotals,
    calculateSettlementPriority,
    roundCurrency,
    addCurrency,
    subtractCurrency
};
