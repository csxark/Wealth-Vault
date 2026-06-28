import db from '../config/db.js';
import { internalDebts, vaultBalances, ledgerEntries, ledgerAccounts, economicVolatilityIndices } from '../db/schema.js';
import crypto from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { NetWorthGraph } from '../utils/netWorthGraph.js';
import notificationService from './notificationService.js';

/**
 * Service to manage internal vault-to-vault lending and interlocking network.
 */
class InterlockService {
    /**
     * Creates an internal loan between two vaults.
     */
    async initiateInternalLoan(userId, lenderVaultId, borrowerVaultId, amount, interestRate, rateType = 'fixed', indexSource = null, interestSpread = 0) {
        return await db.transaction(async (tx) => {
            // 1. Verify lender has sufficient cash balance
            const lenderBalance = await tx.select().from(vaultBalances)
                .where(and(eq(vaultBalances.vaultId, lenderVaultId), eq(vaultBalances.userId, userId)));

            const totalCash = lenderBalance.reduce((acc, b) => acc + parseFloat(b.balance), 0);
            if (totalCash < amount) {
                throw new Error('Insufficient cash in lender vault for internal loan.');
            }

            // 2. Insert internal debt record
            const [loan] = await tx.insert(internalDebts).values({
                userId,
                lenderVaultId,
                borrowerVaultId,
                principalAmount: amount.toFixed(8),
                currentBalance: amount.toFixed(8),
                interestRate: interestRate.toFixed(2),
                rateType,
                indexSource,
                interestSpread: interestSpread.toFixed(2),
                status: 'active',
                lastAccrualDate: new Date()
            }).returning();

            // 3. Update vault balances (Transfer cash from lender to borrower)
            await tx.update(vaultBalances)
                .set({ balance: sql`balance - ${amount.toFixed(8)}` })
                .where(and(eq(vaultBalances.vaultId, lenderVaultId), eq(vaultBalances.userId, userId)));

            await tx.update(vaultBalances)
                .set({ balance: sql`balance + ${amount.toFixed(8)}` })
                .where(and(eq(vaultBalances.vaultId, borrowerVaultId), eq(vaultBalances.userId, userId)));

            // 4. Create Ledger Entries for double-entry integrity
            const cashAccount = await tx.query.ledgerAccounts.findFirst({
                where: and(eq(ledgerAccounts.userId, userId), eq(ledgerAccounts.accountCode, '1000'))
            });
            const debtAccount = await tx.query.ledgerAccounts.findFirst({
                where: and(eq(ledgerAccounts.userId, userId), eq(ledgerAccounts.accountCode, '2100'))
            });

            if (cashAccount && debtAccount) {
                const journalId = crypto.randomUUID();
                const description = `Internal Loan: Vault ${lenderVaultId.substring(0, 8)} -> Vault ${borrowerVaultId.substring(0, 8)}`;

                await tx.insert(ledgerEntries).values([
                    // Lender Leg: Cash out, Receivable in
                    {
                        userId, journalId, accountId: cashAccount.id, vaultId: lenderVaultId,
                        entryType: 'credit', amount: amount.toFixed(2), description, referenceType: 'internal_debt', referenceId: loan.id
                    },
                    {
                        userId, journalId, accountId: debtAccount.id, vaultId: lenderVaultId,
                        entryType: 'debit', amount: amount.toFixed(2), description, referenceType: 'internal_debt', referenceId: loan.id
                    },
                    // Borrower Leg: Cash in, Payable in
                    {
                        userId, journalId, accountId: cashAccount.id, vaultId: borrowerVaultId,
                        entryType: 'debit', amount: amount.toFixed(2), description, referenceType: 'internal_debt', referenceId: loan.id
                    },
                    {
                        userId, journalId, accountId: debtAccount.id, vaultId: borrowerVaultId,
                        entryType: 'credit', amount: amount.toFixed(2), description, referenceType: 'internal_debt', referenceId: loan.id
                    }
                ]);
            }

            return loan;
        });
    }

