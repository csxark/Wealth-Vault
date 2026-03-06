// medicalDebtNegotiationOptimizerService.js
// Service to optimize medical debt negotiation and settlement strategies

class MedicalDebtNegotiationOptimizerService {
    constructor({ medicalDebts, userIncome, cashAvailable, taxBracket }) {
        this.medicalDebts = medicalDebts; // Array: { id, creditor, amount, age, creditorType, originalDate }
        this.userIncome = userIncome || 0;
        this.cashAvailable = cashAvailable || 0;
        this.taxBracket = taxBracket || 0.22; // Default 22% federal tax bracket
    }

    // Analyze medical debt and settlement opportunity window
    analyzeDebtOpportunity(debt) {
        const ageMonths = this._calculateDebtAge(debt.originalDate);
        const settlementWindow = this._getSettlementWindow(ageMonths, debt.creditorType);
        const settlementLikelihood = this._calculateSettlementLikelihood(debt, ageMonths);
        const solStatus = this._checkStatuteOfLimitations(debt, ageMonths);
        
        return {
            debtId: debt.id,
            ageMonths,
            settlementWindow,
            settlementLikelihood,
            solStatus,
            creditorType: debt.creditorType
        };
    }

    // Model settlement offers: 30-70% discount vs. full payment
    modelSettlementOffers(debt) {
        const offers = [];
        const discountLevels = [0.3, 0.4, 0.5, 0.6, 0.7];
        
        for (const discount of discountLevels) {
            const settlementAmount = debt.amount * (1 - discount);
            const savings = debt.amount - settlementAmount;
            const taxImpact = this._calculateTaxImpact(savings);
            const netSavings = savings - taxImpact;
            
            offers.push({
                discountPercent: discount * 100,
                settlementAmount: Math.round(settlementAmount * 100) / 100,
                savings: Math.round(savings * 100) / 100,
                taxImpact: Math.round(taxImpact * 100) / 100,
                netSavings: Math.round(netSavings * 100) / 100,
                likelihood: this._getOfferLikelihood(discount, debt)
            });
        }
        
        // Add full payment scenario
        const fullPaymentMonths = 24; // 2-year payment plan
        const monthlyPayment = debt.amount / fullPaymentMonths;
        offers.push({
            discountPercent: 0,
            settlementAmount: debt.amount,
            savings: 0,
            taxImpact: 0,
            netSavings: 0,
            monthlyPayment: Math.round(monthlyPayment * 100) / 100,
            totalMonths: fullPaymentMonths,
            type: 'payment-plan'
        });
        
        return offers;
    }

    // Calculate tax impact (Form 1099-C for forgiven amounts >$600)
    _calculateTaxImpact(forgivenAmount) {
        if (forgivenAmount < 600) return 0;
        return forgivenAmount * this.taxBracket;
    }

    // Rank debts by settlement likelihood and tax efficiency
    rankDebts() {
        const analyzed = this.medicalDebts.map(debt => {
            const opportunity = this.analyzeDebtOpportunity(debt);
            const offers = this.modelSettlementOffers(debt);
            const bestOffer = offers.reduce((best, offer) => 
                offer.netSavings > best.netSavings ? offer : best, offers[0]);
            
            return {
                ...debt,
                ...opportunity,
                bestOffer,
                taxEfficiency: bestOffer.netSavings / debt.amount,
                score: opportunity.settlementLikelihood * bestOffer.netSavings
            };
        });
        
        return analyzed.sort((a, b) => b.score - a.score);
    }

    // Generate negotiation scripts and call prep materials
    generateNegotiationScript(debt) {
        const opportunity = this.analyzeDebtOpportunity(debt);
        const offers = this.modelSettlementOffers(debt);
        const targetOffer = offers.find(o => o.discountPercent >= 50) || offers[0];
        
        return {
            debtId: debt.id,
            creditor: debt.creditor,
            opening: `Hello, I'm calling about account #[ACCOUNT_NUMBER] for ${debt.creditor}. I'm experiencing financial hardship and would like to discuss a settlement.`,
            hardshipStatement: `Due to ${this.userIncome < 30000 ? 'low income' : 'financial difficulties'}, I'm unable to pay the full amount of $${debt.amount}.`,
            initialOffer: `I can offer a lump-sum payment of $${targetOffer.settlementAmount} (${targetOffer.discountPercent}% discount) to settle this account in full.`,
            fallbackOffers: offers.filter(o => o.discountPercent >= 30 && o.discountPercent < targetOffer.discountPercent)
                .map(o => `If that's not acceptable, I can offer $${o.settlementAmount} (${o.discountPercent}% discount).`),
            closingRequest: `Can you provide this offer in writing before I make payment? I need documentation that this settles the account in full with a zero balance.`,
            documentation: [
                'Request written settlement agreement before payment',
                'Get confirmation that account will be reported as "Paid/Settled" to credit bureaus',
                'Obtain receipt after payment',
                'Keep copy of settlement letter and proof of payment',
                'Expect Form 1099-C if forgiven amount exceeds $600'
            ],
            timing: opportunity.solStatus.nearExpiration ? 
                'URGENT: Statute of limitations expiring soon - negotiate now for maximum leverage' :
                'Optimal timing: Debt age suggests good settlement opportunity'
        };
    }

