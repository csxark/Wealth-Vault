import { logInfo } from '../utils/logger.js';

/**
 * Escrow Risk Assessment Service (L3)
 * Analyzes escrow contracts for potential risks based on historical data and metadata.
 */
class EscrowRiskService {
    /**
     * Calculate risk score for a contract
     * Score 0-100 (Higher is riskier)
     */
    async calculateRiskScore(contract) {
        let score = 0;

        // 1. Amount Risk
        const amount = parseFloat(contract.amount);
        if (amount > 100000) score += 40;
        else if (amount > 10000) score += 20;

        // 2. Type Risk
        const highRiskTypes = ['p2p_lending', 'crypto_swap'];
        if (highRiskTypes.includes(contract.escrowType)) score += 30;

        // 3. Condition Risk
        if (contract.releaseConditions.type === 'oracle_event') {
            // Oracles are generally safer than manual multi-sig
            score -= 10;
        } else if (contract.releaseConditions.type === 'multi_sig' && contract.releaseConditions.requiredSignatures < 2) {
            score += 50; // High risk: only 1 signature needed
        }

        // 4. Counterparty Risk (Mock logic)
        // In a real system, check user reputation or audit logs
        const counterpartyId = contract.payeeId;
        if (counterpartyId === '00000000-0000-0000-0000-000000000000') {
            score += 15; // Unknown payee
        }

        return Math.min(100, Math.max(0, score));
    }

    /**
     * Perform deep analysis on contract metadata
     */
    async analyzeMetadata(metadata) {
        const insights = [];

        if (metadata.urgency === 'high') {
            insights.push('User flagged high urgency; monitor for social engineering.');
        }

        if (metadata.crossBorder) {
            insights.push('Cross-border Escrow: Verify local jurisdictional compliance.');
        }

        return {
            riskLevel: this.getRiskLevel(await this.calculateRiskScore({ amount: 0, releaseConditions: {}, metadata })),
            insights
        };
    }

    getRiskLevel(score) {
        if (score > 70) return 'Critical';
        if (score > 40) return 'Elevated';
        return 'Low';
    }
}

export default new EscrowRiskService();
