// taxEfficiencyHelpers.js
// Helper functions for AutomatedTaxEfficiencyAnalyzerService

const moment = require('moment');

function calculateLongTermGain(asset) {
    // Calculate long-term capital gain for an asset
    if (asset.holdingPeriod >= 12) {
        return Math.max(0, asset.value - asset.costBasis);
    }
    return 0;
}

function calculateShortTermGain(asset) {
    // Calculate short-term capital gain for an asset
    if (asset.holdingPeriod < 12) {
        return Math.max(0, asset.value - asset.costBasis);
    }
    return 0;
}

function aggregateDeductions(deductions) {
    // Aggregate deductions by type
    const result = {};
    deductions.forEach(d => {
        if (!result[d.type]) result[d.type] = 0;
        result[d.type] += d.amount;
    });
    return result;
}

function projectTaxLiability(income, deductions, jurisdiction = 'US') {
    // Project tax liability based on income and deductions
    let taxableIncome = income - Object.values(deductions).reduce((a, b) => a + b, 0);
    let taxRate = jurisdiction === 'US' ? 0.22 : 0.18;
    return Math.max(0, taxableIncome * taxRate);
}

function checkWashSale(transactions, assetId, sellDate) {
    // Check for wash sale violation
    return transactions.some(t => t.assetId === assetId && t.type === 'buy' && moment(t.date).diff(moment(sellDate), 'days') <= 30);
}

function optimizeAssetAllocation(portfolio, riskTolerance) {
    // Suggest asset allocation based on risk tolerance
    const totalValue = portfolio.reduce((sum, a) => sum + a.value, 0);
    const stocks = portfolio.filter(a => a.type === 'stock').reduce((sum, a) => sum + a.value, 0);
    const bonds = portfolio.filter(a => a.type === 'bond').reduce((sum, a) => sum + a.value, 0);
    const realEstate = portfolio.filter(a => a.type === 'real_estate').reduce((sum, a) => sum + a.value, 0);
    let advice = '';
    if (riskTolerance === 'aggressive') {
        advice = stocks / totalValue > 0.7 ? 'Portfolio is aggressive. Consider rebalancing for stability.' : 'Increase stock allocation for growth.';
    } else if (riskTolerance === 'conservative') {
        advice = bonds / totalValue > 0.5 ? 'Portfolio is conservative. Consider adding growth assets.' : 'Increase bond allocation for safety.';
    } else {
        advice = 'Portfolio is balanced.';
    }
    return {
        stocksPercent: (stocks / totalValue) * 100,
        bondsPercent: (bonds / totalValue) * 100,
        realEstatePercent: (realEstate / totalValue) * 100,
        advice
    };
}

function detectDeductionLimits(deductions, jurisdiction = 'US') {
    // Detect if any deduction exceeds legal limits
    const limits = { charitable: 10000, mortgage_interest: 12000 };
    return deductions.filter(d => limits[d.type] && d.amount > limits[d.type]);
}

module.exports = {
    calculateLongTermGain,
    calculateShortTermGain,
    aggregateDeductions,
    projectTaxLiability,
    checkWashSale,
    optimizeAssetAllocation,
    detectDeductionLimits
};

// --- End of helpers ---
// Use these helpers in AutomatedTaxEfficiencyAnalyzerService for advanced analytics, projections, and compliance checks.
