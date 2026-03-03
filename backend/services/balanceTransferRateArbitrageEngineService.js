// balanceTransferRateArbitrageEngineService.js
// Service to optimize balance transfer rate arbitrage for credit cardholders

class BalanceTransferRateArbitrageEngineService {
    constructor({ cards, debts, transferOffers }) {
        this.cards = cards; // Array of card objects: { id, name, apr, creditLimit, currentBalance, isBtEligible }
        this.debts = debts; // Array of debt objects: { id, name, apr, balance, payoffTimeline }
        this.transferOffers = transferOffers || []; // Array of offers: { cardId, promoApr, promoMonths, transferFeePct, maxTransferAmount }
    }

    // Identify 0% BT cards available
    getEligibleBtCards() {
        return this.cards.filter(card => card.isBtEligible && card.apr === 0);
    }

    // Calculate BT transfer fee cost vs. interest savings
    calculateTransferSavings(debt, offer) {
        const fee = debt.balance * (offer.transferFeePct || 0.03);
        const interestWithoutBt = debt.balance * (debt.apr / 100) * (offer.promoMonths / 12);
        const interestWithBt = debt.balance * (offer.promoApr / 100) * (offer.promoMonths / 12);
        const savings = interestWithoutBt - interestWithBt - fee;
        return { fee, interestWithoutBt, interestWithBt, savings };
    }

    // Model payoff scenarios: pay off within 0% window vs. extend beyond
    modelPayoffScenarios(debt, offer) {
        const withinWindow = debt.balance / (offer.promoMonths || 12);
        const extendBeyond = (debt.balance - withinWindow * offer.promoMonths) * (debt.apr / 100) / 12;
        return { withinWindow, extendBeyond };
    }

    // Rank transferable debts
    rankDebts() {
        return this.debts.sort((a, b) => b.apr - a.apr || b.balance - a.balance);
    }

    // Simulate sequential transfers (rotate through 0% windows)
    simulateSequentialTransfers(years = 3) {
        let plan = [];
        let debts = [...this.rankDebts()];
        let offers = [...this.transferOffers];
        for (let year = 0; year < years; year++) {
            for (const offer of offers) {
                const debt = debts.find(d => d.balance > 0 && d.apr > 0);
                if (!debt) break;
                const transferAmount = Math.min(debt.balance, offer.maxTransferAmount || debt.balance);
                const savings = this.calculateTransferSavings(debt, offer);
                plan.push({ year, debtId: debt.id, cardId: offer.cardId, transferAmount, savings });
                debt.balance -= transferAmount;
            }
        }
        return plan;
    }

    // Recommend which debts to transfer, target order, payoff timeline
    recommendTransfers() {
        const rankedDebts = this.rankDebts();
        const eligibleCards = this.getEligibleBtCards();
        let recommendations = [];
        for (const debt of rankedDebts) {
            for (const card of eligibleCards) {
                const offer = this.transferOffers.find(o => o.cardId === card.id);
                if (!offer) continue;
                const savings = this.calculateTransferSavings(debt, offer);
                if (savings.savings > 0) {
                    recommendations.push({ debtId: debt.id, cardId: card.id, transferAmount: Math.min(debt.balance, card.creditLimit), savings });
                }
            }
        }
        return recommendations;
    }

    // Flag cards near credit limit
    flagCreditUtilization() {
        return this.cards.map(card => ({
            cardId: card.id,
            utilization: card.currentBalance / card.creditLimit,
            flag: card.currentBalance / card.creditLimit > 0.8 ? 'High Utilization' : 'OK'
        }));
    }

    // Generate transfer action plan
    generateActionPlan() {
        const recommendations = this.recommendTransfers();
        return recommendations.map(rec => ({
            debtId: rec.debtId,
            cardId: rec.cardId,
            action: `Call bank for balance transfer of $${rec.transferAmount} to card ${rec.cardId}`,
            monitor: 'Track payoff and utilization monthly'
        }));
    }
}

module.exports = BalanceTransferRateArbitrageEngineService;