    // Simulate payment plans vs. lump-sum settlement
    simulateScenarios(debt) {
        const lumpSumOffers = this.modelSettlementOffers(debt).filter(o => o.type !== 'payment-plan');
        const paymentPlan = this.modelSettlementOffers(debt).find(o => o.type === 'payment-plan');
        
        const affordableLumpSum = lumpSumOffers.filter(o => o.settlementAmount <= this.cashAvailable);
        const bestLumpSum = affordableLumpSum.length > 0 ? 
            affordableLumpSum[0] : lumpSumOffers[lumpSumOffers.length - 1];
        
        return {
            debtId: debt.id,
            lumpSumScenario: {
                amount: bestLumpSum.settlementAmount,
                savings: bestLumpSum.netSavings,
                taxImpact: bestLumpSum.taxImpact,
                affordable: bestLumpSum.settlementAmount <= this.cashAvailable,
                recommendation: bestLumpSum.settlementAmount <= this.cashAvailable ? 
                    'RECOMMENDED: Maximum savings with lump-sum settlement' : 
                    'NOT AFFORDABLE: Requires $' + (bestLumpSum.settlementAmount - this.cashAvailable) + ' more'
            },
            paymentPlanScenario: {
                monthlyPayment: paymentPlan.monthlyPayment,
                totalMonths: paymentPlan.totalMonths,
                totalPaid: debt.amount,
                savings: 0,
                affordable: paymentPlan.monthlyPayment <= (this.userIncome * 0.1),
                recommendation: paymentPlan.monthlyPayment <= (this.userIncome * 0.1) ?
                    'FALLBACK: Affordable payment plan if settlement not possible' :
                    'RISK: Monthly payment exceeds 10% of income'
            }
        };
    }

    // Flag statute of limitations (SOL) expiration dates
    _checkStatuteOfLimitations(debt, ageMonths) {
        const solYears = this._getSOLYears(debt.state || 'default');
        const solMonths = solYears * 12;
        const monthsRemaining = solMonths - ageMonths;
        
        return {
            solYears,
            monthsRemaining: Math.max(0, monthsRemaining),
            expired: monthsRemaining <= 0,
            nearExpiration: monthsRemaining > 0 && monthsRemaining <= 6,
            status: monthsRemaining <= 0 ? 'EXPIRED' : 
                    monthsRemaining <= 6 ? 'EXPIRING SOON' : 'ACTIVE'
        };
    }

    // Recommend optimal timing for settlement negotiation
    recommendTiming(debt) {
        const opportunity = this.analyzeDebtOpportunity(debt);
        const ageMonths = opportunity.ageMonths;
        
        let timing = 'WAIT';
        let reason = 'Debt too new - creditor unlikely to negotiate';
        
        if (ageMonths >= 6 && ageMonths <= 18) {
            timing = 'GOOD';
            reason = 'Optimal window - creditor motivated but debt not yet charged off';
        } else if (ageMonths > 18 && ageMonths <= 36) {
            timing = 'EXCELLENT';
            reason = 'Best opportunity - likely charged off, maximum settlement discounts available';
        } else if (ageMonths > 36) {
            timing = opportunity.solStatus.nearExpiration ? 'URGENT' : 'FAIR';
            reason = opportunity.solStatus.nearExpiration ? 
                'Statute of limitations expiring - negotiate now or debt becomes unenforceable' :
                'Older debt - good discounts but verify SOL status';
        }
        
        return { timing, reason, ageMonths, solStatus: opportunity.solStatus };
    }

    // Helper: Calculate debt age in months
    _calculateDebtAge(originalDate) {
        const now = new Date();
        const original = new Date(originalDate);
        const diffMonths = (now.getFullYear() - original.getFullYear()) * 12 + 
                          (now.getMonth() - original.getMonth());
        return diffMonths;
    }

    // Helper: Get settlement window based on age and creditor type
    _getSettlementWindow(ageMonths, creditorType) {
        if (creditorType === 'hospital' || creditorType === 'provider') {
            return ageMonths >= 6 ? 'OPEN' : 'CLOSED';
        } else if (creditorType === 'collection-agency') {
            return ageMonths >= 3 ? 'OPEN' : 'CLOSED';
        }
        return ageMonths >= 12 ? 'OPEN' : 'CLOSED';
    }

    // Helper: Calculate settlement likelihood
    _calculateSettlementLikelihood(debt, ageMonths) {
        let likelihood = 0.3; // Base 30%
        
        if (ageMonths >= 6) likelihood += 0.2;
        if (ageMonths >= 18) likelihood += 0.2;
        if (debt.creditorType === 'collection-agency') likelihood += 0.15;
        if (debt.amount > 5000) likelihood += 0.1;
        
        return Math.min(0.95, likelihood);
    }

    // Helper: Get offer likelihood based on discount
    _getOfferLikelihood(discount, debt) {
        if (discount <= 0.3) return 0.9;
        if (discount <= 0.5) return 0.7;
        if (discount <= 0.6) return 0.5;
        return 0.3;
    }

    // Helper: Get SOL years by state (simplified - real implementation would have state-specific rules)
    _getSOLYears(state) {
        const solMap = {
            'default': 6,
            'CA': 4,
            'TX': 4,
            'NY': 6,
            'FL': 5
        };
        return solMap[state] || solMap['default'];
    }
}

module.exports = MedicalDebtNegotiationOptimizerService;
