import db from '../config/db.js';
import {
    vaults, debts, arbitrageStrategies, arbitrageEvents, crossVaultTransfers, yieldPools
} from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import yieldService from './yieldService.js';
import debtEngine from './debtEngine.js';

/**
 * Arbitrage Engine - Cross-vault recursive rebalancer
 * Optimizes math: Yield APY vs. Debt Interest vs. Transfer Fees
 */
class ArbitrageEngine {
    /**
     * Scan all users for arbitrage opportunities
     */
    async scanAndOptimize() {
        const activeStrategies = await db.select()
            .from(arbitrageStrategies)
            .where(eq(arbitrageStrategies.isEnabled, true));

        for (const strategy of activeStrategies) {
            await this.optimizeForUser(strategy.userId, strategy);
        }
    }

    /**
     * Run optimization logic for a specific user
     */
    async optimizeForUser(userId, strategy) {
        try {
            // 1. Fetch current financial state
            const userVaults = await db.select().from(vaults).where(eq(vaults.userId, userId));
            const userDebts = await db.select().from(debts).where(and(eq(debts.userId, userId), eq(debts.isActive, true)));

            const opportunities = [];

            for (const vault of userVaults) {
                if (parseFloat(vault.balance) <= 0) continue;
                if (strategy.restrictedVaultIds?.includes(vault.id)) continue;

                const vaultApy = await this.getVaultApy(vault);

                // A. Check Debt Payoff Opportunities (Arbitrage type: Yield vs Debt)
                for (const debt of userDebts) {
                    const debtApy = parseFloat(debt.interestRate);
                    const spread = debtApy - vaultApy;

                    if (spread >= parseFloat(strategy.minSpread)) {
                        opportunities.push({
                            userId,
                            strategyId: strategy.id,
                            sourceVaultId: vault.id,
                            targetId: debt.id,
                            targetType: 'debt',
                            spread,
                            advantage: (parseFloat(vault.balance) * (spread / 100)) / 12, // Monthly advantage
                            amount: this.calculateOptimalTransfer(vault, debt, strategy)
                        });
                    }
                }

                // B. Check Cross-Vault Yield Opportunities (Arbitrage type: Yield vs Yield)
                for (const targetVault of userVaults) {
                    if (vault.id === targetVault.id) continue;
                    const targetApy = await this.getVaultApy(targetVault);
                    const spread = targetApy - vaultApy;

                    if (spread >= parseFloat(strategy.minSpread)) {
                        opportunities.push({
                            userId,
                            strategyId: strategy.id,
                            sourceVaultId: vault.id,
                            targetId: targetVault.id,
                            targetType: 'vault',
                            spread,
                            advantage: (parseFloat(vault.balance) * (spread / 100)) / 12,
                            amount: this.calculateOptimalTransfer(vault, targetVault, strategy)
                        });
                    }
                }
            }

            // 2. Select best opportunity and execute/log
            if (opportunities.length > 0) {
                const bestOp = opportunities.sort((a, b) => b.advantage - a.advantage)[0];
                await this.processOpportunity(bestOp, strategy);
            }

        } catch (error) {
            console.error(`Arbitrage failed for user ${userId}:`, error);
        }
    }

    async getVaultApy(vault) {
        if (vault.metadata?.poolId) {
            return await yieldService.getPoolYield(vault.metadata.poolId);
        }
        return 0.5; // Baseline cash yield
    }

    calculateOptimalTransfer(source, target, strategy) {
        const available = parseFloat(source.balance);
        const cap = parseFloat(strategy.maxTransferCap || 5000);
        const backupThreshold = source.metadata?.minReserve || 500;
        return Math.min(available - backupThreshold, cap);
    }

    /**
     * Run a Monte Carlo simulation (1000 paths) to estimate probability of net gain
     */
    async simulateArbitrageImpact(userId, amount, fromApy, toApy, horizonMonths = 12) {
        const results = [];
        const iterations = 1000;

        for (let i = 0; i < iterations; i++) {
            let balance = amount;
            let netGain = 0;

            for (let m = 0; m < horizonMonths; m++) {
                const monthlyToApy = toApy * (1 + (Math.random() * 0.3 - 0.15)) / 12 / 100;
                const monthlyFromApy = fromApy * (1 + (Math.random() * 0.1 - 0.05)) / 12 / 100;

                const gain = balance * monthlyToApy;
                const opportunityCost = balance * monthlyFromApy;

                netGain += (gain - opportunityCost);
                balance += gain;
            }
            results.push(netGain);
        }

        const avgGain = results.reduce((a, b) => a + b, 0) / iterations;
        const winRate = results.filter(r => r > 0).length / iterations;

        return {
            expectedNetGain: avgGain.toFixed(2),
            confidenceScore: (winRate * 100).toFixed(1),
            isOptimal: winRate > 0.7 && avgGain > 0
        };
    }

    async processOpportunity(op, strategy) {
        const [event] = await db.insert(arbitrageEvents).values({
            userId: op.userId,
            strategyId: op.strategyId,
            sourceVaultId: op.sourceVaultId,
            targetTypeId: op.targetId,
            targetType: op.targetType,
            netAdvantage: op.advantage.toString(),
            status: strategy.autoExecute ? 'executing' : 'detected'
        }).returning();

        if (strategy.autoExecute && parseFloat(op.amount) > 0) {
            await this.executeArbitrage(event.id, op);
        }
    }

    async executeArbitrage(eventId, op) {
        try {
            const [transfer] = await db.insert(crossVaultTransfers).values({
                userId: op.userId,
                eventId,
                amount: op.amount.toString(),
                fromVaultId: op.sourceVaultId,
                toVaultId: op.targetType === 'vault' ? op.targetId : null,
                toDebtId: op.targetType === 'debt' ? op.targetId : null,
                status: 'pending'
            }).returning();

            await db.update(vaults)
                .set({ balance: sql`${vaults.balance} - ${op.amount}` })
                .where(eq(vaults.id, op.sourceVaultId));

            if (op.targetType === 'vault') {
                await db.update(vaults)
                    .set({ balance: sql`${vaults.balance} + ${op.amount}` })
                    .where(eq(vaults.id, op.targetId));
            } else {
                await db.update(debts)
                    .set({ currentBalance: sql`${debts.currentBalance} - ${op.amount}` })
                    .where(eq(debts.id, op.targetId));

                await debtEngine.calculateAmortization(op.targetId);
            }

            await db.update(crossVaultTransfers)
                .set({ status: 'completed', transactionHash: `ARB-${Date.now()}` })
                .where(eq(crossVaultTransfers.id, transfer.id));

            await db.update(arbitrageEvents)
                .set({ status: 'executed' })
                .where(eq(arbitrageEvents.id, eventId));

            console.log(`Arbitrage executed: ${op.amount} moved for net advantage ${op.advantage}`);
        } catch (error) {
            console.error('Arbitrage execution failed:', error);
            await db.update(arbitrageEvents)
                .set({ status: 'failed', executionLog: { error: error.message } })
                .where(eq(arbitrageEvents.id, eventId));
        }
    }
}

export default new ArbitrageEngine();
