/**
 * Diff Service - Compares two financial states and identifies variances
 */
class DiffService {
    /**
     * Compare two financial states
     * @param {Object} stateA - Baseline state
     * @param {Object} stateB - Comparison state
     * @returns {Object} Variance report
     */
    compare(stateA, stateB) {
        const report = {
            netWorthVariance: this.calculateNetWorth(stateB) - this.calculateNetWorth(stateA),
            expenseVariance: this.sumAmounts(stateB.expenses) - this.sumAmounts(stateA.expenses),
            investmentVariance: this.sumValue(stateB.investments) - this.sumValue(stateA.investments),
            debtVariance: this.sumValue(stateB.debts, 'currentBalance') - this.sumValue(stateA.debts, 'currentBalance'),
            itemizedChanges: {
                added: [],
                removed: [],
                modified: []
            }
        };

        // Deep item comparison for expenses
        this.trackCollectionChanges(stateA.expenses, stateB.expenses, 'expense', report.itemizedChanges);
        this.trackCollectionChanges(stateA.investments, stateB.investments, 'investment', report.itemizedChanges);

        return report;
    }

    calculateNetWorth(state) {
        const expenses = this.sumAmounts(state.expenses);
        const investments = this.sumValue(state.investments);
        const debts = this.sumValue(state.debts, 'currentBalance');
        return investments - expenses - debts;
    }

    sumAmounts(items = []) {
        return items.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    }

    sumValue(items = [], field = 'marketValue') {
        return items.reduce((sum, item) => sum + parseFloat(item[field] || 0), 0);
    }

    trackCollectionChanges(oldColl = [], newColl = [], type, changes) {
        const oldMap = new Map(oldColl.map(item => [item.id, item]));
        const newMap = new Map(newColl.map(item => [item.id, item]));

        for (const [id, item] of newMap) {
            if (!oldMap.has(id)) {
                changes.added.push({ type, item });
            } else {
                const oldItem = oldMap.get(id);
                if (JSON.stringify(oldItem) !== JSON.stringify(item)) {
                    changes.modified.push({ type, id, from: oldItem, to: item });
                }
            }
        }

        for (const [id, item] of oldMap) {
            if (!newMap.has(id)) {
                changes.removed.push({ type, id, item });
            }
        }
    }
}

export default new DiffService();