    /**
     * Records a repayment for an internal loan.
     */
    async recordRepayment(userId, loanId, amount) {
        return await db.transaction(async (tx) => {
            const [loan] = await tx.select().from(internalDebts).where(eq(internalDebts.id, loanId));
            if (!loan || loan.userId !== userId) throw new Error('Loan not found.');

            // Transfer cash back
            await tx.update(vaultBalances)
                .set({ balance: sql`balance - ${amount.toFixed(8)}` })
                .where(and(eq(vaultBalances.vaultId, loan.borrowerVaultId), eq(vaultBalances.userId, userId)));

            await tx.update(vaultBalances)
                .set({ balance: sql`balance + ${amount.toFixed(8)}` })
                .where(and(eq(vaultBalances.vaultId, loan.lenderVaultId), eq(vaultBalances.userId, userId)));

            // Update loan balance
            const newBalance = parseFloat(loan.currentBalance) - amount;
            const status = newBalance <= 0 ? 'repaid' : 'active';

            const [updatedLoan] = await tx.update(internalDebts)
                .set({
                    currentBalance: Math.max(0, newBalance).toFixed(8),
                    status,
                    updatedAt: new Date()
                })
                .where(eq(internalDebts.id, loanId))
                .returning();

            // 4. Create Ledger Entries for repayment
            const cashAccount = await tx.query.ledgerAccounts.findFirst({
                where: and(eq(ledgerAccounts.userId, userId), eq(ledgerAccounts.accountCode, '1000'))
            });
            const debtAccount = await tx.query.ledgerAccounts.findFirst({
                where: and(eq(ledgerAccounts.userId, userId), eq(ledgerAccounts.accountCode, '2100'))
            });

            if (cashAccount && debtAccount) {
                const journalId = crypto.randomUUID();
                const description = `Internal Loan Repayment: Loan ${loanId.substring(0, 8)}`;

                await tx.insert(ledgerEntries).values([
                    // Borrower: Cash out, Liability down (Debit)
                    {
                        userId, journalId, accountId: cashAccount.id, vaultId: loan.borrowerVaultId,
                        entryType: 'credit', amount: amount.toFixed(2), description, referenceType: 'internal_debt', referenceId: loanId
                    },
                    {
                        userId, journalId, accountId: debtAccount.id, vaultId: loan.borrowerVaultId,
                        entryType: 'debit', amount: amount.toFixed(2), description, referenceType: 'internal_debt', referenceId: loanId
                    },
                    // Lender: Cash in, Asset down (Credit)
                    {
                        userId, journalId, accountId: cashAccount.id, vaultId: loan.lenderVaultId,
                        entryType: 'debit', amount: amount.toFixed(2), description, referenceType: 'internal_debt', referenceId: loanId
                    },
                    {
                        userId, journalId, accountId: debtAccount.id, vaultId: loan.lenderVaultId,
                        entryType: 'credit', amount: amount.toFixed(2), description, referenceType: 'internal_debt', referenceId: loanId
                    }
                ]);
            }

            return updatedLoan;
        });
    }

    /**
     * Gets recursive net worth analysis for a user.
     */
    async getNetworkAnalysis(userId) {
        const graph = new NetWorthGraph(userId);
        await graph.build();
        return {
            summary: graph.getAllVaultsSummary(),
            cycles: graph.detectCycles()
        };
    }
    /**
     * Opportunity Cost Analyzer (#466)
     * Compares internal lending yields against macro benchmarks to suggest optimal capital allocation.
     */
    async getOpportunityCostAnalysis(userId) {
        const [activeDebts, macroIndices] = await Promise.all([
            db.select().from(internalDebts).where(and(eq(internalDebts.userId, userId), eq(internalDebts.status, 'active'))),
            db.select().from(economicVolatilityIndices)
        ]);

        const indexMap = Object.fromEntries(macroIndices.map(idx => [idx.indexName, parseFloat(idx.currentValue)]));
        const riskFreeRate = indexMap['FedRates'] || 5.25; // Default to 5.25% if not found

        const recommendations = activeDebts.map(debt => {
            let currentYield;
            if (debt.rateType === 'floating' && debt.indexSource && indexMap[debt.indexSource] !== undefined) {
                currentYield = indexMap[debt.indexSource] + parseFloat(debt.interestSpread || '0');
            } else {
                currentYield = parseFloat(debt.interestRate);
            }

            const yieldDelta = currentYield - riskFreeRate;
            let suggestion = 'Hold';
            let priority = 'low';

            if (yieldDelta < -0.5) {
                suggestion = 'Repay Internal & Invest Externally';
                priority = 'high';
            } else if (yieldDelta > 2.0) {
                suggestion = 'Maximize Internal Lending';
                priority = 'medium';
            }

            return {
                loanId: debt.id,
                borrowerVaultId: debt.borrowerVaultId,
                currentYield: currentYield.toFixed(2) + '%',
                benchmarkRate: riskFreeRate.toFixed(2) + '%',
                yieldDelta: yieldDelta.toFixed(2) + '%',
                suggestion,
                priority
            };
        });

        return {
            userId,
            benchmarkUsed: 'FedRates',
            analysisDate: new Date(),
            recommendations
        };
    }

    /**
     * Returns the interlocking network topology for visualization (#465)
     */
    async getTopology(userId) {
        const graph = new NetWorthGraph(userId);
        await graph.build();
        return graph.getTopology();
    }

    /**
     * Executes a predictive cascade stress test (#465)
     */
    async runStressTest(userId, targetVaultId, shockPercentage) {
        const graph = new NetWorthGraph(userId);
        await graph.build();
        const results = graph.simulateAssetShock(targetVaultId, shockPercentage);

        // Filter for critical levels/insolvency to generate alerts
        const fragileLinks = Object.entries(results)
            .filter(([id, res]) => res.isInsolvent || res.impactedLevel > 1)
            .map(([id, res]) => ({ vaultId: id, ...res }));

        // INTEGRATION: Trigger liquidityAlerts if structure is too complex/leveraged
        if (fragileLinks.length > 5 || fragileLinks.some(l => l.impactedLevel > 2)) {
            await notificationService.sendInterlockFragilityWarning(userId, {
                targetVaultId,
                fragileLinkCount: fragileLinks.length,
                depth: Math.max(...Object.values(results).map(r => r.impactedLevel)),
                shockPercentage
            });
        }

        return {
            targetVaultId,
            shockPercentage,
            executedAt: new Date(),
            fullImpact: results,
            fragileLinks
        };
    }
}

export default new InterlockService();
