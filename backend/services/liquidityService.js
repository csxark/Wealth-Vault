import db from '../config/db.js';
import { liquidityRescues, currencyWallets, vaults } from '../db/schema.js';
import { eq, and, gte, desc } from 'drizzle-orm';
import runwayEngine from './runwayEngine.js';

/**
 * Liquidity Service - Automated emergency liquidity management
 * Triggers automated "Liquidity Rescue" transfers between wallets
 */
class LiquidityService {
    constructor() {
        this.thresholds = {
            critical: 0.1, // 10% of initial balance
            warning: 0.2,  // 20% of initial balance
            caution: 0.3   // 30% of initial balance
        };

        this.rescueRules = {
            enabled: true,
            minTransferAmount: 100,
            maxTransferAmount: 10000,
            cooldownHours: 24 // Prevent multiple rescues within 24 hours
        };
    }

    /**
     * Monitor liquidity and trigger rescues if needed
     */
    async monitorLiquidity(userId) {
        try {
            // Calculate current runway
            const runway = await runwayEngine.calculateCurrentRunway(userId);

            // Check if rescue is needed
            const rescueNeeded = this.assessRescueNeed(runway);

            if (rescueNeeded.required) {
                // Check cooldown
                const canRescue = await this.checkRescueCooldown(userId);

                if (canRescue) {
                    // Execute rescue
                    const rescue = await this.executeRescue(userId, rescueNeeded);
                    return {
                        status: 'rescue_executed',
                        rescue,
                        runway
                    };
                } else {
                    return {
                        status: 'rescue_on_cooldown',
                        message: 'Rescue needed but on cooldown',
                        runway
                    };
                }
            }

            return {
                status: 'healthy',
                message: 'No rescue needed',
                runway
            };
        } catch (error) {
            console.error('Liquidity monitoring failed:', error);
            throw error;
        }
    }

    /**
     * Assess if liquidity rescue is needed
     */
    assessRescueNeed(runway) {
        const balanceRatio = runway.currentBalance / (runway.monthlyExpenses * 3); // Compare to 3 months expenses

        if (runway.runwayDays < 30 || balanceRatio < this.thresholds.critical) {
            return {
                required: true,
                severity: 'critical',
                reason: 'balance_critical',
                message: `Critical: Only ${runway.runwayDays} days of runway remaining`,
                recommendedAmount: runway.monthlyExpenses * 2 // Transfer 2 months of expenses
            };
        }

        if (runway.runwayDays < 60 || balanceRatio < this.thresholds.warning) {
            return {
                required: true,
                severity: 'warning',
                reason: 'runway_depleted',
                message: `Warning: Only ${runway.runwayDays} days of runway remaining`,
                recommendedAmount: runway.monthlyExpenses * 1.5
            };
        }

        if (runway.runwayDays < 90 || balanceRatio < this.thresholds.caution) {
            return {
                required: true,
                severity: 'caution',
                reason: 'threshold_breach',
                message: `Caution: Only ${runway.runwayDays} days of runway remaining`,
                recommendedAmount: runway.monthlyExpenses
            };
        }

        return {
            required: false,
            severity: 'none',
            reason: 'healthy',
            message: 'Liquidity is healthy'
        };
    }

    /**
     * Check if rescue is on cooldown
     */
    async checkRescueCooldown(userId) {
        const cooldownDate = new Date();
        cooldownDate.setHours(cooldownDate.getHours() - this.rescueRules.cooldownHours);

        const recentRescues = await db.select()
            .from(liquidityRescues)
            .where(and(
                eq(liquidityRescues.userId, userId),
                gte(liquidityRescues.createdAt, cooldownDate),
                eq(liquidityRescues.status, 'executed')
            ));

        return recentRescues.length === 0;
    }

    /**
     * Execute liquidity rescue transfer
     */
    async executeRescue(userId, rescueNeeded) {
        try {
            // Find source wallet with available funds
            const sourceWallet = await this.findSourceWallet(userId, rescueNeeded.recommendedAmount);

            if (!sourceWallet) {
                // No available source, create pending rescue request
                const [rescue] = await db.insert(liquidityRescues).values({
                    userId,
                    triggerDate: new Date(),
                    triggerReason: rescueNeeded.reason,
                    transferAmount: rescueNeeded.recommendedAmount.toString(),
                    status: 'failed',
                    metadata: {
                        error: 'No available source wallet',
                        severity: rescueNeeded.severity
                    }
                }).returning();

                return rescue;
            }

            // Find target wallet (primary checking/operating account)
            const targetWallet = await this.findTargetWallet(userId);

            // Calculate actual transfer amount
            const transferAmount = Math.min(
                rescueNeeded.recommendedAmount,
                parseFloat(sourceWallet.balance),
                this.rescueRules.maxTransferAmount
            );

            // Create rescue record
            const [rescue] = await db.insert(liquidityRescues).values({
                userId,
                triggerDate: new Date(),
                triggerReason: rescueNeeded.reason,
                sourceWalletId: sourceWallet.id,
                targetWalletId: targetWallet?.id,
                transferAmount: transferAmount.toString(),
                status: 'pending',
                metadata: {
                    severity: rescueNeeded.severity,
                    message: rescueNeeded.message,
                    sourceBalance: sourceWallet.balance,
                    targetBalance: targetWallet?.balance || 0
                }
            }).returning();

            // Execute transfer (in real implementation, this would call wallet service)
            await this.performTransfer(sourceWallet, targetWallet, transferAmount);

            // Update rescue status
            await db.update(liquidityRescues)
                .set({
                    status: 'executed',
                    executedAt: new Date()
                })
                .where(eq(liquidityRescues.id, rescue.id));

            return {
                ...rescue,
                status: 'executed',
                executedAt: new Date()
            };
        } catch (error) {
            console.error('Rescue execution failed:', error);
            throw error;
        }
    }

