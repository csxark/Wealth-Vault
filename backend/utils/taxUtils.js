// Tax Utility Functions
function detectTaxOpportunities(transactions, investments) {
    // Example: Detect ELSS, 80C, 80D, LTCG, STCG, etc.
    const opportunities = [];
    transactions.forEach(tx => {
        if (tx.category === 'insurance' && tx.amount > 10000) {
            opportunities.push({
                type: 'Section 80C',
                description: 'Insurance premium eligible for 80C deduction.'
            });
        }
        if (tx.category === 'medical' && tx.amount > 15000) {
            opportunities.push({
                type: 'Section 80D',
                description: 'Medical expenses eligible for 80D deduction.'
            });
        }
    });
    investments.forEach(inv => {
        if (inv.type === 'ELSS' && inv.amount > 0) {
            opportunities.push({
                type: 'Section 80C',
                description: 'ELSS investment eligible for 80C deduction.'
            });
        }
        if (inv.type === 'PPF' && inv.amount > 0) {
            opportunities.push({
                type: 'Section 80C',
                description: 'PPF investment eligible for 80C deduction.'
            });
        }
    });
    return opportunities;
}

function generateTaxRecommendations(opportunities) {
    // Example: Personalized messages
    return opportunities.map(op => ({
        message: `Consider utilizing ${op.type}: ${op.description}`
    }));
}

module.exports = {
    detectTaxOpportunities,
    generateTaxRecommendations
};