    /**
     * Find source wallet with available funds
     */
    async findSourceWallet(userId, requiredAmount) {
        // Get all user wallets
        const wallets = await db.select()
            .from(currencyWallets)
            .where(eq(currencyWallets.userId, userId))
            .orderBy(desc(currencyWallets.balance));

        // Find wallet with sufficient balance (excluding primary wallet)
        for (const wallet of wallets) {
            const balance = parseFloat(wallet.balance);
            if (balance >= requiredAmount && !wallet.isDefault) {
                return wallet;
            }
        }

        // If no exact match, return wallet with highest balance
        return wallets.find(w => parseFloat(w.balance) > this.rescueRules.minTransferAmount);
    }

    /**
     * Find target wallet (primary operating account)
     */
    async findTargetWallet(userId) {
        const [wallet] = await db.select()
            .from(currencyWallets)
            .where(and(
                eq(currencyWallets.userId, userId),
                eq(currencyWallets.isDefault, true)
            ));

        return wallet;
    }

    /**
     * Perform actual transfer between wallets
     */
    async performTransfer(sourceWallet, targetWallet, amount) {
        // In real implementation, this would:
        // 1. Deduct from source wallet
        // 2. Add to target wallet
        // 3. Create transaction record
        // 4. Send notification to user

        if (!sourceWallet || !targetWallet) {
            throw new Error('Invalid wallet configuration');
        }

        const sourceBalance = parseFloat(sourceWallet.balance);
        const targetBalance = parseFloat(targetWallet.balance);

        if (sourceBalance < amount) {
            throw new Error('Insufficient funds in source wallet');
        }

        // Update balances
        await db.update(currencyWallets)
            .set({ balance: (sourceBalance - amount).toString() })
            .where(eq(currencyWallets.id, sourceWallet.id));

        await db.update(currencyWallets)
            .set({ balance: (targetBalance + amount).toString() })
            .where(eq(currencyWallets.id, targetWallet.id));

        console.log(`✅ Liquidity rescue: Transferred $${amount} from wallet ${sourceWallet.id} to ${targetWallet.id}`);
    }

    /**
     * Get rescue history for user
     */
    async getRescueHistory(userId, limit = 10) {
        const rescues = await db.select()
            .from(liquidityRescues)
            .where(eq(liquidityRescues.userId, userId))
            .orderBy(desc(liquidityRescues.createdAt))
            .limit(limit);

        return rescues;
    }

    /**
     * Get liquidity health score
     */
    async getLiquidityHealth(userId) {
        const runway = await runwayEngine.calculateCurrentRunway(userId);

        let score = 100;
        let status = 'excellent';

        // Deduct points based on runway
        if (runway.runwayDays < 30) {
            score = 20;
            status = 'critical';
        } else if (runway.runwayDays < 60) {
            score = 40;
            status = 'poor';
        } else if (runway.runwayDays < 90) {
            score = 60;
            status = 'fair';
        } else if (runway.runwayDays < 180) {
            score = 80;
            status = 'good';
        }

        // Adjust for burn rate
        if (runway.monthlyBurnRate > 0) {
            score -= Math.min(20, (runway.monthlyBurnRate / runway.monthlyIncome) * 100);
        }

        return {
            score: Math.max(0, Math.min(100, Math.round(score))),
            status,
            runwayDays: runway.runwayDays,
            monthlyBurnRate: runway.monthlyBurnRate,
            zeroBalanceDate: runway.zeroBalanceDate,
            recommendations: this.generateHealthRecommendations(runway)
        };
    }

    /**
     * Generate health recommendations
     */
    generateHealthRecommendations(runway) {
        const recommendations = [];

        if (runway.runwayDays < 90) {
            recommendations.push({
                priority: 'high',
                title: 'Extend Your Runway',
                description: 'Your cash runway is below 90 days',
                actions: [
                    'Reduce non-essential expenses immediately',
                    'Explore additional income sources',
                    'Consider liquidating non-essential assets'
                ]
            });
        }

        if (runway.monthlyBurnRate > 0) {
            recommendations.push({
                priority: 'medium',
                title: 'Reduce Burn Rate',
                description: 'You are spending more than you earn',
                actions: [
                    'Create a detailed budget and track expenses',
                    'Identify and eliminate unnecessary subscriptions',
                    'Negotiate better rates on recurring bills'
                ]
            });
        }

        return recommendations;
    }

    /**
     * Configure rescue rules
     */
    async configureRescueRules(userId, rules) {
        this.rescueRules = {
            ...this.rescueRules,
            ...rules
        };

        // In production, save to user preferences
        return this.rescueRules;
    }
}

export default new LiquidityService();
